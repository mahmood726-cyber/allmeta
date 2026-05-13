# Heterogeneity Explorer

Interactive heterogeneity decomposition app for pairwise meta-analysis. Paste study-level effect sizes and standard errors; the app computes Q, I², τ², prediction interval, and renders a Baujat influence plot. Supports DerSimonian-Laird, REML, and Paule-Mandel estimators.

## Tests

```
cd heterogeneity
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates Q, I², τ², and HKSJ CI against metafor.
