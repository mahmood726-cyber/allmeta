# multivariate-ma plus panel: validation protocol

The plus panel (`#alm-plus`, files `plus.js`, `plus-ui.js`) adds to the bivariate REML page:

1. three within-study covariance input modes: supplied covariance, per-study correlation r, one assumed correlation rho_w;
2. a within-study correlation sweep (default rho_w = -0.9, -0.8, ..., 0.9; editable; |rho_w| < 1 required, other values are refused per grid point);
3. a univariate vs multivariate table (mean, SE, tau^2 per outcome on the same k studies, and the ratio of the two variances of the pooled mean);
4. z and two-sided normal p for every pooled mean;
5. a runnable R script export (data literal, mvmeta + metafor::rma.mv + per-outcome metafor::rma + the sweep loop; jsonlite output; pinned control settings);
6. plain-language interpretation and auto methods/results text (branches: undefined rho, rho at the boundary, k = 2, omitted rows), SVG/PNG/JSON exports.

## Corpus

`plus/corpus.json` (92 configurations, 22 datasets) is derived by `make_plus_corpus.py` (input: `corpus.json` of the P18 validation archive) from the corpus of the independent P18 v1 validation (installed mvmeta 1.0.3, mixmeta 1.2.2, metadat 1.6.0, metafor 5.2.1 datasets; every bivariate outcome pair; the page's complete-pair row rule). 1,209 accepted and 884 omitted rows (repeated row/configuration counts, not distinct studies).

## R reference (`generate-plus.R`)

R 4.6.0, mvmeta 1.0.3, metafor 5.2.1, jsonlite 2.0.0; `plus/generate-plus.log` records `.libPaths()` (placeholders), versions and controls.

- Bivariate fits (supplied covariance and 19 sweep values per configuration: 1,840 fits, 1,839 ok and one refusal for a non-positive-definite supplied covariance): `mvmeta::mvmeta(method = "reml", bscov = "unstr")` from four starts (maxiter 10000, reltol 1e-13), then `nlminb` (rel.tol = x.tol = 1e-15) on mvmeta's own REML profile `remlprof.fn` with its analytic gradient `remlprof.gr`, then at most 60 Newton steps on `remlprof.gr` (central-difference Hessian) accepted only if the likelihood does not fall and the gradient shrinks. The final max |gradient| is stored per fit (`rGradMax`; median 7e-15, 99th percentile 9e-13, max 8.5e-6). Boundaries are adjudicated as in the v1 validation: exact G = 0 when the covariance score at 0 is positive semidefinite and the profile likelihood confirms; the exact constrained REML solution for k = 2.
- REML log-likelihood on metafor's scale (mvmeta's value + log k).
- Univariate: `metafor::rma(method = "REML", test = "z", control = list(threshold = 1e-12, maxiter = 10000))`, 184 fits.
- z = mu/SE, p = 2 pnorm(-|z|); a closed-form grid of 17 z values for the page's p(z).
- Second oracle: `metafor::rma.mv(struct = "UN", method = "REML")` over the Berkey sweep (19 fits).

## Page side

`shared/multivariate-ma.js`: Nelder-Mead on the Cholesky factor of G from five starts (moment start, x0.1, x10, correlations +-0.9; each screened for 600 iterations, the best two run for 2000 + 1000), then Fisher scoring on the entries of G for interior optima (analytic REML score and expected information; convergence = largest accepted change < 1e-12; exit score reported in `fit().optimizer`), the v1 rank-one refinement and the score-confirmed G = 0 boundary; exact REML for k = 2. Univariate fits use the same code with m = 1.

## Checks and tolerances (`plus-contract.js`)

The check count is derived from the reference structure alone (`MANIFEST-plus.json`: 54,612), so a missing or refused app result is a failed check, never a smaller denominator.

- Iterative REML quantities (mu, SE, Var(mu), G, rho, logLik, z; univariate mu, SE, tau^2, logLik, z; variance ratio): 1e-6 relative to max(1, |ref|). p-values 1e-6 absolute. Two-study exact fits 1e-9. Closed-form p(z) grid 1e-9 absolute.
- Exact: status, k, refusal reason, undefined-rho status, and every displayed table string (the panel is rendered from the app's own values and read back from the DOM).
- Boundary adjudication: a bivariate fit at a boundary whose parameters differ beyond tolerance passes iff app logLik >= R logLik - 1e-8; every such fit is listed.

## Results (this commit)

`run-plus-node.cjs` (Node v24.13.0, linkedom 0.18.12, every page script executed; alm-validate.js and a11y-landmarks.js are browser widgets and skipped): **54,612/54,612 checks pass**, 1 fit passed by logLik adjudication (`metadat::dat.craft2003::acog.asom+asom.conf` at rho_w = -0.3: rank-one boundary, app rho -1 vs R -0.99981, app logLik higher by 5.4e-10). App logLik exceeds R's by > 1e-10 in 1 fit; R's exceeds the app's by > 1e-10 in none. Evidence: `plus/evidence-node.json`. The same replay runs in the browser from the "Validation checks" panel under `#alm-plus-validate` and in `hub/shared/tests/multivariate-ma-plus.spec.mjs`.

The exported R script round trip (each generated script run with Rscript, its JSON compared with the page export) is reported in the pull request and the project report; it uses single-start mvmeta, so its agreement is limited by mvmeta's own optimizer precision.

## What this does not validate

Missing-outcome (partially observed) multivariate meta-analysis, more than two outcomes, ML/fixed/method-of-moments estimators, Knapp-Hartung or t-based tests, and prediction regions are not offered and not validated. Rendering in browsers other than those the Playwright specs run, screen-reader output and print layout are not validated by this corpus.

## Re-running

```text
Rscript --vanilla generate-plus.R plus/corpus.json plus/reference.json   # ~27 min, one R process
python pin-plus.py
node run-plus-node.cjs plus/evidence-node.json                         # needs npm linkedom
```
