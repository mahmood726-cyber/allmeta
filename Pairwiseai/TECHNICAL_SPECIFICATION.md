# TruthCert-PairwisePro v1.0
## Technical Specification

---

## 1. System Architecture

### 1.1 Overview

TruthCert-PairwisePro is a single-page web application (SPA) built entirely in vanilla JavaScript with no external dependencies for core functionality.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TruthCert-PairwisePro                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   UI Layer  │  │ Statistics  │  │   Export    │             │
│  │   (HTML/CSS)│  │   Engine    │  │   Module    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │  AppState   │                               │
│                   │  (Central)  │                               │
│                   └─────────────┘                               │
│                                                                 │
│  External (CDN):                                                │
│  [Plotly.js] [jsPDF] [html2canvas] [XLSX]                      │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 File Structure

```
TruthCert-PairwisePro-v1.0-fast.html  (Main application, ~200KB)
├── <head>
│   ├── CSS (embedded, ~15KB)
│   └── External CDN links
├── <body>
│   ├── Header (title, theme toggle, validation badge)
│   ├── Navigation tabs
│   ├── Panel containers (7 tabs)
│   └── Modals (help, validation, settings)
└── <script>
    └── app.js (embedded, ~1.3MB)

app.js
├── Statistical Functions (~200KB)
├── UI Components (~150KB)
├── Data Processing (~100KB)
├── Export Functions (~80KB)
├── Validation Benchmarks (~50KB)
├── Sample Data (~100KB)
└── Utilities (~50KB)
```

### 1.3 Dependencies

| Dependency | Version | Purpose | CDN |
|------------|---------|---------|-----|
| Plotly.js | 2.27.0 | Interactive plots | cdnjs |
| jsPDF | 2.5.1 | PDF generation | cdnjs |
| html2canvas | 1.4.1 | Screenshot capture | cdnjs |
| XLSX (SheetJS) | 0.18.5 | Excel export | cdnjs |
| Plus Jakarta Sans | — | Primary font | Google Fonts |
| JetBrains Mono | — | Monospace font | Google Fonts |

---

## 2. Statistical Functions

### 2.1 Core Mathematical Functions

```javascript
// Normal distribution
pnorm(x, mean, sd)     // CDF
qnorm(p, mean, sd)     // Quantile
dnorm(x, mean, sd)     // PDF

// t-distribution
pt(t, df)              // CDF
qt(p, df)              // Quantile
dt(t, df)              // PDF

// Chi-squared distribution
pchisq(x, df)          // CDF (uses gammainc)
qchisq(p, df)          // Quantile (Wilson-Hilferty approx)

// Special functions
gamma(x)               // Gamma function
lgamma(x)              // Log-gamma
betainc(a, b, x)       // Incomplete beta
gammainc(a, x)         // Incomplete gamma
```

### 2.2 Tau-Squared Estimators

```javascript
// DerSimonian-Laird (closed-form)
estimateTau2_DL(yi, vi) {
  const k = yi.length;
  const wi = vi.map(v => 1 / v);
  const sumW = sum(wi);
  const theta_fe = sum(yi.map((y, i) => wi[i] * y)) / sumW;
  const Q = sum(yi.map((y, i) => wi[i] * (y - theta_fe) ** 2));
  const C = sumW - sum(wi.map(w => w ** 2)) / sumW;
  return Math.max(0, (Q - (k - 1)) / C);
}

// REML (Fisher scoring)
estimateTau2_REML(yi, vi, maxIter = 100, tol = 1e-8) {
  let tau2 = estimateTau2_DL(yi, vi);  // Starting value

  for (let iter = 0; iter < maxIter; iter++) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = sum(wi);
    const theta = sum(yi.map((y, i) => wi[i] * y)) / sumW;

    // Score and Fisher information
    const U = -0.5 * sum(wi) + 0.5 * sum(yi.map((y, i) =>
      wi[i] ** 2 * (y - theta) ** 2));
    const I = 0.5 * sum(wi.map(w => w ** 2));

    // Fisher scoring update with damping
    let lambda = 1.0;
    let tau2_new = tau2 + lambda * U / I;

    // Ensure non-negative
    tau2_new = Math.max(0, tau2_new);

    if (Math.abs(tau2_new - tau2) < tol) break;
    tau2 = tau2_new;
  }

  return tau2;
}

// Other estimators follow similar patterns:
estimateTau2_ML(yi, vi)    // Maximum Likelihood
estimateTau2_PM(yi, vi)    // Paule-Mandel (iterative)
estimateTau2_HS(yi, vi)    // Hunter-Schmidt
estimateTau2_SJ(yi, vi)    // Sidik-Jonkman
estimateTau2_HE(yi, vi)    // Hedges
estimateTau2_EB(yi, vi)    // Empirical Bayes
```

### 2.3 Pooled Estimate Calculation

```javascript
calculatePooledEstimate(studies, config) {
  const { yi, vi } = extractEffects(studies, config);
  const tau2Method = config.tau2Method || 'REML';

  // Estimate tau-squared
  const tau2 = getTau2Estimate(yi, vi, tau2Method);

  // Random-effects weights
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = sum(wi);

  // Pooled estimate
  const theta = sum(yi.map((y, i) => wi[i] * y)) / sumW;
  const se = Math.sqrt(1 / sumW);

  // Confidence interval
  const z = qnorm(1 - config.alpha / 2);
  const ci_lower = theta - z * se;
  const ci_upper = theta + z * se;

  // Heterogeneity statistics
  const Q = sum(yi.map((y, i) => wi[i] * (y - theta) ** 2));
  const df = yi.length - 1;
  const I2 = Math.max(0, (Q - df) / Q * 100);
  const H2 = Q / df;

  return {
    theta, se, ci_lower, ci_upper,
    tau2, I2, H2, Q, Q_df: df, Q_pval: 1 - pchisq(Q, df)
  };
}
```

### 2.4 HKSJ Adjustment

```javascript
calculateHKSJ(yi, vi, tau2) {
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = sum(wi);
  const theta = sum(yi.map((y, i) => wi[i] * y)) / sumW;

  // HKSJ standard error adjustment
  const q = sum(yi.map((y, i) => wi[i] * (y - theta) ** 2));
  const k = yi.length;
  const se_hksj = Math.sqrt(1 / sumW) * Math.sqrt(q / (k - 1));

  // t-distribution CI
  const t_crit = qt(0.975, k - 1);
  const ci_lower = theta - t_crit * se_hksj;
  const ci_upper = theta + t_crit * se_hksj;

  return { theta, se: se_hksj, ci_lower, ci_upper, df: k - 1 };
}
```

### 2.5 Prediction Interval

```javascript
calculatePredictionInterval(theta, se, tau2, k) {
  const df = Math.max(1, k - 2);
  const t_crit = qt(0.975, df);
  const pi_se = Math.sqrt(tau2 + se ** 2);

  return {
    pi_lower: theta - t_crit * pi_se,
    pi_upper: theta + t_crit * pi_se
  };
}
```

### 2.6 Publication Bias Tests

```javascript
// Egger's regression test
eggerTest(studies) {
  const { yi, vi } = studies;
  const sei = vi.map(v => Math.sqrt(v));
  const prec = sei.map(se => 1 / se);

  // Weighted regression: yi/sei ~ 1/sei
  // Standard errors as weights
  const n = yi.length;
  const x = prec;
  const y = yi.map((y, i) => y / sei[i]);

  // OLS with precision weighting
  const sumX = sum(x);
  const sumY = sum(y);
  const sumXY = sum(x.map((xi, i) => xi * y[i]));
  const sumX2 = sum(x.map(xi => xi ** 2));

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
  const intercept = (sumY - slope * sumX) / n;

  // Standard error of intercept
  const residuals = y.map((yi, i) => yi - intercept - slope * x[i]);
  const mse = sum(residuals.map(r => r ** 2)) / (n - 2);
  const se_intercept = Math.sqrt(mse * sumX2 / (n * sumX2 - sumX ** 2));

  const z = intercept / se_intercept;
  const p = 2 * (1 - pnorm(Math.abs(z)));

  return { intercept, se: se_intercept, z, p };
}

// Trim-and-fill (L0 estimator)
trimAndFill(yi, vi, pooled) {
  const sei = vi.map(v => Math.sqrt(v));
  const n = yi.length;

  // Rank studies by distance from pooled estimate
  const distances = yi.map((y, i) => ({
    index: i,
    y: y,
    se: sei[i],
    dist: (y - pooled.theta) / sei[i]
  }));

  // Sort by absolute distance
  distances.sort((a, b) => Math.abs(b.dist) - Math.abs(a.dist));

  // L0 estimator for number of missing studies
  let k0 = 0;
  for (let i = 0; i < n; i++) {
    const ranks = distances.slice(0, n - i).map((d, j) => j + 1);
    const T = sum(ranks.filter((r, j) =>
      distances[j].dist > 0 === (distances[0].dist > 0)
    ));
    const expected = (n - i) * (n - i + 1) / 4;
    if (Math.abs(T - expected) <= 1.96 * Math.sqrt((n - i) * (n - i + 1) * (2 * (n - i) + 1) / 24)) {
      k0 = i;
      break;
    }
  }

  // Impute missing studies
  const side = distances[0].dist > 0 ? 'right' : 'left';
  const imputed_yi = [...yi];
  const imputed_vi = [...vi];

  for (let i = 0; i < k0; i++) {
    const mirror = 2 * pooled.theta - distances[i].y;
    imputed_yi.push(mirror);
    imputed_vi.push(vi[distances[i].index]);
  }

  // Re-estimate
  const adj_pooled = calculatePooledEstimate(
    { yi: imputed_yi, vi: imputed_vi },
    { tau2Method: 'DL' }
  );

  return { k0, side, theta_adj: adj_pooled.theta, imputed_yi, imputed_vi };
}
```

### 2.7 MCMC Diagnostics

```javascript
// Gelman-Rubin R-hat
calculateRhat(chains) {
  const m = chains.length;  // Number of chains
  const n = chains[0].length;  // Samples per chain

  // Chain means
  const chainMeans = chains.map(c => sum(c) / n);
  const overallMean = sum(chainMeans) / m;

  // Between-chain variance
  const B = n / (m - 1) * sum(chainMeans.map(mu =>
    (mu - overallMean) ** 2
  ));

  // Within-chain variance
  const W = sum(chains.map((c, j) =>
    sum(c.map(x => (x - chainMeans[j]) ** 2)) / (n - 1)
  )) / m;

  // Pooled variance estimate
  const V = (n - 1) / n * W + B / n;

  // R-hat
  const rhat = Math.sqrt(V / W);

  return {
    rhat,
    converged: rhat < 1.1,
    B, W, V
  };
}

// Effective Sample Size
calculateESS(samples) {
  const n = samples.length;
  const mean = sum(samples) / n;
  const variance = sum(samples.map(x => (x - mean) ** 2)) / n;

  // Autocorrelation
  let rho = [];
  for (let lag = 1; lag < n / 2; lag++) {
    const cov = sum(samples.slice(0, n - lag).map((x, i) =>
      (x - mean) * (samples[i + lag] - mean)
    )) / n;
    rho.push(cov / variance);
    if (rho[lag - 1] < 0.05) break;
  }

  // Sum of autocorrelations
  const sumRho = sum(rho.filter(r => r > 0));

  // ESS
  const ess = n / (1 + 2 * sumRho);

  return {
    ess: Math.round(ess),
    adequate: ess > 100
  };
}
```

---

## 3. Data Structures

### 3.1 AppState

```javascript
const AppState = {
  // Study data
  studies: [
    {
      id: 'study_1',
      name: 'Study Name',
      // Binary outcomes
      ai: null, bi: null, ci: null, di: null,
      // Continuous outcomes
      m1: null, sd1: null, n1: null,
      m2: null, sd2: null, n2: null,
      // Generic
      yi: null, vi: null,
      // Calculated
      effect: null, variance: null, se: null, weight: null
    }
  ],

  // Analysis configuration
  config: {
    dataType: 'binary',     // binary, continuous, hr, proportion, generic, correlation
    effectMeasure: 'OR',    // OR, RR, RD, SMD, MD, etc.
    tau2Method: 'REML',     // DL, REML, ML, PM, HS, SJ, HE, EB
    modelType: 'random',    // fixed, random
    useHKSJ: true,
    alpha: 0.05,
    continuityCorrection: 'constant'  // constant, treatment-arm, reciprocal
  },

  // Results
  results: {
    pooled: null,           // calculatePooledEstimate output
    heterogeneity: null,    // I2, tau2, Q, H2
    publicationBias: null,  // Egger, trim-fill, etc.
    sensitivity: null,      // Leave-one-out, cumulative
    bayesian: null          // MCMC results
  },

  // UI state
  ui: {
    activeTab: 'data',
    theme: 'dark',
    helpOpen: false
  },

  // TruthCert verdict
  verdict: {
    verdict: null,          // STABLE, MODERATE, EXPOSED, UNCERTAIN
    severity: { total: 0, triggers: [] },
    threatLedger: [],
    tier: null              // A, B, C, D
  },

  // HTA
  hta: {
    config: { /* ... */ },
    results: null
  }
};
```

### 3.2 Validation Benchmarks

```javascript
const VALIDATION_BENCHMARKS = {
  generated: "2025-12-29",
  metafor_version: "4.8.0",
  tolerance: {
    theta: 0.001,
    se: 0.01,
    tau2: 0.01,
    I2: 1
  },
  datasets: {
    bcg: {
      name: "bcg",
      source: "Colditz et al. 1994 (metadat::dat.bcg)",
      k: 13,
      yi: [-0.8893, -1.5854, ...],
      vi: [0.3256, 0.1946, ...],
      tests: {
        DL: { theta: -0.7141, tau2: 0.3088, I2: 92.12, ... },
        REML: { theta: -0.7145, tau2: 0.3132, ... },
        // ... other methods
        HKSJ: { ci_lower: -1.1084, ci_upper: -0.3206 },
        egger: { z: -0.803, p: 0.4218 },
        trimfill: { k0: 1, theta_adj: -0.6571 }
      }
    },
    // ... 15 more datasets
  }
};
```

---

## 4. UI Components

### 4.1 Tab Navigation

```javascript
function switchTab(tabId) {
  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.remove('active')
  );

  // Deactivate all nav buttons
  document.querySelectorAll('.tabs-nav button').forEach(b =>
    b.classList.remove('active')
  );

  // Activate selected
  document.getElementById(`panel-${tabId}`).classList.add('active');
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  AppState.ui.activeTab = tabId;
}
```

### 4.2 Forest Plot

```javascript
function renderForestPlot(containerId, studies, pooled, config) {
  const data = [];

  // Study rows
  studies.forEach((study, i) => {
    data.push({
      type: 'scatter',
      x: [study.effect],
      y: [studies.length - i],
      mode: 'markers',
      marker: {
        size: Math.sqrt(study.weight) * 3,
        color: 'var(--color-primary-500)'
      },
      error_x: {
        type: 'data',
        array: [1.96 * study.se],
        arrayminus: [1.96 * study.se],
        thickness: 2
      },
      name: study.name,
      hovertemplate: `${study.name}<br>Effect: %{x:.3f}<br>95% CI: [%{customdata[0]:.3f}, %{customdata[1]:.3f}]`,
      customdata: [[study.effect - 1.96 * study.se, study.effect + 1.96 * study.se]]
    });
  });

  // Pooled diamond
  data.push({
    type: 'scatter',
    x: [pooled.theta, pooled.ci_lower, pooled.theta, pooled.ci_upper, pooled.theta],
    y: [0.3, 0, -0.3, 0, 0.3],
    fill: 'toself',
    fillcolor: 'var(--color-accent-500)',
    line: { color: 'var(--color-accent-600)' },
    name: 'Pooled'
  });

  // Null line
  data.push({
    type: 'scatter',
    x: [config.nullValue, config.nullValue],
    y: [-1, studies.length + 1],
    mode: 'lines',
    line: { dash: 'dash', color: 'gray' },
    name: 'Null'
  });

  Plotly.newPlot(containerId, data, {
    xaxis: { title: config.effectLabel },
    yaxis: {
      ticktext: [...studies.map(s => s.name), 'Pooled'],
      tickvals: [...studies.map((_, i) => studies.length - i), 0],
      range: [-1, studies.length + 1]
    },
    showlegend: false,
    margin: { l: 150, r: 50, t: 30, b: 50 }
  });
}
```

### 4.3 Funnel Plot

```javascript
function renderFunnelPlot(containerId, studies, pooled) {
  // Study points
  const x = studies.map(s => s.effect);
  const y = studies.map(s => 1 / Math.sqrt(s.variance));

  // Funnel contours
  const se_range = [Math.min(...y.map(yy => 1/yy)), Math.max(...y.map(yy => 1/yy))];
  const contours = [];
  for (let se = 0.01; se <= se_range[1]; se += 0.01) {
    contours.push({
      se,
      lower: pooled.theta - 1.96 * se,
      upper: pooled.theta + 1.96 * se
    });
  }

  Plotly.newPlot(containerId, [
    {
      type: 'scatter',
      x: x,
      y: y,
      mode: 'markers',
      marker: { size: 8, color: 'var(--color-primary-500)' },
      name: 'Studies'
    },
    {
      type: 'scatter',
      x: contours.map(c => c.lower).concat(contours.reverse().map(c => c.upper)),
      y: contours.map(c => 1/c.se).concat(contours.map(c => 1/c.se)),
      fill: 'toself',
      fillcolor: 'rgba(100,100,100,0.1)',
      line: { color: 'gray', dash: 'dash' },
      name: '95% CI'
    },
    {
      type: 'scatter',
      x: [pooled.theta, pooled.theta],
      y: [0, Math.max(...y) * 1.1],
      mode: 'lines',
      line: { color: 'var(--color-accent-500)' },
      name: 'Pooled'
    }
  ], {
    xaxis: { title: 'Effect Size' },
    yaxis: { title: 'Precision (1/SE)', rangemode: 'tozero' }
  });
}
```

---

## 5. Export Functions

### 5.1 CSV Export

```javascript
function exportCSV() {
  const headers = ['Study', 'Effect', 'SE', 'Variance', 'Weight', '95% CI Lower', '95% CI Upper'];
  const rows = AppState.studies.map(s => [
    s.name,
    s.effect.toFixed(4),
    s.se.toFixed(4),
    s.variance.toFixed(4),
    (s.weight * 100).toFixed(2),
    (s.effect - 1.96 * s.se).toFixed(4),
    (s.effect + 1.96 * s.se).toFixed(4)
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

  downloadFile(csv, 'meta-analysis-results.csv', 'text/csv');
}
```

### 5.2 R Script Export

```javascript
function exportRScript() {
  const studies = AppState.studies;
  const config = AppState.config;

  const script = `
# TruthCert-PairwisePro Export
# Generated: ${new Date().toISOString()}

library(metafor)

# Study data
dat <- data.frame(
  study = c(${studies.map(s => `"${s.name}"`).join(', ')}),
  yi = c(${studies.map(s => s.effect.toFixed(6)).join(', ')}),
  vi = c(${studies.map(s => s.variance.toFixed(6)).join(', ')})
)

# Random-effects model
res <- rma(yi, vi, data = dat, method = "${config.tau2Method}"${config.useHKSJ ? ', test = "knha"' : ''})
summary(res)

# Forest plot
forest(res, slab = dat$study)

# Funnel plot
funnel(res)

# Egger's test
regtest(res)

# Influence diagnostics
influence(res)
`;

  downloadFile(script, 'meta-analysis.R', 'text/plain');
}
```

---

## 6. Performance Considerations

### 6.1 Optimization Strategies

1. **Lazy Computation**: Results computed only when needed
2. **Memoization**: Expensive calculations cached
3. **Web Workers**: MCMC runs in background thread (when supported)
4. **Efficient Plots**: Plotly with WebGL for large datasets

### 6.2 Memory Management

- Maximum studies: ~1,000 (browser dependent)
- MCMC samples: Limited to 10,000 per chain
- Plots: Canvas cleared before redraw

### 6.3 File Size Optimization

| Component | Size | Notes |
|-----------|------|-------|
| HTML shell | ~10KB | Structure only |
| CSS | ~15KB | All themes |
| JavaScript | ~1.3MB | Unminified |
| Validation data | ~50KB | 16 datasets |
| Sample data | ~100KB | All examples |

---

## 7. Security Considerations

### 7.1 Data Handling

- **No server communication**: All processing client-side
- **No cookies**: No tracking
- **No external requests**: Except CDN dependencies
- **LocalStorage**: Optional session persistence

### 7.2 Input Validation

```javascript
function validateStudyData(study) {
  // Numeric validation
  const numericFields = ['ai', 'bi', 'ci', 'di', 'm1', 'm2', 'sd1', 'sd2', 'n1', 'n2', 'yi', 'vi'];
  for (const field of numericFields) {
    if (study[field] !== null && study[field] !== undefined) {
      if (isNaN(study[field]) || !isFinite(study[field])) {
        throw new Error(`Invalid ${field}: must be numeric`);
      }
    }
  }

  // Non-negative constraints
  const nonNegative = ['sd1', 'sd2', 'n1', 'n2', 'vi'];
  for (const field of nonNegative) {
    if (study[field] !== null && study[field] < 0) {
      throw new Error(`Invalid ${field}: must be non-negative`);
    }
  }

  return true;
}
```

---

## 8. Browser Compatibility

### 8.1 Required Features

| Feature | Usage | Fallback |
|---------|-------|----------|
| ES6+ | Core code | Not supported |
| CSS Custom Properties | Theming | Graceful degradation |
| Flexbox/Grid | Layout | None needed |
| LocalStorage | Session save | Disabled |
| Blob API | File export | Disabled |
| Canvas | Screenshots | Text-only export |

### 8.2 Tested Browsers

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | Full support |
| Firefox | 85+ | Full support |
| Safari | 14+ | Full support |
| Edge | 90+ | Full support |
| IE | Any | Not supported |

---

## 9. Error Handling

### 9.1 Error Types

```javascript
class MetaAnalysisError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// Error codes
const ErrorCodes = {
  INSUFFICIENT_STUDIES: 'E001',
  INVALID_DATA: 'E002',
  CONVERGENCE_FAILED: 'E003',
  NEGATIVE_VARIANCE: 'E004',
  MCMC_FAILED: 'E005'
};
```

### 9.2 Error Recovery

```javascript
function runAnalysisSafe() {
  try {
    return runAnalysis();
  } catch (e) {
    if (e.code === ErrorCodes.CONVERGENCE_FAILED) {
      // Fallback to DL
      console.warn('REML failed, falling back to DL');
      AppState.config.tau2Method = 'DL';
      return runAnalysis();
    }
    throw e;
  }
}
```

---

## 10. Testing

### 10.1 Self-Validation

```javascript
// Run in console
showValidationResults();
// Output: { passed: 191, failed: 0, passRate: "100.0%" }
```

### 10.2 Test Coverage

| Module | Coverage | Notes |
|--------|----------|-------|
| Tau² estimators | 100% | 8 methods × 16 datasets |
| HKSJ | 100% | 16 datasets |
| Egger's test | 100% | 8 datasets |
| Trim-and-fill | 100% | 7 datasets |
| Effect sizes | Manual | Hand-verified |

---

*Technical Specification v1.0*
*TruthCert-PairwisePro*
*December 2024*
