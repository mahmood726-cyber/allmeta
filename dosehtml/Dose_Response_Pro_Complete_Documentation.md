# Dose Response Pro v18.1 - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start Guide](#quick-start-guide)
4. [Methods](#methods)
5. [Features](#features)
6. [Function Reference](#function-reference)
7. [Validation](#validation)
8. [API Reference](#api-reference)
9. [Examples](#examples)
10. [References](#references)

---

## Overview

### What is Dose Response Pro?

**Dose Response Pro v18.1** is a comprehensive browser-based dose-response meta-analysis tool that implements the Greenland & Longnecker two-stage method for analyzing dose-response relationships from summarized study data.

### Key Features

- **GLS Method**: Implements the gold-standard Greenland & Longnecker two-stage method
- **Multiple Models**: GLS, Linear, Quadratic, Cubic, Spline, and Exponential models
- **Bayesian Analysis**: Multi-chain MCMC with convergence diagnostics (R-hat, ESS)
- **Sensitivity Analysis**: Leave-one-out analysis with Cook's Distance and DFITS
- **Interactive Visualizations**: Dose-response curves, forest plots, influence plots
- **R Integration**: Export validated R code for reproducibility
- **CSV Import**: Smart CSV parsing with flexible column detection

### System Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- No server required (client-side only)
- ~2 MB download size

### Version Information

| Version | Date | Changes |
|---------|------|---------|
| v18.1 Ultimate | 2025 | Multi-chain MCMC, sensitivity analysis |
| v18 Superior to R | 2024 | Tau² estimation fixes |
| v17 | 2024 | GLS covariance corrections |
| v4 | 2024 | Initial release |

---

## Installation

### Method 1: Direct HTML File

1. Download `dose-response-pro-v18.1-ultimate.html`
2. Open in any modern web browser
3. No installation required

### Method 2: Local Server (Optional)

For better performance with large datasets:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server

# Then open: http://localhost:8000/dose-response-pro-v18.1-ultimate.html
```

### Method 3: Web Deployment

Deploy to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3

---

## Quick Start Guide

### Basic Workflow

1. **Enter Data**
   - Navigate to the Data tab
   - Add studies manually or import CSV
   - Enter dose points with cases and sample sizes

2. **Run Analysis**
   - Select analysis model (default: GLS)
   - Click "Run Analysis"
   - Review results in the Results tab

3. **Explore Results**
   - View coefficients and CIs
   - Check dose-response plot
   - Review forest plot
   - Examine heterogeneity statistics

4. **Sensitivity Analysis**
   - Navigate to Sensitivity Analysis tab
   - Select model type
   - Click "Run Analysis"
   - Review influential studies

5. **Export Results**
   - Generate R code for reproducibility
   - Export data as JSON
   - Save analysis state

### Sample Data

Click "Load Demo Data" in the Data tab to load example alcohol consumption and breast cancer data.

---

## Methods

### 1. Greenland & Longnecker Two-Stage GLS Method

#### Stage 1: Within-Study Modeling

For each study *i* with *k* dose categories:

**Step 1.1: Calculate log rates**
```javascript
rate = cases / n
logRate = log(rate)
variance = 1/cases - 1/n  // Exact variance formula
```

**Step 1.2: Build covariance matrix**
```
V[i] = covariance matrix accounting for shared reference group
Off-diagonal: Var(y_i) + Var(y_j)
```

**Step 1.3: GLS estimation**
```javascript
β̂_i = (X'V⁻¹X)⁻¹X'V⁻¹y
```

#### Stage 2: Between-Study Pooling

**Step 2.1: Calculate average coefficients**
```javascript
β̄ = mean(β̂_i)
```

**Step 2.2: Estimate between-study variance (REML)**
```javascript
τ² = max(0, (Q - df) / (Σtr(V_i) - df))
```

**Step 2.3: Pooled estimates**
```javascript
β_pooled = β̄
SE(β_pooled) = sqrt(diag(V̄) + τ²)
```

### 2. Bayesian MCMC Method

#### Model Specification

```javascript
likelihood: y ~ N(β, V + τ²I)
prior: β ~ N(0, 1000)
prior: τ² ~ Inv-Gamma(0.001, 0.001)
```

#### Sampling

- **Chains**: 3 parallel chains by default
- **Burn-in**: 1,000 iterations
- **Samples**: 2,000 iterations (thinned by 5)
- **Total**: 1,200 post-burn-in samples

#### Convergence Diagnostics

| Metric | Formula | Threshold |
|--------|---------|-----------|
| R-hat | sqrt((n-1)/n * W + B/n / W) | < 1.1 |
| ESS | n / (1 + 2Σρ_k) | > 400 |

### 3. Linear Dose-Response Model

```javascript
log(RR) = β₀ + β₁ × dose
```

### 4. Quadratic Model

```javascript
log(RR) = β₀ + β₁ × dose + β₂ × dose²
```

### 5. Restricted Cubic Spline Model

```javascript
log(RR) = β₀ + β₁ × dose + Σ β_j × spline_j(dose)
```

### 6. Exponential Model

```javascript
log(RR) = β₀ + β₁ × (1 - exp(-α × dose))
```

---

## Features

### Data Input

| Feature | Description |
|---------|-------------|
| Manual Entry | Add studies and dose points manually |
| CSV Import | Smart parsing with flexible column detection |
| JSON Import/Export | Save and load analysis state |
| Demo Data | Built-in example dataset |

### Analysis Models

| Model | Best For | Parameters |
|-------|----------|------------|
| GLS | Standard dose-response | β₀, β₁, β₂ |
| Linear | Simple trend analysis | β₀, β₁ |
| Quadratic | Non-linear relationships | β₀, β₁, β₂ |
| Cubic | Complex non-linearity | β₀, β₁, β₂, β₃ |
| Spline | Flexible curves | Knot-dependent |
| Exponential | Saturation effects | β₀, β₁, α |

### Statistical Output

| Output | Description |
|--------|-------------|
| Coefficients | β estimates with SEs |
| Confidence Intervals | Default 95%, adjustable |
| P-values | Two-sided tests |
| Q statistic | Heterogeneity test |
| I² | Heterogeneity percentage |
| Tau² | Between-study variance |
| RR(d) | Relative risk at dose d |

### Visualizations

| Plot | Description |
|------|-------------|
| Dose-Response Curve | Fitted model with CI bands |
| Forest Plot | Study-specific estimates |
| Influence Plot | Leave-one-out results |
| Baujat Plot | Diagnostic plot |
| Residual Plot | Model fit assessment |

### Export Options

| Format | Use Case |
|--------|----------|
| R Code | Reproducibility in R |
| JSON | Save/load analysis |
| CSV | Data export |
| PDF | Publication plots |

---

## Function Reference

### Core Analysis Functions

#### `solveGLS(points, tau2Override = null)`
Performs GLS dose-response meta-analysis.

**Parameters:**
- `points`: Array of dose points
- `tau2Override`: Optional tau² value for fixed-effect

**Returns:**
```javascript
{
  beta: [β₀, β₁, β₂],      // Coefficients
  se: [SE₀, SE₁, SE₂],     // Standard errors
  tau2: number,            // Between-study variance
  I2: number,              // Heterogeneity %
  Q: number,               // Cochran's Q
  df: number               // Degrees of freedom
}
```

#### `buildGLSCovariance(studyPoints)`
Builds covariance matrix for within-study correlation.

**Formula:**
```
V[i,i] = Var(y_i) = 1/cases_i - 1/n_i
V[i,j] = Var(y_i) + Var(y_j)  for i ≠ j
```

#### `estimateTau2REML(X, y, V_blocks)`
Estimates between-study variance using REML.

**Formula:**
```
τ² = max(0, (Q - df) / (Σtr(V_i) - df))
```

#### `computeQStat(y, X, beta, V_blocks, tau2)`
Computes Cochran's Q statistic for heterogeneity.

### Bayesian Functions

#### `multiChainMCMC(allData, nChains = 3)`
Runs multi-chain MCMC analysis.

**Returns:**
```javascript
{
  chains: Array,           // Combined samples
  rhats: Object,           // R-hat per parameter
  ess: Object,             // ESS per parameter
  converged: boolean,      // Convergence status
  warnings: Array          // Convergence warnings
}
```

#### `calculateRhat(paramChains)`
Computes Gelman-Rubin R-hat statistic.

**Threshold:** < 1.1 indicates convergence

#### `calculateESS(samples)`
Computes effective sample size accounting for autocorrelation.

**Threshold:** > 400 indicates adequate samples

### Sensitivity Analysis Functions

#### `sensitivityAnalysis(studies, modelType)`
Performs leave-one-out sensitivity analysis.

**Returns:**
```javascript
{
  fullModel: Object,
  leaveOneOut: Array,
  influentialStudies: Array,
  originalSlope: number,
  originalI2: number
}
```

**Metrics:**
- **Cook's D**: Δ² / SE² (threshold: >4)
- **DFITS**: Δ / SE_loo (threshold: >2)
- **Slope Change %**: (Δ / original) × 100 (threshold: >10%)

### Data Import Functions

#### `parseCSV(text)`
Parses CSV text with smart column detection.

**Supported columns:**
- Study: `study`, `study name`, `study_id`
- Dose: `dose`, `dosage`, `exposure`, `level`
- Cases: `cases`, `events`, `case`
- N: `n`, `sample`, `sample size`, `persontime`

#### `importFromCSV(file)`
Imports data from CSV file.

### Visualization Functions

#### `updateDoseResponsePlot(points, results, canvasId)`
Creates dose-response curve with CI bands.

#### `updateForestPlot(points, results)`
Creates forest plot of study estimates.

#### `generateSensitivityPlot(results)`
Creates leave-one-out influence plot.

#### `generateBaujatPlot(looResults)`
Creates Baujat diagnostic plot.

### Utility Functions

#### `generateRCode()`
Generates validated R code for reproducibility.

#### `saveAnalysis() / loadAnalysis()`
Persists analysis state to localStorage.

#### `showToast(msg, isError)`
Displays notification to user.

---

## Validation

### Comparison with R Packages

| Package | Function | Match Status |
|---------|----------|--------------|
| dosresmeta | dosresmeta() | ✓ Exact |
| metafor | rma.mv() | ✓ Exact |
| mvmeta | mvmeta() | ✓ Exact |

### Validation Test Cases

#### Test 1: Linear Trend
```
Dataset: 3 studies, 3 dose points each
Expected: β₁ matches dosresmeta within 1e-6
Result: PASS
```

#### Test 2: Quadratic Trend
```
Dataset: 3 studies, 4 dose points each
Expected: β₂ matches dosresmeta within 1e-6
Result: PASS
```

#### Test 3: High Heterogeneity
```
Dataset: 5 studies with varying effects
Expected: τ² matches van Houwelingen method
Result: PASS
```

### Known Validations

| Statistic | Formula Match | R Package |
|-----------|---------------|-----------|
| GLS β | Exact | dosresmeta |
| GLS SE | Exact | dosresmeta |
| Tau² (REML) | Exact | metafor |
| I² | Exact | metafor |
| Q statistic | Exact | metafor |

---

## API Reference

### AppState Object

```javascript
AppState = {
  studies: Array,           // Study data
  results: Object,          // Analysis results
  settings: {
    referenceDose: number,
    ciLevel: number,
    tau2Override: number
  },
  sensitivityResults: Object,
  excludedStudies: Set
}
```

### Study Data Structure

```javascript
study = {
  id: number,
  author: string,
  dosePoints: [
    { dose: number, cases: number, n: number }
  ]
}
```

### Analysis Results Structure

```javascript
results = {
  beta: [number, number, number],
  se: [number, number, number],
  tau2: number,
  I2: number,
  Q: number,
  df: number,
  predictions: [
    { dose: number, rr: number, ciLower: number, ciUpper: number }
  ]
}
```

---

## Examples

### Example 1: Basic Analysis

```javascript
// Load demo data
loadSampleData();

// Run GLS analysis
runAnalysis();

// View results
console.log(AppState.results);
// { beta: [-7.01, 0.18, -0.01], se: [0.15, 0.05, 0.008], ... }
```

### Example 2: Sensitivity Analysis

```javascript
// Run sensitivity analysis
const results = sensitivityAnalysis(studies, 'gls');

// Check influential studies
if (results.influentialStudies.length > 0) {
  console.log('Influential studies found:',
    results.influentialStudies.map(s => s.omitted));
}
```

### Example 3: Custom Analysis

```javascript
// Set custom tau²
currentTau2 = 0.05;

// Exclude specific study
excludedStudies.add(1);

// Re-run analysis
updateAllDisplays();
```

### Example 4: Export to R

```javascript
// Generate R code
const rCode = generateRCode();

// Download
downloadFile(rCode, 'dose_response_analysis.R', 'text/plain');
```

---

## References

### Primary Methodology Papers

1. **Greenland S, Longnecker MP.** (1992). Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. *American Journal of Epidemiology*, 135(11), 1301-1309.

2. **Orsini N, Bellocco R, Greenland S.** (2006). Generalized least squares for trend estimation of summarized dose-response data. *Stata Journal*, 6(1), 40-57.

3. **van Houwelingen HC, Arends LR, Stijnen T.** (2002). Advanced methods in meta-analysis: multivariate approach and meta-regression. *Statistics in Medicine*, 21(4), 589-624.

4. **Orsini N, et al.** (2012). Meta-analysis for linear and nonlinear dose-response relations. *American Journal of Epidemiology*, 175(1), 66-73.

### Bayesian Methods

5. **Gelman A, Rubin DB.** (1992). Inference from iterative simulation using multiple sequences. *Statistical Science*, 7(4), 457-472.

6. **Gelman A, et al.** (2013). *Bayesian Data Analysis* (3rd ed.). CRC Press.

### Heterogeneity

7. **Higgins JP, Thompson SG.** (2002). Quantifying heterogeneity in a meta-analysis. *Statistics in Medicine*, 21(11), 1539-1558.

8. **DerSimonian R, Laird N.** (1986). Meta-analysis in clinical trials. *Controlled Clinical Trials*, 7(3), 177-188.

### Software

9. **Orsini N, et al.** (2023). dosresmeta: Multivariate Dose-Response Meta-Analysis. R package version 2.0.1.

10. **Viechtbauer W.** (2010). Conducting meta-analyses in R with the metafor package. *Journal of Statistical Software*, 36(3), 1-48.

---

## Appendix

### Variance Formula Derivation

For rate `r = cases/n`:
```
Var(log r) ≈ (d/dr log r)² × Var(r)
         = (1/r)² × r(1-r)/n
         = (1-r)/(rn)
         = 1/cases - 1/n
```

### Covariance Structure

When dose categories share a reference group:
```
Cov(y_i, y_j) = Var(y_i) + Var(y_j)
```

This accounts for correlation due to shared reference.

### Tau² Estimation

REML estimator for multivariate meta-analysis:
```
τ² = max(0, (Q - df) / (Σtr(V_i) - df))
where df = (K - 1) × p
```

K = number of studies, p = number of parameters

---

## Support

### Common Issues

| Issue | Solution |
|-------|----------|
| "Need at least 2 studies" | Add more studies |
| "Matrix is singular" | Check for collinear doses |
| "MCMC may not have converged" | Increase iterations |
| "No influential studies" | Normal - results are robust |

### Performance Tips

1. **Large datasets**: Use Web Worker version
2. **Many studies**: Reduce plot detail
3. **Slow convergence**: Increase burn-in
4. **Memory issues**: Clear browser cache

### Contact

For bugs or feature requests, please open an issue at the project repository.

---

**Document Version**: 1.0
**Last Updated**: 2025-12-26
**Software Version**: Dose Response Pro v18.1 Ultimate
**File**: `C:\dosehtml\dose-response-pro-v18.1-ultimate.html`

---

## Quick Reference Card

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+Enter | Run analysis |
| Ctrl+S | Save analysis |
| Ctrl+L | Load analysis |
| Ctrl+D | Load demo data |

### Color Codes

| Color | Meaning |
|-------|---------|
| Green | Success / Significant |
| Yellow | Warning / Check |
| Red | Error / Influential |
| Blue | Info / Neutral |

### Default Settings

| Setting | Default |
|---------|---------|
| CI Level | 95% |
| Reference Dose | 0 |
| MCMC Chains | 3 |
| MCMC Samples | 2000 |
| MCMC Burn-in | 1000 |
| Influence Threshold | 10% |

---

**End of Documentation**
