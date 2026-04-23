// ============================================================================
// TIER 1: HIGH-IMPACT FEATURES BEYOND R
// ============================================================================
// 1. Gaussian Process Dose-Response (non-parametric, uncertainty-aware)
// 2. Quantile Meta-Analysis (medians, IQR - not just means)
// 3. Personalized Dose Optimizer (patient-specific dosing)
// 4. Interactive 3D Dose-Response (WebGL visualization)
// 5. GRIME/SPRITE Data Quality Tests (fraud detection)
// 6. Live Meta-Analysis (auto-update simulation)
// ============================================================================

// ============================================================================
// 1. GAUSSIAN PROCESS DOSE-RESPONSE
// Non-parametric Bayesian dose-response with proper uncertainty quantification
// Reference: Rasmussen & Williams (2006) Gaussian Processes for Machine Learning
// ============================================================================

class GaussianProcessDoseResponse {
  constructor(options = {}) {
    this.kernel = options.kernel || 'rbf'; // rbf, matern32, matern52
    this.lengthScale = options.lengthScale || null; // Auto-tune if null
    this.signalVariance = options.signalVariance || 1.0;
    this.noiseVariance = options.noiseVariance || 0.1;
    this.nRestarts = options.nRestarts || 5;
  }

  // Radial Basis Function (Squared Exponential) kernel
  rbfKernel(x1, x2, lengthScale, signalVar) {
    const diff = x1 - x2;
    return signalVar * Math.exp(-0.5 * (diff * diff) / (lengthScale * lengthScale));
  }

  // Matern 3/2 kernel (less smooth, often more realistic)
  matern32Kernel(x1, x2, lengthScale, signalVar) {
    const r = Math.abs(x1 - x2) / lengthScale;
    const sqrt3r = Math.sqrt(3) * r;
    return signalVar * (1 + sqrt3r) * Math.exp(-sqrt3r);
  }

  // Matern 5/2 kernel
  matern52Kernel(x1, x2, lengthScale, signalVar) {
    const r = Math.abs(x1 - x2) / lengthScale;
    const sqrt5r = Math.sqrt(5) * r;
    return signalVar * (1 + sqrt5r + (5 * r * r) / 3) * Math.exp(-sqrt5r);
  }

  // Get kernel function
  getKernel() {
    switch (this.kernel) {
      case 'matern32': return this.matern32Kernel.bind(this);
      case 'matern52': return this.matern52Kernel.bind(this);
      default: return this.rbfKernel.bind(this);
    }
  }

  // Compute kernel matrix
  computeKernelMatrix(X1, X2, lengthScale, signalVar) {
    const K = [];
    const kernelFn = this.getKernel();
    for (let i = 0; i < X1.length; i++) {
      K[i] = [];
      for (let j = 0; j < X2.length; j++) {
        K[i][j] = kernelFn(X1[i], X2[j], lengthScale, signalVar);
      }
    }
    return K;
  }

  // Cholesky decomposition
  cholesky(A) {
    const n = A.length;
    const L = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        if (i === j) {
          L[i][j] = Math.sqrt(Math.max(1e-10, A[i][i] - sum));
        } else {
          L[i][j] = (A[i][j] - sum) / L[j][j];
        }
      }
    }
    return L;
  }

  // Solve L * x = b (forward substitution)
  solveL(L, b) {
    const n = L.length;
    const x = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += L[i][j] * x[j];
      }
      x[i] = (b[i] - sum) / L[i][i];
    }
    return x;
  }

  // Solve L^T * x = b (backward substitution)
  solveLT(L, b) {
    const n = L.length;
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += L[j][i] * x[j];
      }
      x[i] = (b[i] - sum) / L[i][i];
    }
    return x;
  }

  // Negative log marginal likelihood (for optimization)
  negLogMarginalLikelihood(X, y, weights, lengthScale, signalVar, noiseVar) {
    const n = X.length;

    // K + sigma^2 * W^{-1}
    const K = this.computeKernelMatrix(X, X, lengthScale, signalVar);
    for (let i = 0; i < n; i++) {
      K[i][i] += noiseVar / weights[i];
    }

    try {
      const L = this.cholesky(K);

      // alpha = K^{-1} y
      const alpha = this.solveLT(L, this.solveL(L, y));

      // Log determinant
      let logDet = 0;
      for (let i = 0; i < n; i++) {
        logDet += 2 * Math.log(L[i][i]);
      }

      // NLL = 0.5 * (y^T alpha + log|K| + n*log(2*pi))
      let yAlpha = 0;
      for (let i = 0; i < n; i++) {
        yAlpha += y[i] * alpha[i];
      }

      return 0.5 * (yAlpha + logDet + n * Math.log(2 * Math.PI));
    } catch (e) {
      return Infinity;
    }
  }

  // Optimize hyperparameters
  optimizeHyperparameters(X, y, weights) {
    const doseRange = Math.max(...X) - Math.min(...X);
    let bestNLL = Infinity;
    let bestParams = {
      lengthScale: doseRange / 4,
      signalVar: this.signalVariance,
      noiseVar: this.noiseVariance
    };

    // Grid search with random restarts
    const lengthScales = [doseRange / 10, doseRange / 5, doseRange / 3, doseRange / 2, doseRange];
    const signalVars = [0.1, 0.5, 1.0, 2.0];

    for (const ls of lengthScales) {
      for (const sv of signalVars) {
        const nll = this.negLogMarginalLikelihood(X, y, weights, ls, sv, this.noiseVariance);
        if (nll < bestNLL) {
          bestNLL = nll;
          bestParams = { lengthScale: ls, signalVar: sv, noiseVar: this.noiseVariance };
        }
      }
    }

    return bestParams;
  }

  // Fit GP to data
  fit(doses, effects, ses) {
    this.X = doses;
    this.y = effects;
    this.weights = ses.map(se => 1 / (se * se));

    // Optimize or use provided hyperparameters
    if (this.lengthScale === null) {
      const params = this.optimizeHyperparameters(doses, effects, this.weights);
      this.lengthScale = params.lengthScale;
      this.signalVariance = params.signalVar;
      this.noiseVariance = params.noiseVar;
    }

    // Compute and store Cholesky factorization
    const n = doses.length;
    this.K = this.computeKernelMatrix(doses, doses, this.lengthScale, this.signalVariance);
    for (let i = 0; i < n; i++) {
      this.K[i][i] += this.noiseVariance / this.weights[i];
    }
    this.L = this.cholesky(this.K);
    this.alpha = this.solveLT(this.L, this.solveL(this.L, effects));

    return this;
  }

  // Predict at new doses
  predict(Xstar) {
    const Kstar = this.computeKernelMatrix(Xstar, this.X, this.lengthScale, this.signalVariance);
    const Kstarstar = this.computeKernelMatrix(Xstar, Xstar, this.lengthScale, this.signalVariance);

    // Mean: K* alpha
    const mean = Kstar.map(row => row.reduce((sum, k, i) => sum + k * this.alpha[i], 0));

    // Variance: K** - K* K^{-1} K*^T
    const variance = [];
    for (let i = 0; i < Xstar.length; i++) {
      const v = this.solveL(this.L, Kstar[i]);
      const vTv = v.reduce((sum, vi) => sum + vi * vi, 0);
      variance.push(Math.max(0, Kstarstar[i][i] - vTv));
    }

    return {
      mean,
      variance,
      std: variance.map(v => Math.sqrt(v)),
      ci95Lower: mean.map((m, i) => m - 1.96 * Math.sqrt(variance[i])),
      ci95Upper: mean.map((m, i) => m + 1.96 * Math.sqrt(variance[i])),
      hyperparameters: {
        lengthScale: this.lengthScale,
        signalVariance: this.signalVariance,
        noiseVariance: this.noiseVariance,
        kernel: this.kernel
      }
    };
  }

  // Get posterior samples for uncertainty visualization
  samplePosterior(Xstar, nSamples = 100) {
    const pred = this.predict(Xstar);
    const n = Xstar.length;
    const samples = [];

    for (let s = 0; s < nSamples; s++) {
      const sample = [];
      for (let i = 0; i < n; i++) {
        // Sample from N(mean, var)
        sample.push(pred.mean[i] + Math.sqrt(pred.variance[i]) * normalRandom());
      }
      samples.push(sample);
    }

    return {
      samples,
      doses: Xstar,
      mean: pred.mean,
      ci95Lower: pred.ci95Lower,
      ci95Upper: pred.ci95Upper
    };
  }
}

// ============================================================================
// 2. QUANTILE META-ANALYSIS
// Meta-analysis of medians, quartiles, and other quantiles
// Reference: McGrath et al. (2020) Statistical Methods in Medical Research
// ============================================================================

class QuantileMetaAnalysis {
  constructor(options = {}) {
    this.method = options.method || 'qe'; // qe (quantile estimation), cd (confidence distribution)
    this.quantile = options.quantile || 0.5; // Default: median
  }

  // Estimate mean and SD from median and IQR (Wan et al. method)
  estimateMeanSDFromMedianIQR(median, q1, q3, n) {
    // Wan et al. (2014) BMC Medical Research Methodology
    const iqr = q3 - q1;

    // Mean estimation
    const mean = (q1 + median + q3) / 3;

    // SD estimation using optimal weights
    let sd;
    if (n <= 50) {
      // Small sample correction
      const eta = this.getEtaCoefficient(n);
      sd = iqr / eta;
    } else {
      // Large sample: SD ≈ IQR / 1.35
      sd = iqr / 1.35;
    }

    return { mean, sd, se: sd / Math.sqrt(n) };
  }

  // Estimate mean and SD from median, min, max, and quartiles
  estimateMeanSDFromRange(median, min, max, q1, q3, n) {
    // Luo et al. (2018) Statistical Methods in Medical Research
    let mean, sd;

    if (q1 !== undefined && q3 !== undefined) {
      // Use quartiles
      mean = (min + 2 * q1 + 2 * median + 2 * q3 + max) / 8;
      sd = (max - min) / (2 * this.getZeta(n)) + (q3 - q1) / (2 * this.getEtaCoefficient(n));
    } else {
      // Use only range
      mean = (min + 2 * median + max) / 4;
      sd = (max - min) / (2 * this.getZeta(n));
    }

    return { mean, sd, se: sd / Math.sqrt(n) };
  }

  // Get eta coefficient for IQR to SD conversion
  getEtaCoefficient(n) {
    // Approximation from Wan et al.
    if (n <= 15) return 1.14;
    if (n <= 25) return 1.24;
    if (n <= 50) return 1.30;
    return 1.35;
  }

  // Get zeta coefficient for range to SD conversion
  getZeta(n) {
    // Expected range in standard normal
    return 2 * this.normalQuantile(1 - 0.5 / (n + 1));
  }

  normalQuantile(p) {
    // Approximation
    const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
      -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01];
    const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
      -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];

    const q = p - 0.5;
    let r, x;

    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      x = q * (((((((a[7] * r + a[6]) * r + a[5]) * r + a[4]) * r + a[3]) * r + a[2]) * r + a[1]) * r + a[0]) /
        (((((((b[7] * r + b[6]) * r + b[5]) * r + b[4]) * r + b[3]) * r + b[2]) * r + b[1]) * r + 1);
    } else {
      r = q < 0 ? p : 1 - p;
      r = Math.sqrt(-Math.log(r));
      x = 2.515517 + r * (0.802853 + r * 0.010328);
      x /= 1 + r * (1.432788 + r * (0.189269 + r * 0.001308));
      if (q < 0) x = -x;
    }
    return x;
  }

  // Pool quantiles using quantile estimation method
  poolQuantiles(studies) {
    // Each study: { median, q1, q3, n, se_median }
    const k = studies.length;

    // For medians with known SE
    if (studies[0].se_median !== undefined) {
      let sumW = 0, sumWM = 0;
      for (const s of studies) {
        const w = 1 / (s.se_median * s.se_median);
        sumW += w;
        sumWM += w * s.median;
      }
      const pooledMedian = sumWM / sumW;
      const pooledSE = Math.sqrt(1 / sumW);

      return {
        pooledMedian,
        pooledSE,
        ci95: [pooledMedian - 1.96 * pooledSE, pooledMedian + 1.96 * pooledSE],
        k,
        I2: this.computeI2(studies, pooledMedian),
        method: 'Inverse-variance weighted'
      };
    }

    // For medians estimated from IQR (approximate SE)
    const transformedStudies = studies.map(s => {
      // Approximate SE of median using IQR
      const iqr = (s.q3 || s.median * 1.35) - (s.q1 || s.median * 0.65);
      const se = 1.57 * iqr / (2 * Math.sqrt(s.n)); // Approximate SE
      return { ...s, se_median: se };
    });

    return this.poolQuantiles(transformedStudies);
  }

  computeI2(studies, pooled) {
    let Q = 0;
    for (const s of studies) {
      const w = 1 / (s.se_median * s.se_median);
      Q += w * Math.pow(s.median - pooled, 2);
    }
    const df = studies.length - 1;
    return Math.max(0, (Q - df) / Q * 100);
  }

  // Meta-analysis of IQRs
  poolIQRs(studies) {
    // Each study: { iqr, n }
    // Using log-transformed IQR for approximately normal distribution

    const logIQRs = studies.map(s => ({
      logIQR: Math.log(s.iqr),
      se: Math.sqrt(2 / s.n) // Approximate SE of log(IQR)
    }));

    let sumW = 0, sumWL = 0;
    for (const s of logIQRs) {
      const w = 1 / (s.se * s.se);
      sumW += w;
      sumWL += w * s.logIQR;
    }

    const pooledLogIQR = sumWL / sumW;
    const pooledSE = Math.sqrt(1 / sumW);

    return {
      pooledIQR: Math.exp(pooledLogIQR),
      ci95: [Math.exp(pooledLogIQR - 1.96 * pooledSE), Math.exp(pooledLogIQR + 1.96 * pooledSE)],
      k: studies.length,
      method: 'Log-transformed pooling'
    };
  }

  // Full quantile function meta-analysis
  poolQuantileFunction(studies, quantiles = [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const results = {};

    for (const q of quantiles) {
      const qData = studies.map(s => {
        // Interpolate quantile from available data
        let value;
        if (q === 0.5) value = s.median;
        else if (q === 0.25) value = s.q1 || s.median - 0.675 * (s.sd || s.iqr / 1.35);
        else if (q === 0.75) value = s.q3 || s.median + 0.675 * (s.sd || s.iqr / 1.35);
        else if (q < 0.5) value = s.median - this.normalQuantile(1 - q) * (s.sd || s.iqr / 1.35);
        else value = s.median + this.normalQuantile(q) * (s.sd || s.iqr / 1.35);

        const se = (s.sd || s.iqr / 1.35) / Math.sqrt(s.n) * Math.sqrt(q * (1 - q)) / (0.4 * Math.exp(-0.5 * Math.pow(this.normalQuantile(q), 2)));

        return { value, se, n: s.n };
      });

      let sumW = 0, sumWV = 0;
      for (const d of qData) {
        const w = 1 / (d.se * d.se);
        sumW += w;
        sumWV += w * d.value;
      }

      results[q] = {
        pooled: sumWV / sumW,
        se: Math.sqrt(1 / sumW),
        ci95: [sumWV / sumW - 1.96 / Math.sqrt(sumW), sumWV / sumW + 1.96 / Math.sqrt(sumW)]
      };
    }

    return results;
  }
}

// ============================================================================
// 3. PERSONALIZED DOSE OPTIMIZER
// Patient-specific optimal dosing based on individual characteristics
// Reference: Predictive approaches to heterogeneous treatment effects
// ============================================================================

class PersonalizedDoseOptimizer {
  constructor(baseModel, covariateEffects) {
    this.baseModel = baseModel; // Base dose-response model
    this.covariateEffects = covariateEffects; // Effect modifiers
  }

  // Define standard covariate effects
  static getDefaultCovariateEffects() {
    return {
      age: {
        name: 'Age',
        type: 'continuous',
        effectOnEmax: -0.005, // Per year
        effectOnED50: 0.01,   // Per year (higher ED50 = need more drug)
        reference: 50
      },
      weight: {
        name: 'Weight (kg)',
        type: 'continuous',
        effectOnEmax: 0,
        effectOnED50: 0.008,  // Per kg
        reference: 70
      },
      renalFunction: {
        name: 'Renal Function (eGFR)',
        type: 'continuous',
        effectOnEmax: 0.002,
        effectOnED50: -0.005, // Lower clearance = lower dose needed
        reference: 90
      },
      hepaticFunction: {
        name: 'Hepatic Function',
        type: 'categorical',
        levels: { normal: 1, mild: 0.85, moderate: 0.7, severe: 0.5 },
        effectType: 'multiplier'
      },
      geneticStatus: {
        name: 'Metabolizer Status',
        type: 'categorical',
        levels: {
          ultrarapid: { emaxMult: 0.7, ed50Mult: 0.6 },
          extensive: { emaxMult: 1.0, ed50Mult: 1.0 },
          intermediate: { emaxMult: 1.1, ed50Mult: 1.3 },
          poor: { emaxMult: 1.2, ed50Mult: 2.0 }
        }
      },
      comedication: {
        name: 'CYP Inhibitor',
        type: 'binary',
        effectOnED50: 0.5 // 50% increase in effective concentration
      }
    };
  }

  // Compute personalized parameters
  computePersonalizedParams(patientProfile, baseParams) {
    let emax = baseParams.emax;
    let ed50 = baseParams.ed50;
    let e0 = baseParams.e0;

    for (const [covariate, value] of Object.entries(patientProfile)) {
      const effect = this.covariateEffects[covariate];
      if (!effect) continue;

      if (effect.type === 'continuous') {
        const deviation = value - effect.reference;
        emax *= Math.exp(effect.effectOnEmax * deviation);
        ed50 *= Math.exp(effect.effectOnED50 * deviation);
      } else if (effect.type === 'categorical') {
        if (effect.effectType === 'multiplier') {
          const mult = effect.levels[value] || 1;
          emax *= mult;
        } else if (effect.levels[value]) {
          emax *= effect.levels[value].emaxMult || 1;
          ed50 *= effect.levels[value].ed50Mult || 1;
        }
      } else if (effect.type === 'binary' && value) {
        ed50 *= (1 + effect.effectOnED50);
      }
    }

    return { e0, emax, ed50, hill: baseParams.hill || 1 };
  }

  // Predict effect for a patient at given dose
  predictForPatient(patientProfile, dose, baseParams) {
    const params = this.computePersonalizedParams(patientProfile, baseParams);
    const effect = params.e0 + (params.emax * Math.pow(dose, params.hill)) /
      (Math.pow(params.ed50, params.hill) + Math.pow(dose, params.hill));

    return {
      dose,
      effect,
      params,
      patientProfile
    };
  }

  // Find optimal dose for a patient given target and constraints
  findOptimalDose(patientProfile, baseParams, options = {}) {
    const targetEffect = options.targetEffect;
    const minDose = options.minDose || 0;
    const maxDose = options.maxDose || 100;
    const maxToxicity = options.maxToxicity || null;
    const toxicityModel = options.toxicityModel || null;

    const params = this.computePersonalizedParams(patientProfile, baseParams);

    // If target effect specified, solve for dose
    if (targetEffect !== undefined) {
      // Solve: E0 + Emax * D^h / (ED50^h + D^h) = target
      // D^h = (target - E0) * ED50^h / (Emax - target + E0)
      const ratio = (targetEffect - params.e0) / (params.emax - targetEffect + params.e0);
      if (ratio < 0) {
        return {
          optimalDose: null,
          message: 'Target effect not achievable',
          params
        };
      }
      const optimalDose = Math.pow(ratio, 1 / params.hill) * params.ed50;

      // Check toxicity constraint
      if (maxToxicity !== null && toxicityModel !== null) {
        const toxicity = toxicityModel(optimalDose, patientProfile);
        if (toxicity > maxToxicity) {
          // Find dose where toxicity = maxToxicity
          const constrainedDose = this.findDoseAtToxicity(maxToxicity, toxicityModel, patientProfile, minDose, maxDose);
          return {
            optimalDose: constrainedDose,
            effect: this.predictForPatient(patientProfile, constrainedDose, baseParams).effect,
            toxicity: maxToxicity,
            constrained: true,
            message: 'Dose limited by toxicity constraint',
            params
          };
        }
      }

      return {
        optimalDose: Math.max(minDose, Math.min(maxDose, optimalDose)),
        effect: targetEffect,
        params
      };
    }

    // If no target, maximize benefit-risk
    let bestDose = minDose;
    let bestScore = -Infinity;

    for (let d = minDose; d <= maxDose; d += (maxDose - minDose) / 100) {
      const effect = this.predictForPatient(patientProfile, d, baseParams).effect;
      let score = effect;

      if (toxicityModel !== null) {
        const toxicity = toxicityModel(d, patientProfile);
        if (maxToxicity !== null && toxicity > maxToxicity) continue;
        score -= toxicity * 2; // Penalty for toxicity
      }

      if (score > bestScore) {
        bestScore = score;
        bestDose = d;
      }
    }

    return {
      optimalDose: bestDose,
      effect: this.predictForPatient(patientProfile, bestDose, baseParams).effect,
      score: bestScore,
      params
    };
  }

  findDoseAtToxicity(targetToxicity, toxicityModel, patientProfile, minDose, maxDose) {
    // Binary search
    let low = minDose, high = maxDose;
    while (high - low > 0.1) {
      const mid = (low + high) / 2;
      const tox = toxicityModel(mid, patientProfile);
      if (tox < targetToxicity) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  // Generate dose recommendations for different patient types
  generateDoseTable(baseParams, patientProfiles) {
    const table = [];

    for (const profile of patientProfiles) {
      const result = this.findOptimalDose(profile, baseParams, {
        targetEffect: baseParams.targetEffect,
        maxDose: baseParams.maxDose
      });

      table.push({
        profile: profile,
        recommendedDose: result.optimalDose,
        expectedEffect: result.effect,
        adjustmentReason: this.getAdjustmentReason(profile, baseParams)
      });
    }

    return table;
  }

  getAdjustmentReason(profile, baseParams) {
    const reasons = [];
    const baseED50 = baseParams.ed50;
    const params = this.computePersonalizedParams(profile, baseParams);

    if (params.ed50 > baseED50 * 1.2) reasons.push('Higher dose needed due to patient factors');
    if (params.ed50 < baseED50 * 0.8) reasons.push('Lower dose needed due to patient factors');
    if (params.emax < baseParams.emax * 0.8) reasons.push('Reduced maximum efficacy expected');

    return reasons.length > 0 ? reasons.join('; ') : 'Standard dosing appropriate';
  }
}

// ============================================================================
// 4. INTERACTIVE 3D DOSE-RESPONSE SURFACE
// WebGL-based 3D visualization for dose-response with covariates
// ============================================================================

class Interactive3DDoseResponse {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.gl = this.canvas?.getContext('webgl') || this.canvas?.getContext('experimental-webgl');
    this.rotation = { x: 0.5, y: 0.5 };
    this.zoom = 1;
  }

  // Generate surface data
  generateSurface(model, params, xRange, yRange, resolution = 50) {
    const surface = {
      vertices: [],
      colors: [],
      indices: []
    };

    const xStep = (xRange[1] - xRange[0]) / resolution;
    const yStep = (yRange[1] - yRange[0]) / resolution;

    // Generate vertices
    for (let i = 0; i <= resolution; i++) {
      for (let j = 0; j <= resolution; j++) {
        const x = xRange[0] + i * xStep; // Dose
        const y = yRange[0] + j * yStep; // Covariate (e.g., age, weight)

        // Modify params based on covariate
        const modifiedParams = { ...params };
        modifiedParams.ed50 = params.ed50 * (1 + 0.01 * (y - 50)); // Example: ED50 varies with age

        const z = this.predictEffect(model, x, modifiedParams);

        // Normalize to [-1, 1] for WebGL
        const nx = (x - xRange[0]) / (xRange[1] - xRange[0]) * 2 - 1;
        const ny = (y - yRange[0]) / (yRange[1] - yRange[0]) * 2 - 1;
        const nz = z / (params.emax || 1) * 2 - 1;

        surface.vertices.push(nx, nz, ny);

        // Color based on effect magnitude
        const color = this.effectToColor(z, params.emax || 1);
        surface.colors.push(...color);
      }
    }

    // Generate indices for triangle mesh
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const idx = i * (resolution + 1) + j;
        surface.indices.push(
          idx, idx + 1, idx + resolution + 1,
          idx + 1, idx + resolution + 2, idx + resolution + 1
        );
      }
    }

    return surface;
  }

  predictEffect(model, dose, params) {
    switch (model) {
      case 'emax':
        return params.e0 + (params.emax * dose) / (params.ed50 + dose);
      case 'hill':
        const h = params.hill || 1;
        return params.e0 + (params.emax * Math.pow(dose, h)) /
          (Math.pow(params.ed50, h) + Math.pow(dose, h));
      case 'linear':
        return params.e0 + params.slope * dose;
      default:
        return 0;
    }
  }

  effectToColor(effect, maxEffect) {
    // Blue (low) -> Green (medium) -> Red (high)
    const t = Math.max(0, Math.min(1, effect / maxEffect));
    if (t < 0.5) {
      return [0, t * 2, 1 - t * 2, 1]; // Blue to Green
    }
    return [(t - 0.5) * 2, 1 - (t - 0.5) * 2, 0, 1]; // Green to Red
  }

  // Render using WebGL (simplified - full implementation would need shaders)
  render(surface) {
    if (!this.gl) {
      console.warn('WebGL not available, falling back to 2D');
      return this.render2DFallback(surface);
    }

    // Full WebGL implementation would go here
    // For now, return surface data for external rendering
    return {
      vertices: new Float32Array(surface.vertices),
      colors: new Float32Array(surface.colors),
      indices: new Uint16Array(surface.indices),
      vertexCount: surface.indices.length
    };
  }

  // 2D fallback using Canvas
  render2DFallback(surface) {
    if (!this.canvas) return null;

    const ctx = this.canvas.getContext('2d');
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Simple isometric projection
    const project = (x, y, z) => {
      const scale = this.zoom * Math.min(width, height) / 4;
      const px = width / 2 + (x - z * 0.5) * scale * Math.cos(this.rotation.y);
      const py = height / 2 - y * scale + (x + z) * scale * 0.3 * Math.sin(this.rotation.x);
      return { x: px, y: py };
    };

    // Draw wireframe
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
    ctx.lineWidth = 0.5;

    const resolution = Math.sqrt(surface.vertices.length / 3) - 1;
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const idx = (i * (resolution + 1) + j) * 3;
        const p1 = project(surface.vertices[idx], surface.vertices[idx + 1], surface.vertices[idx + 2]);
        const p2 = project(surface.vertices[idx + 3], surface.vertices[idx + 4], surface.vertices[idx + 5]);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    return { rendered: true, fallback: '2D' };
  }

  // Export surface data for external 3D libraries (Three.js, etc.)
  exportForThreeJS(surface) {
    return {
      geometry: {
        vertices: surface.vertices,
        faces: surface.indices,
        colors: surface.colors
      },
      format: 'BufferGeometry',
      type: 'Mesh'
    };
  }
}

// ============================================================================
// 5. GRIME/SPRITE DATA QUALITY TESTS
// Statistical tests for detecting data fabrication/errors
// Reference: Brown & Heathers (2017) GRIME test; Heathers et al. (2018) SPRITE
// ============================================================================

class DataQualityTests {
  constructor() {
    this.results = {};
  }

  // GRIME Test: Granularity-Related Inconsistency of Means
  // Checks if reported means are possible given sample size and granularity
  grimeTest(reportedMean, sampleSize, granularity = 1) {
    // A mean of n values with granularity g can only be multiples of g/n
    const step = granularity / sampleSize;
    const nearestPossible = Math.round(reportedMean / step) * step;
    const difference = Math.abs(reportedMean - nearestPossible);

    // Tolerance for rounding
    const tolerance = step / 2 * 0.01; // 1% of half-step

    const passed = difference <= tolerance;

    return {
      test: 'GRIME',
      reportedMean,
      sampleSize,
      granularity,
      nearestPossible,
      difference,
      passed,
      interpretation: passed ?
        'Mean is mathematically possible' :
        'Mean appears inconsistent with sample size (possible error or fabrication)'
    };
  }

  // SPRITE: Sample Parameter Reconstruction via Iterative TEchniques
  // Reconstruct possible sample given summary statistics
  spriteTest(mean, sd, n, min, max, granularity = 1) {
    const maxIterations = 10000;
    const tolerance = 0.001;

    // Try to reconstruct a valid sample
    let bestSample = null;
    let bestError = Infinity;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Generate random sample within constraints
      const sample = this.generateConstrainedSample(n, min, max, granularity);

      // Adjust to match mean
      const currentMean = sample.reduce((a, b) => a + b, 0) / n;
      const adjustment = mean - currentMean;

      // Try to adjust values
      const adjustedSample = this.adjustSampleMean(sample, mean, min, max, granularity);
      if (!adjustedSample) continue;

      // Check SD
      const currentSD = this.computeSD(adjustedSample);
      const error = Math.abs(currentSD - sd);

      if (error < bestError) {
        bestError = error;
        bestSample = adjustedSample;

        if (error < tolerance) break;
      }
    }

    const reconstructed = bestError < sd * 0.1; // Within 10% of reported SD

    return {
      test: 'SPRITE',
      reportedMean: mean,
      reportedSD: sd,
      sampleSize: n,
      range: [min, max],
      reconstructed,
      reconstructedSD: bestSample ? this.computeSD(bestSample) : null,
      sdError: bestError,
      passed: reconstructed,
      interpretation: reconstructed ?
        'Statistics are internally consistent' :
        'Could not reconstruct valid sample (possible error or fabrication)',
      possibleSample: bestSample
    };
  }

  generateConstrainedSample(n, min, max, granularity) {
    const sample = [];
    for (let i = 0; i < n; i++) {
      const value = min + Math.floor(getRandom() * ((max - min) / granularity + 1)) * granularity;
      sample.push(Math.min(max, Math.max(min, value)));
    }
    return sample;
  }

  adjustSampleMean(sample, targetMean, min, max, granularity) {
    const n = sample.length;
    const adjusted = [...sample];
    let iterations = 0;
    const maxIter = 1000;

    while (iterations < maxIter) {
      const currentMean = adjusted.reduce((a, b) => a + b, 0) / n;
      const diff = targetMean - currentMean;

      if (Math.abs(diff) < granularity / (2 * n)) break;

      // Find values that can be adjusted
      const idx = Math.floor(getRandom() * n);
      const direction = diff > 0 ? 1 : -1;
      const newValue = adjusted[idx] + direction * granularity;

      if (newValue >= min && newValue <= max) {
        adjusted[idx] = newValue;
      }

      iterations++;
    }

    const finalMean = adjusted.reduce((a, b) => a + b, 0) / n;
    if (Math.abs(finalMean - targetMean) < granularity / n) {
      return adjusted;
    }
    return null;
  }

  computeSD(sample) {
    const n = sample.length;
    const mean = sample.reduce((a, b) => a + b, 0) / n;
    const variance = sample.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
    return Math.sqrt(variance);
  }

  // RIVETS: Rounded Input Variables, Error-Embedded, Technique-Sensitive
  // Check for suspicious rounding patterns
  rivetsTest(values) {
    const n = values.length;

    // Check last digit distribution (should be uniform for unrounded data)
    const lastDigits = values.map(v => Math.abs(Math.round(v * 100)) % 10);
    const digitCounts = Array(10).fill(0);
    lastDigits.forEach(d => digitCounts[d]++);

    // Chi-square test for uniformity
    const expected = n / 10;
    const chiSquare = digitCounts.reduce((sum, count) => sum + Math.pow(count - expected, 2) / expected, 0);
    const pValue = 1 - this.chiSquaredCDF(chiSquare, 9);

    // Check for excess of 0s and 5s (common rounding)
    const prop05 = (digitCounts[0] + digitCounts[5]) / n;
    const excess05 = prop05 > 0.3; // More than 30% ending in 0 or 5

    return {
      test: 'RIVETS',
      nValues: n,
      lastDigitDistribution: digitCounts,
      chiSquare,
      pValue,
      proportion05: prop05,
      passed: pValue > 0.05 && !excess05,
      interpretation: pValue < 0.05 || excess05 ?
        'Suspicious rounding patterns detected' :
        'No unusual rounding patterns'
    };
  }

  chiSquaredCDF(x, df) {
    // Simplified chi-squared CDF
    if (x < 0) return 0;
    const k = df / 2;
    let sum = 0, term = Math.exp(-x / 2);
    for (let i = 0; i < 100; i++) {
      sum += term;
      term *= x / (2 * (k + i));
      if (term < 1e-10) break;
    }
    return sum * Math.pow(x / 2, k - 1) / this.gamma(k);
  }

  gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
    z -= 1;
    const g = 7;
    const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = C[0];
    for (let i = 1; i < g + 2; i++) x += C[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  // Benford's Law test for first digits
  benfordTest(values) {
    // Filter positive values
    const positive = values.filter(v => v > 0);
    const n = positive.length;

    if (n < 30) {
      return {
        test: 'Benford',
        passed: null,
        interpretation: 'Insufficient data for Benford test (need n >= 30)'
      };
    }

    // Get first digits
    const firstDigits = positive.map(v => {
      const s = v.toExponential().charAt(0);
      return parseInt(s);
    }).filter(d => d >= 1 && d <= 9);

    // Expected Benford distribution
    const benfordExpected = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];

    // Observed distribution
    const observed = Array(10).fill(0);
    firstDigits.forEach(d => observed[d]++);

    // Chi-square test
    let chiSquare = 0;
    for (let d = 1; d <= 9; d++) {
      const expected = benfordExpected[d] * n;
      chiSquare += Math.pow(observed[d] - expected, 2) / expected;
    }

    const pValue = 1 - this.chiSquaredCDF(chiSquare, 8);

    return {
      test: 'Benford',
      nValues: n,
      observedDistribution: observed.slice(1),
      expectedDistribution: benfordExpected.slice(1).map(p => Math.round(p * n)),
      chiSquare,
      pValue,
      passed: pValue > 0.05,
      interpretation: pValue > 0.05 ?
        'First digit distribution consistent with Benford\'s Law' :
        'First digit distribution deviates from Benford\'s Law (possible fabrication)'
    };
  }

  // Run all tests on a study
  runAllTests(study) {
    const results = {
      study: study.name || 'Unknown',
      tests: []
    };

    // GRIME test on means
    if (study.mean !== undefined && study.n !== undefined) {
      results.tests.push(this.grimeTest(study.mean, study.n, study.granularity || 1));
    }

    // SPRITE test
    if (study.mean !== undefined && study.sd !== undefined && study.n !== undefined) {
      results.tests.push(this.spriteTest(
        study.mean, study.sd, study.n,
        study.min || study.mean - 3 * study.sd,
        study.max || study.mean + 3 * study.sd,
        study.granularity || 1
      ));
    }

    // RIVETS test on raw data
    if (study.rawData && study.rawData.length > 0) {
      results.tests.push(this.rivetsTest(study.rawData));
      results.tests.push(this.benfordTest(study.rawData));
    }

    // Overall assessment
    const failedTests = results.tests.filter(t => t.passed === false);
    results.overallAssessment = failedTests.length === 0 ? 'PASS' :
      failedTests.length === 1 ? 'CONCERN' : 'FAIL';
    results.failedTests = failedTests.map(t => t.test);

    return results;
  }
}

// ============================================================================
// 6. LIVE META-ANALYSIS
// Real-time updating meta-analysis with monitoring and alerts
// Reference: Simmonds et al. (2017) Living systematic reviews
// ============================================================================

class LiveMetaAnalysis {
  constructor(initialStudies, options = {}) {
    this.studies = [...initialStudies];
    this.history = [{ timestamp: Date.now(), studies: [...initialStudies], result: null }];
    this.subscribers = [];
    this.updateInterval = options.updateInterval || 86400000; // Daily
    this.significanceThreshold = options.significanceThreshold || 0.05;
    this.clinicalThreshold = options.clinicalThreshold || 0.2;
    this.alertOnChange = options.alertOnChange !== false;
    this.isRunning = false;
  }

  // Start live monitoring
  start() {
    this.isRunning = true;
    this.runAnalysis();

    // Simulate periodic updates (in real app, would poll databases)
    this.intervalId = setInterval(() => {
      if (this.isRunning) {
        this.checkForUpdates();
      }
    }, this.updateInterval);

    return this;
  }

  // Stop monitoring
  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  // Subscribe to updates
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  // Notify subscribers
  notify(event) {
    this.subscribers.forEach(cb => cb(event));
  }

  // Run meta-analysis
  runAnalysis() {
    const effects = this.studies.map(s => s.effect);
    const variances = this.studies.map(s => s.se * s.se);

    // REML estimation
    const reml = new REMLEstimator(effects, variances);
    const result = reml.estimate();

    // Add sequential monitoring statistics
    result.sequentialStats = this.computeSequentialStats(result);
    result.stabilityMetrics = this.computeStabilityMetrics();

    // Store in history
    this.history.push({
      timestamp: Date.now(),
      studies: [...this.studies],
      result: { ...result }
    });

    // Check for alerts
    if (this.alertOnChange) {
      this.checkAlerts(result);
    }

    return result;
  }

  // Add new study
  addStudy(study) {
    const previousResult = this.history[this.history.length - 1]?.result;

    this.studies.push(study);
    const newResult = this.runAnalysis();

    // Compute change metrics
    const changeMetrics = this.computeChangeMetrics(previousResult, newResult);

    this.notify({
      type: 'STUDY_ADDED',
      study,
      previousResult,
      newResult,
      changeMetrics
    });

    return {
      result: newResult,
      changeMetrics
    };
  }

  // Remove study
  removeStudy(studyId) {
    const idx = this.studies.findIndex(s => s.id === studyId || s.study === studyId);
    if (idx === -1) return null;

    const removed = this.studies.splice(idx, 1)[0];
    const result = this.runAnalysis();

    this.notify({
      type: 'STUDY_REMOVED',
      study: removed,
      result
    });

    return result;
  }

  // Check for updates (simulation - real implementation would query APIs)
  checkForUpdates() {
    // Simulate finding new study with small probability
    if (getRandom() < 0.1) {
      const avgEffect = this.studies.reduce((s, st) => s + st.effect, 0) / this.studies.length;
      const avgSE = this.studies.reduce((s, st) => s + st.se, 0) / this.studies.length;

      const newStudy = {
        id: `auto_${Date.now()}`,
        study: `NewStudy_${this.studies.length + 1}`,
        effect: avgEffect + (getRandom() - 0.5) * avgSE * 2,
        se: avgSE * (0.8 + getRandom() * 0.4),
        treatment: this.studies[0]?.treatment || 'Treatment',
        dose: this.studies[0]?.dose || 10,
        source: 'Auto-detected',
        timestamp: Date.now()
      };

      this.notify({
        type: 'NEW_STUDY_DETECTED',
        study: newStudy,
        requiresReview: true
      });

      return newStudy;
    }

    return null;
  }

  // Sequential monitoring statistics (O'Brien-Fleming-like)
  computeSequentialStats(result) {
    const k = this.studies.length;
    const zScore = result.effect / result.se;

    // Information fraction
    const totalInfo = this.studies.reduce((s, st) => s + 1 / (st.se * st.se), 0);
    const expectedFinalInfo = totalInfo * (k + 5) / k; // Assume 5 more studies
    const infoFraction = totalInfo / expectedFinalInfo;

    // O'Brien-Fleming boundary (approximation)
    const obfBoundary = 1.96 / Math.sqrt(infoFraction);

    // Lan-DeMets alpha spending
    const alphaSpent = 2 * (1 - this.normalCDF(obfBoundary));

    return {
      zScore,
      infoFraction,
      obfBoundary,
      crossesBoundary: Math.abs(zScore) > obfBoundary,
      alphaSpent,
      recommendation: Math.abs(zScore) > obfBoundary ?
        'Evidence may be sufficient for conclusion' :
        'Continue monitoring'
    };
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

  // Stability metrics
  computeStabilityMetrics() {
    if (this.history.length < 3) {
      return { stable: null, message: 'Insufficient history' };
    }

    const recentResults = this.history.slice(-5).filter(h => h.result);
    if (recentResults.length < 2) {
      return { stable: null, message: 'Insufficient results' };
    }

    const effects = recentResults.map(r => r.result.effect);
    const ses = recentResults.map(r => r.result.se);

    // Coefficient of variation of effect
    const meanEffect = effects.reduce((a, b) => a + b, 0) / effects.length;
    const sdEffect = Math.sqrt(effects.reduce((s, e) => s + Math.pow(e - meanEffect, 2), 0) / (effects.length - 1));
    const cv = Math.abs(sdEffect / meanEffect);

    // Trend
    let trend = 'stable';
    if (effects.length >= 3) {
      const firstHalf = effects.slice(0, Math.floor(effects.length / 2));
      const secondHalf = effects.slice(Math.floor(effects.length / 2));
      const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (secondMean > firstMean + sdEffect) trend = 'increasing';
      else if (secondMean < firstMean - sdEffect) trend = 'decreasing';
    }

    // Precision improvement
    const precisionImprovement = 1 - ses[ses.length - 1] / ses[0];

    return {
      stable: cv < 0.2,
      coefficientOfVariation: cv,
      trend,
      precisionImprovement,
      message: cv < 0.1 ? 'Highly stable' :
        cv < 0.2 ? 'Moderately stable' : 'Unstable - continue monitoring'
    };
  }

  // Compute change metrics between analyses
  computeChangeMetrics(previousResult, newResult) {
    if (!previousResult) {
      return { isFirst: true };
    }

    const effectChange = newResult.effect - previousResult.effect;
    const relativeChange = effectChange / Math.abs(previousResult.effect || 0.001);
    const seChange = newResult.se - previousResult.se;
    const I2Change = (newResult.I2 || 0) - (previousResult.I2 || 0);

    // Did significance change?
    const wasSignificant = Math.abs(previousResult.effect) > 1.96 * previousResult.se;
    const isSignificant = Math.abs(newResult.effect) > 1.96 * newResult.se;
    const significanceChanged = wasSignificant !== isSignificant;

    // Did clinical relevance change?
    const wasClinicallyRelevant = Math.abs(previousResult.effect) > this.clinicalThreshold;
    const isClinicallyRelevant = Math.abs(newResult.effect) > this.clinicalThreshold;
    const clinicalRelevanceChanged = wasClinicallyRelevant !== isClinicallyRelevant;

    return {
      effectChange,
      relativeChange,
      seChange,
      I2Change,
      significanceChanged,
      clinicalRelevanceChanged,
      previousSignificant: wasSignificant,
      currentSignificant: isSignificant,
      alert: significanceChanged || clinicalRelevanceChanged
    };
  }

  // Check for alerts
  checkAlerts(result) {
    const alerts = [];

    // Sequential monitoring alert
    if (result.sequentialStats?.crossesBoundary) {
      alerts.push({
        type: 'BOUNDARY_CROSSED',
        severity: 'high',
        message: 'Sequential monitoring boundary crossed - consider stopping'
      });
    }

    // Instability alert
    if (result.stabilityMetrics?.stable === false) {
      alerts.push({
        type: 'UNSTABLE',
        severity: 'medium',
        message: 'Results are unstable - more studies needed'
      });
    }

    // High heterogeneity alert
    if ((result.I2 || 0) > 75) {
      alerts.push({
        type: 'HIGH_HETEROGENEITY',
        severity: 'medium',
        message: `High heterogeneity detected (I² = ${result.I2.toFixed(1)}%)`
      });
    }

    if (alerts.length > 0) {
      this.notify({
        type: 'ALERTS',
        alerts,
        result
      });
    }

    return alerts;
  }

  // Get timeline visualization data
  getTimelineData() {
    return this.history.filter(h => h.result).map(h => ({
      timestamp: h.timestamp,
      date: new Date(h.timestamp).toISOString().split('T')[0],
      nStudies: h.studies.length,
      effect: h.result.effect,
      se: h.result.se,
      ci_lower: h.result.ci[0],
      ci_upper: h.result.ci[1],
      I2: h.result.I2 || 0,
      significant: Math.abs(h.result.effect) > 1.96 * h.result.se
    }));
  }

  // Export update report
  exportUpdateReport() {
    const current = this.history[this.history.length - 1];
    const previous = this.history.length > 1 ? this.history[this.history.length - 2] : null;

    let report = '# Living Meta-Analysis Update Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    report += '## Current Status\n\n';
    report += `- Studies included: ${this.studies.length}\n`;
    report += `- Pooled effect: ${current.result.effect.toFixed(4)} `;
    report += `(95% CI: ${current.result.ci[0].toFixed(4)} to ${current.result.ci[1].toFixed(4)})\n`;
    report += `- Heterogeneity: I² = ${(current.result.I2 || 0).toFixed(1)}%\n`;
    report += `- Stability: ${current.result.stabilityMetrics?.message || 'Unknown'}\n\n`;

    if (previous) {
      const change = this.computeChangeMetrics(previous.result, current.result);
      report += '## Change from Previous\n\n';
      report += `- Effect change: ${change.effectChange >= 0 ? '+' : ''}${change.effectChange.toFixed(4)} `;
      report += `(${(change.relativeChange * 100).toFixed(1)}%)\n`;
      report += `- SE change: ${change.seChange >= 0 ? '+' : ''}${change.seChange.toFixed(4)}\n`;
      report += `- Significance changed: ${change.significanceChanged ? 'Yes' : 'No'}\n`;
      report += `- Clinical relevance changed: ${change.clinicalRelevanceChanged ? 'Yes' : 'No'}\n\n`;
    }

    report += '## Sequential Monitoring\n\n';
    const seq = current.result.sequentialStats;
    if (seq) {
      report += `- Z-score: ${seq.zScore.toFixed(3)}\n`;
      report += `- Information fraction: ${(seq.infoFraction * 100).toFixed(1)}%\n`;
      report += `- O'Brien-Fleming boundary: ±${seq.obfBoundary.toFixed(3)}\n`;
      report += `- Recommendation: ${seq.recommendation}\n`;
    }

    return report;
  }
}
