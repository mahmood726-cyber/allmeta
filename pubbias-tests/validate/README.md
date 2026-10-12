# Publication-bias validation

The shared widget offers live R validation of the **current textarea and format**,
and offline replay of all 152 archived configurations through the shipped page
engine. Selection is experimental and excluded; Thompson-Sharp was not compared.

Live R uses the same-origin, SHA-256-pinned webR 0.5.5 bundle, metafor 4.8-0 and
meta 8.3-0. The paper used metafor 5.2-1 and meta 8.5-0. Actual R/package versions
appear in the panel. Egger uses `regtest(rma(..., method="REML"), model="lm")`,
Begg uses `ranktest(yi, vi)`, and trim-and-fill uses L0/REML. Binary data additionally
run `metabias(metabin(..., sm="OR", method="Inverse", allstudies=TRUE),
method.bias="Peters"/"Harbord", k.min=3)` on raw counts.

The comparison is `abs(App-R)/max(1,abs(R))`, except p-values use absolute
difference. Closed-form tolerance is 1e-9; trim-and-fill est/se/tau2 use 1e-6;
side is exact. Refusals only pass when both engines refuse and neither is
unavailable. Live engine/R errors refuse validation rather than fabricate rows.

Tier 2 reproduces **2,107/2,113** checks. All six Table 2 failures remain visible:

- dat.baker2009/OR:Placebo:Salmeterol | Egger | refusal
- dat.baker2009/OR:Placebo:Salmeterol | Peters | refusal
- dat.baker2009/OR:Placebo:Salmeterol | Harbord | refusal
- dat.mccurdy2020 | Begg | tau
- dat.mccurdy2020 | Begg | p
- dat.mccurdy2020 | Trim-and-fill | refusal

The first three are R parent-REML convergence refusals. McCurdy Begg differences
arise from variance-to-SE round-trip ties; its trim-and-fill reference was
unavailable after the paper's bounded attempt. It is never a matched refusal.
Configurations below the page's five-study minimum remain engine checks only.

`MANIFEST.json` records source-byte hashes from the publication archive, compact
file hashes, package provenance and the complete Table 2 exception descriptions.
`corpus.json` preserves all data fields; `reference.json` retains versions and
only the five compared methods. JSON files are UTF-8/LF and `.gitattributes`
disables text conversion. Adapter pins match the manifest. Rebuild by parsing
`data/corpus.json` and `results/reference.json` from the archive, filtering out
`egger_rma` and `selection`, then serializing compact JSON plus a final LF;
update hashes in both manifest and adapter. Never insert saved app outputs.

HTTP preparation verifies both files; subsequent replay works offline without
requests. On file URLs, select those two files with the widget's picker. Automated
requests remain on the page origin; evidence links require a user click.

| Item | Static or dynamic | Evidence |
|---|---|---|
| Inputs, R references, six exception identities | Static measurements | Archive source hashes in MANIFEST |
| Counts and tolerances | Static comparison contract | Archive bench/compare.py and Table 2 |
| App values and replay verdicts | Dynamic | Page numerical functions called on every replay |
| Live R values and versions | Dynamic | Actual local webR session |

Tests: `hub/shared/tests/validate-pubbias-tests.spec.mjs` and shared integration/
framework specs, using their existing Playwright configuration and request audit.
