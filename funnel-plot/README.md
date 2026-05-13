# Funnel Plot Explorer

Interactive funnel plot for visualising small-study effects and publication bias. Paste study-level effect sizes and standard errors; the app renders an asymmetry-annotated funnel plot and runs Egger's test.

## Tests

```
cd funnel-plot
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates Egger slope and intercept against metafor.
