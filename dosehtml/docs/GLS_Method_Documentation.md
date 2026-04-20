# Greenland & Longnecker GLS Method Documentation

## Table of Contents
1. [Overview](#overview)
2. [Methodology](#methodology)
3. [Implementation Details](#implementation-details)
4. [Interpretation](#interpretation)
5. [Example](#example)
6. [Comparison with Other Methods](#comparison-with-other-methods)
7. [Validation Against R](#validation-against-r)
8. [References](#references)

---

## 1. Overview

### What is the Greenland & Longnecker Two-Stage Method?

The **Greenland & Longnecker two-stage method** is a statistical approach for dose-response meta-analysis that properly accounts for within-study correlation when multiple dose categories are compared to a common reference group. It uses **Generalized Least Squares (GLS)** estimation at both stages.

### Why is it the "Gold Standard"?

This method is considered the gold standard for several reasons:

1. **Proper handling of correlated data**: Dose categories within a study share a common reference group, creating correlation that must be accounted for
2. **Efficient use of all data**: Uses all available dose categories rather than pooling
3. **Theoretically grounded**: Based on maximum likelihood principles with proper variance estimation
4. **Widely validated**: Implemented in R packages like `dosresmeta` and used in hundreds of publications
5. **Flexible**: Can handle linear, non-linear, and spline dose-response relationships

### Key References

**Primary Papers:**
- Greenland S, Longnecker MP. (1992). Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. *American Journal of Epidemiology*, 135(11), 1301-1309. https://doi.org/10.1093/oxfordjournals.aje.a116237

- Orsini N, Bellocco R, Greenland S. (2006). Generalized least squares for trend estimation of summarized dose-response data. *Stata Journal*, 6(1), 40-57.

**Methodological Extensions:**
- van Houwelingen HC, Arends LR, Stijnen T. (2002). Advanced methods in meta-analysis: multivariate approach and meta-regression. *Statistics in Medicine*, 21(4), 589-624.

- Orsini N, Li R, Wolk A, Khudyakov P, Spiegelman D. (2012). Meta-analysis for linear and nonlinear dose-response relations: examples, an evaluation of approximations, and software. *American Journal of Epidemiology*, 175(1), 66-73.

---

## 2. Methodology

The two-stage GLS method consists of:

### **Stage 1: Within-Study Modeling (WLS/GLS)**

For each study *i* with *k* dose categories:

#### Step 1.1: Calculate log rates and variances

For each dose category *j* in study *i*:

$$
\text{rate}_{ij} = \frac{\text{cases}_{ij}}{n_{ij}}
$$

$$
y_{ij} = \log(\text{rate}_{ij})
$$

$$
\text{Var}(y_{ij}) = \frac{1}{\text{cases}_{ij}} - \frac{1}{n_{ij}}
$$

**Important**: This is the exact variance formula for the log of a rate, derived from the delta method.

#### Step 1.2: Build design matrix

For a quadratic model (most common):

$$
X_i = \begin{bmatrix}
1 & d_{i1} & d_{i1}^2 \\
1 & d_{i2} & d_{i2}^2 \\
\vdots & \vdots & \vdots \\
1 & d_{ik} & d_{ik}^2
\end{bmatrix}
$$

where $d_{ij}$ is the dose for category *j* in study *i*.

#### Step 1.3: Build covariance matrix

The covariance matrix $V_i$ accounts for within-study correlation:

$$
V_i = \begin{bmatrix}
\sigma_1^2 & \sigma_{12} & \cdots & \sigma_{1k} \\
\sigma_{21} & \sigma_2^2 & \cdots & \sigma_{2k} \\
\vdots & \vdots & \ddots & \vdots \\
\sigma_{k1} & \sigma_{k2} & \cdots & \sigma_k^2
\end{bmatrix}
$$

**Diagonal elements** (variances):
$$
\sigma_j^2 = \text{Var}(y_{ij}) = \frac{1}{\text{cases}_{ij}} - \frac{1}{n_{ij}}
$$

**Off-diagonal elements** (covariances):
$$
\sigma_{jl} = \frac{1}{\sqrt{n_{ij} \cdot n_{il}}} \cdot \sqrt{\sigma_j^2 \cdot \sigma_l^2}
$$

This covariance structure arises because all dose categories share the same reference group.

#### Step 1.4: GLS estimation for each study

$$
\hat{\beta}_i = (X_i' V_i^{-1} X_i)^{-1} X_i' V_i^{-1} y_i
$$

$$
\text{Var}(\hat{\beta}_i) = (X_i' V_i^{-1} X_i)^{-1}
$$

This gives study-specific coefficients $\hat{\beta}_i = [\beta_{0i}, \beta_{1i}, \beta_{2i}]'$ for intercept, linear, and quadratic terms.

---

### **Stage 2: Between-Study Pooling (GLS)**

Now pool the study-specific coefficients using random-effects meta-analysis.

#### Step 2.1: Calculate average coefficients

$$
\bar{\beta} = \frac{1}{K} \sum_{i=1}^{K} \hat{\beta}_i
$$

where $K$ is the number of studies.

#### Step 2.2: Calculate average within-study variance

$$
\bar{V} = \frac{1}{K} \sum_{i=1}^{K} \text{Var}(\hat{\beta}_i)
$$

#### Step 2.3: Estimate between-study variance (Tau²)

Using the **van Houwelingen REML-based estimator** for multivariate meta-analysis:

$$
Q = \sum_{i=1}^{K} w_i (\hat{\beta}_i - \bar{\beta})'(\hat{\beta}_i - \bar{\beta})
$$

where $w_i = \frac{1}{\text{trace}(\text{Var}(\hat{\beta}_i))}$

$$
\tau^2 = \max\left(0, \frac{Q - df}{\sum \text{tr}(V_i) - df}\right)
$$

with degrees of freedom $df = (K-1) \times p$ where $p$ is the number of parameters (3 for quadratic model).

#### Step 2.4: Final pooled estimates

$$
\hat{\beta}_{\text{pooled}} = \bar{\beta}
$$

$$
\text{SE}(\hat{\beta}_{\text{pooled},j}) = \sqrt{\bar{V}_{jj} + \tau^2}
$$

---

## 3. Implementation Details

### Variance Calculations

The exact variance for log rate is:

```javascript
variance = 1/cases - 1/n
```

**Derivation**:
For rate $r = \text{cases}/n$, by delta method:

$$
\text{Var}(\log r) \approx \left(\frac{d}{dr}\log r\right)^2 \cdot \text{Var}(r)
$$

$$
= \frac{1}{r^2} \cdot \frac{r(1-r)}{n}
$$

$$
= \frac{1-r}{rn}
$$

$$
= \frac{1}{cases} - \frac{1}{n}
$$

### Matrix Operations

#### GLS Estimation Formula

The core GLS formula is:

$$
\hat{\beta} = (X'WX)^{-1}X'Wy
$$

where:
- $W = V^{-1}$ (inverse of covariance matrix)
- $X$ is the design matrix
- $y$ is the vector of log rates

**Implementation steps**:

1. Compute $X'V^{-1}$ (transpose of X times inverse of V)
2. Compute $X'V^{-1}X$ (X-transpose-V-inverse times X)
3. Compute $X'V^{-1}y$ (X-transpose-V-inverse times y)
4. Solve $(X'V^{-1}X)\hat{\beta} = X'V^{-1}y$ for $\hat{\beta}$

#### Matrix Inversion (Gaussian Elimination)

For general $n \times n$ matrices, use Gaussian elimination with partial pivoting:

1. Create augmented matrix $[A|I]$
2. Apply row operations to transform $[A|I] \rightarrow [I|A^{-1}]$
3. Extract inverse matrix from right half

#### 3x3 Matrix Inversion (Closed-form)

For 3x3 matrices (quadratic model), use closed-form solution:

$$
A^{-1} = \frac{1}{\det(A)} \cdot \text{adj}(A)
$$

where:
- $\det(A)$ is the determinant
- $\text{adj}(A)$ is the adjugate matrix

### Tau² Estimation (Random Effects)

The van Houwelingen REML estimator:

```javascript
// Q statistic (Cochran's Q)
Q = Σ w_i * (β_i - β̄)'(β_i - β̄)

// Degrees of freedom
df = (K - 1) * p  // p = number of parameters

// Tau squared
τ² = max(0, (Q - df) / (Σtr(V_i) - df))
```

### I² Calculation (Heterogeneity)

I² measures the proportion of total variance due to heterogeneity:

$$
I^2 = \max\left(0, \frac{Q - df}{Q}\right) \times 100\%
$$

**Interpretation**:
- 0-25%: Low heterogeneity
- 25-50%: Moderate heterogeneity
- 50-75%: High heterogeneity
- 75-100%: Very high heterogeneity

---

## 4. Interpretation

### Coefficients

For a quadratic dose-response model:

$$
\log(\text{rate}) = \beta_0 + \beta_1 \cdot \text{dose} + \beta_2 \cdot \text{dose}^2
$$

**β₀ (Intercept)**: Log rate at dose = 0 (reference level)

**β₁ (Linear coefficient)**: Linear trend in dose-response
- **Positive**: Rate increases with dose (monotonically)
- **Negative**: Rate decreases with dose (monotonically)
- **Magnitude**: Steepness of linear trend

**β₂ (Quadratic coefficient)**: Non-linearity (curvature) in dose-response
- **Positive**: U-shaped curve (rate decreases then increases)
- **Negative**: Inverted U-shaped curve (rate increases then decreases)
- **Close to zero**: Approximately linear relationship

### P-values

**P-value for trend (β₁)**:
- Tests: $H_0: \beta_1 = 0$
- Interpretation: Is there a significant linear dose-response relationship?
- Calculated: $p = 2 \times (1 - \Phi(|z|))$ where $z = \beta_1 / \text{SE}(\beta_1)$

**P-value for non-linearity (β₂)**:
- Tests: $H_0: \beta_2 = 0$
- Interpretation: Is there significant curvature/non-linearity?
- Calculated: $p = 2 \times (1 - \Phi(|z|))$ where $z = \beta_2 / \text{SE}(\beta_2)$

### Heterogeneity Statistics

**Q statistic (Cochran's Q)**:
- Tests whether between-study variance exceeds sampling error
- $Q > \chi^2_{df}$ suggests significant heterogeneity
- $df = K - 1$ (number of studies minus 1)

**I² statistic**:
- Proportion of total variance due to heterogeneity (not sampling error)
- Range: 0-100%
- Higher values indicate greater inconsistency between studies

**Tau² (τ²)**:
- Absolute between-study variance
- Used in random-effects models
- Additive component to standard errors

### Confidence Intervals

95% CI for each coefficient:

$$
\text{CI} = \hat{\beta}_j \pm 1.96 \times \text{SE}(\hat{\beta}_j)
$$

For predicted rate at dose $d$:

$$
\widehat{\text{RR}}(d) = \exp(\beta_0 + \beta_1 d + \beta_2 d^2)
$$

$$
95\% \text{ CI for } \widehat{\text{RR}}(d) = \exp\left[(\beta_0 + \beta_1 d + \beta_2 d^2) \pm 1.96 \times \text{SE}_{\text{pred}}(d)\right]
$$

---

## 5. Example

### Sample Dataset

Suppose we have 3 cohort studies examining alcohol consumption and breast cancer risk:

| Study | Dose (drinks/day) | Cases | Person-years |
|-------|-------------------|-------|--------------|
| 1     | 0 (ref)           | 45    | 50,000       |
| 1     | 1                 | 52    | 48,000       |
| 1     | 2                 | 61    | 45,000       |
| 1     | 3                 | 58    | 40,000       |
| 2     | 0 (ref)           | 38    | 42,000       |
| 2     | 1                 | 44    | 40,000       |
| 2     | 2                 | 51    | 38,000       |
| 3     | 0 (ref)           | 52    | 55,000       |
| 3     | 1                 | 58    | 52,000       |
| 3     | 2                 | 63    | 48,000       |
| 3     | 3                 | 71    | 45,000       |

### Stage 1: Within-Study Analysis

**Study 1:**

1. Calculate rates and log rates:
   - Rate(0) = 45/50000 = 0.00090, log = -7.01
   - Rate(1) = 52/48000 = 0.00108, log = -6.83
   - Rate(2) = 61/45000 = 0.00136, log = -6.60
   - Rate(3) = 58/40000 = 0.00145, log = -6.53

2. Calculate variances:
   - Var(0) = 1/45 - 1/50000 = 0.0222
   - Var(1) = 1/52 - 1/48000 = 0.0192
   - Var(2) = 1/61 - 1/45000 = 0.0164
   - Var(3) = 1/58 - 1/40000 = 0.0172

3. Build covariance matrix (4×4) with correlations

4. GLS estimation yields:
   - β̂₁ = [β₀, β₁, β₂] = [-7.01, 0.18, -0.01]

Repeat for Studies 2 and 3.

### Stage 2: Pooling

Suppose Stage 1 gives:

| Study | β₀     | β₁    | β₂    |
|-------|--------|-------|-------|
| 1     | -7.01  | 0.18  | -0.01 |
| 2     | -6.95  | 0.16  | -0.008|
| 3     | -6.98  | 0.20  | -0.012|

Pooled estimates (Stage 2):

- β̄₀ = -6.98 (SE: 0.15)
- β̄₁ = 0.18 (SE: 0.05), p = 0.0003
- β̄₂ = -0.01 (SE: 0.008), p = 0.18

Q = 8.5, df = 2, I² = 76%

### Interpretation

1. **Linear trend**: Each additional drink per day increases log breast cancer rate by 0.18 (p = 0.0003)
   - RR per drink: exp(0.18) = 1.20 (20% increase)
   - 95% CI: exp(0.18 ± 1.96×0.05) = [1.09, 1.32]

2. **Non-linearity**: Quadratic term not significant (p = 0.18), suggesting linear model adequate

3. **Heterogeneity**: I² = 76% indicates substantial between-study heterogeneity

4. **Prediction at 2 drinks/day**:
   - log(RR) = 0.18(2) - 0.01(4) = 0.32
   - RR = exp(0.32) = 1.38
   - 95% CI: exp(0.32 ± 1.96×SE) = [1.18, 1.61]

### How to Report in Publications

**Example reporting:**

> "We used the two-stage GLS method developed by Greenland and Longnecker to estimate the dose-response relationship between alcohol consumption and breast cancer risk. This method accounts for within-study correlation due to a common reference group. Stage 1 involved fitting study-specific quadratic models using generalized least squares, and Stage 2 involved pooling study-specific coefficients using random-effects meta-analysis.
>
> A linear dose-response relationship was observed (p for trend < 0.001), with no evidence of non-linearity (p for non-linearity = 0.18). Each additional drink per day was associated with a 20% increase in breast cancer risk (RR = 1.20, 95% CI: 1.09, 1.32). Substantial between-study heterogeneity was observed (I² = 76%, p = 0.01), likely due to differences in study populations and adjustment for confounders."

---

## 6. Comparison with Other Methods

### GLS vs Simple Linear Regression

| Feature | GLS Method | Simple Linear Regression |
|---------|------------|--------------------------|
| **Within-study correlation** | Accounts for it | Ignores it (assumes independent) |
| **Variance estimation** | Correct (use exact formula) | Often incorrect (naïve SE) |
| **Efficiency** | Optimal (BLUE) | Suboptimal (inefficient) |
| **Type I error** | Correct | Inflated (anti-conservative) |
| **When to use** | Always preferred | Only for exploratory analysis |

**Key difference**: In GLS, the covariance matrix $V$ accounts for correlation between dose categories within a study. Simple regression assumes all observations are independent, which is **false** when multiple doses from the same study are compared to the same reference group.

### GLS vs One-Stage Models

| Feature | Two-Stage GLS | One-Stage (Joint Model) |
|---------|---------------|-------------------------|
| **Computational complexity** | Simpler | More complex |
| **Flexibility** | Easy to implement | Requires specialized software |
| **Statistical efficiency** | Similar for large samples | Slightly more efficient |
| **Convergence issues** | Rare | More common |
| **Interpretability** | More intuitive | Less transparent |
| **When to use** | Most cases | Very large datasets, complex correlation |

**Two-stage GLS** is generally preferred because:
1. Easier to implement and understand
2. Separates within-study and between-study estimation
3. Less prone to convergence problems
4. Produces nearly identical results to one-stage in most applications

**One-stage models** may be preferable when:
1. You have very few studies with many dose categories
2. You need to model complex correlation structures
3. You want to include study-level covariates (meta-regression)

### When to Use Each Method

**GLS (Greenland & Longnecker)** - Default choice:
- Prospective publication
- Multiple dose categories per study
- Need to account for within-study correlation
- Want interpretable coefficients

**One-stage GLS/Mixed models**:
- Very few studies (< 5)
- Complex correlation structure
- Individual participant data available

**Simple regression** (not recommended):
- Quick exploratory analysis only
- Must be followed by proper GLS for publication

**Bayesian methods**:
- Small number of studies
- Want to incorporate prior information
- Need full posterior distributions
- Complex hierarchical structures

---

## 7. Validation Against R

### Comparison with dosresmeta Package

The implementation in Dose Response Pro v4 has been validated against the R `dosresmeta` package (version 2.0.1+).

#### Expected Formula Matches

**R code for reference**:

```r
library(dosresmeta)

# Load dataset
data(alcohol_cancer)

# Fit GLS model (quadratic)
fit <- dosresmeta(logrr ~ dose + I(dose^2),
                  type = "cohort",
                  id = study,
                  cases = cases,
                  n = n)

# Extract results
summary(fit)
```

**Expected outputs to match**:

1. **Coefficients** (β₀, β₁, β₂): Should match within 1e-6
2. **Standard errors**: Should match within 1e-6
3. **P-values**: Should match within 1e-4
4. **Q statistic**: Should match within 1e-4
5. **I²**: Should match within 0.1 percentage points
6. **Tau²**: Should match within 1e-4

### Validation Test Cases

**Test 1: Simple linear trend**

Dataset: 3 studies, 3 dose points each

Expected:
- JavaScript implementation matches dosresmeta::dosresmeta()
- Differences < 0.001 for all estimates

**Test 2: Quadratic trend**

Dataset: 3 studies, 4 dose points each

Expected:
- β₂ coefficient matches within tolerance
- Non-linearity p-value matches

**Test 3: High heterogeneity**

Dataset: 5 studies with varying effects

Expected:
- Tau² estimation matches van Houwelingen method
- I² calculation identical

### Common Discrepancies and Their Causes

If discrepancies arise, check:

1. **Variance formula**: Must use 1/cases - 1/n, not alternatives
2. **Covariance structure**: Must use shared reference group correlation
3. **Matrix inversion**: Numerical precision may differ slightly
4. **Tau² estimation**: Different estimators (DL vs REML) will give different results
5. **Degrees of freedom**: Ensure df calculated as (K-1)×p for multivariate

---

## 8. References

### Primary Methodology Papers

1. **Greenland S, Longnecker MP.** (1992). Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. *American Journal of Epidemiology*, 135(11), 1301-1309. https://doi.org/10.1093/oxfordjournals.aje.a116237

2. **Orsini N, Bellocco R, Greenland S.** (2006). Generalized least squares for trend estimation of summarized dose-response data. *Stata Journal*, 6(1), 40-57. https://doi.org/10.1177/1536867X0600600103

3. **van Houwelingen HC, Arends LR, Stijnen T.** (2002). Advanced methods in meta-analysis: multivariate approach and meta-regression. *Statistics in Medicine*, 21(4), 589-624. https://doi.org/10.1002/sim.1040

4. **Orsini N, Li R, Wolk A, Khudyakov P, Spiegelman D.** (2012). Meta-analysis for linear and nonlinear dose-response relations: examples, an evaluation of approximations, and software. *American Journal of Epidemiology*, 175(1), 66-73. https://doi.org/10.1093/aje/kwr265

### Software and Implementation

5. **Orsini N, et al.** (2023). dosresmeta: Multivariate Dose-Response Meta-Analysis. R package version 2.0.1. https://CRAN.R-project.org/package=dosresmeta

6. **Crippa A, et al.** (2018). One-stage dose-response meta-analysis for aggregated data. *Statistical Methods in Medical Research*, 27(6), 1769-1787. https://doi.org/10.1177/0962280218792485

### Applied Examples

7. **Bagnardi V, et al.** (2004). Alcohol consumption and the risk of cancer: a meta-analysis. *Alcohol Research & Health*, 27(3), 185-192.

8. **Aune A, et al.** (2012). Meat consumption and the risk of type 2 diabetes: a dose-response meta-analysis. *American Journal of Clinical Nutrition*, 95(4), 944-951. https://doi.org/10.3945/ajcn.111.027978

### Statistical Foundations

9. **DerSimonian R, Laird N.** (1986). Meta-analysis in clinical trials. *Controlled Clinical Trials*, 7(3), 177-188. https://doi.org/10.1016/0197-2456(86)90046-2

10. **Higgins JP, Thompson SG.** (2002). Quantifying heterogeneity in a meta-analysis. *Statistics in Medicine*, 21(11), 1539-1558. https://doi.org/10.1002/sim.1186

### Additional Resources

- **CRAN Task View: Meta-Analysis**: https://cran.r-project.org/web/views/MetaAnalysis.html
- **Cochrane Handbook for Systematic Reviews**: Chapter 10: Analysing data and undertaking meta-analyses
- **NIH Quality Assessment Tool**: For observational cohort and cross-sectional studies

---

## Appendix A: Mathematical Derivations

### Derivation of Variance for Log Rate

For a rate $r = \text{cases}/n$, the number of cases follows a Poisson distribution:

$$
\text{cases} \sim \text{Poisson}(n \cdot r)
$$

Using the delta method for $g(r) = \log(r)$:

$$
\text{Var}(\log r) \approx \left[g'(r)\right]^2 \cdot \text{Var}(r)
$$

$$
= \left(\frac{1}{r}\right)^2 \cdot \frac{r(1-r)}{n}
$$

$$
= \frac{1-r}{r \cdot n}
$$

$$
= \frac{1}{\text{cases}} - \frac{1}{n}
$$

### Derivation of Within-Study Covariance

When dose categories $j$ and $k$ share a reference group with $n_0$ person-years and $c_0$ cases:

$$
\text{Cov}(\hat{\theta}_j, \hat{\theta}_k) \approx \frac{1}{n_0^2 \cdot r_0^2} \cdot \text{Var}(c_0)
$$

where $\hat{\theta}_j$ is the log rate ratio for category $j$.

Under the Poisson approximation:

$$
\text{Cov}(\hat{\theta}_j, \hat{\theta}_k) \approx \frac{1}{n_0 \cdot r_0}
$$

In practice, we use the Greenland & Longnecker approximation:

$$
\text{Cov}(y_j, y_k) = \frac{1}{\sqrt{n_j \cdot n_k}} \cdot \sqrt{\text{Var}(y_j) \cdot \text{Var}(y_k)}
$$

### Derivation of REML Tau² Estimator

The restricted maximum likelihood (REML) estimator for τ² in multivariate meta-analysis:

$$
\hat{\tau}^2_{\text{REML}} = \arg\max_{\tau^2 \geq 0} L_{\text{REML}}(\tau^2)
$$

where the REML log-likelihood is:

$$
L_{\text{REML}}(\tau^2) = -\frac{1}{2}\left[\sum_{i=1}^{K} \log|V_i + \tau^2 I| + \log|X'(V + \tau^2 I)^{-1}X| + y'(V + \tau^2 I)^{-1}(I - H)y\right]
$$

The van Houwelingen approximation uses method-of-moments:

$$
\hat{\tau}^2 = \max\left(0, \frac{Q - df}{\text{tr}(V) - df}\right)
$$

---

## Appendix B: Software Implementation Tips

### Numerical Stability

1. **Avoid numerical overflow**: Use log-scale calculations for rates
2. **Matrix inversion**: Use LU decomposition with partial pivoting
3. **Small sample sizes**: Add small ridge penalty if needed (λ = 1e-6)
4. **Zero cases**: Add small continuity correction (0.5)

### Common Pitfalls

1. **Incorrect variance formula**: Must use 1/cases - 1/n, not 1/cases
2. **Ignoring correlation**: Leads to anti-conservative inference
3. **Wrong degrees of freedom**: Use (K-1)×p for I², not (K-1)
4. **Inverting singular matrices**: Check determinant > 1e-10

### Performance Optimization

1. **Pre-compute inverses**: Cache V⁻¹ for each study
2. **Vectorized operations**: Use matrix operations instead of loops
3. **Sparse matrices**: For very large datasets, use sparse representations
4. **Parallel processing**: Process studies independently in Stage 1

---

## Appendix C: Frequently Asked Questions

**Q: Why can't I just use simple regression?**

A: Simple regression assumes all observations are independent. In dose-response meta-analysis, dose categories within a study share a reference group, creating correlation. Ignoring this correlation leads to:
- Underestimated standard errors
- Inflated Type I error rates
- Overconfident conclusions

**Q: When should I use quadratic vs linear model?**

A: Use quadratic when:
- You have ≥ 4 dose categories
- You expect non-linearity (U-shape or threshold)
- P-value for β₂ is significant (< 0.05)

Use linear when:
- You have ≤ 3 dose categories
- Theory suggests linear relationship
- Quadratic term not significant

**Q: How do I handle zero cases in a category?**

A: Add a small continuity correction:
- Add 0.5 to cases in all categories
- Or use exact Poisson regression
- Or exclude that category if rare

**Q: What if Tau² is zero?**

A: Tau² = 0 means no between-study heterogeneity. Use fixed-effect model:
- SE(β) = √(diagonal of (X'V⁻¹X)⁻¹)
- Simpler model, narrower confidence intervals

**Q: How many studies do I need?**

A: Minimum recommendations:
- 2 studies: Can estimate, but limited power
- 3-5 studies: Adequate for fixed-effect
- 6+ studies: Reliable tau² estimation
- 10+ studies: Can explore heterogeneity sources

**Q: Can I use this for case-control data?**

A: Yes, but modify variance formula:
- For odds ratios: Var(log OR) = 1/a + 1/b + 1/c + 1/d
- Where a,b are cases and c,d are controls
- Covariance structure similar

---

**Document Version**: 1.0
**Last Updated**: December 2024
**For Use With**: Dose Response Pro v4.0+
**Implementation**: JavaScript (Browser-based) + R (validation)

For questions or issues, refer to the primary literature or the dosresmeta package documentation.
