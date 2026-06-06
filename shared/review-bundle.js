/* shared/review-bundle.js — a whole systematic review as one offline, signed,
 * tamper-evident object (Phase 3 capstone).
 *
 * A review project is a sequence of stages (protocol → search → screening →
 * extraction → appraisal → synthesis → certainty → report). Each stage carries
 * the JSON output of the corresponding allmeta app. This module:
 *
 *  1. builds a PROVENANCE CHAIN: stage[i].chainHash = SHA-256(stage[i-1].chainHash
 *     | SHA-256(canonical(stage[i].output))). Altering any stage's output breaks
 *     that stage's hash AND every downstream hash — so verification can locate the
 *     FIRST tampered stage, not merely "something changed".
 *  2. HMAC-signs the whole bundle by reusing the audited MaStudies.toTruthCert
 *     (the bundle rides in the signed `extra` block) — NO new cryptography. The
 *     SHA-256 helper is the verified AlmTruthCertExport.sha256Hex.
 *  3. verifies an opened bundle: authenticity (HMAC) + chain integrity (which
 *     stage, if any, was altered).
 *
 * Honest fail-closed: with no HMAC key the bundle still saves with its chain
 * (tamper-evident) but UNSIGNED (no authenticity) — never a placeholder signature.
 *
 * Depends on shared/ma-studies-v1.js (signer) and shared/truthcert-export.js
 * (sha256Hex). Browser: window.AlmReviewBundle. Node: module.exports.
 */
(function (global) {
  "use strict";

  var SCHEMA = "review-bundle-v1";

  function _sha256() {
    var tx = global.AlmTruthCertExport;
    return (tx && typeof tx.sha256Hex === "function") ? tx.sha256Hex : null;
  }

  // Deterministic serialization: recursively sort object keys so the same logical
  // output always hashes to the same bytes regardless of key order.
  function _canonical(obj) {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj === undefined ? null : obj);
    if (Array.isArray(obj)) return "[" + obj.map(_canonical).join(",") + "]";
    var keys = Object.keys(obj).sort();
    return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + _canonical(obj[k]); }).join(",") + "}";
  }

  // Compute outputHash + chainHash for each stage (in order). Mutates copies, not
  // the input. Returns { stages, root } where root is the final chainHash.
  async function buildChain(stages) {
    var sha = _sha256();
    if (!sha) throw new Error("AlmTruthCertExport.sha256Hex unavailable");
    var out = [];
    var prev = "";
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var outputHash = await sha(_canonical(s.output !== undefined ? s.output : null));
      var chainHash = await sha(prev + "|" + outputHash);
      out.push(Object.assign({}, s, { outputHash: outputHash, chainHash: chainHash }));
      prev = chainHash;
    }
    return { stages: out, root: prev };
  }

  // Build + HMAC-sign a review bundle. Returns:
  //   { ok:true, signed:true, receipt }                          (signed)
  //   { ok:true, signed:false, bundle, reason }                 (no key/signer)
  //   { ok:false, error }                                       (chain failed)
  async function sign(project, opts) {
    opts = opts || {};
    var chained;
    try { chained = await buildChain(project.stages || []); }
    catch (e) { return { ok: false, error: "chain failed: " + (e && e.message || e) }; }
    var bundle = {
      _schema: SCHEMA,
      title: String(project.title || "Untitled review"),
      stages: chained.stages,
      root: chained.root,
    };
    var MaStudies = global.MaStudies;
    if (!MaStudies || typeof MaStudies.toTruthCert !== "function") {
      return { ok: true, signed: false, bundle: bundle, reason: "MaStudies signer not loaded" };
    }
    var sigOpts = { extra: bundle };
    if (opts.key) sigOpts.key = opts.key;
    var tc = await MaStudies.toTruthCert([], sigOpts);
    if (tc && tc.ok) return { ok: true, signed: true, receipt: tc.receipt };
    return { ok: true, signed: false, bundle: bundle, reason: (tc && tc.error) || "sign failed" };
  }

  // Verify an opened receipt: HMAC authenticity (if signed) + chain integrity.
  // Returns { ok, signed, signatureValid, chainValid, brokenStage, root }.
  async function verify(receiptOrBundle, opts) {
    opts = opts || {};
    var bundle = receiptOrBundle && receiptOrBundle.extra ? receiptOrBundle.extra : receiptOrBundle;
    if (!bundle || bundle._schema !== SCHEMA || !Array.isArray(bundle.stages)) {
      return { ok: false, error: "not a review-bundle-v1" };
    }
    var sha = _sha256();
    if (!sha) return { ok: false, error: "sha256 unavailable" };

    // chain integrity — recompute and locate the first altered stage.
    var prev = "", broken = -1, computedRoot = "";
    for (var i = 0; i < bundle.stages.length; i++) {
      var s = bundle.stages[i];
      var outputHash = await sha(_canonical(s.output !== undefined ? s.output : null));
      var chainHash = await sha(prev + "|" + outputHash);
      if (broken < 0 && (outputHash !== s.outputHash || chainHash !== s.chainHash)) broken = i;
      prev = (broken < 0) ? chainHash : prev; // stop advancing once broken
      computedRoot = chainHash;
    }
    var chainValid = (broken < 0) && (computedRoot === bundle.root);

    // authenticity — only meaningful for a signed receipt.
    var signed = !!(receiptOrBundle && receiptOrBundle.signature);
    var signatureValid = false;
    if (signed && global.MaStudies && typeof global.MaStudies.verifyTruthCert === "function") {
      var v = await global.MaStudies.verifyTruthCert(receiptOrBundle, opts.key ? { key: opts.key } : {});
      signatureValid = !!(v && v.ok && v.valid);
    }
    return { ok: true, signed: signed, signatureValid: signatureValid,
             chainValid: chainValid, brokenStage: broken, root: bundle.root };
  }

  var api = { sign: sign, verify: verify, buildChain: buildChain, _canonical: _canonical, SCHEMA: SCHEMA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmReviewBundle = api;
})(typeof window !== "undefined" ? window : globalThis);
