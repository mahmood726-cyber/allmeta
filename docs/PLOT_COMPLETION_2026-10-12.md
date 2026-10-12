# Remaining plot repairs — 12 October 2026

Follow-up to PRs #93/#96 and issue #95. This report distinguishes working rendering from statistical or clinical validation.

## Repairs in this repository

**IPD Meta-Pro:** Persistent Baujat and leave-one-out canvases and the influence table now use the actual study effects, saved estimator (FE, DL, REML, PM, SJ, HE, ML), confidence level and HKSJ setting. Coordinate/interval checks include independent fixed-effect arithmetic and all seven estimator selections. Repainting uses cached diagnostics and does not change fitted results or settings. Unsupported or insufficient data produce an explicit prerequisite.

**Net Heat:** A new button runs actual `netmeta` in browser-side R. It supports continuous mean differences and binary log odds ratios; it does not invent survival conversions. Disconnected data require explicit component selection, with excluded contrasts disclosed. R warnings for insufficient designs remain visible instead of being replaced with a fake matrix. Valid synthetic four-treatment data produced real Net Heat output in both screen sizes. The WebR device is initialised before font measurement, its intentionally blank setup page is discarded, and the returned graphic is composited on white so labels remain readable in dark mode. First use downloads R packages; input records are processed locally.

**Legacy scope/clustering:** The large unreachable experimental block formerly nested inside kMeans is retained as inert text under `IPD-Meta-Pro/legacy/`. It is not activated by moving braces. A separate tested seeded k-means implementation supplies descriptive, data-derived covariate plots, with explicit non-causal labels, numeric guards, deterministic restarts and no mutation of patient records or fitted results. The source modules are embedded in the single-file app for delivery.

**WebR Studio:** Replaced plotting-command regex detection and ignored graphics output with full `captureR` image-page rendering. Boxplot/barplot, multiple pages, replacement runs and error cleanup are tested. All captured resources are released.

**DTA R/Shiny:** Replaced four static DataTables-dependent metric tables with native Shiny tables, eliminating the observed missing DataTables runtime error. Calculations unchanged. Three hub entries now open their actual apps rather than article pages (AdaptSim, Al-Mizan, CardioOracle).

## Executed evidence

Actions **38202121113**, compact artifact **11725404413**:
- `remaining-plots.spec.mjs` and `remaining-runtime-plots.spec.mjs`: **22 passed, zero failed/skipped/flaky**, Chromium 1280px/390px, 144.5 seconds.
- Existing catalogue/flagship/NMA Pro suites: **148 passed, zero failed/skipped/flaky**, 104.2 seconds.
- Total in that run: **170 passes**. The R tests exercise 22 chart panels per screen width: nine Mean Single Group, seven Annualised Plot, six DTA, plus four DTA tables. These are rendering checks, not independent validation of all R analyses.
- Subsequent dark-mode Net Heat contrast repair: Actions **38202840665**, both Net Heat cases passed again, including opaque white pixel checks and real R output.

The native JavaScript checks retain exact data-preservation assertions. Net Heat uses a separate deliberately synthetic eligible network; the built-in antidepressant example correctly remains ineligible for this diagnostic after component selection because its designs are insufficient. No patient data was used in testing.

## Previously excluded linked apps

Read-only live workflow **38202314230** passed six viewport/app cases for AdaptSim, Al-Mizan and CardioSynth. AdaptSim's five plots and Al-Mizan's three plots were exercised. CardioSynth's primary/cumulative plots work; its five-study example correctly shows the existing ten-study prerequisite for a funnel plot. Its funnel renderer was separately checked with 12 synthetic studies without changing application state (not a full ingestion test).

CardioOracle's separate PR #1 fixes a lexical model-scope guard. Six configuration/viewport checks cover genuine cardiorenal/CAD calibration and ROC plots and the explicit absence of held-out predictions in AF. Screenr is repaired and released in its own repository; its release record is separate.

WebR Validator and the NICE reference guide do not expose the analysis chart workflows being repaired; they are not counted as plot passes.

## Limits and operation

A chart is shown only when its method has valid inputs. An explicit missing-data or ineligible-design message is intentional, not a successful computation. Browser tests do not establish universal statistical validity, clinical validity, every optional workflow, or compatibility with every browser/device. Older lossy project files cannot regain previously discarded data. Optional clinical/analysis claims outside these rendering paths have not been certified.

Temporary write-enabled workflows and one-time patch builders were removed. Regression `.spec.mjs` files remain discoverable by normal Playwright CI.

Reproduce from `tests/playwright` after dependency and Chromium installation:

```sh
npx playwright test remaining-plots.spec.mjs remaining-runtime-plots.spec.mjs --workers=2
npx playwright test flagship-plot-rendering.spec.mjs nma-pro-session-plots.spec.mjs catalog-svg-plots.spec.mjs --workers=3
```
