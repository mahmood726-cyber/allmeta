# allmeta vs the field — capability benchmark & next plan (2026-05-31)

Benchmark of allmeta (88 apps) against the tools reviewers actually use, to find the
highest-value gaps. Companion to `ROADMAP-best-in-world.md`. Reference tools:
**R** metafor / meta / netmeta / dmetar / robumeta / dosresmeta / RoBMA / EValue;
**RevMan / RevMan Web** (Cochrane); **CMA** (Comprehensive Meta-Analysis); **Stata** `meta`
suite; **MetaInsight** (web NMA); **JASP / jamovi (MAJOR)**; **GRADEpro / Covidence**.

## Where allmeta already leads or matches
- **Breadth**: pairwise, NMA (frequentist + Bayesian + component + dose-response +
  inconsistency), DTA (bivariate + HSROC), proportion/rare-event GLMM (UM.FS + exact
  CM.EL), multilevel/multivariate, IPD, meta-regression, cumulative/subgroup, GOSH,
  influence, TSA/sequential, RVE (CR2), Bayesian (MCMC, BMA-over-τ²-priors).
- **Correctness**: every quantitative output backed by a committed R-parity test —
  stronger provenance than CMA/RevMan (no public test suite) and matching metafor.
- **Offline-first, single-file, no telemetry, in-browser R (webR)** — unique combination;
  RevMan/CMA are installed/commercial, MetaInsight needs a server.
- **Prediction intervals** (t_{k-1}), Q-profile I²/τ² CIs, PET-PEESE, Copas, p-curve,
  Harbord/Peters/Begg/Egger — methodological depth beyond CMA/RevMan defaults.

## Confirmed gaps (verified absent 2026-05-31)
| Method | In metafor/etc.? | allmeta | Priority |
|---|---|---|---|
| **Trim-and-fill** (Duval-Tweedie L0) | `metafor::trimfill` | ✅ DONE | ~~P0~~ |
| **Selection models** (Vevea-Hedges weight-function) | `metafor::selmodel` | ✅ DONE | ~~P0~~ |
| **Meta-regression permutation test** | `metafor::permutest` | ✅ DONE | ~~P0~~ |
| **RoBMA** (robust Bayesian model-averaging) | `RoBMA` pkg | **MISSING** | P1 |
| **E-value** (unmeasured-confounding sensitivity) | `EValue` pkg | ✅ DONE (`43a9f5b`) | ~~P1~~ |
| **Classic dose-response MA** (Greenland-Longnecker linear) | `dosresmeta` | ✅ DONE (`68633e2`, new app) | ~~P1~~ |
| **Correlation MA** (Fisher-z pooling, ZCOR) | `metafor escalc(ZCOR)` | ✅ DONE (`2ab7f83`, new app) | ~~P1~~ |
| **Doi plot + LFK index** (Furuya-Kanamori) | `metawho`/`MetaXL` | **MISSING** | P2 |
| **Fragility index** for binary MA | (bespoke) | **MISSING** | P2 |
| **RMST meta-analysis** (pool restricted-mean-survival diffs) | `survRM2`+pool | **MISSING** | P2 |
| Meta-regression **prediction interval** (at x̄) | `metafor predict` | ✅ DONE | ~~P1~~ |

## Non-statistical gaps (vs RevMan / Covidence)
- **Unified project workspace** — apps share a `ma-studies-v1` bus, but there's no single
  save/restore of a whole review across apps. (Offline-first; a single-file project export
  would fit.) — P2.
- ✅ **Downloadable reproducible `.R` script** (`9fb74cc`) — webr-runner.buildReproScript; the
  'Verify in R' modal offers a one-click .R; round-trip-verified (runs in metafor → matches ma-core ~1e-7).

## Recommended next plan (prioritised)

### P0 — close the glaring *standard* gaps ✅ DONE 2026-05-31
1. ✅ **Trim-and-fill** (`d159b9d`, shared/trimfill.js, in funnel-plot) — Duval-Tweedie L0 & R0 estimators + imputed-study funnel overlay.
   Add to `funnel-plot` (or `pubbias-tests`). Oracle: `metafor::trimfill` (installed).
   Disclose "sensitivity-only" per advanced-stats.md. *Est: 1 session.*
2. ✅ **Vevea-Hedges selection models** (`67b3afe`, shared/selmodel.js, in pubbias-tests) — 3-parameter & step weight-function models for
   publication bias, the modern complement to Copas/PET-PEESE. Oracle: `metafor::selmodel`.
   *Est: 1–2 sessions (likelihood + optimisation).*
3. ✅ **Meta-regression: permutation test + PI-at-mean** (`8ed7f33`+`f02ccb5`, shared/permutest.js + ma-core PI) — finish meta-regression: add the
   `permutest`-style permutation p-value (robust to few studies) and a prediction interval
   at the mean covariate. Oracle: `metafor::rma(mods=) |> permutest()/predict()`.
   *Est: 1 session.*

### P1 — field-leading / high-demand additions
4. **RoBMA** — robust Bayesian model-averaging across {effect present/absent} ×
   {homo/hetero} × {pub-bias yes/no}; reports inclusion BFs + model-averaged estimate.
   No web tool has it. Oracle: `RoBMA` R pkg (install). *Est: 2–3 sessions.*
5. ✅ **E-value** (DONE `43a9f5b`) — VanderWeele-Ding sensitivity of a pooled RR/OR/HR to unmeasured
   confounding; one of the most-requested observational-MA additions. Oracle: `EValue`.
   *Est: 0.5 session (closed-form).* 
6. ✅ **Classic dose-response MA** (DONE `68633e2`, new app dose-response-ma; linear two-stage verified vs dosresmeta ~1e-6) — Greenland-Longnecker two-stage + restricted cubic
   splines, distinct from the existing *network* dose-response. Oracle: `dosresmeta`.
   *Est: 2 sessions.*
7. ✅ **Correlation meta-analysis** (DONE `2ab7f83`, new app) — dedicated Fisher-z pooling app (ZCOR), with the n−3
   variance and back-transform. Oracle: `metafor escalc(measure="ZCOR") |> rma`.
   *Est: 0.5 session (reuses ma-core).*
8. ✅ **Downloadable reproducible `.R`** (DONE `9fb74cc`) — universal "Download .R" from every pooling app
   (build on `webr-runner._buildRScript`), + a local round-trip verifier. *Est: 1 session.*

### P2 — completeness & UX
9. **Doi plot + LFK index** (Furuya-Kanamori small-study plot) — add to `funnel-plot`.
10. **Fragility index** for binary outcome MA (advanced-stats.md notes the one-arm rule).
11. **RMST meta-analysis** — pool restricted-mean-survival-time differences (ties to
    `km-reconstructor`).
12. **Cross-app project save/restore** — single-file workspace export across the bus.

## Suggested immediate next build
**P0-1 Trim-and-fill** — the single most glaring standard gap (every funnel discussion
expects it), closed-form-ish, a clean `metafor::trimfill` oracle, and a natural home in
the existing `funnel-plot` app. Recommended as the next session's deliverable.


## Status of the remaining hard items (2026-06-01)
- **Classic dose-response MA (P1-6): ✅ RESOLVED & SHIPPED (`68633e2`).** The covariance was
  correct; the bug was a GLOBAL design type vs alcohol_cvd's PER-STUDY mix (4 cc + 2 ci).
  The off-diagonal "mismatch" was the cc-vs-ci s0/si formula (studies 5-6 are ci). Fixed to
  read per-study type; verified vs dosresmeta(method="reml") to ~1e-6 (slope/SE/τ², all 6
  per-study slopes). New dose-response-ma app.
- **RoBMA (P1-4): RECOMMEND R-DEEP-LINK, not in-browser.** RoBMA model-averages over ~12-36
  models (effect × heterogeneity × publication-bias × priors) via MCMC + bridge sampling for
  each marginal likelihood. Faithfully reproducing its inclusion Bayes factors in browser JS
  would require a full MCMC + bridge-sampling stack with no way to verify to metafor-grade
  tolerance. Best served by the existing webR path + downloadable R (point users to the RoBMA
  R package) rather than shipping an unverifiable approximation.
- **P2 remaining:** fragility index (`fragility` pkg oracle — verifiable, moderate), RMST MA
  (trivial ma-core pool of RMST diffs — low marginal value over workbench), Doi/LFK plot (NO
  clean R oracle — would be the one method without metafor-grade verification), project save.
