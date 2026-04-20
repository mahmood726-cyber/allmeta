/**
 * NMA Dose Response Studio - Statistical Utilities Module
 * Core statistical utility functions
 */

import { chiSquareQuantile } from './distributions.js';

/**
 * Safe division to prevent Infinity/NaN
 * @param {number} numerator - Numerator
 * @param {number} denominator - Denominator
 * @param {number} fallback - Fallback value (default: 0)
 * @returns {number} Division result or fallback
 */
export function safeDivide(numerator, denominator, fallback = 0) {
  if (!Number.isFinite(denominator) || denominator === 0) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Safe square root
 * @param {number} x - Value
 * @param {number} fallback - Fallback value (default: 0)
 * @returns {number} Square root or fallback
 */
export function safeSqrt(x, fallback = 0) {
  if (x === Infinity) return Infinity;
  if (!Number.isFinite(x) || x < 0) return fallback;
  return Math.sqrt(x);
}

/**
 * Safe logarithm
 * @param {number} x - Value
 * @param {number} fallback - Fallback value (default: -Infinity)
 * @returns {number} Logarithm or fallback
 */
export function safeLog(x, fallback = -Infinity) {
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return Math.log(x);
}

/**
 * Safe method execution wrapper
 * @param {Function} fn - Function to execute
 * @param {*} fallback - Fallback value if function fails
 * @param {*} context - Context for function execution
 * @returns {*} Function result or fallback
 */
export function safeExecute(fn, fallback = null, context = null) {
  try {
    const result = context ? fn.call(context) : fn();
    return result;
  } catch (e) {
    console.warn('Safe execution caught error:', e.message);
    return fallback;
  }
}

/**
 * I² confidence interval using Q-profile method (Viechtbauer 2007)
 * Reference: Viechtbauer W. Stat Med. 2007;26(1):37-52.
 * @param {number} Q - Cochran's Q statistic
 * @param {number} k - Number of studies
 * @param {number} alpha - Significance level (default: 0.05)
 * @returns {object} Object with I2, lower, upper bounds
 */
export function I2ConfidenceInterval(Q, k, alpha = 0.05) {
  if (k < 2) return { I2: 0, lower: 0, upper: 0, Q: 0, df: 0 };
  const df = k - 1;

  // Point estimate
  const I2 = Q > df ? Math.max(0, (Q - df) / Q * 100) : 0;
  if (Q <= df) return { I2: 0, lower: 0, upper: 100, Q, df };

  // Get chi-square quantiles for CI using Q-profile method
  const chiLower = chiSquareQuantile(1 - alpha / 2, df);
  const chiUpper = chiSquareQuantile(alpha / 2, df);

  // Transform to I² scale
  let lower = 0, upper = 0;
  if (Q > chiLower) {
    lower = Math.max(0, (Q - chiLower) / Q * 100);
  }
  if (Q > chiUpper && chiUpper > 0) {
    upper = Math.min(100, (Q - chiUpper) / Q * 100);
  } else if (Q > df) {
    upper = 100;
  }

  return { I2, lower, upper, Q, df };
}

/**
 * DerSimonian-Laird random effects meta-analysis
 * Consolidated implementation to avoid code duplication
 * Reference: DerSimonian R, Laird N. Control Clin Trials. 1986;7(3):177-188.
 * @param {number[]} effects - Effect sizes
 * @param {number[]} ses - Standard errors
 * @returns {object} Meta-analysis results
 */
export function computeDL(effects, ses) {
  const n = effects.length;
  if (n < 2) return { effect: NaN, se: NaN, tau2: 0, Q: 0, I2: 0, k: n, ci: { lower: NaN, upper: NaN } };

  const variances = ses.map(s => s * s);
  const weights = variances.map(v => v > 0 ? 1 / v : 0);
  const sumW = weights.reduce((a, b) => a + b, 0);

  if (sumW < 1e-10) return { effect: NaN, se: NaN, tau2: 0, Q: 0, I2: 0, k: n, ci: { lower: NaN, upper: NaN } };

  const sumW2 = weights.reduce((a, b) => a + b * b, 0);
  const fixedEffect = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;
  const Q = weights.reduce((s, w, i) => s + w * Math.pow(effects[i] - fixedEffect, 2), 0);
  const C = sumW - sumW2 / sumW;
  const tau2 = C > 0 ? Math.max(0, (Q - (n - 1)) / C) : 0;

  // Random effects weights
  const reWeights = variances.map(v => 1 / (v + tau2));
  const sumREW = reWeights.reduce((a, b) => a + b, 0);
  const reEffect = reWeights.reduce((s, w, i) => s + w * effects[i], 0) / sumREW;
  const reSE = Math.sqrt(1 / sumREW);

  // Heterogeneity statistics
  const I2 = Q > (n - 1) ? Math.max(0, (Q - (n - 1)) / Q * 100) : 0;
  const H2 = (n - 1) > 0 ? Q / (n - 1) : 1;

  return {
    effect: reEffect,
    se: reSE,
    tau2,
    tau: Math.sqrt(tau2),
    Q,
    I2,
    H2,
    k: n,
    df: n - 1,
    ci: { lower: reEffect - 1.96 * reSE, upper: reEffect + 1.96 * reSE },
    weights: reWeights,
    method: 'DerSimonian-Laird'
  };
}

export default {
  safeDivide,
  safeSqrt,
  safeLog,
  safeExecute,
  I2ConfidenceInterval,
  computeDL
};
