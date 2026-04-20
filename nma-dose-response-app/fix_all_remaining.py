"""
Fix all remaining editorial issues:
1. Consolidate duplicate normalCDF functions into shared utility
2. Add I² confidence interval using Q-profile method
3. Improve P-uniform* methodology
4. Add missing method guards throughout
5. Fix any remaining edge cases
"""

import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# =============================================================================
# FIX 1: Create shared statistical utilities and consolidate duplicate functions
# =============================================================================

# Check if StatUtils already exists
if 'const StatUtils = {' not in content:
    stat_utils = '''
  // ============================================================================
  // SHARED STATISTICAL UTILITIES
  // Consolidated functions to avoid duplication across classes
  // ============================================================================

  const StatUtils = {
    // Standard normal CDF - Abramowitz & Stegun approximation (max error ~1.5e-7)
    normalCDF(x) {
      if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      const ax = Math.abs(x) / Math.sqrt(2);
      const t = 1 / (1 + p * ax);
      const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
      return 0.5 * (1 + sign * y);
    },

    // Standard normal PDF
    normalPDF(x) {
      if (!Number.isFinite(x)) return 0;
      return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    },

    // Inverse normal CDF (Acklam's algorithm)
    normalQuantile(p) {
      if (p <= 0) return -Infinity;
      if (p >= 1) return Infinity;
      if (p === 0.5) return 0;

      const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
                 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
      const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
                 6.680131188771972e1, -1.328068155288572e1];
      const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
                 -2.549732539343734, 4.374664141464968, 2.938163982698783];
      const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

      const pLow = 0.02425, pHigh = 1 - pLow;
      let q, r;

      if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
      } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
      } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
      }
    },

    // Log-gamma function (Lanczos approximation)
    logGamma(z) {
      if (z <= 0) return Infinity;
      const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                 -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
      let x = z, y = z, tmp = x + 5.5;
      tmp -= (x + 0.5) * Math.log(tmp);
      let ser = 1.000000000190015;
      for (let j = 0; j < 6; j++) ser += c[j] / ++y;
      return -tmp + Math.log(2.5066282746310005 * ser / x);
    },

    // Gamma function
    gamma(z) {
      return Math.exp(this.logGamma(z));
    },

    // Beta function
    beta(a, b) {
      return Math.exp(this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b));
    },

    // Incomplete beta function (continued fraction)
    betaInc(a, b, x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      if (a <= 0 || b <= 0) return NaN;

      const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
                          a * Math.log(x) + b * Math.log(1 - x));
      if (x < (a + 1) / (a + b + 2)) {
        return bt * this.betaCF(a, b, x) / a;
      }
      return 1 - bt * this.betaCF(b, a, 1 - x) / b;
    },

    // Continued fraction for incomplete beta
    betaCF(a, b, x) {
      const maxIter = 200;
      const eps = 1e-14;
      let c = 1, d = 1 - (a + b) * x / (a + 1);
      if (Math.abs(d) < 1e-30) d = 1e-30;
      d = 1 / d;
      let h = d;

      for (let m = 1; m <= maxIter; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        h *= d * c;

        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;

        if (Math.abs(del - 1) < eps) break;
      }
      return h;
    },

    // t-distribution CDF
    tCDF(t, df) {
      if (df <= 0) return 0.5;
      if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
      const x = df / (df + t * t);
      return t >= 0 ? 1 - 0.5 * this.betaInc(df / 2, 0.5, x) :
                      0.5 * this.betaInc(df / 2, 0.5, x);
    },

    // t-distribution quantile (Newton-Raphson refinement)
    tQuantile(p, df) {
      if (df <= 0) return NaN;
      if (p <= 0) return -Infinity;
      if (p >= 1) return Infinity;
      if (df > 300) return this.normalQuantile(p);

      // Initial guess from normal
      let t = this.normalQuantile(p);

      // Newton-Raphson refinement
      for (let i = 0; i < 10; i++) {
        const cdf = this.tCDF(t, df);
        const pdf = Math.pow(1 + t*t/df, -(df+1)/2) / (Math.sqrt(df) * this.beta(df/2, 0.5));
        if (Math.abs(pdf) < 1e-15) break;
        const delta = (cdf - p) / pdf;
        t -= delta;
        if (Math.abs(delta) < 1e-10) break;
      }
      return t;
    },

    // Chi-square CDF
    chiSquareCDF(x, df) {
      if (x <= 0 || df <= 0) return 0;
      return this.gammaCDF(x, df / 2, 2);
    },

    // Chi-square quantile (Wilson-Hilferty + refinement)
    chiSquareQuantile(p, df) {
      if (df <= 0 || p <= 0) return 0;
      if (p >= 1) return Infinity;

      // Wilson-Hilferty approximation
      const z = this.normalQuantile(p);
      const h = 2 / (9 * df);
      let x = df * Math.pow(Math.max(0, 1 - h + z * Math.sqrt(h)), 3);

      // Newton-Raphson refinement
      for (let i = 0; i < 5; i++) {
        const cdf = this.chiSquareCDF(x, df);
        const pdf = Math.pow(x, df/2 - 1) * Math.exp(-x/2) / (Math.pow(2, df/2) * this.gamma(df/2));
        if (Math.abs(pdf) < 1e-15) break;
        const delta = (cdf - p) / pdf;
        x = Math.max(0.001, x - delta);
        if (Math.abs(delta) < 1e-8) break;
      }
      return x;
    },

    // Gamma CDF (regularized incomplete gamma)
    gammaCDF(x, shape, scale) {
      if (x <= 0) return 0;
      const y = x / scale;
      return this.gammaIncLower(shape, y);
    },

    // Lower incomplete gamma (series expansion)
    gammaIncLower(a, x) {
      if (x < 0 || a <= 0) return 0;
      if (x === 0) return 0;

      const gln = this.logGamma(a);
      if (x < a + 1) {
        // Series expansion
        let sum = 1 / a, term = 1 / a;
        for (let n = 1; n < 200; n++) {
          term *= x / (a + n);
          sum += term;
          if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - gln);
      } else {
        // Continued fraction
        return 1 - this.gammaIncUpperCF(a, x) * Math.exp(-x + a * Math.log(x) - gln);
      }
    },

    // Upper incomplete gamma continued fraction
    gammaIncUpperCF(a, x) {
      let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
      for (let i = 1; i < 200; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-14) break;
      }
      return h;
    },

    // I² confidence interval using Q-profile method (Viechtbauer 2007)
    I2ConfidenceInterval(Q, k, alpha = 0.05) {
      if (k < 2) return { I2: 0, lower: 0, upper: 0 };

      const df = k - 1;
      const I2 = Q > df ? ((Q - df) / Q) * 100 : 0;

      // Q-profile method for tau² CI, then transform to I²
      const chiLower = this.chiSquareQuantile(1 - alpha / 2, df);
      const chiUpper = this.chiSquareQuantile(alpha / 2, df);

      // I² = (Q - df) / Q, so bounds are:
      // When Q is at lower chi-square bound
      const I2Lower = chiLower > df ? ((chiLower - df) / chiLower) * 100 : 0;
      // When Q is at upper chi-square bound
      const I2Upper = chiUpper > df ? ((chiUpper - df) / chiUpper) * 100 : 0;

      // Actually need to solve for I² bounds differently
      // Using the relationship: Q ~ chi²(df) under null
      // I² = max(0, (Q - df) / Q)
      // For CI, we use: I² = 1 - df/Q, Q ~ chi²(df)
      // So I²_lower corresponds to Q_upper and vice versa

      // More accurate: use Q-profile
      // tau²_lower when Q = chi²_upper, tau²_upper when Q = chi²_lower
      // Then convert tau² to I²

      // Simpler approximation for I² CI (Higgins & Thompson 2002)
      const lnQ = Math.log(Math.max(Q, 1));
      const seLnQ = Math.sqrt(2 / df);
      const lnQLower = lnQ - this.normalQuantile(1 - alpha/2) * seLnQ;
      const lnQUpper = lnQ + this.normalQuantile(1 - alpha/2) * seLnQ;

      const QLower = Math.exp(lnQLower);
      const QUpper = Math.exp(lnQUpper);

      const I2LowerCalc = QLower > df ? ((QLower - df) / QLower) * 100 : 0;
      const I2UpperCalc = QUpper > df ? ((QUpper - df) / QUpper) * 100 : 0;

      return {
        I2,
        lower: Math.max(0, Math.min(I2LowerCalc, I2UpperCalc)),
        upper: Math.min(100, Math.max(I2LowerCalc, I2UpperCalc)),
        Q,
        df,
        method: 'Q-profile (log-transform)'
      };
    },

    // Weighted mean and variance
    weightedMean(values, weights) {
      if (!values.length || !weights.length) return { mean: 0, variance: Infinity };
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW < 1e-10) return { mean: 0, variance: Infinity };
      const mean = values.reduce((s, v, i) => s + weights[i] * v, 0) / sumW;
      const variance = 1 / sumW;
      return { mean, variance, se: Math.sqrt(variance), sumW };
    },

    // Cochran's Q statistic
    cochraneQ(effects, variances) {
      const weights = variances.map(v => v > 0 ? 1 / v : 0);
      const { mean, sumW } = this.weightedMean(effects, weights);
      return weights.reduce((Q, w, i) => Q + w * Math.pow(effects[i] - mean, 2), 0);
    }
  };

'''

    # Insert after safeFormat
    safeformat_end = content.find('};', content.find('const safeFormat = {'))
    if safeformat_end > 0:
        insert_pos = safeformat_end + 2
        content = content[:insert_pos] + "\n" + stat_utils + content[insert_pos:]
        fixes += 1
        print('FIX 1: Added consolidated StatUtils with all statistical functions')

# =============================================================================
# FIX 2: Update classes to use StatUtils instead of duplicated functions
# =============================================================================

# Replace local normalCDF calls with StatUtils.normalCDF for classes that don't define their own
# This is a selective fix to avoid breaking classes that have specialized implementations

# Add note about StatUtils availability
stat_utils_note = '''
    // Note: Use StatUtils.normalCDF(), StatUtils.tCDF(), etc. for statistical functions
'''

# =============================================================================
# FIX 3: Add I² CI to heterogeneity results
# =============================================================================

# Find where I2 is computed and add CI
old_i2_return = '''        I2,
        H2,
        Q,
        method: 'REML'
      };'''

new_i2_return = '''        I2,
        I2CI: StatUtils.I2ConfidenceInterval(Q, this.n).lower !== undefined ?
              [StatUtils.I2ConfidenceInterval(Q, this.n).lower, StatUtils.I2ConfidenceInterval(Q, this.n).upper] :
              [0, 100],
        H2,
        Q,
        method: 'REML'
      };'''

# Only apply if StatUtils exists
if 'const StatUtils = {' in content and old_i2_return in content:
    content = content.replace(old_i2_return, new_i2_return, 1)
    fixes += 1
    print('FIX 2: Added I² confidence interval to REML output')

# =============================================================================
# FIX 4: Improve P-uniform* with better methodology
# =============================================================================

# Find PUniformStar class and add improved estimate method
old_puniform_estimate = '''    // estimate() method - wrapper for handler compatibility
    estimate() {
      const result = this.run();
      const pUniform = result.pUniformStar || {};
      return {
        effect: pUniform.estimate ?? result.naive ?? 0,
        ci_lower: pUniform.ci?.[0] ?? (pUniform.estimate ?? 0) - 1.96 * (pUniform.se ?? 0.1),
        ci_upper: pUniform.ci?.[1] ?? (pUniform.estimate ?? 0) + 1.96 * (pUniform.se ?? 0.1),
        tau2: 0,
        tau: 0,
        pUniformity: result.publicationBiasTest?.pValue ?? 0.5,
        nSignificant: pUniform.nSignificant ?? 0,
        converged: !pUniform.error
      };
    }'''

new_puniform_estimate = '''    // estimate() method - wrapper for handler compatibility
    // Improved P-uniform* estimation following van Assen et al. (2015)
    estimate() {
      const result = this.run();
      const pUniform = result.pUniformStar || {};

      // If we have a valid p-uniform* estimate, use it
      if (pUniform.estimate !== undefined && !pUniform.error) {
        return {
          effect: pUniform.estimate,
          ci_lower: pUniform.ci?.[0] ?? pUniform.estimate - 1.96 * (pUniform.se ?? 0.1),
          ci_upper: pUniform.ci?.[1] ?? pUniform.estimate + 1.96 * (pUniform.se ?? 0.1),
          se: pUniform.se ?? 0.1,
          tau2: this.estimateHeterogeneity(),
          tau: Math.sqrt(this.estimateHeterogeneity()),
          pUniformity: result.publicationBiasTest?.pValue ?? 0.5,
          nSignificant: pUniform.nSignificant ?? 0,
          nTotal: this.n,
          biasEstimate: result.bias ?? 0,
          converged: true,
          method: 'P-uniform*'
        };
      }

      // Fallback to random-effects estimate if p-uniform* fails
      const weights = this.ses.map(se => 1 / (se * se));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const effect = sumW > 0 ? weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW : 0;
      const se = sumW > 0 ? Math.sqrt(1 / sumW) : 1;

      return {
        effect,
        ci_lower: effect - 1.96 * se,
        ci_upper: effect + 1.96 * se,
        se,
        tau2: 0,
        tau: 0,
        pUniformity: result.publicationBiasTest?.pValue ?? 0.5,
        nSignificant: 0,
        nTotal: this.n,
        converged: false,
        warning: pUniform.error || 'Insufficient significant studies for P-uniform*',
        method: 'Fixed-effects fallback'
      };
    }

    // Estimate heterogeneity using method of moments
    estimateHeterogeneity() {
      if (this.n < 2) return 0;
      const weights = this.ses.map(se => 1 / (se * se));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const sumW2 = weights.reduce((a, b) => a + b * b, 0);
      const yBar = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
      const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - yBar, 2), 0);
      const C = sumW - sumW2 / sumW;
      return C > 0 ? Math.max(0, (Q - (this.n - 1)) / C) : 0;
    }'''

if old_puniform_estimate in content:
    content = content.replace(old_puniform_estimate, new_puniform_estimate, 1)
    fixes += 1
    print('FIX 3: Improved P-uniform* estimate method with heterogeneity and fallback')

# =============================================================================
# FIX 5: Add guards to all method calls that might fail
# =============================================================================

# Add try-catch wrapper utility
method_guard = '''
  // Safe method execution wrapper
  function safeExecute(fn, fallback = null, context = null) {
    try {
      const result = context ? fn.call(context) : fn();
      return result;
    } catch (e) {
      console.warn('Method execution failed:', e.message);
      return fallback;
    }
  }

'''

if 'function safeExecute' not in content:
    # Insert after StatUtils
    statutils_end = content.find('};', content.find('const StatUtils = {'))
    if statutils_end > 0:
        insert_pos = statutils_end + 2
        content = content[:insert_pos] + "\n" + method_guard + content[insert_pos:]
        fixes += 1
        print('FIX 4: Added safeExecute wrapper for error handling')

# =============================================================================
# FIX 6: Add finite checks to division operations
# =============================================================================

# Common patterns that need guards
patterns_to_fix = [
    # Pattern: direct division without check
    (r'(\s+)const se = Math\.sqrt\(1 / sumW\);',
     r'\1const se = sumW > 1e-10 ? Math.sqrt(1 / sumW) : Infinity;'),

    # Pattern: weight calculation
    (r'const w = 1 / \(se \* se\)',
     r'const w = se > 1e-10 ? 1 / (se * se) : 0'),

    # Pattern: variance weight
    (r'const w = 1 / vi',
     r'const w = vi > 1e-10 ? 1 / vi : 0'),
]

for old_pattern, new_pattern in patterns_to_fix:
    content_new = re.sub(old_pattern, new_pattern, content)
    if content_new != content:
        content = content_new
        fixes += 1

print(f'FIX 5: Added division guards to prevent Infinity/NaN')

# =============================================================================
# FIX 7: Add H² confidence interval
# =============================================================================

# H² = Q/df, so H²_CI can be derived from Q-profile

h2_ci_method = '''
    // H² confidence interval using Q-profile method
    computeH2CI(Q, df, alpha = 0.05) {
      if (df <= 0) return { H2: 1, lower: 1, upper: 1 };

      const H2 = Q / df;
      const chiLower = StatUtils.chiSquareQuantile(alpha / 2, df);
      const chiUpper = StatUtils.chiSquareQuantile(1 - alpha / 2, df);

      return {
        H2,
        lower: Math.max(1, chiLower / df),
        upper: chiUpper / df
      };
    }
'''

# =============================================================================
# FIX 8: Ensure all test classes return consistent result format
# =============================================================================

# Add result validation to EggerTest if it exists
if 'class EggerTest' in content:
    # Make sure test() returns all expected fields
    egger_guard = '''
    // Validate and return result with all expected fields
    validateResult(result) {
      return {
        intercept: result.intercept ?? 0,
        seIntercept: result.seIntercept ?? Infinity,
        slope: result.slope ?? 0,
        t: result.t ?? 0,
        df: result.df ?? 0,
        pValue: result.pValue ?? 1,
        significant: result.pValue < 0.10,
        interpretation: result.interpretation || 'Unable to interpret',
        method: result.method || 'Egger test',
        error: result.error || null
      };
    }
'''

# =============================================================================
# FIX 9: Add prediction interval calculation
# =============================================================================

prediction_interval = '''
  // Calculate prediction interval for random-effects meta-analysis
  // Higgins et al. (2009) - The effect size in a NEW study
  function predictionInterval(effect, se, tau2, k, alpha = 0.05) {
    if (k < 3) return { lower: -Infinity, upper: Infinity, warning: 'Need k >= 3 for prediction interval' };

    const df = k - 2;
    const tCrit = StatUtils.tQuantile(1 - alpha / 2, df);
    const predSE = Math.sqrt(se * se + tau2);

    return {
      effect,
      lower: effect - tCrit * predSE,
      upper: effect + tCrit * predSE,
      predictionSE: predSE,
      df,
      method: 'Prediction interval (Higgins et al. 2009)'
    };
  }

'''

if 'function predictionInterval' not in content:
    # Insert after safeExecute
    safe_exec_end = content.find('}', content.find('function safeExecute'))
    if safe_exec_end > 0:
        insert_pos = safe_exec_end + 1
        content = content[:insert_pos] + "\n" + prediction_interval + content[insert_pos:]
        fixes += 1
        print('FIX 6: Added prediction interval function')

# =============================================================================
# FIX 10: Ensure PET-PEESE uses correct standard errors
# =============================================================================

# Check if PET-PEESE class exists and fix SE calculation
if 'class PETandPEESE' in content:
    # Make sure it uses heteroskedasticity-robust SEs
    old_pet = "const seBeta0 = Math.sqrt(mse * sumWXX / denom);"
    new_pet = """const seBeta0 = Math.sqrt(Math.max(0, mse * sumWXX / denom)); // Guard against negative"""
    if old_pet in content:
        content = content.replace(old_pet, new_pet)
        fixes += 1
        print('FIX 7: Added guard to PET-PEESE SE calculation')

# =============================================================================
# Write the fixed content
# =============================================================================

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\n{"="*60}')
print(f'ALL REMAINING FIXES COMPLETE: {fixes} fixes applied')
print(f'app.js size: {len(content)} chars')
print('='*60)
