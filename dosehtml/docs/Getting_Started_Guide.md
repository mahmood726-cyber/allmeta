# Getting Started with Dose Response Pro v18.1

## Welcome! This guide will help you perform your first dose-response meta-analysis.

---

## Table of Contents
1. [What is Dose-Response Meta-Analysis?](#what-is-dose-response-meta-analysis)
2. [Quick Start (5 Minutes)](#quick-start-5-minutes)
3. [Preparing Your Data](#preparing-your-data)
4. [Running Your First Analysis](#running-your-first-analysis)
5. [Understanding Results](#understanding-results)
6. [Common Tasks](#common-tasks)
7. [FAQ](#faq)

---

## What is Dose-Response Meta-Analysis?

Dose-response meta-analysis combines results from multiple studies to examine how the risk of an outcome changes across different levels of exposure.

**Example Question:** "How does alcohol consumption affect breast cancer risk?"

### Real-World Example

| Study | Drinks/Day | Breast Cancer Cases | Person-Years |
|-------|------------|---------------------|--------------|
| Smith 2020 | 0 (ref) | 45 | 50,000 |
| Smith 2020 | 1 | 52 | 48,000 |
| Smith 2020 | 2 | 61 | 45,000 |
| Jones 2021 | 0 (ref) | 38 | 42,000 |
| Jones 2021 | 1 | 44 | 40,000 |
| ... | ... | ... | ... |

**Goal:** Find the trend across all studies!

---

## Quick Start (5 Minutes)

### Step 1: Open the Application

1. Locate `dose-response-pro.html` in the `C:\dosehtml\` folder
2. Double-click to open in your browser (Chrome, Firefox, Edge, Safari)
3. You should see:

```
┌─────────────────────────────────────────────────┐
│  DOSE RESPONSE PRO v18.1        Ultimate Ed.   │
├─────────────────────────────────────────────────┤
│  [Data] [Results] [Plots] [Sensitivity] [...]  │
└─────────────────────────────────────────────────┘
```

### Step 2: Load Demo Data

1. Click the **Data** tab
2. Click the **"Load Demo Data"** button
3. You'll see sample alcohol/breast cancer data pre-loaded

### Step 3: Run Analysis

1. Click the **"Run Analysis"** button (top of Results tab)
2. Wait 1-3 seconds for computation
3. View your results!

### Step 4: Explore Results

- **Results Tab**: See coefficients, p-values, heterogeneity
- **Plots Tab**: View the dose-response curve
- **Sensitivity Tab**: Check if any study influences results

---

## Preparing Your Data

### Required Data Structure

Your data must include:

| Column | Description | Example |
|--------|-------------|---------|
| **Study** | Study identifier | "Smith 2020" |
| **Dose** | Exposure amount | 0, 1, 2, 3 (drinks/day) |
| **Cases** | Number of events | 45, 52, 61 |
| **N** | Sample size or person-time | 50000, 48000, 45000 |

### Data Format Options

#### Option 1: Manual Entry (Best for Small Datasets)

1. Go to **Data** tab
2. Click **"Add Study"**
3. Fill in:
   - Study name (e.g., "Smith 2020")
   - Dose categories (one per row)
   - Cases and sample size for each dose

#### Option 2: CSV Import (Best for Large Datasets)

**Prepare your CSV file:**

```csv
study,dose,cases,n
Smith 2020,0,45,50000
Smith 2020,1,52,48000
Smith 2020,2,61,45000
Smith 2020,3,58,40000
Jones 2021,0,38,42000
Jones 2021,1,44,40000
Jones 2021,2,51,38000
```

**Import steps:**
1. Go to **Data** tab
2. Click **"Import CSV"**
3. Select your file
4. Review detected columns
5. Click **"Import"**

### Common Data Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing reference group (dose=0) | Error "Need reference dose" | Add dose=0 row for each study |
| Zero cases | Warnings about log(0) | Add 0.5 to all cases (continuity correction) |
| Inconsistent dose units | Curved/nonsensical trend | Standardize doses across studies |
| Single study | Error "Need at least 2 studies" | Add more studies or use single-study mode |

---

## Running Your First Analysis

### Step-by-Step Guide

#### 1. Select Your Model

| Model | Best For | When to Use |
|-------|----------|-------------|
| **GLS (Quadratic)** | Most dose-response analyses | Default choice, tests for non-linearity |
| **Linear** | Simple trend | When you expect straight-line relationship |
| **Cubic** | Complex curves | When quadratic isn't flexible enough |
| **Spline** | Unknown shape | Exploratory analysis, flexible fitting |
| **Exponential** | Saturation effects | When effect plateaus at high dose |

**Recommendation:** Start with **GLS (Quadratic)**

#### 2. Configure Settings

In the Results tab panel:

```
┌─────────────────────────────────────┐
│ Analysis Settings                    │
├─────────────────────────────────────┤
│ Model: [GLS (Quadratic) ▼]          │
│ CI Level: [95% ▼]                   │
│ Reference Dose: [0 ▼]               │
│                                      │
│ [Run Analysis]                       │
└─────────────────────────────────────┘
```

- **Model**: Select GLS (Quadratic)
- **CI Level**: Keep 95% (standard)
- **Reference Dose**: Keep 0 (baseline exposure)

#### 3. Run and Wait

Click **"Run Analysis"**

Computation time:
- 2-3 studies: < 1 second
- 10 studies: 1-2 seconds
- 50+ studies: 3-5 seconds

#### 4. Check for Warnings

Look for colored messages:
- **Yellow**: Warnings (e.g., "High heterogeneity")
- **Red**: Errors (need to fix data)
- **Green**: Success

---

## Understanding Results

### The Results Table

```
┌──────────────────────────────────────────────────────────┐
│ Model: GLS (Quadratic)                                   │
├───────────────────┬──────────────┬──────────┬───────────┤
│ Coefficient       │ Estimate     │ SE       │ P-value   │
├───────────────────┼──────────────┼──────────┼───────────┤
│ β₀ (Intercept)    │ -7.01        │ 0.15     │ <0.001    │
│ β₁ (Linear)       │ 0.18         │ 0.05     │ 0.0003    │
│ β₂ (Quadratic)    │ -0.01        │ 0.008    │ 0.18      │
├───────────────────┴──────────────┴──────────┴───────────┤
│ Tau²: 0.0185  │  I²: 45.2%  │  Q: 12.34  │  df: 4      │
└──────────────────────────────────────────────────────────┘
```

### Interpreting Coefficients

#### β₀ (Intercept)
- **What it means**: Log rate at reference dose (usually dose=0)
- **Interpretation**: "The baseline log rate is -7.01"
- **Rate at reference**: exp(-7.01) = 0.0009 per person-year

#### β₁ (Linear Term) - **Most Important!**
- **What it means**: Linear trend in dose-response
- **Interpretation**: "Each additional drink/day increases log rate by 0.18"
- **Relative Risk**: exp(0.18) = 1.20 (20% increase per drink)
- **P-value < 0.05**: Significant linear trend!

#### β₂ (Quadratic Term)
- **What it means**: Curvature (non-linearity)
- **Negative (-0.01)**: Curve bends downward (inverted U-shape)
- **Positive**: Curve bends upward (U-shape)
- **P-value > 0.05**: Non-linearity not significant (use linear model)

### Heterogeneity Statistics

| Statistic | What It Means | Interpretation |
|-----------|---------------|----------------|
| **Tau² (0.0185)** | Between-study variance | True variance in effects |
| **I² (45.2%)** | Heterogeneity % | Moderate heterogeneity |
| **Q (12.34)** | Heterogeneity test | Q > χ²(df) = significant heterogeneity |

**I² Interpretation Guide:**
- 0-25%: Low heterogeneity
- 25-50%: Moderate heterogeneity ← You are here
- 50-75%: High heterogeneity
- 75-100%: Very high heterogeneity

### The Dose-Response Plot

```
Relative Risk
    ↑
2.0 │                        ┌───
    │                   ┌─────┘
1.5 │              ┌────┘
    │         ┌────┘
1.0 │    ┌────┘                         ──── Reference (RR=1)
    │ ───┘
0.5 │
    └────────────────────────────────────────────→ Dose
    0    1    2    3    4    5    6    7    8
         Drinks per Day
```

**Key elements:**
- **Solid line**: Fitted dose-response curve
- **Shaded area**: 95% confidence interval
- **Points**: Study-specific estimates
- **Reference line**: RR=1 (no effect)

### Predicting Risk at Any Dose

From your results:
- β₀ = -7.01
- β₁ = 0.18
- β₂ = -0.01

**Risk at 2 drinks/day:**

1. Calculate predicted log rate:
   ```
   log(rate) = -7.01 + 0.18(2) - 0.01(2²)
             = -7.01 + 0.36 - 0.04
             = -6.69
   ```

2. Convert to relative risk:
   ```
   RR(2 drinks) = exp(-6.69 - (-7.01))
                = exp(0.32)
                = 1.38
   ```

3. Interpretation:
   "2 drinks/day associated with 38% increased risk compared to non-drinkers"

---

## Common Tasks

### Task 1: Test for Non-Linearity

**Question:** "Is the relationship linear or curved?"

**Steps:**
1. Run **GLS (Quadratic)** model
2. Check **β₂ (Quadratic)** p-value
3. **p < 0.05**: Significant non-linearity (curve)
4. **p ≥ 0.05**: No evidence of non-linearity (linear OK)

**Example:**
- β₂ = -0.01, SE = 0.008, p = 0.18
- Conclusion: Linear trend adequate

### Task 2: Calculate Risk at Specific Dose

**Question:** "What's the risk at 5 drinks/day?"

**Steps:**
1. Go to **Results** tab
2. Scroll to **Predictions** section
3. Enter dose value: `5`
4. Click **"Calculate"**
5. Read RR and 95% CI

**Manual calculation:**
```
RR(5) = exp(β₁×5 + β₂×25)
```

### Task 3: Compare Subgroups

**Question:** "Does the effect differ by study type?"

**Steps:**
1. Go to **Sensitivity Analysis** tab
2. Select **"Subgroup Analysis"**
3. Choose subgroup variable (e.g., study type)
4. Click **"Run Subgroup Analysis"**
5. Review between-subgroup p-value

**Interpretation:**
- **p < 0.05**: Significant difference between subgroups
- **p ≥ 0.05**: No evidence of difference

### Task 4: Check Influential Studies

**Question:** "Is any single study driving the results?"

**Steps:**
1. Go to **Sensitivity Analysis** tab
2. Click **"Run Leave-One-Out Analysis"**
3. Look for:
   - **Red points**: Influential studies
   - **Large changes** in slope when study omitted

**Decision rules:**
- **Cook's D > 4**: Study is influential
- **DFITS > 2**: Study is influential
- **Slope change > 10%**: Study is influential

### Task 5: Export R Code for Publication

**Question:** "How do I reproduce this in R?"

**Steps:**
1. Go to **Results** tab
2. Click **"Export R Code"**
3. Save the `.R` file
4. Run in R console

**This generates:**
```r
library(dosresmeta)

# Your data
data <- read.csv("your_data.csv")

# Fit GLS model
fit <- dosresmeta(logrr ~ dose + I(dose^2),
                  type = "cohort",
                  id = study,
                  cases = cases,
                  n = n)

summary(fit)
```

### Task 6: Save Your Analysis

**Steps:**
1. Click **"Save Analysis"** (top right)
2. Downloads `.json` file with all data and results
3. Later: Click **"Load Analysis"** to restore

---

## FAQ

### Q1: How many studies do I need?

**Minimum:** 2 studies (very limited)

**Recommended:** 6+ studies for reliable results

**Ideal:** 10+ studies for:
- Accurate tau² estimation
- Sensitivity analysis
- Subgroup analysis

### Q2: What if I have zero cases in a category?

**Option 1:** Add 0.5 to ALL cases (continuity correction)
```csv
study,dose,cases,n
Smith,0,45.5,50000
Smith,1,52.5,48000
```

**Option 2:** Exclude that dose category

**Option 3:** Use exact Poisson methods (advanced)

### Q3: Can I use case-control data?

**Yes!** But use odds ratios instead of rates:

**Variance formula:**
```
Var(log OR) = 1/a + 1/b + 1/c + 1/d
```

Where:
- a,b = cases exposed/unexposed
- c,d = controls exposed/unexposed

### Q4: How do I handle different dose units?

**Standardize before analysis:**

| Original | Convert To |
|----------|------------|
| grams/day | mg/day (×1000) |
| drinks/week | drinks/day (÷7) |
| mg/L | mg/dL (÷10) |

### Q5: What does "convergence warning" mean?

**Likely cause:** Too few studies or sparse data

**Solutions:**
1. Increase studies (need 6+ for Bayesian)
2. Use simpler model (linear instead of cubic)
3. Check for data errors

### Q6: How do I cite Dose Response Pro?

```
In methods section:

"Dose-response meta-analysis was performed using Dose Response
Pro v18.1 (M25 Evidence Synthesis Lab), which implements the
Greenland & Longnecker two-stage generalized least squares
method."

Reference:
M25 Evidence Synthesis Lab. Dose Response Pro v18.1.
https://github.com/your-repo/dose-response-pro
```

### Q7: What's the difference between fixed and random effects?

| Fixed Effect | Random Effects |
|--------------|----------------|
| Assumes one true effect | Assumes distribution of effects |
| Tau² = 0 | Estimates Tau² |
| Narrower CIs | Wider CIs |
| Use when I² < 25% | Use when I² > 25% |

**Dose Response Pro uses random effects by default.**

### Q8: Can I analyze continuous outcomes?

**Not directly.** Dose Response Pro is designed for:
- Incidence rates (cohort studies)
- Odds ratios (case-control studies)

For continuous outcomes (e.g., blood pressure), use standard meta-analysis software.

---

## Next Steps

### Learn More

- **Full Documentation**: See `docs/Complete_Documentation.md`
- **Methodology**: See `docs/GLS_Method_Documentation.md`
- **Validation**: See `docs/Validation_Results_v18.1_Corrected.md`

### Advanced Features

- **Bayesian Analysis**: MCMC sampling with convergence diagnostics
- **Spline Models**: Flexible non-linear fitting
- **Bootstrap CIs**: Resampling-based confidence intervals
- **Sensitivity Analysis**: Leave-one-out with influence metrics

### Troubleshooting

| Problem | Solution |
|---------|----------|
| "Matrix is singular" | Check for collinear doses |
| "Need at least 2 studies" | Add more studies |
| High I² (>75%) | Consider subgroup analysis |
| MCMC not converged | Increase iterations |

---

## Support

For additional help:
1. Check the documentation in `docs/`
2. Run unit tests: `tests/unit_tests.html`
3. Review example datasets in `sample_data/`

---

**Happy Analyzing!**

---

*Document Version*: 1.0
*Last Updated*: 2025-01-15
*Software Version*: Dose Response Pro v18.1
