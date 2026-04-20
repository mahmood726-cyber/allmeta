// ============================================================================
// RSM EDITORIAL REVISIONS: RESEARCH SYNTHESIS METHODS STANDARDS
// ============================================================================
// Implements critical missing features per RSM editorial requirements:
// 1. Trim-and-Fill (Duval & Tweedie)
// 2. PET-PEESE (Stanley & Doucouliagos)
// 3. Doi Plot with LFK Index (Furuya-Kanamori)
// 4. Vevea-Hedges Selection Model
// 5. Outlier Diagnostics (Cook's D, DFFITS, Studentized Residuals)
// 6. Leave-One-Out Cross-Validation
// 7. Transitivity Assessment
// 8. Multivariate Outcome Correlation
// ============================================================================

// ============================================================================
// 1. TRIM-AND-FILL (Duval & Tweedie, 2000)
// Nonparametric method for adjusting for publication bias
// Reference: Duval S, Tweedie R. Biometrics. 2000;56(2):455-463
// ============================================================================

class TrimAndFill {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.side = options.side || 'auto'; // 'left', 'right', or 'auto'
    this.estimator = options.estimator || 'L0'; // 'L0', 'R0', or 'Q0'
    this.maxIter = options.maxIter || 100;
  }

  // Compute pooled effect (random-effects)
  computePooledEffect(effects, ses) {
    // DerSimonian-Laird for simplicity
    const n = effects.length;
    const weights = ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const fixedEffect = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

    // Heterogeneity
    const Q = weights.reduce((s, w, i) => s + w * Math.pow(effects[i] - fixedEffect, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2 = Math.max(0, (Q - (n - 1)) / C);

    // Random effects
    const reWeights = ses.map(se => 1 / (se * se + tau2));
    const sumREW = reWeights.reduce((a, b) => a + b, 0);
    const reEffect = reWeights.reduce((s, w, i) => s + w * effects[i], 0) / sumREW;
    const reSE = Math.sqrt(1 / sumREW);

    return { effect: reEffect, se: reSE, tau2 };
  }

  // Estimate number of missing studies (L0 estimator)
  estimateMissing(effects, ses, pooled) {
    const n = effects.length;

    // Standardized deviates from pooled effect
    const deviates = effects.map((e, i) => (e - pooled) / ses[i]);

    // Sort by absolute value (ignoring sign initially)
    const sorted = deviates.map((d, i) => ({ d, i }))
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));

    // Determine side with asymmetry
    let side = this.side;
    if (side === 'auto') {
      const leftCount = deviates.filter(d => d < 0).length;
      const rightCount = deviates.filter(d => d > 0).length;
      side = leftCount < rightCount ? 'left' : 'right';
    }

    // Count studies on the "thin" side
    const onThinSide = side === 'left' ?
      sorted.filter(s => s.d < 0) :
      sorted.filter(s => s.d > 0);

    // L0 estimator: k0 = n - n/2 - s(n/2)
    // where s(j) is the rank sum of the j smallest absolute deviates
    let k0;
    if (this.estimator === 'L0') {
      // Simplified L0
      const gamma = Math.floor(n / 2);
      const ranks = sorted.slice(0, gamma);
      const S = ranks.reduce((s, r, i) => {
        const sign = r.d >= 0 ? 1 : -1;
        return s + (i + 1) * (side === 'right' ? sign : -sign);
      }, 0);
      k0 = Math.max(0, Math.round((4 * S - n * (n + 1)) / (2 * n - 1)));
    } else if (this.estimator === 'R0') {
      // R0 estimator
      const rightRanks = sorted.filter(s => (side === 'right' ? s.d > 0 : s.d < 0));
      k0 = Math.max(0, n - 2 * rightRanks.length);
    } else {
      // Q0 estimator
      k0 = Math.max(0, Math.round(n - onThinSide.length * 2));
    }

    return { k0, side };
  }

  // Generate imputed studies
  imputeStudies(effects, ses, pooled, k0, side) {
    if (k0 === 0) return { effects: [], ses: [] };

    // Find the k0 most extreme studies on the "fat" side
    const deviates = effects.map((e, i) => ({ effect: e, se: ses[i], d: e - pooled }));

    const fatSide = side === 'left' ?
      deviates.filter(d => d.d > 0).sort((a, b) => b.d - a.d) :
      deviates.filter(d => d.d < 0).sort((a, b) => a.d - b.d);

    const toMirror = fatSide.slice(0, Math.min(k0, fatSide.length));

    // Mirror around pooled effect
    const imputedEffects = toMirror.map(s => 2 * pooled - s.effect);
    const imputedSEs = toMirror.map(s => s.se);

    return { effects: imputedEffects, ses: imputedSEs };
  }

  // Run trim-and-fill
  run() {
    let currentEffects = [...this.effects];
    let currentSEs = [...this.ses];
    let prevK0 = -1;
    let iteration = 0;
    let result;

    while (iteration < this.maxIter) {
      // Compute pooled effect
      const pooled = this.computePooledEffect(currentEffects, currentSEs);

      // Estimate missing studies
      const { k0, side } = this.estimateMissing(this.effects, this.ses, pooled.effect);

      if (k0 === prevK0) {
        // Converged
        result = { ...pooled, k0, side, converged: true, iterations: iteration + 1 };
        break;
      }

      prevK0 = k0;

      // Impute studies
      const imputed = this.imputeStudies(this.effects, this.ses, pooled.effect, k0, side);

      // Combine original and imputed
      currentEffects = [...this.effects, ...imputed.effects];
      currentSEs = [...this.ses, ...imputed.ses];

      iteration++;
    }

    if (!result) {
      const pooled = this.computePooledEffect(currentEffects, currentSEs);
      result = { ...pooled, k0: prevK0, side: this.side, converged: false, iterations: iteration };
    }

    // Compute original (unadjusted) estimate for comparison
    const original = this.computePooledEffect(this.effects, this.ses);

    return {
      original: {
        effect: original.effect,
        se: original.se,
        ci: [original.effect - 1.96 * original.se, original.effect + 1.96 * original.se],
        tau2: original.tau2
      },
      adjusted: {
        effect: result.effect,
        se: result.se,
        ci: [result.effect - 1.96 * result.se, result.effect + 1.96 * result.se],
        tau2: result.tau2
      },
      missingStudies: result.k0,
      side: result.side,
      converged: result.converged,
      iterations: result.iterations,
      nOriginal: this.n,
      nTotal: this.n + result.k0,
      effectChange: result.effect - original.effect,
      percentChange: ((result.effect - original.effect) / Math.abs(original.effect || 0.001)) * 100
    };
  }
}

// ============================================================================
// 2. PET-PEESE (Stanley & Doucouliagos, 2014)
// Precision-Effect Test and Precision-Effect Estimate with Standard Error
// Reference: Stanley TD, Doucouliagos H. Research Synthesis Methods. 2014
// ============================================================================

class PETPEESE {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  // Weighted least squares regression
  wls(y, x, weights) {
    const n = y.length;
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (let i = 0; i < n; i++) {
      sumW += weights[i];
      sumWX += weights[i] * x[i];
      sumWY += weights[i] * y[i];
      sumWXX += weights[i] * x[i] * x[i];
      sumWXY += weights[i] * x[i] * y[i];
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const intercept = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const slope = (sumW * sumWXY - sumWX * sumWY) / denom;

    // Standard errors
    let ssr = 0;
    for (let i = 0; i < n; i++) {
      const pred = intercept + slope * x[i];
      ssr += weights[i] * Math.pow(y[i] - pred, 2);
    }
    const mse = ssr / (n - 2);

    const seIntercept = Math.sqrt(mse * sumWXX / denom);
    const seSlope = Math.sqrt(mse * sumW / denom);

    // T-statistics and p-values
    const tIntercept = intercept / seIntercept;
    const tSlope = slope / seSlope;

    return {
      intercept, slope,
      seIntercept, seSlope,
      tIntercept, tSlope,
      pIntercept: 2 * (1 - this.tCDF(Math.abs(tIntercept), n - 2)),
      pSlope: 2 * (1 - this.tCDF(Math.abs(tSlope), n - 2)),
      df: n - 2
    };
  }

  tCDF(t, df) {
    // Approximation of t-distribution CDF
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaIncomplete(df / 2, 0.5, x);
  }

  betaIncomplete(a, b, x) {
    // Continued fraction approximation
    if (x < 0 || x > 1) return 0;
    if (x === 0) return 0;
    if (x === 1) return 1;

    const bt = Math.exp(
      this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betaCF(a, b, x) / a;
    }
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }

  betaCF(a, b, x) {
    const maxIter = 100;
    const eps = 3e-7;
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      h *= d * c;

      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;

      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Run PET (Precision-Effect Test)
  // Regress effect on SE: y = b0 + b1*SE
  runPET() {
    const weights = this.ses.map(se => 1 / (se * se));
    const result = this.wls(this.effects, this.ses, weights);

    return {
      method: 'PET',
      adjustedEffect: result.intercept,
      se: result.seIntercept,
      ci: [
        result.intercept - 1.96 * result.seIntercept,
        result.intercept + 1.96 * result.seIntercept
      ],
      biasCoefficient: result.slope,
      biasSE: result.seSlope,
      biasP: result.pSlope,
      hasBias: result.pSlope < 0.10,
      interpretation: result.pSlope < 0.10 ?
        'Significant small-study effect detected' :
        'No significant small-study effect'
    };
  }

  // Run PEESE (Precision-Effect Estimate with Standard Error)
  // Regress effect on SE^2: y = b0 + b1*SE^2
  runPEESE() {
    const weights = this.ses.map(se => 1 / (se * se));
    const seSquared = this.ses.map(se => se * se);
    const result = this.wls(this.effects, seSquared, weights);

    return {
      method: 'PEESE',
      adjustedEffect: result.intercept,
      se: result.seIntercept,
      ci: [
        result.intercept - 1.96 * result.seIntercept,
        result.intercept + 1.96 * result.seIntercept
      ],
      biasCoefficient: result.slope,
      biasSE: result.seSlope,
      biasP: result.pSlope,
      interpretation: 'PEESE provides conditional estimate when effect is non-zero'
    };
  }

  // Run combined PET-PEESE
  run() {
    const pet = this.runPET();
    const peese = this.runPEESE();

    // Decision rule: Use PEESE if PET rejects null (effect != 0)
    const petSignificant = Math.abs(pet.adjustedEffect) > 1.96 * pet.se;
    const recommended = petSignificant ? peese : pet;

    return {
      pet,
      peese,
      recommended: {
        ...recommended,
        reason: petSignificant ?
          'PET significant: using PEESE estimate' :
          'PET not significant: using PET estimate'
      },
      nStudies: this.n
    };
  }
}

// ============================================================================
// 3. DOI PLOT AND LFK INDEX (Furuya-Kanamori et al., 2018)
// Alternative to funnel plot for small-study effects
// Reference: Furuya-Kanamori L et al. Int J Evid Based Healthc. 2018
// ============================================================================

class DoiPlot {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  // Compute pooled effect
  computePooled() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const effect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    return effect;
  }

  // Compute z-scores (normal quantiles for Doi plot)
  computeZScores() {
    const pooled = this.computePooled();
    return this.effects.map((e, i) => (e - pooled) / this.ses[i]);
  }

  // Compute LFK Index (measure of asymmetry)
  computeLFKIndex() {
    const zScores = this.computeZScores();
    const sorted = [...zScores].sort((a, b) => a - b);

    // Compute ranks
    const n = sorted.length;
    const expectedRanks = sorted.map((_, i) => (i + 0.5) / n);

    // Normal quantiles of expected ranks
    const normalQuantiles = expectedRanks.map(p => this.normalQuantile(p));

    // LFK = Σ|z_i - z_expected| / n
    // Modified version: compare observed z to expected under symmetry
    let sumDiff = 0;
    for (let i = 0; i < n; i++) {
      sumDiff += Math.abs(sorted[i] - normalQuantiles[i]);
    }

    const lfk = sumDiff / n;

    // Interpretation thresholds (Furuya-Kanamori)
    let interpretation, severity;
    if (lfk < 1) {
      interpretation = 'No asymmetry';
      severity = 'none';
    } else if (lfk < 2) {
      interpretation = 'Minor asymmetry';
      severity = 'minor';
    } else {
      interpretation = 'Major asymmetry';
      severity = 'major';
    }

    return {
      lfk,
      interpretation,
      severity,
      n: this.n
    };
  }

  normalQuantile(p) {
    // Approximation of inverse normal CDF
    if (p <= 0) return -8;
    if (p >= 1) return 8;

    const a = [0, -3.969683028665376e1, 2.209460984245205e2,
               -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1];
    const b = [0, -5.447609879822406e1, 1.615858368580409e2,
               -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [0, -7.784894002430293e-3, -3.223964580411365e-1,
               -2.400758277161838, -2.549732539343734, 4.374664141464968];
    const d = [0, 7.784695709041462e-3, 3.224671290700398e-1,
               2.445134137142996, 3.754408661907416];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q, r;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[1]*q + c[2])*q + c[3])*q + c[4])*q + c[5])*q + c[0]) /
             ((((d[1]*q + d[2])*q + d[3])*q + d[4])*q + 1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[1]*r + a[2])*r + a[3])*r + a[4])*r + a[5])*r + a[0])*q /
             (((((b[1]*r + b[2])*r + b[3])*r + b[4])*r + b[5])*r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[1]*q + c[2])*q + c[3])*q + c[4])*q + c[5])*q + c[0]) /
              ((((d[1]*q + d[2])*q + d[3])*q + d[4])*q + 1);
    }
  }

  // Generate Doi plot data
  generatePlotData() {
    const pooled = this.computePooled();
    const zScores = this.computeZScores();

    // Create data points for Doi plot
    // X-axis: |z-score| (absolute deviation)
    // Y-axis: z-score (signed deviation)
    const points = zScores.map((z, i) => ({
      x: Math.abs(z),
      y: z,
      effect: this.effects[i],
      se: this.ses[i],
      deviation: this.effects[i] - pooled
    }));

    return {
      points,
      pooledEffect: pooled,
      lfkIndex: this.computeLFKIndex(),
      n: this.n
    };
  }

  run() {
    return {
      plotData: this.generatePlotData(),
      lfk: this.computeLFKIndex()
    };
  }
}

// ============================================================================
// 4. VEVEA-HEDGES SELECTION MODEL (1995)
// Weight-function model for publication bias
// Reference: Vevea JL, Hedges LV. Psychometrika. 1995;60:419-435
// ============================================================================

class VeveaHedgesSelectionModel {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    // P-value cutpoints (default: 0.05 one-tailed)
    this.cutpoints = options.cutpoints || [0.025, 0.05, 0.10, 0.50, 1.0];
    // Weight parameters (relative to largest interval)
    this.weights = options.weights || null; // If null, estimate
  }

  // Compute one-tailed p-value from z-score
  pValueFromZ(z) {
    return 1 - this.normalCDF(z);
  }

  normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return 0.5 * (1 + sign * y);
  }

  // Assign studies to p-value intervals
  assignToIntervals() {
    const intervals = [];
    for (let i = 0; i < this.cutpoints.length; i++) {
      intervals.push([]);
    }

    for (let i = 0; i < this.n; i++) {
      const z = this.effects[i] / this.ses[i];
      const p = this.pValueFromZ(z);

      for (let j = 0; j < this.cutpoints.length; j++) {
        if (p <= this.cutpoints[j]) {
          intervals[j].push(i);
          break;
        }
      }
    }

    return intervals;
  }

  // Compute adjusted effect using weight-function model
  computeAdjusted(weights) {
    const intervals = this.assignToIntervals();

    // Apply weights to precision
    let sumW = 0, sumWE = 0;
    for (let j = 0; j < intervals.length; j++) {
      for (const i of intervals[j]) {
        const w = weights[j] / (this.ses[i] * this.ses[i]);
        sumW += w;
        sumWE += w * this.effects[i];
      }
    }

    const adjustedEffect = sumWE / sumW;
    const adjustedSE = Math.sqrt(1 / sumW);

    return { effect: adjustedEffect, se: adjustedSE };
  }

  // Predefined moderate selection scenario
  moderateSelection() {
    // Weights decrease as p-value increases
    // Normalized so last interval = 1
    return [1.0, 0.99, 0.95, 0.80, 0.60];
  }

  // Predefined severe selection scenario
  severeSelection() {
    return [1.0, 0.90, 0.75, 0.50, 0.25];
  }

  // Run analysis with multiple scenarios
  run() {
    // Unadjusted
    const unadjusted = this.computeAdjusted(this.cutpoints.map(() => 1));

    // Moderate selection
    const moderateWeights = this.moderateSelection();
    const moderate = this.computeAdjusted(moderateWeights);

    // Severe selection
    const severeWeights = this.severeSelection();
    const severe = this.computeAdjusted(severeWeights);

    return {
      unadjusted: {
        effect: unadjusted.effect,
        se: unadjusted.se,
        ci: [unadjusted.effect - 1.96 * unadjusted.se, unadjusted.effect + 1.96 * unadjusted.se]
      },
      moderateSelection: {
        effect: moderate.effect,
        se: moderate.se,
        ci: [moderate.effect - 1.96 * moderate.se, moderate.effect + 1.96 * moderate.se],
        weights: moderateWeights
      },
      severeSelection: {
        effect: severe.effect,
        se: severe.se,
        ci: [severe.effect - 1.96 * severe.se, severe.effect + 1.96 * severe.se],
        weights: severeWeights
      },
      cutpoints: this.cutpoints,
      intervalCounts: this.assignToIntervals().map(arr => arr.length),
      nStudies: this.n
    };
  }
}

// ============================================================================
// 5. OUTLIER DIAGNOSTICS
// Cook's Distance, DFFITS, Studentized Residuals, Hat Values
// Reference: Viechtbauer W, Cheung MWL. Research Synthesis Methods. 2010
// ============================================================================

class OutlierDiagnostics {
  constructor(effects, ses, studyNames) {
    this.effects = effects;
    this.ses = ses;
    this.studyNames = studyNames || effects.map((_, i) => `Study ${i + 1}`);
    this.n = effects.length;
    this.variances = ses.map(se => se * se);
  }

  // Compute pooled effect with tau2
  computePooled() {
    const weights = this.variances.map(v => 1 / v);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const fixedEffect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - fixedEffect, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2 = Math.max(0, (Q - (this.n - 1)) / C);

    const reWeights = this.variances.map(v => 1 / (v + tau2));
    const sumREW = reWeights.reduce((a, b) => a + b, 0);
    const reEffect = reWeights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumREW;

    return { effect: reEffect, tau2, weights: reWeights, sumW: sumREW };
  }

  // Hat values (leverage)
  computeHatValues() {
    const { weights, sumW } = this.computePooled();
    return weights.map(w => w / sumW);
  }

  // Studentized residuals
  computeStudentizedResiduals() {
    const { effect, tau2 } = this.computePooled();
    const hatValues = this.computeHatValues();

    return this.effects.map((e, i) => {
      const residual = e - effect;
      const v = this.variances[i] + tau2;
      const seResid = Math.sqrt(v * (1 - hatValues[i]));
      return residual / seResid;
    });
  }

  // Externally studentized residuals (leave-one-out)
  computeExternalResiduals() {
    const { tau2 } = this.computePooled();

    return this.effects.map((_, i) => {
      // Leave-one-out estimate
      const looEffects = [...this.effects];
      const looVars = [...this.variances];
      looEffects.splice(i, 1);
      looVars.splice(i, 1);

      const looWeights = looVars.map(v => 1 / (v + tau2));
      const looSumW = looWeights.reduce((a, b) => a + b, 0);
      const looEffect = looWeights.reduce((s, w, j) => s + w * looEffects[j], 0) / looSumW;

      const residual = this.effects[i] - looEffect;
      const v = this.variances[i] + tau2;
      const seResid = Math.sqrt(v);

      return residual / seResid;
    });
  }

  // DFFITS (difference in fits)
  computeDFFITS() {
    const { effect, tau2, weights, sumW } = this.computePooled();
    const hatValues = this.computeHatValues();

    return this.effects.map((e, i) => {
      // Leave-one-out
      const looWeights = [...weights];
      looWeights.splice(i, 1);
      const looSumW = looWeights.reduce((a, b) => a + b, 0);
      const looEffects = [...this.effects];
      looEffects.splice(i, 1);
      const looEffect = looWeights.reduce((s, w, j) => s + w * looEffects[j], 0) / looSumW;

      const fitDiff = effect - looEffect;
      const v = this.variances[i] + tau2;
      const seYhat = Math.sqrt(v * hatValues[i]);

      return fitDiff / seYhat;
    });
  }

  // Cook's distance
  computeCooksD() {
    const { effect, tau2, weights, sumW } = this.computePooled();
    const p = 1; // Number of parameters (intercept only)

    return this.effects.map((e, i) => {
      // Leave-one-out
      const looWeights = [...weights];
      looWeights.splice(i, 1);
      const looSumW = looWeights.reduce((a, b) => a + b, 0);
      const looEffects = [...this.effects];
      looEffects.splice(i, 1);
      const looEffect = looWeights.reduce((s, w, j) => s + w * looEffects[j], 0) / looSumW;

      const fitDiff = effect - looEffect;

      // MSE estimate
      const mse = 1 / sumW;

      return Math.pow(fitDiff, 2) / (p * mse);
    });
  }

  // Identify outliers using multiple criteria
  identifyOutliers(thresholds = {}) {
    const studentized = this.computeStudentizedResiduals();
    const external = this.computeExternalResiduals();
    const dffits = this.computeDFFITS();
    const cooksD = this.computeCooksD();
    const hatValues = this.computeHatValues();

    // Default thresholds
    const studentizedThreshold = thresholds.studentized || 2.5;
    const dffitsThreshold = thresholds.dffits || 2 * Math.sqrt(1 / this.n);
    const cooksDThreshold = thresholds.cooksD || 4 / this.n;
    const leverageThreshold = thresholds.leverage || 3 / this.n;

    const diagnostics = [];
    const outliers = [];

    for (let i = 0; i < this.n; i++) {
      const isOutlier =
        Math.abs(studentized[i]) > studentizedThreshold ||
        Math.abs(external[i]) > 3 ||
        Math.abs(dffits[i]) > dffitsThreshold ||
        cooksD[i] > cooksDThreshold;

      const isInfluential =
        hatValues[i] > leverageThreshold ||
        cooksD[i] > cooksDThreshold;

      const diag = {
        study: this.studyNames[i],
        effect: this.effects[i],
        se: this.ses[i],
        studentized: studentized[i],
        external: external[i],
        dffits: dffits[i],
        cooksD: cooksD[i],
        hatValue: hatValues[i],
        isOutlier,
        isInfluential
      };

      diagnostics.push(diag);
      if (isOutlier || isInfluential) {
        outliers.push(diag);
      }
    }

    return {
      diagnostics,
      outliers,
      nOutliers: outliers.length,
      thresholds: {
        studentized: studentizedThreshold,
        dffits: dffitsThreshold,
        cooksD: cooksDThreshold,
        leverage: leverageThreshold
      }
    };
  }

  run() {
    return this.identifyOutliers();
  }
}

// ============================================================================
// 6. LEAVE-ONE-OUT CROSS-VALIDATION (LOOCV)
// Model validation for dose-response
// ============================================================================

class LeaveOneOutCV {
  constructor(effects, doses, ses, modelFitter) {
    this.effects = effects;
    this.doses = doses;
    this.ses = ses;
    this.n = effects.length;
    this.modelFitter = modelFitter; // Function that fits model
  }

  run() {
    const predictions = [];
    const residuals = [];
    let sse = 0;
    let ssWeight = 0;

    for (let i = 0; i < this.n; i++) {
      // Leave out study i
      const trainEffects = [...this.effects];
      const trainDoses = [...this.doses];
      const trainSEs = [...this.ses];

      trainEffects.splice(i, 1);
      trainDoses.splice(i, 1);
      trainSEs.splice(i, 1);

      // Fit model on remaining data
      try {
        const fit = this.modelFitter(trainDoses, trainEffects, trainSEs);
        const pred = this.predictFromFit(fit, this.doses[i]);

        predictions.push(pred);
        const resid = this.effects[i] - pred;
        residuals.push(resid);

        const weight = 1 / (this.ses[i] * this.ses[i]);
        sse += weight * resid * resid;
        ssWeight += weight;
      } catch (e) {
        predictions.push(NaN);
        residuals.push(NaN);
      }
    }

    const mse = sse / ssWeight;
    const rmse = Math.sqrt(mse);

    // R-squared (pseudo)
    const meanEffect = this.effects.reduce((a, b) => a + b, 0) / this.n;
    const ssTot = this.effects.reduce((s, e, i) => {
      const w = 1 / (this.ses[i] * this.ses[i]);
      return s + w * Math.pow(e - meanEffect, 2);
    }, 0);
    const r2 = 1 - sse / ssTot;

    return {
      predictions,
      residuals,
      mse,
      rmse,
      r2,
      nFolds: this.n,
      method: 'Leave-One-Out CV'
    };
  }

  // Override in subclass or pass prediction function
  predictFromFit(fit, dose) {
    if (typeof fit.predict === 'function') {
      return fit.predict(dose);
    }
    // Default Emax
    return fit.e0 + (fit.emax * dose) / (fit.ed50 + dose);
  }
}

// ============================================================================
// 7. TRANSITIVITY ASSESSMENT
// Check similarity of studies for NMA validity
// Reference: Salanti G. BMC Medicine. 2012
// ============================================================================

class TransitivityAssessment {
  constructor(studies) {
    // Each study: { id, treatment, comparator, covariates: { age, year, duration, ... } }
    this.studies = studies;
    this.n = studies.length;
  }

  // Extract unique comparisons
  getComparisons() {
    const comparisons = new Map();

    for (const study of this.studies) {
      const key = [study.treatment, study.comparator].sort().join('-');
      if (!comparisons.has(key)) {
        comparisons.set(key, []);
      }
      comparisons.get(key).push(study);
    }

    return comparisons;
  }

  // Assess covariate distribution across comparisons
  assessCovariateBalance(covariate) {
    const comparisons = this.getComparisons();
    const stats = [];

    for (const [comparison, studies] of comparisons) {
      const values = studies
        .map(s => s.covariates?.[covariate])
        .filter(v => v !== undefined && v !== null);

      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.length > 1 ?
          values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1) : 0;

        stats.push({
          comparison,
          n: values.length,
          mean,
          sd: Math.sqrt(variance),
          min: Math.min(...values),
          max: Math.max(...values)
        });
      }
    }

    // Test for heterogeneity across comparisons (ANOVA-like)
    if (stats.length < 2) {
      return { covariate, stats, homogeneous: null, message: 'Insufficient comparisons' };
    }

    const grandMean = stats.reduce((s, c) => s + c.mean * c.n, 0) /
                      stats.reduce((s, c) => s + c.n, 0);

    const ssBetween = stats.reduce((s, c) => s + c.n * Math.pow(c.mean - grandMean, 2), 0);
    const dfBetween = stats.length - 1;
    const msBetween = ssBetween / dfBetween;

    const ssWithin = stats.reduce((s, c) => s + (c.n - 1) * c.sd * c.sd, 0);
    const dfWithin = stats.reduce((s, c) => s + c.n, 0) - stats.length;
    const msWithin = ssWithin / dfWithin;

    const F = msBetween / (msWithin || 0.001);

    // Approximate p-value
    const pValue = 1 - this.fCDF(F, dfBetween, dfWithin);

    return {
      covariate,
      stats,
      grandMean,
      F,
      dfBetween,
      dfWithin,
      pValue,
      homogeneous: pValue > 0.10,
      interpretation: pValue > 0.10 ?
        'Covariate distribution similar across comparisons (transitivity supported)' :
        'Covariate distribution differs across comparisons (transitivity concern)'
    };
  }

  fCDF(f, d1, d2) {
    if (f <= 0) return 0;
    const x = d2 / (d2 + d1 * f);
    return 1 - this.betaIncomplete(d2 / 2, d1 / 2, x);
  }

  betaIncomplete(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    const bt = Math.exp(
      this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betaCF(a, b, x) / a;
    }
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
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Full transitivity assessment
  run(covariates = ['age', 'year', 'duration', 'sampleSize']) {
    const results = [];

    for (const cov of covariates) {
      const assessment = this.assessCovariateBalance(cov);
      if (assessment.stats.length > 0) {
        results.push(assessment);
      }
    }

    // Overall transitivity judgment
    const concerns = results.filter(r => r.homogeneous === false);

    return {
      assessments: results,
      nCovariates: results.length,
      nConcerns: concerns.length,
      concernedCovariates: concerns.map(c => c.covariate),
      overallJudgment: concerns.length === 0 ? 'Transitivity supported' :
        concerns.length <= 1 ? 'Minor transitivity concerns' :
        'Major transitivity concerns',
      recommendation: concerns.length > 1 ?
        'Consider network meta-regression or subgroup analysis' :
        'Proceed with network meta-analysis'
    };
  }
}

// ============================================================================
// 8. MULTIVARIATE OUTCOME CORRELATION
// Handle correlated outcomes within studies
// Reference: Jackson D et al. Statistics in Medicine. 2011
// ============================================================================

class MultivariateCorrelation {
  constructor(studies) {
    // Each study: { id, outcomes: [{ name, effect, se }], correlation: 0.5 }
    this.studies = studies;
    this.n = studies.length;
  }

  // Compute within-study covariance matrix
  computeWithinStudyCov(study) {
    const k = study.outcomes.length;
    const V = [];

    for (let i = 0; i < k; i++) {
      V[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          V[i][j] = study.outcomes[i].se * study.outcomes[i].se;
        } else {
          const rho = study.correlation || 0.5; // Default correlation
          V[i][j] = rho * study.outcomes[i].se * study.outcomes[j].se;
        }
      }
    }

    return V;
  }

  // Inverse of 2x2 matrix
  invert2x2(M) {
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    if (Math.abs(det) < 1e-10) return null;

    return [
      [M[1][1] / det, -M[0][1] / det],
      [-M[1][0] / det, M[0][0] / det]
    ];
  }

  // Multivariate pooled effect (bivariate case)
  poolBivariate() {
    // For simplicity, handle bivariate case (2 outcomes)
    let sumW = [[0, 0], [0, 0]];
    let sumWE = [0, 0];

    for (const study of this.studies) {
      if (study.outcomes.length !== 2) continue;

      const V = this.computeWithinStudyCov(study);
      const Vinv = this.invert2x2(V);
      if (!Vinv) continue;

      // Accumulate
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          sumW[i][j] += Vinv[i][j];
        }
        sumWE[i] += Vinv[i][0] * study.outcomes[0].effect +
                    Vinv[i][1] * study.outcomes[1].effect;
      }
    }

    const sumWinv = this.invert2x2(sumW);
    if (!sumWinv) return null;

    const pooled = [
      sumWinv[0][0] * sumWE[0] + sumWinv[0][1] * sumWE[1],
      sumWinv[1][0] * sumWE[0] + sumWinv[1][1] * sumWE[1]
    ];

    const se = [
      Math.sqrt(sumWinv[0][0]),
      Math.sqrt(sumWinv[1][1])
    ];

    const correlation = sumWinv[0][1] / (se[0] * se[1]);

    return {
      effects: pooled,
      ses: se,
      cis: pooled.map((e, i) => [e - 1.96 * se[i], e + 1.96 * se[i]]),
      pooledCorrelation: correlation,
      covMatrix: sumWinv,
      nStudies: this.studies.filter(s => s.outcomes.length === 2).length
    };
  }

  run() {
    const bivariate = this.poolBivariate();

    return {
      bivariate,
      method: 'Multivariate random-effects',
      assumption: 'Common within-study correlation assumed'
    };
  }
}
