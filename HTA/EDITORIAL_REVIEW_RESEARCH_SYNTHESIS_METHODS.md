# Editorial Review: HTA Meta-Analysis Engine
## Research Synthesis Methods - Methodological Assessment

**Review Date:** January 2026
**Reviewer Role:** Editor, Research Synthesis Methods
**Focus:** Statistical methodology, implementation accuracy, adherence to published methods

---

## Executive Summary

The HTA JavaScript meta-analysis engine implements a comprehensive suite of methods for pairwise meta-analysis, network meta-analysis, and publication bias assessment. After thorough review, **8/8 core benchmark tests pass against R metafor**, demonstrating accurate implementation of fundamental methods. However, several methodological issues require attention before this tool would meet peer-review standards for a methods journal.

**Overall Assessment:** Good implementation with specific methodological corrections needed.

---

## Section 1: Heterogeneity Estimation

### 1.1 DerSimonian-Laird Estimator - PASS
The DL estimator is correctly implemented using the standard formula:
```
tau^2 = max(0, (Q - df) / C)
where C = sum(w) - sum(w^2)/sum(w)
```
Benchmark validation: tau^2 = 0.000339 matches R exactly.

### 1.2 REML Estimator - CONCERN
**Location:** `metaMethods.js:199-212`

The Fisher information simplification at line 211:
```javascript
info = 0.5 * (sumW2 - 2 * sumW2 ** 2 / sumW + n * sumW2 ** 2 / (sumW ** 2)) / sumW;
```

**Issue:** This formula appears to be an approximation of the true REML Fisher information:
```
I = 0.5 * tr(P * V * P * V)
```
where P is the projection matrix. The approximation may not be accurate when:
- Study variances are highly heterogeneous
- tau^2 is large relative to within-study variances
- Number of studies is small (k < 5)

**Recommendation:** Implement the exact REML Fisher information or document the approximation's validity range. Compare against metafor's `rma(method="REML")` across edge cases.

### 1.3 Q-Profile CI for I^2 - PASS
**Location:** `metaMethods.js:303-338`

The Q-profile method correctly implements Viechtbauer (2007):
- Chi-squared bounds: Q ~ chi^2(df) under homogeneity
- tau^2 bounds: (Q - chi_alpha) / C
- Proper fallback to test-based CI for k >= 10

### 1.4 Prediction Interval - CONCERN
**Location:** `nma.js:1176-1179`

```javascript
predictionInterval: {
    lower: avgEffect - 1.96 * predictionSE,
    upper: avgEffect + 1.96 * predictionSE
}
```

**Issue:** Uses z = 1.96 instead of t-distribution. Per Higgins et al. (2009) and IntHout et al. (2016), prediction intervals should use t(k-2) critical values:
```
PI = theta +/- t(k-2, 0.975) * sqrt(SE^2 + tau^2)
```

For k=5, this is t(3, 0.975) = 3.18, substantially wider than z = 1.96.

**Recommendation:** Replace 1.96 with `this.tQuantile(0.975, k - 2)`.

---

## Section 2: Publication Bias Methods

### 2.1 Egger's Test - PASS
**Location:** `metaMethods.js:381-437`

Correctly implements weighted least squares regression with:
- Standardized effect (y/se) as outcome
- Precision (1/se) as predictor
- Inverse-variance weights
- t-test for intercept with (n-2) df

Note: This is the precision-based formulation. The SE-based formulation (as in metafor) gives equivalent significance but different intercept values. Both are valid.

### 2.2 Begg's Test - CONCERN
**Location:** `metaMethods.js:461-476`

```javascript
const seTau = Math.sqrt(2 * (2 * n + 5) / (9 * n * (n - 1)));
```

**Issue:** This is the standard Kendall's tau SE formula assuming independence. However, Begg & Mazumdar (1994) note that when the pooled estimate is used as the reference, the correlation structure is affected. The correct variance should account for this dependence.

**Reference:** Begg CB, Mazumdar M. Operating characteristics of a rank correlation test for publication bias. Biometrics 1994;50:1088-101.

### 2.3 Trim-and-Fill - CONCERN
**Location:** `metaMethods.js:508-522`

The k0 estimator uses a simple count-based method:
```javascript
const positive = deviations.filter(d => d > 0);
const negative = deviations.filter(d => d < 0);
return Math.max(0, positive.length - negative.length);
```

**Issue:** Duval & Tweedie (2000) define three estimators: L0, R0, and Q0, all based on ranks, not simple counts. The R0 estimator is:
```
R0 = (4*S_n - n*(n+1)) / (2n - 1)
```
where S_n is the sum of ranks from center.

**Recommendation:** Implement the proper rank-based R0 estimator for improved accuracy.

### 2.4 Selection Models - CONCERN
**Location:** `metaMethods.js:617-668`

```javascript
const selectionWeights = {
    significant: Math.max(0.1, expectedSig / (sig + 0.5)),
    marginal: Math.max(0.1, expectedMarginal / (marginal + 0.5)),
    nonsignificant: Math.max(0.1, expectedNonsig / (nonsig + 0.5))
};
```

**Issue:** This is a heuristic weight estimation, not the likelihood-based method from Vevea & Woods (2005). The proper approach maximizes the selection-weighted likelihood:
```
L(mu, tau, w) = prod_i [ f(y_i | mu, tau) * w(p_i) ]
```
using EM algorithm or direct numerical optimization.

**Recommendation:** Implement proper maximum likelihood estimation or relabel as "heuristic selection adjustment."

### 2.5 Copas Selection Model - PASS with RESERVATION
**Location:** `advancedEnhancements.js:350-421`

The EM algorithm structure is correct, but:
- The regularizedGammaQ function in advancedEnhancements.js may have numerical issues (same as fixed in metaMethods.js)
- Consider implementing the profile likelihood approach for more stable optimization

---

## Section 3: Network Meta-Analysis

### 3.1 Basic NMA Estimation - PASS
The graph-theoretical approach using weighted least squares on the contrast network is correctly implemented.

### 3.2 Node-Splitting Consistency Test - MAJOR CONCERN
**Location:** `nma.js:1107-1122`

**Issue 1 - Indirect Variance Approximation:**
```javascript
const indirectVar = Math.max(directVar * 0.5, nmaVar);
```

This ad-hoc formula has no methodological basis. The proper indirect variance should be derived from the network variance-covariance matrix. For a simple A-B-C triangle:
```
Var(indirect_AC) = Var(d_AB) + Var(d_BC) + 2*tau^2
```

**Issue 2 - Covariance Approximation:**
```javascript
const cov = directVar * indirectVar / (directVar + indirectVar);
```

This formula approximates the covariance between direct and indirect estimates as a harmonic mean of variances. The actual covariance depends on the network structure and should be computed from the design matrix.

**Reference:** Dias S, et al. Checking consistency in mixed treatment comparison meta-analysis. Stat Med 2010;29:932-44.

### 3.3 Global Inconsistency Test - CONCERN
**Location:** `nma.js:1137-1139`

```javascript
const globalQ = results.reduce((s, r) => s + r.z ** 2, 0);
const globalDF = results.length;
const globalP = 1 - this.chiSquaredCDF(globalQ, globalDF);
```

**Issue:** This assumes the z-scores from individual node-splitting tests are independent. In reality, they share common information through:
- Network structure (common comparisons)
- Shared between-study heterogeneity (tau^2)

The proper global inconsistency test should use a design-by-treatment interaction model or similar approach that accounts for correlations.

**Reference:** Higgins JPT, et al. Consistency and inconsistency in network meta-analysis. Stat Med 2012;31:2914-30.

### 3.4 League Table CI - CORRECTED
The previous issue with league table CIs assuming independence has been fixed. The current implementation correctly uses the variance-covariance matrix:
```javascript
const seDiff = Math.sqrt(varI + varJ - 2 * covIJ);
```

---

## Section 4: Influence Diagnostics

### 4.1 Cook's Distance - CONCERN
**Location:** `metaMethods.js:744`

```javascript
const cookD = stdResid ** 2 * hat / (1 - hat);
```

**Issue:** This is the standard regression Cook's D formula. However, for random-effects meta-analysis, the proper influence measure should account for:
1. Change in pooled effect when study removed
2. Change in heterogeneity estimate (tau^2)

The metafor package uses:
```
Cook's D = (theta - theta_{-i})^2 / (p * sigma^2)
```
where the variance accounts for the precision of the pooled estimate.

**Recommendation:** Align with metafor's inf$cook.d for comparability.

---

## Section 5: Small Sample Corrections

### 5.1 HKSJ Adjustment - PASS
The Hartung-Knapp-Sidik-Jonkman adjustment correctly:
- Uses t-distribution instead of z
- Multiplies SE by sqrt(Q/(k-1))
- Returns wider CIs appropriate for small meta-analyses

Benchmark: CI [0.3603, 0.7371] matches R metafor.

### 5.2 Selection Model CI - CONCERN
**Location:** `metaMethods.js:658-659`

```javascript
ci_lower: adjustedEffect - 1.96 * adjustedSE,
ci_upper: adjustedEffect + 1.96 * adjustedSE
```

Should use t-distribution for small samples, particularly since selection models are most relevant for small, biased literatures.

---

## Summary of Required Corrections

### Priority 1 - Methodological Errors
1. **Node-splitting variance formula** - Replace ad-hoc formula with proper network-derived variance
2. **Global inconsistency test** - Account for correlation structure or use design-by-treatment model
3. **Prediction intervals** - Use t(k-2) instead of z=1.96

### Priority 2 - Implementation Improvements
4. **Trim-and-fill k0** - Implement proper R0 rank-based estimator
5. **Selection model** - Implement likelihood-based estimation or relabel method
6. **Cook's distance** - Align with metafor formula for random-effects

### Priority 3 - Documentation
7. **Begg's test** - Document limitation of SE formula under dependence
8. **REML Fisher info** - Document approximation validity range
9. **Copas model** - Verify regularizedGammaQ numerical stability

---

## Benchmark Summary

| Test | HTA | R metafor | Status |
|------|-----|-----------|--------|
| Pairwise DL effect | 0.5487 | 0.5487 | PASS |
| Fixed effect | 0.5494 | 0.5494 | PASS |
| Heterogeneity Q | 4.0580 | 4.0580 | PASS |
| I^2 | 1.4% | 1.4% | PASS |
| Meta-regression slope | 0.1098 | 0.1098 | PASS |
| Subgroup Q_between | 5.2282 | 5.2282 | PASS |
| Cumulative final effect | 0.5487 | 0.5487 | PASS |
| Egger significance | p<0.05 | p<0.05 | PASS |

**8/8 core tests passing** - Foundation is solid.

---

## Editorial Decision

**Revise and Resubmit**

The HTA engine demonstrates excellent implementation of core meta-analysis methods with exact correspondence to R metafor benchmarks. However, the NMA consistency testing methodology requires revision to meet publication standards. The node-splitting variance approximation and global test assumptions represent substantive methodological concerns that could lead to incorrect inferences about network inconsistency.

Once Priority 1 corrections are implemented and validated, this tool would represent a valuable contribution to the field of research synthesis methodology.

---

*Review prepared following EQUATOR guidelines for statistical software assessment*
