# DTA validation adapter

The corpus is a compact lossless JSON projection of the reproducible repository's canonical `results/full/mada.jsonl` and `results/full/corpus.csv`, joined by dataset in source order. `expected/paper_values.json` is included as the count oracle. No stored engine outputs are used. Source and packaged SHA-256 hashes are recorded in `MANIFEST.json`; the shared widget verifies the packaged bytes before invoking `corpus.run`.

The comparison definitions are copied from `hub/shared/tests/_dta_parity_check.mjs` and match `analysis/make_outputs.py` in the reproducible repository. The actual calculations call the shipped `AlmDTABivariate` engine, including both directions of each ellipse comparison. One configuration check per fit/refusal, one per available quantity group, and one per Moses-Littenberg case are counted as in the paper. A coverage mismatch fails validation; counts are never padded.

`corpus.run` accepts a path-keyed object or Map of parsed JSON (or JSON text). It does no fetching. The framework owns loading, hash verification, version headers and result rendering. The adapter is exposed as `window.AlmDTAValidateAdapter` for integration tests and mounts when `AlmValidate` is present.

Live validation reads the current page's `__almBivariate()` fit and raw input rows from `__almResults()`. It compares the intercept-only bivariate summary displayed by the page, including sensitivity/specificity and CIs, likelihood ratios and their delta-method CIs, DOR, variance/correlation, log-likelihood/AIC, AUC/partial AUC and finite HSROC parameters. It does not validate the optional separate meta-regression output in tier 1; the published meta-regression grid is covered in tier 2. A refused current fit produces an explicit error. The R script uses `mada::reitsma`, the selected method and correction rule, and prints one `ALMJSON:` line with `%.17g` values; no jsonlite is needed. The paper used mada 0.5.12. No paper DOI is asserted because none is recorded in the source metadata; the source repository and Actions workflow are linked.

Live tolerances default to 1e-6 absolute for probabilities, correlation, AUC and log-likelihood/AIC; dimensionful ratios, variances and HSROC parameters use 1e-6 relative to allow the floating-point optimizer differences described in the paper. Corpus tolerances retain the paper's stricter 1e-9 fixed/MM, 1e-8 VC, 1e-6 ML/REML coefficient/covariance tolerances; Moses-Littenberg is 1e-9 absolute. No tolerances were relaxed for this adapter.

| Component | Static or dynamic | Evidence / purpose |
|---|---|---|
| Canonical rows and R reference values | Static source data | Lossless packaging; source hashes in manifest |
| Expected 855 checks and grid counts | Static validation targets | Published expected/paper_values.json |
| App estimates, discrepancies, counts and refusals | Dynamic | Shipped engine rerun on every validation |
| Live app values / R script | Dynamic | Current page inputs and unrounded result |
| Tolerances and mada 0.5.12 label | Static protocol | Paper comparison definitions and R reference script |

Network: the adapter makes no requests. Tier 2 depends only on local corpus files. Tier 1 must use the framework's pinned, same-origin webR repository. The framework must provide `AlmValidate.mount` and a pinned same-origin `AlmWebR.runR` implementation before tier 1 is usable. The adapter does not choose or request a CDN fallback.