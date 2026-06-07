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
 * Honesty (lessons.md "Cryptography / Signing"): when no signing key is
 * configured the export STILL proceeds — never a placeholder/fake signature.
 * Instead it carries a Tier-0 KEYLESS seal: a SHA-256 `contentHash` over the
 * canonical manifest (signed:false, tamperEvident:true). Anyone can recompute
 * it (verifyContentHash) to detect tampering, with no key — so publishing is
 * never blocked. It makes NO authorship claim (anyone can produce a valid
 * hash); for authorship use the HMAC/Ed25519 signed path.
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

  // Deterministic JSON: keys sorted recursively, so the same logical object
  // always hashes identically regardless of insertion order.
  function _stableStringify(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(_stableStringify).join(",") + "]";
    var keys = Object.keys(v).sort();
    return "{" + keys.map(function (k) {
      return JSON.stringify(k) + ":" + _stableStringify(v[k]);
    }).join(",") + "}";
  }

  // Canonical form of a manifest for hashing — excludes the seal fields it is
  // about to (or already does) carry, so signer and verifier hash the same bytes.
  function _canonicalManifest(m) {
    var copy = {};
    for (var k in m) {
      if (Object.prototype.hasOwnProperty.call(m, k)
          && k !== "contentHash" && k !== "tamperEvident") copy[k] = m[k];
    }
    return _stableStringify(copy);
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
      return await _sealManifest(opts, extra, "MaStudies signer not loaded");
    }
    var sigOpts = { extra: extra };
    if (opts.key) sigOpts.key = opts.key;
    var tc;
    try {
      tc = await MaStudies.toTruthCert(opts.studies || [], sigOpts);
    } catch (e) {
      return await _sealManifest(opts, extra, "sign threw: " + (e && e.message || e));
    }
    if (tc && tc.ok) return { signed: true, receipt: tc.receipt };
    return await _sealManifest(opts, extra, (tc && tc.error) || "sign failed");
  }

  // Unsigned provenance manifest — same shape/fields as a receipt minus the
  // signature, so a reviewer still has the studies + method + producedBy to
  // replay, and it is unambiguously marked unsigned.
  function _manifest(opts, extra) {
    return {
      _schema: "truthcert-export-contenthash-v1",
      signed: false,
      _builtAt: null, // intentionally null: no trusted clock in the unsigned path
      producedBy: _producedBy(),
      studies: opts.studies || [],
      extra: extra || _extra(opts),
    };
  }

  // Tier-0 keyless seal: attach a SHA-256 content hash so the unsigned manifest
  // is tamper-EVIDENT without any key (publishing is never blocked). This makes
  // NO authorship claim — anyone can recompute a valid hash — which is the
  // honest, stated property. Returns the standard unsigned result shape.
  async function _sealManifest(opts, extra, reason) {
    var m = _manifest(opts, extra);
    var h = await sha256Hex(_canonicalManifest(m));
    if (h) { m.contentHash = "sha256:" + h; m.tamperEvident = true; }
    else { m.contentHash = null; m.tamperEvident = false; } // no SubtleCrypto
    return { signed: false, reason: reason || null, manifest: m };
  }

  // Recompute the Tier-0 seal and compare. Returns true iff the manifest's
  // content is unchanged since it was sealed. Integrity only, not authorship.
  async function verifyContentHash(manifest) {
    if (!manifest || typeof manifest.contentHash !== "string") return false;
    var h = await sha256Hex(_canonicalManifest(manifest));
    return h !== null && ("sha256:" + h) === manifest.contentHash;
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
    var m = res.manifest || {};
    var pb = m.producedBy;
    var by = pb ? (pb.app + "@" + String(pb.sha).slice(0, 7)) : "allmeta";
    if (m.tamperEvident && typeof m.contentHash === "string") {
      return "TruthCert: SHA-256 content-sealed (keyless, tamper-evident) "
        + m.contentHash.slice(0, 19) + "… · " + by;
    }
    return "TruthCert: UNSIGNED provenance · " + by;
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
    // Handle any viewBox "minX minY w h" (chart-download.js pads to "-12 -12 …"),
    // not just "0 0 w h"; anchor the footer to the bottom-left of the viewBox.
    var vb = s.match(/viewBox="(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/);
    var x0 = vb ? parseFloat(vb[1]) : 0;
    var y0 = vb ? parseFloat(vb[2]) : 0;
    var h = vb ? parseFloat(vb[4]) : 600;
    var caption = footerLine(res);
    var txt = '<text data-truthcert="1" x="' + (x0 + 6) + '" y="' + (y0 + h - 4) + '" font-size="9" '
      + 'fill="#888" font-family="monospace">' + _xmlEscape(caption) + "</text>";
    out = out.replace(/(<\/svg>\s*)$/, txt + "\n$1");
    return out;
  }

  var api = {
    sha256Hex: sha256Hex,
    buildReceipt: buildReceipt,
    verifyContentHash: verifyContentHash,
    sidecarJSON: sidecarJSON,
    sidecarName: sidecarName,
    footerLine: footerLine,
    stampSVG: stampSVG,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTruthCertExport = api;
})(typeof window !== "undefined" ? window : globalThis);
