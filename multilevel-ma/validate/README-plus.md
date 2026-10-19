# Validate the extras in R

This panel checks the separate intercept-only three-level REML extras: CR2 coefficient inference using study clusters, Satterthwaite degrees of freedom and 95% confidence intervals, and 95% profile-likelihood intervals and plotted coordinates for both variance components. The pinned replay checks the current numerical implementation, displayed cells, labels, exported JSON, and plot geometry and painted styles against a clean render in the same browser. It does not resist CSS deliberately injected into the page. It is not an assessment of whether a pooled effect is scientifically meaningful for a particular dataset.

The original estimator and its 528-check contract are separate. `#alm-plus` contains all extras. The original adapter's rendering check is confined to `#summary`; its explicit `#alm-plus` exclusion (the only change to an existing validate file) preserves that scope and the 528-check count. The panel follows the `limit-ma` and `proportion-ma` plus pattern (`plus-adapter.js`, `MANIFEST-plus.json`, `plus-pins.js`, `README-plus.md`) and uses the shared `AlmValidate.mount` interface without changing shared code. Its two buttons are renamed so that they do not share accessible names with the original panel.

## Corpus and methods

`dataset-disposition-plus.csv` and `plus-corpus/inventory-plus.json` retain a decision and reason for all 114 datasets in metadat 1.6-0. They come from the paper's local reproducibility archive, `data/dataset-disposition.csv`. Forty-one datasets supply 44 configurations, including four configurations from dat.lim2014. All original finite-row inputs are retained; exclusions and omitted source rows are recorded in each reference's source metadata. There are no exclusions based on the JavaScript comparison result. Diagonal sampling covariance and an intercept-only reduction are used consistently; overlapping endpoints, phylogeny, spatial structure and temporal sampling covariances are not reconstructed.

Native references use R 4.6.0, metafor 5.2-1, metadat 1.6-0, clubSandwich 0.7.0 and jsonlite 2.0.0. Profile references use `metafor::profile.rma.mv` (nine marks including zero) and `confint.rma.mv`, with the other component re-estimated. Initial `rma.mv` fits use REML and nlminb `rel.tol=1e-10`; Maire uses BFGS `reltol=1e-14`. Confidence-limit root tolerance is `1e-8`, maximum 1,000 iterations. Failed profile roots are retried with Nelder–Mead `reltol=1e-12`, maximum 10,000 iterations; the configuration's control and warnings are retained.

For the p-value tolerance, the native R script refines the variance estimates with the analytic REML score, using a numerical score Jacobian and at most 40 Newton iterations. Scores are scaled by `max(mean(v),var(y),1e-12)`; the stopping target is `1e-11` and the final score check is `1e-7`. `clubSandwich::coef_test(vcov='CR2', test='Satterthwaite')` and `conf_int` then operate on an `rma.mv` object conditional on these R-refined variance estimates. The exact conditioning values are stored in `cr2Sigma2`; they are not JavaScript output. This step avoids making the tight p-value check depend on small differences between optimiser stopping points. It does not imply that one implementation is more accurate than R.

The browser engine independently profiles the two-component restricted likelihood using analytic scores: a logarithmic bracketing grid, up to 70 bisections per score root, a scale-relative `1e-13` interval target, and explicit zero boundaries. Profile confidence limits use up to 75 bisections and `1e-11` scale-relative interval width. CR2 uses the symmetric adjustment formed from the Cholesky factor of the fitted marginal covariance and an inverse square root; cyclic Jacobi eigendecomposition allows at most 100 sweeps. Student t probabilities use a continued fraction with `2e-15` convergence, and critical values use 90 bisections.

Closed-form CR2 calculations conditional on the R variance estimates are checked at `1e-9` relative to `max(1,abs(R))`. Fitted quantities and profile values are checked at `1e-6` on that scale. All p-values use `1e-9` absolute error. Counts, quantity labels and refusal text are exact. The numerical script makes 59 checks per configuration, 2,596 total. Browser replay has 165 checks per configuration plus 12 checks for four refusals, 7,272 total. These are expected counts; see the run reports for actual outcomes.

Plot checks compare effective screen coordinates (within 0.05 CSS pixels), computed paint, opacity and text with a clean same-browser SVG render. Scale marks must first match R. The clean render uses those validated marks so decimal rounding at a tick boundary cannot make a correct display fail. Axis labels are checked because the scale is determined by the validated marks. The nine-point line is a sampled profile, not a continuous optimisation trace.

## Live and offline tiers

Live webR uses the existing same-origin webR 0.5.5 / metafor 4.8-0 bundle to check the current profile coordinates, variance estimates, confidence limits and log-likelihood. It does not claim a live clubSandwich check: that package is absent from the pinned webR repository. The full offline replay checks CR2 against the native R references. An unavailable live package or failed R optimisation must be reported as a refusal or failure, never as a pass.

`MANIFEST-plus.json` describes the corpus. `plus-pins.js` independently holds its SHA-256 values. New JSON corpus files are pinned on UTF-8 LF bytes. The shared widget verifies the bytes before parsing and caches them for subsequent offline replays; on `file:` URLs it offers file selection. No third-party network request is needed for validation. The corpus generation script refuses to pin an incomplete or unrefined reference set.

## Reproduce

From `multilevel-ma/`, with R 4.6.0 and the packages above installed, run:

```powershell
# Optional: an additional existing library holding clubSandwich, appended after the default libraries.
$env:ALM_EXISTING_R_LIB='<path to a library containing clubSandwich>'
Rscript validate/generate-plus.R
Rscript validate/refine-reference-plus.R
Copy-Item validate/plus-corpus/refined-reference-plus.json validate/plus-corpus/reference-plus.json
node validate/pin-plus.mjs
node validate/compare-plus.mjs
```

The generator resumes completed configurations. To regenerate from scratch, rename the generated reference file before running it. Every R script prints `.libPaths()` and package versions. No package was installed for the pinned references; clubSandwich 0.7.0 came from an existing library appended after the prescribed ones.

Browser and engine tests are ordinary Playwright tests in `hub/shared/tests/multilevel-ma-plus.spec.mjs` (run from `hub/shared/tests` with `npx playwright test multilevel-ma-plus.spec.mjs --workers=1`). They cover the 2,596 engine checks in Node, the original 528-check replay, the 7,272-check extras replay, the clean table and plots at 1280 px and 375 px, a planted negative for every numerical, displayed and exported quantity, the display/export schema, the geometry, paint and axis-label checks of each plot, all refusals, stale-input invalidation, keyboard use and changed reference bytes. The live webR test is tagged `@slow`. Setting `ALM_PLUS_EVIDENCE=1` writes the replay and live results to `validate/plus-evidence/`.

## Recorded results

`numerical-plus.json`: 2,596/2,596 engine checks. `plus-evidence/replay-plus.json`: original replay 528/528 and extras replay 7,272/7,272 in Chromium. `plus-evidence/live-plus.json`: the live webR 0.5.5 / metafor 4.8-0 tier (43 quantities on the built-in example).
