/* shared/ma-studies-v1.js — canonical helper for the allmeta cross-tool bus.
 *
 * Contract: see shared/ma-studies-v1.md
 *
 * Drop-in: <script src="../shared/ma-studies-v1.js"></script>
 * Then read with:    const studies = MaStudies.read();
 *      write with:   MaStudies.write(studies);
 *      merge with:   MaStudies.merge(newStudies);
 *
 * This module is ADDITIVE. Apps that currently roll their own read/write block
 * continue to work; adoption is opt-in and per-app. The shared helper exists
 * so that future apps don't reinvent the contract and so the contract has a
 * single canonical implementation to audit.
 */
(function (global) {
  "use strict";

  var KEY = "ma-studies-v1";
  var SCHEMA = "ma-studies-v1";
  var Z975 = 1.959963984540054; // 2-sided 95 % normal quantile

  // ----- Validation -------------------------------------------------------

  function isFiniteNumber(x) {
    return typeof x === "number" && Number.isFinite(x);
  }

  function validateStudy(s, i) {
    var errs = [];
    if (s === null || typeof s !== "object") {
      return ["row " + i + ": not an object"];
    }
    if (typeof s.label !== "string" || s.label.length === 0) {
      errs.push("row " + i + ": label must be a non-empty string");
    }
    if (!isFiniteNumber(s.est)) {
      errs.push("row " + i + ": est must be a finite number");
    }
    if (!isFiniteNumber(s.se) || s.se <= 0) {
      errs.push("row " + i + ": se must be a finite positive number");
    }
    return errs;
  }

  function validate(payload) {
    var errors = [];
    if (payload === null || typeof payload !== "object") {
      return { ok: false, errors: ["payload is not an object"] };
    }
    if (payload._schema !== SCHEMA) {
      errors.push("_schema must equal " + JSON.stringify(SCHEMA));
    }
    if (typeof payload._savedAt !== "string") {
      errors.push("_savedAt must be an ISO 8601 string");
    }
    if (!Array.isArray(payload.studies)) {
      errors.push("studies must be an array");
      return { ok: false, errors: errors };
    }
    for (var i = 0; i < payload.studies.length; i++) {
      var e = validateStudy(payload.studies[i], i);
      for (var j = 0; j < e.length; j++) errors.push(e[j]);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // ----- Normalisation ----------------------------------------------------

  function normalizeStudy(s, i) {
    return {
      label: s && typeof s.label === "string" && s.label.length
        ? s.label
        : "Study " + (i + 1),
      est: s && isFiniteNumber(s.est) ? s.est : null,
      se: s && isFiniteNumber(s.se) && s.se > 0 ? s.se : null,
      moderator: s && isFiniteNumber(s.moderator) ? s.moderator : null,
      group: s && typeof s.group === "string" && s.group.length ? s.group : null,
      year: s && isFiniteNumber(s.year) ? s.year : null,
    };
  }

  function dropPoisoned(studies) {
    var out = [];
    for (var i = 0; i < studies.length; i++) {
      var s = studies[i];
      if (s && isFiniteNumber(s.est) && isFiniteNumber(s.se) && s.se > 0) {
        out.push(s);
      }
    }
    return out;
  }

  function buildEnvelope(studies) {
    var clean = dropPoisoned((studies || []).map(normalizeStudy));
    return {
      _schema: SCHEMA,
      _savedAt: new Date().toISOString(),
      studies: clean,
    };
  }

  // ----- Storage I/O ------------------------------------------------------

  function _hasStorage() {
    try {
      return typeof global.localStorage !== "undefined" && global.localStorage !== null;
    } catch (_) {
      return false;
    }
  }

  function read() {
    if (!_hasStorage()) return [];
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      if (p && p._schema === SCHEMA && Array.isArray(p.studies)) {
        return p.studies;
      }
    } catch (_) {
      /* swallow: malformed bus = empty */
    }
    return [];
  }

  function write(studies) {
    if (!_hasStorage()) return false;
    var env = buildEnvelope(studies);
    try {
      global.localStorage.setItem(KEY, JSON.stringify(env));
      return true;
    } catch (_) {
      return false;
    }
  }

  function merge(studies) {
    var existing = read();
    var combined = existing.concat(studies || []);
    write(combined);
    return read().length;
  }

  function clear() {
    if (!_hasStorage()) return;
    try { global.localStorage.removeItem(KEY); } catch (_) {}
  }

  // ----- Scale helpers ----------------------------------------------------

  /**
   * Build {est, se} from a point estimate + 95 % CI.
   *   scale = "ratio"  → est = ln(point), se = (ln(hi) - ln(lo)) / (2 * Z975)
   *   scale = "linear" → est = point,     se = (hi - lo) / (2 * Z975)
   * Returns null if any input is non-finite, or for "ratio" if point ≤ 0.
   */
  function fromCI(point, lo, hi, scale) {
    if (!isFiniteNumber(point) || !isFiniteNumber(lo) || !isFiniteNumber(hi)) return null;
    if (hi <= lo) return null;
    if (scale === "ratio") {
      if (point <= 0 || lo <= 0 || hi <= 0) return null;
      return {
        est: Math.log(point),
        se: (Math.log(hi) - Math.log(lo)) / (2 * Z975),
      };
    }
    return {
      est: point,
      se: (hi - lo) / (2 * Z975),
    };
  }

  /** Back-transform a log effect to the natural ratio scale. */
  function toRatio(est) {
    return isFiniteNumber(est) ? Math.exp(est) : null;
  }

  // ----- CSV interop ------------------------------------------------------

  /**
   * Parse a permissive CSV of `label, est, se[, year[, group[, moderator]]]`.
   * Blank lines and lines starting with `#` are ignored.
   * Numeric fields with European-decimal-style commas inside quoted cells are
   * NOT supported (matches the rest of the suite — see lessons.md).
   */
  function parseCSV(text) {
    if (typeof text !== "string") return [];
    var lines = text.split(/\r?\n/);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var parts = line.split(/\s*,\s*/);
      if (parts.length < 3) continue;
      var est = parseFloat(parts[1]);
      var se = parseFloat(parts[2]);
      if (!isFiniteNumber(est) || !isFiniteNumber(se) || se <= 0) continue;
      var year = parts.length > 3 && parts[3].length ? parseFloat(parts[3]) : null;
      var group = parts.length > 4 && parts[4].length ? parts[4] : null;
      var moderator = parts.length > 5 && parts[5].length ? parseFloat(parts[5]) : null;
      rows.push({
        label: parts[0] || ("Study " + (rows.length + 1)),
        est: est,
        se: se,
        year: isFiniteNumber(year) ? year : null,
        group: group,
        moderator: isFiniteNumber(moderator) ? moderator : null,
      });
    }
    return rows;
  }

  function _csvQuote(s) {
    if (s == null) return "";
    var x = String(s);
    return /[,"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }

  function toCSV(studies) {
    var lines = ["label,est,se,year,group,moderator"];
    var s = studies || [];
    for (var i = 0; i < s.length; i++) {
      lines.push([
        _csvQuote(s[i].label),
        s[i].est,
        s[i].se,
        s[i].year == null ? "" : s[i].year,
        _csvQuote(s[i].group),
        s[i].moderator == null ? "" : s[i].moderator,
      ].join(","));
    }
    return lines.join("\n") + "\n";
  }

  // ----- Textarea I/O helpers --------------------------------------------

  /**
   * Parse a textarea value whose lines are CSV in one of these formats:
   *   "label, est, se[, year[, group[, moderator]]]"   (format: "label-est-se")
   *   "est, se[, label]"                                (format: "est-se-label")
   *   "est, se, label[, moderator]"                     (format: "est-se-label-mod")
   * Returns an array of {label, est, se, moderator?, group?, year?} rows,
   * silently dropping rows with non-finite est/se or se <= 0.
   */
  function studiesFromTextarea(text, format) {
    if (typeof text !== "string") return [];
    var lines = text.split(/\r?\n/);
    var rows = [];
    var fmt = format || "label-est-se";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var parts = line.split(/\s*,\s*/);
      if (parts.length < 2) continue;
      var label, est, se, mod = null, group = null, year = null;
      if (fmt === "est-se-label" || fmt === "est-se-label-mod") {
        est = parseFloat(parts[0]);
        se = parseFloat(parts[1]);
        label = parts[2] ? parts[2] : "Study " + (rows.length + 1);
        if (fmt === "est-se-label-mod" && parts.length > 3) {
          var m = parseFloat(parts[3]);
          if (isFiniteNumber(m)) mod = m;
        }
      } else {
        // "label-est-se" (default)
        label = parts[0] || ("Study " + (rows.length + 1));
        est = parseFloat(parts[1]);
        se = parseFloat(parts[2]);
        if (parts.length > 3 && parts[3].length) {
          var y = parseFloat(parts[3]);
          if (isFiniteNumber(y)) year = y;
        }
        if (parts.length > 4 && parts[4].length) group = parts[4];
        if (parts.length > 5 && parts[5].length) {
          var m2 = parseFloat(parts[5]);
          if (isFiniteNumber(m2)) mod = m2;
        }
      }
      if (!isFiniteNumber(est) || !isFiniteNumber(se) || se <= 0) continue;
      rows.push({ label: label, est: est, se: se, moderator: mod, group: group, year: year });
    }
    return rows;
  }

  /** Inverse of studiesFromTextarea: serialise studies → textarea text. */
  function textareaFromStudies(studies, format) {
    var fmt = format || "label-est-se";
    var lines = [];
    var s = studies || [];
    for (var i = 0; i < s.length; i++) {
      var r = s[i];
      if (fmt === "est-se-label" || fmt === "est-se-label-mod") {
        var cols = [r.est, r.se, r.label];
        if (fmt === "est-se-label-mod" && r.moderator != null) cols.push(r.moderator);
        lines.push(cols.join(", "));
      } else {
        var cols2 = [r.label, r.est, r.se];
        if (r.year != null) cols2.push(r.year);
        else if (r.group || r.moderator != null) cols2.push("");
        if (r.group) cols2.push(r.group);
        else if (r.moderator != null) cols2.push("");
        if (r.moderator != null) cols2.push(r.moderator);
        lines.push(cols2.join(", "));
      }
    }
    return lines.join("\n");
  }

  // ----- TruthCert receipt -----------------------------------------------

  // SubtleCrypto-backed HMAC-SHA-256 over the canonical bus envelope.
  // Key sourcing rules (encode the lesson from C:\Users\mahmo\.claude\rules\lessons.md
  // "Cryptography / Signing"):
  //   1. NEVER use any field of the bundle itself (cert_id, _savedAt) as the
  //      key — that would let anyone seeing the output forge a signature.
  //   2. Key must come from outside the bundle: a localStorage user-set key
  //      (under "truthcert-hmac-key", set by the user via Settings panel),
  //      or — for tests — an explicit `opts.key` argument.
  //   3. If no key is available, FAIL CLOSED — emit `{ ok: false, error: "no key" }`
  //      rather than a placeholder signature. Placeholders are a security bug.

  function _utf8(s) {
    return new TextEncoder().encode(s);
  }
  function _bytesToHex(buf) {
    var b = new Uint8Array(buf);
    var hex = "";
    for (var i = 0; i < b.length; i++) {
      var x = b[i].toString(16);
      hex += (x.length === 1 ? "0" : "") + x;
    }
    return hex;
  }
  function _hasSubtle() {
    return typeof global.crypto !== "undefined"
      && typeof global.crypto.subtle !== "undefined"
      && typeof global.crypto.subtle.importKey === "function";
  }
  // Deep-canonicalize: sort keys recursively so any reorder of fields by
  // a JSON encoder produces the same byte sequence. Note: JSON.stringify's
  // second-arg "allow-list of keys" filter is RECURSIVE and would silently
  // drop study fields like est/se/label (not in the top-level list) —
  // catastrophic for a signature, since tampering est would then produce the
  // same MAC. Use this canonical form instead.
  function _canonicalize(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(_canonicalize);
    var keys = Object.keys(obj).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = _canonicalize(obj[keys[i]]);
    }
    return out;
  }

  /**
   * Build and HMAC-sign a TruthCert receipt of the current bus state (or a
   * caller-supplied study list). Returns a Promise resolving to:
   *   { ok: true,  receipt: { _schema, _signedAt, studies, signature, alg, keyHint } }
   *   { ok: false, error: "<reason>" }
   *
   * The HMAC key (raw UTF-8 bytes) is taken in this order:
   *   1. `opts.key` (explicit override; tests, CLI tools)
   *   2. localStorage "truthcert-hmac-key" (browser; user-configured)
   *   3. NONE → fail closed.
   *
   * `keyHint` is the SHA-256 of the key truncated to 8 hex chars — enough to
   * identify which key was used without leaking it.
   */
  async function toTruthCert(studiesOrOpts, maybeOpts) {
    var opts = (maybeOpts && typeof maybeOpts === "object") ? maybeOpts
             : (studiesOrOpts && typeof studiesOrOpts === "object" && !Array.isArray(studiesOrOpts) ? studiesOrOpts : {});
    var studies = Array.isArray(studiesOrOpts) ? studiesOrOpts : read();

    if (!_hasSubtle()) return { ok: false, error: "WebCrypto SubtleCrypto unavailable" };

    var keyBytes = null;
    if (opts && typeof opts.key === "string" && opts.key.length > 0) {
      keyBytes = _utf8(opts.key);
    } else if (_hasStorage()) {
      try {
        var k = global.localStorage.getItem("truthcert-hmac-key");
        if (k && k.length > 0) keyBytes = _utf8(k);
      } catch (_) { /* ignore */ }
    }
    if (!keyBytes || keyBytes.length === 0) {
      return { ok: false, error: "no HMAC key — set 'truthcert-hmac-key' in localStorage or pass opts.key" };
    }

    var env = buildEnvelope(studies);
    // 2026-05-25: include AlmBuildInfo (app/version/sha/builtAt) in the SIGNED
    // payload so receipts are tamper-evident about WHICH code produced them.
    // Reviewers months later can replay against the exact commit, not against
    // whatever the latest main branch happens to compute.
    var producedBy = (typeof global.AlmBuildInfo === "object" && global.AlmBuildInfo)
      ? {
          app: String(global.AlmBuildInfo.app || "allmeta"),
          version: String(global.AlmBuildInfo.version || "unknown"),
          sha: String(global.AlmBuildInfo.sha || "unknown"),
          builtAt: String(global.AlmBuildInfo.builtAt || ""),
        }
      : { app: "allmeta", version: "unknown", sha: "unknown", builtAt: "" };
    // Canonical message: deep-sorted keys so the same envelope signs to the
    // same MAC byte-for-byte, regardless of input field order. Studies are
    // already in caller order; their internal field order is canonicalized.
    var payload = {
      _schema: env._schema,
      _signedAt: new Date().toISOString(),
      producedBy: producedBy,
      studies: env.studies,
    };
    var msg = JSON.stringify(_canonicalize(payload));

    try {
      var keyObj = await global.crypto.subtle.importKey(
        "raw", keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false, ["sign"]
      );
      var sigBuf = await global.crypto.subtle.sign("HMAC", keyObj, _utf8(msg));
      var sig = _bytesToHex(sigBuf);
      var khBuf = await global.crypto.subtle.digest("SHA-256", keyBytes);
      var keyHint = _bytesToHex(khBuf).slice(0, 8);
      return {
        ok: true,
        receipt: {
          _schema: payload._schema,
          _signedAt: payload._signedAt,
          producedBy: payload.producedBy,
          studies: payload.studies,
          alg: "HMAC-SHA-256",
          keyHint: keyHint,
          signature: sig,
        },
      };
    } catch (e) {
      return { ok: false, error: "sign failed: " + (e && e.message ? e.message : String(e)) };
    }
  }

  /**
   * Verify a TruthCert receipt against a candidate HMAC key. Returns:
   *   { ok: true,  valid: boolean,  reason?: string }
   *   { ok: false, error: "<reason>" }
   * `valid: true` ⟺ the receipt's signature is a valid HMAC-SHA-256 of
   * the canonical payload under the candidate key (constant-time compare).
   */
  async function verifyTruthCert(receipt, opts) {
    opts = opts || {};
    if (!_hasSubtle()) return { ok: false, error: "WebCrypto SubtleCrypto unavailable" };
    if (!receipt || typeof receipt !== "object") return { ok: false, error: "receipt missing" };
    if (receipt._schema !== SCHEMA) return { ok: false, error: "wrong schema" };
    if (receipt.alg !== "HMAC-SHA-256") return { ok: false, error: "unsupported alg: " + receipt.alg };
    if (typeof receipt.signature !== "string" || receipt.signature.length === 0) {
      return { ok: false, error: "no signature" };
    }

    var keyBytes = null;
    if (typeof opts.key === "string" && opts.key.length) keyBytes = _utf8(opts.key);
    else if (_hasStorage()) {
      try {
        var k = global.localStorage.getItem("truthcert-hmac-key");
        if (k && k.length) keyBytes = _utf8(k);
      } catch (_) { /* ignore */ }
    }
    if (!keyBytes) return { ok: false, error: "no key for verification" };

    var payload = {
      _schema: receipt._schema,
      _signedAt: receipt._signedAt,
      // producedBy is part of the SIGNED payload (added 2026-05-25). Older
      // receipts without it remain verifiable because _canonicalize drops
      // undefined keys, and they were signed without it.
      producedBy: receipt.producedBy,
      studies: receipt.studies,
    };
    var msg = JSON.stringify(_canonicalize(payload));

    try {
      var keyObj = await global.crypto.subtle.importKey(
        "raw", keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false, ["sign"]
      );
      var sigBuf = await global.crypto.subtle.sign("HMAC", keyObj, _utf8(msg));
      var actual = _bytesToHex(sigBuf);
      // Constant-time hex compare (length-equal). Avoids early-exit
      // timing side channels that a `===` would leak.
      var a = String(receipt.signature);
      if (a.length !== actual.length) return { ok: true, valid: false, reason: "length mismatch" };
      var diff = 0;
      for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ actual.charCodeAt(i);
      return { ok: true, valid: diff === 0, reason: diff === 0 ? undefined : "signature mismatch" };
    } catch (e) {
      return { ok: false, error: "verify failed: " + (e && e.message ? e.message : String(e)) };
    }
  }

  /**
   * Wire a pair of buttons to load/save a textarea against the shared bus.
   * Idempotent if buttons already have listeners (overwrites with new ones).
   *
   *   MaStudies.attachButtons({
   *     btnLoad: "#btn-bus-load",      // CSS selector or HTMLElement
   *     btnSave: "#btn-bus-save",
   *     textarea: "#f-data",            // CSS selector or HTMLElement
   *     format: "label-est-se",         // or "est-se-label" / "est-se-label-mod"
   *     onAfterLoad: function () {},    // optional callback after load
   *     toast: window.Toast,            // optional Toast object with .show
   *   });
   */
  function attachButtons(opts) {
    if (typeof document === "undefined") return false;
    function el(x) { return typeof x === "string" ? document.querySelector(x) : x; }
    var btnLoad = el(opts.btnLoad);
    var btnSave = el(opts.btnSave);
    var ta = el(opts.textarea);
    if (!ta) return false;
    var fmt = opts.format || "label-est-se";
    var toast = opts.toast || (typeof window !== "undefined" ? window.Toast : null);
    function notify(msg, kind) {
      if (toast && typeof toast.show === "function") toast.show(msg, kind || "warn");
    }
    if (btnLoad) {
      btnLoad.addEventListener("click", function () {
        var studies = read();
        if (!studies.length) { notify("No shared studies yet.", "warn"); return; }
        ta.value = textareaFromStudies(studies, fmt);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof opts.onAfterLoad === "function") opts.onAfterLoad(studies);
      });
    }
    if (btnSave) {
      btnSave.addEventListener("click", function () {
        var rows = studiesFromTextarea(ta.value, fmt);
        if (!rows.length) { notify("Nothing to save.", "warn"); return; }
        var ok = write(rows);
        notify(ok ? ("Saved " + rows.length + " studies to shared bus.") : "Could not save to bus.", ok ? "warn" : "error");
      });
    }
    return true;
  }

  // ----- "Verify in R" deep-link -----------------------------------------

  /**
   * Push the supplied (or current) studies to the bus and open webr-validator
   * in a new tab pre-loaded with them. `webrPath` defaults to a relative
   * path that resolves for any app at depth 1 under the repo root
   * (e.g. /forest-plot/ → /webr-validator/). Apps at deeper paths should
   * pass an explicit `webrPath` arg.
   *
   *   MaStudies.openInWebR();                          // push current bus + open
   *   MaStudies.openInWebR(studies);                   // push these studies + open
   *   MaStudies.openInWebR({ studies, webrPath: ... });
   */
  function openInWebR(arg, opts) {
    opts = (opts && typeof opts === "object") ? opts
         : (arg && typeof arg === "object" && !Array.isArray(arg) ? arg : {});
    var studies = Array.isArray(arg) ? arg : (opts.studies || null);
    if (Array.isArray(studies) && studies.length > 0) {
      write(studies);
    }
    // sanity: if there's nothing on the bus, refuse — opening webr with
    // no studies just shows an empty form, confusing the user.
    if (!read().length) {
      if (typeof global.alert === "function") global.alert("No studies on the shared bus yet — save your data to the bus first.");
      return false;
    }
    var path = opts.webrPath || "../webr-validator/?fromBus=1";
    if (typeof global.open !== "function") return false;
    var w = global.open(path, "_blank", "noopener,noreferrer");
    return !!w;
  }

  /**
   * Attach a "Verify in R" button to the page. If `btn` resolves, sets up
   * the click handler that calls openInWebR with the optional studies
   * provider (e.g. a function that returns the app's current studies).
   */
  function attachVerifyInRButton(opts) {
    if (typeof document === "undefined" || !opts || !opts.btn) return false;
    var el = typeof opts.btn === "string" ? document.querySelector(opts.btn) : opts.btn;
    if (!el) return false;
    el.addEventListener("click", function () {
      var studies = null;
      if (typeof opts.getStudies === "function") {
        try { studies = opts.getStudies(); } catch (_) { studies = null; }
      }
      openInWebR(studies, { webrPath: opts.webrPath });
    });
    return true;
  }

  // ----- Public API -------------------------------------------------------

  var api = {
    KEY: KEY,
    SCHEMA: SCHEMA,
    Z975: Z975,
    read: read,
    write: write,
    merge: merge,
    clear: clear,
    validate: validate,
    normalizeStudy: normalizeStudy,
    buildEnvelope: buildEnvelope,
    dropPoisoned: dropPoisoned,
    fromCI: fromCI,
    toRatio: toRatio,
    parseCSV: parseCSV,
    toCSV: toCSV,
    studiesFromTextarea: studiesFromTextarea,
    textareaFromStudies: textareaFromStudies,
    attachButtons: attachButtons,
    toTruthCert: toTruthCert,
    verifyTruthCert: verifyTruthCert,
    openInWebR: openInWebR,
    attachVerifyInRButton: attachVerifyInRButton,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MaStudies = api;
})(typeof window !== "undefined" ? window : globalThis);
