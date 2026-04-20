# TruthCert-PairwisePro Quick Reference

## Console Commands (Browser DevTools)

```javascript
// === VALIDATION ===
runExtendedValidation()      // Core validation (HKSJ, Egger, heterogeneity)
runAdvancedValidation()      // Advanced (three-level, dose-response, ROB)

// === DOCUMENTATION ===
console.log(METHODS_APPENDIX)           // View all method equations
getMethodsAppendix('json')              // Export as JSON

// === INDIVIDUAL TESTS ===
validateThreeLevelMA()       // Test three-level vs metafor::rma.mv
validateDoseResponseMA()     // Test dose-response vs dosresmeta
validateROB2()               // Test ROB 2.0 algorithm

// === STATISTICAL FUNCTIONS ===
// Effect sizes
calculateLogOR(a, b, c, d)
calculateLogRR(a, b, c, d)
calculateSMD(m1, sd1, n1, m2, sd2, n2)
calculateLogHR(hr, ci_lower, ci_upper)

// Pooling
calculatePooledEstimate(yi, vi, method)  // method: 'FE', 'DL', 'REML', etc.
calculateHKSJ(yi, vi, tau2)              // Hartung-Knapp-Sidik-Jonkman

// Heterogeneity
estimateTau2_DL(yi, vi)
estimateTau2_REML(yi, vi)
estimateTau2_PM(yi, vi)                  // Paule-Mandel

// Publication bias
eggerTest(yi, vi)
petersTest(ai, bi, ci, di)
petPeese(yi, vi)
copasSelectionModel(yi, vi, options)
trimAndFill(yi, vi, pooled)

// Advanced methods
threeLevelMetaAnalysis(yi, vi, cluster)
doseResponseMetaAnalysis(doses, yi, vi, options)
bivariateMetaAnalysis(yi1, vi1, yi2, vi2, rho)

// Sensitivity
leaveOneOut(yi, vi)
cumulativeMetaAnalysisByYear(studies)
influenceDiagnostics(yi, vi)

// ROB
assessROB2(domains)          // domains = {D1: 'Low', D2: 'Some concerns', ...}
assessROBINS_I(domains)

// PRISMA
generatePRISMAReport(data)
renderPRISMADiagram(counts)
```

## Tau² Estimators Available

| Method | Function | Best For |
|--------|----------|----------|
| DerSimonian-Laird | `estimateTau2_DL` | Quick estimate |
| REML | `estimateTau2_REML` | Gold standard |
| Paule-Mandel | `estimateTau2_PM` | Small k |
| Maximum Likelihood | `estimateTau2_ML` | Large k |
| Hunter-Schmidt | `estimateTau2_HS` | Psychology |
| Sidik-Jonkman | `estimateTau2_SJ` | Robust |
| Hedges-Olkin | `estimateTau2_HE` | Classic |
| Empirical Bayes | `estimateTau2_EB` | Shrinkage |

## Key R Package Comparisons

| Our Function | R Equivalent |
|--------------|--------------|
| `calculatePooledEstimate(yi, vi, 'REML')` | `metafor::rma(yi, vi, method='REML')` |
| `threeLevelMetaAnalysis(yi, vi, cluster)` | `metafor::rma.mv(yi, vi, random=~1|cluster/id)` |
| `eggerTest(yi, vi)` | `metafor::regtest(rma_obj)` |
| `petPeese(yi, vi)` | Manual in R (no single function) |
| `doseResponseMetaAnalysis(...)` | `dosresmeta::dosresmeta(...)` |

## Benchmark Datasets

```javascript
// Available in BENCHMARK_DATASETS object:
BENCHMARK_DATASETS.small_k3           // 3 studies
BENCHMARK_DATASETS.medium_k10         // 10 studies
BENCHMARK_DATASETS.large_k50          // 50 studies
BENCHMARK_DATASETS.bcg_vaccine        // Classic BCG data (13 RCTs)
BENCHMARK_DATASETS.homogeneous        // Zero heterogeneity
BENCHMARK_DATASETS.extreme_heterogeneity  // I² > 90%

// Extended validation data:
EXTENDED_VALIDATION_DATA.three_level  // For threeLevelMetaAnalysis
EXTENDED_VALIDATION_DATA.dose_response // For doseResponseMetaAnalysis
EXTENDED_VALIDATION_DATA.rob2         // For ROB 2.0 testing
```

## File Locations

```
C:/Truthcert1/
├── app.js                              # Core engine (39,532 lines)
├── TruthCert-PairwisePro-v1.0-fast.html  # Main interface
├── CLAUDE.md                           # Instructions for Claude Code
├── DEVELOPMENT_LOG.md                  # Full history
└── QUICK_REFERENCE.md                  # This file

C:/Users/user/
├── add_editorial_revisions.py          # Main revision script
├── cleanup_duplicates.py               # Duplicate removal
├── add_validation_tests.py             # Extended validation
└── fix_*.py                            # Various fixes
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | Jan 2026 | Initial merge of Pairwise Pro + TruthCert |
| v1.0.1 | Jan 2026 | Added 43 Beyond R functions |
| v1.0.2 | Jan 2026 | Editorial revisions, cleanup |

## Editorial Review Status

**Rating:** 9.2/10
**Recommendation:** ACCEPT (Research Synthesis Methods)
**Status:** All required revisions complete
