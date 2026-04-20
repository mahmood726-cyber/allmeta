/**
 * Cure Models Engine for Oncology HTA
 *
 * Implements mixture and non-mixture cure models where a fraction of patients
 * are "cured" (never experience the event). Critical for oncology HTA where
 * immunotherapy and targeted therapies produce long-term survival plateaus.
 *
 * Mixture model: S(t) = π + (1 - π) * S_u(t)
 * Non-mixture (bounded cumulative hazard): S(t) = exp(-θ * F(t))
 *
 * References:
 * - Boag JW (1949). JRSS-B 11:15-53.
 * - Berkson J, Gage RP (1952). JASA 47:501-515.
 * - Yu B, Tiwari RC, et al. (2004). Biometrics 60:237-247.
 * - Lambert PC (2007). Stata J 7:351-375.
 */

var KahanSumRef = (function resolveKahanSum() {
    if (typeof globalThis !== 'undefined' && globalThis.KahanSum) {
        return globalThis.KahanSum;
    }
    if (typeof require === 'function') {
        try {
            const mod = require('../utils/kahan');
            if (mod && mod.KahanSum) return mod.KahanSum;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

var PCG32Ref = (function resolvePCG32() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) {
        return globalThis.PCG32;
    }
    if (typeof require === 'function') {
        try {
            const mod = require('../utils/pcg32');
            if (mod && mod.PCG32) return mod.PCG32;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

// ─── Survival distribution helpers ──────────────────────────────────────────

/**
 * Standard normal CDF (Abramowitz & Stegun).
 */
function normalCDF(z) {
    if (z < -8) return 0;
    if (z > 8) return 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal PDF.
 */
function normalPDF(z) {
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Weibull survival: S(t) = exp(-(t/lambda)^k)
 */
function weibullSurvival(t, shape, scale) {
    if (t <= 0) return 1;
    return Math.exp(-Math.pow(t / scale, shape));
}

/**
 * Weibull PDF: f(t) = (k/lambda) * (t/lambda)^(k-1) * exp(-(t/lambda)^k)
 */
function weibullPDF(t, shape, scale) {
    if (t <= 0) return 0;
    const z = t / scale;
    return (shape / scale) * Math.pow(z, shape - 1) * Math.exp(-Math.pow(z, shape));
}

/**
 * Weibull hazard: h(t) = (k/lambda) * (t/lambda)^(k-1)
 */
function weibullHazard(t, shape, scale) {
    if (t <= 0) return 0;
    return (shape / scale) * Math.pow(t / scale, shape - 1);
}

/**
 * Log-normal survival: S(t) = 1 - Phi((ln(t) - mu) / sigma)
 */
function lognormalSurvival(t, mu, sigma) {
    if (t <= 0) return 1;
    const z = (Math.log(t) - mu) / sigma;
    return 1 - normalCDF(z);
}

/**
 * Log-normal PDF: f(t) = phi((ln(t)-mu)/sigma) / (t*sigma)
 */
function lognormalPDF(t, mu, sigma) {
    if (t <= 0) return 0;
    const z = (Math.log(t) - mu) / sigma;
    return normalPDF(z) / (t * sigma);
}

/**
 * Log-normal hazard: h(t) = f(t) / S(t)
 */
function lognormalHazard(t, mu, sigma) {
    const s = lognormalSurvival(t, mu, sigma);
    if (s <= 0) return 0;
    return lognormalPDF(t, mu, sigma) / s;
}

/**
 * Log-logistic survival: S(t) = 1 / (1 + (t/alpha)^beta)
 */
function loglogisticSurvival(t, alpha, beta) {
    if (t <= 0) return 1;
    return 1 / (1 + Math.pow(t / alpha, beta));
}

/**
 * Log-logistic PDF: f(t) = (beta/alpha)*(t/alpha)^(beta-1) / (1 + (t/alpha)^beta)^2
 */
function loglogisticPDF(t, alpha, beta) {
    if (t <= 0) return 0;
    const z = Math.pow(t / alpha, beta);
    return (beta / alpha) * Math.pow(t / alpha, beta - 1) / Math.pow(1 + z, 2);
}

/**
 * Log-logistic hazard: h(t) = f(t) / S(t)
 */
function loglogisticHazard(t, alpha, beta) {
    const s = loglogisticSurvival(t, alpha, beta);
    if (s <= 0) return 0;
    return loglogisticPDF(t, alpha, beta) / s;
}

// ─── Gamma distribution helpers (P1-9) ──────────────────────────────────────

/**
 * Log-gamma function (Lanczos approximation).
 */
function _logGamma(z) {
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - _logGamma(1 - z);
    }
    z -= 1;
    const g = 7;
    const coeff = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    let x = coeff[0];
    for (let i = 1; i < g + 2; i++) {
        x += coeff[i] / (z + i);
    }
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Lower regularized incomplete gamma function P(a, x) via series expansion.
 */
function _gammaCDF(a, x) {
    if (x < 0) return 0;
    if (x === 0) return 0;
    let sum = 0;
    let term = 1.0 / a;
    sum = term;
    for (let n = 1; n < 1000; n++) {
        term *= x / (a + n);
        sum += term;
        if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
    }
    const result = sum * Math.exp(-x + a * Math.log(x) - _logGamma(a));
    return Math.min(Math.max(result, 0), 1);
}

/**
 * Gamma survival: S(t) = 1 - P(shape, t/scale)
 */
function gammaSurvival(t, shape, scale) {
    if (t <= 0) return 1;
    return 1 - _gammaCDF(shape, t / scale);
}

/**
 * Gamma PDF: f(t) = t^(shape-1) * exp(-t/scale) / (scale^shape * Gamma(shape))
 */
function gammaPDF(t, shape, scale) {
    if (t <= 0) return 0;
    const logPdf = (shape - 1) * Math.log(t) - t / scale - shape * Math.log(scale) - _logGamma(shape);
    return Math.exp(logPdf);
}

/**
 * Gamma hazard: h(t) = f(t) / S(t)
 */
function gammaHazard(t, shape, scale) {
    const s = gammaSurvival(t, shape, scale);
    if (s <= 0) return 0;
    return gammaPDF(t, shape, scale) / s;
}

// ─── Distribution registry ──────────────────────────────────────────────────

const DISTRIBUTIONS = {
    weibull: {
        nParams: 2,
        paramNames: ['shape', 'scale'],
        initParams: [1.0, 10.0],
        survival: (t, params) => weibullSurvival(t, params[0], params[1]),
        pdf: (t, params) => weibullPDF(t, params[0], params[1]),
        hazard: (t, params) => weibullHazard(t, params[0], params[1]),
        cdf: (t, params) => 1 - weibullSurvival(t, params[0], params[1]),
        bounds: [[0.01, 20], [0.01, 1000]]
    },
    lognormal: {
        nParams: 2,
        paramNames: ['mu', 'sigma'],
        initParams: [2.0, 1.0],
        survival: (t, params) => lognormalSurvival(t, params[0], params[1]),
        pdf: (t, params) => lognormalPDF(t, params[0], params[1]),
        hazard: (t, params) => lognormalHazard(t, params[0], params[1]),
        cdf: (t, params) => 1 - lognormalSurvival(t, params[0], params[1]),
        bounds: [[-10, 10], [0.01, 20]]
    },
    loglogistic: {
        nParams: 2,
        paramNames: ['alpha', 'beta'],
        initParams: [10.0, 2.0],
        survival: (t, params) => loglogisticSurvival(t, params[0], params[1]),
        pdf: (t, params) => loglogisticPDF(t, params[0], params[1]),
        hazard: (t, params) => loglogisticHazard(t, params[0], params[1]),
        cdf: (t, params) => 1 - loglogisticSurvival(t, params[0], params[1]),
        bounds: [[0.01, 1000], [0.01, 20]]
    },
    gamma: {
        nParams: 2,
        paramNames: ['shape', 'scale'],
        initParams: [2.0, 5.0],
        survival: (t, params) => gammaSurvival(t, params[0], params[1]),
        pdf: (t, params) => gammaPDF(t, params[0], params[1]),
        hazard: (t, params) => gammaHazard(t, params[0], params[1]),
        cdf: (t, params) => 1 - gammaSurvival(t, params[0], params[1]),
        bounds: [[0.01, 50], [0.01, 1000]]
    }
};

// ─── CureModelEngine class ──────────────────────────────────────────────────

class CureModelEngine {
    constructor(options = {}) {
        this.options = {
            confLevel: options.confLevel ?? 0.95,
            ...options
        };
    }

    /**
     * Validate survival data.
     * @param {Array} data - [{time, event: 0|1}, ...]
     */
    _validateData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            if (d.time == null || typeof d.time !== 'number' || d.time < 0) {
                throw new Error(`Invalid time at index ${i}: must be a non-negative number`);
            }
            if (d.event !== 0 && d.event !== 1) {
                throw new Error(`Invalid event at index ${i}: must be 0 (censored) or 1 (event)`);
            }
        }
    }

    /**
     * Fit a mixture cure model using EM algorithm.
     *
     * S(t) = pi + (1 - pi) * S_u(t)
     * where pi = cure fraction, S_u(t) = uncured survival.
     *
     * @param {Array} data - [{time, event: 0|1}, ...]
     * @param {Object} options
     * @returns {Object} {cureFraction, uncuredParams, distribution, logLik, aic, bic, convergence, iterations}
     */
    mixtureCure(data, options = {}) {
        this._validateData(data);

        const {
            distribution = 'weibull',
            maxIter = 100,
            tol = 1e-6
        } = options;

        const dist = DISTRIBUTIONS[distribution];
        if (!dist) {
            throw new Error(`Unknown distribution: ${distribution}. Supported: ${Object.keys(DISTRIBUTIONS).join(', ')}`);
        }

        const n = data.length;
        const nEvents = data.filter(d => d.event === 1).length;

        if (nEvents === 0) {
            // All censored — all cured
            return {
                cureFraction: 1.0,
                uncuredParams: this._makeParamObj(dist, dist.initParams),
                distribution,
                logLik: 0,
                aic: 0,
                bic: 0,
                convergence: true,
                iterations: 0
            };
        }

        // Initialize cure fraction
        let pi = Math.max(0.01, Math.min(0.99, 1 - nEvents / n));

        // Initialize distribution parameters
        let params = [...dist.initParams];

        // Estimate initial parameters from observed event times
        const eventTimes = data.filter(d => d.event === 1).map(d => d.time).filter(t => t > 0);
        if (eventTimes.length >= 2) {
            const meanT = eventTimes.reduce((a, b) => a + b, 0) / eventTimes.length;
            const varT = eventTimes.reduce((a, b) => a + (b - meanT) ** 2, 0) / (eventTimes.length - 1);
            const sdT = Math.sqrt(Math.max(varT, 0.01));

            if (distribution === 'weibull') {
                params = [1.0, Math.max(0.1, meanT)];
            } else if (distribution === 'lognormal') {
                params = [Math.log(Math.max(0.1, meanT)), Math.max(0.1, sdT / meanT)];
            } else if (distribution === 'loglogistic') {
                params = [Math.max(0.1, meanT), 2.0];
            } else if (distribution === 'gamma') {
                // Method of moments: shape = (mean/sd)^2, scale = sd^2/mean
                const shapeInit = Math.max(0.1, (meanT / sdT) * (meanT / sdT));
                const scaleInit = Math.max(0.1, (sdT * sdT) / meanT);
                params = [shapeInit, scaleInit];
            }
        }

        let converged = false;
        let iterations = 0;
        let prevLogLik = -Infinity;

        for (let iter = 0; iter < maxIter; iter++) {
            iterations++;

            // ── E-step: compute posterior probability of being cured ──
            const w = new Array(n); // w[i] = P(uncured | data_i)
            for (let i = 0; i < n; i++) {
                const d = data[i];
                const t = d.time;

                if (d.event === 1) {
                    // Observed event → definitely uncured
                    w[i] = 1;
                } else {
                    // Censored: posterior P(uncured) using Bayes
                    const Su = dist.survival(t, params);
                    const numerator = (1 - pi) * Su;
                    const denominator = pi + numerator;
                    w[i] = denominator > 0 ? numerator / denominator : 0;
                }
            }

            // ── M-step: update pi and distribution parameters ──

            // Update cure fraction
            const sumW = w.reduce((a, b) => a + b, 0);
            pi = Math.max(0.001, Math.min(0.999, 1 - sumW / n));

            // Update distribution parameters using weighted MLE
            params = this._fitDistribution(data, w, distribution, params);

            // ── Compute log-likelihood ──
            let logLik = 0;
            for (let i = 0; i < n; i++) {
                const d = data[i];
                const t = d.time;

                if (d.event === 1) {
                    // f(t) = (1 - pi) * f_u(t)
                    const fu = dist.pdf(t, params);
                    const lik = (1 - pi) * fu;
                    logLik += Math.log(Math.max(lik, 1e-300));
                } else {
                    // S(t) = pi + (1 - pi) * S_u(t)
                    const Su = dist.survival(t, params);
                    const lik = pi + (1 - pi) * Su;
                    logLik += Math.log(Math.max(lik, 1e-300));
                }
            }

            // Check convergence
            if (Math.abs(logLik - prevLogLik) < tol) {
                converged = true;
                prevLogLik = logLik;
                break;
            }
            prevLogLik = logLik;
        }

        const nParams = dist.nParams + 1; // distribution params + pi
        const aic = -2 * prevLogLik + 2 * nParams;
        const bic = -2 * prevLogLik + Math.log(n) * nParams;

        return {
            cureFraction: pi,
            uncuredParams: this._makeParamObj(dist, params),
            distribution,
            logLik: prevLogLik,
            aic,
            bic,
            convergence: converged,
            iterations
        };
    }

    /**
     * Fit a non-mixture cure model (bounded cumulative hazard).
     *
     * S(t) = exp(-theta * F(t))
     * where F(t) = baseline CDF, cure fraction = exp(-theta).
     *
     * @param {Array} data - [{time, event: 0|1}, ...]
     * @param {Object} options
     * @returns {Object} {theta, cureFraction, baselineParams, logLik, aic, bic, convergence, iterations}
     */
    nonMixtureCure(data, options = {}) {
        this._validateData(data);

        const {
            distribution = 'weibull',
            maxIter = 100,
            tol = 1e-6
        } = options;

        const dist = DISTRIBUTIONS[distribution];
        if (!dist) {
            throw new Error(`Unknown distribution: ${distribution}. Supported: ${Object.keys(DISTRIBUTIONS).join(', ')}`);
        }

        const n = data.length;
        const nEvents = data.filter(d => d.event === 1).length;

        // Initialize theta from crude cure estimate
        const crudeCure = Math.max(0.01, 1 - nEvents / n);
        let theta = -Math.log(Math.max(crudeCure, 0.01));
        theta = Math.max(0.01, theta);

        // Initialize distribution parameters
        let params = [...dist.initParams];
        const eventTimes = data.filter(d => d.event === 1).map(d => d.time).filter(t => t > 0);
        if (eventTimes.length >= 2) {
            const meanT = eventTimes.reduce((a, b) => a + b, 0) / eventTimes.length;
            if (distribution === 'weibull') {
                params = [1.0, Math.max(0.1, meanT)];
            } else if (distribution === 'lognormal') {
                const sdT = Math.sqrt(eventTimes.reduce((a, b) => a + (b - meanT) ** 2, 0) / (eventTimes.length - 1));
                params = [Math.log(Math.max(0.1, meanT)), Math.max(0.1, sdT / meanT)];
            } else if (distribution === 'loglogistic') {
                params = [Math.max(0.1, meanT), 2.0];
            } else if (distribution === 'gamma') {
                const sdT = Math.sqrt(eventTimes.reduce((a, b) => a + (b - meanT) ** 2, 0) / (eventTimes.length - 1));
                const shapeInit = Math.max(0.1, (meanT / sdT) * (meanT / sdT));
                const scaleInit = Math.max(0.1, (sdT * sdT) / meanT);
                params = [shapeInit, scaleInit];
            }
        }

        let converged = false;
        let iterations = 0;
        let prevLogLik = -Infinity;

        for (let iter = 0; iter < maxIter; iter++) {
            iterations++;

            // Log-likelihood for non-mixture:
            // For event: log(theta * f(t) * exp(-theta * F(t)))
            // For censored: log(exp(-theta * F(t))) = -theta * F(t)
            let logLik = 0;
            let gradTheta = 0;
            let gradParams = new Array(dist.nParams).fill(0);

            for (let i = 0; i < n; i++) {
                const d = data[i];
                const t = d.time;
                const Ft = dist.cdf(t, params);
                const St = Math.exp(-theta * Ft);

                if (d.event === 1) {
                    const ft = dist.pdf(t, params);
                    const lik = theta * ft * St;
                    logLik += Math.log(Math.max(lik, 1e-300));
                    // Gradient w.r.t. theta
                    gradTheta += 1 / theta - Ft;
                } else {
                    logLik += -theta * Ft;
                    gradTheta += -Ft;
                }
            }

            // Update theta via gradient step
            const stepSize = 0.1;
            let newTheta = theta + stepSize * gradTheta;
            newTheta = Math.max(0.01, Math.min(50, newTheta));

            // Update distribution parameters using profile likelihood
            params = this._fitDistributionNonMixture(data, theta, distribution, params);

            theta = newTheta;

            // Recompute log-likelihood
            logLik = 0;
            for (let i = 0; i < n; i++) {
                const d = data[i];
                const t = d.time;
                const Ft = dist.cdf(t, params);
                const St = Math.exp(-theta * Ft);

                if (d.event === 1) {
                    const ft = dist.pdf(t, params);
                    logLik += Math.log(Math.max(theta * ft * St, 1e-300));
                } else {
                    logLik += -theta * Ft;
                }
            }

            if (Math.abs(logLik - prevLogLik) < tol) {
                converged = true;
                prevLogLik = logLik;
                break;
            }
            prevLogLik = logLik;
        }

        const nParamsTotal = dist.nParams + 1; // baseline params + theta
        const aic = -2 * prevLogLik + 2 * nParamsTotal;
        const bic = -2 * prevLogLik + Math.log(n) * nParamsTotal;

        return {
            theta,
            cureFraction: Math.exp(-theta),
            baselineParams: this._makeParamObj(dist, params),
            distribution,
            logLik: prevLogLik,
            aic,
            bic,
            convergence: converged,
            iterations
        };
    }

    /**
     * Predict survival at specified time points using a fitted model.
     *
     * @param {Object} model - Fitted model from mixtureCure() or nonMixtureCure()
     * @param {Array} times - Time points at which to predict
     * @returns {Array} [{time, survival, hazard, cured_prob}, ...]
     *
     * P1-10: If model.backgroundMortality is a function(t) returning the
     * background (all-cause) survival probability at time t, it is applied
     * to the cured group: S_cured(t) = pi * S_bg(t) instead of just pi.
     * Overall: S(t) = pi * S_bg(t) + (1-pi) * S_u(t) * S_bg(t)  (mixture)
     */
    predict(model, times) {
        if (!model) throw new Error('Model is required');
        if (!Array.isArray(times) || times.length === 0) {
            throw new Error('Times must be a non-empty array');
        }

        const dist = DISTRIBUTIONS[model.distribution];
        if (!dist) throw new Error(`Unknown distribution: ${model.distribution}`);

        const isMixture = model.cureFraction != null && model.uncuredParams != null;
        const isNonMixture = model.theta != null && model.baselineParams != null;

        if (!isMixture && !isNonMixture) {
            throw new Error('Model must be from mixtureCure() or nonMixtureCure()');
        }

        const hasBgMort = typeof model.backgroundMortality === 'function';
        const results = [];

        for (const t of times) {
            let survival, hazard, curedProb;
            const Sbg = hasBgMort ? Math.max(0, Math.min(1, model.backgroundMortality(t))) : 1;

            if (isMixture) {
                const pi = model.cureFraction;
                const params = this._getParamArray(dist, model.uncuredParams);
                const Su = dist.survival(t, params);
                const fu = dist.pdf(t, params);

                // P1-10: Apply background mortality to both cured and uncured groups
                survival = pi * Sbg + (1 - pi) * Su * Sbg;
                const fMix = (1 - pi) * fu * Sbg;
                hazard = survival > 0 ? fMix / survival : 0;
                // Add background hazard if present
                if (hasBgMort && Sbg > 0) {
                    // Approximate background hazard from Sbg
                    // h_bg(t) is implicit; the total hazard already includes it via fMix/S
                }

                // Posterior probability of being cured at time t (given survived to t)
                curedProb = survival > 0 ? (pi * Sbg) / survival : 1;
            } else {
                const theta = model.theta;
                const params = this._getParamArray(dist, model.baselineParams);
                const Ft = dist.cdf(t, params);
                const ft = dist.pdf(t, params);

                // P1-10: Apply background mortality
                survival = Math.exp(-theta * Ft) * Sbg;
                hazard = theta * ft;
                // Add background hazard contribution if present
                if (hasBgMort && Sbg > 0) {
                    // Background hazard is implicitly captured via Sbg multiplication
                }
                const rawCuredProb = survival > 0 ? (Math.exp(-theta) * Sbg) / survival : Math.exp(-theta);
                curedProb = Math.min(1, Math.max(0, rawCuredProb));
            }

            results.push({
                time: t,
                survival: Math.max(0, Math.min(1, survival)),
                hazard: Math.max(0, hazard),
                cured_prob: Math.min(1, Math.max(0, curedProb))
            });
        }

        return results;
    }

    /**
     * Extrapolate survival to a long-term horizon.
     *
     * @param {Object} model - Fitted model
     * @param {number} horizon - Horizon in time units
     * @param {number} step - Step size (default 0.1)
     * @returns {Array} [{time, survival, hazard, cured_prob}, ...]
     */
    extrapolate(model, horizon, step = 0.1) {
        if (!model) throw new Error('Model is required');
        if (horizon <= 0) throw new Error('Horizon must be positive');

        // P1-4: Guard against unbounded array from very small step
        var maxPoints = 100000;
        var numPoints = Math.ceil(horizon / step) + 1;
        if (numPoints > maxPoints) {
            step = horizon / (maxPoints - 1);
            numPoints = maxPoints;
        }

        const times = [];
        for (let t = 0; t <= horizon; t = Math.round((t + step) * 1000) / 1000) {
            times.push(t);
        }
        // Ensure horizon is included
        if (times[times.length - 1] < horizon) {
            times.push(horizon);
        }

        return this.predict(model, times);
    }

    /**
     * Compare fit across multiple distributions using AIC/BIC.
     *
     * @param {Array} data - [{time, event: 0|1}, ...]
     * @param {Array} distributions - e.g. ['weibull', 'lognormal', 'loglogistic']
     * @param {Object} options
     * @returns {Array} [{distribution, cureFraction, logLik, aic, bic, convergence}, ...]
     */
    compareFit(data, distributions, options = {}) {
        if (!Array.isArray(distributions) || distributions.length === 0) {
            distributions = Object.keys(DISTRIBUTIONS);
        }

        const results = [];
        for (const distName of distributions) {
            try {
                const fit = this.mixtureCure(data, { ...options, distribution: distName });
                results.push({
                    distribution: distName,
                    cureFraction: fit.cureFraction,
                    logLik: fit.logLik,
                    aic: fit.aic,
                    bic: fit.bic,
                    convergence: fit.convergence,
                    iterations: fit.iterations
                });
            } catch (err) {
                results.push({
                    distribution: distName,
                    error: err.message
                });
            }
        }

        // Sort by AIC (lower is better)
        results.sort((a, b) => {
            if (a.error && !b.error) return 1;
            if (!a.error && b.error) return -1;
            if (a.error && b.error) return 0;
            return a.aic - b.aic;
        });

        return results;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    /**
     * Fit distribution parameters via weighted MLE for the mixture cure EM M-step.
     * P2-12: Uses adaptive step size with Armijo backtracking line search.
     */
    _fitDistribution(data, weights, distributionName, initParams) {
        const dist = DISTRIBUTIONS[distributionName];
        let params = [...initParams];

        const maxInnerIter = 20;
        const initialStepSize = 0.1;
        const armijoBeta = 0.5;    // step shrink factor
        const armijoC = 1e-4;      // sufficient decrease parameter
        const maxBacktrack = 8;

        for (let iter = 0; iter < maxInnerIter; iter++) {
            // Compute gradient numerically
            const eps = 1e-5;
            const grad = new Array(dist.nParams).fill(0);

            const ll0 = this._weightedLogLik(data, weights, dist, params);

            for (let p = 0; p < dist.nParams; p++) {
                const paramsPlus = [...params];
                paramsPlus[p] += eps;
                const llPlus = this._weightedLogLik(data, weights, dist, paramsPlus);
                grad[p] = (llPlus - ll0) / eps;
            }

            // Gradient norm for convergence check
            let gradNorm = 0;
            for (let p = 0; p < dist.nParams; p++) {
                gradNorm += grad[p] * grad[p];
            }
            if (gradNorm < 1e-16) break;

            // Armijo backtracking line search for adaptive step size
            let stepSize = initialStepSize;
            const gradDotGrad = gradNorm; // ||grad||^2

            for (let bt = 0; bt < maxBacktrack; bt++) {
                const candidate = [...params];
                for (let p = 0; p < dist.nParams; p++) {
                    const step = stepSize * grad[p];
                    const clampedStep = Math.max(-1, Math.min(1, step));
                    candidate[p] += clampedStep;
                    candidate[p] = Math.max(dist.bounds[p][0], Math.min(dist.bounds[p][1], candidate[p]));
                }
                const llCandidate = this._weightedLogLik(data, weights, dist, candidate);
                // Armijo condition: f(x + alpha*g) >= f(x) + c * alpha * ||g||^2
                if (llCandidate >= ll0 + armijoC * stepSize * gradDotGrad) {
                    params = candidate;
                    break;
                }
                stepSize *= armijoBeta;
                if (bt === maxBacktrack - 1) {
                    // Accept smallest step if no improvement found
                    params = candidate;
                }
            }
        }

        return params;
    }

    /**
     * Fit distribution parameters for non-mixture cure model.
     */
    _fitDistributionNonMixture(data, theta, distributionName, initParams) {
        const dist = DISTRIBUTIONS[distributionName];
        let params = [...initParams];

        const maxInnerIter = 20;
        const stepSize = 0.05;

        for (let iter = 0; iter < maxInnerIter; iter++) {
            const eps = 1e-5;
            const grad = new Array(dist.nParams).fill(0);

            const ll0 = this._nonMixtureLogLik(data, theta, dist, params);

            for (let p = 0; p < dist.nParams; p++) {
                const paramsPlus = [...params];
                paramsPlus[p] += eps;
                const llPlus = this._nonMixtureLogLik(data, theta, dist, paramsPlus);
                grad[p] = (llPlus - ll0) / eps;
            }

            let maxStep = 0;
            for (let p = 0; p < dist.nParams; p++) {
                const step = stepSize * grad[p];
                const clampedStep = Math.max(-1, Math.min(1, step));
                params[p] += clampedStep;
                params[p] = Math.max(dist.bounds[p][0], Math.min(dist.bounds[p][1], params[p]));
                maxStep = Math.max(maxStep, Math.abs(clampedStep));
            }

            if (maxStep < 1e-8) break;
        }

        return params;
    }

    /**
     * Weighted log-likelihood for mixture cure EM.
     */
    _weightedLogLik(data, weights, dist, params) {
        let ll = 0;
        for (let i = 0; i < data.length; i++) {
            const t = data[i].time;
            const w = weights[i];
            if (w <= 0) continue;

            if (data[i].event === 1) {
                const f = dist.pdf(t, params);
                ll += w * Math.log(Math.max(f, 1e-300));
            } else {
                const S = dist.survival(t, params);
                ll += w * Math.log(Math.max(S, 1e-300));
            }
        }
        return ll;
    }

    /**
     * Log-likelihood for non-mixture cure model.
     */
    _nonMixtureLogLik(data, theta, dist, params) {
        let ll = 0;
        for (let i = 0; i < data.length; i++) {
            const t = data[i].time;
            const Ft = dist.cdf(t, params);

            if (data[i].event === 1) {
                const ft = dist.pdf(t, params);
                ll += Math.log(Math.max(theta * ft * Math.exp(-theta * Ft), 1e-300));
            } else {
                ll += -theta * Ft;
            }
        }
        return ll;
    }

    /**
     * Create a named parameter object from a distribution and parameter array.
     */
    _makeParamObj(dist, params) {
        const obj = {};
        for (let i = 0; i < dist.nParams; i++) {
            obj[dist.paramNames[i]] = params[i];
        }
        return obj;
    }

    /**
     * Extract parameter array from a named parameter object.
     */
    _getParamArray(dist, paramObj) {
        return dist.paramNames.map(name => paramObj[name]);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.CureModelEngine = CureModelEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CureModelEngine,
        DISTRIBUTIONS,
        weibullSurvival,
        lognormalSurvival,
        loglogisticSurvival,
        weibullPDF,
        lognormalPDF,
        loglogisticPDF,
        weibullHazard,
        lognormalHazard,
        loglogisticHazard,
        gammaSurvival,
        gammaPDF,
        gammaHazard,
        normalCDF
    };
}
