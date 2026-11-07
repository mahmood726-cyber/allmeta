/**
 * Build identity for allmeta — used to stamp TruthCert receipts and JSON
 * exports with the exact code that produced them.
 *
 * Written by scripts/regen_build_info.py. pages.yml stamps the deployed copy
 * with the commit it serves. The copy in git holds the null SHA and the epoch
 * because a commit cannot contain its own SHA.
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
 *   - sha:     full git commit SHA deployed; all zeros when not deployed
 *   - shortSha: 7-char prefix for display
 *   - builtAt: ISO-8601 UTC deploy time; the epoch when not deployed
 */
(function (global) {
  'use strict';
  var info = {
    app: "allmeta",
    version: "v1.8.0",
    sha: "0000000000000000000000000000000000000000",
    shortSha: "0000000",
    builtAt: "1970-01-01T00:00:00Z",
    url: "https://mahmood726-cyber.github.io/allmeta/"
  };
  global.AlmBuildInfo = info;
  if (typeof module !== 'undefined' && module.exports) module.exports = info;
})(typeof window !== 'undefined' ? window : globalThis);
