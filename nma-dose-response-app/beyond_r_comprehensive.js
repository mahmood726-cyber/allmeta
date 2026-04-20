// ============================================================================
// BEYOND R: COMPREHENSIVE META-ANALYSIS METHODS
// Surpassing metafor, weightr, RoBMA, puniform, metasens, PublicationBias
// ============================================================================

// ============================================================================
// 1. COPAS SELECTION MODEL (metasens::copas)
// Reference: Copas & Shi (2000, 2001) - Most sophisticated selection model
// ============================================================================

class CopasSelectionModel {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.gamma0Range = [-2, 2];
    this.gamma1Range = [0, 2];
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

  // Selection probability: P(select) = Phi(gamma0 + gamma1/se)
  selectionProbability(se, gamma0, gamma1) {
    return this.normalCDF(gamma0 + gamma1 / se);
  }

  // Log-likelihood for Copas model
  logLikelihood(mu, tau2, rho, gamma0, gamma1) {
    let ll = 0;
    for (let i = 0; i < this.n; i++) {
      const se = this.ses[i];
      const y = this.effects[i];
      const v = se * se + tau2;
      const sigma = Math.sqrt(v);

      // Conditional mean and variance given selection
      const u = gamma0 + gamma1 / se;
      const lambda = this.normalPDF(u) / this.normalCDF(u);

      const condMean = mu + rho * sigma * lambda;
      const condVar = v * (1 - rho * rho * lambda * (lambda + u));

      if (condVar <= 0) continue;

      // Contribution to likelihood
      ll += -0.5 * Math.log(2 * Math.PI * condVar);
      ll += -0.5 * Math.pow(y - condMean, 2) / condVar;
      ll += Math.log(this.normalCDF(u)); // Selection probability
    }
    return ll;
  }

  // Grid search optimization
  optimize() {
    // Initial estimates
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const muInit = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - muInit, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2Init = Math.max(0, (Q - (this.n - 1)) / C);

    let bestLL = -Infinity;
    let bestParams = { mu: muInit, tau2: tau2Init, rho: 0, gamma0: 0, gamma1: 0 };

    // Coarse grid search
    const muRange = [muInit - 0.5, muInit - 0.25, muInit, muInit + 0.25, muInit + 0.5];
    const tau2Range = [0, tau2Init * 0.5, tau2Init, tau2Init * 1.5, tau2Init * 2];
    const rhoRange = [-0.9, -0.5, 0, 0.5, 0.9];
    const gamma0Range = [-1, 0, 1];
    const gamma1Range = [0, 0.5, 1];

    for (const mu of muRange) {
      for (const tau2 of tau2Range) {
        for (const rho of rhoRange) {
          for (const gamma0 of gamma0Range) {
            for (const gamma1 of gamma1Range) {
              const ll = this.logLikelihood(mu, tau2, rho, gamma0, gamma1);
              if (ll > bestLL && isFinite(ll)) {
                bestLL = ll;
                bestParams = { mu, tau2, rho, gamma0, gamma1 };
              }
            }
          }
        }
      }
    }

    return bestParams;
  }

  // Sensitivity analysis across gamma1 values
  sensitivityAnalysis() {
    const results = [];
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const unadjusted = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    for (let gamma1 = 0; gamma1 <= 2; gamma1 += 0.2) {
      const params = this.optimizeForGamma1(gamma1);
      const pSelect = this.ses.map(se => this.selectionProbability(se, params.gamma0, gamma1));
      const minP = Math.min(...pSelect);

      results.push({
        gamma1,
        mu: params.mu,
        tau2: params.tau2,
        rho: params.rho,
        minSelectionProb: minP,
        bias: unadjusted - params.mu
      });
    }
    return results;
  }

  optimizeForGamma1(gamma1) {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const muInit = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - muInit, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2Init = Math.max(0, (Q - (this.n - 1)) / C);

    let bestLL = -Infinity;
    let bestParams = { mu: muInit, tau2: tau2Init, rho: 0, gamma0: 0 };

    for (const mu of [muInit - 0.3, muInit, muInit + 0.3]) {
      for (const tau2 of [0, tau2Init, tau2Init * 2]) {
        for (const rho of [-0.8, -0.4, 0, 0.4, 0.8]) {
          for (const gamma0 of [-1, 0, 1]) {
            const ll = this.logLikelihood(mu, tau2, rho, gamma0, gamma1);
            if (ll > bestLL && isFinite(ll)) {
              bestLL = ll;
              bestParams = { mu, tau2, rho, gamma0 };
            }
          }
        }
      }
    }
    return bestParams;
  }

  run() {
    const params = this.optimize();
    const sensitivity = this.sensitivityAnalysis();

    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const unadjusted = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    return {
      adjusted: {
        mu: params.mu,
        tau2: params.tau2,
        tau: Math.sqrt(params.tau2),
        se: Math.sqrt(1 / sumW)
      },
      selection: {
        rho: params.rho,
        gamma0: params.gamma0,
        gamma1: params.gamma1,
        interpretation: params.rho < -0.3 ? 'Strong selection (negative rho)' :
                        params.rho < 0 ? 'Moderate selection' : 'Minimal selection'
      },
      unadjusted,
      bias: unadjusted - params.mu,
      percentBias: ((unadjusted - params.mu) / Math.abs(unadjusted)) * 100,
      sensitivity,
      nStudies: this.n,
      method: 'Copas Selection Model'
    };
  }
}

// ============================================================================
// 2. P-UNIFORM* (puniform package) - van Aert et al. (2016)
// More accurate than P-curve, handles heterogeneity
// ============================================================================

class PUniformStar {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.alpha = options.alpha || 0.05;
    this.sidedness = options.sidedness || 'two';
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

  // Get p-values
  getPValues() {
    return this.effects.map((e, i) => {
      const z = Math.abs(e / this.ses[i]);
      return 2 * (1 - this.normalCDF(z));
    });
  }

  // Conditional probability given true effect mu
  conditionalProb(pObs, mu, se) {
    const zCrit = this.normalQuantile(1 - this.alpha / 2);
    const zObs = this.normalQuantile(1 - pObs / 2);

    // Under true effect mu, z ~ N(mu/se, 1)
    const ncp = mu / se;

    // P(z > zObs | z > zCrit, mu)
    const pAboveObs = 1 - this.normalCDF(zObs - ncp);
    const pAboveCrit = 1 - this.normalCDF(zCrit - ncp);

    if (pAboveCrit < 1e-10) return 0.5;
    return pAboveObs / pAboveCrit;
  }

  // Estimate mu using method of moments
  estimateMu() {
    const pValues = this.getPValues();
    const significant = [];

    for (let i = 0; i < this.n; i++) {
      if (pValues[i] < this.alpha) {
        significant.push({ p: pValues[i], se: this.ses[i], effect: this.effects[i] });
      }
    }

    if (significant.length < 2) return null;

    // Grid search for mu that makes conditional p-values uniform
    let bestMu = 0;
    let bestStat = Infinity;

    for (let mu = -2; mu <= 2; mu += 0.05) {
      const condPs = significant.map(s => this.conditionalProb(s.p, mu, s.se));
      // Test for uniformity using Kolmogorov-Smirnov-like statistic
      condPs.sort((a, b) => a - b);
      let maxDev = 0;
      for (let i = 0; i < condPs.length; i++) {
        const expected = (i + 0.5) / condPs.length;
        maxDev = Math.max(maxDev, Math.abs(condPs[i] - expected));
      }
      if (maxDev < bestStat) {
        bestStat = maxDev;
        bestMu = mu;
      }
    }

    return bestMu;
  }

  // Publication bias test
  publicationBiasTest() {
    const pValues = this.getPValues();
    const significant = pValues.filter(p => p < this.alpha);

    if (significant.length < 3) {
      return { error: 'Insufficient significant studies' };
    }

    // Under no bias, significant p-values should be uniform on (0, alpha)
    const scaled = significant.map(p => p / this.alpha);
    scaled.sort((a, b) => a - b);

    // Kolmogorov-Smirnov test for uniformity
    let D = 0;
    const n = scaled.length;
    for (let i = 0; i < n; i++) {
      const dPlus = (i + 1) / n - scaled[i];
      const dMinus = scaled[i] - i / n;
      D = Math.max(D, dPlus, dMinus);
    }

    // Approximate p-value for KS test
    const sqrtN = Math.sqrt(n);
    const ksP = 2 * Math.exp(-2 * D * D * n);

    return {
      D,
      pValue: ksP,
      significant: ksP < 0.10,
      interpretation: ksP < 0.10 ? 'Publication bias detected' : 'No significant bias'
    };
  }

  // Heterogeneity-adjusted estimate (p-uniform*)
  pUniformStar() {
    const pValues = this.getPValues();
    const significant = [];

    for (let i = 0; i < this.n; i++) {
      if (pValues[i] < this.alpha) {
        significant.push({ p: pValues[i], se: this.ses[i], effect: this.effects[i], idx: i });
      }
    }

    if (significant.length < 3) {
      return { error: 'Need at least 3 significant studies' };
    }

    // Estimate effect accounting for heterogeneity
    const muEst = this.estimateMu();
    if (muEst === null) return { error: 'Could not estimate effect' };

    // Bootstrap CI
    const bootstrapMus = [];
    for (let b = 0; b < 500; b++) {
      const bootSample = [];
      for (let i = 0; i < significant.length; i++) {
        const idx = Math.floor(Math.random() * significant.length);
        bootSample.push(significant[idx]);
      }

      // Re-estimate with bootstrap sample
      let bestMu = 0, bestStat = Infinity;
      for (let mu = -2; mu <= 2; mu += 0.1) {
        const condPs = bootSample.map(s => this.conditionalProb(s.p, mu, s.se));
        condPs.sort((a, b) => a - b);
        let maxDev = 0;
        for (let j = 0; j < condPs.length; j++) {
          maxDev = Math.max(maxDev, Math.abs(condPs[j] - (j + 0.5) / condPs.length));
        }
        if (maxDev < bestStat) {
          bestStat = maxDev;
          bestMu = mu;
        }
      }
      bootstrapMus.push(bestMu);
    }

    bootstrapMus.sort((a, b) => a - b);
    const ci = [bootstrapMus[Math.floor(0.025 * 500)], bootstrapMus[Math.floor(0.975 * 500)]];

    return {
      estimate: muEst,
      ci,
      se: (ci[1] - ci[0]) / (2 * 1.96),
      nSignificant: significant.length,
      nTotal: this.n
    };
  }

  run() {
    const biasTest = this.publicationBiasTest();
    const pUniformResult = this.pUniformStar();

    // Compare with naive estimate
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const naive = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    return {
      pUniformStar: pUniformResult,
      publicationBiasTest: biasTest,
      naive,
      bias: pUniformResult.error ? null : naive - pUniformResult.estimate,
      method: 'P-uniform*'
    };
  }
}

// ============================================================================
// 3. LIMIT META-ANALYSIS (metasens::limitmeta)
// Rücker et al. (2011) - Extrapolates to infinite precision
// ============================================================================

class LimitMetaAnalysis {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  // Fit weighted regression: effect = beta0 + beta1 * se
  fitRegression() {
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

    // Standard errors
    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = beta0 + beta1 * this.ses[i];
      ssr += weights[i] * Math.pow(this.effects[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seBeta0 = Math.sqrt(mse * sumWXX / denom);
    const seBeta1 = Math.sqrt(mse * sumW / denom);

    return { beta0, beta1, seBeta0, seBeta1, mse };
  }

  // Limit estimate (extrapolation to se = 0)
  run() {
    const reg = this.fitRegression();

    // Limit estimate is beta0 (intercept = effect at se=0)
    const limitEstimate = reg.beta0;
    const limitSE = reg.seBeta0;

    // Standard meta-analysis for comparison
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const standardEstimate = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    // Test for small-study effects (beta1 != 0)
    const tStat = reg.beta1 / reg.seBeta1;
    const pValue = 2 * (1 - this.tCDF(Math.abs(tStat), this.n - 2));

    // Shrunken estimates for each study
    const shrunken = [];
    for (let i = 0; i < this.n; i++) {
      const shrink = limitEstimate + (this.effects[i] - limitEstimate) * (1 - this.ses[i] / Math.max(...this.ses));
      shrunken.push(shrink);
    }

    return {
      limit: {
        estimate: limitEstimate,
        se: limitSE,
        ci: [limitEstimate - 1.96 * limitSE, limitEstimate + 1.96 * limitSE]
      },
      standard: {
        estimate: standardEstimate,
        se: Math.sqrt(1 / sumW)
      },
      smallStudyTest: {
        slope: reg.beta1,
        slopesSE: reg.seBeta1,
        t: tStat,
        pValue,
        significant: pValue < 0.10
      },
      bias: standardEstimate - limitEstimate,
      shrunkenEstimates: shrunken,
      method: 'Limit Meta-Analysis (Rücker)'
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
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
}

// ============================================================================
// 4. ROBUST BAYESIAN META-ANALYSIS (RoBMA)
// Combines multiple models with Bayesian Model Averaging
// ============================================================================

class RobustBayesianMA {
  constructor(effects, ses, options = {}) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
    this.nIter = options.nIter || 5000;
    this.priorMu = options.priorMu || { mean: 0, sd: 1 };
    this.priorTau = options.priorTau || { shape: 1, scale: 0.5 };
  }

  normalPDF(x, mu, sigma) {
    return Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2)) / (sigma * Math.sqrt(2 * Math.PI));
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

  // Inverse gamma PDF for tau^2 prior
  invGammaPDF(x, shape, scale) {
    if (x <= 0) return 0;
    return Math.pow(scale, shape) / this.gamma(shape) * Math.pow(x, -shape - 1) * Math.exp(-scale / x);
  }

  gamma(z) {
    return Math.exp(this.logGamma(z));
  }

  logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Model 1: Fixed effect, no selection
  modelFE() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const mu = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);

    // Log marginal likelihood (approximation)
    let logML = 0;
    for (let i = 0; i < this.n; i++) {
      logML += Math.log(this.normalPDF(this.effects[i], mu, this.ses[i]));
    }
    logML += Math.log(this.normalPDF(mu, this.priorMu.mean, this.priorMu.sd));

    return { mu, se, logML, model: 'FE' };
  }

  // Model 2: Random effects, no selection
  modelRE() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const muInit = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - muInit, 2), 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2 = Math.max(0, (Q - (this.n - 1)) / C);

    const weightsRE = this.ses.map(se => 1 / (se * se + tau2));
    const sumWRE = weightsRE.reduce((a, b) => a + b, 0);
    const mu = weightsRE.reduce((s, w, i) => s + w * this.effects[i], 0) / sumWRE;
    const se = Math.sqrt(1 / sumWRE);

    let logML = 0;
    for (let i = 0; i < this.n; i++) {
      logML += Math.log(this.normalPDF(this.effects[i], mu, Math.sqrt(this.ses[i] * this.ses[i] + tau2)));
    }
    logML += Math.log(this.normalPDF(mu, this.priorMu.mean, this.priorMu.sd));
    logML += Math.log(this.invGammaPDF(tau2 + 0.001, this.priorTau.shape, this.priorTau.scale));

    return { mu, se, tau2, tau: Math.sqrt(tau2), logML, model: 'RE' };
  }

  // Model 3: Fixed effect with selection
  modelFESelection() {
    const fe = this.modelFE();

    // Simple selection adjustment
    const pValues = this.effects.map((e, i) => 2 * (1 - this.normalCDF(Math.abs(e / this.ses[i]))));
    const nSig = pValues.filter(p => p < 0.05).length;
    const selectionBias = (nSig / this.n > 0.5) ? 0.1 : 0;

    return {
      mu: fe.mu - selectionBias * Math.sign(fe.mu),
      se: fe.se * 1.1,
      logML: fe.logML - 1, // Penalty for selection model
      model: 'FE-Selection'
    };
  }

  // Model 4: Random effects with selection
  modelRESelection() {
    const re = this.modelRE();

    const pValues = this.effects.map((e, i) => 2 * (1 - this.normalCDF(Math.abs(e / this.ses[i]))));
    const nSig = pValues.filter(p => p < 0.05).length;
    const selectionBias = (nSig / this.n > 0.5) ? 0.15 : 0.05;

    return {
      mu: re.mu - selectionBias * Math.sign(re.mu),
      se: re.se * 1.15,
      tau2: re.tau2,
      tau: re.tau,
      logML: re.logML - 1.5,
      model: 'RE-Selection'
    };
  }

  // Bayesian Model Averaging
  run() {
    const models = [
      this.modelFE(),
      this.modelRE(),
      this.modelFESelection(),
      this.modelRESelection()
    ];

    // Convert log marginal likelihoods to weights (BMA)
    const maxLogML = Math.max(...models.map(m => m.logML));
    const unnormWeights = models.map(m => Math.exp(m.logML - maxLogML));
    const sumWeights = unnormWeights.reduce((a, b) => a + b, 0);
    const weights = unnormWeights.map(w => w / sumWeights);

    // Model-averaged estimate
    const avgMu = models.reduce((s, m, i) => s + weights[i] * m.mu, 0);
    const avgVar = models.reduce((s, m, i) => s + weights[i] * (m.se * m.se + m.mu * m.mu), 0) - avgMu * avgMu;
    const avgSE = Math.sqrt(avgVar);

    // Posterior inclusion probabilities
    const pEffect = weights[0] + weights[1]; // P(effect | H1)
    const pHeterogeneity = weights[1] + weights[3]; // P(tau > 0)
    const pSelection = weights[2] + weights[3]; // P(selection)

    return {
      modelAveraged: {
        mu: avgMu,
        se: avgSE,
        ci: [avgMu - 1.96 * avgSE, avgMu + 1.96 * avgSE]
      },
      posteriorProbs: {
        pEffect,
        pHeterogeneity,
        pSelection
      },
      modelWeights: models.map((m, i) => ({ model: m.model, weight: weights[i] })),
      models,
      bfEffect: pEffect / (1 - pEffect + 0.001), // Bayes factor for effect
      bfSelection: pSelection / (1 - pSelection + 0.001), // Bayes factor for selection
      nStudies: this.n,
      method: 'Robust Bayesian Meta-Analysis'
    };
  }
}

// ============================================================================
// 5. SENSITIVITY ANALYSIS FOR PUBLICATION BIAS
// Mathur & VanderWeele (2020) - E-value for meta-analysis
// ============================================================================

class PublicationBiasSensitivity {
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

  // Compute pooled estimate
  getPooled() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const effect = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    return { effect, se };
  }

  // Selection ratio needed to nullify effect
  selectionRatioToNull() {
    const pooled = this.getPooled();

    // Using selection model, find eta that makes adjusted effect = 0
    // This is a simplified calculation
    const z = pooled.effect / pooled.se;

    if (Math.abs(z) < 1.96) {
      return { eta: 1, interpretation: 'Effect already non-significant' };
    }

    // Approximate selection ratio
    const eta = Math.exp(-0.5 * z * z);

    return {
      eta,
      selectionRatio: 1 / eta,
      interpretation: `Non-significant studies would need to be ${(1/eta).toFixed(1)}x less likely to publish`
    };
  }

  // Worst-case bias analysis
  worstCaseBias() {
    const pooled = this.getPooled();

    // If all non-significant studies were suppressed, what's the bias?
    const pValues = this.effects.map((e, i) => 2 * (1 - this.normalCDF(Math.abs(e / this.ses[i]))));
    const nSig = pValues.filter(p => p < 0.05).length;
    const nNonSig = this.n - nSig;

    // Worst case: all suppressed studies had effect = 0
    if (nNonSig === 0) {
      return { worstCaseEffect: pooled.effect, nSuppressed: 0 };
    }

    const suppressedWeight = nNonSig * (1 / Math.pow(Math.max(...this.ses), 2));
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);

    const worstCaseEffect = (sumW * pooled.effect) / (sumW + suppressedWeight);

    return {
      observed: pooled.effect,
      worstCaseEffect,
      bias: pooled.effect - worstCaseEffect,
      nSuppressed: nNonSig,
      interpretation: `Worst case: ${nNonSig} null studies suppressed, true effect = ${worstCaseEffect.toFixed(3)}`
    };
  }

  // Svalue: strength of evidence for effect after accounting for publication bias
  sValue() {
    const pooled = this.getPooled();
    const z = Math.abs(pooled.effect / pooled.se);

    // S-value is the selection ratio that would make CI include null
    // Under selection, the CI width increases
    const ciWidth = 2 * 1.96 * pooled.se;
    const effectMagnitude = Math.abs(pooled.effect);

    if (effectMagnitude <= ciWidth / 2) {
      return { sValue: 1, interpretation: 'Effect already includes null' };
    }

    // S-value approximation
    const sValue = (effectMagnitude / (ciWidth / 2)) - 1;

    return {
      sValue,
      interpretation: sValue > 1 ?
        `Robust: Would need ${sValue.toFixed(1)}x selection to nullify` :
        `Fragile: Small selection could nullify effect`
    };
  }

  // Generate sensitivity curve
  sensitivityCurve() {
    const pooled = this.getPooled();
    const curve = [];

    for (let eta = 0.1; eta <= 1; eta += 0.1) {
      // Simplified selection-adjusted estimate
      const pValues = this.effects.map((e, i) => 2 * (1 - this.normalCDF(Math.abs(e / this.ses[i]))));

      let adjustedSum = 0, adjustedWeightSum = 0;
      for (let i = 0; i < this.n; i++) {
        const weight = 1 / (this.ses[i] * this.ses[i]);
        const selectionWeight = pValues[i] < 0.05 ? 1 : eta;
        adjustedSum += weight * selectionWeight * this.effects[i];
        adjustedWeightSum += weight * selectionWeight;
      }

      const adjustedEffect = adjustedSum / adjustedWeightSum;

      curve.push({
        eta,
        adjustedEffect,
        significant: Math.abs(adjustedEffect) > 1.96 * pooled.se
      });
    }

    return curve;
  }

  run() {
    return {
      pooled: this.getPooled(),
      selectionToNull: this.selectionRatioToNull(),
      worstCase: this.worstCaseBias(),
      sValue: this.sValue(),
      sensitivityCurve: this.sensitivityCurve(),
      nStudies: this.n,
      method: 'Publication Bias Sensitivity Analysis'
    };
  }
}

// ============================================================================
// 6. CONTOUR-ENHANCED FUNNEL PLOT
// Peters et al. (2008) - with significance contours
// ============================================================================

class ContourFunnelPlot {
  constructor(effects, ses, studyNames) {
    this.effects = effects;
    this.ses = ses;
    this.studyNames = studyNames || effects.map((_, i) => `Study ${i + 1}`);
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

  // Get pooled estimate
  getPooled() {
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    return weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;
  }

  // Generate contour lines for different p-values
  generateContours() {
    const pooled = this.getPooled();
    const maxSE = Math.max(...this.ses) * 1.5;
    const contours = [];

    // P-value levels: 0.01, 0.05, 0.10
    const levels = [
      { p: 0.01, z: 2.576, color: '#27ae60', label: 'p < 0.01' },
      { p: 0.05, z: 1.96, color: '#f39c12', label: 'p < 0.05' },
      { p: 0.10, z: 1.645, color: '#e74c3c', label: 'p < 0.10' }
    ];

    for (const level of levels) {
      const points = [];
      for (let se = 0.001; se <= maxSE; se += maxSE / 100) {
        // For a given SE, what effect would give this p-value?
        const effectRight = pooled + level.z * se;
        const effectLeft = pooled - level.z * se;
        points.push({ se, effectLeft, effectRight });
      }
      contours.push({ ...level, points });
    }

    return contours;
  }

  // Classify studies by significance region
  classifyStudies() {
    const pooled = this.getPooled();

    return this.effects.map((e, i) => {
      const z = Math.abs((e - pooled) / this.ses[i]);
      let region;
      if (z > 2.576) region = 'p < 0.01';
      else if (z > 1.96) region = 'p < 0.05';
      else if (z > 1.645) region = 'p < 0.10';
      else region = 'p >= 0.10';

      return {
        study: this.studyNames[i],
        effect: e,
        se: this.ses[i],
        z,
        region,
        pValue: 2 * (1 - this.normalCDF(Math.abs(e / this.ses[i])))
      };
    });
  }

  run() {
    const pooled = this.getPooled();
    const contours = this.generateContours();
    const classified = this.classifyStudies();

    // Count studies in each region
    const regionCounts = {};
    for (const study of classified) {
      regionCounts[study.region] = (regionCounts[study.region] || 0) + 1;
    }

    // Asymmetry detection
    const leftOfPooled = classified.filter(s => s.effect < pooled).length;
    const rightOfPooled = classified.filter(s => s.effect >= pooled).length;
    const asymmetry = Math.abs(leftOfPooled - rightOfPooled) / this.n;

    return {
      pooled,
      contours,
      studies: classified,
      regionCounts,
      asymmetry: {
        value: asymmetry,
        leftCount: leftOfPooled,
        rightCount: rightOfPooled,
        interpretation: asymmetry > 0.3 ? 'Substantial asymmetry detected' : 'Minimal asymmetry'
      },
      nStudies: this.n,
      method: 'Contour-Enhanced Funnel Plot'
    };
  }
}

// ============================================================================
// 7. BEGG-MAZUMDAR RANK CORRELATION
// Begg & Mazumdar (1994) - Non-parametric test
// ============================================================================

class BeggMazumdarTest {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  // Kendall's tau with variance correction
  kendallTau() {
    // Standardized effects
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooled = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    // Residuals
    const residuals = this.effects.map(e => e - pooled);
    const variances = this.ses.map(se => se * se);

    // Compute Kendall's tau between residuals and variances
    let concordant = 0, discordant = 0, tiesX = 0, tiesY = 0;

    for (let i = 0; i < this.n - 1; i++) {
      for (let j = i + 1; j < this.n; j++) {
        const dx = residuals[i] - residuals[j];
        const dy = variances[i] - variances[j];

        if (dx === 0) tiesX++;
        if (dy === 0) tiesY++;

        if (dx * dy > 0) concordant++;
        else if (dx * dy < 0) discordant++;
      }
    }

    const nPairs = this.n * (this.n - 1) / 2;
    const tau = (concordant - discordant) / Math.sqrt((nPairs - tiesX) * (nPairs - tiesY));

    // Variance of tau under null
    const varTau = (2 * (2 * this.n + 5)) / (9 * this.n * (this.n - 1));
    const z = tau / Math.sqrt(varTau);

    return { tau, z, varTau };
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

  run() {
    const { tau, z, varTau } = this.kendallTau();
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      tau,
      z,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        `Significant rank correlation (tau=${tau.toFixed(3)}, p=${pValue.toFixed(3)})` :
        `No significant correlation (tau=${tau.toFixed(3)}, p=${pValue.toFixed(3)})`,
      method: 'Begg-Mazumdar Rank Correlation'
    };
  }
}

// ============================================================================
// 8. PETERS' TEST (for binary outcomes)
// Peters et al. (2006) - Better for ORs than Egger
// ============================================================================

class PetersTest {
  constructor(logORs, ses, totalN) {
    this.logORs = logORs;
    this.ses = ses;
    this.totalN = totalN; // Total sample size per study
    this.n = logORs.length;
  }

  run() {
    if (!this.totalN) {
      return { error: 'Peters test requires total sample sizes' };
    }

    // Weighted regression: logOR = beta0 + beta1 * (1/n)
    const x = this.totalN.map(n => 1 / n);
    const weights = this.ses.map(se => 1 / (se * se));

    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
    for (let i = 0; i < this.n; i++) {
      sumW += weights[i];
      sumWX += weights[i] * x[i];
      sumWY += weights[i] * this.logORs[i];
      sumWXX += weights[i] * x[i] * x[i];
      sumWXY += weights[i] * x[i] * this.logORs[i];
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    const beta0 = (sumWXX * sumWY - sumWX * sumWXY) / denom;
    const beta1 = (sumW * sumWXY - sumWX * sumWY) / denom;

    // Standard error of slope
    let ssr = 0;
    for (let i = 0; i < this.n; i++) {
      const pred = beta0 + beta1 * x[i];
      ssr += weights[i] * Math.pow(this.logORs[i] - pred, 2);
    }
    const mse = ssr / (this.n - 2);
    const seBeta1 = Math.sqrt(mse * sumW / denom);

    const t = beta1 / seBeta1;
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), this.n - 2));

    return {
      intercept: beta0,
      slope: beta1,
      slopesSE: seBeta1,
      t,
      pValue,
      significant: pValue < 0.10,
      interpretation: pValue < 0.10 ?
        'Peters test significant: small-study effects detected' :
        'No significant small-study effects',
      method: 'Peters Test'
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

// ============================================================================
// 9. Z-CURVE ANALYSIS (Brunner & Schimmack)
// Estimates replicability and discovery rate
// ============================================================================

class ZCurveAnalysis {
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

  // Convert to z-scores
  getZScores() {
    return this.effects.map((e, i) => Math.abs(e / this.ses[i]));
  }

  // Expected Replication Rate (ERR)
  expectedReplicationRate() {
    const zScores = this.getZScores();
    const significant = zScores.filter(z => z > 1.96);

    if (significant.length < 3) {
      return { error: 'Insufficient significant results' };
    }

    // For each significant z, compute probability of replication
    const repProbs = significant.map(z => {
      // Power at observed z
      return 1 - this.normalCDF(1.96 - z);
    });

    const err = repProbs.reduce((a, b) => a + b, 0) / repProbs.length;

    return {
      err,
      nSignificant: significant.length,
      meanPower: err,
      interpretation: err > 0.8 ? 'High replicability' : err > 0.5 ? 'Moderate replicability' : 'Low replicability'
    };
  }

  // Expected Discovery Rate (EDR)
  expectedDiscoveryRate() {
    const zScores = this.getZScores();
    const significant = zScores.filter(z => z > 1.96);
    const observedRate = significant.length / this.n;

    // Under selection, the discovery rate is inflated
    // Estimate true discovery rate using observed z-curve
    const meanZ = significant.length > 0 ?
      significant.reduce((a, b) => a + b, 0) / significant.length : 0;

    // Approximate EDR (simplified)
    const edr = observedRate * (meanZ > 2.5 ? 0.9 : meanZ > 2 ? 0.7 : 0.5);

    return {
      observed: observedRate,
      expected: edr,
      inflation: observedRate / (edr + 0.001),
      interpretation: edr > observedRate * 0.8 ? 'Minimal inflation' : 'Substantial discovery rate inflation'
    };
  }

  // Soric's maximum false discovery rate
  soric() {
    const zScores = this.getZScores();
    const significant = zScores.filter(z => z > 1.96).length;
    const nonsig = this.n - significant;

    if (significant === 0) {
      return { fdr: 1, interpretation: 'No significant findings' };
    }

    // Soric's FDR = (non-sig / sig) * (alpha / (1 - alpha))
    const fdr = Math.min(1, (nonsig / significant) * (0.05 / 0.95));

    return {
      fdr,
      significant,
      nonsignificant: nonsig,
      interpretation: fdr < 0.05 ? 'Low FDR' : fdr < 0.20 ? 'Moderate FDR' : 'High FDR'
    };
  }

  run() {
    const zScores = this.getZScores();

    // Distribution of z-scores for visualization
    const bins = [0, 1, 1.5, 2, 2.5, 3, 4, 5, Infinity];
    const histogram = bins.slice(0, -1).map((low, i) => ({
      range: `${low}-${bins[i+1]}`,
      count: zScores.filter(z => z >= low && z < bins[i+1]).length
    }));

    return {
      zScores,
      histogram,
      err: this.expectedReplicationRate(),
      edr: this.expectedDiscoveryRate(),
      soric: this.soric(),
      nStudies: this.n,
      nSignificant: zScores.filter(z => z > 1.96).length,
      method: 'Z-Curve Analysis'
    };
  }
}

// ============================================================================
// 10. SELECTION MODEL COMPARISON
// Compare multiple selection models and average
// ============================================================================

class SelectionModelComparison {
  constructor(effects, ses) {
    this.effects = effects;
    this.ses = ses;
    this.n = effects.length;
  }

  // Run all selection models and compare
  run() {
    const results = {};

    // 1. Trim-and-fill
    try {
      const tf = new TrimAndFill(this.effects, this.ses);
      results.trimFill = tf.run();
    } catch (e) {
      results.trimFill = { error: e.message };
    }

    // 2. PET-PEESE
    try {
      const pet = new PETPEESE(this.effects, this.ses);
      results.petpeese = pet.run();
    } catch (e) {
      results.petpeese = { error: e.message };
    }

    // 3. 3PSM
    try {
      const psm = new ThreeParameterSelectionModel(this.effects, this.ses);
      results.threePSM = psm.run();
    } catch (e) {
      results.threePSM = { error: e.message };
    }

    // 4. Copas
    try {
      const copas = new CopasSelectionModel(this.effects, this.ses);
      results.copas = copas.run();
    } catch (e) {
      results.copas = { error: e.message };
    }

    // 5. Limit meta-analysis
    try {
      const limit = new LimitMetaAnalysis(this.effects, this.ses);
      results.limit = limit.run();
    } catch (e) {
      results.limit = { error: e.message };
    }

    // Model-averaged estimate
    const estimates = [];
    if (results.trimFill?.adjusted) estimates.push(results.trimFill.adjusted.effect);
    if (results.petpeese?.petpeese) estimates.push(results.petpeese.petpeese.estimate);
    if (results.threePSM?.adjusted) estimates.push(results.threePSM.adjusted.mu);
    if (results.copas?.adjusted) estimates.push(results.copas.adjusted.mu);
    if (results.limit?.limit) estimates.push(results.limit.limit.estimate);

    const avgEstimate = estimates.length > 0 ?
      estimates.reduce((a, b) => a + b, 0) / estimates.length : null;

    // Standard estimate
    const weights = this.ses.map(se => 1 / (se * se));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const standard = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

    return {
      models: results,
      modelAveraged: avgEstimate,
      standard,
      bias: avgEstimate ? standard - avgEstimate : null,
      agreement: this.assessAgreement(estimates),
      nStudies: this.n,
      method: 'Selection Model Comparison'
    };
  }

  assessAgreement(estimates) {
    if (estimates.length < 2) return 'Insufficient models';

    const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
    const variance = estimates.reduce((s, e) => s + Math.pow(e - mean, 2), 0) / estimates.length;
    const cv = Math.sqrt(variance) / Math.abs(mean);

    if (cv < 0.1) return 'High agreement across models';
    if (cv < 0.3) return 'Moderate agreement';
    return 'Low agreement - interpret with caution';
  }
}
