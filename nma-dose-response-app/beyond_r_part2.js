// ============================================================================
// BEYOND R PART 2: ADDITIONAL ADVANCED METHODS
// ============================================================================

// ============================================================================
// 11. WAAP-WLS (Weighted Average of Adequately Powered studies)
// Stanley & Doucouliagos - Better than naive pooling
// ============================================================================

class WAAPWLS {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.powerThreshold = options.powerThreshold || 0.80;
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

  // Compute power for detecting true effect with given SE
  computePower(trueEffect, se) {
    const zCrit = 1.96;
    const ncp = Math.abs(trueEffect) / se;
    return 1 - this.normalCDF(zCrit - ncp) + this.normalCDF(-zCrit - ncp);
  }

  // WAAP: Weight only adequately powered studies
  waap() {
    // First get preliminary estimate (PET estimate)
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const naiveEstimate = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    // Compute power for each study
    const powers = this.ses.map(se => this.computePower(naiveEstimate, se));

    // Select adequately powered studies
    const adequate = [];
    for (let i = 0; i < this.n; i++) {
      if (powers[i] >= this.powerThreshold) {
        adequate.push({ effect: this.effects[i], se: this.ses[i], power: powers[i] });
      }
    }

    if (adequate.length < 2) {
      return {
        error: `Only ${adequate.length} adequately powered studies (need >= 2)`,
        nAdequate: adequate.length,
        nTotal: this.n
      };
    }

    // WAAP estimate
    const waapWeights = adequate.map(s => 1 / (s.se * s.se));
    const waapSumW = waapWeights.reduce((a, b) => a + b, 0);
    const waapEstimate = waapWeights.reduce((s, w, i) => s + w * adequate[i].effect, 0) / waapSumW;
    const waapSE = Math.sqrt(1 / waapSumW);

    return {
      estimate: waapEstimate,
      se: waapSE,
      ci: [waapEstimate - 1.96 * waapSE, waapEstimate + 1.96 * waapSE],
      nAdequate: adequate.length,
      nTotal: this.n,
      meanPower: adequate.reduce((s, a) => s + a.power, 0) / adequate.length,
      naive: naiveEstimate,
      bias: naiveEstimate - waapEstimate
    };
  }

  // WLS: Weighted Least Squares (effect on SE)
  wls() {
    // Regression: effect = beta0 + beta1 * SE
    const weights = this.ses.map(se => 1 / (se * se));
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (let i = 0; i < this.n; i++) {
      sumW += weights[i];
      sumWX += weights[i] * this.ses[i];
      sumWY += weights[i] * this.effects[i];
      sumWXX += weights[i] * this.ses[i] * this.ses[i];
      sumWXY += weights[i] * this.ses[i] * this.effects[i];
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const beta0 = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const beta1 = (sumW * sumWXY - sumWX * sumWY) / denom;

    // SE of intercept
    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = beta0 + beta1 * this.ses[i];
      ssr += weights[i] * Math.pow(this.effects[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seBeta0 = Math.sqrt(mse * sumWXX / denom);

    return {
      estimate: beta0,
      se: seBeta0,
      ci: [beta0 - 1.96 * seBeta0, beta0 + 1.96 * seBeta0],
      slope: beta1,
      slopeSignificant: Math.abs(beta1 / Math.sqrt(mse * sumW / denom)) > 1.96
    };
  }

  run() {
    const waap = this.waap();
    const wls = this.wls();

    // Combined WAAP-WLS: use WAAP if enough powered studies, else WLS
    const combined = waap.error ? wls : waap;

    return {
      waap,
      wls,
      combined,
      recommendation: waap.error ?
        'Using WLS (insufficient powered studies for WAAP)' :
        'Using WAAP (adequately powered studies available)',
      nStudies: this.n,
      method: 'WAAP-WLS'
    };
  }
}

// ============================================================================
// 12. CUMULATIVE META-ANALYSIS FOR BIAS DETECTION
// Lau et al. (1992) - Order by precision to detect small-study effects
// ============================================================================

class CumulativeMetaAnalysis {
  constructor(effects, ses, studyNames) {
    this.effects = effects;
    this.ses = ses;
    this.studyNames = studyNames || effects.map((_, i) => `Study ${i + 1}`);
    this.n = effects.length;
  }

  // Run cumulative MA by different orderings
  byPrecision() {
    // Order by precision (1/SE), highest first
    const indices = Array.from({ length: this.n }, (_, i) => i);
    indices.sort((a, b) => (1 / this.ses[a]) - (1 / this.ses[b])).reverse();

    return this.cumulativeByOrder(indices, 'precision');
  }

  byYear(years) {
    if (!years || years.length !== this.n) {
      return { error: 'Years required for chronological analysis' };
    }

    const indices = Array.from({ length: this.n }, (_, i) => i);
    indices.sort((a, b) => years[a] - years[b]);

    return this.cumulativeByOrder(indices, 'year');
  }

  bySampleSize(sampleSizes) {
    if (!sampleSizes || sampleSizes.length !== this.n) {
      // Use 1/SE² as proxy
      const indices = Array.from({ length: this.n }, (_, i) => i);
      indices.sort((a, b) => (1 / (this.ses[b] * this.ses[b])) - (1 / (this.ses[a] * this.ses[a])));
      return this.cumulativeByOrder(indices, 'sample_size_proxy');
    }

    const indices = Array.from({ length: this.n }, (_, i) => i);
    indices.sort((a, b) => sampleSizes[b] - sampleSizes[a]);

    return this.cumulativeByOrder(indices, 'sample_size');
  }

  cumulativeByOrder(indices, orderType) {
    const results = [];
    let cumEffects = [], cumSEs = [];

    for (let k = 0; k < indices.length; k++) {
      const idx = indices[k];
      cumEffects.push(this.effects[idx]);
      cumSEs.push(this.ses[idx]);

      // Random effects pooled estimate
      const re = this.randomEffects(cumEffects, cumSEs);

      results.push({
        step: k + 1,
        studyAdded: this.studyNames[idx],
        estimate: re.estimate,
        se: re.se,
        ci: re.ci,
        tau2: re.tau2,
        nStudies: k + 1
      });
    }

    // Detect drift (change in estimate as smaller studies added)
    const earlyEstimate = results[Math.floor(this.n / 3)]?.estimate;
    const finalEstimate = results[this.n - 1]?.estimate;
    const drift = earlyEstimate ? finalEstimate - earlyEstimate : 0;

    return {
      order: orderType,
      results,
      drift: {
        value: drift,
        direction: drift > 0.1 ? 'increasing' : drift < -0.1 ? 'decreasing' : 'stable',
        interpretation: Math.abs(drift) > 0.15 ?
          'Substantial drift detected: possible small-study effects' :
          'Minimal drift across accumulation'
      }
    };
  }

  randomEffects(effects, ses) {
    const n = effects.length;
    if (n === 1) {
      return { estimate: effects[0], se: ses[0], ci: [effects[0] - 1.96 * ses[0], effects[0] + 1.96 * ses[0]], tau2: 0 };
    }

    const weights = ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const fixedEst = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

    const Q = weights.reduce((s, w, i) => s + w * Math.pow(effects[i] - fixedEst, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2 = Math.max(0, (Q - (n - 1)) / C);

    const weightsRE = ses.map(se => 1 / (se * se + tau2));
    const sumWRE = weightsRE.reduce((a, b) => a + b, 0);
    const estimate = weightsRE.reduce((s, w, i) => s + w * effects[i], 0) / sumWRE;
    const se = Math.sqrt(1 / sumWRE);

    return {
      estimate,
      se,
      ci: [estimate - 1.96 * se, estimate + 1.96 * se],
      tau2
    };
  }

  run() {
    return {
      byPrecision: this.byPrecision(),
      bySampleSize: this.bySampleSize(),
      nStudies: this.n,
      method: 'Cumulative Meta-Analysis'
    };
  }
}

// ============================================================================
// 13. SUNSET POWER ANALYSIS
// Simonsohn (2015) - Power analysis for publication bias
// ============================================================================

class SunsetPowerAnalysis {
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

  // Median power for detecting pooled effect
  medianPower() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooled = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const powers = this.ses.map(se => {
      const ncp = Math.abs(pooled) / se;
      return 1 - this.normalCDF(1.96 - ncp);
    });

    powers.sort((a, b) => a - b);
    const median = powers[Math.floor(this.n / 2)];

    return {
      medianPower: median,
      meanPower: powers.reduce((a, b) => a + b, 0) / this.n,
      minPower: Math.min(...powers),
      maxPower: Math.max(...powers),
      pooledEffect: pooled
    };
  }

  // 33% power rule (Simonsohn)
  powerRule33() {
    const { medianPower, pooledEffect } = this.medianPower();

    // If median power < 33%, likely p-hacked
    const pHacking = medianPower < 0.33;

    // Effect needed for 33% power at median SE
    const medianSE = [...this.ses].sort((a, b) => a - b)[Math.floor(this.n / 2)];
    const z33 = 0.44; // z for 33% power above critical value
    const effectFor33 = (1.96 + z33) * medianSE;

    return {
      medianPower,
      threshold: 0.33,
      pHacking,
      interpretation: pHacking ?
        `Underpowered studies (median power = ${(medianPower * 100).toFixed(1)}% < 33%): possible p-hacking` :
        `Adequately powered (median power = ${(medianPower * 100).toFixed(1)}%)`,
      effectFor33,
      pooledEffect
    };
  }

  // Sunset plot data
  sunsetPlotData() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooled = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    // Power levels for sunset bands
    const powerLevels = [0.05, 0.33, 0.66, 0.80];
    const bands = [];

    for (const power of powerLevels) {
      // Effect needed for this power level at various SEs
      const ncp = this.normalQuantile(1 - power) + 1.96;
      bands.push({
        power,
        getEffect: (se) => ncp * se
      });
    }

    // Study points with power
    const points = this.effects.map((e, i) => {
      const ncp = Math.abs(pooled) / this.ses[i];
      const power = 1 - this.normalCDF(1.96 - ncp);
      return {
        effect: e,
        se: this.ses[i],
        power,
        inSunset: power < 0.33
      };
    });

    return { bands, points, pooled };
  }

  normalQuantile(p) {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1];
      const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
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
    const powerAnalysis = this.medianPower();
    const rule33 = this.powerRule33();
    const plotData = this.sunsetPlotData();

    return {
      power: powerAnalysis,
      rule33,
      plotData,
      nStudies: this.n,
      nInSunset: plotData.points.filter(p => p.inSunset).length,
      method: 'Sunset Power Analysis'
    };
  }
}

// ============================================================================
// 14. LEAVE-ONE-OUT INFLUENCE ON BIAS
// How each study affects bias tests
// ============================================================================

class LeaveOneOutBias {
  constructor(effects, ses, studyNames) {
    this.effects = effects;
    this.ses = ses;
    this.studyNames = studyNames || effects.map((_, i) => `Study ${i + 1}`);
    this.n = effects.length;
  }

  // Egger test
  eggerTest(effects, ses) {
    const n = effects.length;
    const weights = ses.map(se => 1 / (se * se));
    const precision = ses.map(se => 1 / se);
    const standardized = effects.map((e, i) => e / ses[i]);

    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
    for (let i = 0; i < n; i++) {
      sumW += weights[i];
      sumWX += weights[i] * precision[i];
      sumWY += weights[i] * standardized[i];
      sumWXX += weights[i] * precision[i] * precision[i];
      sumWXY += weights[i] * precision[i] * standardized[i];
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const intercept = (sumWXX * sumWY - sumWX * sumWXY) / denom;

    let ssr = 0;
    for (let i = 0; i < n; i++) {
      const pred = intercept + ((sumW * sumWXY - sumWX * sumWY) / denom) * precision[i];
      ssr += weights[i] * Math.pow(standardized[i] - pred, 2);
    }
    const mse = ssr / (n - 2);
    const seIntercept = Math.sqrt(mse * sumWXX / denom);

    const t = intercept / seIntercept;
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), n - 2));

    return { intercept, t, pValue };
  }

  tCDF(t, df) {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaInc(df / 2, 0.5, x);
  }

  betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this.betaCF(a, b, x) / a;
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }

  betaCF(a, b, x) {
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d; let h = d;
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
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  run() {
    // Full dataset Egger test
    const fullEgger = this.eggerTest(this.effects, this.ses);

    // Leave-one-out
    const looResults = [];
    for (let i = 0; i < this.n; i++) {
      const looEffects = this.effects.filter((_, j) => j !== i);
      const looSEs = this.ses.filter((_, j) => j !== i);

      const looEgger = this.eggerTest(looEffects, looSEs);

      looResults.push({
        omitted: this.studyNames[i],
        intercept: looEgger.intercept,
        pValue: looEgger.pValue,
        changeInIntercept: looEgger.intercept - fullEgger.intercept,
        changeInP: looEgger.pValue - fullEgger.pValue,
        flipsSignificance: (fullEgger.pValue < 0.10) !== (looEgger.pValue < 0.10)
      });
    }

    // Identify influential studies
    const influential = looResults.filter(r =>
      Math.abs(r.changeInIntercept) > 0.5 || r.flipsSignificance
    );

    return {
      fullAnalysis: fullEgger,
      leaveOneOut: looResults,
      influential: influential.map(i => i.omitted),
      nInfluential: influential.length,
      nStudies: this.n,
      method: 'Leave-One-Out Bias Analysis'
    };
  }
}

// ============================================================================
// 15. REGRESSION-BASED TESTS
// Macaskill, Deeks et al. - Alternative small-study tests
// ============================================================================

class RegressionBasedTests {
  constructor(effects, ses, sampleSizes) {
    this.effects = effects;
    this.ses = ses;
    this.sampleSizes = sampleSizes;
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

  // Macaskill's test - uses sample size
  macaskill() {
    if (!this.sampleSizes) {
      // Use 1/SE² as proxy for sample size
      this.sampleSizes = this.ses.map(se => 1 / (se * se));
    }

    const weights = this.ses.map(se => 1 / (se * se));
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (let i = 0; i < this.n; i++) {
      const x = this.sampleSizes[i];
      const y = this.effects[i];
      sumW += weights[i];
      sumWX += weights[i] * x;
      sumWY += weights[i] * y;
      sumWXX += weights[i] * x * x;
      sumWXY += weights[i] * x * y;
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const beta0 = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const beta1 = (sumW * sumWXY - sumWX * sumWY) / denom;

    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = beta0 + beta1 * this.sampleSizes[i];
      ssr += weights[i] * Math.pow(this.effects[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seBeta1 = Math.sqrt(mse * sumW / denom);

    const t = beta1 / seBeta1;
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), this.n - 2));

    return {
      slope: beta1,
      slopeSE: seBeta1,
      t,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Macaskill significant: sample size related bias (p=${pValue.toFixed(3)})` :
        `No sample size bias (p=${pValue.toFixed(3)})`,
      method: 'Macaskill Test'
    };
  }

  // Deeks' test - for diagnostic test accuracy
  deeks() {
    // Uses effective sample size: 1/variance
    const ess = this.ses.map(se => 1 / (se * se));
    const sqrtESS = ess.map(e => Math.sqrt(e));

    const weights = ess;
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (let i = 0; i < this.n; i++) {
      const x = 1 / sqrtESS[i]; // Inverse sqrt of ESS
      const y = this.effects[i];
      sumW += weights[i];
      sumWX += weights[i] * x;
      sumWY += weights[i] * y;
      sumWXX += weights[i] * x * x;
      sumWXY += weights[i] * x * y;
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const beta0 = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const beta1 = (sumW * sumWXY - sumWX * sumWY) / denom;

    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = beta0 + beta1 / sqrtESS[i];
      ssr += weights[i] * Math.pow(this.effects[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seBeta1 = Math.sqrt(mse * sumW / denom);

    const t = beta1 / seBeta1;
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), this.n - 2));

    return {
      slope: beta1,
      slopeSE: seBeta1,
      t,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Deeks' funnel asymmetry detected (p=${pValue.toFixed(3)})` :
        `No funnel asymmetry (p=${pValue.toFixed(3)})`,
      method: 'Deeks Test'
    };
  }

  tCDF(t, df) {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaInc(df / 2, 0.5, x);
  }

  betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this.betaCF(a, b, x) / a;
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }

  betaCF(a, b, x) {
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d; let h = d;
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
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Thompson-Sharp test
  thompsonSharp() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooled = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    // Standardized residuals vs variance
    const residuals = this.effects.map(e => e - pooled);
    const variances = this.ses.map(se => se * se);

    // Spearman correlation
    const ranks1 = this.getRanks(residuals);
    const ranks2 = this.getRanks(variances);

    let sumD2 = 0;
    for (let i = 0; i < this.n; i++) {
      sumD2 += Math.pow(ranks1[i] - ranks2[i], 2);
    }
    const rho = 1 - (6 * sumD2) / (this.n * (this.n * this.n - 1));

    // Test significance
    const t = rho * Math.sqrt((this.n - 2) / (1 - rho * rho));
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), this.n - 2));

    return {
      rho,
      t,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Thompson-Sharp significant: residual-variance correlation (rho=${rho.toFixed(3)})` :
        `No significant correlation (rho=${rho.toFixed(3)})`,
      method: 'Thompson-Sharp Test'
    };
  }

  getRanks(arr) {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].i] = i + 1;
    }
    return ranks;
  }

  run() {
    return {
      macaskill: this.macaskill(),
      deeks: this.deeks(),
      thompsonSharp: this.thompsonSharp(),
      nStudies: this.n,
      method: 'Regression-Based Tests'
    };
  }
}

// ============================================================================
// 16. ARCSINE TEST
// Rücker et al. - For proportions/rates
// ============================================================================

class ArcsineTest {
  constructor(effects, ses, events, totals) {
    this.effects = effects;
    this.ses = ses;
    this.events = events;
    this.totals = totals;
    this.n = effects.length;
  }

  // Arcsine transformation
  arcsine(p) {
    return Math.asin(Math.sqrt(Math.max(0, Math.min(1, p))));
  }

  run() {
    if (!this.events || !this.totals) {
      return { error: 'Arcsine test requires event counts and totals' };
    }

    // Transform to arcsine scale
    const arcsines = [];
    const arcsineVars = [];

    for (let i = 0; i < this.n; i++) {
      const p = this.events[i] / this.totals[i];
      const as = this.arcsine(p);
      const v = 1 / (4 * this.totals[i]); // Variance of arcsine

      arcsines.push(as);
      arcsineVars.push(v);
    }

    // Weighted regression on arcsine scale
    const weights = arcsineVars.map(v => 1 / v);
    const sqrtN = this.totals.map(n => Math.sqrt(n));

    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
    for (let i = 0; i < this.n; i++) {
      const x = 1 / sqrtN[i];
      sumW += weights[i];
      sumWX += weights[i] * x;
      sumWY += weights[i] * arcsines[i];
      sumWXX += weights[i] * x * x;
      sumWXY += weights[i] * x * arcsines[i];
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const beta0 = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const beta1 = (sumW * sumWXY - sumWX * sumWY) / denom;

    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = beta0 + beta1 / sqrtN[i];
      ssr += weights[i] * Math.pow(arcsines[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seBeta1 = Math.sqrt(mse * sumW / denom);

    const t = beta1 / seBeta1;
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), this.n - 2));

    return {
      intercept: beta0,
      slope: beta1,
      slopeSE: seBeta1,
      t,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Arcsine test significant: small-study bias detected` :
        `No significant small-study bias`,
      method: 'Arcsine Test'
    };
  }

  tCDF(t, df) {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaInc(df / 2, 0.5, x);
  }

  betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this.betaCF(a, b, x) / a;
    return 1 - bt * this.betaCF(b, a, 1 - x) / b;
  }

  betaCF(a, b, x) {
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d; let h = d;
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
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
}
