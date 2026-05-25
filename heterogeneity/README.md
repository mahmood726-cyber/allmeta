# Heterogeneity Explorer

Interactive heterogeneity decomposition app for pairwise meta-analysis. Paste study-level effect sizes and standard errors; the app computes Q, I², τ², prediction interval, and renders a Baujat influence plot. Supports DerSimonian-Laird, REML, and Paule-Mandel estimators.

## Tests

```
cd heterogeneity
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates Q, I², τ², and HKSJ CI against metafor.

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** IÂ², Ï„Â², Q, prediction interval.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
