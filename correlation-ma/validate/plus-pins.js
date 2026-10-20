// SHA-256 over committed LF bytes of the extras evidence (same bytes as MANIFEST-plus.json).
// checks = 235030 was derived independently of the adapter from these two files
// (p17 archive analysis/expected_plus_replay_checks.py); the adapter refuses any other count.
window.AlmCorrPlusPins = {
  "files": [
    { "path": "validate/plus-corpus/reference-plus.json", "sha256": "0c14c06faa452796148703df6aa875739f5f4bbbf4eb9634479f479d5a77e73b", "bytes": 3786377 },
    { "path": "validate/plus-corpus/rscript-results.json", "sha256": "ba5b3bc29bc7bd67203101e45e08ac7cee5e72464f9ceac22a2031af39236ab1", "bytes": 174054 }
  ],
  "checks": 235030,
  "configurations": 324,
  "rule": "All 27 extras inputs (17 metadat inputs and 10 probes) under REML, PM, DL and FE x Wald z, HKSJ and HKSJ ad-hoc: every sensitivity cell against metafor 5.2-1, every shown string against the panel's numbers, leave-one-out through the button for every configuration (refusals for k < 3, k > 200 and FE x HKSJ), and the R results of the page's exported R scripts.",
  "referenceVersions": { "R": "4.6.0", "metafor": "5.2-1", "metadat": "1.6-0" }
};
