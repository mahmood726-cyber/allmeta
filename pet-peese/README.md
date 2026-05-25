# PET-PEESE Publication Bias Correction

Interactive PET-PEESE app for publication bias correction in meta-analysis. Paste study-level effect sizes and standard errors; the app fits PET (precision-effect test) and PEESE (precision-effect estimate with standard error) regression models and renders a precision funnel plot with regression lines.

## Tests

```
cd pet-peese
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates PET intercept and slope against metafor `regtest()` (lm accessor path for metafor 4.x).

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** Stanley & Doucouliagos small-study correction.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
