/**
 * NMA Dose Response Studio - Meta-Analysis Models Relaxing Normality Assumption
 *
 * Method: Random-effects meta-analysis with non-normal distributions
 * Reference: BMC Medical Research Methodology (2025) - "Meta-analysis models relaxing the random-effects normality assumption"
 * Source: https://link.springer.com/article/10.1186/s12874-025-02658-3
 *
 * Description:
 * Traditional random-effects meta-analysis assumes normally distributed random effects.
 * This module implements alternative distributions for better handling of:
 * - Skewed effect distributions
 * - Heavy-tailed data
 * - Multi-modal effect patterns
 * - Bounded outcomes
 *
 * Distributions Implemented:
 * 1. t-distribution (heavy tails)
 * 2. Skew-normal (asymmetric)
 * 3. Slash (very heavy tails)
 * 4. Contaminated normal (mixture for robustness)
 * 5. Uniform (bounded effects)
 */

/**
 * Fit random-effects meta-analysis with specified distribution
 * @param {Array<number>} effects - Study effect sizes
 * @param {Array<number>} variances - Within-study variances
 * @param {Object} options - Configuration
 * @param {string} options.distribution - 'normal', 't', 'skewNormal', 'slash', 'contaminated', 'uniform'
 * @param {boolean} options.estimateParams - Estimate distribution parameters (default: true)
 * @param {number} options.tolerance - Convergence tolerance (default: 1e-8)
 * @returns {Object} Fitted model results
 */
export function NonNormalRandomEffects(effects, variances, options = {}) {
  const {
    distribution = 't',
    estimateParams = true,
    tolerance = 1e-8
  } = options;

  const n = effects.length;

  if (n !== variances.length) {
    throw new Error('Effects and variances must have same length');
  }
  if (n < 2) {
    throw new Error('At least 2 studies required');
  }

  // Validate studies
  const valid = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(effects[i]) && Number.isFinite(variances[i]) && variances[i] > 0) {
      valid.push({ effect: effects[i], variance: variances[i], se: Math.sqrt(variances[i]) });
    }
  }

  if (valid.length < 2) {
    throw new Error('At least 2 valid studies required');
  }

  // Initial estimate using normal REML
  const initial = normalREML(valid.map(s => s.effect), valid.map(s => s.variance));
  let mu = initial.mu;
  let tau2 = initial.tau2;

  // Distribution-specific fitting
  let result;

  switch (distribution) {
    case 't':
      result = fitTDistribution(valid, mu, tau2, tolerance);
      break;
    case 'skewNormal':
      result = fitSkewNormal(valid, mu, tau2, tolerance);
      break;
    case 'slash':
      result = fitSlashDistribution(valid, mu, tau2, tolerance);
      break;
    case 'contaminated':
      result = fitContaminatedNormal(valid, mu, tau2, tolerance);
      break;
    case 'uniform':
      result = fitUniformDistribution(valid, mu, tau2, tolerance);
      break;
    default:
      result = fitTDistribution(valid, mu, tau2, tolerance);
  }

  // Compute heterogeneity statistics
  const Q = computeQ(valid, result.mu);
  const I2 = Math.max(0, ((Q - (valid.length - 1)) / Q) * 100);

  // Model comparison
  result.aic = computeAIC(result.logLikelihood, result.nParams);
  result.bic = computeBIC(result.logLikelihood, result.nParams, valid.length);

  result.heterogeneity = {
    Q,
    df: valid.length - 1,
    I2,
    H2: Q / (valid.length - 1),
    tau2: result.tau2,
    tau: Math.sqrt(result.tau2)
  };

  result.method = `Random-Effects with ${distribution} distribution`;
  result.reference = 'BMC Medical Research Methodology (2025)';
  result.assumptions = `${distribution} random effects distribution`;

  return result;
}

/**
 * Fit t-distribution random effects
 * @private
 */
function fitTDistribution(studies, initMu, initTau2, tol) {
  const m = studies.length;

  // Parameters: mu, tau2, nu (degrees of freedom)
  let mu = initMu;
  let tau2 = initTau2;
  let nu = 5; // Initial df

  let prevLL = -Infinity;
  let iter = 0;

  while (iter < 200) {
    // E-step: compute weights based on current parameters
    const weights = [];
    for (const s of studies) {
      const totalVar = s.variance + tau2;
      const standardized = (s.effect - mu) / Math.sqrt(totalVar);
      // Weight for t-distribution
      const w = (nu + 1) / (nu + standardized * standardized);
      weights.push(w / totalVar);
    }

    // M-step: update parameters
    const sumW = weights.reduce((a, b) => a + b, 0);
    const newMu = weights.reduce((sum, w, i) => sum + w * studies[i].effect, 0) / sumW;

    // Update tau2
    let ss = 0;
    for (let i = 0; i < m; i++) {
      ss += weights[i] * Math.pow(studies[i].effect - newMu, 2);
    }
    const newTau2 = Math.max(0, ss / sumW - (m - 1) / sumW);

    // Update nu via profile likelihood
    let bestNu = nu;
    let bestLL = logLikelihoodTDist(studies, newMu, newTau2, nu);

    for (const testNu of [3, 4, 5, 7, 10, 15, 20, 30]) {
      const ll = logLikelihoodTDist(studies, newMu, newTau2, testNu);
      if (ll > bestLL) {
        bestLL = ll;
        bestNu = testNu;
      }
    }

    // Check convergence
    if (Math.abs(bestLL - prevLL) < tol) {
      mu = newMu;
      tau2 = newTau2;
      nu = bestNu;
      break;
    }

    mu = newMu;
    tau2 = newTau2;
    nu = bestNu;
    prevLL = bestLL;
    iter++;
  }

  // Compute standard error
  const se = computeSEWeighted(studies, mu, tau2);

  return {
    mu,
    se,
    tau2,
    nu,
    logLikelihood: prevLL,
    nParams: 3,
    distribution: 't',
    heavyTailed: true,
    skewness: 0,
    notes: `t-distribution with ${nu.toFixed(1)} degrees of freedom`
  };
}

/**
 * Fit skew-normal random effects
 * @private
 */
function fitSkewNormal(studies, initMu, initTau2, tol) {
  const m = studies.length;

  // Parameters: mu, tau2, alpha (skewness parameter)
  let mu = initMu;
  let tau2 = initTau2;
  let alpha = 0; // Start symmetric

  let iter = 0;

  while (iter < 200) {
    // Compute skew-normal weights using Owen's T function approximation
    const weights = [];
    const delta = alpha / Math.sqrt(1 + alpha * alpha);

    for (const s of studies) {
      const totalVar = s.variance + tau2;
      const z = (s.effect - mu) / Math.sqrt(totalVar);
      // Skew-normal PDF approximation
      const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
      const Phi = normalCDF(z * delta);
      const snPDF = 2 * phi * Phi / Math.sqrt(totalVar);
      weights.push(snPDF);
    }

    const sumW = weights.reduce((a, b) => a + b, 0);
    const newMu = weights.reduce((sum, w, i) => sum + w * studies[i].effect, 0) / sumW;

    // Update tau2
    let ss = 0;
    for (let i = 0; i < m; i++) {
      ss += weights[i] * Math.pow(studies[i].effect - newMu, 2);
    }
    const newTau2 = Math.max(0, ss / sumW);

    // Estimate alpha from residuals
    const residuals = studies.map(s => s.effect - newMu);
    const skewness = computeSkewness(residuals);
    const newAlpha = skewnessToAlpha(skewness);

    if (Math.abs(newMu - mu) < tol && Math.abs(newTau2 - tau2) < tol) {
      mu = newMu;
      tau2 = newTau2;
      alpha = newAlpha;
      break;
    }

    mu = newMu;
    tau2 = newTau2;
    alpha = 0.7 * alpha + 0.3 * newAlpha;
    iter++;
  }

  const se = computeSEWeighted(studies, mu, tau2);

  return {
    mu,
    se,
    tau2,
    alpha,
    skewness: alphaToSkewness(alpha),
    logLikelihood: logLikelihoodSkewNormal(studies, mu, tau2, alpha),
    nParams: 3,
    distribution: 'skew-normal',
    heavyTailed: false,
    notes: `Skew-normal with alpha=${alpha.toFixed(2)}`
  };
}

/**
 * Fit slash distribution (very heavy tails)
 * @private
 */
function fitSlashDistribution(studies, initMu, initTau2, tol) {
  // Slash distribution: ratio of normal to uniform
  // Has extremely heavy tails (no finite moments)

  let mu = initMu;
  let tau2 = initTau2;
  let m = studies.length;

  for (let iter = 0; iter < 200; iter++) {
    const weights = [];

    for (const s of studies) {
      const totalVar = s.variance + tau2;
      const u = (s.effect - mu) / Math.sqrt(totalVar);
      // Slash PDF: (exp(-u^2/2) - exp(-u^2/2*(m+1)^2)) / (u^2 * (m+1))
      // Simplified weight using robust approximation
      let w;
      if (Math.abs(u) < 0.001) {
        w = 1;
      } else {
        const u2 = u * u;
        w = (1 - Math.exp(-u2 / 2)) / (u2 / 2);
        w = Math.max(0.001, Math.min(1, w));
      }
      weights.push(w / totalVar);
    }

    const sumW = weights.reduce((a, b) => a + b, 0);
    const newMu = weights.reduce((sum, w, i) => sum + w * studies[i].effect, 0) / sumW;

    let ss = 0;
    for (let i = 0; i < m; i++) {
      ss += weights[i] * Math.pow(studies[i].effect - newMu, 2);
    }
    const newTau2 = Math.max(0, ss / sumW - (m - 1) / sumW);

    if (Math.abs(newMu - mu) < tol) {
      mu = newMu;
      tau2 = newTau2;
      break;
    }

    mu = newMu;
    tau2 = newTau2;
  }

  const se = computeSEWeighted(studies, mu, tau2);

  return {
    mu,
    se,
    tau2,
    logLikelihood: logLikelihoodSlash(studies, mu, tau2),
    nParams: 2,
    distribution: 'slash',
    heavyTailed: true,
    skewness: 0,
    notes: 'Slash distribution (extremely heavy tails)'
  };
}

/**
 * Fit contaminated normal (mixture for robustness)
 * @private
 */
function fitContaminatedNormal(studies, initMu, initTau2, tol) {
  // Contaminated normal: (1-eps) * N(0,1) + eps * N(0, s^2)
  // Provides robustness through mixture

  let mu = initMu;
  let tau2 = initTau2;
  let eps = 0.1; // Contamination proportion
  let s2 = 9; // Variance multiplier for contamination

  for (let iter = 0; iter < 200; iter++) {
    const weights = [];

    for (const study of studies) {
      const totalVar = study.variance + tau2;
      const u = (study.effect - mu) / Math.sqrt(totalVar);

      // Mixture weight
      const wMain = (1 - eps) * Math.exp(-0.5 * u * u);
      const wCont = eps * Math.exp(-0.5 * u * u / s2) / Math.sqrt(s2);
      const w = wMain + wCont;

      weights.push(w / totalVar);
    }

    const sumW = weights.reduce((a, b) => a + b, 0);
    const newMu = weights.reduce((sum, w, i) => sum + w * studies[i].effect, 0) / sumW;

    let ss = 0;
    for (let i = 0; i < studies.length; i++) {
      ss += weights[i] * Math.pow(studies[i].effect - newMu, 2);
    }
    const newTau2 = Math.max(0, ss / sumW);

    if (Math.abs(newMu - mu) < tol) {
      mu = newMu;
      tau2 = newTau2;
      break;
    }

    mu = newMu;
    tau2 = newTau2;
  }

  const se = computeSEWeighted(studies, mu, tau2);

  return {
    mu,
    se,
    tau2,
    eps,
    s2,
    logLikelihood: logLikelihoodContaminated(studies, mu, tau2, eps, s2),
    nParams: 4,
    distribution: 'contaminated-normal',
    heavyTailed: true,
    notes: `Contaminated normal (eps=${eps}, s²=${s2})`
  };
}

/**
 * Fit uniform distribution (bounded effects)
 * @private
 */
function fitUniformDistribution(studies, initMu, initTau2, tol) {
  // Uniform on [mu - sqrt(3*tau2), mu + sqrt(3*tau2)]
  // For uniform: var = tau2 = width^2 / 12, so width = sqrt(12*tau2)

  let mu = initMu;
  let tau2 = initTau2;

  for (let iter = 0; iter < 100; iter++) {
    const halfWidth = Math.sqrt(3 * tau2);
    const lower = mu - halfWidth;
    const upper = mu + halfWidth;

    // Likelihood for uniform
    let ll = 0;
    for (const s of studies) {
      if (s.effect >= lower && s.effect <= upper) {
        ll += -0.5 * Math.log(2 * halfWidth) - 0.5 * Math.log(s.variance);
      } else {
        ll += -Infinity; // Outside support
        break;
      }
    }

    if (!Number.isFinite(ll)) {
      tau2 *= 1.1; // Expand support
      continue;
    }

    // Find MLE for uniform (midpoint of min and max)
    const effects = studies.map(s => s.effect);
    const mid = (Math.min(...effects) + Math.max(...effects)) / 2;
    const range = Math.max(...effects) - Math.min(...effects);
    const newMu = mid;
    const newTau2 = (range * range) / 12;

    if (Math.abs(newMu - mu) < tol) {
      mu = newMu;
      tau2 = newTau2;
      break;
    }

    mu = newMu;
    tau2 = newTau2;
  }

  const se = Math.sqrt(tau2 / studies.length);

  return {
    mu,
    se,
    tau2,
    logLikelihood: logLikelihoodUniform(studies, mu, tau2),
    nParams: 2,
    distribution: 'uniform',
    heavyTailed: false,
    bounded: true,
    notes: 'Uniform distribution (bounded effects)'
  };
}

// Helper functions
function normalREML(effects, variances) {
  const n = effects.length;
  const weights = variances.map(v => 1 / v);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const mu = weights.reduce((sum, w, i) => sum + w * effects[i], 0) / sumW;

  let Q = 0;
  for (let i = 0; i < n; i++) {
    Q += weights[i] * Math.pow(effects[i] - mu, 2);
  }

  const df = n - 1;
  const sumW2 = weights.reduce((sum, w) => sum + w * w, 0);
  let tau2 = (Q - df) / (sumW - sumW2 / sumW);
  if (tau2 < 0) tau2 = 0;

  return { mu, tau2 };
}

function computeQ(studies, mu) {
  return studies.reduce((q, s) => q + Math.pow(s.effect - mu, 2) / s.variance, 0);
}

function logLikelihoodTDist(studies, mu, tau2, nu) {
  let ll = 0;
  for (const s of studies) {
    const totalVar = s.variance + tau2;
    const z = (s.effect - mu) / Math.sqrt(totalVar);
    ll += logGamma((nu + 1) / 2) - 0.5 * Math.log(nu * Math.PI) - 0.5 * Math.log(totalVar) -
         ((nu + 1) / 2) * Math.log1p(z * z / nu);
  }
  return ll;
}

function logLikelihoodSkewNormal(studies, mu, tau2, alpha) {
  let ll = 0;
  const delta = alpha / Math.sqrt(1 + alpha * alpha);
  for (const s of studies) {
    const totalVar = s.variance + tau2;
    const z = (s.effect - mu) / Math.sqrt(totalVar);
    ll += -0.5 * Math.log(totalVar) - 0.5 * z * z + Math.log(2) + normalCDF(delta * z);
  }
  return ll;
}

function logLikelihoodSlash(studies, mu, tau2) {
  let ll = 0;
  for (const s of studies) {
    const totalVar = s.variance + tau2;
    const z = (s.effect - mu) / Math.sqrt(totalVar);
    const z2 = z * z;
    if (z2 < 0.001) {
      ll += -0.5 * Math.log(totalVar);
    } else {
      ll += Math.log1p(-Math.exp(-z2 / 2)) - Math.log(z2 / 2) - 0.5 * Math.log(totalVar);
    }
  }
  return ll;
}

function logLikelihoodContaminated(studies, mu, tau2, eps, s2) {
  let ll = 0;
  for (const s of studies) {
    const totalVar = s.variance + tau2;
    const z = (s.effect - mu) / Math.sqrt(totalVar);
    const z2 = z * z;
    const w = (1 - eps) * Math.exp(-0.5 * z2) + eps * Math.exp(-0.5 * z2 / s2) / Math.sqrt(s2);
    ll += Math.log(w) - 0.5 * Math.log(totalVar) - 0.5 * Math.log(2 * Math.PI);
  }
  return ll;
}

function logLikelihoodUniform(studies, mu, tau2) {
  const halfWidth = Math.sqrt(3 * tau2);
  const lower = mu - halfWidth;
  const upper = mu + halfWidth;
  let ll = 0;

  for (const s of studies) {
    if (s.effect >= lower && s.effect <= upper) {
      ll += -Math.log(2 * halfWidth) - 0.5 * Math.log(s.variance);
    } else {
      return -Infinity;
    }
  }
  return ll;
}

function computeSEWeighted(studies, mu, tau2) {
  const weights = studies.map(s => 1 / (s.variance + tau2));
  return 1 / Math.sqrt(weights.reduce((a, b) => a + b, 0));
}

function computeSkewness(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const m2 = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const m3 = values.reduce((s, v) => s + Math.pow(v - mean, 3), 0) / n;
  return m3 / Math.pow(m2, 1.5);
}

function skewnessToAlpha(gamma) {
  // Approximate conversion from skewness to alpha
  if (Math.abs(gamma) < 0.01) return 0;
  return gamma / Math.pow(2 - (4 / Math.PI), 1.5) * Math.sqrt(Math.PI / 2);
}

function alphaToSkewness(alpha) {
  const delta = alpha / Math.sqrt(1 + alpha * alpha);
  return (4 - Math.PI) / 2 * Math.pow(delta * Math.sqrt(2 / Math.PI), 3) /
         Math.pow(1 - 2 * delta * delta / Math.PI, 1.5);
}

function normalCDF(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

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

function computeAIC(ll, k) {
  return 2 * k - 2 * ll;
}

function computeBIC(ll, k, n) {
  return Math.log(n) * k - 2 * ll;
}

export default NonNormalRandomEffects;
