# Meta-Regression

Interactive meta-regression app for exploring covariate-adjusted treatment effects. Paste study-level effect sizes, standard errors, and a continuous moderator; the app fits a weighted mixed-effects model and plots the regression line with confidence band.

The **Shared pooled-only check (R)** and **Pooled-only check (R)** buttons open the WebR validator for an intercept-only model without the moderator. They do not validate the displayed regression coefficients, CIs, residual τ², Q_E, or R². The shared check uses studies already saved to the bus; the other check saves the entered studies first. Use **Export R script** to reproduce the meta-regression with `mods = ~ x`, `method = "PM"`, and `test = "adhoc"` (floored Knapp-Hartung intervals).

## Tests

```
cd meta-regression
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates slope and τ² against metafor `rma(mods=~x)`.

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** Test a continuous study-level moderator.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- The R check buttons validate a pooled-only model. Use **Export R script** to reproduce the meta-regression in R.

<!-- ALM-AUTO-README-END -->
