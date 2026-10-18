# DTA meta-regression extras: validation scope

The second panel, **Validate the extras in R**, is separate from the original paper replay. The extras implement one numeric study-level covariate with intercept, REML, ML or fixed effects, continuity correction 0.5 (all/single/none), conditional summary sensitivity/specificity, 95% confidence/prediction regions, and disease probabilities after positive and negative tests at a chosen prevalence. Inputs are TP,FN,FP,TN,x; user covariates retain their supplied units. Invalid inputs, uncorrected zero cells and unsuccessful fits are refused; previous results are cleared on input changes.

Reference data are loaded with **Load reference data**. Background corpus loading only appends options to a selector with a stable empty selection; it does not assign study inputs or fit automatically. This prevents delayed extras initialisation from invalidating an in-flight original live R check through the shared input fingerprint.

## Corpus and sources

`corpus/plus-reference.json` inventories all 114 installed metadat 1.6-0 dataset schemas and titles, including every candidate and its inclusion/exclusion reason. The two applicable diagnostic tables are dat.kearon1998 and dat.rivera2025. This is a schema/documentation audit, not a literature review. No external study identifiers or dates are inferred from names.

Kearon uses TP=tp, FN=np-tp, FP=nn-tn, TN=tn, as defined by its package documentation. Rivera uses the four named diagnostic cells directly. The corpus records original retained/excluded row indices and reasons. The three covariate configurations are Kearon year, Kearon symptomatic indicator, and Rivera Year. Reference covariates use (raw - complete-case mean) / sample SD; raw values, centre, scale and row provenance are stored. The UI labels this transformation when loading reference data. It does not silently standardise user data.

Each combination uses REML/ML/fixed and all/single/none correction: 27 configurations, 21 fitted and six uncorrected-zero refusals. Predictions use observed minimum/mean/maximum covariate values and prevalence 0, 0.01, 0.1, 0.5 and 1. The generator uses R 4.6.0, mada 0.5.12 and mvmeta 1.0.3. Package paths and versions are printed in R logs. Complete-case selection is explicit; it is not imputation.

Conditional regions project the coefficient covariance with L = [[1,x,0,0],[0,0,1,x]]. Confidence uses L V L'; prediction adds Psi. A 100-point chi-squared(2), 95% ellipse is transformed from logit sensitivity/FPR to ROC space. The R generator checks the projected covariance using `ellipse::ellipse`, the routine used by mada. The conditional calculation is explicit because mada's plot.reitsma does not draw an SROC curve for meta-regression, and its intercept-only prediction ellipse is not a covariate projection. No fitted SROC curve is claimed or drawn here.

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

## Scope and limits

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

`hub/shared/tests/dta-sroc-plus-pixels.spec.mjs` pins ten configurations from the unchanged R corpus: both datasets, all three covariates and fit methods, all/single/none correction, prevalence boundaries and interior values, and two 390 x 844 mobile layouts. Each checks the coefficients table, summary cards and ROC plot separately against the 30 PNGs in `pixel-references/`. Desktop viewport is 1280 x 900; DPR 1, light colour scheme and reduced motion are fixed. The pixel colour threshold is 0.2 and maximum differing-pixel ratio 0.0001. Coverage is limited to these configurations and Windows Edge rendering; this is not proof of every possible presentation.

Three expected-failure tests first verify a clean baseline, then require the real screenshot matcher to reject table/card `<bdo dir="rtl">` renderer wrappers or a changed prediction-region stroke. An undetected mutation is an unexpected pass and fails the suite. CI never updates snapshots. Reference updates require visual review on Windows Edge; run with `--update-snapshots --grep-invert negative` only when intentionally regenerating them.

```text
npx playwright test --config ../../../dta-sroc/validate/playwright.pixels.config.mjs --workers=1
```

Run from `hub/shared/tests`. The app-specific config uses port 8000 in CI; the lane scratch override uses 8103. The workflow job is `dta-sroc-pixels`, to coexist with other apps' pixel jobs.
