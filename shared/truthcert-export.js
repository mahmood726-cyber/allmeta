/* shared/truthcert-export.js — bind a verifiable TruthCert receipt to an
 * exported artifact (SVG / PNG / PDF / CSV / JSON).
 *
 * The figure or table a user pastes into a manuscript should be self-verifying:
 * it should carry a receipt proving WHICH studies + method produced it, signed
 * with the user's HMAC key and replayable against the exact commit. This module
 * adds NO new cryptography — it reuses the audited signer in
 * shared/ma-studies-v1.js (MaStudies.toTruthCert): the analysis metadata
 * (method, results, label, optional artifact hash) is folded into the SIGNED
 * `extra` block, so the existing MaStudies.verifyTruthCert verifies an export
 * receipt unchanged.
 *
 * Honesty (lessons.md "Cryptography / Signing"): when no HMAC key is configured
 * the export STILL proceeds, carrying an UNSIGNED provenance manifest
 * (signed:false) — never a placeholder/fake signature.
 *
 * Browser: window.AlmTruthCertExport. Node: module.exports (Web Crypto since
 * Node 15 provides globalThis.crypto.subtle, so receipts sign + verify in CI).
 */
(function (global) {
  "use strict";

  function _hasSubtle() {
    return typeof global.crypto !== "undefined"
      && typeof global.crypto.subtle !== "undefined"
      && typeof global.crypto.subtle.digest === "function";
  }

  function _bytesToHex(buf) {
    var b = new Uint8Array(buf), hex = "";
    for (var i = 0; i < b.length; i++) {
      var x = b[i].toString(16);
      hex += (x.length === 1 ? "0" : "") + x;
    }
    return hex;
  }

  // SHA-256 of a string | ArrayBuffer | Uint8Array → lowercase hex.
  async function sha256Hex(input) {
    if (!_hasSubtle()) return null;
    var bytes;
    if (typeof input === "string") bytes = new TextEncoder().encode(input);
    else if (input instanceof Uint8Array) bytes = input;
    else bytes = new Uint8Array(input);
    var buf = await global.crypto.subtle.digest("SHA-256", bytes);
    return _bytesToHex(buf);
  }

  function _producedBy() {
    var bi = (typeof global.AlmBuildInfo === "object" && global.AlmBuildInfo) ? global.AlmBuildInfo : null;
    return {
      app: String(bi && bi.app || "allmeta"),
      version: String(bi && bi.version || "unknown"),
      sha: String(bi && bi.sha || "unknown"),
      builtAt: String(bi && bi.builtAt || ""),
    };
  }

  function _extra(opts) {
    var e = {
      kind: "export",
      label: String(opts.label || ""),
      method: (opts.method !== undefined ? opts.method : null),
      results: (opts.results !== undefined ? opts.results : null),
    };
    if (opts.artifactHash) e.artifactHash = String(opts.artifactHash);
    return e;
  }

  /**
   * Build a receipt that binds an export to its analysis.
   *   opts: { studies, method, results, label?, artifactHash?, key? }
   * Returns (Promise):
   *   { signed: true,  receipt }                          (HMAC-signed)
   *   { signed: false, reason, manifest }                 (no key / no signer)
   * The signed `receipt` verifies with MaStudies.verifyTruthCert as-is.
   */
  async function buildReceipt(opts) {
    opts = opts || {};
    var MaStudies = global.MaStudies;
    var extra = _extra(opts);
    if (!MaStudies || typeof MaStudies.toTruthCert !== "function") {
      return { signed: false, reason: "MaStudies signer not loaded", manifest: _manifest(opts, extra) };
    }
    var sigOpts = { extra: extra };
    if (opts.key) sigOpts.key = opts.key;
    var tc;
    try {
      tc = await MaStudies.toTruthCert(opts.studies || [], sigOpts);
    } catch (e) {
      return { signed: false, reason: "sign threw: " + (e && e.message || e), manifest: _manifest(opts, extra) };
    }
    if (tc && tc.ok) return { signed: true, receipt: tc.receipt };
    return { signed: false, reason: (tc && tc.error) || "sign failed", manifest: _manifest(opts, extra) };
  }

  // Unsigned provenance manifest — same shape/fields as a receipt minus the
  // signature, so a reviewer still has the studies + method + producedBy to
  // replay, and it is unambiguously marked unsigned.
  function _manifest(opts, extra) {
    return {
      _schema: "truthcert-export-unsigned-v1",
      signed: false,
      _builtAt: null, // intentionally null: no trusted clock in the unsigned path
      producedBy: _producedBy(),
      studies: opts.studies || [],
      extra: extra || _extra(opts),
    };
  }

  function _payload(res) { return res.signed ? res.receipt : res.manifest; }

  // Companion file contents + name for CSV/JSON/PNG downloads.
  function sidecarJSON(res) { return JSON.stringify(_payload(res), null, 2); }
  function sidecarName(filename) {
    return String(filename).replace(/\.[^.]+$/, "") + ".truthcert.json";
  }

  // One-line human caption (PNG/PDF/SVG footer).
  function footerLine(res) {
    if (res.signed) {
      var r = res.receipt;
      var by = r.producedBy ? (r.producedBy.app + "@" + String(r.producedBy.sha).slice(0, 7)) : "allmeta";
      return "TruthCert HMAC-SHA-256 key:" + (r.keyHint || "?")
        + " sig:" + String(r.signature || "").slice(0, 12) + "… · " + by;
    }
    var pb = res.manifest && res.manifest.producedBy;
    return "TruthCert: UNSIGNED provenance (set an HMAC key to sign) · "
      + (pb ? (pb.app + "@" + String(pb.sha).slice(0, 7)) : "allmeta");
  }

  function _xmlEscape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Embed the receipt into an SVG string: a machine-readable <metadata
  // id="truthcert"> block + a small human-visible footer <text>. Idempotent —
  // strips any prior truthcert stamp first so re-export doesn't double-stamp.
  function stampSVG(svgString, res) {
    var s = String(svgString)
      .replace(/<metadata id="truthcert">[\s\S]*?<\/metadata>\s*/g, "")
      .replace(/<text[^>]*data-truthcert="1"[^>]*>[\s\S]*?<\/text>\s*/g, "");
    var json = _payload(res);
    var meta = '<metadata id="truthcert">' + _xmlEscape(JSON.stringify(json)) + '</metadata>';
    var out = s.replace(/(<svg\b[^>]*>)/, "$1\n" + meta);
    var vb = s.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    var h = vb ? parseFloat(vb[2]) : 600;
    var caption = footerLine(res);
    var txt = '<text data-truthcert="1" x="6" y="' + (h - 4) + '" font-size="9" '
      + 'fill="#888" font-family="monospace">' + _xmlEscape(caption) + "</text>";
    out = out.replace(/(<\/svg>\s*)$/, txt + "\n$1");
    return out;
  }

  var api = {
    sha256Hex: sha256Hex,
    buildReceipt: buildReceipt,
    sidecarJSON: sidecarJSON,
    sidecarName: sidecarName,
    footerLine: footerLine,
    stampSVG: stampSVG,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTruthCertExport = api;
})(typeof window !== "undefined" ? window : globalThis);
