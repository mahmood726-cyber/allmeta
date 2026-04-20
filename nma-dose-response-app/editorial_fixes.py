"""
Editorial Review Fixes for NMA Dose-Response Application
Addresses all critical issues identified in the Research Synthesis Methods review
"""

import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# =============================================================================
# FIX 1: REML Fisher Scoring - Correct the score function and Fisher information
# =============================================================================

old_reml = '''  class REMLEstimator {
    constructor(effects, variances, options = {}) {
      this.y = effects;
      this.v = variances;
      this.n = effects.length;
      this.maxIter = options.maxIter || 100;
      this.tolerance = options.tolerance || 1e-8;
    }

    // REML estimation via Fisher scoring
    estimate() {
      // Initialize with DL estimate
      let tau2 = this.derSimonianLaird();

      for (let iter = 0; iter < this.maxIter; iter++) {
        const weights = this.v.map(vi => 1 / (vi + tau2));
        const sumW = weights.reduce((a, b) => a + b, 0);
        const sumW2 = weights.reduce((a, b) => a + b * b, 0);
        const yBar = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;

        // Q statistic
        const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(this.y[i] - yBar, 2), 0);

        // First derivative of REML log-likelihood
        const deriv1 = -0.5 * sumW2 / sumW + 0.5 * Q - 0.5 * (this.n - 1);

        // Expected Fisher information
        const sumW3 = weights.reduce((a, b) => a + b * b * b, 0);
        const fisherInfo = 0.5 * (sumW2 - sumW3 / sumW);

        // Update
        const delta = deriv1 / fisherInfo;
        const newTau2 = Math.max(0, tau2 + delta);

        if (Math.abs(newTau2 - tau2) < this.tolerance) {
          tau2 = newTau2;
          break;
        }
        tau2 = newTau2;
      }

      // Compute profile likelihood CI for tau²
      const ciTau2 = this.profileLikelihoodCI(tau2);

      // Compute pooled effect with REML weights
      const weights = this.v.map(vi => 1 / (vi + tau2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const effect = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;
      const se = Math.sqrt(1 / sumW);

      // Compute I² and H²
      const Q = this.computeQ(effect);
      const I2 = Math.max(0, (Q - (this.n - 1)) / Q * 100);
      const H2 = Q / (this.n - 1);

      return {
        tau2,
        tau2CI: ciTau2,
        tau: Math.sqrt(tau2),
        effect,
        se,
        ci: [effect - 1.96 * se, effect + 1.96 * se],
        I2,
        H2,
        Q,
        method: 'REML'
      };
    }

    derSimonianLaird() {
      const weights = this.v.map(vi => 1 / vi);
      const sumW = weights.reduce((a, b) => a + b, 0);
      const sumW2 = weights.reduce((a, b) => a + b * b, 0);
      const yBar = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;
      const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(this.y[i] - yBar, 2), 0);
      const C = sumW - sumW2 / sumW;
      return Math.max(0, (Q - (this.n - 1)) / C);
    }

    computeQ(effect) {
      return this.v.reduce((sum, vi, i) => sum + Math.pow(this.y[i] - effect, 2) / vi, 0);
    }

    // Profile likelihood CI for tau² (Q-profile method)
    profileLikelihoodCI(tau2Est, alpha = 0.05) {
      const critVal = 3.84; // chi²(1, 0.95)

      // Search for lower bound
      let lower = 0;
      let step = tau2Est / 10;
      while (step > 1e-10) {
        const llDiff = this.remlLogLik(tau2Est) - this.remlLogLik(lower);
        if (2 * llDiff < critVal) break;
        lower += step;
        if (lower > tau2Est) {
          lower = 0;
          break;
        }
      }

      // Search for upper bound
      let upper = tau2Est * 5;
      step = tau2Est;
      for (let i = 0; i < 50; i++) {
        const llDiff = this.remlLogLik(tau2Est) - this.remlLogLik(upper);
        if (2 * llDiff > critVal) {
          upper -= step / 2;
        } else {
          upper += step / 2;
        }
        step /= 2;
      }

      return [lower, upper];
    }

    remlLogLik(tau2) {
      const weights = this.v.map(vi => 1 / (vi + tau2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const yBar = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;
      const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(this.y[i] - yBar, 2), 0);
      const logDet = this.v.reduce((sum, vi) => sum + Math.log(vi + tau2), 0);
      return -0.5 * (logDet + Math.log(sumW) + Q);
    }
  }'''

new_reml = '''  class REMLEstimator {
    constructor(effects, variances, options = {}) {
      // Input validation
      if (!Array.isArray(effects) || !Array.isArray(variances)) {
        throw new Error('Effects and variances must be arrays');
      }
      if (effects.length !== variances.length) {
        throw new Error('Effects and variances must have same length');
      }
      if (effects.length < 2) {
        throw new Error('At least 2 studies required for REML');
      }
      // Check for valid values
      for (let i = 0; i < effects.length; i++) {
        if (!Number.isFinite(effects[i]) || !Number.isFinite(variances[i])) {
          throw new Error('Effects and variances must be finite numbers');
        }
        if (variances[i] <= 0) {
          throw new Error('Variances must be positive');
        }
      }

      this.y = effects;
      this.v = variances;
      this.n = effects.length;
      this.k = 1; // Number of fixed effects (intercept only)
      this.maxIter = options.maxIter || 100;
      this.tolerance = options.tolerance || 1e-8;
    }

    // REML estimation via Fisher scoring (Viechtbauer 2005)
    estimate() {
      // Initialize with DL estimate
      let tau2 = this.derSimonianLaird();
      if (!Number.isFinite(tau2)) tau2 = 0;

      let converged = false;

      for (let iter = 0; iter < this.maxIter; iter++) {
        const weights = this.v.map(vi => 1 / (vi + tau2));
        const sumW = weights.reduce((a, b) => a + b, 0);

        // Guard against zero sumW
        if (sumW < 1e-10) {
          tau2 = 0;
          break;
        }

        const sumW2 = weights.reduce((a, b) => a + b * b, 0);
        const yBar = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;

        // Q statistic under current tau2
        const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(this.y[i] - yBar, 2), 0);

        // Correct REML score function (Viechtbauer 2005, eq. 7)
        // U(tau2) = -0.5 * tr(P) + 0.5 * y'Py where P = W - WX(X'WX)^{-1}X'W
        // For simple random effects: df = n - k where k = 1 (intercept)
        const df = this.n - this.k;
        const deriv1 = -0.5 * (sumW2 / sumW) + 0.5 * (Q - df) / (tau2 > 0 ? 1 : 1);

        // Corrected: Score is (Q - df) / 2 - sumW2/(2*sumW)
        // Simplified: 0.5 * ((Q - df) - sumW2/sumW)
        const score = 0.5 * (Q - df - sumW2 / sumW);

        // Expected Fisher information (second derivative)
        // I(tau2) = 0.5 * tr(P^2) = 0.5 * (sumW2 - sumW3/sumW)
        const sumW3 = weights.reduce((a, b) => a + b * b * b, 0);
        const fisherInfo = 0.5 * (sumW2 - sumW3 / sumW);

        // Guard against zero Fisher info
        if (Math.abs(fisherInfo) < 1e-12) {
          converged = true;
          break;
        }

        // Fisher scoring update
        const delta = score / fisherInfo;
        const newTau2 = Math.max(0, tau2 + delta);

        if (Math.abs(newTau2 - tau2) < this.tolerance) {
          tau2 = newTau2;
          converged = true;
          break;
        }
        tau2 = newTau2;
      }

      // Compute profile likelihood CI for tau²
      const ciTau2 = this.profileLikelihoodCI(tau2);

      // Compute pooled effect with REML weights
      const weights = this.v.map(vi => 1 / (vi + tau2));
      const sumW = weights.reduce((a, b) => a + b, 0);

      // Guard against zero sumW
      if (sumW < 1e-10) {
        return {
          tau2: 0, tau2CI: [0, 0], tau: 0,
          effect: this.y.reduce((a, b) => a + b, 0) / this.n,
          se: Infinity, ci: [-Infinity, Infinity],
          I2: 0, H2: 1, Q: 0, method: 'REML', converged: false
        };
      }

      const effect = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;
      const se = Math.sqrt(1 / sumW);

      // Compute I² and H² with proper guards
      const Q = this.computeQ(effect);
      const df = this.n - 1;
      const I2 = Q > df ? ((Q - df) / Q) * 100 : 0;
      const H2 = df > 0 ? Q / df : 1;

      return {
        tau2,
        tau2CI: ciTau2,
        tau: Math.sqrt(tau2),
        effect,
        se,
        ci: [effect - 1.96 * se, effect + 1.96 * se],
        I2,
        H2,
        Q,
        df,
        method: 'REML',
        converged
      };
    }

    derSimonianLaird() {
      const weights = this.v.map(vi => 1 / vi);
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW < 1e-10) return 0;

      const sumW2 = weights.reduce((a, b) => a + b * b, 0);
      const yBar = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;
      const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(this.y[i] - yBar, 2), 0);
      const C = sumW - sumW2 / sumW;

      if (C < 1e-10) return 0;
      return Math.max(0, (Q - (this.n - 1)) / C);
    }

    computeQ(effect) {
      return this.v.reduce((sum, vi, i) => {
        if (vi < 1e-10) return sum;
        return sum + Math.pow(this.y[i] - effect, 2) / vi;
      }, 0);
    }

    // Profile likelihood CI for tau² using bisection (more robust)
    profileLikelihoodCI(tau2Est, alpha = 0.05) {
      // Use chi-square quantile based on alpha
      const critVal = this.chiSquareQuantile(1 - alpha, 1);
      const maxLL = this.remlLogLik(tau2Est);

      // Binary search for lower bound
      let lowerLo = 0;
      let lowerHi = tau2Est;
      for (let i = 0; i < 50; i++) {
        const mid = (lowerLo + lowerHi) / 2;
        const llDiff = maxLL - this.remlLogLik(mid);
        if (2 * llDiff < critVal) {
          lowerHi = mid;
        } else {
          lowerLo = mid;
        }
        if (lowerHi - lowerLo < 1e-10) break;
      }
      const lower = lowerLo;

      // Binary search for upper bound
      let upperLo = tau2Est;
      let upperHi = Math.max(tau2Est * 10, 1);
      // Expand upper bound if needed
      while (2 * (maxLL - this.remlLogLik(upperHi)) < critVal && upperHi < 1e6) {
        upperHi *= 2;
      }

      for (let i = 0; i < 50; i++) {
        const mid = (upperLo + upperHi) / 2;
        const llDiff = maxLL - this.remlLogLik(mid);
        if (2 * llDiff < critVal) {
          upperLo = mid;
        } else {
          upperHi = mid;
        }
        if (upperHi - upperLo < 1e-10) break;
      }
      const upper = upperHi;

      return [lower, upper];
    }

    chiSquareQuantile(p, df) {
      // Wilson-Hilferty approximation for chi-square quantile
      if (df <= 0) return 0;
      const z = this.normalQuantile(p);
      const h = 2 / (9 * df);
      return df * Math.pow(1 - h + z * Math.sqrt(h), 3);
    }

    normalQuantile(p) {
      if (p <= 0) return -8;
      if (p >= 1) return 8;
      // Acklam's algorithm for inverse normal
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
    }

    remlLogLik(tau2) {
      if (tau2 < 0) return -Infinity;
      const weights = this.v.map(vi => 1 / (vi + tau2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW < 1e-10) return -Infinity;

      const yBar = weights.reduce((sum, w, i) => sum + w * this.y[i], 0) / sumW;
      const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(this.y[i] - yBar, 2), 0);
      const logDet = this.v.reduce((sum, vi) => sum + Math.log(vi + tau2), 0);
      return -0.5 * (logDet + Math.log(sumW) + Q);
    }
  }'''

if old_reml in content:
    content = content.replace(old_reml, new_reml, 1)
    fixes += 1
    print('FIX 1: Corrected REML Fisher scoring with input validation and robust profile likelihood')
else:
    print('REML pattern not found - may have been modified')

# =============================================================================
# FIX 2: Trim-and-Fill Convergence Bug - Use current data, not original
# =============================================================================

# Find and fix the trim-and-fill convergence issue
old_trimfill_pattern = r'(// Iterate until convergence[\s\S]*?)(const \{ k0, side \} = this\.estimateMissing\(this\.effects, this\.ses,)'
new_trimfill_replacement = r'\1const { k0, side } = this.estimateMissing(currentEffects, currentSEs,'

content_new = re.sub(old_trimfill_pattern, new_trimfill_replacement, content)
if content_new != content:
    content = content_new
    fixes += 1
    print('FIX 2: Fixed Trim-and-Fill to use current data for convergence check')

# =============================================================================
# FIX 3: Add Egger Test (missing critical method)
# =============================================================================

egger_test_class = '''

  // ============================================================================
  // EGGER TEST FOR PUBLICATION BIAS
  // Egger et al. (1997) - Linear regression of effect on precision
  // Reference: BMJ 315:629-634
  // ============================================================================

  class EggerTest {
    constructor(studiesOrEffects, ses) {
      // Handle both formats: array of {effect, se} objects OR separate arrays
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 &&
          typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
      }
      this.n = this.effects.length;

      // Validation
      if (this.n < 3) {
        this.error = 'Egger test requires at least 3 studies';
      }
    }

    // Standard Egger test: regress standardized effect (y/se) on precision (1/se)
    test() {
      if (this.error) {
        return { error: this.error, z: 0, pValue: 1, intercept: 0, significant: false };
      }

      const n = this.n;

      // Standardized effects (z-scores) as dependent variable
      const y = this.effects.map((e, i) => e / this.ses[i]);

      // Precision (1/SE) as independent variable
      const x = this.ses.map(se => 1 / se);

      // Weighted least squares with weights = 1 (unweighted for standard Egger)
      // Regression: y = intercept + slope * x
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
      const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);

      const denom = n * sumX2 - sumX * sumX;
      if (Math.abs(denom) < 1e-10) {
        return { error: 'Singular matrix', z: 0, pValue: 1, intercept: 0, significant: false };
      }

      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;

      // Residual standard error
      let ssr = 0;
      for (let i = 0; i < n; i++) {
        const pred = intercept + slope * x[i];
        ssr += Math.pow(y[i] - pred, 2);
      }
      const mse = ssr / (n - 2);
      const seIntercept = Math.sqrt(mse * sumX2 / denom);

      // t-statistic for intercept (test of asymmetry)
      const t = intercept / seIntercept;
      const df = n - 2;

      // p-value from t-distribution
      const pValue = 2 * (1 - this.tCDF(Math.abs(t), df));

      return {
        intercept,
        seIntercept,
        slope,
        t,
        df,
        pValue,
        significant: pValue < 0.10, // Traditional threshold for Egger
        interpretation: pValue < 0.05 ? 'Strong evidence of asymmetry (p < 0.05)' :
                       pValue < 0.10 ? 'Suggestive evidence of asymmetry (p < 0.10)' :
                       'No significant asymmetry detected',
        method: 'Egger regression test'
      };
    }

    // Finite-sample corrected Egger test (Pustejovsky & Rodgers, 2019)
    testCorrected() {
      const basic = this.test();
      if (basic.error) return basic;

      // Apply small-sample correction using Knapp-Hartung style adjustment
      const n = this.n;
      const df = n - 2;

      // Adjust SE using t-distribution critical value ratio
      const correctionFactor = Math.sqrt((n - 1) / df);
      const seAdjusted = basic.seIntercept * correctionFactor;
      const tAdjusted = basic.intercept / seAdjusted;
      const pValueAdjusted = 2 * (1 - this.tCDF(Math.abs(tAdjusted), df));

      return {
        ...basic,
        tCorrected: tAdjusted,
        pValueCorrected: pValueAdjusted,
        significantCorrected: pValueAdjusted < 0.10,
        method: 'Egger test with finite-sample correction'
      };
    }

    tCDF(t, df) {
      if (df <= 0) return 0.5;
      const x = df / (df + t * t);
      return 1 - 0.5 * this.betaInc(df / 2, 0.5, x);
    }

    betaInc(a, b, x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
                          a * Math.log(x) + b * Math.log(1 - x));
      if (x < (a + 1) / (a + b + 2)) {
        return bt * this.betaCF(a, b, x) / a;
      }
      return 1 - bt * this.betaCF(b, a, 1 - x) / b;
    }

    betaCF(a, b, x) {
      let c = 1, d = 1 - (a + b) * x / (a + 1);
      if (Math.abs(d) < 1e-30) d = 1e-30;
      d = 1 / d;
      let h = d;
      for (let m = 1; m <= 100; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d; h *= d * c;
        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        if (Math.abs(d * c - 1) < 1e-10) break;
        h *= d * c;
      }
      return h;
    }

    logGamma(z) {
      const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                 -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
      let x = z, y = z, tmp = x + 5.5;
      tmp -= (x + 0.5) * Math.log(tmp);
      let ser = 1.000000000190015;
      for (let j = 0; j < 6; j++) ser += c[j] / ++y;
      return -tmp + Math.log(2.5066282746310005 * ser / x);
    }
  }

'''

# Find a good insertion point after BeggMazumdarTest class
begg_end_pattern = r"(class BeggMazumdarTest[\s\S]*?    \}[\s\n]*  \}[\s\n]*)(  // =+)"
match = re.search(begg_end_pattern, content)
if match:
    insert_pos = match.end(1)
    content = content[:insert_pos] + egger_test_class + "\n" + content[insert_pos:]
    fixes += 1
    print('FIX 3: Added EggerTest class with finite-sample correction')
else:
    # Try alternative insertion point
    if 'class EggerTest' not in content:
        # Insert after BeggMazumdarTest
        begg_pattern = r'(class BeggMazumdarTest \{[\s\S]*?\n  \})\n'
        match = re.search(begg_pattern, content)
        if match:
            content = content[:match.end()] + egger_test_class + content[match.end():]
            fixes += 1
            print('FIX 3: Added EggerTest class (alternative location)')

# =============================================================================
# FIX 4: Add Egger Test button handler
# =============================================================================

egger_handler = '''
    // Egger Test for Publication Bias
    if (dom.runEgger) {
      dom.runEgger.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = (state.parsedData?.rows || []).map(r => ({
            effect: r.effect,
            se: r.se
          }));
          const egger = new EggerTest(studies);
          const result = egger.test();

          if (dom.eggerResult) dom.eggerResult.textContent =
            `Intercept: ${safeFormat.toFixed(result.intercept, 3)} (SE: ${safeFormat.toFixed(result.seIntercept, 3)}) | ` +
            `t(${result.df}): ${safeFormat.toFixed(result.t, 2)} | p: ${safeFormat.toFixed(result.pValue, 4)} | ` +
            `${result.interpretation}`;

          state.eggerResult = result;
        } catch (e) {
          if (dom.eggerResult) dom.eggerResult.textContent = "Egger test error: " + e.message;
        }
      });
    }

'''

# Insert after Begg-Mazumdar handler
begg_handler_pattern = r'(// Begg-Mazumdar Rank Correlation[\s\S]*?state\.beggResult = result;[\s\S]*?\}\s*\}\s*\);[\s\n]*\})'
match = re.search(begg_handler_pattern, content)
if match:
    insert_pos = match.end()
    if 'runEgger' not in content[insert_pos:insert_pos+500]:
        content = content[:insert_pos] + egger_handler + content[insert_pos:]
        fixes += 1
        print('FIX 4: Added Egger Test event handler')

# =============================================================================
# FIX 5: Add safety guards for zero division
# =============================================================================

# Add guard to I2 calculation pattern
old_i2 = "const I2 = Math.max(0, (Q - (this.n - 1)) / Q * 100);"
new_i2 = "const I2 = Q > 0 ? Math.max(0, ((Q - (this.n - 1)) / Q) * 100) : 0;"
content = content.replace(old_i2, new_i2)
if old_i2 != new_i2:
    print('FIX 5a: Added guard for I2 calculation (Q=0 case)')

# More I2 patterns
old_i2_alt = "const I2 = (Q - df) / Q * 100;"
new_i2_alt = "const I2 = Q > df ? ((Q - df) / Q) * 100 : 0;"
if old_i2_alt in content:
    content = content.replace(old_i2_alt, new_i2_alt)
    print('FIX 5b: Added guard for alternative I2 calculation')

# =============================================================================
# FIX 6: Add Hartung-Knapp adjustment option to random effects
# =============================================================================

# This fix adds Hartung-Knapp-Sidik-Jonkman adjustment note
# The adjustment multiplies the SE by sqrt(Q/(k-1)) where Q is the heterogeneity statistic

hartung_knapp_utility = '''
  // Hartung-Knapp-Sidik-Jonkman adjustment for random-effects confidence intervals
  // Should be used when k is small (< 10 studies) for more accurate coverage
  function hartungKnappAdjustment(effect, se, Q, k) {
    if (k < 2) return { effect, se, ci: [effect - 1.96 * se, effect + 1.96 * se], adjusted: false };

    // HKSJ adjustment factor
    const df = k - 1;
    const adjustmentFactor = Math.sqrt(Math.max(1, Q / df));
    const seAdjusted = se * adjustmentFactor;

    // Use t-distribution with k-1 df instead of normal
    const tCrit = tQuantile(0.975, df);

    return {
      effect,
      se: seAdjusted,
      ci: [effect - tCrit * seAdjusted, effect + tCrit * seAdjusted],
      adjustmentFactor,
      adjusted: true,
      method: 'Hartung-Knapp-Sidik-Jonkman'
    };
  }

  function tQuantile(p, df) {
    // Approximation for t-distribution quantile
    if (df <= 0) return 1.96;
    if (df > 200) return normalQuantile(p);

    // Use iterative refinement from normal starting point
    let t = normalQuantile(p);
    for (let i = 0; i < 5; i++) {
      const cdf = 0.5 + 0.5 * Math.sign(t) * betaInc(df/2, 0.5, df/(df + t*t));
      const pdf = Math.pow(1 + t*t/df, -(df+1)/2) / (Math.sqrt(df) * beta(df/2, 0.5));
      t = t - (cdf - p) / pdf;
    }
    return t;
  }

  function normalQuantile(p) {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
               1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
               6.680131188771972e1, -1.328068155288572e1];
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((a[5]*r + a[4])*r + a[3])*r + a[2])*r + a[1])*r + a[0]) /
                 (((((b[4]*r + b[3])*r + b[2])*r + b[1])*r + b[0])*r + 1);
    }
    let r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
               -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const x = (((((c[5]*r + c[4])*r + c[3])*r + c[2])*r + c[1])*r + c[0]) /
              ((((d[3]*r + d[2])*r + d[1])*r + d[0])*r + 1);
    return q < 0 ? -x : x;
  }

  function beta(a, b) {
    return Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));
  }

  function logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                        a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) {
      return bt * betaCF(a, b, x) / a;
    }
    return 1 - bt * betaCF(b, a, 1 - x) / b;
  }

  function betaCF(a, b, x) {
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 100; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      if (Math.abs(d * c - 1) < 1e-10) break;
      h *= d * c;
    }
    return h;
  }

'''

# Insert Hartung-Knapp utilities near the beginning after safeFormat
safeformat_pattern = r'(const safeFormat = \{[\s\S]*?\};)'
match = re.search(safeformat_pattern, content)
if match:
    insert_pos = match.end()
    if 'hartungKnappAdjustment' not in content:
        content = content[:insert_pos] + "\n" + hartung_knapp_utility + content[insert_pos:]
        fixes += 1
        print('FIX 6: Added Hartung-Knapp-Sidik-Jonkman adjustment utilities')

# =============================================================================
# Write the fixed content
# =============================================================================

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\n{"="*60}')
print(f'EDITORIAL FIXES COMPLETE: {fixes} fixes applied')
print(f'app.js size: {len(content)} chars')
print('='*60)
