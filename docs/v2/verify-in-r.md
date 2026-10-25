# Verify in R, plots and downloads

[Back to the guides](README.md)

In [proportion meta-analysis](../../proportion-ma/index.html), **Verify in R** re-runs the current analysis in R inside the browser through webR. It compares the quantities supplied by the app's validation adapter and shows an R forest plot beside the app plot. Sources: `shared/alm-verify-r.js`, `shared/webr-runner.js`, `proportion-ma/alm-features.js` and `proportion-ma/validate/adapter.js`; browser contract: `hub/shared/tests/features-proportion-ma.spec.mjs`.

## Run and interpret the check

Run the analysis, open **Verify in R**, and choose **Verify this analysis in R**. Wait for the summary and inspect the comparison table: it reports the app and R values, their difference, the permitted tolerance and the verdict. Tolerances come from the adapter, so do not assume a single tolerance for every quantity. Sources: `shared/alm-verify-r.js` and `proportion-ma/validate/adapter.js`; contract: `hub/shared/tests/features-proportion-ma.spec.mjs`.

- **PASS** means the required computed quantities match within the declared tolerances.
- **FAIL** means the check did not meet those requirements. Inspect the individual rows.
- **NOT COMPUTED** is not a successful match. Required missing quantities fail the run.
- **NOT APPLICABLE** is reserved for quantities explicitly declared inapplicable when absent on both sides; it is excluded from the comparison count. For example, this app declares prediction-interval quantities inapplicable with fewer than **3 studies**, as specified in `proportion-ma/alm-features.js`.
- **STALE** means the saved check belongs to an earlier analysis state. Re-run verification after changing data or options. Downloads remain possible but are marked as stale.

Status handling is in `shared/alm-verify-r.js`. `hub/shared/tests/features-proportion-ma.spec.mjs` checks a successful comparison, an intentionally altered value that must fail, inapplicable prediction intervals and stale results. Additional missing-value checks are in `hub/shared/tests/unit/alm-verify-r.test.mjs`.

## Save the check and plots

The panel offers the R script, comparison CSV, R session information and console log. Plot downloads include PNG and TIFF at **300 dpi**, PDF, and SVG when available. If R cannot provide SVG, the button explicitly identifies an available SVG as the app's own plot. The resolution and fallback come from `shared/alm-verify-r.js`; `hub/shared/tests/features-proportion-ma.spec.mjs` inspects downloaded formats and image metadata.

**Download everything (ZIP)** packages the check with a TruthCert receipt and includes provenance CSV when source records are present. The receipt records the compared analysis state and file hashes. In this browser workflow it is unsigned; a receipt is a record of the check, not a clinical approval. Sources: `shared/alm-verify-r.js`; receipt, hash and provenance contracts: `hub/shared/tests/features-proportion-ma.spec.mjs`.

## Limits and unavailable R packages

This verifies the adapter's listed calculations, not the correctness of study selection or the suitability of the model. Matching values do not require the R and app plots to look identical. webR must load its runtime and required packages; an unavailable package cannot yield a browser verification pass. The panel reports that limitation and offers the R script for use in desktop R. Sources: `shared/alm-verify-r.js` and `shared/webr-runner.js`; browser contracts: `hub/shared/tests/features-proportion-ma.spec.mjs` and `hub/shared/tests/features-live-rve-meta.spec.mjs`. The latter tests package refusal in a separate live adapter; it does not establish availability of this feature panel in that app.
