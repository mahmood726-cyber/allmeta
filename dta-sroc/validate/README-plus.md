# DTA meta-regression extras: validation scope

The second panel, **Validate the extras in R**, is separate from the original paper replay. The extras implement one numeric study-level covariate with intercept, REML, ML or fixed effects, continuity correction 0.5 (all/single/none), conditional summary sensitivity/specificity, 95% confidence/prediction regions, and disease probabilities after positive and negative tests at a chosen prevalence. Inputs are TP,FN,FP,TN,x; results are reported in the units of the supplied covariate (the fit itself uses the centred and scaled covariate; see **Raw-scale covariates**). Invalid inputs, uncorrected zero cells and unsuccessful fits are refused; previous results are cleared on input changes.

Reference data are loaded with **Load reference data**. Background corpus loading only appends options to a selector with a stable empty selection; it does not assign study inputs or fit automatically. This prevents delayed extras initialisation from invalidating an in-flight original live R check through the shared input fingerprint.

## Corpus and sources

`corpus/plus-reference.json` inventories all 114 installed metadat 1.6-0 dataset schemas and titles, including every candidate and its inclusion/exclusion reason. The two applicable diagnostic tables are dat.kearon1998 and dat.rivera2025. This is a schema/documentation audit, not a literature review. No external study identifiers or dates are inferred from names.

Kearon uses TP=tp, FN=np-tp, FP=nn-tn, TN=tn, as defined by its package documentation. Rivera uses the four named diagnostic cells directly. The corpus records original retained/excluded row indices and reasons. The three covariate configurations are Kearon year, Kearon symptomatic indicator, and Rivera Year. Reference covariates use (raw - complete-case mean) / sample SD; raw values, centre, scale and row provenance are stored. The UI labels this transformation when loading reference data. User data are not transformed in what is reported: coefficients, intervals and predictions are on the supplied scale.

Each combination uses REML/ML/fixed and all/single/none correction: 27 configurations, 21 fitted and six uncorrected-zero refusals. Predictions use observed minimum/mean/maximum covariate values and prevalence 0, 0.01, 0.1, 0.5 and 1. The generator uses R 4.6.0, mada 0.5.12 and mvmeta 1.0.3. Package paths and versions are printed in R logs. Complete-case selection is explicit; it is not imputation.

Conditional regions project the coefficient covariance with L = [[1,x,0,0],[0,0,1,x]]. Confidence uses L V L'; prediction adds Psi. A 100-point chi-squared(2), 95% ellipse is transformed from logit sensitivity/FPR to ROC space. The region coordinates use a closed-form ellipse (the same parametrisation as `plus.js`, re-implemented in R); the generator verifies with `ellipse::ellipse` that every point lies on the chi-squared(2) contour of the projected covariance. The coordinates themselves are not produced by mada or ellipse. The conditional calculation is explicit because mada's plot.reitsma does not draw an SROC curve for meta-regression, and its intercept-only prediction ellipse is not a covariate projection. No fitted SROC curve is claimed or drawn here.

## Tolerances and convergence

Closed-form estimates: 1e-9 relative to max(1,abs(R)). Iterative estimates, including derived predictions/regions and z statistics: 1e-6 relative to max(1,abs(R)). Closed-form p-values: 1e-9 absolute. P-values derived from iteratively fitted quantities: 1e-6 absolute. Counts, labels, array shapes, configuration outcomes and normalised refusals are exact. R's raw refusal message is retained separately; its zero-cell failure maps to the exact UI message `Uncorrected zero cell` only after the generator verifies that condition.

Both sides use BFGS with relative tolerance 1e-12 and an iteration cap of 1000: R passes mvmeta's `maxiter=1000`, JavaScript passes `maxit=1000` to its vmmin port. The existing IGLS starting procedure is retained. The original engine is not modified.

The iterative p/z rule was set by the host on 18 October **after observing six p-value differences at the stricter 1e-9 bound**, with maximum absolute difference approximately 1.13e-8. It is not a prospectively selected bound. No other tolerance was changed. The original observations are archived in `strict-p-differences.json`:

| Configuration / zero-based coefficient | JavaScript | R | Absolute difference |
|---|---:|---:|---:|
| dat.kearon1998/year/reml/all/p/1 | 0.31112838567345713 | 0.31112839144086302 | 5.7674058862e-09 |
| dat.kearon1998/year/reml/all/p/3 | 0.41529265479675159 | 0.41529265773443602 | 2.93768442905e-09 |
| dat.kearon1998/year/reml/single/p/1 | 0.30849903431523618 | 0.308499030480892 | 3.8343441755e-09 |
| dat.kearon1998/year/ml/single/p/1 | 0.28766282525481268 | 0.28766281399927801 | 1.1255534671e-08 |
| dat.kearon1998/year/ml/single/p/3 | 0.44916479584294045 | 0.44916479208773802 | 3.75520242679e-09 |
| dat.kearon1998/patients/ml/single/p/3 | 0.54386907749720637 | 0.54386907890210001 | 1.40489364586e-09 |

## Raw-scale covariates

The pinned corpus standardises every covariate. Users can enter raw values, for example calendar years (mean/SD about 200 to 400 for the reference datasets). Root cause of the earlier disagreement with mada on such input (REVIEW_133 P1-3): the between-study covariance Psi is pinned only to roughly the square root of the BFGS relative tolerance (1e-12 on the objective), because the likelihood is flat near its maximum. Raw and standardised fits of the same data reach log-likelihoods that agree within 1e-10 but Psi values that differ by up to 3.4e-6 (lane fx scratch, 80 fits). On a raw calendar-year scale the intercept is the value at year 0, far outside the data, and the coefficient covariance and the projected covariance C magnify that Psi difference (up to 3.6e-5 relative in vcov). Neither side is wrong, and the matrix inversions agree.

The extras therefore fit every model on u = (x - mean)/SD (sample mean and SD) and back-transform: b = A b_u and V = A V_u A', with Psi unchanged (it does not depend on this reparametrisation). The REML log-likelihood is shifted by -2 log(SD) (its log|X'WX| term). Results are reported on the supplied scale. On standardised covariates (the pinned corpus) this is the identity up to rounding, and the pinned replay is unchanged at 195,291/195,291.

This cannot be made exact against mada run on the same raw values, because mada's own raw-scale fit is the less well-conditioned one. The panel therefore shows a note (`#plus-scale-note`) whenever |mean|/SD of the covariate exceeds 20 (`AlmDTAPlus.RAW_SCALE_LIMIT`). The note says that mada on these raw values can differ by more than the 1e-6 tolerance and recommends centring the covariate. The limit is the largest shift at which every scanned configuration agreed with mada on the same input.

`generate-plus-raw.R` writes `corpus/plus-raw-scale.json` (SHA-256 pinned in `MANIFEST-plus-raw.json`; R 4.6.0, mada 0.5.12, mvmeta 1.0.3, the same control). It has 1,218 configurations: the 18 raw-year configurations of the reference datasets (Kearon `year`, Rivera `Year`, x REML/ML/fixed x all/single/none), a shift scan (30 datasets, mean/SD 0 to 200, REML/ML) and 60 synthetic raw-year datasets (k = 4 to 40, 1985 to 2022, a third with small cells, 540 configurations). Each configuration stores two mada references: on the input as supplied, and on the standardised covariate back-transformed in R. `check-plus-raw.mjs` requires that every configuration with mean/SD <= 20 agrees with both at the existing tolerances, that every out-of-tolerance configuration is one where the note is shown, that refusals match exactly, and that the out-of-tolerance sets equal the pinned ones. Result:

| Set | vs mada on the same input | vs mada, standardised and back-transformed |
|---|---:|---:|
| Shift scan, mean/SD <= 20 (no note) | 460/460 configurations | 460/460 |
| Shift scan, mean/SD 50 to 200 (note) | 176/200 | 200/200 |
| Reference datasets, raw years (note) | 14/18 | 18/18 |
| Synthetic raw years (note) | 467/540 | 532/540 |

The largest out-of-tolerance relative difference is 1.89e-4. The 8 configurations that differ from the standardised mada reference differ only in vcov entries on the raw scale (up to 8.6e-6), where the relative tolerance is stricter than on the standardised scale. With the previous engine (fit on raw x) the corresponding counts were 109 and 77, including closed-form fixed-effect fits. Planted defects fail the gate: suppressing the note, removing the centring, or changing one corpus byte.

Reproduction, from the lane directory: `Rscript allmeta/dta-sroc/validate/generate-plus-raw.R`, then `node allmeta/dta-sroc/validate/check-plus-raw.mjs --pin` (only after a deliberate regeneration) and `node allmeta/dta-sroc/validate/check-plus-raw.mjs`.

## Scope and limits

- The extras require k >= 4 studies. This is a deliberate rule of the app, stricter than mada: mada fits k = 3 with one covariate (4 coefficients and 3 variance parameters from 6 observations); the extras refuse it.
- The reference is mada with `control=list(maxiter=1000, reltol=1e-12)` (stated in the panel). Default `reitsma()` stops earlier; in REVIEW_133's synthetic set it differed from this reference by more than 1e-6 in coefficients in 63/456 fits (up to 6.2e-5) and in p-values in 82/456 (up to 1.7e-4).
- The original page's Content-Security-Policy is relaxed from `frame-src 'none'` to `frame-src 'self'`, only so that the same-origin reference renderer (`plus-reference-frame.html`) can be drawn in an iframe for the plot contract. No cross-origin frames are allowed.
- Covariate and count cells must be decimal or exponent numbers; hexadecimal, binary, octal and `Infinity` are refused.

The panel checks the numbers, text, labels and structure the renderer emits; it does not prove pixels. Visual/presentation regressions, including native HTML direction overrides that preserve parsed text, are caught by the CI pixel suite. The panel does not resist CSS deliberately injected into the page.

### What the panels check

The offline extras panel SHA-256 verifies the LF-byte corpus before reading it. `MANIFEST-plus.json` and `plus-pins.js` contain the same pins; `.gitattributes` preserves LF on checkout. It recomputes every reference fit and prediction, compares all exported numeric fields and labels, visible numeric cells and result labels (including the exact ordered element/label/key structure, binding each coefficient to its outcome/term row and column heading, and each summary value to its label; numeric comparisons use independent reference positions rather than UI-supplied keys), exact refusal text, and export availability. Only effectively visible cells and text participate: hidden attributes, display:none, visibility:hidden/collapse, zero-size elements, aria-hidden and transparent elements are rejected on values or their ancestors. The visible ordered structure must match the reference, including headers, row labels and summary containers. Inputs are restored after replay. The numerical-only replay has 195,291 checks; many are repeated across prevalence values and include shape checks. These are not independent research findings.

For the plot, a separate fixed reference renderer draws the R-validated coordinates in a clean iframe in the same browser. The contract compares path/point geometry, effective screen matrices and local SVG bounds transformed into screen coordinates relative to the SVG, text, computed stroke/fill/dashes/opacity/visibility and text styles. The reference scales to the actual SVG width so legitimate responsive sizing does not fail. Screen bounds are derived from getBBox() and getScreenCTM(), avoiding origin-dependent rounding in getBoundingClientRect() on a long page versus an iframe. Geometry retains the existing 1e-7 comparison tolerance; numerical tolerances are unchanged. The ROC axes have a fixed unit scale linked to the validated marks, so their labels are checked. This is a geometry/painted-style contract, not a screenshot pixel-diff claim. The panel **does not resist CSS deliberately injected into the page**, or JavaScript that modifies the validator/reference renderer itself. Renderer-produced hidden structure is in scope; CSS deliberately injected after rendering remains out of scope. It is not a security boundary.

The live panel uses the same-origin bundled webR mada 0.5.12 (with metafor 4.8-0 as a package dependency). It checks 28 coefficient and summary/post-test values for current inputs against a fresh R fit. Region coordinates, export and DOM structure are covered by the offline corpus panel, not this live check. Missing packages/resources, unexpected versions, missing fields and R failures produce an explicit failure/unavailability, never a pass. No network package download is required by these scripts.

The original adapter in the recorded base has no page-text collector; its numerical contract excludes the extras by construction and remains at 855 checks. A comment records #alm-plus as out of scope. The named limit-ma plus templates were absent from the base; no original page-text collector or check count was invented.

## Reproduction

From the lane directory, with the R environment specified in TASK.md:

```text
Rscript allmeta/dta-sroc/validate/generate-plus.R
node allmeta/dta-sroc/validate/pin-plus.mjs
node allmeta/dta-sroc/validate/check-plus.mjs
node --test allmeta/dta-sroc/validate/test-plus.mjs
node allmeta/dta-sroc/validate/replay-original-plus.mjs
```

`check-live-plus.mjs` emits the actual browser R script for each successful configuration, for execution in desktop R. The recorded desktop script checks cover 21 configurations and 588 values; this does not establish browser webR availability. Host update 2 authorises browser tests on the lane-private 127.0.0.1:8103 server using the scratch playwright-u03.config.mjs; see lane BROWSER_TODO.md and REPORT.md for commands and recorded outcomes. The shared port is not used.

| Component | Static / dynamic | Basis |
|---|---|---|
| Dataset rows and reference results | Static, source-derived | Installed metadat and R generator |
| Candidate selection and transformations | Static protocol | Inventory, dataset documentation, recorded metadata |
| Tolerances, convergence, labels and plot scale | Static protocol | Host decision and declared UI contract |
| Fits, regions, probabilities and exports | Dynamic | JavaScript engines and current inputs |
| Validation outcomes | Dynamic | Replays and tests on each run |

## Windows Edge pixel regression suite

`hub/shared/tests/dta-sroc-plus-pixels.spec.mjs` pins ten configurations from the unchanged R corpus: both datasets, all three covariates and fit methods, all/single/none correction, prevalence boundaries and interior values, and two 390 x 844 mobile layouts. Each checks the coefficients table, summary cards and ROC plot separately against the 30 PNGs in `pixel-references/`. Desktop viewport is 1280 x 900; DPR 1, light colour scheme and reduced motion are fixed. Text is rendered with grayscale antialiasing (`--disable-lcd-text`): ClearType subpixel text depends on the capturing machine's settings, and references captured with it failed on other Windows machines and on CI (REVIEW_133 P1-2). References were regenerated on 19 October for that reason and because centring the covariate changes trailing digits of the full-precision printed values (largest relative change 2.3e-8, within the tolerances above). The pixel colour threshold is 0.2 and maximum differing-pixel ratio 0.0001. Coverage is limited to these configurations and Windows Edge rendering; this is not proof of every possible presentation.

Three expected-failure tests first verify a clean baseline, then require the real screenshot matcher to reject table/card `<bdo dir="rtl">` renderer wrappers or a changed prediction-region stroke. An undetected mutation is an unexpected pass and fails the suite. CI never updates snapshots. Reference updates require visual review on Windows Edge; run with `--update-snapshots --grep-invert negative` only when intentionally regenerating them.

```text
npx playwright test --config ../../../dta-sroc/validate/playwright.pixels.config.mjs --workers=1
```

Run from `hub/shared/tests`. The app-specific config uses port 8000 in CI; the lane scratch override uses 8103. The workflow job is `dta-sroc-pixels`, to coexist with other apps' pixel jobs.
