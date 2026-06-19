/* shared/alm-auth.js — RapidMeta/allmeta accounts + cross-device persistence.
 *
 * WHY THIS EXISTS
 *   These apps are static GitHub Pages sites. localStorage alone is per-browser
 *   and per-device — it is NOT "your work saved in an account". This module adds
 *   real accounts + per-user cloud storage using Supabase's REST endpoints
 *   (GoTrue auth + PostgREST), called with plain fetch — no SDK, no CDN, so it
 *   still works on a static host. When accounts are not configured (or the user
 *   is signed out) it falls back to local-only and SAYS SO honestly.
 *
 * WHAT IT SYNCS  (the workspace "buses" + per-app state the user edits)
 *   sr-project-v1  (PICO/protocol) · sr-records-v1 (screening incl/excl) ·
 *   screen-v1 (screen app state) · ma-studies-v1 (extraction effects) ·
 *   ma-pooled-v1 (pooled result) · rapidmeta.paperState (Paper Studio writing) ·
 *   grade-sof-v1 · rob-assess-v1.
 *
 * STORAGE MODEL  one row per user in public.workspace:
 *   { user_id uuid PK, data jsonb, updated_at timestamptz }
 *   data = { "<key>": { "v": <raw localStorage string>, "t": <ms epoch> } }
 *   Row-Level Security restricts every user to user_id = auth.uid().
 *
 * SETUP: docs/AUTH_SETUP.md + shared/alm-auth-config.js (public anon key only).
 *
 * TRUTH-FIRST: never claims "saved to your account" unless a signed-in cloud
 * write actually succeeded; local-only state is labelled "this browser only".
 */
(function (g) {
  "use strict";

  var TRACKED = [
    "sr-project-v1", "sr-records-v1", "screen-v1",
    "ma-studies-v1", "ma-pooled-v1", "rapidmeta.paperState",
    "grade-sof-v1", "rob-assess-v1"
  ];
  var SESSION_KEY = "alm-auth-session-v1";
  var META_KEY = "alm-sync-meta-v1";        // { key: localChangeMs }
  var OWNER_KEY = "alm-sync-owner";          // user_id this browser's local work belongs to
  var PULLED_FLAG = "alm-sync-pulled";       // sessionStorage guard vs reload loops

  // ---------- config ----------
  function cfg() {
    var c = g.ALM_AUTH_CONFIG;
    if (c && typeof c.url === "string" && /^https:\/\//.test(c.url) && typeof c.anonKey === "string" && c.anonKey.length > 20) {
      return { url: c.url.replace(/\/+$/, ""), anonKey: c.anonKey, table: c.table || "workspace" };
    }
    return null;
  }
  function isConfigured() { return !!cfg(); }

  // ---------- small utils ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function jget(k) { try { var r = lsGet(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function jset(k, o) { try { lsSet(k, JSON.stringify(o)); } catch (e) {} }
  function now() { try { return Date.now(); } catch (e) { return 0; } }

  function loadMeta() { return jget(META_KEY) || {}; }
  function saveMeta(m) { jset(META_KEY, m); }
  function session() { return jget(SESSION_KEY); }
  function currentUserId() { var s = session(); return s && s.user ? s.user.id : null; }
  function setSession(s) { if (s) jset(SESSION_KEY, s); else { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} } }

  // ---------- merge engine (pure; unit-tested) ----------
  // Build the row payload from current localStorage + local change timestamps.
  function collectLocal() {
    var meta = loadMeta(), data = {};
    for (var i = 0; i < TRACKED.length; i++) {
      var k = TRACKED[i], v = lsGet(k);
      if (v != null) data[k] = { v: v, t: meta[k] || 0 };
    }
    return data;
  }
  // Apply a remote data map onto localStorage, newest-wins per key. Returns the
  // list of keys that were actually changed locally (so callers can re-render).
  function mergeRemote(remoteData) {
    var meta = loadMeta(), changed = [];
    if (remoteData && typeof remoteData === "object") {
      for (var k in remoteData) {
        if (!remoteData.hasOwnProperty(k) || TRACKED.indexOf(k) < 0) continue;
        var r = remoteData[k];
        if (!r || typeof r.v !== "string") continue;
        var lt = meta[k] || 0, rt = (typeof r.t === "number") ? r.t : 0;
        if (rt > lt && lsGet(k) !== r.v) {
          if (lsSet(k, r.v)) { meta[k] = rt; changed.push(k); }
        } else if (rt > lt) {
          meta[k] = rt;
        }
      }
    }
    saveMeta(meta);
    return changed;
  }

  // ---------- network (Supabase REST via fetch) ----------
  function refreshIfNeeded() {
    var c = cfg(), s = session();
    if (!c || !s) return Promise.resolve(null);
    if (s.expires_at && s.expires_at - now() > 60000) return Promise.resolve(s);
    if (!s.refresh_token) return Promise.resolve(s);
    return fetch(c.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: c.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.access_token) { var ns = sessFromToken(j); setSession(ns); return ns; }
      return s;
    }).catch(function () { return s; });
  }
  function sessFromToken(j) {
    return {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: now() + (j.expires_in ? j.expires_in * 1000 : 3600000),
      user: j.user ? { id: j.user.id, email: j.user.email } : (session() && session().user) || null
    };
  }
  function authHeaders(s, c) {
    return { apikey: c.anonKey, Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" };
  }

  function signInPassword(email, password) {
    var c = cfg(); if (!c) return Promise.reject(new Error("accounts not configured"));
    return fetch(c.url + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: c.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    }).then(parseAuth);
  }
  function signUpPassword(email, password) {
    var c = cfg(); if (!c) return Promise.reject(new Error("accounts not configured"));
    return fetch(c.url + "/auth/v1/signup", {
      method: "POST", headers: { apikey: c.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    }).then(parseAuth);
  }
  function parseAuth(r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error_description || j.msg || j.error || ("HTTP " + r.status));
      if (j.access_token) { var s = sessFromToken(j); setSession(s); return { ok: true, session: s, confirm: false }; }
      // Email-confirmation flow: signup returned a user but no token yet.
      return { ok: true, session: null, confirm: true, user: j.user || null };
    });
  }
  function signInOAuth(provider) {
    var c = cfg(); if (!c) return;
    var redirect = location.href.split("#")[0];
    location.href = c.url + "/auth/v1/authorize?provider=" + encodeURIComponent(provider) +
      "&redirect_to=" + encodeURIComponent(redirect);
  }
  function signOut() {
    var c = cfg(), s = session();
    setSession(null);
    try { sessionStorage.removeItem(PULLED_FLAG); } catch (e) {}
    if (c && s && s.access_token) {
      fetch(c.url + "/auth/v1/logout", { method: "POST", headers: authHeaders(s, c) }).catch(function () {});
    }
    render();
  }

  // Capture an OAuth redirect: tokens arrive in the URL hash.
  function captureOAuthRedirect() {
    if (!location.hash || location.hash.indexOf("access_token=") < 0) return false;
    var p = {}; location.hash.replace(/^#/, "").split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    if (!p.access_token) return false;
    setSession({
      access_token: p.access_token, refresh_token: p.refresh_token || "",
      expires_at: now() + (p.expires_in ? parseInt(p.expires_in, 10) * 1000 : 3600000),
      user: null
    });
    // Clean the hash so tokens don't linger in the address bar / history.
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    return true;
  }
  function fetchUser() {
    var c = cfg(), s = session(); if (!c || !s) return Promise.resolve(null);
    if (s.user && s.user.id) return Promise.resolve(s.user);
    return fetch(c.url + "/auth/v1/user", { headers: authHeaders(s, c) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) { if (u && u.id) { s.user = { id: u.id, email: u.email }; setSession(s); } return s.user; })
      .catch(function () { return null; });
  }

  // ---------- pull / push ----------
  var pushTimer = null, status = { state: "idle", at: 0, msg: "" };
  function setStatus(state, msg) { status = { state: state, at: now(), msg: msg || "" }; render(); }

  // Shared-machine guard: if this browser's local work belongs to a DIFFERENT
  // user, make the cloud the source of truth (zero local change-times so every
  // remote key wins on merge) — so signing in as user B never uploads user A's
  // leftover local work into B's account. First-time users (no owner recorded)
  // keep their local work and it is pushed up to their new account.
  function prepareOwner(userId) {
    if (!userId) return;
    var owner = lsGet(OWNER_KEY);
    if (owner && owner !== userId) saveMeta({});
  }
  function claimOwner(userId) { if (userId) lsSet(OWNER_KEY, userId); }

  function pull() {
    var c = cfg();
    return refreshIfNeeded().then(function (s) {
      if (!c || !s) return { changed: [] };
      prepareOwner(s.user && s.user.id);
      return fetch(c.url + "/rest/v1/" + c.table + "?user_id=eq." + s.user.id + "&select=data,updated_at", {
        headers: authHeaders(s, c)
      }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
        var row = rows && rows[0];
        var changed = mergeRemote(row && row.data);
        return { changed: changed };
      });
    });
  }
  function pushNow() {
    var c = cfg();
    return refreshIfNeeded().then(function (s) {
      if (!c || !s || !s.user) return false;
      setStatus("saving");
      var body = [{ user_id: s.user.id, data: collectLocal(), updated_at: new Date().toISOString() }];
      return fetch(c.url + "/rest/v1/" + c.table + "?on_conflict=user_id", {
        method: "POST",
        headers: Object.assign(authHeaders(s, c), { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(body)
      }).then(function (r) {
        if (r.ok) { setStatus("synced"); return true; }
        setStatus("error", "HTTP " + r.status); return false;
      });
    }).catch(function (e) { setStatus("error", e && e.message); return false; });
  }
  function schedulePush() {
    if (!session()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }

  // ---------- change detection ----------
  // Same-tab apps call notifyChange after they write a bus. We also poll-diff the
  // tracked keys so apps that don't call us still sync, and listen to cross-tab
  // storage events.
  var lastSeen = {};
  function snapshot() { var o = {}; TRACKED.forEach(function (k) { o[k] = lsGet(k); }); return o; }
  function notifyChange(key) {
    var meta = loadMeta();
    if (key) meta[key] = now(); else TRACKED.forEach(function (k) { if (lsGet(k) != null) meta[k] = now(); });
    saveMeta(meta);
    lastSeen = snapshot();
    schedulePush();
  }
  function pollDiff() {
    if (!session()) return;
    var changedKeys = [];
    for (var i = 0; i < TRACKED.length; i++) {
      var k = TRACKED[i], v = lsGet(k);
      if (v !== (lastSeen[k] === undefined ? null : lastSeen[k])) changedKeys.push(k);
    }
    if (changedKeys.length) {
      var meta = loadMeta();
      changedKeys.forEach(function (k) { meta[k] = now(); });
      saveMeta(meta);
      lastSeen = snapshot();
      schedulePush();
    }
  }
  function flush() { try { clearTimeout(pushTimer); if (session()) return pushNow(); } catch (e) {} }

  // ---------- UI ----------
  function ensureStyles() {
    if (document.getElementById("alm-auth-style")) return;
    var s = document.createElement("style"); s.id = "alm-auth-style";
    s.textContent = [
      "#alm-auth{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99998;font:600 12px/1 system-ui,-apple-system,'Segoe UI',sans-serif}",
      "#alm-auth .alm-auth-btn{display:inline-flex;align-items:center;gap:.4rem;padding:6px 12px;border-radius:14px;border:1px solid #cbd5e1;background:rgba(255,255,255,.95);color:#1e293b;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)}",
      "#alm-auth .alm-auth-btn.in{background:#0f2e1d;color:#bbf7d0;border-color:#16a34a}",
      "#alm-auth .alm-auth-btn.local{background:#fff7ed;color:#b45309;border-color:#fed7aa}",
      "#alm-auth .alm-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8}",
      "#alm-auth .alm-dot.ok{background:#22c55e}#alm-auth .alm-dot.warn{background:#f59e0b}#alm-auth .alm-dot.err{background:#ef4444}",
      ".alm-auth-modal{position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,.55);display:flex;align-items:center;justify-content:center;padding:1rem}",
      ".alm-auth-card{background:#fff;color:#0f172a;border-radius:14px;max-width:380px;width:100%;padding:1.2rem 1.3rem;box-shadow:0 18px 50px rgba(0,0,0,.4);font:14px/1.5 system-ui,sans-serif}",
      ".alm-auth-card h2{margin:.1rem 0 .3rem;font-size:1.1rem}.alm-auth-card p{margin:.3rem 0;color:#475569;font-size:.85rem}",
      ".alm-auth-card label{display:block;font-size:.78rem;font-weight:700;color:#334155;margin:.6rem 0 .2rem}",
      ".alm-auth-card input{width:100%;padding:.5rem .6rem;border:1px solid #cbd5e1;border-radius:8px;font:inherit}",
      ".alm-auth-card .alm-row{display:flex;gap:.5rem;margin-top:.8rem}",
      ".alm-auth-card button{padding:.55rem .8rem;border-radius:9px;border:1px solid #cbd5e1;background:#f1f5f9;cursor:pointer;font:inherit;font-weight:700}",
      ".alm-auth-card button.primary{background:#1d4ed8;color:#fff;border-color:#1d4ed8;flex:1}",
      ".alm-auth-card .oauth{display:flex;gap:.5rem;margin:.5rem 0}.alm-auth-card .oauth button{flex:1}",
      ".alm-auth-card .alm-note{font-size:.76rem;color:#64748b;margin-top:.7rem}",
      ".alm-auth-card .alm-err{color:#b91c1c;font-size:.8rem;margin-top:.5rem;min-height:1em}",
      ".alm-auth-card .alm-x{float:right;border:0;background:none;font-size:1.1rem;cursor:pointer;color:#64748b}",
      "@media(prefers-color-scheme:dark){#alm-auth .alm-auth-btn{background:rgba(15,23,42,.95);color:#e2e8f0;border-color:#334155}.alm-auth-card{background:#0f172a;color:#e2e8f0}.alm-auth-card input{background:#0b1120;color:#e2e8f0;border-color:#334155}.alm-auth-card button{background:#1e293b;color:#e2e8f0;border-color:#334155}}"
    ].join("");
    document.head.appendChild(s);
  }
  function statusBits() {
    if (status.state === "saving") return ["warn", "Saving…"];
    if (status.state === "error") return ["err", "Sync error" + (status.msg ? " (" + status.msg + ")" : "")];
    if (status.state === "synced") {
      var d = new Date(status.at), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
      return ["ok", "Synced ✓ " + hh + ":" + mm];
    }
    return ["ok", "Synced"];
  }
  function render() {
    if (typeof document === "undefined" || !document.body) return;
    ensureStyles();
    var host = document.getElementById("alm-auth");
    if (!host) { host = document.createElement("div"); host.id = "alm-auth"; document.body.appendChild(host); }
    var s = session();
    if (!isConfigured()) {
      host.innerHTML = '<button class="alm-auth-btn local" title="Accounts are not enabled on this deployment. Your work is saved only in this browser on this device — use each app\'s Export to move it.">💾 This browser only</button>';
      host.firstChild.onclick = function () { openModal(); };
      return;
    }
    if (s && s.user) {
      var sb = statusBits();
      host.innerHTML = '<button class="alm-auth-btn in" title="Signed in — your work syncs to your account across devices."><span class="alm-dot ' + sb[0] + '"></span>' +
        (s.user.email ? esc(s.user.email) : "Signed in") + ' · ' + esc(sb[1]) + '</button>';
      host.firstChild.onclick = function () { openAccountMenu(); };
    } else {
      host.innerHTML = '<button class="alm-auth-btn" title="Sign in to save your work to your account (across devices). Until you do, work stays on this browser only.">🔐 Sign in to save</button>';
      host.firstChild.onclick = function () { openModal(); };
    }
  }
  function esc(x) { return String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function openAccountMenu() {
    var s = session();
    var when = status.at ? new Date(status.at).toLocaleTimeString() : "—";
    var box = modalShell();
    box.card.innerHTML = '<button class="alm-x" aria-label="Close">×</button><h2>Your account</h2>' +
      '<p>Signed in as <strong>' + esc(s.user && s.user.email || "user") + '</strong>.</p>' +
      '<p>Your screening, extraction and Paper Studio work syncs to your account. Last sync: ' + esc(when) + '.</p>' +
      '<div class="alm-row"><button class="primary" data-act="syncnow">Sync now</button><button data-act="signout">Sign out</button></div>' +
      '<p class="alm-note">Signing out leaves your local copy on this browser but stops cloud sync.</p>';
    box.card.querySelector(".alm-x").onclick = box.close;
    box.card.querySelector('[data-act="syncnow"]').onclick = function () { pushNow().then(function () { pull(); }); box.close(); };
    box.card.querySelector('[data-act="signout"]').onclick = function () { signOut(); box.close(); };
  }
  function openModal() {
    if (!isConfigured()) {
      var b0 = modalShell();
      b0.card.innerHTML = '<button class="alm-x" aria-label="Close">×</button><h2>Accounts not enabled yet</h2>' +
        '<p>This deployment has not connected a sign-in backend, so your work is saved <strong>only in this browser on this device</strong>.</p>' +
        '<p>It is not lost between visits in this same browser, but it will not appear on another computer or browser. Use each app\'s <strong>Export</strong> / <strong>Save data</strong> button to move it.</p>' +
        '<p class="alm-note">To enable accounts (GitHub/Google or email + password, synced across devices), the site owner follows docs/AUTH_SETUP.md.</p>';
      b0.card.querySelector(".alm-x").onclick = b0.close; return;
    }
    var box = modalShell();
    box.card.innerHTML = '<button class="alm-x" aria-label="Close">×</button><h2>Sign in to save your work</h2>' +
      '<p>Your screening decisions, data extractions and Paper Studio writing will be stored in your account and available on any device.</p>' +
      '<div class="oauth"><button data-oauth="github">Continue with GitHub</button><button data-oauth="google">Continue with Google</button></div>' +
      '<p class="alm-note" style="text-align:center;margin:.4rem 0">or use an email + password</p>' +
      '<label>Email</label><input type="email" id="alm-email" autocomplete="username">' +
      '<label>Password</label><input type="password" id="alm-pass" autocomplete="current-password">' +
      '<div class="alm-err" id="alm-err"></div>' +
      '<div class="alm-row"><button class="primary" data-act="login">Sign in</button><button data-act="signup">Create account</button></div>' +
      '<p class="alm-note">Until you sign in, your work stays on this browser only.</p>';
    box.card.querySelector(".alm-x").onclick = box.close;
    box.card.querySelectorAll("[data-oauth]").forEach(function (b) { b.onclick = function () { signInOAuth(b.dataset.oauth); }; });
    var errEl = box.card.querySelector("#alm-err");
    function creds() { return { e: (box.card.querySelector("#alm-email").value || "").trim(), p: box.card.querySelector("#alm-pass").value || "" }; }
    function afterAuth(res) {
      if (res && res.confirm) { errEl.style.color = "#15803d"; errEl.textContent = "Account created — check your email to confirm, then sign in."; return; }
      box.close(); onSignedIn();
    }
    box.card.querySelector('[data-act="login"]').onclick = function () {
      var c = creds(); if (!c.e || !c.p) { errEl.textContent = "Enter email and password."; return; }
      errEl.textContent = ""; signInPassword(c.e, c.p).then(afterAuth).catch(function (e) { errEl.textContent = e.message || "Sign-in failed."; });
    };
    box.card.querySelector('[data-act="signup"]').onclick = function () {
      var c = creds(); if (!c.e || c.p.length < 6) { errEl.textContent = "Enter an email and a password of at least 6 characters."; return; }
      errEl.textContent = ""; signUpPassword(c.e, c.p).then(afterAuth).catch(function (e) { errEl.textContent = e.message || "Sign-up failed."; });
    };
  }
  function modalShell() {
    var ov = document.createElement("div"); ov.className = "alm-auth-modal";
    var card = document.createElement("div"); card.className = "alm-auth-card";
    ov.appendChild(card); document.body.appendChild(ov);
    function close() { try { ov.remove(); } catch (e) {} }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    return { ov: ov, card: card, close: close };
  }

  // After a successful sign-in: pull cloud work, merge, and reload so every app
  // re-reads the restored buses. Guarded against reload loops.
  function onSignedIn() {
    setStatus("saving");
    fetchUser().then(pull).then(function (res) {
      var u = currentUserId(); claimOwner(u);
      lastSeen = snapshot();
      pushNow();
      if (res && res.changed && res.changed.length) {
        try { sessionStorage.setItem(PULLED_FLAG, "1"); } catch (e) {}
        location.reload();
      } else { render(); }
    }).catch(function (e) { setStatus("error", e && e.message); });
  }

  // ---------- init ----------
  function init() {
    var captured = false;
    try { captured = captureOAuthRedirect(); } catch (e) {}
    render();
    lastSeen = snapshot();
    if (!isConfigured()) return;
    if (captured) { onSignedIn(); }
    else if (session()) {
      // Already signed in: pull on load. Reload once if the cloud had newer work,
      // unless we just did (PULLED_FLAG) — prevents loops mid-session.
      fetchUser().then(pull).then(function (res) {
        claimOwner(currentUserId());
        lastSeen = snapshot();
        var did = false; try { did = sessionStorage.getItem(PULLED_FLAG) === "1"; } catch (e) {}
        if (res && res.changed && res.changed.length && !did) {
          try { sessionStorage.setItem(PULLED_FLAG, "1"); } catch (e) {}
          location.reload();
        } else { render(); }
      }).catch(function () { render(); });
    }
    window.addEventListener("storage", function (e) { if (e.key && TRACKED.indexOf(e.key) >= 0) schedulePush(); });
    setInterval(pollDiff, 4000);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  var API = {
    TRACKED: TRACKED,
    isConfigured: isConfigured,
    notifyChange: notifyChange,
    flush: flush,
    pushNow: pushNow,
    pull: pull,
    signOut: signOut,
    currentUser: function () { var s = session(); return s ? s.user : null; },
    openSignIn: openModal,
    // exposed for tests:
    _collectLocal: collectLocal,
    _mergeRemote: mergeRemote,
    _prepareOwner: prepareOwner,
    _claimOwner: claimOwner,
    _setTrackedForTest: function (arr) { if (Array.isArray(arr)) { TRACKED.length = 0; Array.prototype.push.apply(TRACKED, arr); } }
  };
  g.AlmAuth = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
