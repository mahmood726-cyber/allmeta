# NMA Dose-Response Studio - Quick Reference

## Run Tests

```bash
# Selenium (79 tests)
python C:/Users/user/nma-dose-response-app/comprehensive_feature_test_v2.py

# R Benchmark (31 tests)
"C:/Program Files/R/R-4.5.2/bin/Rscript.exe" C:/Users/user/nma_dose_response_benchmark.R
```

---

## Window API

```javascript
// DerSimonian-Laird
result = window.DLEstimator.calculate(effects, ses)
// Returns: { effect, se, tau2, Q, I2, k, ci: {lower, upper} }

// Validation
check = window.EdgeCaseHandler.validate(effects, ses)
// Returns: { valid: boolean, error?: string }

// Dose-Response Models
window.DoseResponseModels.linear(doses, effects, ses)
window.DoseResponseModels.emax(doses, effects, ses)
window.DoseResponseModels.quadratic(doses, effects, ses)

// Ranking
window.RankingAnalysis.calculateSUCRA(probabilities)
window.RankingAnalysis.calculatePScore(effects, ses)

// Export
window.ExportManager.exportToCSV(data, filename)
window.ExportManager.exportToPNG(canvas, filename)

// Notifications
window.showNotification(message, type) // type: 'success'|'error'|'warning'
```

---

## Reference Values (metafor)

```javascript
// Test input
effects = [-0.5, -0.3, -0.7, -0.4, -0.6]
ses = [0.1, 0.15, 0.12, 0.11, 0.13]

// Expected DL output
{
  effect: -0.506484,
  se: 0.065409,
  tau2: 0.006992,
  I2: 32.82,
  Q: 5.9539
}
```

---

## Statistical Functions

| Function | Formula |
|----------|---------|
| I-squared | `max(0, (Q - df) / Q) * 100` |
| tau-squared (DL) | `max(0, (Q - (k-1)) / C)` |
| Prediction PI | `effect +/- t(k-2) * sqrt(se^2 + tau2)` |
| HKSJ CI | Uses t(k-1) instead of z |

---

## Features (25 total)

**Meta-Analysis**: DL, REML, Fixed Effects, HKSJ, Prediction Intervals

**Publication Bias**: Egger, Begg, Peters, Trim-Fill, PET-PEESE, Z-curve, Selection Models, Contour Funnel

**Sensitivity**: Leave-One-Out, Influence Diagnostics, Cumulative MA

**NMA**: Component NMA, Transitivity, SUCRA, P-score

**Dose-Response**: Linear, Emax, Quadratic, Gaussian Process

**Export**: CSV, PNG, JSON

---

## Troubleshooting

```bash
# Edge browser stuck
taskkill /F /IM msedge.exe /T

# Clean test profile
rmdir /s /q C:\temp\edge_test_profile
```

---

## Test Results Summary

| Suite | Passed | Total | Rate |
|-------|--------|-------|------|
| Selenium | 79 | 79 | 100% |
| R Benchmark | 31 | 31 | 100% |
| Editorial | 100 | 100 | 100% |

---

## Key Files

| File | Purpose |
|------|---------|
| `app.js` | Main application |
| `comprehensive_feature_test_v2.py` | Selenium tests |
| `nma_dose_response_benchmark.R` | R comparison |
| `DOCUMENTATION.md` | Full documentation |
| `SESSION_LOG.md` | Work history |

---

*Last updated: 2026-01-04*
