/**
 * NMA Dose Response Studio - ARFIS: Adaptive Robust Model for Heavy-Tailed Data
 *
 * Method: Adaptive Robust Fitted Influence Scale (ARFIS) for regression with heavy-tailed data
 * Reference: Information Sciences (2024) - "ARFIS: An adaptive robust model for regression with heavy tails"
 * Source: https://www.sciencedirect.com/science/article/abs/pii/S0020025524012581
 *
 * Description:
 * ARFIS provides an adaptive approach to robust regression that automatically adjusts
 * to the tail behavior of the data. Unlike traditional robust methods that use fixed
 * tuning parameters, ARFIS adapts to the data's heavy-tailedness.
 *
 * Key Features:
 * - Adaptive tuning parameter selection based on tail heaviness
 * - Robust to both vertical outliers and leverage points
 * - Maintains high efficiency at normal distribution
 * - Automatic detection of heavy-tailed behavior
 *
 * Mathematical Framework:
 * 1. Estimate tail index using Hill estimator or QQ regression
 * 2. Adaptively choose influence function based on tail behavior
 * 3. Use redescending M-estimators for heavy-tailed scenarios
 * 4. Iteratively reweighted least squares with adaptive weights
 */

/**
 * ARFIS robust meta-analysis for heavy-tailed data
 * @param {Array<number>} effects - Array of effect sizes
 * @param {Array<number>} variances - Array of within-study variances
 * @param {Object} options - Configuration options
 * @param {number} options.tailEstimator - Method for tail estimation ('hill', 'qq', 'adaptive')
 * @param {number} options.maxTailFraction - Maximum fraction for tail estimation (default: 0.2)
 * @param {number} options.tolerance - Convergence tolerance (default: 1e-8)
 * @param {number} options.maxIterations - Maximum iterations (default: 500)
 * @param {boolean} options.verbose - Log iteration progress (default: false)
 * @returns {Object} ARFIS analysis results
 */
export function ARFISMetaAnalysis(effects, variances, options = {}) {
  const {
    tailEstimator = 'adaptive',
    maxTailFraction = 0.2,
    tolerance = 1e-8,
    maxIterations = 500,
    verbose = false
  } = options;

  const n = effects.length;

  // Input validation
  if (n !== variances.length) {
    throw new Error('Effects and variances must have the same length');
  }
  if (n < 3) {
    throw new Error('At least 3 studies required for ARFIS');
  }

  // Filter valid studies
  const valid = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(effects[i]) && Number.isFinite(variances[i]) && variances[i] > 0) {
      valid.push({
        effect: effects[i],
        variance: variances[i],
        se: Math.sqrt(variances[i]),
        index: i
      });
    }
  }

  if (valid.length < 3) {
    throw new Error('At least 3 valid studies required for ARFIS');
  }

  const m = valid.length;

  /**
   * Estimate tail index using Hill estimator
   * @param {Array<number>} data - Sorted data
   * @param {number} k - Number of upper order statistics to use
   * @returns {number} Hill tail index estimate
   */
  function hillEstimator(data, k) {
    const n = data.length;
    const logRatios = [];
    for (let i = n - k; i < n; i++) {
      logRatios.push(Math.log(data[i]) - Math.log(data[n - k - 1]));
    }
    const meanLogRatio = logRatios.reduce((a, b) => a + b, 0) / k;
    return 1 / meanLogRatio;
  }

  /**
   * Estimate tail index using QQ regression
   * @param {Array<number>} data - Sorted data
   * @param {number} k - Number of upper order statistics to use
   * @returns {number} QQ regression tail index estimate
   */
  function qqRegressionTailIndex(data, k) {
    const n = data.length;
    const x = [], y = [];

    for (let i = 0; i < k; i++) {
      const idx = n - k + i;
      const orderStat = (n + 1) * (1 - Math.exp(-(i + 1) / (n - k + 1)));
      x.push(Math.log(data[idx]));
      y.push(Math.log(-Math.log(1 - (idx + 1) / (n + 1))));
    }

    // Simple linear regression
    const meanX = x.reduce((a, b) => a + b, 0) / k;
    const meanY = y.reduce((a, b) => a + b, 0) / k;

    let num = 0, den = 0;
    for (let i = 0; i < k; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }

    const slope = num / den;
    return 1 / slope;
  }

  /**
   * Adaptive tail index estimation
   * @param {Array<number>} residuals - Residuals from initial fit
   * @returns {number} Estimated tail index
   */
  function estimateTailIndex(residuals) {
    const absResiduals = residuals.map(r => Math.abs(r)).sort((a, b) => a - b);
    const k = Math.max(5, Math.floor(m * maxTailFraction));

    let tailIndex;

    if (tailEstimator === 'hill') {
      tailIndex = hillEstimator(absResiduals, k);
    } else if (tailEstimator === 'qq') {
      tailIndex = qqRegressionTailIndex(absResiduals, k);
    } else { // adaptive
      const hill = hillEstimator(absResiduals, k);
      const qq = qqRegressionTailIndex(absResiduals, k);

      // Use average when both estimates are reasonable
      if (Math.abs(hill - qq) < Math.min(hill, qq) * 0.5) {
        tailIndex = (hill + qq) / 2;
      } else {
        // Prefer Hill for very heavy tails, QQ otherwise
        tailIndex = hill < 3 ? hill : qq;
      }
    }

    // Constrain to reasonable range
    return Math.max(1.5, Math.min(10, tailIndex));
  }

  /**
   * Adaptive influence function based on tail index
   * @param {number} x - Residual
   * @param {number} tailIndex - Estimated tail index
   * @param {number} scale - Scale parameter
   * @returns {number} Influence function value
   */
  function adaptiveInfluenceFunction(x, tailIndex, scale) {
    const u = x / scale;

    // For light tails (tailIndex > 4), use Tukey's biweight
    if (tailIndex > 4) {
      const c = 4.685; // Tukey's biweight tuning constant
      if (Math.abs(u) >= c) {
        return 0;
      }
      const u2 = u * u;
      return u * Math.pow(1 - u2 / (c * c), 2);
    }

    // For medium tails (2 < tailIndex <= 4), use optimal redescender
    if (tailIndex > 2) {
      const c = 2 * Math.sqrt(tailIndex);
      if (Math.abs(u) >= c) {
        return 0;
      }
      return u * Math.exp(-u * u / (2 * c * c));
    }

    // For heavy tails (tailIndex <= 2), use Huber with adaptive threshold
    const c = Math.sqrt(2 * tailIndex);
    if (Math.abs(u) <= c) {
      return u;
    }
    return c * Math.sign(u);
  }

  /**
   * Compute adaptive M-estimate with ARFIS weights
   * @param {Array} studies - Valid studies
   * @param {number} mu - Current estimate of pooled effect
   * @param {number} tailIndex - Tail index estimate
   * @param {number} scale - Scale estimate
   * @returns {Object} Weighted sum and total weight
   */
  function computeARFISWeights(studies, mu, tailIndex, scale) {
    const weights = [];
    let sumWeightedEffects = 0;
    let sumWeights = 0;

    for (let i = 0; i < studies.length; i++) {
      const study = studies[i];
      const residual = (study.effect - mu) / Math.sqrt(study.variance);

      // Adaptive influence function
      const influence = adaptiveInfluenceFunction(residual, tailIndex, 1);

      // Base weight from precision
      const baseWeight = 1 / study.variance;

      // ARFIS weight combines base weight and adaptive influence
      const arfisWeight = baseWeight * Math.abs(influence) / (Math.abs(residual) + 1e-10);

      weights.push(arfisWeight);
      sumWeightedEffects += arfisWeight * study.effect;
      sumWeights += arfisWeight;
    }

    return { weights, sumWeightedEffects, sumWeights };
  }

  /**
   * Robust scale estimation using MAD
   * @param {Array<number>} residuals - Residuals
   * @returns {number} Scale estimate
   */
  function madScale(residuals) {
    const med = residuals.slice().sort((a, b) => a - b)[Math.floor(residuals.length / 2)];
    const absDeviations = residuals.map(r => Math.abs(r - med)).sort((a, b) => a - b);
    const mad = absDeviations[Math.floor(absDeviations.length / 2)];
    return 1.4826 * mad; // Consistency factor for normal distribution
  }

  // Initialize with DL estimator
  const initialDL = derSimonianLaird(valid.map(s => s.effect), valid.map(s => s.variance));
  let mu = initialDL.effect;
  let tau2 = initialDL.tau2;

  // Initial residuals for tail estimation
  const initialResiduals = valid.map(s => s.effect - mu);
  let tailIndex = estimateTailIndex(initialResiduals);

  if (verbose) {
    console.log(`ARFIS: Initial tail index estimate: ${tailIndex.toFixed(2)}`);
  }

  // Iterative estimation
  let prevMu = mu;
  let iter = 0;
  let converged = false;

  while (iter < maxIterations && !converged) {
    // Compute residuals and scale
    const residuals = valid.map(s => s.effect - mu);
    const scale = madScale(residuals);

    // Update tail index periodically (every 10 iterations)
    if (iter % 10 === 0) {
      const newTailIndex = estimateTailIndex(residuals);
      tailIndex = 0.7 * tailIndex + 0.3 * newTailIndex; // Exponential smoothing
    }

    // Compute ARFIS weights
    const { weights, sumWeightedEffects, sumWeights } =
      computeARFISWeights(valid, mu, tailIndex, scale);

    // Update mu
    mu = sumWeights > 0 ? sumWeightedEffects / sumWeights : prevMu;

    // Update tau2 using weighted variance
    let weightedSS = 0;
    let sumW = 0;
    for (let i = 0; i < valid.length; i++) {
      const residual = valid[i].effect - mu;
      weightedSS += weights[i] * residual * residual;
      sumW += weights[i];
    }

    const tau2New = Math.max(0, (weightedSS - (valid.length - 1)) / sumW);
    tau2 = 0.9 * tau2 + 0.1 * tau2New; // Damping

    // Check convergence
    const delta = Math.abs(mu - prevMu);
    if (verbose && iter % 50 === 0) {
      console.log(`Iter ${iter}: mu=${mu.toFixed(4)}, tau2=${tau2.toFixed(4)}, tailIdx=${tailIndex.toFixed(2)}`);
    }

    if (delta < tolerance) {
      converged = true;
    }

    prevMu = mu;
    iter++;
  }

  // Compute final statistics
  const finalResiduals = valid.map(s => s.effect - mu);
  const finalScale = madScale(finalResiduals);

  // Standard error using influence function approach
  const { weights, sumWeights } = computeARFISWeights(valid, mu, tailIndex, finalScale);
  const se = sumWeights > 0 ? 1 / Math.sqrt(sumWeights) : null;

  // 95% confidence interval using t-distribution
  const tCrit = tQuantile(0.975, valid.length - 1);
  const ciLower = se !== null ? mu - tCrit * se : null;
  const ciUpper = se !== null ? mu + tCrit * se : null;

  // Prediction interval
  const piSe = se !== null ? Math.sqrt(se * se + tau2) : null;
  const piLower = piSe !== null ? mu - tCrit * piSe : null;
  const piUpper = piSe !== null ? mu + tCrit * piSe : null;

  // Heterogeneity statistics
  const Q = computeQ(valid, mu);
  const I2 = Math.max(0, ((Q - (valid.length - 1)) / Q) * 100);

  // Outlier detection based on ARFIS weights
  const normalizedWeights = weights.map(w => w / weights.reduce((a, b) => a + b, 0));
  const avgWeight = normalizedWeights.reduce((a, b) => a + b, 0) / normalizedWeights.length;
  const outliers = valid.map((s, i) => ({
    study: s.index,
    effect: s.effect,
    weight: normalizedWeights[i],
    isOutlier: normalizedWeights[i] < avgWeight * 0.5, // Weight below 50% of average
    leverage: 1 / s.variance / (1 / variances.reduce((a, v) => a + 1 / v, 0))
  })).filter(o => o.isOutlier);

  return {
    effect: mu,
    se,
    ci: [ciLower, ciUpper],
    ciLevel: 0.95,
    tau2,
    tau: Math.sqrt(tau2),
    tailIndex,
    pi: [piLower, piUpper],
    Q,
    df: valid.length - 1,
    I2,
    H2: Q / (valid.length - 1),
    converged,
    iterations: iter,
    scale: finalScale,
    weights: normalizedWeights,
    outliers,
    outlierCount: outliers.length,
    // Tail behavior classification
    tailBehavior: tailIndex < 2 ? 'Very Heavy' :
                  tailIndex < 3 ? 'Heavy' :
                  tailIndex < 4 ? 'Medium' :
                  tailIndex < 6 ? 'Light' : 'Very Light',
    // Robustness assessment
    robustness: {
      tailIndex,
      isHeavyTailed: tailIndex < 3,
      recommendedMethod: tailIndex < 3 ? 'ARFIS' : tailIndex < 4 ? 'Huber' : 'Standard REML',
      efficiency: tailIndex > 4 ? 'High (near-optimal)' :
                   tailIndex > 2 ? 'Moderate' : 'Low but necessary'
    },
    // Method identification
    method: 'ARFIS: Adaptive Robust Fitted Influence Scale',
    reference: 'Information Sciences (2024)',
    doi: '10.1016/j.ins.2024.121344'
  };
}

/**
 * DerSimonian-Laird estimator for initialization
 * @private
 */
function derSimonianLaird(effects, variances) {
  const n = effects.length;
  const weights = variances.map(v => 1 / v);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const muFE = weights.reduce((sum, w, i) => sum + w * effects[i], 0) / sumW;

  let Q = 0;
  for (let i = 0; i < n; i++) {
    Q += weights[i] * Math.pow(effects[i] - muFE, 2);
  }

  const df = n - 1;
  const sumW2 = weights.reduce((sum, w) => sum + w * w, 0);
  let tau2 = (Q - df) / (sumW - sumW2 / sumW);
  if (tau2 < 0) tau2 = 0;

  const reWeights = weights.map(w => 1 / (w + 1 / tau2));
  const sumRE = reWeights.reduce((a, b) => a + b, 0);
  const mu = reWeights.reduce((sum, w, i) => sum + w * effects[i], 0) / sumRE;

  return { effect: mu, tau2 };
}

/**
 * Compute Q statistic
 * @private
 */
function computeQ(studies, mu) {
  return studies.reduce((q, s) => q + Math.pow(s.effect - mu, 2) / s.variance, 0);
}

/**
 * Student's t quantile
 * @private
 */
function tQuantile(p, df) {
  if (df <= 0) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Approximation for large df
  if (df > 100) {
    const z = p < 0.5 ? -1 : 1;
    const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
               1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
    const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
               6.680131188771972e1, -1.328068155288572e1];
    const r = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    return z * (((((a[5]*r+a[4])*r+a[3])*r+a[2])*r+a[1])*r + a[0]) /
               (((((b[5]*r+b[4])*r+b[3])*r+b[2])*r+b[1])*r + b[0]);
  }

  // Newton-Raphson for smaller df
  let t = p < 0.5 ? -1 : 1;
  for (let i = 0; i < 20; i++) {
    const t2 = t * t;
    const pdf = Math.pow(1 + t2/df, -(df+1)/2) /
                (Math.sqrt(df) * beta(0.5, df/2));
    const delta = (tCDF(t, df) - p) / pdf;
    t -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  return t;
}

/**
 * Beta function
 * @private
 */
function beta(a, b) {
  return Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));
}

/**
 * Log-gamma function
 * @private
 */
function logGamma(z) {
  if (z <= 0) return Infinity;
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Student's t CDF
 * @private
 */
function tCDF(t, df) {
  if (df <= 0) return 0.5;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  return t >= 0 ? 1 - 0.5 * betaInc(df / 2, 0.5, x) :
                  0.5 * betaInc(df / 2, 0.5, x);
}

/**
 * Incomplete beta function
 * @private
 */
function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) return NaN;

  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a;
  }
  return 1 - bt * betaCF(b, a, 1 - x) / b;
}

/**
 * Continued fraction for incomplete beta
 * @private
 */
function betaCF(a, b, x) {
  const maxIter = 100;
  const eps = 1e-14;
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

export default ARFISMetaAnalysis;
