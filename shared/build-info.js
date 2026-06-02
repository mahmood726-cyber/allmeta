/**
 * Build identity for allmeta — used to stamp TruthCert receipts and JSON
 * exports with the exact code that produced them.
 *
 * Regenerate with: python scripts/regen_build_info.py
 *
 * Why this is signed: when receipts get audited months later, the reviewer
 * needs to know which code path produced the numbers. Without a SHA, you
 * can't replay a v11.0 calculation on a v11.4 codebase and expect a match —
 * estimator defaults drift, edge-case handling improves, prior conventions
 * change. The SHA pins the receipt to its provenance.
 *
 * Field meanings:
 *   - app:     always "allmeta" (constant)
 *   - version: semver-ish tag (matches CITATION.cff)
 *   - sha:     full git commit SHA at build time
 *   - shortSha: 7-char prefix for display
 *   - builtAt: ISO-8601 UTC timestamp when this file was regenerated
 */
(function (global) {
  'use strict';
  var info = {
    app: "allmeta",
    version: "v1.0.0",
    sha: "83c278b3e85de7ea3a360a5c1ddd3aa3a08d7565",
    shortSha: "83c278b",
    builtAt: "2026-06-02T20:34:26Z",
    url: "https://mahmood726-cyber.github.io/allmeta/"
  };
  global.AlmBuildInfo = info;
  if (typeof module !== 'undefined' && module.exports) module.exports = info;
})(typeof window !== 'undefined' ? window : globalThis);
