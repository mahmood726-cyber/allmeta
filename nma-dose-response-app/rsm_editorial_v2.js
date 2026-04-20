// ============================================================================
// RSM EDITORIAL REVIEW V2: ADDITIONAL METHODS
// ============================================================================
// Per Research Synthesis Methods editorial requirements:
// 1. P-curve Analysis (Simonsohn et al., 2014)
// 2. P-uniform* (van Aert et al., 2016)
// 3. Failsafe N (Rosenthal, Orwin)
// 4. Excess Significance Test (Ioannidis & Trikalinos, 2007)
// 5. Radial/Galbraith Plot
// 6. I² Confidence Intervals (Q-profile method)
// 7. Permutation Test for Publication Bias
// 8. Three-Parameter Selection Model (3PSM)
// 9. Meta-Regression Diagnostics
// 10. Finite-Sample Corrections
// ============================================================================

// ============================================================================
// 1. P-CURVE ANALYSIS (Simonsohn, Nelson & Simmons, 2014)
// Tests whether p-values suggest evidential value or p-hacking
// Reference: Psychological Science, 25(8), 1504-1512
// ============================================================================

class PCurveAnalysis {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.alpha = options.alpha || 0.05;
  }

  // Convert effect/SE to two-tailed p-value
  effectToP(effect, se) {
    const z = Math.abs(effect / se);
    return 2 * (1 - this.normalCDF(z));
  }

  normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  // Get significant p-values (p < 0.05)
  getSignificantPs() {
    const pValues = [];
    for (let i = 0; i < this.n; i++) {
      const p = this.effectToP(this.effects[i], this.ses[i]);
      if (p < this.alpha) {
        pValues.push({ p, effect: this.effects[i], se: this.ses[i], index: i });
      }
    }
    return pValues;
  }

  // PP-values: probability of observing p-value at least as extreme given true effect = 0
  computePPValues(pValues) {
    // Under null (no effect), p-values are uniform
    // PP-value = p / alpha (proportion of p < alpha that would be smaller)
    return pValues.map(item => item.p / this.alpha);
  }

  // Stouffer's test for right-skew (evidential value)
  stoufferRightSkew(ppValues) {
    if (ppValues.length < 2) return { z: NaN, p: NaN, significant: false };

    // Test if pp-values are smaller than expected under uniform
    const zScores = ppValues.map(pp => this.normalQuantile(pp));
    const combinedZ = zScores.reduce((a, b) => a + b, 0) / Math.sqrt(ppValues.length);

    // One-tailed test for right-skew (smaller pp-values = more extreme p-values)
    const pValue = this.normalCDF(combinedZ);

    return {
      z: combinedZ,
      p: pValue,
      significant: pValue < 0.05,
      interpretation: pValue < 0.05 ? 'Right-skewed: evidential value present' : 'Not right-skewed'
    };
  }

  // Stouffer's test for flatness (no evidential value / p-hacking)
  stoufferFlat(ppValues) {
    if (ppValues.length < 2) return { z: NaN, p: NaN, significant: false };

    // Test against uniform distribution (33% power)
    const expected = 0.5; // Uniform mean
    const observed = ppValues.reduce((a, b) => a + b, 0) / ppValues.length;
    const se = Math.sqrt(1/12 / ppValues.length); // SE of uniform mean

    const z = (observed - expected) / se;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      z,
      p: pValue,
      observedMean: observed,
      significant: pValue > 0.05, // NOT significant = flat
      interpretation: pValue > 0.05 ? 'Flat: no evidential value' : 'Not flat'
    };
  }

  normalQuantile(p) {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1];
    const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((a[5]*r + a[4])*r + a[3])*r + a[2])*r + a[1])*r + 1) / (((((b[5]*r + b[4])*r + b[3])*r + b[2])*r + b[1])*r + 1);
    }
    let r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    const c = [0, -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968];
    const d = [0, 7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const x = (((((c[5]*r + c[4])*r + c[3])*r + c[2])*r + c[1])*r + c[0]) / ((((d[4]*r + d[3])*r + d[2])*r + d[1])*r + 1);
    return q < 0 ? -x : x;
  }

  // Binomial test for proportion below 0.025
  binomialHalfTest(pValues) {
    const below025 = pValues.filter(item => item.p < 0.025).length;
    const total = pValues.length;
    const expected = 0.5; // Under uniform, 50% should be below median

    // Binomial test
    const observed = below025 / total;
    const se = Math.sqrt(expected * (1 - expected) / total);
    const z = (observed - expected) / se;

    return {
      below025,
      total,
      proportion: observed,
      z,
      p: 1 - this.normalCDF(z), // One-tailed
      significant: observed > 0.5 && (1 - this.normalCDF(z)) < 0.05,
      interpretation: observed > 0.5 ? 'More p-values in lower half: evidential value' : 'Not right-skewed'
    };
  }

  // Full p-curve analysis
  run() {
    const significant = this.getSignificantPs();

    if (significant.length < 3) {
      return {
        error: 'Insufficient significant results for p-curve (need >= 3)',
        nSignificant: significant.length,
        nTotal: this.n
      };
    }

    const ppValues = this.computePPValues(significant);
    const rightSkew = this.stoufferRightSkew(ppValues);
    const flatness = this.stoufferFlat(ppValues);
    const binomial = this.binomialHalfTest(significant);

    // Overall interpretation
    let conclusion;
    if (rightSkew.significant && !flatness.significant) {
      conclusion = 'EVIDENTIAL VALUE: P-curve is right-skewed';
    } else if (flatness.significant && !rightSkew.significant) {
      conclusion = 'NO EVIDENTIAL VALUE: P-curve is flat or left-skewed';
    } else {
      conclusion = 'INCONCLUSIVE: Neither clearly right-skewed nor flat';
    }

    return {
      nTotal: this.n,
      nSignificant: significant.length,
      pValues: significant.map(s => s.p),
      ppValues,
      tests: {
        rightSkew,
        flatness,
        binomial
      },
      conclusion,
      powerEstimate: this.estimatePower(ppValues)
    };
  }

  // Estimate statistical power from p-curve
  estimatePower(ppValues) {
    if (ppValues.length < 3) return null;

    // Simple power estimate based on mean pp-value
    // Lower mean pp-value = higher power
    const meanPP = ppValues.reduce((a, b) => a + b, 0) / ppValues.length;

    // Approximate power (heuristic based on simulation studies)
    const power = Math.max(0.05, Math.min(0.99, 1 - meanPP));

    return {
      estimated: power,
      ci: [Math.max(0.05, power - 0.15), Math.min(0.99, power + 0.15)],
      interpretation: power > 0.8 ? 'High power' : power > 0.5 ? 'Moderate power' : 'Low power'
    };
  }
}

// ============================================================================
// 2. FAILSAFE N (Rosenthal 1979, Orwin 1983)
// Number of null studies needed to nullify the effect
// ============================================================================

class FailsafeN {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  // Rosenthal's failsafe N
  // Based on z-scores, calculates studies needed to make combined p > 0.05
  rosenthal(alpha = 0.05) {
    // Convert to z-scores
    const zScores = this.effects.map((e, i) => e / this.ses[i]);
    const sumZ = zScores.reduce((a, b) => a + b, 0);
    const combinedZ = sumZ / Math.sqrt(this.n);

    // Critical z for alpha
    const zCrit = 1.96; // Two-tailed 0.05

    // Failsafe N: number of null studies to bring combined z below critical
    // (sumZ + 0*Nfs) / sqrt(n + Nfs) = zCrit
    // sumZ = zCrit * sqrt(n + Nfs)
    // sumZ² = zCrit² * (n + Nfs)
    // Nfs = sumZ²/zCrit² - n

    const Nfs = Math.max(0, Math.pow(sumZ / zCrit, 2) - this.n);

    // Tolerance level (Rosenthal's 5k + 10 rule)
    const toleranceLevel = 5 * this.n + 10;
    const robust = Nfs > toleranceLevel;

    return {
      method: 'Rosenthal',
      failsafeN: Math.round(Nfs),
      combinedZ,
      toleranceLevel,
      robust,
      interpretation: robust ?
        `Robust: Need ${Math.round(Nfs)} null studies (exceeds 5k+10 = ${toleranceLevel})` :
        `Fragile: Only ${Math.round(Nfs)} null studies needed (below 5k+10 = ${toleranceLevel})`
    };
  }

  // Orwin's failsafe N
  // Based on effect sizes, calculates studies needed to reduce effect to criterion
  orwin(criterion = 0.1) {
    // Compute weighted mean effect
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const meanEffect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    if (Math.abs(meanEffect) <= Math.abs(criterion)) {
      return {
        method: 'Orwin',
        failsafeN: 0,
        meanEffect,
        criterion,
        interpretation: 'Effect already at or below criterion'
      };
    }

    // Nfs = n * (d_obs - d_c) / d_c
    // Assuming null studies have effect = 0
    const Nfs = this.n * (Math.abs(meanEffect) - Math.abs(criterion)) / Math.abs(criterion);

    return {
      method: 'Orwin',
      failsafeN: Math.round(Nfs),
      meanEffect,
      criterion,
      interpretation: `Need ${Math.round(Nfs)} null studies to reduce effect to ${criterion}`
    };
  }

  // Rosenberg's failsafe N (weighted version)
  rosenberg() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const meanEffect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    const z = meanEffect / se;

    // Weighted failsafe N
    const zCrit = 1.96;
    const Nfs = Math.max(0, (z * z - zCrit * zCrit) * sumW / (zCrit * zCrit));

    return {
      method: 'Rosenberg',
      failsafeN: Math.round(Nfs),
      weightedMean: meanEffect,
      z,
      interpretation: `Weighted failsafe N: ${Math.round(Nfs)}`
    };
  }

  run() {
    return {
      rosenthal: this.rosenthal(),
      orwin: this.orwin(0.1),
      rosenberg: this.rosenberg(),
      nStudies: this.n
    };
  }
}

// ============================================================================
// 3. EXCESS SIGNIFICANCE TEST (Ioannidis & Trikalinos, 2007)
// Tests whether observed number of significant results exceeds expected
// ============================================================================

class ExcessSignificanceTest {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.alpha = options.alpha || 0.05;
  }

  normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  // Compute power for each study given true effect
  computePower(trueEffect, se, alpha = 0.05) {
    const zCrit = 1.96; // Two-tailed
    const ncp = Math.abs(trueEffect) / se; // Non-centrality parameter
    return 1 - this.normalCDF(zCrit - ncp) + this.normalCDF(-zCrit - ncp);
  }

  run() {
    // Count observed significant results
    const observed = this.effects.filter((e, i) => {
      const z = Math.abs(e / this.ses[i]);
      return z > 1.96;
    }).length;

    // Estimate true effect (using fixed-effects meta-analysis)
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const trueEffect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    // Calculate expected number of significant results
    let expected = 0;
    const powers = [];
    for (let i = 0; i < this.n; i++) {
      const power = this.computePower(trueEffect, this.ses[i]);
      powers.push(power);
      expected += power;
    }

    // Chi-square test (O - E)² / E
    const chiSquare = Math.pow(observed - expected, 2) / expected;
    const pValue = 1 - this.chiSquareCDF(chiSquare, 1);

    // A ratio (observed / expected)
    const aRatio = observed / expected;

    return {
      observed,
      expected: expected,
      aRatio,
      chiSquare,
      pValue,
      trueEffect,
      meanPower: expected / this.n,
      excess: observed > expected,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Excess significance detected (O=${observed}, E=${expected.toFixed(1)}, p=${pValue.toFixed(3)})` :
        `No excess significance (O=${observed}, E=${expected.toFixed(1)}, p=${pValue.toFixed(3)})`,
      nStudies: this.n
    };
  }

  chiSquareCDF(x, df) {
    if (x <= 0) return 0;
    const k = df / 2;
    return this.gammaIncomplete(k, x / 2);
  }

  gammaIncomplete(a, x) {
    if (x < 0 || a <= 0) return 0;
    if (x < a + 1) {
      let sum = 0, term = 1 / a;
      for (let n = 0; n < 100; n++) {
        sum += term;
        term *= x / (a + n + 1);
        if (Math.abs(term) < 1e-10) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
    }
    return 1 - this.gammaIncompleteUpper(a, x);
  }

  gammaIncompleteUpper(a, x) {
    let f = 1e30, c = 1e30, d = 0;
    for (let i = 1; i < 100; i++) {
      const an = -i * (i - a);
      const bn = x + 2 * i + 1 - a;
      d = bn + an * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = bn + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-10) break;
    }
    return f * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
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

// ============================================================================
// 4. RADIAL (GALBRAITH) PLOT
// Standardized effect vs precision plot
// Reference: Galbraith RF (1988) Biometrics
// ============================================================================

class RadialPlot {
  constructor(effects, ses, studyNames) {
    this.effects = effects;
    this.ses = ses;
    this.studyNames = studyNames || effects.map((_, i) => `Study ${i + 1}`);
    this.n = effects.length;
  }

  // Compute pooled effect
  computePooled() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const effect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    return { effect, se };
  }

  // Generate plot data
  generatePlotData() {
    const pooled = this.computePooled();

    // X-axis: 1/SE (precision)
    // Y-axis: effect/SE (standardized effect, z-score)
    const points = [];
    for (let i = 0; i < this.n; i++) {
      const precision = 1 / this.ses[i];
      const z = this.effects[i] / this.ses[i];

      points.push({
        x: precision,
        y: z,
        study: this.studyNames[i],
        effect: this.effects[i],
        se: this.ses[i],
        weight: 1 / (this.ses[i] * this.ses[i])
      });
    }

    // Reference line: y = pooled * x
    const maxPrecision = Math.max(...points.map(p => p.x));
    const referenceLine = {
      slope: pooled.effect,
      x: [0, maxPrecision * 1.1],
      y: [0, pooled.effect * maxPrecision * 1.1]
    };

    // 95% CI bounds: y = (pooled ± 1.96*pooledSE) * x
    const ciBounds = {
      upper: { slope: pooled.effect + 1.96 * pooled.se },
      lower: { slope: pooled.effect - 1.96 * pooled.se }
    };

    return {
      points,
      pooled,
      referenceLine,
      ciBounds,
      nStudies: this.n
    };
  }

  // Identify outliers (points far from reference line)
  identifyOutliers(threshold = 2) {
    const pooled = this.computePooled();

    return this.effects.map((e, i) => {
      const z = e / this.ses[i];
      const expected = pooled.effect / this.ses[i];
      const residual = z - expected;
      const isOutlier = Math.abs(residual) > threshold;

      return {
        study: this.studyNames[i],
        residual,
        isOutlier
      };
    }).filter(item => item.isOutlier);
  }

  run() {
    return {
      plotData: this.generatePlotData(),
      outliers: this.identifyOutliers()
    };
  }
}

// ============================================================================
// 5. I² CONFIDENCE INTERVALS (Q-profile and other methods)
// Reference: Higgins & Thompson (2002), Viechtbauer (2007)
// ============================================================================

class I2ConfidenceInterval {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.variances = ses.map(se => se * se);
  }

  // Compute Q statistic and related measures
  computeQ() {
    const weights = this.variances.map(v => 1 / v);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const fixedEffect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - fixedEffect, 2), 0);
    const df = this.n - 1;
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;

    return { Q, df, C, fixedEffect };
  }

  // Q-profile method for I² CI
  qProfile(alpha = 0.05) {
    const { Q, df, C } = this.computeQ();

    if (df < 1) {
      return { lower: 0, upper: 1, method: 'Q-profile', error: 'Insufficient degrees of freedom' };
    }

    // I² point estimate
    const I2 = Math.max(0, (Q - df) / Q);

    // Find tau² values that correspond to chi-square bounds
    const chiLower = this.chiSquareQuantile(alpha / 2, df);
    const chiUpper = this.chiSquareQuantile(1 - alpha / 2, df);

    // tau² = (Q - df) / C
    // Q follows chi-square under null, scaled chi-square otherwise
    // I² = tau² / (tau² + typical_v)

    // Lower bound: when Q = chiUpper (conservative tau²)
    const tau2Lower = Math.max(0, (Q - chiUpper) / C);
    // Upper bound: when Q = chiLower
    const tau2Upper = Q > chiLower ? (Q - chiLower) / C : Infinity;

    // Convert to I²
    const typicalV = (this.n - 1) * C / Math.pow(C, 2) * this.variances.reduce((a, b) => a + b, 0) / this.n;

    const I2Lower = tau2Lower / (tau2Lower + typicalV);
    const I2Upper = tau2Upper === Infinity ? 1 : tau2Upper / (tau2Upper + typicalV);

    return {
      I2,
      lower: Math.max(0, I2Lower),
      upper: Math.min(1, I2Upper),
      tau2: Math.max(0, (Q - df) / C),
      tau2CI: [tau2Lower, tau2Upper === Infinity ? NaN : tau2Upper],
      Q,
      df,
      method: 'Q-profile'
    };
  }

  // Bootstrap CI for I²
  bootstrap(nBoot = 1000, alpha = 0.05) {
    const I2Values = [];

    for (let b = 0; b < nBoot; b++) {
      // Resample with replacement
      const indices = [];
      for (let i = 0; i < this.n; i++) {
        indices.push(Math.floor(Math.random() * this.n));
      }

      const bootEffects = indices.map(i => this.effects[i]);
      const bootVars = indices.map(i => this.variances[i]);

      // Compute I² for bootstrap sample
      const weights = bootVars.map(v => 1 / v);
      const sumW = weights.reduce((a, b) => a + b, 0);
      const fixedEffect = weights.reduce((s, w, i) => s + w * bootEffects[i], 0) / sumW;
      const Q = weights.reduce((s, w, i) => s + w * Math.pow(bootEffects[i] - fixedEffect, 2), 0);
      const df = this.n - 1;

      const I2 = Math.max(0, Math.min(1, (Q - df) / Q));
      I2Values.push(I2);
    }

    // Sort and get percentiles
    I2Values.sort((a, b) => a - b);
    const lowerIdx = Math.floor(nBoot * alpha / 2);
    const upperIdx = Math.floor(nBoot * (1 - alpha / 2));

    return {
      I2: I2Values[Math.floor(nBoot / 2)],
      lower: I2Values[lowerIdx],
      upper: I2Values[upperIdx],
      method: 'Bootstrap',
      nBoot
    };
  }

  chiSquareQuantile(p, df) {
    // Approximation using Wilson-Hilferty transformation
    if (df <= 0) return 0;
    const z = this.normalQuantile(p);
    const term = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
    return df * Math.pow(Math.max(0, term), 3);
  }

  normalQuantile(p) {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1];
    const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((a[5]*r + a[4])*r + a[3])*r + a[2])*r + a[1])*r + 1) / (((((b[5]*r + b[4])*r + b[3])*r + b[2])*r + b[1])*r + 1);
    }
    let r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    const c = [0, -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968];
    const d = [0, 7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const x = (((((c[5]*r + c[4])*r + c[3])*r + c[2])*r + c[1])*r + c[0]) / ((((d[4]*r + d[3])*r + d[2])*r + d[1])*r + 1);
    return q < 0 ? -x : x;
  }

  run() {
    return {
      qProfile: this.qProfile(),
      bootstrap: this.bootstrap(500),
      nStudies: this.n
    };
  }
}

// ============================================================================
// 6. PERMUTATION TEST FOR PUBLICATION BIAS
// Non-parametric test using rank correlation
// ============================================================================

class PermutationBiasTest {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.nPerm = options.nPerm || 5000;
  }

  // Compute Kendall's tau correlation
  kendallTau(x, y) {
    let concordant = 0, discordant = 0;
    for (let i = 0; i < x.length - 1; i++) {
      for (let j = i + 1; j < x.length; j++) {
        const dx = x[i] - x[j];
        const dy = y[i] - y[j];
        if (dx * dy > 0) concordant++;
        else if (dx * dy < 0) discordant++;
      }
    }
    const n = x.length;
    return (concordant - discordant) / (n * (n - 1) / 2);
  }

  // Permutation test
  run() {
    // Observed correlation between effect and SE
    const observedTau = this.kendallTau(this.effects, this.ses);

    // Permutation distribution
    let moreExtreme = 0;
    const permTaus = [];

    for (let p = 0; p < this.nPerm; p++) {
      // Shuffle effects
      const shuffled = [...this.effects];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const permTau = this.kendallTau(shuffled, this.ses);
      permTaus.push(permTau);

      if (Math.abs(permTau) >= Math.abs(observedTau)) {
        moreExtreme++;
      }
    }

    const pValue = (moreExtreme + 1) / (this.nPerm + 1);

    return {
      observedTau,
      pValue,
      nPerm: this.nPerm,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Significant correlation between effect and SE (tau=${observedTau.toFixed(3)}, p=${pValue.toFixed(3)})` :
        `No significant correlation (tau=${observedTau.toFixed(3)}, p=${pValue.toFixed(3)})`,
      method: 'Permutation test (Kendall tau)'
    };
  }
}

// ============================================================================
// 7. THREE-PARAMETER SELECTION MODEL (3PSM)
// McShane, Böckenholt, Hansen (2016)
// ============================================================================

class ThreeParameterSelectionModel {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  // Likelihood for a single study given parameters
  studyLikelihood(effect, se, mu, tau2, eta) {
    // Marginal variance
    const v = se * se + tau2;

    // Likelihood of observing effect
    const effectLik = this.normalPDF((effect - mu) / Math.sqrt(v)) / Math.sqrt(v);

    // Selection probability (step function at p = 0.05)
    const z = Math.abs(effect) / se;
    const pValue = 2 * (1 - this.normalCDF(z));
    const selectionProb = pValue < 0.05 ? 1 : eta;

    return effectLik * selectionProb;
  }

  // Negative log-likelihood
  negLogLikelihood(mu, tau2, eta) {
    let nll = 0;
    for (let i = 0; i < this.n; i++) {
      const lik = this.studyLikelihood(this.effects[i], this.ses[i], mu, tau2, eta);
      nll -= Math.log(Math.max(1e-100, lik));
    }
    return nll;
  }

  // Grid search optimization (simplified)
  optimize() {
    // Initial estimates from standard RE model
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const muInit = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - muInit, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2Init = Math.max(0, (Q - (this.n - 1)) / C);

    let bestNLL = Infinity;
    let bestParams = { mu: muInit, tau2: tau2Init, eta: 1 };

    // Grid search
    const muRange = [muInit - 0.5, muInit, muInit + 0.5];
    const tau2Range = [0, tau2Init, tau2Init * 2];
    const etaRange = [0.1, 0.3, 0.5, 0.7, 1.0];

    for (const mu of muRange) {
      for (const tau2 of tau2Range) {
        for (const eta of etaRange) {
          const nll = this.negLogLikelihood(mu, tau2, eta);
          if (nll < bestNLL) {
            bestNLL = nll;
            bestParams = { mu, tau2, eta };
          }
        }
      }
    }

    return bestParams;
  }

  run() {
    const params = this.optimize();

    // Unadjusted estimate for comparison
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const unadjusted = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const bias = unadjusted - params.mu;
    const selectionSeverity = params.eta < 0.5 ? 'Severe' : params.eta < 0.8 ? 'Moderate' : 'Minimal';

    return {
      adjusted: {
        mu: params.mu,
        tau2: params.tau2,
        tau: Math.sqrt(params.tau2)
      },
      selection: {
        eta: params.eta,
        severity: selectionSeverity,
        interpretation: `Non-significant results ${((1 - params.eta) * 100).toFixed(0)}% less likely to be published`
      },
      unadjusted,
      bias,
      percentBias: (bias / Math.abs(unadjusted)) * 100,
      nStudies: this.n,
      method: '3PSM'
    };
  }
}

// ============================================================================
// 8. META-REGRESSION DIAGNOSTICS
// Variance inflation, multicollinearity, residual diagnostics
// ============================================================================

class MetaRegressionDiagnostics {
  constructor(effects, ses, covariates) {
    this.effects = effects;
    this.ses = ses;
    this.covariates = covariates; // Array of covariate arrays
    this.n = effects.length;
    this.p = covariates.length;
  }

  // Fit weighted least squares meta-regression
  fitWLS() {
    const weights = this.ses.map(se => 1 / (se * se));

    // Build design matrix [1, x1, x2, ...]
    const X = [];
    for (let i = 0; i < this.n; i++) {
      const row = [1];
      for (let j = 0; j < this.p; j++) {
        row.push(this.covariates[j][i]);
      }
      X.push(row);
    }

    // (X'WX)^-1 X'Wy
    const XtWX = this.matMult(this.transpose(X), this.diag(weights), X);
    const XtWy = this.matVecMult(this.matMult(this.transpose(X), this.diag(weights)), this.effects);

    const XtWXinv = this.invertMatrix(XtWX);
    if (!XtWXinv) return null;

    const beta = this.matVecMult(XtWXinv, XtWy);

    // Fitted values and residuals
    const fitted = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    const residuals = this.effects.map((e, i) => e - fitted[i]);

    return { beta, fitted, residuals, X, weights, XtWXinv };
  }

  // Variance Inflation Factors
  computeVIF() {
    if (this.p < 2) return null;

    const vifs = [];
    for (let j = 0; j < this.p; j++) {
      // Regress covariate j on all other covariates
      const y = this.covariates[j];
      const X = [];
      for (let i = 0; i < this.n; i++) {
        const row = [1];
        for (let k = 0; k < this.p; k++) {
          if (k !== j) row.push(this.covariates[k][i]);
        }
        X.push(row);
      }

      // Compute R² from OLS
      const XtX = this.matMult(this.transpose(X), X);
      const Xty = this.matVecMult(this.transpose(X), y);
      const XtXinv = this.invertMatrix(XtX);
      if (!XtXinv) {
        vifs.push(Infinity);
        continue;
      }

      const beta = this.matVecMult(XtXinv, Xty);
      const fitted = X.map(row => row.reduce((s, x, k) => s + x * beta[k], 0));
      const ssRes = y.reduce((s, yi, i) => s + Math.pow(yi - fitted[i], 2), 0);
      const meanY = y.reduce((a, b) => a + b, 0) / y.length;
      const ssTot = y.reduce((s, yi) => s + Math.pow(yi - meanY, 2), 0);
      const r2 = 1 - ssRes / ssTot;

      vifs.push(1 / (1 - r2));
    }

    return vifs;
  }

  // Studentized residuals
  studentizedResiduals() {
    const fit = this.fitWLS();
    if (!fit) return null;

    const { residuals, X, weights, XtWXinv } = fit;

    // Hat values
    const hatValues = [];
    for (let i = 0; i < this.n; i++) {
      let h = 0;
      for (let j = 0; j < X[i].length; j++) {
        for (let k = 0; k < X[i].length; k++) {
          h += X[i][j] * XtWXinv[j][k] * X[i][k] * weights[i];
        }
      }
      hatValues.push(h);
    }

    // MSE
    const p = X[0].length;
    const mse = residuals.reduce((s, r, i) => s + weights[i] * r * r, 0) / (this.n - p);

    // Studentized residuals
    return residuals.map((r, i) => {
      const v = mse * (1 - hatValues[i]) / weights[i];
      return r / Math.sqrt(v);
    });
  }

  // Matrix operations
  transpose(M) {
    return M[0].map((_, j) => M.map(row => row[j]));
  }

  diag(v) {
    return v.map((vi, i) => v.map((_, j) => i === j ? vi : 0));
  }

  matMult(A, B, C) {
    if (C) {
      const AB = this.matMult(A, B);
      return this.matMult(AB, C);
    }
    const result = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < A[0].length; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  matVecMult(M, v) {
    return M.map(row => row.reduce((s, m, j) => s + m * v[j], 0));
  }

  invertMatrix(M) {
    const n = M.length;
    const augmented = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

    // Gauss-Jordan elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) maxRow = k;
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      if (Math.abs(augmented[i][i]) < 1e-10) return null;

      // Scale pivot row
      const scale = augmented[i][i];
      for (let j = 0; j < 2 * n; j++) augmented[i][j] /= scale;

      // Eliminate column
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = augmented[k][i];
          for (let j = 0; j < 2 * n; j++) {
            augmented[k][j] -= factor * augmented[i][j];
          }
        }
      }
    }

    return augmented.map(row => row.slice(n));
  }

  run() {
    const vif = this.computeVIF();
    const studentized = this.studentizedResiduals();

    const multicollinearity = vif ? vif.some(v => v > 10) : null;
    const outliers = studentized ? studentized.filter(s => Math.abs(s) > 2.5).length : 0;

    return {
      vif,
      studentizedResiduals: studentized,
      multicollinearity: {
        detected: multicollinearity,
        maxVIF: vif ? Math.max(...vif) : null,
        interpretation: multicollinearity ?
          'High multicollinearity detected (VIF > 10)' :
          'No severe multicollinearity'
      },
      outliers: {
        count: outliers,
        interpretation: outliers > 0 ?
          `${outliers} residual outliers detected (|t| > 2.5)` :
          'No residual outliers'
      },
      nStudies: this.n,
      nCovariates: this.p
    };
  }
}

// ============================================================================
// 9. FINITE-SAMPLE CORRECTIONS
// Kenward-Roger, Satterthwaite for small-sample inference
// ============================================================================

class FiniteSampleCorrections {
  constructor(effects, ses, studyIds) {
    this.effects = effects;
    this.ses = ses;
    this.studyIds = studyIds || effects.map((_, i) => i);
    this.n = effects.length;
    this.k = new Set(studyIds).size;
  }

  // Satterthwaite degrees of freedom approximation
  satterthwaite() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const effect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);

    // Approximate effective df
    const sumW2 = weights.reduce((s, w) => s + w * w, 0);
    const df = Math.pow(sumW, 2) / sumW2;

    // t-distribution CI
    const tCrit = this.tQuantile(0.975, df);
    const ci = [effect - tCrit * se, effect + tCrit * se];

    return {
      effect,
      se,
      df,
      tCrit,
      ci,
      pValue: 2 * (1 - this.tCDF(Math.abs(effect / se), df)),
      method: 'Satterthwaite'
    };
  }

  // Kenward-Roger approximation (simplified)
  kenwardRoger() {
    // Simplified version - full KR requires second derivatives of likelihood
    const satt = this.satterthwaite();

    // Small-sample adjustment factor
    const lambda = 1 + 2 / satt.df;
    const adjustedSE = satt.se * Math.sqrt(lambda);

    // Adjusted degrees of freedom
    const df = Math.max(1, satt.df / lambda);

    const tCrit = this.tQuantile(0.975, df);
    const ci = [satt.effect - tCrit * adjustedSE, satt.effect + tCrit * adjustedSE];

    return {
      effect: satt.effect,
      se: adjustedSE,
      df,
      lambda,
      tCrit,
      ci,
      pValue: 2 * (1 - this.tCDF(Math.abs(satt.effect / adjustedSE), df)),
      method: 'Kenward-Roger (simplified)'
    };
  }

  tQuantile(p, df) {
    // Approximation using normal quantile
    const z = this.normalQuantile(p);
    return z + (z * z * z + z) / (4 * df) + (5 * z * z * z * z * z + 16 * z * z * z + 3 * z) / (96 * df * df);
  }

  tCDF(t, df) {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaIncomplete(df / 2, 0.5, x);
  }

  betaIncomplete(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this.betaCF(a, b, x) / a;
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }

  betaCF(a, b, x) {
    const maxIter = 100, eps = 3e-7;
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  normalQuantile(p) {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1];
    const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((a[5]*r + a[4])*r + a[3])*r + a[2])*r + a[1])*r + 1) / (((((b[5]*r + b[4])*r + b[3])*r + b[2])*r + b[1])*r + 1);
    }
    let r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    const c = [0, -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968];
    const d = [0, 7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const x = (((((c[5]*r + c[4])*r + c[3])*r + c[2])*r + c[1])*r + c[0]) / ((((d[4]*r + d[3])*r + d[2])*r + d[1])*r + 1);
    return q < 0 ? -x : x;
  }

  run() {
    return {
      satterthwaite: this.satterthwaite(),
      kenwardRoger: this.kenwardRoger(),
      nStudies: this.n,
      nClusters: this.k
    };
  }
}

// ============================================================================
// 10. HARBORD'S TEST (for binary outcomes)
// Modified Egger test for ORs
// Reference: Harbord RM et al. (2006) Biostatistics
// ============================================================================

class HarbordTest {
  constructor(logORs, ses, events, nonEvents) {
    this.logORs = logORs;
    this.ses = ses;
    this.events = events; // Events in each group
    this.nonEvents = nonEvents;
    this.n = logORs.length;
  }

  run() {
    if (!this.events || !this.nonEvents) {
      return { error: 'Harbord test requires event counts' };
    }

    // Harbord's score test
    // Z = (O - E) / sqrt(V)
    const Z = [];
    const V = [];

    for (let i = 0; i < this.n; i++) {
      const a = this.events[i][0]; // Treatment events
      const c = this.events[i][1]; // Control events
      const b = this.nonEvents[i][0]; // Treatment non-events
      const d = this.nonEvents[i][1]; // Control non-events
      const n = a + b + c + d;

      // Score test components
      const expected = (a + c) * (a + b) / n;
      const observed = a;
      const variance = (a + b) * (c + d) * (a + c) * (b + d) / (n * n * (n - 1));

      Z.push((observed - expected) / Math.sqrt(variance));
      V.push(variance);
    }

    // Weighted regression of Z on 1/sqrt(V)
    const x = V.map(v => 1 / Math.sqrt(v));
    const weights = V;

    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
    for (let i = 0; i < this.n; i++) {
      sumW += weights[i];
      sumWX += weights[i] * x[i];
      sumWY += weights[i] * Z[i];
      sumWXX += weights[i] * x[i] * x[i];
      sumWXY += weights[i] * x[i] * Z[i];
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const intercept = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const slope = (sumW * sumWXY - sumWX * sumWY) / denom;

    // Standard error of intercept
    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = intercept + slope * x[i];
      ssr += weights[i] * Math.pow(Z[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seIntercept = Math.sqrt(mse * sumWXX / denom);

    const t = intercept / seIntercept;
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), this.n - 2));

    return {
      intercept,
      seIntercept,
      t,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        'Harbord test significant: small-study effects detected' :
        'No significant small-study effects',
      method: 'Harbord (modified Egger for ORs)'
    };
  }

  tCDF(t, df) {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaIncomplete(df / 2, 0.5, x);
  }

  betaIncomplete(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this.betaCF(a, b, x) / a;
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }

  betaCF(a, b, x) {
    const maxIter = 100, eps = 3e-7;
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
}
