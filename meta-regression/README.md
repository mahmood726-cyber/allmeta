# Meta-Regression

Interactive meta-regression app for exploring covariate-adjusted treatment effects. Paste study-level effect sizes, standard errors, and a continuous moderator; the app fits a weighted mixed-effects model and plots the regression line with confidence band.

## Tests

```
cd meta-regression
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates slope and τ² against metafor `rma(mods=~x)`.
