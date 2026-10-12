# Multilevel validation

Tier 1 fits the currently parsed textarea rows using same-origin webR 0.5.5 and SHA-256-pinned metafor 4.8-0. The page reruns its own Fit/render path before comparison; edits need not first be submitted with Fit. Seven REML quantities use `abs(App-R)/max(1,abs(R)) <= 1e-6`. R/webR/metafor versions are reported, including the paper's metafor 5.2-1. User cluster labels map bijectively to numeric R groups; row IDs are unique. No package installation from external hosts occurs.

Tier 2 uses the archived `data/corpus.json` and final `results/reference.json` from [multilevel-reproducible](https://github.com/mahmood726-cyber/multilevel-reproducible). MANIFEST.json records source-byte hashes and compact JSON hashes. Compact JSON is UTF-8 without BOM, with LF endings; `.gitattributes` disables text conversion for these files. The adapter embeds the same pins. Source configuration keys, row IDs, group memberships and full-precision numbers are preserved; CSV-safe labels are used only for page input.

The 44 configurations have twelve checks each (528 total): seven REML quantities at relative tolerance 1e-6; three MoM variance shares against the closed form at 1e-9; exact row count and historical rounded-value rendering contract. The rendering contract follows `bench/run-app.mjs`: all seven rounded REML values must occur in the REML table. It does not assert every cell or export. Variance shares are conditional on freshly calculated MoM components, not an MoM-versus-R estimator comparison. Every configuration reruns the current page engine and DOM. No saved app fit is substituted. Inputs and URL are restored in a finally block.

After HTTP preparation, replay works from verified memory offline. On file URLs, select both corpus JSON files. Missing/modified files fail closed. Live R needs the local bundle/packages available. The shared widget's R re-execution link opens the archive's one-command instructions; no hosted Actions run is claimed.

| Item | Static or dynamic | Source |
|---|---|---|
| Inputs and R references | Static source records | Archive data/results, SHA-256-pinned |
| 44 configurations, 12 checks, tolerances | Static protocol | Archive bench/compare.py |
| App fits, shares, UI, differences, verdicts | Dynamic | Current page parser, Fit and DOM |
| Live R values and versions | Dynamic | Local webR session |

Playwright: `validate-multilevel-ma.spec.mjs` and the multilevel cases in `validate-integration.spec.mjs`. The common fixture records every request and rejects off-origin HTTP requests. Coverage includes corpus replay, live built-in and edited inputs, hash refusal, insufficient rows, warm offline replay and file-picker replay. The standard Playwright configuration discovers all `*.spec.mjs` files.
