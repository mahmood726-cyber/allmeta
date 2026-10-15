# AllMeta: app-by-app verified excellence programme

**Started:** 14 October 2026. **Status:** in progress. **Scope:** 122 repository-hosted browser apps plus six catalog entries hosted elsewhere (repository README; validate count on each revision). **Policy:** *Never claim an app is numerically more accurate than a well-specified, converged, reference R implementation merely because it is browser-based.*

## What "best" means operationally

For each app, define its statistical estimand, comparator and supported domain **before** adding features. Comparison with R must fix the same effect direction, continuity correction, estimator, variance approximation, CI method, tau² convention, treatment coding, optimiser tolerance and missing-data rules. Publish both agreements and disagreements; refuse unsupported designs rather than silently substitute a simpler model.

An app is not "**verified**" merely because source examples run, screenshots render, or a static oracle JSON replays successfully. Actual app user flow and engine should run on diverse input against reference code (and, where possible, newly executed pinned R package versions). Specify the domain of parity and publish failures/skips.

**Gates, in order:**

1. **Correctness/clinical safety:** reject invalid data, absent denominators/units, bad designs, silent method substitutions, nonidentifiability, inappropriate certainty statements; test adversarial cases and numerical boundaries.
2. **Reference comparison:** compare to `metafor`/`meta` for pairwise, `netmeta`/`gemtc` for NMA, `mada` for DTA, `survival`/`coxme` for IPD survival, and suitable specialised R libraries elsewhere. Require pinned, reproducible cases including null effects, extremes, degeneracies and nonconvergence. R packages are not automatically free of bugs; divergences need an independent derivation, not a marketing claim.
3. **User workflow:** import real study formats, label all assumptions and interventions, provide understandable error correction, accessible/mobile controls and clear plot semantics; test common actions in a real browser.
4. **Reproducibility:** export unrounded machine-readable results and raw input, model settings, code version and methods; include rerunnable R reference where valid, and TruthCert/independent receipt where applicable. Avoid displaying unverifiable provenance as a badge of correctness.
5. **Performance/privacy:** benchmark realistic datasets and stress input in a local/offline browser with transparent baseline hardware; quantify time and memory. CDN-independent, private-by-default and usable without an account.
6. **Release gate:** focused tests, suite regressions, lint, manual methodological review, documented incompatibilities, and explicit owner approval before merging statistical changes.

**Proposed acceptance tiers:** *candidate fix* (code/targeted tests), *CI validated* (all required tests green), *R-parity verified* (R comparator executed for scope), *field reviewed* (independent statistical + user review). No app is certified merely by listing a feature.

## Working queue (one app per reviewable change set)

| Order | Application | Comparator | Immediate quality target | Current status |
|---|---|---|---|---|
| 1 | `effect-size-converter` | `metafor::escalc`, `cmicalc` | exact Hedges' g, valid t/F, no bogus HR/OR, precision, fail-closed input | Draft PR #111; focused checks in progress |
| 2 | `forest-plot` | `metafor::rma`, `meta::metagen` | reconcile estimator/CI/PI and plot/export with shared-core REML fix (#84) | queued; avoid conflicting with #84 |
| 3 | `heterogeneity` | `metafor::rma`, `confint` | Q/I²/tau² definitions, boundary cases, prediction and uncertainty | queued |
| 4 | `Pairwiseai` | `metafor`, `meta` | reconcile standalone REML (see #84 follow-ups), validate end-user bundle and exports | queued |
| 5 | `nma-pro-v2` | `netmeta`, `gemtc` | effect orientation, multi-arm covariance, rankings, inconsistency, missing comparisons | queued |
| 6 | `dta-sroc` | `mada` | zero-cell corrections, bivariate model identification and uncertainty | queued |
| 7 | `IPD-Meta-Pro` | `survival`, `metafor` and regression packages | correlated data, time-varying hazards, stratification and reproducible estimates | queued |
| 8 | `HTA` | `heemod`, `hesim`/independent implementations | advanced workflows, probabilistic analysis, numerical estimation | Existing open #101–#102; review/merge independently |

The queue is not a certification of capability. Additional apps follow based on material harm risk and model impact. Existing independently prepared changes should be reviewed and merged in dependency order; never overwrite open work.

## Issue tracking, release and disclosure

For each app, keep a code diff, pinned counterexamples, live browser reproduction, explicit regression tests, changes in previously exported results, and a limitations section. Published analyses affected by materially changed estimates should be rerun, with version-aware warnings as appropriate. A draft PR is **not deployed**, and GitHub Actions success is **not** independent methodological peer review.
