# Influence diagnostics validation

The in-page **Validate this analysis in R** button refits the current valid rows in self-hosted webR 0.5.5 with metafor **4.8-0**. The paper reference used R **4.6.0**, metafor **5.2-1**, and metadat **1.6-0**. Both metafor versions are shown; differences beyond tolerance fail. Nothing is sent off-origin. Package archives are pinned by the existing local webR manifest.

Live validation compares the full REML fit (mean, SE, tau-squared, Q, df, raw weights and sum), every LOO mean/SE/95% CI, externally studentized residual, DFFITS, Cook's D, covariance ratio, hat, weight percentage, influential flag, REML Baujat x/y, and FE radial x/z/residual/slope. The table contains every compared scalar. Flags are type-checked Booleans, then losslessly encoded as 0/1 with zero tolerance for the unchanged shared widget. Input edits invalidate a live result. Invalid lines are refused rather than silently dropped.

**Re-run full validation** executes the current page on all **142 configurations** and compares **164,802/164,802** primary checks against SHA-256-pinned R references. No archived app output is used. Checks include 17 per effect row and 12 per configuration (including five UI checks). Inputs and calculated plots are restored; the URL-write guard spans the replay and restoration. This comparison includes all 9,594 effect rows and does not subset large configurations.

The corpus arrays carry unique configuration IDs. Both sets must contain exactly 142 IDs, with identical membership. Every required record and vector is checked before indexing. Missing fields, wrong types, nonfinite numbers, invalid source rows and altered bytes fail closed. Explicit null may represent an undefined deletion quantity only; missing properties never mean null. The source corpus has no null primary numerical values.

Differences are `abs(App-R)/max(1,abs(R))`. REML-dependent quantities use **1e-6**; closed-form Q/df and FE radial quantities use **1e-9**; flags and UI counts require exact agreement. The before-fix comparison contained 19,188 additional DL Baujat controls, explaining its different denominator (155,797/183,990). The primary after-fix comparison uses REML Baujat only.

`MANIFEST.json` pins LF JSON bytes (the existing `**/validate/corpus/*.json text eol=lf` rule preserves these in Git). Source-file hashes identify the original reference run. After preparation, verified corpus data can replay without network requests. On `file://`, select both JSON files from `validate/corpus/`.

The companion `influence-reproducible` archive includes `validate.R`. From its root, with R packages metafor 5.2-1, metadat 1.6-0, jsonlite and digest installed, run:

```sh
Rscript validate.R
```

It verifies input hashes before computing, refits every configuration using actual metafor calls, prints the per-quantity table and `164802/164802 checks pass`, writes `outputs/validate_R_table.csv`, and exits nonzero on failure. Browser row-count and plot-presence checks replay the archived app evidence; they are explicitly labelled. See the archive README for accelerated-BLAS provenance and exact-fit cache parity evidence. The archive is prepared locally; no archive publication URL or DOI is claimed.

Scope: intercept-only REML, no estimator selector or HKSJ; no comparisons of unexposed full-model p/I2, LOO p/I2/Q, tau2.del/QE.del, or GOSH (a navigation link). Some inputs deliberately ignore dependence to test arithmetic, not clinical conclusions.

| Item | Static or dynamic | Evidence |
|---|---|---|
| Corpus, R outputs, versions, tolerances and expected count | Static evidence/contract | Manifest, source scripts and recorded run |
| Page estimates, per-value comparisons and pass counts | Dynamic | Actual page computations on each input |
| Live reference estimates | Dynamic | Current self-hosted R session |
| Input and result restoration | Dynamic | Replay finally block and Playwright contract |

Tests: `hub/shared/tests/validate-influence.spec.mjs` and influence registrations in `validate-integration.spec.mjs`, using the standard configuration and relative URLs. No shared comparison-helper or CSP changes are required.
