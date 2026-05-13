# DTA-SROC Diagnostic Test Accuracy

Interactive diagnostic test accuracy app. Paste 2×2 study-level cell counts (TP, FP, FN, TN); the app computes pooled sensitivity and specificity, fits a Moses SROC curve, detects threshold effects via Spearman correlation, and applies continuity correction only when a zero cell is present.

## Tests

```
cd dta-sroc
pytest tests/ -q
```

R-parity test (`tests/test_against_mada.py`) validates Moses OLS α and β against mada `reitsma()`. Note: mada parameterises on logit(FPR); the app converts correctly.
