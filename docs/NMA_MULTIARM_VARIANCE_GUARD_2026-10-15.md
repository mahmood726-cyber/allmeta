# NMA multi-arm variance preservation — 15 October 2026

## Status and provenance

A bounded engine correction and nine new browser regression cases are committed on `fix/nma-multiarm-variance-guard-20261015`, based on main `e749e98871dd2665b71e99cc998ac1ff8c50effe`. No merge or deployment is authorised by this repair task. GitHub Actions results must be recorded separately; the local checks below are not browser-CI passes or fresh R executions.

The complete deployed Pages artifact was obtained through the normal GitHub connector: run 38810267687, artifact 12007782752, SHA-256 `3da1c93ccbd3ca7bc567004a9ae224dae1bbb795757ffdcfcb32c9cf37d70116`. Original `shared/nma-multiarm-v1.js` Git blob `998c5fad8af806405e45ff1a7e8e3e2d92dd44f3` was checked against GitHub. Candidate blob `b5dde5ef10d82076dba027a0ec09c6e59b4b3ae6` was independently matched to the committed file. These are actual application bytes, not a synthetic scaffold.

## NMA-VAR-01: nonnegative inferred arm variances do not establish compatibility

The engine supports independent treatment arms, with correlation between contrasts sharing an arm. Its recovered arm variances must satisfy `variance(i,j) = armVariance(i) + armVariance(j)` for **every** within-trial contrast. With four or more arms this is an overdetermined system. The old validation checked complete comparisons, consistent effects and nonnegative recovered arm variances, but did not check reconstruction of the supplied variances. `buildStudies()` then silently replaced an incompatible variance structure by an independent-arm projection.

### Reproducible four-arm input

Use one study, arms A/B/C/D, arm effects 0/0.3/0.6/0.9. Provide all six contrasts in the app's treatment2-minus-treatment1 convention:

| Contrast | Effect | Variance | SE |
|---|---:|---:|---:|
| A to B | 0.3 | 0.04 | 0.2 |
| A to C | 0.6 | 0.04 | 0.2 |
| A to D | 0.9 | 0.04 | 0.2 |
| B to C | 0.3 | 0.04 | 0.2 |
| B to D | 0.6 | 0.04 | 0.2 |
| C to D | 0.3 | 0.10 | sqrt(0.10) |

The original exact Node engine accepts this input and infers arm variances 0.01/0.01/0.04/0.04. All are nonnegative, but the inferred A–B variance becomes 0.02 instead of 0.04. The resulting B-minus-A SE is **0.1414213562 instead of 0.20** (29.29% narrower). For the same effect 0.3, the supplied normal interval is **[-0.0919928, 0.6919928]**, whereas the original projected fitted interval is **[0.0228192, 0.5771808]**. This constructed example changes whether the interval includes zero without changing the estimate.

This does NOT establish an error in a published study, nor a corrected complete NMA. The input need not be intrinsically invalid: the baseline-contrast covariance `[[.04,.02,.02],[.02,.04,-.01],[.02,-.01,.04]]` is positive definite (NumPy eigenvalues approximately 0.00627719, 0.05, 0.06372281) and reproduces all six variances. It can represent correlated-arm data, which this independent-arm engine does not support. Refusal, not an invented replacement estimate, is the correct bounded response.

## Correction

Before either common-effect or random-effects fitting, compare every supplied variance with the sum of recovered arm variances. Refuse the entire network if any residual exceeds `1e-8 * max(within-study contrast variances)`. The error identifies the study, affected pair, supplied and reconstructed variances, and advises checking SE precision or using a correlated-arm model. No study is dropped. The caller's input is unchanged.

The new threshold is a scale-relative numerical acceptance check, not a clinically acceptable discrepancy or a promise that rounded SEs must pass. Existing effect-consistency thresholds, estimators, pooling arithmetic, optimisers, corpus references and comparison tolerances are unchanged. This is an explicit independent-arm support boundary; it is NOT a claim that all current netmeta configurations reject the same input.

The existing NMA page already clears league, reference, ranking and heterogeneity results when the engine refuses; the new tests exercise that route and recovery. The network topology graph and saved input state may remain available; those are not fitted results. League export must refuse incompatible covariance. JSON import must not bypass the guard.

## Executed local evidence

- Candidate Node syntax check passed.
- **16 focused Node regression groups passed**, including original-defect reproduction, refusal through both entrypoints, no partial-study fit, data immutability, orientation/reference/order/scale checks, and numerical allowance boundaries.
- **250 seeded valid independent-arm trials**, four through eight arms, preserved **4,000** supplied contrast SEs to 1e-10. Their original/candidate analysis objects were identical.
- Exact existing NMA corpus adapter: **410/410 archived-reference checks passed**, 26 analyses, 24 fitted analyses and two matching expected refusals. The adapter's original quantity-specific 1e-9 tolerances were not modified. These are family-maximum/refusal checks, NOT 410 independent datasets. Stored references identify R 4.6.0, netmeta 3.7-0 and meta 8.5-0. No new R process ran.
- All 12 previously accepted datasets among the 13 stored datasets, and all 11 built-in rounded examples, retained identical original/candidate analysis objects in the separately executed classic-CI comparison.
- An actual local Chromium navigation to the complete app was attempted but blocked before loading with `ERR_BLOCKED_BY_ADMINISTRATOR`. No local end-to-end browser success is claimed.

Nine committed Playwright tests cover visible refusal/old-result clearance, league-export refusal, valid-data recovery and exported numbers, JSON upload, model/CI controls, invariances, seeded SE preservation, allowance boundaries, and the existing 410-check corpus in the page. Normal read-only GitHub CI must execute these and the relevant wider suites before any merge.

## Remaining gates

This does not implement a correlated-arm NMA, assess arbitrary networks for every numerical pathology, repair direct-parser silent row exclusions, certify rank simulation or stale validation receipts, or complete mobile/accessibility/security review. Low-level `buildStudies()` is not itself a validated public fit. Full app/portfolio completion remains false. Existing unrelated PRs are preserved.

## Primary methodological source

Rücker G, Schwarzer G. *Trials and triangles: Network meta-analysis of multi-arm trials with correlated arms*. Research Synthesis Methods (2025), DOI: [10.1017/rsm.2025.10026](https://doi.org/10.1017/rsm.2025.10026). Independent-arm contrast variances are sums of arm variances; correlated-arm methods require a different covariance model. Current netmeta supports additional models/options, so matching the supported model matters more than claiming generic equivalence to R.
