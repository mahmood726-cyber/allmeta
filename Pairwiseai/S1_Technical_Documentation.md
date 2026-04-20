# S1 File: Technical Documentation of Statistical Algorithms

## TruthCert-PairwisePro v1.0

This document provides complete mathematical specifications for all statistical algorithms implemented in TruthCert-PairwisePro.

---

## 1. Effect Size Calculations

### 1.1 Binary Outcomes (2×2 Tables)

Given a 2×2 table:

|              | Events | Non-events | Total |
|--------------|--------|------------|-------|
| Treatment    | a      | b          | n₁    |
| Control      | c      | d          | n₂    |

**Log Odds Ratio:**
```
yi = ln(a × d / b × c)
vi = 1/a + 1/b + 1/c + 1/d
```

**Log Risk Ratio:**
```
yi = ln((a/n₁) / (c/n₂))
vi = (1-a/n₁)/a + (1-c/n₂)/c
```

**Risk Difference:**
```
yi = a/n₁ - c/n₂
vi = a(n₁-a)/n₁³ + c(n₂-c)/n₂³
```

**Continuity Correction:** When any cell = 0, add 0.5 to all cells before calculation.

### 1.2 Continuous Outcomes

**Standardized Mean Difference (Hedges' g):**
```
d = (M₁ - M₂) / S_pooled

where S_pooled = √[((n₁-1)S₁² + (n₂-1)S₂²) / (n₁ + n₂ - 2)]

J = 1 - 3 / (4(n₁ + n₂ - 2) - 1)    # Hedges' correction factor

g = d × J

vi = (n₁ + n₂)/(n₁ × n₂) + g²/(2(n₁ + n₂))
```

**Mean Difference:**
```
yi = M₁ - M₂
vi = S₁²/n₁ + S₂²/n₂
```

### 1.3 Proportions

**Freeman-Tukey Double Arcsine Transformation:**
```
yi = arcsin(√(x/(n+1))) + arcsin(√((x+1)/(n+1)))
vi = 1/(n + 0.5)
```

**Logit Transformation:**
```
yi = ln(p / (1-p))
vi = 1/(n × p × (1-p))
```

### 1.4 Correlations

**Fisher's z Transformation:**
```
yi = 0.5 × ln((1+r)/(1-r))
vi = 1/(n-3)
```

---

## 2. Heterogeneity Estimators

### 2.1 Fixed Effect Weights and Q Statistic

```
wi = 1/vi                           # Fixed effect weights
θ_FE = Σ(wi × yi) / Σwi             # Fixed effect estimate
Q = Σwi(yi - θ_FE)²                 # Cochran's Q
df = k - 1                          # Degrees of freedom
```

### 2.2 DerSimonian-Laird (DL)

```
C = Σwi - Σwi²/Σwi
τ²_DL = max(0, (Q - df) / C)
```

### 2.3 Restricted Maximum Likelihood (REML)

REML τ² is found by solving:

```
Σ[wi*(yi - θ)² - 1] / [1 + τ²wi*]² = 0
```

where wi* = 1/(vi + τ²)

**Implementation:** Newton-Raphson iteration with:
- Initial value: τ²_DL
- Damping factor: 0.7
- Convergence tolerance: 10⁻⁸
- Maximum iterations: 100

### 2.4 Paule-Mandel (PM)

Iterative solution to:
```
Q* = Σwi*(yi - θ*)² = k - 1
```
where wi* = 1/(vi + τ²) and θ* is the corresponding weighted mean.

### 2.5 Maximum Likelihood (ML)

ML τ² maximizes:
```
ℓ(τ²) = -0.5 × [Σlog(vi + τ²) + Σ(yi - θ)²/(vi + τ²)]
```

### 2.6 Hunter-Schmidt (HS)

```
τ²_HS = max(0, [Σwi(yi - θ_FE)² - (k-1)] / Σwi)
```

### 2.7 Sidik-Jonkman (SJ)

```
τ²_SJ(0) = Σ(yi - ȳ)² / (k - 1)    # Initial estimate

Iterate: τ²_SJ(j+1) = [Σwi*(yi - θ*)²] / k
```

### 2.8 Hedges (HE)

```
τ²_HE = [Σ(yi - θ̄)² - Σvi(1 - wi/Σwi)] / (k - 1)
```

### 2.9 Empirical Bayes (EB)

```
τ²_EB = max(0, [Q - df] / [Σwi - tr(W²)/Σwi])
```

---

## 3. Heterogeneity Statistics

### 3.1 I² (Percentage of Variance Due to Heterogeneity)

```
I² = max(0, 100% × (Q - df) / Q)
```

**Interpretation:**
- 0-40%: Low heterogeneity
- 30-60%: Moderate heterogeneity
- 50-90%: Substantial heterogeneity
- 75-100%: Considerable heterogeneity

### 3.2 H² (Relative Excess Variance)

```
H² = Q / df
```

### 3.3 τ (Between-Study Standard Deviation)

```
τ = √τ²
```

---

## 4. Confidence Intervals

### 4.1 Random Effects Estimate and Standard Error

```
wi* = 1/(vi + τ²)                   # Random effects weights
θ* = Σ(wi* × yi) / Σwi*             # Pooled estimate
SE* = √(1 / Σwi*)                   # Standard error
```

### 4.2 Standard (Wald) Confidence Interval

```
CI = θ* ± z_{α/2} × SE*

where z_{0.025} = 1.96 for 95% CI
```

### 4.3 Hartung-Knapp-Sidik-Jonkman (HKSJ) Adjustment

```
q = Σwi*(yi - θ*)² / (k - 1)
SE_HKSJ = √(q) × SE*
CI_HKSJ = θ* ± t_{α/2, k-1} × SE_HKSJ
```

### 4.4 Prediction Intervals

**Standard (Higgins-Thompson-Spiegelhalter):**
```
PI = θ* ± t_{α/2, k-2} × √(τ² + SE*²)
```

**Noma (2023) Adjustment (Equation 7):**

The Noma prediction interval accounts for uncertainty in τ² estimation:

```
PI_Noma = θ* ± t_{α/2, k-2} × √(τ² + SE*² + Var(τ̂²)/(4τ²))
```

where Var(τ̂²) is estimated using the Fisher information from REML:

```
I(τ²) = 0.5 × Σ[wi*²]
Var(τ̂²) ≈ 1 / I(τ²)
```

For small τ², a continuity correction is applied:
```
If τ² < 0.01: use standard PI
```

Reference: Noma H, Nagashima K, Furukawa TA. Stat Med. 2023;42(16):2837-2854, Equation 7.

---

## 5. Publication Bias Tests

### 5.1 Egger's Regression Test

Regress standardized effect on precision:
```
yi/√vi = β₀ + β₁(1/√vi) + ε

Test H₀: β₀ = 0 (no asymmetry)
```

### 5.2 Peters' Test (Binary Outcomes)

```
yi = β₀ + β₁(1/n) + ε
```

### 5.3 Begg's Rank Correlation

Kendall's τ between yi and vi:
```
τ = (concordant - discordant) / (k(k-1)/2)
```

### 5.4 Trim-and-Fill

**L₀ Estimator:**
```
L₀ = round((4S - k + 1) / (2k + 3))
```
where S = Σrank(|yi - θ̂|) × sign(yi - θ̂) for studies on asymmetric side.

**R₀ Estimator:**
```
R₀ = round((4S² - k² + 2kS - S) / ((2k - 1)(k + S)))
```

### 5.5 PET-PEESE

**PET (Precision-Effect Test):**
```
yi = β₀ + β₁ × SE_i + ε
```

**PEESE (Precision-Effect Estimate with Standard Error):**
```
yi = β₀ + β₁ × SE_i² + ε
```

Decision rule: If PET β₀ p < 0.10, use PEESE estimate; otherwise use PET.

### 5.6 Vevea-Hedges Selection Model

Step-function selection model with weights:
```
P(select | p-value) = ω_j for p ∈ [a_{j-1}, a_j)
```

**Moderate selection:** ω = (1.0, 0.99, 0.95, 0.80) at cuts (0.05, 0.10, 0.50, 1.00)
**Severe selection:** ω = (1.0, 0.99, 0.90, 0.50) at cuts (0.05, 0.10, 0.50, 1.00)

---

## 6. Sensitivity Analyses

### 6.1 Leave-One-Out Analysis

For each study j:
```
θ*_{-j} = Σ_{i≠j}(wi* × yi) / Σ_{i≠j}wi*
```

### 6.2 Cumulative Meta-Analysis

Studies ordered by year; θ* recalculated after adding each study.

### 6.3 Influence Diagnostics

**DFBETAS:**
```
DFBETAS_j = (θ* - θ*_{-j}) / SE*_{-j}
```

**Cook's Distance:**
```
D_j = (θ* - θ*_{-j})² × Σwi* / (k × SE*²)
```

---

## 7. Optimal Information Size (OIS)

For binary outcomes:
```
OIS = 4 × (z_{α/2} + z_{β})² × p̄(1-p̄) / (p₁ - p₀)²
```

where:
- p̄ = (p₁ + p₀)/2
- p₁, p₀ = treatment and control event rates
- z_{α/2} = 1.96 (two-sided α = 0.05)
- z_{β} = 0.84 (power = 80%)

---

## 8. Fragility Index

The fragility index (FI) is the minimum number of events that, if changed from non-event to event (or vice versa) in the treatment group, would change the conclusion from significant to non-significant.

**Algorithm:**
1. Start with original data
2. Iteratively change one event in treatment group
3. Recalculate pooled p-value
4. FI = number of changes needed to cross p = 0.05

---

## 9. Health Technology Assessment

### 9.1 Incremental Cost-Effectiveness Ratio (ICER)

```
ICER = ΔCost / ΔQALY = (C₁ - C₀) / (Q₁ - Q₀)
```

**Special cases:**
- ΔQALY > 0, ΔCost < 0: Dominant (cost-saving, health-improving)
- ΔQALY < 0, ΔCost > 0: Dominated (harmful, costly)
- |ΔQALY| < 0.001: Indeterminate

### 9.2 Net Monetary Benefit (NMB)

```
NMB = ΔQALY × WTP - ΔCost
```

Cost-effective if NMB > 0.

### 9.3 Cost-Effectiveness Acceptability Curve (CEAC)

```
P(cost-effective | WTP) = P(NMB > 0 | WTP)
```

Estimated from PSA iterations:
```
CEAC(λ) = Σ I(NMB_i > 0) / N
```

### 9.4 Expected Value of Perfect Information (EVPI)

```
EVPI = E_θ[max_d NMB(d, θ)] - max_d E_θ[NMB(d, θ)]
```

Population EVPI:
```
pEVPI = EVPI × Incidence × Time_horizon
```

### 9.5 Discounting (Optional)

```
PV = FV / (1 + r)^t
```

Default rates (NICE reference case):
- Costs: 3.5% per annum
- Health outcomes: 3.5% per annum

---

## 10. Distribution Functions

### 10.1 Standard Normal Distribution

**CDF (pnorm):**
```
Φ(x) = 0.5 × [1 + erf(x/√2)]
```

Approximation (Abramowitz and Stegun):
```
Φ(x) ≈ 1 - φ(x)(b₁t + b₂t² + b₃t³ + b₄t⁴ + b₅t⁵)
where t = 1/(1 + 0.2316419|x|)
```

**Inverse CDF (qnorm):**
Rational approximation (Moro 1995).

### 10.2 Student's t Distribution

**CDF (pt):**
Regularized incomplete beta function:
```
pt(x, df) = 1 - 0.5 × I_{df/(df+x²)}(df/2, 0.5)
```

**Inverse CDF (qt):**
Newton-Raphson iteration on pt.

### 10.3 Chi-squared Distribution

**CDF (pchisq):**
```
pchisq(x, df) = γ(df/2, x/2) / Γ(df/2)
```
where γ is the lower incomplete gamma function.

---

## 11. Verdict Classification Algorithm

### 11.1 Input Metrics

```
evidenceMetrics = {
  k: number of studies,
  theta: pooled effect estimate,
  se: standard error,
  ci_lower, ci_upper: 95% CI bounds,
  I2: I-squared percentage,
  publicationBias: { detected: boolean },
  tau2Stable: boolean (CV of τ² estimates < 15%),
  predictionInterval: { crossesNull: boolean },
  fragilityIndex: { fi: number },
  ois: { metOIS: boolean }
}
```

### 11.2 Severity Score Calculation

```javascript
function calculateSeverityScore(metrics) {
  let score = 0;

  if (metrics.k < 3) score += 3;
  else if (metrics.k < 5) score += 2;

  if (metrics.I2 > 90) score += 3;
  else if (metrics.I2 > 75) score += 2;

  if (metrics.publicationBias.detected) score += 2;
  if (metrics.trimFillImputed >= 3) score += 1;
  if (!metrics.tau2Stable) score += 1;
  if (metrics.predictionInterval.crossesNull) score += 1;
  if (!metrics.ois.metOIS) score += 1;
  if (metrics.fragilityIndex.fi < 3) score += 1;
  if (metrics.looChangesConclusion) score += 1;

  return score;
}
```

### 11.3 Verdict Determination

```javascript
function determineVerdict(metrics, config) {
  const mcid = config.mcid || 0.1054;
  const precisionRatio = metrics.se / mcid;
  const severity = calculateSeverityScore(metrics);

  // Check for effect within equivalence bounds
  const withinEquivalence = Math.abs(metrics.theta) < mcid;

  if (precisionRatio <= 2 && severity <= 3) {
    if (withinEquivalence) return 'STABLE-NID';
    return 'STABLE';
  }

  if (precisionRatio <= 4 && severity <= 6) {
    return 'MODERATE';
  }

  return 'UNCERTAIN';
}
```

---

## 12. Pseudo-Random Number Generation

### Mulberry32 Algorithm

32-bit PRNG with period 2^32, passes BigCrush tests.

```javascript
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

**Properties:**
- Deterministic: Same seed produces same sequence
- Cross-platform: Identical results in all JavaScript environments
- Fast: ~15 cycles per random number
- Quality: Passes BigCrush statistical test suite

Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c

---

## Version History

- v1.0 (2024): Initial release with 109 validated statistical tests

---

*End of Technical Documentation*
