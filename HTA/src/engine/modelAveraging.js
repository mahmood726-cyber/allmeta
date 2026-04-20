/**
 * Model Averaging Engine
 * Bayesian Model Averaging for structural uncertainty in HTA models.
 *
 * Features:
 * - BIC/AIC/DIC-based posterior model weights
 * - Weighted model averaging with uncertainty
 * - Parametric survival distribution fitting (MLE via Newton-Raphson)
 * - Model-averaged survival predictions
 */

var OmanGuidanceRef = (function resolveOmanGuidance() {
    if (typeof globalThis !== 'undefined' && globalThis.OmanHTAGuidance) {
        return globalThis.OmanHTAGuidance;
    }
    if (typeof require === 'function') {
        try {
            return require('../utils/omanGuidance');
        } catch (err) {
            return null;
        }
    }
    return null;
})();

// ============ NAMED CONSTANTS ============
const NR_MAX_ITER = 200;
const NR_TOLERANCE = 1e-8;
const NR_STEP_SHRINK = 0.5;
const NORMAL_Z_975 = 1.959964;

class ModelAveragingEngine {
    constructor(options = {}) {
        this.options = options;
    }

    /**
     * Compute information-criterion weights from an array of IC values.
     * Generic helper used by bicWeights, aicWeights, dicWeights.
     *
     * @param {Object[]} models - [{name, ic}, ...] where ic = BIC/AIC/DIC
     * @param {string} icField - field name for the IC value
     * @returns {Object[]} [{name, ic, deltaIC, weight}, ...]
     */
    _icWeights(models, icField) {
        if (!models || models.length === 0) return [];

        const icValues = models.map(m => m[icField]);
        const minIC = Math.min(...icValues);

        const deltas = icValues.map(v => v - minIC);
        const rawWeights = deltas.map(d => Math.exp(-0.5 * d));
        const sumWeights = rawWeights.reduce((a, b) => a + b, 0);

        return models.map((m, i) => ({
            name: m.name,
            [icField]: m[icField],
            [`delta${icField.toUpperCase()}`]: deltas[i],
            weight: sumWeights > 0 ? rawWeights[i] / sumWeights : 1 / models.length
        }));
    }

    /**
     * Compute posterior model weights from BIC values.
     * Weight_i = exp(-0.5 * deltaBIC_i) / sum(exp(-0.5 * deltaBIC_j))
     *
     * @param {Object[]} models - [{name, bic}, ...]
     * @returns {Object[]} [{name, bic, deltaBIC, weight}, ...]
     */
    bicWeights(models) {
        return this._icWeights(models, 'bic');
    }

    /**
     * Compute posterior model weights from AIC values.
     *
     * @param {Object[]} models - [{name, aic}, ...]
     * @returns {Object[]} [{name, aic, deltaAIC, weight}, ...]
     */
    aicWeights(models) {
        return this._icWeights(models, 'aic');
    }

    /**
     * Compute posterior model weights from DIC values.
     *
     * @param {Object[]} models - [{name, dic}, ...]
     * @returns {Object[]} [{name, dic, deltaDIC, weight}, ...]
     */
    dicWeights(models) {
        return this._icWeights(models, 'dic');
    }

    /**
     * Model-averaged predictions: weighted combination of model outputs.
     * Uses Hoeting et al. (1999) total variance:
     *   Var_total = sum_k w_k * (sigma_k^2 + (mu_k - mu_bar)^2)
     * where sigma_k^2 is within-model variance and mu_k is the model prediction.
     *
     * @param {Object[]} models - [{name, predictions: [y1, y2, ...], weight, variance?: [v1, v2, ...]}]
     *   If variance is provided, it is used as within-model variance per time point.
     *   If omitted, falls back to between-model variance only (backwards compatible).
     * @returns {Object} {averaged, uncertainty, credibleInterval}
     */
    modelAverage(models) {
        if (!models || models.length === 0) {
            return { averaged: [], uncertainty: [], credibleInterval: [] };
        }

        const nPred = models[0].predictions.length;
        const averaged = new Array(nPred).fill(0);
        const totalVariance = new Array(nPred).fill(0);

        // Weighted mean
        let totalWeight = 0;
        for (const m of models) {
            totalWeight += m.weight;
        }

        for (const m of models) {
            const w = totalWeight > 0 ? m.weight / totalWeight : 1 / models.length;
            for (let j = 0; j < nPred; j++) {
                averaged[j] += w * m.predictions[j];
            }
        }

        // Total variance = within-model + between-model (Hoeting et al. 1999)
        for (const m of models) {
            const w = totalWeight > 0 ? m.weight / totalWeight : 1 / models.length;
            for (let j = 0; j < nPred; j++) {
                const diff = m.predictions[j] - averaged[j];
                const betweenVar = diff * diff;
                const withinVar = (m.variance && m.variance[j] != null) ? m.variance[j] : 0;
                totalVariance[j] += w * (withinVar + betweenVar);
            }
        }

        // Convert variance to SD
        const uncertainty = new Array(nPred);
        for (let j = 0; j < nPred; j++) {
            uncertainty[j] = Math.sqrt(totalVariance[j]);
        }

        // 95% credible interval using normal approximation
        const credibleInterval = averaged.map((avg, j) => ({
            lower: avg - NORMAL_Z_975 * uncertainty[j],
            upper: avg + NORMAL_Z_975 * uncertainty[j]
        }));

        return { averaged, uncertainty, credibleInterval };
    }

    // ========================================================================
    // Parametric survival distribution fitting (MLE)
    // ========================================================================

    /**
     * Fit parametric distributions to survival data and return comparison table.
     *
     * @param {Object[]} data - [{time, event}, ...] where event = 1 (failed) or 0 (censored)
     * @param {string[]} distributions - e.g. ['weibull', 'lognormal', 'loglogistic', 'exponential']
     * @returns {Object[]} [{name, params, logLik, aic, bic, weight}, ...]
     */
    fitCompare(data, distributions) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        for (var d of data) {
            if (typeof d.time !== 'number' || d.time < 0) {
                throw new Error('All times must be non-negative numbers');
            }
            if (d.event !== 0 && d.event !== 1) {
                throw new Error('Event must be 0 or 1');
            }
        }

        const results = [];
        const n = data.length;

        for (const dist of distributions) {
            try {
                const fit = this._fitDistribution(data, dist);
                const nParams = Object.keys(fit.params).length;
                const aic = -2 * fit.logLik + 2 * nParams;
                const bic = -2 * fit.logLik + nParams * Math.log(n);

                results.push({
                    name: dist,
                    params: fit.params,
                    logLik: fit.logLik,
                    aic,
                    bic,
                    weight: 0  // will be computed below
                });
            } catch (e) {
                // Skip failed fits
                results.push({
                    name: dist,
                    params: null,
                    logLik: -Infinity,
                    aic: Infinity,
                    bic: Infinity,
                    weight: 0,
                    error: e.message
                });
            }
        }

        // Compute AIC weights (P2-3: also compute BIC weights per NICE TSD recommendation)
        const validResults = results.filter(r => isFinite(r.aic));
        if (validResults.length > 0) {
            const minAIC = Math.min(...validResults.map(r => r.aic));
            const rawWeightsAIC = validResults.map(r => Math.exp(-0.5 * (r.aic - minAIC)));
            const sumAIC = rawWeightsAIC.reduce((a, b) => a + b, 0);
            for (let i = 0; i < validResults.length; i++) {
                validResults[i].weight = sumAIC > 0 ? rawWeightsAIC[i] / sumAIC : 1 / validResults.length;
            }
        }

        // Compute BIC weights
        const validBIC = results.filter(r => isFinite(r.bic));
        if (validBIC.length > 0) {
            const minBIC = Math.min(...validBIC.map(r => r.bic));
            const rawWeightsBIC = validBIC.map(r => Math.exp(-0.5 * (r.bic - minBIC)));
            const sumBIC = rawWeightsBIC.reduce((a, b) => a + b, 0);
            for (let i = 0; i < validBIC.length; i++) {
                validBIC[i].bicWeight = sumBIC > 0 ? rawWeightsBIC[i] / sumBIC : 1 / validBIC.length;
            }
        }
        // Ensure all results have bicWeight (failed fits get 0)
        for (const r of results) {
            if (r.bicWeight == null) r.bicWeight = 0;
        }

        return results;
    }

    /**
     * Fit a single distribution to survival data via MLE.
     */
    _fitDistribution(data, dist) {
        switch (dist) {
            case 'exponential': return this._fitExponential(data);
            case 'weibull': return this._fitWeibull(data);
            case 'lognormal': return this._fitLognormal(data);
            case 'loglogistic': return this._fitLoglogistic(data);
            case 'gamma': return this._fitGamma(data);
            case 'gompertz': return this._fitGompertz(data);
            default: throw new Error(`Unknown distribution: ${dist}`);
        }
    }

    /**
     * Exponential distribution MLE. S(t) = exp(-lambda * t)
     * Closed-form: lambda = sum(event) / sum(time)
     */
    _fitExponential(data) {
        const totalEvents = data.reduce((s, d) => s + d.event, 0);
        const totalTime = data.reduce((s, d) => s + d.time, 0);

        if (totalTime <= 0) {
            return { params: { lambda: NaN }, logLik: -Infinity, aic: Infinity, bic: Infinity, converged: false };
        }

        const lambda = totalEvents / totalTime;

        // Log-likelihood: sum[ event*log(lambda) - lambda*t ]
        let logLik = 0;
        for (const d of data) {
            logLik += d.event * Math.log(lambda) - lambda * d.time;
        }

        return { params: { lambda }, logLik };
    }

    /**
     * Weibull distribution MLE. S(t) = exp(-(t/scale)^shape)
     * h(t) = (shape/scale) * (t/scale)^(shape-1)
     * Newton-Raphson on (log_shape, log_scale) for positivity.
     */
    _fitWeibull(data) {
        // Initial estimates
        const totalEvents = data.reduce((s, d) => s + d.event, 0);
        const totalTime = data.reduce((s, d) => s + d.time, 0);
        const meanTime = totalTime / data.length;
        let shape = 1.0;
        let scale = meanTime;

        // Newton-Raphson on log-parameterization
        let logShape = Math.log(shape);
        let logScale = Math.log(scale);

        for (let iter = 0; iter < NR_MAX_ITER; iter++) {
            shape = Math.exp(logShape);
            scale = Math.exp(logScale);

            let dll_dshape = 0, dll_dscale = 0;
            let d2ll_dshape2 = 0, d2ll_dscale2 = 0, d2ll_dshapescale = 0;

            for (const d of data) {
                const t = d.time;
                const e = d.event;
                if (t <= 0) continue;

                const logT = Math.log(t);
                const z = t / scale;
                const zk = Math.pow(z, shape);
                const logZ = logT - logScale;

                dll_dshape += e * (1 / shape + logZ) - zk * logZ;
                dll_dscale += (-e * shape / scale) + shape * zk / scale;

                d2ll_dshape2 += -e / (shape * shape) - zk * logZ * logZ;
                d2ll_dscale2 += e * shape / (scale * scale) - shape * (shape + 1) * zk / (scale * scale);
                d2ll_dshapescale += -e / scale + zk * (1 + shape * logZ) / scale;
            }

            // Chain rule for log-parameterization: gradients
            const gShape = dll_dshape * shape;
            const gScale = dll_dscale * scale;

            const norm = Math.abs(gShape) + Math.abs(gScale);
            if (norm < NR_TOLERANCE) break;

            // Hessian in log-parameterization (approximate using original Hessian + chain rule)
            const H11 = d2ll_dshape2 * shape * shape + dll_dshape * shape;
            const H22 = d2ll_dscale2 * scale * scale + dll_dscale * scale;
            const H12 = d2ll_dshapescale * shape * scale;

            // Newton-Raphson: step = -H_inv * g
            const det = H11 * H22 - H12 * H12;
            if (Math.abs(det) > 1e-20) {
                var dLogShape = -(H22 * gShape - H12 * gScale) / det;
                var dLogScale = -(-H12 * gShape + H11 * gScale) / det;
                // Dampen if step too large
                var maxStep = Math.max(Math.abs(dLogShape), Math.abs(dLogScale));
                if (maxStep > 2) { var damping = 2 / maxStep; dLogShape *= damping; dLogScale *= damping; }
                logShape += dLogShape;
                logScale += dLogScale;
            } else {
                // Fallback to gradient ascent
                logShape += 0.01 * gShape / (Math.abs(gShape) + 1);
                logScale += 0.01 * gScale / (Math.abs(gScale) + 1);
            }

            // Clamp for numerical stability
            logShape = Math.max(-5, Math.min(5, logShape));
            logScale = Math.max(-10, Math.min(20, logScale));
        }

        shape = Math.exp(logShape);
        scale = Math.exp(logScale);

        // Compute log-likelihood
        let logLik = 0;
        for (const d of data) {
            if (d.time <= 0) continue;
            const z = d.time / scale;
            const zk = Math.pow(z, shape);
            logLik += d.event * (Math.log(shape) - Math.log(scale) + (shape - 1) * Math.log(z)) - zk;
        }

        return { params: { shape, scale }, logLik };
    }

    /**
     * Lognormal distribution MLE. log(T) ~ N(mu, sigma^2)
     * Closed-form for uncensored; iterative with censoring.
     */
    _fitLognormal(data) {
        // For simplicity, use closed-form on uncensored observations
        // and EM-style adjustment for censored
        const logTimes = data.filter(d => d.time > 0).map(d => ({
            logT: Math.log(d.time),
            event: d.event
        }));

        const events = logTimes.filter(d => d.event === 1);
        if (events.length === 0) {
            return { params: { mu: 0, sigma: 1 }, logLik: -Infinity };
        }

        // Initial: MLE from uncensored only
        let mu = events.reduce((s, d) => s + d.logT, 0) / events.length;
        let sigma2 = events.reduce((s, d) => s + (d.logT - mu) ** 2, 0) / events.length;
        let sigma = Math.sqrt(Math.max(sigma2, 0.01));

        // Refine with censored data using gradient ascent
        for (let iter = 0; iter < NR_MAX_ITER; iter++) {
            let g_mu = 0, g_sigma = 0;

            for (const d of logTimes) {
                const z = (d.logT - mu) / sigma;
                if (d.event === 1) {
                    g_mu += z / sigma;
                    g_sigma += (z * z - 1) / sigma;
                } else {
                    // Censored: contribution from survival function
                    const phi = this._normalPDF(z);
                    const Phi = this._normalCDF(z);
                    const survProb = 1 - Phi;
                    if (survProb > 1e-15) {
                        const ratio = phi / survProb;
                        g_mu += -ratio / sigma;
                        g_sigma += -ratio * z / sigma;
                    }
                }
            }

            const norm = Math.abs(g_mu) + Math.abs(g_sigma);
            if (norm < NR_TOLERANCE) break;

            const step = 0.01;
            mu += step * g_mu;
            sigma += step * g_sigma;
            sigma = Math.max(sigma, 0.01);
        }

        // Log-likelihood
        let logLik = 0;
        for (const d of logTimes) {
            const z = (d.logT - mu) / sigma;
            if (d.event === 1) {
                logLik += -0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - d.logT - 0.5 * z * z;
            } else {
                const survProb = 1 - this._normalCDF(z);
                logLik += Math.log(Math.max(survProb, 1e-300));
            }
        }

        return { params: { mu, sigma }, logLik };
    }

    /**
     * Log-logistic distribution MLE. S(t) = 1 / (1 + (t/alpha)^beta)
     */
    _fitLoglogistic(data) {
        const events = data.filter(d => d.event === 1 && d.time > 0);
        if (events.length === 0) {
            return { params: { alpha: 1, beta: 1 }, logLik: -Infinity };
        }

        // Initial estimates from log-logistic relationship
        const logTimes = events.map(d => Math.log(d.time));
        const meanLogT = logTimes.reduce((a, b) => a + b, 0) / logTimes.length;
        let alpha = Math.exp(meanLogT);
        let beta = 1.0;

        let logAlpha = Math.log(alpha);
        let logBeta = Math.log(beta);

        for (let iter = 0; iter < NR_MAX_ITER; iter++) {
            alpha = Math.exp(logAlpha);
            beta = Math.exp(logBeta);

            let g_alpha = 0, g_beta = 0;

            for (const d of data) {
                if (d.time <= 0) continue;
                const z = Math.pow(d.time / alpha, beta);
                const logZ = beta * (Math.log(d.time) - logAlpha);

                if (d.event === 1) {
                    // f(t) = (beta/alpha)(t/alpha)^(beta-1) / (1+(t/alpha)^beta)^2
                    g_alpha += -beta / alpha + 2 * beta * z / (alpha * (1 + z));
                    g_beta += 1 / beta + Math.log(d.time / alpha) - 2 * z * Math.log(d.time / alpha) / (1 + z);
                } else {
                    // S(t) = 1/(1+z)
                    g_alpha += beta * z / (alpha * (1 + z));
                    g_beta += -z * Math.log(d.time / alpha) / (1 + z);
                }
            }

            // Gradients in log-parameterization
            const gAlpha = g_alpha * alpha;
            const gBeta = g_beta * beta;

            const norm = Math.abs(gAlpha) + Math.abs(gBeta);
            if (norm < NR_TOLERANCE) break;

            // Compute Hessian elements via numerical approximation
            // Use finite differences on the log-parameter gradients
            const eps = 1e-5;
            // Perturb logAlpha
            var alphaP = Math.exp(logAlpha + eps), betaP = beta;
            var g_alpha_p = 0, g_beta_p = 0;
            for (const d2 of data) {
                if (d2.time <= 0) continue;
                const z2 = Math.pow(d2.time / alphaP, betaP);
                if (d2.event === 1) {
                    g_alpha_p += -betaP / alphaP + 2 * betaP * z2 / (alphaP * (1 + z2));
                    g_beta_p += 1 / betaP + Math.log(d2.time / alphaP) - 2 * z2 * Math.log(d2.time / alphaP) / (1 + z2);
                } else {
                    g_alpha_p += betaP * z2 / (alphaP * (1 + z2));
                    g_beta_p += -z2 * Math.log(d2.time / alphaP) / (1 + z2);
                }
            }
            var gAlphaP = g_alpha_p * alphaP;
            var gBetaP = g_beta_p * betaP;
            var H11 = (gAlphaP - gAlpha) / eps;
            var H12_a = (gBetaP - gBeta) / eps;

            // Perturb logBeta
            alphaP = alpha; betaP = Math.exp(logBeta + eps);
            g_alpha_p = 0; g_beta_p = 0;
            for (const d2 of data) {
                if (d2.time <= 0) continue;
                const z2 = Math.pow(d2.time / alphaP, betaP);
                if (d2.event === 1) {
                    g_alpha_p += -betaP / alphaP + 2 * betaP * z2 / (alphaP * (1 + z2));
                    g_beta_p += 1 / betaP + Math.log(d2.time / alphaP) - 2 * z2 * Math.log(d2.time / alphaP) / (1 + z2);
                } else {
                    g_alpha_p += betaP * z2 / (alphaP * (1 + z2));
                    g_beta_p += -z2 * Math.log(d2.time / alphaP) / (1 + z2);
                }
            }
            gAlphaP = g_alpha_p * alphaP;
            gBetaP = g_beta_p * betaP;
            var H12_b = (gAlphaP - gAlpha) / eps;
            var H22 = (gBetaP - gBeta) / eps;
            var H12 = 0.5 * (H12_a + H12_b);

            // Newton-Raphson step
            var det = H11 * H22 - H12 * H12;
            if (Math.abs(det) > 1e-20) {
                var dLogAlpha = -(H22 * gAlpha - H12 * gBeta) / det;
                var dLogBeta = -(-H12 * gAlpha + H11 * gBeta) / det;
                var maxStep = Math.max(Math.abs(dLogAlpha), Math.abs(dLogBeta));
                if (maxStep > 2) { var damping = 2 / maxStep; dLogAlpha *= damping; dLogBeta *= damping; }
                logAlpha += dLogAlpha;
                logBeta += dLogBeta;
            } else {
                // Fallback to gradient ascent
                logAlpha += 0.01 * gAlpha / (Math.abs(gAlpha) + 1);
                logBeta += 0.01 * gBeta / (Math.abs(gBeta) + 1);
            }

            logAlpha = Math.max(-10, Math.min(20, logAlpha));
            logBeta = Math.max(-5, Math.min(5, logBeta));
        }

        alpha = Math.exp(logAlpha);
        beta = Math.exp(logBeta);

        // Log-likelihood
        let logLik = 0;
        for (const d of data) {
            if (d.time <= 0) continue;
            const z = Math.pow(d.time / alpha, beta);
            if (d.event === 1) {
                logLik += Math.log(beta) - Math.log(alpha) + (beta - 1) * Math.log(d.time / alpha)
                          - 2 * Math.log(1 + z);
            } else {
                logLik += -Math.log(1 + z);
            }
        }

        return { params: { alpha, beta }, logLik };
    }

    /**
     * Gamma distribution MLE. f(t) = (lambda^k / Gamma(k)) * t^(k-1) * exp(-lambda*t)
     * Uses method of moments for initial values + gradient ascent.
     */
    _fitGamma(data) {
        const events = data.filter(d => d.event === 1 && d.time > 0);
        if (events.length === 0) {
            return { params: { shape: 1, rate: 1 }, logLik: -Infinity };
        }

        const times = events.map(d => d.time);
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length;

        let shape = variance > 0 ? (mean * mean) / variance : 1;
        let rate = variance > 0 ? mean / variance : 1;

        // Gradient ascent on (log_shape, log_rate)
        let logShape = Math.log(Math.max(shape, 0.01));
        let logRate = Math.log(Math.max(rate, 0.01));

        for (let iter = 0; iter < NR_MAX_ITER; iter++) {
            shape = Math.exp(logShape);
            rate = Math.exp(logRate);

            let g_shape = 0, g_rate = 0;

            for (const d of data) {
                if (d.time <= 0) continue;
                if (d.event === 1) {
                    g_shape += Math.log(rate) + Math.log(d.time) - this._digamma(shape);
                    g_rate += shape / rate - d.time;
                } else {
                    // Censored: use survival function gradient (approximate)
                    const gammaVal = this._upperIncompleteGammaRatio(shape, rate * d.time);
                    if (gammaVal > 1e-15) {
                        // Simplified gradient for censored observations
                        g_rate += -d.time * Math.exp(-rate * d.time) * Math.pow(rate * d.time, shape - 1)
                                  / (this._gammaFn(shape) * gammaVal);
                    }
                }
            }

            // Gradients in log-parameterization
            const gShape = g_shape * shape;
            const gRate = g_rate * rate;

            const norm = Math.abs(gShape) + Math.abs(gRate);
            if (norm < NR_TOLERANCE) break;

            // Numerical Hessian via finite differences on log-parameter gradients
            const eps = 1e-5;

            // Perturb logShape
            var shapeP = Math.exp(logShape + eps), rateP = rate;
            var gs_p = 0, gr_p = 0;
            for (const d2 of data) {
                if (d2.time <= 0) continue;
                if (d2.event === 1) {
                    gs_p += Math.log(rateP) + Math.log(d2.time) - this._digamma(shapeP);
                    gr_p += shapeP / rateP - d2.time;
                } else {
                    const gv = this._upperIncompleteGammaRatio(shapeP, rateP * d2.time);
                    if (gv > 1e-15) {
                        gr_p += -d2.time * Math.exp(-rateP * d2.time) * Math.pow(rateP * d2.time, shapeP - 1)
                                / (this._gammaFn(shapeP) * gv);
                    }
                }
            }
            var gShapeP = gs_p * shapeP;
            var gRateP = gr_p * rateP;
            var H11 = (gShapeP - gShape) / eps;
            var H12_a = (gRateP - gRate) / eps;

            // Perturb logRate
            shapeP = shape; rateP = Math.exp(logRate + eps);
            gs_p = 0; gr_p = 0;
            for (const d2 of data) {
                if (d2.time <= 0) continue;
                if (d2.event === 1) {
                    gs_p += Math.log(rateP) + Math.log(d2.time) - this._digamma(shapeP);
                    gr_p += shapeP / rateP - d2.time;
                } else {
                    const gv = this._upperIncompleteGammaRatio(shapeP, rateP * d2.time);
                    if (gv > 1e-15) {
                        gr_p += -d2.time * Math.exp(-rateP * d2.time) * Math.pow(rateP * d2.time, shapeP - 1)
                                / (this._gammaFn(shapeP) * gv);
                    }
                }
            }
            gShapeP = gs_p * shapeP;
            gRateP = gr_p * rateP;
            var H12_b = (gShapeP - gShape) / eps;
            var H22 = (gRateP - gRate) / eps;
            var H12 = 0.5 * (H12_a + H12_b);

            // Newton-Raphson step
            var det = H11 * H22 - H12 * H12;
            if (Math.abs(det) > 1e-20) {
                var dLogShape = -(H22 * gShape - H12 * gRate) / det;
                var dLogRate = -(-H12 * gShape + H11 * gRate) / det;
                var maxStep = Math.max(Math.abs(dLogShape), Math.abs(dLogRate));
                if (maxStep > 2) { var damping = 2 / maxStep; dLogShape *= damping; dLogRate *= damping; }
                logShape += dLogShape;
                logRate += dLogRate;
            } else {
                // Fallback to gradient ascent
                logShape += 0.005 * gShape / (Math.abs(gShape) + 1);
                logRate += 0.005 * gRate / (Math.abs(gRate) + 1);
            }

            logShape = Math.max(-5, Math.min(10, logShape));
            logRate = Math.max(-10, Math.min(10, logRate));
        }

        shape = Math.exp(logShape);
        rate = Math.exp(logRate);

        // Log-likelihood
        let logLik = 0;
        for (const d of data) {
            if (d.time <= 0) continue;
            if (d.event === 1) {
                logLik += shape * Math.log(rate) - this._logGamma(shape)
                          + (shape - 1) * Math.log(d.time) - rate * d.time;
            } else {
                const gammaRatio = this._upperIncompleteGammaRatio(shape, rate * d.time);
                logLik += Math.log(Math.max(gammaRatio, 1e-300));
            }
        }

        return { params: { shape, rate }, logLik };
    }

    /**
     * Gompertz distribution MLE. h(t) = b * exp(eta * t)
     * S(t) = exp(-cumHaz(t))
     * cumHaz(t):
     *   |eta| >= 1e-10: (b/eta)*(exp(eta*t) - 1)
     *   |eta| < 1e-10:  b*t + 0.5*b*eta*t^2  (Taylor expansion)
     * eta < 0 is clinically valid (decreasing hazard in HTA).
     */
    _fitGompertz(data) {
        const events = data.filter(d => d.event === 1 && d.time > 0);
        if (events.length === 0) {
            return { params: { b: 0.01, eta: 0.01 }, logLik: -Infinity };
        }

        let b = 0.01;
        let eta = 0.01;

        for (let iter = 0; iter < NR_MAX_ITER; iter++) {
            let g_b = 0, g_eta = 0;

            for (const d of data) {
                if (d.time <= 0) continue;
                var etat = Math.min(Math.max(eta * d.time, -500), 500);
                var expEtaT = Math.exp(etat);

                if (Math.abs(eta) < 1e-10) {
                    // Taylor expansion gradients
                    var t = d.time;
                    if (d.event === 1) {
                        g_b += 1 / b - t;
                        g_eta += t - b * t * t * 0.5;
                    } else {
                        g_b += -t;
                        g_eta += -b * t * t * 0.5;
                    }
                } else {
                    if (d.event === 1) {
                        g_b += 1 / b - (expEtaT - 1) / eta;
                        g_eta += d.time - b * (d.time * expEtaT * eta - expEtaT + 1) / (eta * eta);
                    } else {
                        g_b += -(expEtaT - 1) / eta;
                        g_eta += -b * (d.time * expEtaT * eta - expEtaT + 1) / (eta * eta);
                    }
                }
            }

            const norm = Math.abs(g_b) + Math.abs(g_eta);
            if (norm < NR_TOLERANCE) break;

            // Numerical Hessian via finite differences
            const eps_b = Math.max(1e-7, Math.abs(b) * 1e-5);
            const eps_eta = Math.max(1e-7, Math.abs(eta) * 1e-5);

            // Helper to compute gradients at perturbed (b_p, eta_p)
            var computeGrad = (b_p, eta_p) => {
                var gb = 0, ge = 0;
                for (const d2 of data) {
                    if (d2.time <= 0) continue;
                    var et2 = Math.min(Math.max(eta_p * d2.time, -500), 500);
                    var expET2 = Math.exp(et2);
                    if (Math.abs(eta_p) < 1e-10) {
                        var t2 = d2.time;
                        if (d2.event === 1) { gb += 1 / b_p - t2; ge += t2 - b_p * t2 * t2 * 0.5; }
                        else { gb += -t2; ge += -b_p * t2 * t2 * 0.5; }
                    } else {
                        if (d2.event === 1) {
                            gb += 1 / b_p - (expET2 - 1) / eta_p;
                            ge += d2.time - b_p * (d2.time * expET2 * eta_p - expET2 + 1) / (eta_p * eta_p);
                        } else {
                            gb += -(expET2 - 1) / eta_p;
                            ge += -b_p * (d2.time * expET2 * eta_p - expET2 + 1) / (eta_p * eta_p);
                        }
                    }
                }
                return [gb, ge];
            };

            var [gb_pb, ge_pb] = computeGrad(b + eps_b, eta);
            var H11 = (gb_pb - g_b) / eps_b;
            var H12_a = (ge_pb - g_eta) / eps_b;

            var [gb_pe, ge_pe] = computeGrad(b, eta + eps_eta);
            var H12_b2 = (gb_pe - g_b) / eps_eta;
            var H22 = (ge_pe - g_eta) / eps_eta;
            var H12 = 0.5 * (H12_a + H12_b2);

            var det = H11 * H22 - H12 * H12;
            if (Math.abs(det) > 1e-20) {
                var dB = -(H22 * g_b - H12 * g_eta) / det;
                var dEta = -(-H12 * g_b + H11 * g_eta) / det;
                var maxStep = Math.max(Math.abs(dB), Math.abs(dEta));
                if (maxStep > 2) { var damping = 2 / maxStep; dB *= damping; dEta *= damping; }
                b += dB;
                eta += dEta;
            } else {
                // Fallback to gradient ascent
                b += 0.0005 * g_b;
                eta += 0.0005 * g_eta;
            }

            b = Math.max(1e-10, b);
            // eta is allowed to be negative (decreasing hazard)
        }

        // Log-likelihood (P2-11: cap eta*t to prevent overflow)
        let logLik = 0;
        for (const d of data) {
            if (d.time <= 0) continue;
            var etat = Math.min(Math.max(eta * d.time, -500), 500);
            var expEtaT = Math.exp(etat);
            var cumHaz;
            if (Math.abs(eta) < 1e-10) {
                cumHaz = b * d.time + 0.5 * b * eta * d.time * d.time;
            } else {
                cumHaz = (b / eta) * (expEtaT - 1);
            }
            // Cap cumHaz to prevent -Infinity contributions
            cumHaz = Math.min(cumHaz, 700);

            if (d.event === 1) {
                logLik += Math.log(b) + Math.min(eta * d.time, 500) - cumHaz;
            } else {
                logLik += -cumHaz;
            }
        }

        return { params: { b, eta }, logLik };
    }

    /**
     * Model-averaged survival prediction.
     *
     * @param {Object[]} fittedModels - [{name, params, weight, distribution}, ...]
     * @param {number[]} times - time points for prediction
     * @returns {Object} {times, survival, ci}
     */
    survivalPrediction(fittedModels, times) {
        const nT = times.length;
        const survCurves = [];

        for (const model of fittedModels) {
            const curve = times.map(t => this._survivalFunction(model.distribution ?? model.name, model.params, t));
            survCurves.push({ curve, weight: model.weight });
        }

        // Weighted average
        const survival = new Array(nT).fill(0);
        const variance = new Array(nT).fill(0);
        let totalWeight = survCurves.reduce((s, c) => s + c.weight, 0);

        for (const sc of survCurves) {
            const w = totalWeight > 0 ? sc.weight / totalWeight : 1 / survCurves.length;
            for (let j = 0; j < nT; j++) {
                survival[j] += w * sc.curve[j];
            }
        }

        // Between-model variance
        for (const sc of survCurves) {
            const w = totalWeight > 0 ? sc.weight / totalWeight : 1 / survCurves.length;
            for (let j = 0; j < nT; j++) {
                variance[j] += w * (sc.curve[j] - survival[j]) ** 2;
            }
        }

        const ci = survival.map((s, j) => {
            const sd = Math.sqrt(variance[j]);
            return {
                lower: Math.max(0, s - NORMAL_Z_975 * sd),
                upper: Math.min(1, s + NORMAL_Z_975 * sd)
            };
        });

        return { times, survival, ci };
    }

    /**
     * Evaluate survival function S(t) for a given distribution.
     */
    _survivalFunction(dist, params, t) {
        if (t <= 0) return 1.0;

        switch (dist) {
            case 'exponential':
                return Math.exp(-params.lambda * t);
            case 'weibull':
                return Math.exp(-Math.pow(t / params.scale, params.shape));
            case 'lognormal': {
                const z = (Math.log(t) - params.mu) / params.sigma;
                return 1 - this._normalCDF(z);
            }
            case 'loglogistic': {
                const z = Math.pow(t / params.alpha, params.beta);
                return 1 / (1 + z);
            }
            case 'gamma': {
                return this._upperIncompleteGammaRatio(params.shape, params.rate * t);
            }
            case 'gompertz': {
                // P2-11: Cap eta*t to prevent exp() overflow
                var etaT = Math.min(Math.max(params.eta * t, -500), 500);
                var cumHaz;
                if (Math.abs(params.eta) < 1e-10) {
                    cumHaz = params.b * t + 0.5 * params.b * params.eta * t * t;
                } else {
                    cumHaz = (params.b / params.eta) * (Math.exp(etaT) - 1);
                }
                // Cap cumHaz to prevent -Infinity from exp(-cumHaz)
                if (cumHaz > 700) return 0;
                return Math.exp(-cumHaz);
            }
            default:
                return 0;
        }
    }

    // ========================================================================
    // Mathematical helper functions
    // ========================================================================

    /** Standard normal PDF */
    _normalPDF(z) {
        return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    }

    /** Standard normal CDF (Abramowitz & Stegun approximation) */
    _normalCDF(z) {
        if (z < -8) return 0;
        if (z > 8) return 1;

        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = z < 0 ? -1 : 1;
        const x = Math.abs(z) / Math.sqrt(2);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return 0.5 * (1.0 + sign * y);
    }

    /** Log-gamma function (Stirling approximation for large values, Lanczos for small) */
    _logGamma(x) {
        if (x <= 0) return Infinity;

        // Lanczos approximation
        const g = 7;
        const c = [
            0.99999999999980993,
            676.5203681218851,
            -1259.1392167224028,
            771.32342877765313,
            -176.61502916214059,
            12.507343278686905,
            -0.13857109526572012,
            9.9843695780195716e-6,
            1.5056327351493116e-7
        ];

        let sum = c[0];
        for (let i = 1; i < g + 2; i++) {
            sum += c[i] / (x + i - 1);
        }

        const t = x + g - 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (x - 0.5) * Math.log(t) - t + Math.log(sum);
    }

    /** Gamma function */
    _gammaFn(x) {
        return Math.exp(this._logGamma(x));
    }

    /** Digamma function (psi) — series approximation */
    _digamma(x) {
        if (x <= 0) return -Infinity;

        let result = 0;
        // Shift x to be large enough for asymptotic expansion
        while (x < 6) {
            result -= 1 / x;
            x += 1;
        }

        // Asymptotic expansion
        result += Math.log(x) - 1 / (2 * x);
        const x2 = x * x;
        result -= 1 / (12 * x2);
        result += 1 / (120 * x2 * x2);
        result -= 1 / (252 * x2 * x2 * x2);

        return result;
    }

    /**
     * Upper incomplete gamma ratio: Q(a, x) = 1 - P(a, x) = Gamma(a,x)/Gamma(a)
     * Uses series or continued fraction depending on values.
     */
    _upperIncompleteGammaRatio(a, x) {
        if (x < 0) return 1;
        if (x === 0) return 1;
        if (a <= 0) return 0;

        // Use series for x < a+1, continued fraction otherwise
        if (x < a + 1) {
            return 1 - this._lowerIncompleteGammaSeries(a, x);
        } else {
            return this._upperIncompleteGammaCF(a, x);
        }
    }

    /** Lower incomplete gamma ratio via series expansion */
    _lowerIncompleteGammaSeries(a, x) {
        const logGammaA = this._logGamma(a);
        let sum = 1.0 / a;
        let term = 1.0 / a;

        for (let n = 1; n < 200; n++) {
            term *= x / (a + n);
            sum += term;
            if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
        }

        return sum * Math.exp(-x + a * Math.log(x) - logGammaA);
    }

    /** Upper incomplete gamma ratio via continued fraction (Lentz's method) */
    _upperIncompleteGammaCF(a, x) {
        const logGammaA = this._logGamma(a);
        let f = 1e-30;
        let c = 1e-30;
        let d = 1 / (x + 1 - a);
        let h = d;

        for (let n = 1; n < 200; n++) {
            const an = n * (a - n);
            const bn = x + 2 * n + 1 - a;
            d = bn + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = bn + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const delta = d * c;
            h *= delta;
            if (Math.abs(delta - 1) < 1e-15) break;
        }

        return Math.exp(-x + a * Math.log(x) - logGammaA) * h;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ModelAveragingEngine = ModelAveragingEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModelAveragingEngine };
}
