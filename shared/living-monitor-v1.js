/* shared/living-monitor-v1.js — signed, tamper-evident audit trail for a
 * living review's update timeline.
 *
 * A living review is re-pooled every time new evidence appears. This module
 * SEALS each recorded version into a SHA-256 hash chain (each seal binds the
 * version's content to the previous seal), optionally HMAC-signed with the
 * reviewer's key. verifyHistory() then re-derives the whole chain and pinpoints
 * the FIRST version that was altered or re-ordered — so the evolution of the
 * living review is reproducible and tamper-evident. No competitor (incl. Nested
 * Knowledge) offers a cryptographically verifiable per-update audit trail.
 *
 * Uses Web Crypto (crypto.subtle), available in browsers and Node ≥ 20, so the
 * exact same code is node-testable. Browser global: window.LivingMonitor.
 */
(function (global) {
  "use strict";

  function subtle() {
    var c = global.crypto || (typeof crypto !== "undefined" ? crypto : null);
    if (!c || !c.subtle) throw new Error("Web Crypto (crypto.subtle) unavailable");
    return c.subtle;
  }
  function enc(s) { return new TextEncoder().encode(String(s)); }
  function hex(buf) {
    var b = new Uint8Array(buf), o = "", i;
    for (i = 0; i < b.length; i++) o += b[i].toString(16).padStart(2, "0");
    return o;
  }
  function sha256Hex(s) { return subtle().digest("SHA-256", enc(s)).then(hex); }
  function hmacHex(key, s) {
    return subtle().importKey("raw", enc(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then(function (k) { return subtle().sign("HMAC", k, enc(s)); }).then(hex);
  }

  // Stable canonical JSON (sorted keys) so hashing is order-independent.
  function canonical(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
  }
  // A version's content excludes its own seal (the seal is derived from content).
  function content(version) {
    var c = {}, k;
    for (k in version) if (k !== "_seal") c[k] = version[k];
    return canonical(c);
  }

  // Seal `version` onto the chain whose tail seal is `prevSeal` (null for the
  // first). Returns a copy carrying ._seal {contentHash, prevChainHash,
  // chainHash, signed, sig?}. With a key, the chain head is HMAC-signed.
  function sealVersion(prevSeal, version, key) {
    var prevChain = prevSeal ? prevSeal.chainHash : "";
    return sha256Hex(content(version)).then(function (ch) {
      return sha256Hex(prevChain + ch).then(function (chain) {
        var seal = { contentHash: ch, prevChainHash: prevChain, chainHash: chain, signed: false };
        var out = {}, k;
        for (k in version) if (k !== "_seal") out[k] = version[k];
        out._seal = seal;
        if (!key) return out;
        return hmacHex(key, chain).then(function (sig) { seal.sig = sig; seal.signed = true; return out; });
      });
    });
  }

  // Re-derive the whole chain; returns {valid, brokenAt, reason, signed}.
  // brokenAt is the 0-based index of the first tampered/re-ordered version.
  function verifyHistory(versions, key) {
    versions = versions || [];
    var prevChain = "", i = 0, sigChecked = false;
    function step() {
      if (i >= versions.length) {
        // `signed` means signatures were ACTUALLY verified — not merely present.
        // The SHA-256 chain alone is not tamper-evident against a re-sealing
        // attacker, so a signed chain verified with no key is NOT authenticated.
        var sealedSigned = versions.some(function (v) { return v._seal && v._seal.signed; });
        return Promise.resolve({ valid: true, brokenAt: -1, signed: sigChecked, sealedSigned: sealedSigned, signaturesVerified: sigChecked, count: versions.length });
      }
      var v = versions[i], seal = v && v._seal;
      if (!seal) return Promise.resolve({ valid: false, brokenAt: i, reason: "unsealed version" });
      return sha256Hex(content(v)).then(function (ch) {
        if (ch !== seal.contentHash) return { valid: false, brokenAt: i, reason: "content altered" };
        if (seal.prevChainHash !== prevChain) return { valid: false, brokenAt: i, reason: "chain link broken" };
        return sha256Hex(prevChain + ch).then(function (chain) {
          if (chain !== seal.chainHash) return { valid: false, brokenAt: i, reason: "chain hash mismatch" };
          if (key && seal.signed) {
            return hmacHex(key, chain).then(function (sig) {
              if (sig !== seal.sig) return { valid: false, brokenAt: i, reason: "signature invalid", signed: true };
              sigChecked = true; prevChain = seal.chainHash; i++; return step();
            });
          }
          prevChain = seal.chainHash; i++; return step();
        });
      });
    }
    return step();
  }

  var api = { canonical: canonical, sha256Hex: sha256Hex, hmacHex: hmacHex, sealVersion: sealVersion, verifyHistory: verifyHistory };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LivingMonitor = api;
})(typeof window !== "undefined" ? window : globalThis);
