# PET-PEESE Publication Bias Correction

Interactive PET-PEESE app for publication bias correction in meta-analysis. Paste study-level effect sizes and standard errors; the app fits PET (precision-effect test) and PEESE (precision-effect estimate with standard error) regression models and renders a precision funnel plot with regression lines.

## Tests

```
cd pet-peese
pytest tests/ -q
```

R-parity test (`tests/test_against_metafor.py`) validates PET intercept and slope against metafor `regtest()` (lm accessor path for metafor 4.x).
