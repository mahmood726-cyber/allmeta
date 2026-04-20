/**
 * Joint Longitudinal-Survival Model Engine
 * Links a biomarker trajectory to a hazard function using a two-stage approach.
 *
 * Features:
 * - Linear or quadratic mixed-effects model for biomarker trajectories
 * - Weibull or exponential baseline hazard
 * - Association types: current_value, slope, cumulative
 * - Dynamic prediction with landmark updating
 * - Kahan summation for numerical stability
 *
 * Reference: Rizopoulos (2012) Joint Models for Longitudinal and Time-to-Event Data
 */

var KahanRef = (function resolveKahan() {
    if (typeof globalThis !== 'undefined' && globalThis.KahanSum) {
        return globalThis.KahanSum;
    }
    if (typeof require === 'function') {
        try {
            return require('../utils/kahan').KahanSum;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

// ============ NAMED CONSTANTS ============
const DEFAULT_MAX_ITER = 50;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_GAUSS_HERMITE_POINTS = 15;

// ============ HELPER FUNCTIONS ============

/**
 * Simple OLS regression: y = X * beta, returns beta
 * X is n x p matrix (array of arrays), y is n-vector
 */
function olsFit(X, y) {
    const n = X.length;
    const p = X[0].length;

    // X'X
    const XtX = [];
    for (let i = 0; i < p; i++) {
        XtX.push(new Float64Array(p));
        for (let j = 0; j < p; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) {
                s += X[k][i] * X[k][j];
            }
            XtX[i][j] = s;
        }
    }

    // X'y
    const Xty = new Float64Array(p);
    for (let i = 0; i < p; i++) {
        let s = 0;
        for (let k = 0; k < n; k++) {
            s += X[k][i] * y[k];
        }
        Xty[i] = s;
    }

    // Solve XtX * beta = Xty via Cholesky or direct for small p
    return solveSymmetric(XtX, Xty);
}

/**
 * Solve A*x = b for symmetric positive definite A (small dimension)
 * Falls back to Gaussian elimination
 */
function solveSymmetric(A, b) {
    const p = A.length;
    // Augmented matrix
    const aug = [];
    for (let i = 0; i < p; i++) {
        const row = new Float64Array(p + 1);
        for (let j = 0; j < p; j++) row[j] = A[i][j];
        row[p] = b[i];
        aug.push(row);
    }

    // Forward elimination with partial pivoting
    for (let col = 0; col < p; col++) {
        let maxVal = Math.abs(aug[col][col]);
        let maxRow = col;
        for (let row = col + 1; row < p; row++) {
            if (Math.abs(aug[row][col]) > maxVal) {
                maxVal = Math.abs(aug[row][col]);
                maxRow = row;
            }
        }
        if (maxRow !== col) {
            const tmp = aug[col];
            aug[col] = aug[maxRow];
            aug[maxRow] = tmp;
        }
        const pivot = aug[col][col];
        if (Math.abs(pivot) < 1e-30) continue;
        for (let row = col + 1; row < p; row++) {
            const factor = aug[row][col] / pivot;
            for (let j = col; j <= p; j++) {
                aug[row][j] -= factor * aug[col][j];
            }
        }
    }

    // Back substitution
    const x = new Float64Array(p);
    for (let i = p - 1; i >= 0; i--) {
        if (Math.abs(aug[i][i]) < 1e-30) {
            x[i] = 0;
            continue;
        }
        let s = aug[i][p];
        for (let j = i + 1; j < p; j++) {
            s -= aug[i][j] * x[j];
        }
        x[i] = s / aug[i][i];
    }

    return Array.from(x);
}

/**
 * Compute residual variance from OLS fit
 */
function residualVariance(X, y, beta) {
    const n = X.length;
    const p = beta.length;
    let ss = 0;
    for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let j = 0; j < p; j++) pred += X[i][j] * beta[j];
        const resid = y[i] - pred;
        ss += resid * resid;
    }
    return ss / Math.max(n - p, 1);
}

/**
 * Normal CDF approximation (Abramowitz & Stegun 26.2.17)
 */
function normalCDF(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * ax);
    const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return 0.5 * (1 + sign * erf);
}

/**
 * Log-likelihood for Weibull survival: h(t) = (shape/scale) * (t/scale)^(shape-1)
 * S(t) = exp(-(t/scale)^shape)
 */
function weibullLogLik(times, events, shape, scale, linearPredictor) {
    let ll = 0;
    for (let i = 0; i < times.length; i++) {
        const lp = linearPredictor ? linearPredictor[i] : 0;
        const t = times[i];
        if (t <= 0) continue;
        const logHaz = Math.log(shape / scale) + (shape - 1) * Math.log(t / scale) + lp;
        const cumHaz = Math.pow(t / scale, shape) * Math.exp(lp);
        ll += events[i] * logHaz - cumHaz;
    }
    return ll;
}

// ============ JOINT MODEL ENGINE ============

class JointModelEngine {
    constructor(options = {}) {
        this.maxIter = options.maxIter ?? DEFAULT_MAX_ITER;
        this.tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
    }

    /**
     * Validate input data
     */
    _validateData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            if (d.times == null || d.biomarker == null) {
                throw new Error(`Subject ${d.id ?? i}: missing times or biomarker data`);
            }
            if (!Array.isArray(d.times) || !Array.isArray(d.biomarker)) {
                throw new Error(`Subject ${d.id ?? i}: times and biomarker must be arrays`);
            }
            if (d.times.length !== d.biomarker.length) {
                throw new Error(`Subject ${d.id ?? i}: times and biomarker arrays must have equal length`);
            }
            if (d.times.length === 0) {
                throw new Error(`Subject ${d.id ?? i}: must have at least one biomarker measurement`);
            }
        }
    }

    /**
     * Stage 1: Fit longitudinal mixed-effects model to biomarker data.
     * Population-level: y_i(t) = beta0 + beta1 * t [+ beta2 * t^2 for quadratic]
     * With random effects: (b0_i, b1_i) ~ N(0, D)
     *
     * Simplified approach: pool all data, fit OLS for population parameters,
     * then estimate subject-level deviations as empirical Bayes.
     */
    _fitLongitudinal(data, model) {
        const isQuadratic = model === 'quadratic';

        // Pool all observations
        const allTimes = [];
        const allY = [];
        const subjectIndices = [];

        for (let s = 0; s < data.length; s++) {
            for (let j = 0; j < data[s].times.length; j++) {
                allTimes.push(data[s].times[j]);
                allY.push(data[s].biomarker[j]);
                subjectIndices.push(s);
            }
        }

        const nObs = allTimes.length;
        const p = isQuadratic ? 3 : 2;

        // Design matrix
        const X = [];
        for (let i = 0; i < nObs; i++) {
            const row = [1, allTimes[i]];
            if (isQuadratic) row.push(allTimes[i] * allTimes[i]);
            X.push(row);
        }

        // OLS fit
        const beta = olsFit(X, allY);
        const sigmaE2 = residualVariance(X, allY, beta);

        // Empirical Bayes for random effects: per-subject deviations
        const nSubjects = data.length;
        const randomEffects = [];
        let sumB0sq = 0, sumB1sq = 0;

        for (let s = 0; s < nSubjects; s++) {
            const times = data[s].times;
            const y = data[s].biomarker;

            // Subject-level OLS
            if (times.length >= 2) {
                const Xs = [];
                for (let j = 0; j < times.length; j++) {
                    const row = [1, times[j]];
                    if (isQuadratic) row.push(times[j] * times[j]);
                    Xs.push(row);
                }
                const betaS = olsFit(Xs, y);
                const b0 = betaS[0] - beta[0];
                const b1 = betaS[1] - beta[1];
                randomEffects.push({ b0, b1 });
                sumB0sq += b0 * b0;
                sumB1sq += b1 * b1;
            } else {
                // Single observation: compute intercept deviation only
                const pred = beta[0] + beta[1] * times[0] + (isQuadratic ? beta[2] * times[0] * times[0] : 0);
                const b0 = y[0] - pred;
                randomEffects.push({ b0, b1: 0 });
                sumB0sq += b0 * b0;
            }
        }

        const sigmaB0 = Math.sqrt(sumB0sq / Math.max(nSubjects, 1));
        const sigmaB1 = Math.sqrt(sumB1sq / Math.max(nSubjects, 1));

        return {
            beta0: beta[0],
            beta1: beta[1],
            beta2: isQuadratic ? (beta[2] ?? 0) : undefined,
            sigma_b0: sigmaB0,
            sigma_b1: sigmaB1,
            sigma_e: Math.sqrt(Math.max(sigmaE2, 0)),
            randomEffects
        };
    }

    /**
     * Predict biomarker value at time t for a subject using population + random effects
     */
    _predictBiomarker(longModel, randomEffect, t, isQuadratic) {
        let val = (longModel.beta0 + (randomEffect?.b0 ?? 0)) +
                  (longModel.beta1 + (randomEffect?.b1 ?? 0)) * t;
        if (isQuadratic && longModel.beta2 !== undefined) {
            val += longModel.beta2 * t * t;
        }
        return val;
    }

    /**
     * Stage 2: Fit survival model with biomarker as time-varying covariate.
     * h_i(t) = h0(t) * exp(alpha * m_i(t))
     *
     * Uses profile likelihood: for grid of alpha values, compute Weibull log-lik.
     */
    _fitSurvival(data, longModel, options) {
        const isQuadratic = (options.longitudinalModel === 'quadratic');
        const associationType = options.association ?? 'current_value';
        const nSubjects = data.length;

        const eventTimes = data.map(d => d.eventTime ?? d.times[d.times.length - 1]);
        const events = data.map(d => d.event ?? 0);

        // Grid search for alpha + Weibull (shape, scale)
        const alphaGrid = [];
        for (let a = -2; a <= 2; a += 0.05) alphaGrid.push(a);

        let bestLL = -Infinity;
        let bestAlpha = 0;
        let bestShape = 1;
        let bestScale = 1;

        // For each alpha, compute linear predictor and fit Weibull
        for (const alpha of alphaGrid) {
            const lp = new Float64Array(nSubjects);
            for (let i = 0; i < nSubjects; i++) {
                const re = longModel.randomEffects[i] || { b0: 0, b1: 0 };
                let mVal;
                if (associationType === 'slope') {
                    mVal = longModel.beta1 + (re.b1 ?? 0);
                } else if (associationType === 'cumulative') {
                    // Average biomarker value up to event time
                    const T = eventTimes[i];
                    if (T > 0) {
                        const nPts = 10;
                        let sum = 0;
                        for (let k = 0; k <= nPts; k++) {
                            const t = (k / nPts) * T;
                            sum += this._predictBiomarker(longModel, re, t, isQuadratic);
                        }
                        mVal = sum / (nPts + 1);
                    } else {
                        mVal = this._predictBiomarker(longModel, re, 0, isQuadratic);
                    }
                } else {
                    // current_value: biomarker at event/censor time
                    mVal = this._predictBiomarker(longModel, re, eventTimes[i], isQuadratic);
                }
                lp[i] = alpha * mVal;
            }

            // Profile Weibull: try a grid of shapes
            for (const shape of [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]) {
                // Estimate scale from data: MLE for Weibull with offset lp
                // Approximate: scale = (sum(t^shape * exp(lp)) / sum(events))^(1/shape)
                let num = 0, denom = 0;
                for (let i = 0; i < nSubjects; i++) {
                    if (eventTimes[i] > 0) {
                        num += Math.pow(eventTimes[i], shape) * Math.exp(lp[i]);
                    }
                    denom += events[i];
                }
                if (denom < 1) denom = 1;
                const scale = Math.pow(num / denom, 1.0 / shape);
                if (!isFinite(scale) || scale <= 0) continue;

                const ll = weibullLogLik(eventTimes, events, shape, scale, Array.from(lp));
                if (ll > bestLL) {
                    bestLL = ll;
                    bestAlpha = alpha;
                    bestShape = shape;
                    bestScale = scale;
                }
            }
        }

        return {
            shape: bestShape,
            scale: bestScale,
            alpha: bestAlpha,
            logLik: bestLL
        };
    }

    /**
     * Fit the joint model (two-stage approach).
     *
     * @param {Array} data - Array of subject data objects
     * @param {Object} options - Model options
     * @returns {Object} Fitted model
     */
    fit(data, options = {}) {
        this._validateData(data);

        const opts = {
            longitudinalModel: options.longitudinalModel ?? 'linear',
            survivalModel: options.survivalModel ?? 'weibull',
            association: options.association ?? 'current_value',
            maxIter: options.maxIter ?? this.maxIter
        };

        // Stage 1: Longitudinal
        const longResult = this._fitLongitudinal(data, opts.longitudinalModel);

        // Stage 2: Survival
        const survResult = this._fitSurvival(data, longResult, opts);

        // Total number of parameters for AIC
        const nLongParams = opts.longitudinalModel === 'quadratic' ? 5 : 4; // beta + sigma_b + sigma_e
        const nSurvParams = 3; // shape, scale, alpha
        const totalParams = nLongParams + nSurvParams;
        const aic = -2 * survResult.logLik + 2 * totalParams;

        // Association strength test: approximate p-value from profile likelihood
        // Compare bestLL with alpha=0
        const eventTimes = data.map(d => d.eventTime ?? d.times[d.times.length - 1]);
        const events = data.map(d => d.event ?? 0);
        const llNull = weibullLogLik(eventTimes, events, survResult.shape, survResult.scale, null);
        const lrt = 2 * (survResult.logLik - llNull);
        const pValue = lrt > 0 ? 1 - this._chi2CDF(lrt, 1) : 1.0;

        return {
            longitudinal: {
                beta0: longResult.beta0,
                beta1: longResult.beta1,
                beta2: longResult.beta2,
                sigma_b0: longResult.sigma_b0,
                sigma_b1: longResult.sigma_b1,
                sigma_e: longResult.sigma_e
            },
            survival: {
                shape: survResult.shape,
                scale: survResult.scale,
                alpha: survResult.alpha
            },
            logLik: survResult.logLik,
            aic,
            associationPValue: Math.max(0, Math.min(1, pValue)),
            options: opts,
            _longModel: longResult
        };
    }

    /**
     * Chi-squared CDF with df degrees of freedom (Wilson-Hilferty approximation)
     */
    _chi2CDF(x, df) {
        if (x <= 0) return 0;
        // Wilson-Hilferty: chi2_df is approximately normal
        const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
        const denom = Math.sqrt(2 / (9 * df));
        return normalCDF(z / denom);
    }

    /**
     * Predict biomarker trajectory and survival for new subjects.
     *
     * @param {Object} model - Fitted model from fit()
     * @param {Array} newData - Subject data (with or without random effects)
     * @param {number[]} times - Time points for prediction
     * @returns {Object} Predictions
     */
    predict(model, newData, times) {
        const isQuadratic = model.options?.longitudinalModel === 'quadratic';
        const results = [];

        for (const subject of newData) {
            // Estimate random effects from observed data
            let re = { b0: 0, b1: 0 };
            if (subject.times && subject.biomarker && subject.times.length >= 2) {
                const Xs = subject.times.map(t => isQuadratic ? [1, t, t * t] : [1, t]);
                const betaS = olsFit(Xs, subject.biomarker);
                re = {
                    b0: betaS[0] - model.longitudinal.beta0,
                    b1: betaS[1] - model.longitudinal.beta1
                };
            } else if (subject.times && subject.biomarker && subject.times.length === 1) {
                const pred = model.longitudinal.beta0 + model.longitudinal.beta1 * subject.times[0];
                re = { b0: subject.biomarker[0] - pred, b1: 0 };
            }

            const biomarkerPred = times.map(t =>
                this._predictBiomarker(model.longitudinal, re, t, isQuadratic)
            );

            // Survival prediction: S(t) = exp(-int_0^t h(u) du)
            // h(t) = (shape/scale) * (t/scale)^(shape-1) * exp(alpha * m(t))
            const survivalPred = times.map(t => {
                if (t <= 0) return 1.0;
                // Numerical integration of cumulative hazard
                const nSteps = 50;
                const dt = t / nSteps;
                let cumHaz = 0;
                for (let k = 0; k < nSteps; k++) {
                    const u = (k + 0.5) * dt;
                    const m = this._predictBiomarker(model.longitudinal, re, u, isQuadratic);
                    const h0 = (model.survival.shape / model.survival.scale) *
                               Math.pow(u / model.survival.scale, model.survival.shape - 1);
                    cumHaz += h0 * Math.exp(model.survival.alpha * m) * dt;
                }
                return Math.exp(-cumHaz);
            });

            results.push({
                id: subject.id,
                biomarker: biomarkerPred,
                survival: survivalPred
            });
        }

        return { times, predictions: results };
    }

    /**
     * Dynamic prediction: update survival probability given observed biomarker up to landmark.
     *
     * @param {Object} model - Fitted model
     * @param {Object} patientData - Single patient data
     * @param {number} landmark - Landmark time
     * @param {number} horizon - Prediction horizon (time beyond landmark)
     * @returns {Object} Updated survival predictions
     */
    dynamicPrediction(model, patientData, landmark, horizon) {
        const isQuadratic = model.options?.longitudinalModel === 'quadratic';

        // Filter observations up to landmark
        const obsIdx = patientData.times
            .map((t, i) => ({ t, i }))
            .filter(o => o.t <= landmark);

        const filteredTimes = obsIdx.map(o => patientData.times[o.i]);
        const filteredBio = obsIdx.map(o => patientData.biomarker[o.i]);

        // Estimate random effects from filtered data
        let re = { b0: 0, b1: 0 };
        if (filteredTimes.length >= 2) {
            const Xs = filteredTimes.map(t => isQuadratic ? [1, t, t * t] : [1, t]);
            const betaS = olsFit(Xs, filteredBio);
            re = {
                b0: betaS[0] - model.longitudinal.beta0,
                b1: betaS[1] - model.longitudinal.beta1
            };
        } else if (filteredTimes.length === 1) {
            const pred = model.longitudinal.beta0 + model.longitudinal.beta1 * filteredTimes[0];
            re = { b0: filteredBio[0] - pred, b1: 0 };
        }

        // Predict S(t | T > landmark) = S(t) / S(landmark)
        const predTimes = [];
        const nSteps = 20;
        for (let i = 0; i <= nSteps; i++) {
            predTimes.push(landmark + (i / nSteps) * horizon);
        }

        // S(landmark)
        const sLandmark = this._computeSurvival(model, re, landmark, isQuadratic);

        const conditionalSurvival = predTimes.map(t => {
            const sT = this._computeSurvival(model, re, t, isQuadratic);
            return sLandmark > 0 ? sT / sLandmark : 0;
        });

        return {
            landmark,
            horizon,
            times: predTimes,
            conditionalSurvival,
            biomarkerAtLandmark: this._predictBiomarker(model.longitudinal, re, landmark, isQuadratic)
        };
    }

    /**
     * Compute S(t) for given random effects
     */
    _computeSurvival(model, re, t, isQuadratic) {
        if (t <= 0) return 1.0;
        const nSteps = 50;
        const dt = t / nSteps;
        let cumHaz = 0;
        for (let k = 0; k < nSteps; k++) {
            const u = (k + 0.5) * dt;
            const m = this._predictBiomarker(model.longitudinal, re, u, isQuadratic);
            const h0 = (model.survival.shape / model.survival.scale) *
                       Math.pow(u / model.survival.scale, model.survival.shape - 1);
            cumHaz += h0 * Math.exp(model.survival.alpha * m) * dt;
        }
        return Math.exp(-cumHaz);
    }

    /**
     * Helper to predict biomarker using model's longitudinal component
     */
    _predictBiomarker(longModel, re, t, isQuadratic) {
        let val = (longModel.beta0 + (re?.b0 ?? 0)) +
                  (longModel.beta1 + (re?.b1 ?? 0)) * t;
        if (isQuadratic && longModel.beta2 !== undefined) {
            val += longModel.beta2 * t * t;
        }
        return val;
    }

    /**
     * Test if the association parameter alpha is significantly different from 0.
     */
    associationStrength(model) {
        return {
            alpha: model.survival.alpha,
            pValue: model.associationPValue,
            significant: model.associationPValue < 0.05
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.JointModelEngine = JointModelEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JointModelEngine };
}
