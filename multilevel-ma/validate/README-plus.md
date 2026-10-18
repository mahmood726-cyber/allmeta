# Validate the extras in R

This panel checks the separate intercept-only three-level REML extras: CR2 coefficient inference using study clusters, Satterthwaite degrees of freedom and 95% confidence intervals, and 95% profile-likelihood intervals and plotted coordinates for both variance components. The pinned replay checks the current numerical implementation, displayed cells, labels, exported JSON, and plot geometry and painted styles against a clean render in the same browser. It does not resist CSS deliberately injected into the page. It is not an assessment of whether a pooled effect is scientifically meaningful for a particular dataset.

The original estimator and its 528-check contract are separate. `#alm-plus` contains all extras. The original adapter in the supplied base has no whole-page text contract: its rendering check is confined to `#summary`; its explicit extras exclusion preserves that scope and check count. The `limit-ma/validate/plus-adapter.js`, `MANIFEST-plus.json`, `plus-pins.js` and `README-plus.md` examples named in the task were absent at base `7966530de875d22253f0557c7b447ed9d917685d`; fetching main was unavailable. This panel uses the available shared `AlmValidate.mount` interface without changing shared code.

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

From `multilevel-ma/`, set the environment and run:

```powershell
$env:R_LIBS_USER='C:/Users/User/allmeta-offload/Rlib_dta'
$env:R_LIBS='C:/Users/User/allmeta-offload/Rlib_extra'
$env:R_ENVIRON_USER='NUL'
# Existing read-only library fallback, if needed (no installation):
$env:ALM_EXISTING_R_LIB='C:/Users/User/mh-offload/Rlibs'
& C:/Users/User/R/R-4.6.0/bin/Rscript.exe validate/generate-plus.R
& C:/Users/User/R/R-4.6.0/bin/Rscript.exe validate/refine-reference-plus.R
Copy-Item validate/plus-corpus/refined-reference-plus.json validate/plus-corpus/reference-plus.json
node validate/pin-plus.mjs
node validate/compare-plus.mjs
```

The generator resumes completed configurations. To regenerate from scratch, rename the generated reference file before running it. Every R script prints `.libPaths()` and package versions. No package installation occurred in this task; the existing clubSandwich library is appended after the prescribed libraries.

Serve the repository root on localhost:8088, then run the tests from the repository root:

```powershell
python -m http.server 8088 --bind 127.0.0.1
node --test --test-isolation=none hub/shared/tests/multilevel-ma-plus.spec.mjs
$env:REPLAY_STAGE='after'
node hub/shared/tests/multilevel-ma-plus-baseline.spec.mjs
```

The tests use Playwright directly with `channel: 'msedge'`. They resolve `@playwright/test` first, then `PLAYWRIGHT_CORE_PATH` or the existing local Playwright Core installation. `ALM_ENGINE_ONLY=1` explicitly skips the browser suite; that is not a successful browser verification. `original-numerical-plus.mjs` separately checks the original 440 numerical quantities, excluding its 88 browser checks.
