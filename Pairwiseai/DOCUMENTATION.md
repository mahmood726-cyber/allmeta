# TruthCert-PairwisePro v1.0
## Comprehensive User Documentation

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Data Input](#3-data-input)
4. [Statistical Methods](#4-statistical-methods)
5. [Heterogeneity Assessment](#5-heterogeneity-assessment)
6. [Publication Bias](#6-publication-bias)
7. [Sensitivity Analysis](#7-sensitivity-analysis)
8. [Bayesian Analysis](#8-bayesian-analysis)
9. [Clinical Translation](#9-clinical-translation)
10. [TruthCert Verdict System](#10-truthcert-verdict-system)
11. [Health Technology Assessment (HTA)](#11-health-technology-assessment)
12. [Export and Reporting](#12-export-and-reporting)
13. [Validation and Accuracy](#13-validation-and-accuracy)
14. [Troubleshooting](#14-troubleshooting)
15. [References](#15-references)

---

## 1. Introduction

### 1.1 What is TruthCert-PairwisePro?

TruthCert-PairwisePro is a comprehensive, browser-based meta-analysis platform designed for pairwise comparisons of interventions. It provides:

- **Statistical Analysis**: Seventeen tau-squared estimators, HKSJ adjustment, prediction intervals
- **Publication Bias Tools**: Egger's test, trim-and-fill, selection models, PET-PEESE
- **Clinical Translation**: NNT/NNH, GRADE assessment, E-values
- **Health Technology Assessment**: ICER, NMB, cost-effectiveness analysis
- **Evidence Verdict**: Novel 12-point threat assessment system

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| No Installation | Runs entirely in your web browser |
| Offline Capable | Works without internet after first load |
| Validated | Internal automated test suite + external oracle harness (`validation_manifest.json`) |
| Free | No cost, no registration required |
| Export | CSV, Excel, YAML, JSON, PDF, R script |

### 1.3 When to Use This Tool

**Appropriate Uses:**
- Pairwise meta-analysis of randomized controlled trials
- Observational study synthesis (with appropriate caution)
- Teaching and learning meta-analysis methods
- Rapid evidence synthesis
- Health technology assessment

**Limitations:**
- Not for network meta-analysis (use netmeta, gemtc)
- Bayesian analysis is approximate (verify with brms/RoBMA for publication)
- Multivariate models are simplified

---

## 2. Getting Started

### 2.1 Opening the Application

1. Open `TruthCert-PairwisePro-v1.0-fast.html` in a modern web browser
2. Recommended browsers: Chrome, Firefox, Edge, Safari
3. The application loads entirely client-side (no data sent to servers)

### 2.2 Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Title, Theme Toggle, Validation Badge              │
├─────────────────────────────────────────────────────────────┤
│  Navigation Tabs:                                           │
│  [Data] [Analysis] [Heterogeneity] [Validation] [Verdict]  │
│  [HTA] [Report]                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Main Content Area                                          │
│  (Changes based on selected tab)                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Footer: Export Options, Help, Settings                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Quick Start Guide

1. **Select Data Type**: Binary, Continuous, HR, Proportion, Generic, Correlation
2. **Enter Data**: Paste from spreadsheet or enter manually
3. **Choose Method**: Select tau² estimator (REML recommended)
4. **Run Analysis**: Click "Analyze" button
5. **Review Results**: Forest plot, heterogeneity, publication bias
6. **Export**: Download results in preferred format

---

## 3. Data Input

### 3.1 Supported Data Types

#### Binary Outcomes (2×2 Tables)

| Column | Description | Example |
|--------|-------------|---------|
| study | Study identifier | "Smith 2020" |
| ai | Events in treatment | 23 |
| bi | Non-events in treatment | 77 |
| ci | Events in control | 45 |
| di | Non-events in control | 55 |

**Effect Measures Available:**
- Odds Ratio (OR) - log scale
- Risk Ratio (RR) - log scale
- Risk Difference (RD) - absolute scale

#### Continuous Outcomes

| Column | Description | Example |
|--------|-------------|---------|
| study | Study identifier | "Jones 2021" |
| m1 | Mean in treatment | 25.3 |
| sd1 | SD in treatment | 8.2 |
| n1 | Sample size treatment | 50 |
| m2 | Mean in control | 30.1 |
| sd2 | SD in control | 9.0 |
| n2 | Sample size control | 48 |

**Effect Measures Available:**
- Standardized Mean Difference (SMD/Hedges' g)
- Mean Difference (MD)

#### Hazard Ratios (Time-to-Event)

| Column | Description | Example |
|--------|-------------|---------|
| study | Study identifier | "Trial A" |
| hr | Hazard ratio | 0.75 |
| ci_lower | 95% CI lower | 0.58 |
| ci_upper | 95% CI upper | 0.97 |

#### Proportions (Single-Arm)

| Column | Description | Example |
|--------|-------------|---------|
| study | Study identifier | "Survey 1" |
| xi | Number of events | 35 |
| ni | Total sample | 200 |

**Transformations Available:**
- Logit (recommended)
- Arcsine square root
- Freeman-Tukey double arcsine

#### Generic (Pre-Calculated)

| Column | Description | Example |
|--------|-------------|---------|
| study | Study identifier | "Meta A" |
| yi | Effect estimate | -0.45 |
| vi | Variance | 0.08 |

#### Correlations

| Column | Description | Example |
|--------|-------------|---------|
| study | Study identifier | "Corr Study" |
| ri | Correlation | 0.35 |
| ni | Sample size | 150 |

### 3.2 Data Entry Methods

**Manual Entry:**
- Click cells to edit
- Tab to move between cells
- Enter to confirm

**Paste from Spreadsheet:**
1. Copy data from Excel/Google Sheets (with headers)
2. Click "Paste Data" button
3. Verify column mapping

**Load Sample Data:**
- Click "Load Sample" to try example datasets
- BCG Vaccine, SGLT2 Inhibitors, Statins, etc.

### 3.3 Continuity Corrections

For binary data with zero cells:

| Method | Formula | When to Use |
|--------|---------|-------------|
| Constant | Add 0.5 to all cells | Default, conservative |
| Treatment-arm | Proportional to group size | Unequal group sizes |
| Reciprocal | Inverse of opposite arm | Rare events |
| Empirical | Data-driven | Large meta-analyses |

---

## 4. Statistical Methods

### 4.1 Random-Effects Model

The standard random-effects model assumes:

```
yi = θ + ui + ei

where:
  yi  = observed effect in study i
  θ   = true overall effect
  ui  ~ N(0, τ²)  [between-study variance]
  ei  ~ N(0, vi)  [within-study variance]
```

### 4.2 Tau-Squared Estimators

| Method | Full Name | Description | Track |
|--------|-----------|-------------|-------|
| **REML** | Restricted ML | Iterative, unbiased | `metafor` oracle |
| DL | DerSimonian-Laird | Method of moments | `metafor` oracle |
| PM | Paule-Mandel | Iterative | `metafor` oracle |
| PMM | Paule-Mandel Median-Unbiased | Median-unbiased PM | `metafor` oracle |
| ML | Maximum Likelihood | Iterative | `metafor` oracle |
| HS | Hunter-Schmidt | Method-of-moments variant | `metafor` oracle |
| HSk | Hunter-Schmidt (k-corrected) | k-corrected HS | `metafor` oracle |
| SJ | Sidik-Jonkman | Alternative MoM | `metafor` oracle |
| HE | Hedges | Unbiased estimator | `metafor` oracle |
| EB | Empirical Bayes | Shrinkage | `metafor` oracle |
| GENQ | Generalized Q | Generalized Q estimator | `metafor` oracle |
| GENQM | Generalized Q Modified | Bias-adjusted GENQ | `metafor` oracle |
| PL | Profile Likelihood | Profile-likelihood tau² | custom |
| DL2 | Two-Step DL | Iterative DL refinement | custom |
| CA | Cochran ANOVA | ANOVA-style variance decomposition | custom |
| BMM | Binomial-Normal Marginal | Marginal likelihood variant | custom |
| QG | Q-Generalized Robust | Robust generalized Q | custom |

**Validation Status:** Oracle-supported methods are benchmarked against `metafor`; custom methods use internal consistency and regression checks. See `validation_manifest.json`.

### 4.3 Confidence Interval Methods

#### Standard Wald CI
```
θ̂ ± z(1-α/2) × SE(θ̂)
```
Uses normal distribution. May undercover when k is small.

#### HKSJ Adjustment (Recommended for k < 20)
```
θ̂ ± t(k-1, 1-α/2) × SE_HKSJ(θ̂)

SE_HKSJ = SE × √(q/k-1)

where q = Σ wi(yi - θ̂)² / Σ wi
```

Uses t-distribution with k-1 degrees of freedom. Provides better coverage for small meta-analyses.

**Reference:** Hartung & Knapp (2001), IntHout et al. (2014)

### 4.4 Prediction Interval

The prediction interval estimates the range where 95% of future study effects would fall:

```
PI = θ̂ ± t(k-2, 0.975) × √(τ² + SE²)
```

**Interpretation:** Even if the pooled effect is statistically significant, a prediction interval crossing the null suggests the effect may not be consistent across settings.

### 4.5 Fixed-Effect Model

When τ² = 0 or when assuming homogeneity:

```
θ̂_FE = Σ(wi × yi) / Σwi

where wi = 1/vi
```

Use fixed-effect when:
- Studies are functionally identical
- Interest is in the specific studies analyzed
- τ² estimate is near zero

---

## 5. Heterogeneity Assessment

### 5.1 Cochran's Q Statistic

```
Q = Σ wi(yi - θ̂)²

Under H0: Q ~ χ²(k-1)
```

**Interpretation:**
- p < 0.10 suggests significant heterogeneity
- Low power when k is small
- Does not quantify magnitude

### 5.2 I-Squared (I²)

```
I² = max(0, (Q - df) / Q × 100%)

where df = k - 1
```

| I² Value | Interpretation |
|----------|----------------|
| 0-25% | Low heterogeneity |
| 25-50% | Moderate heterogeneity |
| 50-75% | Substantial heterogeneity |
| >75% | Considerable heterogeneity |

**Note:** I² describes the proportion of variability due to heterogeneity, not absolute magnitude.

### 5.3 Tau-Squared (τ²)

The between-study variance on the effect size scale.

**Interpretation depends on effect measure:**
- For log OR: τ² = 0.04 means 95% of true ORs fall within exp(±2×0.2) = [0.67, 1.49]
- For SMD: τ² = 0.1 means 95% of true SMDs fall within ±0.63

### 5.4 H-Squared

```
H² = Q / (k-1)
```

H² = 1 indicates homogeneity; H² > 1 indicates heterogeneity.

### 5.5 Heterogeneity Confidence Intervals

The application provides confidence intervals for τ² using:
- Q-Profile method (default)
- Profile likelihood (for REML/ML)

---

## 6. Publication Bias

### 6.1 Funnel Plot

Plots effect size (x-axis) against precision (y-axis, typically 1/SE).

**Interpreting Asymmetry:**
- Symmetric funnel: No evidence of small-study effects
- Gap in bottom-right: Missing non-significant small studies
- Gap in bottom-left: Missing significant small studies (rare)

**Caution:** Asymmetry can be caused by:
- Publication bias
- True heterogeneity
- Methodological differences
- Chance (especially when k < 10)

### 6.2 Egger's Regression Test

```
yi/SEi = β0 + β1 × (1/SEi) + εi
```

Tests whether the intercept (β0) differs from zero.

| Egger p-value | Interpretation |
|---------------|----------------|
| > 0.10 | No evidence of asymmetry |
| 0.05-0.10 | Weak evidence |
| < 0.05 | Evidence of asymmetry |

**Limitations:**
- Low power when k < 10
- Can be misleading with substantial heterogeneity
- Not appropriate for binary outcomes with rare events (use Peters' test)

### 6.3 Peters' Test

For binary outcomes, uses total sample size instead of SE:

```
yi = β0 + β1 × (1/n) + εi
```

More appropriate than Egger's test for odds ratios with rare events.

### 6.4 Trim-and-Fill

Algorithm:
1. Estimate number of "missing" studies (k0)
2. Impute symmetric counterparts
3. Re-estimate pooled effect

**Output:**
- k0: Number of imputed studies
- Adjusted effect estimate
- Direction of imputation (left/right)

**Caution:** Assumes asymmetry is due to publication bias. May overcorrect if heterogeneity is the cause.

### 6.5 PET-PEESE

**PET (Precision-Effect Test):**
```
yi = β0 + β1 × SEi + εi
```
Use PET estimate if PET p > 0.05

**PEESE (Precision-Effect Estimate with Standard Error):**
```
yi = β0 + β1 × SE²i + εi
```
Use PEESE estimate if PET p < 0.05

**Conditional Logic:**
```
If PET p > 0.05: Report PET β0 (no evidence of bias)
If PET p ≤ 0.05: Report PEESE β0 (corrected estimate)
```

### 6.6 Selection Models

Three-parameter selection model assuming:
- One-tailed selection on p-values
- Probability of publication varies by significance

**Output:**
- Adjusted effect estimate
- Selection parameters
- Likelihood ratio test

**Note:** This is a simplified implementation. For publication-quality results, use `metafor::selmodel()`.

### 6.7 P-Curve Analysis

Tests for evidential value by examining the distribution of significant p-values.

**Interpretation:**
- Right-skewed (more p < 0.025): Evidence of true effect
- Flat: No evidential value
- Left-skewed: Evidence of p-hacking

---

## 7. Sensitivity Analysis

### 7.1 Leave-One-Out Analysis

Sequentially removes each study and re-estimates:
- Effect size
- Heterogeneity
- Significance

**Interpretation:**
- Identify influential studies
- Check robustness of conclusions
- Flag potential outliers

### 7.2 Cumulative Meta-Analysis

Orders studies by:
- Publication year (temporal trends)
- Precision (small-study effects)
- Effect size (extremes first)

Shows how evidence accumulated over time.

### 7.3 Influence Diagnostics

| Diagnostic | Formula | Threshold |
|------------|---------|-----------|
| DFBETAS | Change in θ̂ | > 2/√k |
| Cook's D | Overall influence | > 4/k |
| Hat values | Leverage | > 2×mean |
| Studentized residuals | Outliers | > ±2.5 |

### 7.4 GOSH Plot

Graphical Overview of Study Heterogeneity:
- Runs all 2^k subset analyses
- Plots I² vs effect size
- Identifies heterogeneity sources

**Note:** Computationally intensive for k > 15.

---

## 8. Bayesian Analysis

### 8.1 Method Overview

TruthCert-PairwisePro uses Metropolis-Hastings MCMC for Bayesian estimation.

**Priors:**
- θ ~ N(0, 10²) - weakly informative
- τ ~ Half-Cauchy(0, 1) - recommended for heterogeneity

### 8.2 MCMC Diagnostics

| Diagnostic | Target | Warning |
|------------|--------|---------|
| R-hat | < 1.1 | > 1.1 indicates non-convergence |
| ESS | > 400 | < 100 indicates poor mixing |
| Trace plots | Stationary | Trends indicate problems |

### 8.3 Bayes Factor

Calculated using Savage-Dickey density ratio with importance sampling correction.

| BF10 | Interpretation |
|------|----------------|
| > 100 | Decisive evidence for H1 |
| 30-100 | Very strong evidence |
| 10-30 | Strong evidence |
| 3-10 | Moderate evidence |
| 1-3 | Anecdotal evidence |
| 1/3-1 | Anecdotal evidence for H0 |
| < 1/3 | Moderate+ evidence for H0 |

### 8.4 Limitations

**Important:** The Bayesian implementation uses Metropolis-Hastings MCMC, not the more efficient NUTS sampler. For publication-quality Bayesian meta-analysis:

- Verify results with `brms` or `RoBMA` in R
- Consider formal model comparison with bridge sampling
- Use more informative priors based on domain knowledge

---

## 9. Clinical Translation

### 9.1 Number Needed to Treat (NNT)

```
NNT = 1 / ARR = 1 / (CER × (1 - RR))

where:
  ARR = Absolute Risk Reduction
  CER = Control Event Rate
  RR  = Risk Ratio
```

**Interpretation:** Number of patients who need to be treated for one additional patient to benefit.

### 9.2 E-Value

Measures robustness to unmeasured confounding:

```
E-value = RR + √(RR × (RR - 1))
```

**Interpretation:** An unmeasured confounder would need to be associated with both treatment and outcome by at least the E-value to explain away the observed effect.

### 9.3 GRADE Assessment

Evaluates certainty of evidence across 5 domains:

| Domain | Downgrade Reasons |
|--------|-------------------|
| Risk of Bias | High/unclear risk in >50% of studies |
| Inconsistency | I² > 50% or significant Q test |
| Indirectness | PICO mismatch |
| Imprecision | Wide CI, OIS not met |
| Publication Bias | Significant Egger test, asymmetric funnel |

**Certainty Levels:** High → Moderate → Low → Very Low

---

## 10. TruthCert Verdict System

### 10.1 Threat Ledger

12-point assessment of evidence quality:

| # | Threat | Trigger | Severity |
|---|--------|---------|----------|
| 1 | Underpowered | Total N < OIS | 1-2 |
| 2 | Sparse | k < 5 | 1-2 |
| 3 | High Heterogeneity | I² > 75% | 1-2 |
| 4 | Inconsistent Direction | PI crosses null | 1 |
| 5 | Small-Study Effects | Egger p < 0.10 | 1-2 |
| 6 | Publication Bias | Trim-fill changes conclusion | 2 |
| 7 | Fragile | Single study drives result | 1-2 |
| 8 | Imprecise | 95% CI crosses clinical threshold | 1 |
| 9 | Confounded | E-value < 2 | 1-2 |
| 10 | Single Large Trial | >50% weight in one study | 1 |
| 11 | Risk of Bias | High RoB in majority | 1-2 |
| 12 | Temporal Instability | Cumulative MA unstable | 1 |

### 10.2 Severity Score

```
Total Severity = Σ (Triggered Threats × Severity Weight)

Maximum = 13
```

### 10.3 Verdict Categories

| Verdict | Severity | Interpretation |
|---------|----------|----------------|
| **STABLE** | 0-2 | Evidence is robust |
| **STABLE-NID** | 0-2 + PI issue | Robust but needs investigation |
| **MODERATE** | 3-5 | Some concerns |
| **EXPOSED** | 6-8 | Significant threats |
| **UNCERTAIN** | 9+ | Evidence unreliable |

---

## 11. Health Technology Assessment

### 11.1 S14-HTA+ Module

The HTA module translates meta-analysis results into health economic outputs.

### 11.2 Key Metrics

**ICER (Incremental Cost-Effectiveness Ratio):**
```
ICER = (Cost_intervention - Cost_comparator) / (QALY_intervention - QALY_comparator)
```

**NMB (Net Monetary Benefit):**
```
NMB = (ΔQALY × WTP) - ΔCost
```

### 11.3 HTA Workflow

1. **Configure** baseline parameters (costs, utilities, risks)
2. **Import** meta-analysis results (RR, HR, or NNT)
3. **Run** deterministic sensitivity analysis (DSA)
4. **View** tornado diagram, CE plane, CEAC
5. **Generate** HTA recommendation (Tier A/B/C/D)

### 11.4 Recommendation Tiers

| Tier | Verdict + Economics | Recommendation |
|------|---------------------|----------------|
| A | STABLE + Cost-effective | Adopt |
| B | MODERATE + Favorable | Adopt with monitoring |
| C | EXPOSED + Uncertain | Pilot program |
| D | UNCERTAIN + Unfavorable | Do not adopt |

---

## 12. Export and Reporting

### 12.1 Export Formats

| Format | Contents | Use Case |
|--------|----------|----------|
| CSV | Study data + results | Spreadsheet analysis |
| Excel | Multi-sheet workbook | Full results |
| YAML | Structured data | Configuration |
| JSON | Machine-readable | API integration |
| PDF | Formatted report | Publication |
| R Script | Reproducible analysis | Verification |

### 12.2 R Script Export

Generates reproducible metafor code:

```r
library(metafor)

# Study data
dat <- data.frame(
  study = c("Study 1", "Study 2", ...),
  yi = c(-0.45, -0.32, ...),
  vi = c(0.08, 0.12, ...)
)

# Random-effects model
res <- rma(yi, vi, data = dat, method = "REML")
summary(res)

# Forest plot
forest(res, slab = dat$study)

# Funnel plot
funnel(res)

# Egger's test
regtest(res)
```

### 12.3 Session Management

- **Save Session**: Downloads current analysis state as JSON
- **Load Session**: Restores previous analysis
- **Auto-save**: Browser localStorage backup

---

## 13. Validation and Accuracy

### 13.1 Validation Summary

| Test Category | Tests | Passed | Status |
|---------------|-------|--------|--------|
| Tau² Estimators (8) | 128 | 128 | ✓ |
| HKSJ Adjustment | 16 | 16 | ✓ |
| Prediction Intervals | 16 | 16 | ✓ |
| Egger's Test | 8 | 8 | ✓ |
| Trim-and-Fill | 7 | 7 | ✓ |
| Leave-One-Out | 16 | 16 | ✓ |
| **Total** | **191** | **191** | **100%** |

### 13.2 Benchmark Datasets

**Real-World:**
- BCG Vaccine (Colditz 1994) - 13 studies
- Teacher Expectancy (Raudenbush 1985) - 19 studies
- Conscientiousness (Molloy 2014) - 16 studies

**Edge Cases:**
- k = 2 (minimum)
- k = 50 (large)
- τ² = 0 (homogeneous)
- I² > 90% (high heterogeneity)
- Null effect (θ ≈ 0)

### 13.3 Tolerance Thresholds

| Metric | Tolerance |
|--------|-----------|
| Effect estimate (θ) | < 0.001 |
| Standard error | < 0.01 |
| Tau-squared (τ²) | < 0.01 |
| I-squared (I²) | < 1% |

### 13.4 Self-Validation

Run in browser console:
```javascript
showValidationResults();
// Returns: { passed: 191, failed: 0, passRate: "100.0%" }
```

### 13.5 Simulation Studies: Model Misspecification

We conducted Monte Carlo simulations (n=1,000 per scenario) using metafor 4.8.0 in R 4.5.2 to evaluate REML estimator performance under various model violations.

#### Results Summary

| Scenario | k=10 Coverage | k=50 Coverage | Assessment |
|----------|--------------|--------------|------------|
| **Correct specification** | 92.7% | 94.1% | Acceptable |
| **Non-normal effects (t, df=3)** | 93.9% | 94.5% | Robust |
| **10% Outliers** | 95.7% | 93.9% | Acceptable |
| **Variance underestimated (30%)** | 91.7% | 94.9% | Moderate |
| **Publication bias (50%)** | 82.8% | **58.1%** | **CRITICAL** |
| **Dependent studies (rho=0.5)** | 77.7% | **55.5%** | **CRITICAL** |
| **Small sample (k=3)** | 93.4% | - | Use HKSJ |
| **Heteroscedastic tau2** | 91.3% | 92.9% | Low impact |

*Target coverage: 95%*

#### Critical Findings

1. **Publication Bias**: Causes severe undercoverage (58.1% at k=50). Standard methods are unreliable when publication bias is present. Use trim-and-fill, selection models, or PET-PEESE.

2. **Dependent Studies**: Ignoring dependence causes severe undercoverage (55.5% at k=50). Use robust variance estimation (RVE) or multilevel models.

3. **Egger Test Power**: Only 13-16% power to detect publication bias. A non-significant Egger test does NOT rule out publication bias.

4. **HKSJ Adjustment**: Improves small-sample (k=3) coverage from 93.4% to 94.3%. Always use HKSJ when k < 20.

#### Recommendations

- **Always use HKSJ** adjustment for small meta-analyses (k < 20)
- **Never trust** standard meta-analysis when publication bias is suspected
- **Use RVE** when studies are from same research group or share data
- **Verify variance** estimates from primary studies when possible
- **Do not rely** solely on Egger test to rule out publication bias

### 13.6 Known Approximations

| Method | Approximation | Alternative |
|--------|---------------|-------------|
| Chi-squared quantiles | Wilson-Hilferty | — |
| Bayes Factor | Importance sampling | brms::bayes_factor() |
| Selection models | 3-parameter | metafor::selmodel() |
| MCMC | Metropolis-Hastings | Stan/NUTS |

---

## 14. Troubleshooting

### 14.1 Common Issues

**"No studies entered"**
- Ensure at least 2 studies are in the data table
- Check that required columns are filled

**"Invalid variance"**
- Variance (vi) must be positive
- Check for data entry errors (e.g., SE entered instead of variance)

**"Convergence failed"**
- Try different tau² estimator (DL instead of REML)
- Check for extreme outliers
- Ensure sufficient studies (k ≥ 3)

**"MCMC did not converge"**
- Increase number of iterations
- Check for extreme data values
- Try different prior settings

### 14.2 Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✓ Full support |
| Firefox | 85+ | ✓ Full support |
| Edge | 90+ | ✓ Full support |
| Safari | 14+ | ✓ Full support |
| IE | Any | ✗ Not supported |

### 14.3 Performance Tips

- For k > 100, disable GOSH plot
- Use DL instead of REML for very large meta-analyses
- Close other browser tabs to free memory
- Clear browser cache if experiencing slowness

---

## 15. References

### Core Methods

1. **DerSimonian R, Laird N** (1986). Meta-analysis in clinical trials. *Controlled Clinical Trials*, 7(3), 177-188.

2. **Viechtbauer W** (2010). Conducting meta-analyses in R with the metafor package. *Journal of Statistical Software*, 36(3), 1-48.

3. **Hartung J, Knapp G** (2001). On tests of the overall treatment effect in meta-analysis with normally distributed responses. *Statistics in Medicine*, 20(12), 1771-1782.

4. **Higgins JPT, Thompson SG** (2002). Quantifying heterogeneity in a meta-analysis. *Statistics in Medicine*, 21(11), 1539-1558.

### Publication Bias

5. **Egger M, et al.** (1997). Bias in meta-analysis detected by a simple, graphical test. *BMJ*, 315(7109), 629-634.

6. **Duval S, Tweedie R** (2000). Trim and fill: a simple funnel-plot-based method of testing and adjusting for publication bias in meta-analysis. *Biometrics*, 56(2), 455-463.

7. **Stanley TD, Doucouliagos H** (2014). Meta-regression approximations to reduce publication selection bias. *Research Synthesis Methods*, 5(1), 60-78.

### Clinical Translation

8. **VanderWeele TJ, Ding P** (2017). Sensitivity analysis in observational research: introducing the E-value. *Annals of Internal Medicine*, 167(4), 268-274.

9. **Guyatt GH, et al.** (2008). GRADE: an emerging consensus on rating quality of evidence and strength of recommendations. *BMJ*, 336(7650), 924-926.

### Textbooks

10. **Borenstein M, et al.** (2009). *Introduction to Meta-Analysis*. Wiley.

11. **Higgins JPT, Green S** (eds). *Cochrane Handbook for Systematic Reviews of Interventions*. Cochrane Collaboration.

---

## Appendix A: Formula Reference

### Effect Size Calculations

**Log Odds Ratio:**
```
ln(OR) = ln((ai × di) / (bi × ci))
Var(ln OR) = 1/ai + 1/bi + 1/ci + 1/di
```

**Log Risk Ratio:**
```
ln(RR) = ln((ai/(ai+bi)) / (ci/(ci+di)))
Var(ln RR) = 1/ai - 1/(ai+bi) + 1/ci - 1/(ci+di)
```

**Standardized Mean Difference (Hedges' g):**
```
g = J × (m1 - m2) / Sp

J = 1 - 3/(4×df - 1)  [small-sample correction]
Sp = √(((n1-1)×sd1² + (n2-1)×sd2²) / (n1+n2-2))
Var(g) = (n1+n2)/(n1×n2) + g²/(2×(n1+n2))
```

**Fisher's z (Correlation):**
```
z = 0.5 × ln((1+r)/(1-r))
Var(z) = 1/(n-3)
```

### Pooled Estimates

**Random-Effects:**
```
θ̂ = Σ(wi* × yi) / Σwi*
wi* = 1/(vi + τ²)
Var(θ̂) = 1/Σwi*
```

**DerSimonian-Laird τ²:**
```
τ²_DL = max(0, (Q - (k-1)) / C)
C = Σwi - Σwi²/Σwi
```

---

## Appendix B: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Enter | Run analysis |
| Ctrl+S | Save session |
| Ctrl+E | Export results |
| Ctrl+Z | Undo (data entry) |
| Tab | Next field |
| Shift+Tab | Previous field |
| Esc | Close modal |

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Effect size** | Standardized measure of treatment effect |
| **Heterogeneity** | Variability in true effects across studies |
| **I²** | Percentage of variability due to heterogeneity |
| **τ²** | Between-study variance |
| **HKSJ** | Hartung-Knapp-Sidik-Jonkman adjustment |
| **Prediction interval** | Range for future study effects |
| **Funnel plot** | Scatter plot of effect vs. precision |
| **Publication bias** | Selective reporting of significant results |
| **E-value** | Robustness to unmeasured confounding |
| **NNT** | Number needed to treat |
| **ICER** | Incremental cost-effectiveness ratio |

---

*Documentation Version: 1.0*
*Last Updated: December 2024*
*TruthCert-PairwisePro v1.0*
