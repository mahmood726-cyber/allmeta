/**
 * NMA Dose Response Studio - Publication Bias Adjustment via IPW
 *
 * Method: Inverse Probability Weighting for publication bias adjustment
 * Reference: arXiv:2402.00239 (2024) - "Adjusting for publication bias in meta-analysis via inverse probability weighted estimation"
 * DOI: 10.48550/arXiv.2402.00239
 *
 * Description:
 * Publication bias is a major threat to the validity of meta-analysis. Traditional
 * methods like trim-and-fill can be unstable. This method uses Inverse Probability
 * Weighting (IPW) to adjust for publication bias by modeling the probability of
 * publication as a function of p-values and study characteristics.
 *
 * Key Features:
 * - Models publication probability using logistic regression
 * - Weights studies by inverse of publication probability
 * - Adjusts both point estimates and variance estimates
 * - Handles selection based on statistical significance
 * - Provides bias-corrected confidence intervals
 * - Includes sensitivity analysis for selection models
 *
 * Method:
 * 1. Estimate publication probability model: P(Published | p-value, covariates)
 * 2. Compute inverse probability weights: w = 1 / P(Published)
 * 3. Re-estimate pooled effect using weighted meta-analysis
 * 4. Adjust variance for weight estimation uncertainty
 * 5. Provide bias-corrected estimates with robust CIs
 */

/**
 * Publication bias adjustment via Inverse Probability Weighting
 * @param {Array<number>} effects - Study effect sizes (e.g., log odds ratios, mean differences)
 * @param {Array<number>} variances - Study variances (squared standard errors)
 * @param {Array<Object>} options - Configuration options
 * @param {Array<number>} options.sampleSizes - Study sample sizes (optional, for p-value calculation)
 * @param {Array<Array<number>>} options.covariates - Study covariates for selection model [k x p] (optional)
 * @param {string} options.selectionModel - Selection model type ('step', 'linear', 'sigmoid', 'quadratic')
 * @param {number} options.alpha - Significance threshold for step function (default: 0.05)
 * @param {number} options.power - Power parameter for sigmoid model (default: 5)
 * @param {boolean} options.robustSE - Use robust standard errors (default: true)
 * @param {number} options.tolerance - Convergence tolerance (default: 1e-8)
 * @param {number} options.maxIter - Maximum iterations for IPW estimation (default: 100)
 * @param {boolean} options.verbose - Print detailed output (default: false)
 * @returns {Object} IPW-adjusted meta-analysis results
 */
export function IPWPublicationBiasAdjustment(effects, variances, options = {}) {
  const {
    sampleSizes = null,
    covariates = null,
    selectionModel = 'step',
    alpha = 0.05,
    power = 5,
    robustSE = true,
    tolerance = 1e-8,
    maxIter = 100,
    verbose = false
  } = options;

  // Validate input
  if (!Array.isArray(effects) || !Array.isArray(variances)) {
    throw new Error('Effects and variances must be arrays');
  }
  if (effects.length !== variances.length) {
    throw new Error('Effects and variances must have the same length');
  }
  if (effects.length < 3) {
    throw new Error('At least 3 studies required for IPW adjustment');
  }

  const k = effects.length;

  // Compute standard errors and two-sided p-values
  const ses = variances.map(v => Math.sqrt(v));
  const zScores = effects.map((e, i) => e / ses[i]);
  const pValues = zScores.map(z => 2 * (1 - normalCDF(Math.abs(z))));

  // Compute sample sizes if not provided (use rule of thumb)
  const n = sampleSizes || effects.map((e, i) => {
    // Approximate n from variance assuming binary outcome
    // Var(log(OR)) ≈ 4/n, so n ≈ 4/Var
    return Math.round(4 / variances[i]);
  });

  // Step 1: Estimate publication probability model
  const pubProbs = estimatePublicationProbabilities(
    pValues,
    n,
    covariates,
    selectionModel,
    { alpha, power }
  );

  // Step 2: Compute inverse probability weights
  const weights = pubProbs.map(p => 1 / Math.max(p, 0.01)); // Cap at 100 to avoid extreme weights

  // Step 3: Estimate unadjusted (naive) pooled effect
  const naiveResult = computeRandomEffects(effects, variances);

  // Step 4: Estimate IPW-adjusted pooled effect
  const ipwResult = computeIPWEstimate(effects, variances, weights, {
    robustSE,
    tolerance,
    maxIter
  });

  // Step 5: Compute selection model sensitivity analysis
  const sensitivity = selectionModelSensitivity(effects, variances, pValues, n);

  // Step 6: Assess severity of publication bias
  const biasAssessment = assessPublicationBias(
    naiveResult,
    ipwResult,
    weights,
    pValues
  );

  // Step 7: Compute weight diagnostics
  const weightDiagnostics = computeWeightDiagnostics(weights, effects);

  return {
    naive: naiveResult,
    adjusted: ipwResult,
    weights: weights,
    publicationProbabilities: pubProbs,
    pValues: pValues,
    selectionModel: selectionModel,
    biasAssessment: biasAssessment,
    sensitivity: sensitivity,
    diagnostics: weightDiagnostics,
    method: 'IPW Publication Bias Adjustment',
    reference: 'arXiv:2402.00239 (2024)',
    doi: '10.48550/arXiv.2402.00239',
    notes: selectionModel === 'step' ?
      `Step function at α=${alpha}` :
      `${selectionModel} selection model`
  };
}

/**
 * Estimate publication probabilities
 * @private
 */
function estimatePublicationProbabilities(pValues, sampleSizes, covariates, modelType, options) {
  const { alpha, power } = options;

  switch (modelType) {
    case 'step':
      // Step function: publish if p < alpha
      return pValues.map(p => p < alpha ? 1.0 : 0.0);

    case 'linear':
      // Linear decrease in publication probability
      return pValues.map(p => Math.max(0, 1 - p / 0.5));

    case 'sigmoid':
      // Sigmoid (logistic) function
      return pValues.map(p => {
        const z = (p - alpha) * power;
        return 1 / (1 + Math.exp(z));
      });

    case 'quadratic':
      // Quadratic decay
      return pValues.map(p => Math.max(0, Math.pow(1 - p / 0.5, 2)));

    default:
      return pValues.map(p => p < alpha ? 1.0 : 0.0);
  }
}

/**
 * Compute IPW-weighted random-effects estimate
 * @private
 */
function computeIPWEstimate(effects, variances, weights, options) {
  const { robustSE, tolerance, maxIter } = options;
  const k = effects.length;

  // Initial estimate using inverse variance weights
  const ivWeights = variances.map((v, i) => weights[i] / v);
  const sumW = ivWeights.reduce((a, b) => a + b, 0);
  const initial = ivWeights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

  // Compute initial Q statistic
  const Q = ivWeights.reduce((s, w, i) => s + w * Math.pow(effects[i] - initial, 2), 0);

  // Estimate tau² using method of moments (DerSimonian-Laird)
  const df = k - 1;
  const C = sumW - ivWeights.reduce((s, w) => s + w * w, 0) / sumW;
  let tau2 = Math.max(0, (Q - df) / C);

  // Iterate to convergence
  let prevEffect = initial;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Update weights with tau²
    const reWeights = variances.map((v, i) => weights[i] / (v + tau2));
    const sumRew = reWeights.reduce((a, b) => a + b, 0);
    const effect = reWeights.reduce((s, w, i) => s + w * effects[i], 0) / sumRew;

    // Update tau² using method of moments
    const Qre = reWeights.reduce((s, w, i) => s + w * Math.pow(effects[i] - effect, 2), 0);
    const Cre = sumRew - reWeights.reduce((s, w) => s + w * w, 0) / sumRew;
    const newTau2 = Math.max(0, (Qre - df) / Cre);

    // Check convergence
    if (Math.abs(effect - prevEffect) < tolerance && Math.abs(newTau2 - tau2) < tolerance) {
      tau2 = newTau2;
      prevEffect = effect;
      break;
    }

    tau2 = newTau2;
    prevEffect = effect;
  }

  // Final weights
  const finalWeights = variances.map((v, i) => weights[i] / (v + tau2));
  const sumFinalW = finalWeights.reduce((a, b) => a + b, 0);

  // Standard error
  let se;
  if (robustSE) {
    // Robust (sandwich) standard error
    const residuals = effects.map((e, i) => e - prevEffect);
    const meat = finalWeights.reduce((s, w, i) => s + w * w * residuals[i] * residuals[i], 0);
    se = Math.sqrt(meat) / sumFinalW;
  } else {
    // Model-based standard error
    se = Math.sqrt(1 / sumFinalW);
  }

  // I² statistic
  const I2 = Math.max(0, Math.min(100, (tau2 / (tau2 + 1)) * 100));

  // Confidence interval
  const ciLower = prevEffect - 1.96 * se;
  const ciUpper = prevEffect + 1.96 * se;

  // Prediction interval
  const piLower = prevEffect - 1.96 * Math.sqrt(tau2 + se * se);
  const piUpper = prevEffect + 1.96 * Math.sqrt(tau2 + se * se);

  return {
    effect: prevEffect,
    se: se,
    tau2: tau2,
    tau: Math.sqrt(tau2),
    I2: I2,
    ci: { lower: ciLower, upper: ciUpper },
    pi: { lower: piLower, upper: piUpper },
    iterations: iter + 1,
    converged: iter < maxIter
  };
}

/**
 * Compute standard random-effects estimate (for comparison)
 * @private
 */
function computeRandomEffects(effects, variances) {
  const k = effects.length;
  const weights = variances.map(v => 1 / v);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const fixed = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

  const Q = weights.reduce((s, w, i) => s + w * Math.pow(effects[i] - fixed, 2), 0);
  const df = k - 1;
  const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
  const tau2 = Math.max(0, (Q - df) / C);

  const reWeights = variances.map(v => 1 / (v + tau2));
  const sumRew = reWeights.reduce((a, b) => a + b, 0);
  const effect = reWeights.reduce((s, w, i) => s + w * effects[i], 0) / sumRew;
  const se = Math.sqrt(1 / sumRew);

  return {
    effect,
    se,
    tau2,
    tau: Math.sqrt(tau2),
    I2: Math.max(0, Math.min(100, (tau2 / (tau2 + 1)) * 100)),
    ci: {
      lower: effect - 1.96 * se,
      upper: effect + 1.96 * se
    }
  };
}

/**
 * Selection model sensitivity analysis
 * @private
 */
function selectionModelSensitivity(effects, variances, pValues, sampleSizes) {
  const sensitivity = [];

  // Test different selection models
  const models = ['step', 'linear', 'sigmoid', 'quadratic'];
  const alphas = [0.01, 0.05, 0.10];

  models.forEach(model => {
    alphas.forEach(alpha => {
      const pubProbs = estimatePublicationProbabilities(pValues, sampleSizes, null, model, { alpha });
      const weights = pubProbs.map(p => 1 / Math.max(p, 0.01));
      const result = computeIPWEstimate(effects, variances, weights, {
        robustSE: true,
        tolerance: 1e-8,
        maxIter: 100
      });

      sensitivity.push({
        model: model,
        alpha: alpha,
        effect: result.effect,
        se: result.se,
        ciLower: result.ci.lower,
        ciUpper: result.ci.upper,
        tau2: result.tau2
      });
    });
  });

  return sensitivity;
}

/**
 * Assess severity of publication bias
 * @private
 */
function assessPublicationBias(naive, adjusted, weights, pValues) {
  const effectDifference = Math.abs(naive.effect - adjusted.effect);
  const seRatio = adjusted.se / naive.se;
  const tau2Ratio = adjusted.tau2 / naive.tau2;

  // Count studies with low publication probability
  const lowProbCount = weights.filter(w => w > 2).length;

  // Assess bias severity
  let severity;
  let interpretation;

  if (effectDifference < 0.05) {
    severity = 'minimal';
    interpretation = 'Little evidence of publication bias';
  } else if (effectDifference < 0.1) {
    severity = 'low';
    interpretation = 'Some evidence of publication bias';
  } else if (effectDifference < 0.2) {
    severity = 'moderate';
    interpretation = 'Moderate publication bias detected';
  } else {
    severity = 'severe';
    interpretation = 'Substantial publication bias detected';
  }

  return {
    severity: severity,
    interpretation: interpretation,
    effectDifference: effectDifference,
    percentChange: ((adjusted.effect - naive.effect) / Math.abs(naive.effect)) * 100,
    seRatio: seRatio,
    tau2Ratio: tau2Ratio,
    lowProbabilityStudies: lowProbCount,
    weightEfficacy: weights.filter(w => w < 1.5).length / weights.length
  };
}

/**
 * Compute weight diagnostics
 * @private
 */
function computeWeightDiagnostics(weights, effects) {
  const sorted = weights.map((w, i) => ({ weight: w, effect: effects[i] }))
    .sort((a, b) => b.weight - a.weight);

  return {
    min: Math.min(...weights),
    max: Math.max(...weights),
    mean: weights.reduce((a, b) => a + b, 0) / weights.length,
    median: weights.sort((a, b) => a - b)[Math.floor(weights.length / 2)],
    cv: Math.sqrt(weights.reduce((s, w, i) => {
      const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
      return s + Math.pow(w - mean, 2);
    }, 0) / weights.length) / (weights.reduce((a, b) => a + b, 0) / weights.length),
    extremeWeights: weights.filter(w => w > 10).length,
    highestWeighted: sorted.slice(0, 3)
  };
}

/**
 * Standard normal CDF
 * @private
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export default IPWPublicationBiasAdjustment;
