/* shared/truthcert-ui.js — reusable TruthCert key management + receipt UI.
 *
 * Depends on shared/ma-studies-v1.js (MaStudies.toTruthCert / verifyTruthCert).
 * Load AFTER it:
 *   <script src="../shared/ma-studies-v1.js"></script>
 *   <script src="../shared/truthcert-ui.js"></script>
 *
 * Wire per app:
 *   TruthCertUI.attachSettingsButton({ btn: "#btn-truthcert-key" });
 *   TruthCertUI.attachReceiptButton({ btn: "#btn-truthcert", basename: "forest-plot",
 *                                     getStudies: () => currentStudies() });
 *
 * The signing key (HMAC-SHA-256) lives in localStorage "truthcert-hmac-key" and
 * is shared across every allmeta app, so one key signs all receipts and a
 * reviewer with that key can re-verify them offline. toTruthCert fails closed
 * without a key (placeholder signatures are a security bug — see lessons.md), so
 * the receipt button opens the key panel when no key is set.
 */
(function (global) {
  "use strict";

  var KEY_STORE = "truthcert-hmac-key";
  var OVERLAY_ID = "truthcert-overlay";

  function getKey() {
    try { return (global.localStorage && global.localStorage.getItem(KEY_STORE)) || ""; }
    catch (_) { return ""; }
  }
  function setKey(k) {
    try {
      if (k) global.localStorage.setItem(KEY_STORE, k);
      else global.localStorage.removeItem(KEY_STORE);
      return true;
    } catch (_) { return false; }
  }
  function generateKey() {
    var b = new Uint8Array(32);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b);
    var hex = "";
    for (var i = 0; i < b.length; i++) {
      var x = b[i].toString(16);
      hex += (x.length === 1 ? "0" : "") + x;
    }
    return hex;
  }
  function toast(msg, kind) {
    if (global.Toast && typeof global.Toast.show === "function") global.Toast.show(msg, kind || "warn");
  }

  // ----- key settings modal ----------------------------------------------

  function closeSettings() {
    var o = document.getElementById(OVERLAY_ID);
    if (o) o.remove();
    document.removeEventListener("keydown", _esc);
  }
  function _esc(e) { if (e.key === "Escape") closeSettings(); }

  function openSettings(opts) {
    opts = opts || {};
    if (typeof document === "undefined") return;
    closeSettings();

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "TruthCert signing key");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10050;display:flex;align-items:center;justify-content:center;padding:1rem";

    var modal = document.createElement("div");
    modal.style.cssText = "background:var(--card,#fff);color:var(--text,#111);max-width:480px;width:100%;border-radius:10px;padding:1.25rem;box-shadow:0 10px 40px rgba(0,0,0,.3);font-size:.9rem;line-height:1.5";

    var h = document.createElement("h2");
    h.textContent = "TruthCert signing key";
    h.style.cssText = "margin:0 0 .5rem;font-size:1.1rem";

    var p = document.createElement("p");
    p.textContent = "Receipts are signed with an HMAC-SHA-256 key you control. Share this key with a reviewer so they can re-verify your receipts offline. It is stored only in this browser.";
    p.style.cssText = "margin:.25rem 0 .75rem;color:var(--muted,#555)";

    var input = document.createElement("input");
    input.type = "text";
    input.id = "truthcert-key-input";
    input.setAttribute("aria-label", "Signing key");
    input.placeholder = "Paste or generate a signing key";
    input.value = getKey();
    input.style.cssText = "width:100%;padding:.45rem .6rem;border:1px solid var(--border,#ccc);border-radius:6px;font-family:monospace;box-sizing:border-box";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem";

    function mkBtn(label, id, primary) {
      var b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.textContent = label;
      b.style.cssText = "border-radius:6px;padding:.4rem .8rem;cursor:pointer;border:1px solid " +
        (primary ? "#2a6cae" : "var(--border,#ccc)") + ";" +
        (primary ? "background:#2a6cae;color:#fff;font-weight:600" : "background:transparent;color:inherit");
      return b;
    }
    var gen = mkBtn("Generate", "truthcert-gen");
    var save = mkBtn("Save", "truthcert-save", true);
    var clear = mkBtn("Clear", "truthcert-clear");
    var close = mkBtn("Close", "truthcert-close");

    gen.addEventListener("click", function () { input.value = generateKey(); });
    save.addEventListener("click", function () {
      var k = input.value.trim();
      if (!k) { toast("Enter or generate a key first.", "warn"); return; }
      setKey(k);
      toast("Signing key saved.", "warn");
      if (typeof opts.onSave === "function") { try { opts.onSave(k); } catch (_) {} }
      closeSettings();
    });
    clear.addEventListener("click", function () {
      setKey("");
      input.value = "";
      toast("Signing key cleared.", "warn");
    });
    close.addEventListener("click", closeSettings);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSettings(); });
    document.addEventListener("keydown", _esc);

    row.appendChild(gen); row.appendChild(save); row.appendChild(clear); row.appendChild(close);
    modal.appendChild(h); modal.appendChild(p); modal.appendChild(input); modal.appendChild(row);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    input.focus();
  }

  // ----- receipt download ------------------------------------------------

  async function downloadReceipt(studies, basename) {
    if (!global.MaStudies || typeof global.MaStudies.toTruthCert !== "function") {
      toast("TruthCert engine not loaded.", "error");
      return false;
    }
    if (!getKey()) {
      toast("Set a TruthCert signing key first.", "warn");
      openSettings();
      return false;
    }
    if (!studies || !studies.length) {
      toast("No studies to sign.", "warn");
      return false;
    }
    var res = await global.MaStudies.toTruthCert(studies, { key: getKey() });
    if (!res || !res.ok) {
      toast("Could not sign: " + (res && res.error ? res.error : "unknown error"), "error");
      return false;
    }
    if (typeof document !== "undefined") {
      var blob = new Blob([JSON.stringify(res.receipt, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = (basename || "allmeta") + "-truthcert.json";
      document.body.appendChild(a); // appendChild before click (Firefox)
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }
    toast("TruthCert receipt downloaded (keyHint " + res.receipt.keyHint + ").", "warn");
    return true;
  }

  function _el(x) { return typeof x === "string" ? document.querySelector(x) : x; }

  // Resolve current studies from either an explicit getStudies(), or — for apps
  // that wire MaStudies.attachButtons — a {textarea, format} pair, parsed with
  // the same shared parser so the receipt signs exactly what the bus would.
  function _resolveStudies(opts) {
    if (typeof opts.getStudies === "function") {
      try { return opts.getStudies() || []; } catch (_) { return []; }
    }
    if (opts.textarea && global.MaStudies && typeof global.MaStudies.studiesFromTextarea === "function") {
      var ta = _el(opts.textarea);
      if (ta) {
        try { return global.MaStudies.studiesFromTextarea(ta.value, opts.format || "label-est-se") || []; }
        catch (_) { return []; }
      }
    }
    return [];
  }

  function attachReceiptButton(opts) {
    if (typeof document === "undefined" || !opts || !opts.btn) return false;
    var el = _el(opts.btn);
    if (!el) return false;
    el.addEventListener("click", function () {
      downloadReceipt(_resolveStudies(opts), opts.basename);
    });
    return true;
  }

  function attachSettingsButton(opts) {
    if (typeof document === "undefined" || !opts || !opts.btn) return false;
    var el = _el(opts.btn);
    if (!el) return false;
    el.addEventListener("click", function () { openSettings(opts); });
    return true;
  }

  var api = {
    KEY_STORE: KEY_STORE,
    getKey: getKey,
    setKey: setKey,
    generateKey: generateKey,
    openSettings: openSettings,
    closeSettings: closeSettings,
    downloadReceipt: downloadReceipt,
    attachReceiptButton: attachReceiptButton,
    attachSettingsButton: attachSettingsButton,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TruthCertUI = api;
})(typeof window !== "undefined" ? window : globalThis);
