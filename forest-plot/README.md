# Forest Plot Viewer

Interactive forest plot for pairwise meta-analysis. Paste study-level effect sizes and standard errors; the app pools via fixed/random effects (DerSimonian-Ladd or REML) and renders a publication-quality forest plot with heterogeneity statistics (I², τ², Q).

## Tests

```
cd forest-plot
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates pooled estimates against metafor.
