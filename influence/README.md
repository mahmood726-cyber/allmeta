# Influence Diagnostics

A browser-only tool for per-study influence analysis in random-effects meta-analysis. For each study in a pairwise MA, the app drops that study and recomputes the pooled effect; it then reports Cook's distance, hat values, studentized deleted residuals, DFFITS, covariance-ratio, and leave-one-out (LOO) pooled estimates alongside two plots: a LOO forest plot and a Cook's D × Hat influence scatter. Studies are flagged in red when Cook's D > 1, hat > 3/k, or |residual| > 2, mirroring the default thresholds in `metafor::influence()`. Input can be pasted as `effect, SE[, label]` rows or uploaded via a CSV file with columns `study, yi, vi` (variance). All computation is inline JavaScript; no server required.

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
