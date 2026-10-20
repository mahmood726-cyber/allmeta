# Influence Diagnostics

A browser-only tool for per-study influence analysis in an intercept-only REML random-effects meta-analysis. For each study it reports the weight, the externally studentized residual, DFFITS, Cook's distance, the covariance ratio, the hat value, DFBETAS and the leave-one-out (LOO) pooled estimate with its SE and 95% CI, plus LOO tau-squared, I-squared, Q, p(Q), z and p (one toggle). A study is marked Influential (text and tint) when |DFFITS| > 3/sqrt(k-1), Cook's D exceeds the median of chi-square(1), hat > 3/k, or |DFBETAS| > 1, which is the rule of `metafor::influence()`. The full-model summary shows k, the pooled estimate, SE, 95% CI, z, p, tau-squared, I-squared, H-squared, Q and p(Q). Any studies can be excluded with per-row checkboxes (or "Exclude all flagged"); the model is re-fitted without them and shown before/after, and the excluded studies are dimmed in the table and all four plots (LOO forest, Cook's D x hat, Baujat, radial). "Download R script" writes a metafor script that refits the analysis and checks every displayed value. Input is `effect, SE[, label]` rows (invalid lines are refused with their line numbers) or a CSV with columns `study, yi, vi`. All computation is in the browser; no server is required.

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** Per-study leave-one-out, Cook's D, hat values.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
