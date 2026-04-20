/**
 * Cox Proportional Hazards & Accelerated Failure Time Regression Engine
 *
 * Features:
 * - Cox PH via Newton-Raphson (partial likelihood)
 * - Breslow and Efron tie-handling methods
 * - Accelerated Failure Time models (Weibull, Log-Normal, Log-Logistic)
 * - Schoenfeld residual test for PH assumption
 * - Survival prediction from fitted models
 * - Concordance index (Harrell's C)
 *
 * References:
 * - Cox (1972) JRSS-B: Regression Models and Life Tables
 * - Efron (1977) JASA: The Efficiency of Cox's Likelihood Function
 * - Grambsch & Therneau (1994) Biometrika: PH Tests and Diagnostics
 * - Harrell et al. (1996) Statistics in Medicine: C-index
 */

'use strict';

class CoxRegressionEngine {
    constructor() {
        this.EPSILON = 1e-15;
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    /**
     * Standard normal CDF (Abramowitz & Stegun 26.2.17)
     */
    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        const t = 1.0 / (1.0 + p * Math.abs(x));
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
        return 0.5 * (1.0 + sign * y);
    }

    /**
     * Two-tailed p-value from z-score
     */
    _zToPValue(z) {
        return 2 * (1 - this._normalCDF(Math.abs(z)));
    }

    /**
     * Extract covariate vector for a subject
     */
    _getX(subject, covariates) {
        return covariates.map(c => {
            const val = subject.covariates[c];
            return val !== undefined && val !== null ? Number(val) : 0;
        });
    }

    /**
     * Dot product
     */
    _dot(a, b) {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }

    /**
     * Matrix-vector multiply (matrix is flat row-major p x p)
     */
    _matVecMul(mat, vec, p) {
        const result = new Array(p).fill(0);
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                result[i] += mat[i * p + j] * vec[j];
            }
        }
        return result;
    }

    /**
     * Invert a symmetric positive-definite matrix (Gauss-Jordan, p x p flat)
     */
    _invertMatrix(mat, p) {
        // Augmented matrix [A | I]
        const aug = new Array(p * 2 * p).fill(0);
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                aug[i * 2 * p + j] = mat[i * p + j];
            }
            aug[i * 2 * p + p + i] = 1;
        }
        for (let col = 0; col < p; col++) {
            // Partial pivoting
            let maxVal = Math.abs(aug[col * 2 * p + col]);
            let maxRow = col;
            for (let row = col + 1; row < p; row++) {
                const val = Math.abs(aug[row * 2 * p + col]);
                if (val > maxVal) { maxVal = val; maxRow = row; }
            }
            if (maxVal < this.EPSILON) return null; // Singular
            if (maxRow !== col) {
                for (let j = 0; j < 2 * p; j++) {
                    const tmp = aug[col * 2 * p + j];
                    aug[col * 2 * p + j] = aug[maxRow * 2 * p + j];
                    aug[maxRow * 2 * p + j] = tmp;
                }
            }
            const pivot = aug[col * 2 * p + col];
            for (let j = 0; j < 2 * p; j++) aug[col * 2 * p + j] /= pivot;
            for (let row = 0; row < p; row++) {
                if (row === col) continue;
                const factor = aug[row * 2 * p + col];
                for (let j = 0; j < 2 * p; j++) {
                    aug[row * 2 * p + j] -= factor * aug[col * 2 * p + j];
                }
            }
        }
        const inv = new Array(p * p);
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                inv[i * p + j] = aug[i * 2 * p + p + j];
            }
        }
        return inv;
    }

    // ─── Cox PH ────────────────────────────────────────────────────────

    /**
     * Fit Cox Proportional Hazards model via Newton-Raphson
     *
     * @param {Array} data - [{time, event, covariates: {age, treatment, ...}}, ...]
     * @param {Array} covariates - covariate names
     * @param {Object} options - {maxIter, tol, tieMethod, confLevel}
     * @returns {Object} fitted model
     */
    coxPH(data, covariates, options = {}) {
        const {
            maxIter = 50,
            tol = 1e-8,
            tieMethod = 'breslow',
            confLevel = 0.95
        } = options;

        if (!data || data.length === 0) {
            throw new Error('No data provided');
        }

        const nEvents = data.filter(d => d.event === 1).length;
        if (nEvents === 0) {
            throw new Error('No events in data — cannot fit Cox model');
        }

        const p = covariates.length;
        const n = data.length;
        const z = -this._normalCDFInv((1 - confLevel) / 2);

        // Sort by time (ascending), ties: events before censored
        const sorted = [...data].sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return b.event - a.event; // events first
        });

        // Extract covariate matrix
        const X = sorted.map(d => this._getX(d, covariates));
        const times = sorted.map(d => d.time);
        const events = sorted.map(d => d.event);

        // Newton-Raphson
        let beta = new Array(p).fill(0);
        let converged = false;
        let iterations = 0;
        let logLik = 0;

        for (let iter = 0; iter < maxIter; iter++) {
            iterations = iter + 1;
            const { score, information, ll } = tieMethod === 'efron'
                ? this._efronLikelihood(beta, X, times, events, p, n)
                : this._breslowLikelihood(beta, X, times, events, p, n);

            logLik = ll;

            const invInfo = this._invertMatrix(information, p);
            if (!invInfo) break;

            const delta = this._matVecMul(invInfo, score, p);
            let maxDelta = 0;
            for (let j = 0; j < p; j++) {
                beta[j] += delta[j];
                if (Math.abs(delta[j]) > maxDelta) maxDelta = Math.abs(delta[j]);
            }

            if (maxDelta < tol) {
                converged = true;
                // Recompute final log-likelihood
                const final = tieMethod === 'efron'
                    ? this._efronLikelihood(beta, X, times, events, p, n)
                    : this._breslowLikelihood(beta, X, times, events, p, n);
                logLik = final.ll;
                break;
            }
        }

        // Final information matrix for SEs
        const finalResult = tieMethod === 'efron'
            ? this._efronLikelihood(beta, X, times, events, p, n)
            : this._breslowLikelihood(beta, X, times, events, p, n);
        logLik = finalResult.ll;
        const invInfo = this._invertMatrix(finalResult.information, p);

        const coefficients = covariates.map((name, j) => {
            const se = invInfo ? Math.sqrt(Math.max(0, invInfo[j * p + j])) : NaN;
            const hr = Math.exp(beta[j]);
            const zVal = se > 0 ? beta[j] / se : 0;
            return {
                name,
                beta: beta[j],
                se,
                hr,
                hrLower: Math.exp(beta[j] - z * se),
                hrUpper: Math.exp(beta[j] + z * se),
                zValue: zVal,
                pValue: this._zToPValue(zVal)
            };
        });

        const aic = -2 * logLik + 2 * p;

        // Concordance
        const concordance = this._concordance(beta, sorted, covariates);

        // Store internals for prediction / testing
        const model = {
            type: 'coxph',
            coefficients,
            logLik,
            aic,
            concordance,
            iterations,
            converged,
            tieMethod,
            covariates,
            _beta: beta.slice(),
            _sortedData: sorted,
            _X: X,
            _baselineHazard: this._baselineHazard(beta, X, times, events, n)
        };

        return model;
    }

    /**
     * Breslow partial likelihood, score, and information
     */
    _breslowLikelihood(beta, X, times, events, p, n) {
        let ll = 0;
        const score = new Array(p).fill(0);
        const information = new Array(p * p).fill(0);

        // Precompute exp(x'β)
        const expXb = new Array(n);
        for (let i = 0; i < n; i++) {
            expXb[i] = Math.exp(this._dot(X[i], beta));
        }

        // For each event time, compute risk set sums
        // Process from last to first for efficiency
        const S0 = new Array(n).fill(0);
        const S1 = Array.from({ length: n }, () => new Array(p).fill(0));
        const S2 = Array.from({ length: n }, () => new Array(p * p).fill(0));

        // Cumulative sums from bottom
        let cumS0 = 0;
        const cumS1 = new Array(p).fill(0);
        const cumS2 = new Array(p * p).fill(0);

        for (let i = n - 1; i >= 0; i--) {
            cumS0 += expXb[i];
            for (let j = 0; j < p; j++) {
                cumS1[j] += X[i][j] * expXb[i];
            }
            for (let j = 0; j < p; j++) {
                for (let k = 0; k < p; k++) {
                    cumS2[j * p + k] += X[i][j] * X[i][k] * expXb[i];
                }
            }
            S0[i] = cumS0;
            for (let j = 0; j < p; j++) S1[i][j] = cumS1[j];
            for (let j = 0; j < p * p; j++) S2[i][j] = cumS2[j];
        }

        for (let i = 0; i < n; i++) {
            if (events[i] !== 1) continue;
            const xb = this._dot(X[i], beta);
            ll += xb - Math.log(S0[i] + this.EPSILON);

            for (let j = 0; j < p; j++) {
                const xbar = S1[i][j] / (S0[i] + this.EPSILON);
                score[j] += X[i][j] - xbar;
            }

            for (let j = 0; j < p; j++) {
                for (let k = 0; k < p; k++) {
                    const s2 = S2[i][j * p + k] / (S0[i] + this.EPSILON);
                    const s1j = S1[i][j] / (S0[i] + this.EPSILON);
                    const s1k = S1[i][k] / (S0[i] + this.EPSILON);
                    information[j * p + k] += s2 - s1j * s1k;
                }
            }
        }

        return { score, information, ll };
    }

    /**
     * Efron partial likelihood with tie correction
     */
    _efronLikelihood(beta, X, times, events, p, n) {
        let ll = 0;
        const score = new Array(p).fill(0);
        const information = new Array(p * p).fill(0);

        const expXb = new Array(n);
        for (let i = 0; i < n; i++) {
            expXb[i] = Math.exp(this._dot(X[i], beta));
        }

        // Group events at tied times
        let i = 0;
        // Risk set cumulative from bottom
        let riskS0 = 0;
        const riskS1 = new Array(p).fill(0);
        const riskS2 = new Array(p * p).fill(0);
        for (let q = 0; q < n; q++) {
            riskS0 += expXb[q];
            for (let j = 0; j < p; j++) riskS1[j] += X[q][j] * expXb[q];
            for (let j = 0; j < p; j++)
                for (let k = 0; k < p; k++)
                    riskS2[j * p + k] += X[q][j] * X[q][k] * expXb[q];
        }

        while (i < n) {
            // Remove subjects with time < current from risk set (already counted above)
            // Actually, rebuild per distinct time for simplicity
            // Risk set: all j where time_j >= time_i
            if (events[i] !== 1) {
                // Remove from risk set after processing
                riskS0 -= expXb[i];
                for (let j = 0; j < p; j++) riskS1[j] -= X[i][j] * expXb[i];
                for (let j = 0; j < p; j++)
                    for (let k = 0; k < p; k++)
                        riskS2[j * p + k] -= X[i][j] * X[i][k] * expXb[i];
                i++;
                continue;
            }

            // Collect tied events at this time
            const tieTime = times[i];
            const tiedIdx = [];
            let q = i;
            while (q < n && times[q] === tieTime && events[q] === 1) {
                tiedIdx.push(q);
                q++;
            }
            const d = tiedIdx.length;

            // Sum over tied event subjects
            let dS0 = 0;
            const dS1 = new Array(p).fill(0);
            const dS2 = new Array(p * p).fill(0);
            for (const idx of tiedIdx) {
                dS0 += expXb[idx];
                for (let j = 0; j < p; j++) dS1[j] += X[idx][j] * expXb[idx];
                for (let j = 0; j < p; j++)
                    for (let k = 0; k < p; k++)
                        dS2[j * p + k] += X[idx][j] * X[idx][k] * expXb[idx];
            }

            // Efron likelihood contribution
            for (let m = 0; m < d; m++) {
                const idx = tiedIdx[m];
                const xb = this._dot(X[idx], beta);
                const frac = m / d;
                const adjS0 = riskS0 - frac * dS0;

                ll += xb - Math.log(adjS0 + this.EPSILON);

                for (let j = 0; j < p; j++) {
                    const adjS1j = riskS1[j] - frac * dS1[j];
                    const xbar = adjS1j / (adjS0 + this.EPSILON);
                    score[j] += X[idx][j] - xbar;
                }

                for (let j = 0; j < p; j++) {
                    for (let k = 0; k < p; k++) {
                        const adjS2jk = riskS2[j * p + k] - frac * dS2[j * p + k];
                        const adjS1j = riskS1[j] - frac * dS1[j];
                        const adjS1k = riskS1[k] - frac * dS1[k];
                        const s2 = adjS2jk / (adjS0 + this.EPSILON);
                        const s1j = adjS1j / (adjS0 + this.EPSILON);
                        const s1k = adjS1k / (adjS0 + this.EPSILON);
                        information[j * p + k] += s2 - s1j * s1k;
                    }
                }
            }

            // Remove tied events from risk set
            for (const idx of tiedIdx) {
                riskS0 -= expXb[idx];
                for (let j = 0; j < p; j++) riskS1[j] -= X[idx][j] * expXb[idx];
                for (let j = 0; j < p; j++)
                    for (let k = 0; k < p; k++)
                        riskS2[j * p + k] -= X[idx][j] * X[idx][k] * expXb[idx];
            }

            // Also remove censored at this time
            while (q < n && times[q] === tieTime && events[q] !== 1) {
                riskS0 -= expXb[q];
                for (let j = 0; j < p; j++) riskS1[j] -= X[q][j] * expXb[q];
                for (let j = 0; j < p; j++)
                    for (let k = 0; k < p; k++)
                        riskS2[j * p + k] -= X[q][j] * X[q][k] * expXb[q];
                q++;
            }

            i = q;
        }

        return { score, information, ll };
    }

    /**
     * Baseline hazard (Breslow estimator)
     */
    _baselineHazard(beta, X, times, events, n) {
        const expXb = X.map(x => Math.exp(this._dot(x, beta)));
        const hazards = [];
        let cumHaz = 0;

        // Risk set cumulative from bottom
        let riskSum = 0;
        const riskSums = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            riskSum += expXb[i];
            riskSums[i] = riskSum;
        }

        let i = 0;
        while (i < n) {
            if (events[i] === 1) {
                const t = times[i];
                let dEvents = 0;
                let j = i;
                while (j < n && times[j] === t && events[j] === 1) {
                    dEvents++;
                    j++;
                }
                const h0 = dEvents / (riskSums[i] + this.EPSILON);
                cumHaz += h0;
                hazards.push({ time: t, hazard: h0, cumHazard: cumHaz, survival: Math.exp(-cumHaz) });
                i = j;
            } else {
                i++;
            }
        }

        return hazards;
    }

    /**
     * Concordance index (Harrell's C)
     */
    _concordance(beta, sortedData, covariates) {
        let concordant = 0;
        let discordant = 0;
        let tied = 0;

        const n = sortedData.length;
        const riskScores = sortedData.map(d => this._dot(this._getX(d, covariates), beta));

        for (let i = 0; i < n; i++) {
            if (sortedData[i].event !== 1) continue;
            for (let j = i + 1; j < n; j++) {
                // Only comparable if i had event and j survived longer
                if (sortedData[j].time > sortedData[i].time) {
                    // Higher risk score should correspond to shorter survival
                    if (riskScores[i] > riskScores[j]) concordant++;
                    else if (riskScores[i] < riskScores[j]) discordant++;
                    else tied++;
                }
            }
        }

        const total = concordant + discordant + tied;
        return total > 0 ? (concordant + 0.5 * tied) / total : 0.5;
    }

    /**
     * Inverse normal CDF (Rational approximation, Abramowitz & Stegun 26.2.23)
     */
    _normalCDFInv(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;

        const a = [
            -3.969683028665376e1, 2.209460984245205e2,
            -2.759285104469687e2, 1.383577518672690e2,
            -3.066479806614716e1, 2.506628277459239e0
        ];
        const b = [
            -5.447609879822406e1, 1.615858368580409e2,
            -1.556989798598866e2, 6.680131188771972e1,
            -1.328068155288572e1
        ];
        const c = [
            -7.784894002430293e-3, -3.223964580411365e-1,
            -2.400758277161838e0, -2.549732539343734e0,
            4.374664141464968e0, 2.938163982698783e0
        ];
        const d = [
            7.784695709041462e-3, 3.224671290700398e-1,
            2.445134137142996e0, 3.754408661907416e0
        ];

        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                   ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
                   (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                    ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
        }
    }

    // ─── AFT Models ────────────────────────────────────────────────────

    /**
     * Fit Accelerated Failure Time model
     *
     * @param {Array} data - [{time, event, covariates}, ...]
     * @param {Array} covariates - covariate names
     * @param {string} distribution - 'weibull', 'lognormal', 'loglogistic'
     * @param {Object} options
     * @returns {Object} fitted AFT model
     */
    aft(data, covariates, distribution = 'weibull', options = {}) {
        const {
            maxIter = 100,
            tol = 1e-8,
            confLevel = 0.95
        } = options;

        if (!data || data.length === 0) throw new Error('No data provided');
        const nEvents = data.filter(d => d.event === 1).length;
        if (nEvents === 0) throw new Error('No events in data');

        const p = covariates.length;
        const z = -this._normalCDFInv((1 - confLevel) / 2);
        const n = data.length;

        // AFT: log(T) = x'β + σε, where ε has standard distribution
        // MLE via Newton-Raphson on log-likelihood

        // Parameters: [beta_0 (intercept), beta_1, ..., beta_p, log(sigma)]
        const nPar = p + 2; // intercept + covariates + log(scale)
        let params = new Array(nPar).fill(0);
        // Initialize intercept with mean log-time of events
        const eventLogTimes = data.filter(d => d.event === 1).map(d => Math.log(Math.max(d.time, 1e-10)));
        params[0] = eventLogTimes.reduce((a, b) => a + b, 0) / eventLogTimes.length;
        params[nPar - 1] = 0; // log(sigma) = 0 → sigma = 1

        let converged = false;
        let iterations = 0;
        let logLik = 0;

        for (let iter = 0; iter < maxIter; iter++) {
            iterations = iter + 1;
            const { ll, gradient, hessian } = this._aftLikelihood(params, data, covariates, distribution, nPar, n);
            logLik = ll;

            const invHess = this._invertMatrix(hessian.map(v => -v), nPar);
            if (!invHess) break;

            const delta = this._matVecMul(invHess, gradient, nPar);
            let maxDelta = 0;
            for (let j = 0; j < nPar; j++) {
                params[j] += delta[j];
                if (Math.abs(delta[j]) > maxDelta) maxDelta = Math.abs(delta[j]);
            }

            if (maxDelta < tol) {
                converged = true;
                break;
            }
        }

        // Final likelihood and SE
        const final = this._aftLikelihood(params, data, covariates, distribution, nPar, n);
        logLik = final.ll;
        const invHess = this._invertMatrix(final.hessian.map(v => -v), nPar);

        const sigma = Math.exp(params[nPar - 1]);

        const coefficients = [];
        // Intercept
        coefficients.push({
            name: '(Intercept)',
            beta: params[0],
            se: invHess ? Math.sqrt(Math.max(0, invHess[0])) : NaN,
            accelerationFactor: Math.exp(params[0]),
            zValue: 0,
            pValue: 1
        });

        for (let j = 0; j < p; j++) {
            const se = invHess ? Math.sqrt(Math.max(0, invHess[(j + 1) * nPar + (j + 1)])) : NaN;
            const af = Math.exp(params[j + 1]);
            const zVal = se > 0 ? params[j + 1] / se : 0;
            coefficients.push({
                name: covariates[j],
                beta: params[j + 1],
                se,
                accelerationFactor: af,
                afLower: Math.exp(params[j + 1] - z * se),
                afUpper: Math.exp(params[j + 1] + z * se),
                zValue: zVal,
                pValue: this._zToPValue(zVal)
            });
        }

        // Scale parameter
        coefficients.push({
            name: 'log(scale)',
            beta: params[nPar - 1],
            se: invHess ? Math.sqrt(Math.max(0, invHess[(nPar - 1) * nPar + (nPar - 1)])) : NaN,
            scale: sigma
        });

        const aic = -2 * logLik + 2 * nPar;

        return {
            type: 'aft',
            distribution,
            coefficients,
            logLik,
            aic,
            sigma,
            iterations,
            converged,
            covariates,
            _params: params.slice(),
            _sortedData: [...data].sort((a, b) => a.time - b.time)
        };
    }

    /**
     * AFT log-likelihood, gradient, and Hessian
     */
    _aftLikelihood(params, data, covariates, distribution, nPar, n) {
        const p = covariates.length;
        const sigma = Math.exp(params[nPar - 1]);
        let ll = 0;
        const gradient = new Array(nPar).fill(0);
        const hessian = new Array(nPar * nPar).fill(0);

        for (let i = 0; i < n; i++) {
            const logT = Math.log(Math.max(data[i].time, 1e-10));
            const xi = [1, ...this._getX(data[i], covariates)]; // intercept + covariates
            const mu = this._dot(xi.slice(0, p + 1), params.slice(0, p + 1));
            const z = (logT - mu) / sigma;
            const event = data[i].event;

            const { logf, logS, dlogf_dz, dlogS_dz, d2logf_dz2, d2logS_dz2 } =
                this._aftDistribution(z, distribution);

            if (event === 1) {
                // log f(t) = logf(z) - log(sigma) - log(t)
                ll += logf - Math.log(sigma) - logT;

                // Gradient w.r.t. beta_j: -dlogf/dz * (1/sigma) * x_j
                for (let j = 0; j <= p; j++) {
                    gradient[j] += -dlogf_dz / sigma * xi[j];
                }
                // Gradient w.r.t. log(sigma): -1 - dlogf/dz * z
                gradient[nPar - 1] += -1 - dlogf_dz * z;

                // Hessian (negative, for Newton)
                for (let j = 0; j <= p; j++) {
                    for (let k = 0; k <= p; k++) {
                        hessian[j * nPar + k] += -d2logf_dz2 / (sigma * sigma) * xi[j] * xi[k];
                    }
                    hessian[j * nPar + (nPar - 1)] += (-d2logf_dz2 * z - dlogf_dz) / sigma * xi[j];
                    hessian[(nPar - 1) * nPar + j] += (-d2logf_dz2 * z - dlogf_dz) / sigma * xi[j];
                }
                hessian[(nPar - 1) * nPar + (nPar - 1)] += -d2logf_dz2 * z * z - 2 * dlogf_dz * z;
            } else {
                // Censored: log S(t)
                ll += logS;

                for (let j = 0; j <= p; j++) {
                    gradient[j] += -dlogS_dz / sigma * xi[j];
                }
                gradient[nPar - 1] += -dlogS_dz * z;

                for (let j = 0; j <= p; j++) {
                    for (let k = 0; k <= p; k++) {
                        hessian[j * nPar + k] += -d2logS_dz2 / (sigma * sigma) * xi[j] * xi[k];
                    }
                    hessian[j * nPar + (nPar - 1)] += (-d2logS_dz2 * z - dlogS_dz) / sigma * xi[j];
                    hessian[(nPar - 1) * nPar + j] += (-d2logS_dz2 * z - dlogS_dz) / sigma * xi[j];
                }
                hessian[(nPar - 1) * nPar + (nPar - 1)] += -d2logS_dz2 * z * z - 2 * dlogS_dz * z;
            }
        }

        return { ll, gradient, hessian };
    }

    /**
     * Distribution functions for AFT
     */
    _aftDistribution(z, distribution) {
        switch (distribution) {
            case 'weibull': {
                // Standard extreme value (Gumbel) distribution for log(Weibull)
                const ez = Math.exp(z);
                const logf = z - ez;
                const logS = -ez;
                const dlogf_dz = 1 - ez;
                const dlogS_dz = -ez;
                const d2logf_dz2 = -ez;
                const d2logS_dz2 = -ez;
                return { logf, logS, dlogf_dz, dlogS_dz, d2logf_dz2, d2logS_dz2 };
            }
            case 'lognormal': {
                // Standard normal
                const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
                const Phi = this._normalCDF(z);
                const logf = Math.log(phi + this.EPSILON);
                const logS = Math.log(1 - Phi + this.EPSILON);
                const dlogf_dz = -z;
                const S = 1 - Phi + this.EPSILON;
                const dlogS_dz = -phi / S;
                const d2logf_dz2 = -1;
                const d2logS_dz2 = -((-z * phi) * S - (-phi) * (-phi)) / (S * S);
                return { logf, logS, dlogf_dz, dlogS_dz, d2logf_dz2, d2logS_dz2 };
            }
            case 'loglogistic': {
                // Standard logistic
                const ez = Math.exp(z);
                const denom = 1 + ez;
                const logf = z - 2 * Math.log(denom);
                const logS = -Math.log(denom);
                const dlogf_dz = 1 - 2 * ez / denom;
                const dlogS_dz = -ez / denom;
                const d2logf_dz2 = -2 * ez / (denom * denom);
                const d2logS_dz2 = -ez / (denom * denom);
                return { logf, logS, dlogf_dz, dlogS_dz, d2logf_dz2, d2logS_dz2 };
            }
            default:
                throw new Error(`Unknown AFT distribution: ${distribution}`);
        }
    }

    // ─── PH Test (Schoenfeld) ──────────────────────────────────────────

    /**
     * Test proportional hazards assumption via Schoenfeld residuals
     *
     * @param {Object} coxModel - fitted Cox PH model
     * @param {Array} data - original data
     * @returns {Array} test results per covariate
     */
    testPH(coxModel, data) {
        const covariates = coxModel.covariates;
        const beta = coxModel._beta;
        const p = covariates.length;

        // Sort data
        const sorted = [...data].sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return b.event - a.event;
        });
        const n = sorted.length;
        const X = sorted.map(d => this._getX(d, covariates));
        const times = sorted.map(d => d.time);
        const events = sorted.map(d => d.event);

        // Compute Schoenfeld residuals
        const expXb = X.map(x => Math.exp(this._dot(x, beta)));
        const residuals = []; // [{time, residuals: [r1, r2, ...]}]

        // Risk set from bottom
        let riskS0 = 0;
        const riskS1 = new Array(p).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            riskS0 += expXb[i];
            for (let j = 0; j < p; j++) riskS1[j] += X[i][j] * expXb[i];
        }

        let cumRemoved0 = 0;
        const cumRemoved1 = new Array(p).fill(0);

        for (let i = 0; i < n; i++) {
            const currentS0 = riskS0 - cumRemoved0;
            const currentS1 = riskS1.map((v, j) => v - cumRemoved1[j]);

            if (events[i] === 1) {
                const xbar = currentS1.map(v => v / (currentS0 + this.EPSILON));
                const resid = covariates.map((_, j) => X[i][j] - xbar[j]);
                residuals.push({ time: times[i], residuals: resid });
            }

            cumRemoved0 += expXb[i];
            for (let j = 0; j < p; j++) cumRemoved1[j] += X[i][j] * expXb[i];
        }

        if (residuals.length < 3) {
            return covariates.map(name => ({
                covariate: name,
                rho: 0,
                chiSq: 0,
                pValue: 1,
                phViolated: false
            }));
        }

        // Rank transform of times
        const eventTimes = residuals.map(r => r.time);
        const ranks = eventTimes.map((t, i) => i + 1);
        const meanRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
        const rankVar = ranks.reduce((a, r) => a + (r - meanRank) ** 2, 0);

        // Correlation of each residual column with rank(time)
        const results = [];
        for (let j = 0; j < p; j++) {
            const resVals = residuals.map(r => r.residuals[j]);
            const meanRes = resVals.reduce((a, b) => a + b, 0) / resVals.length;
            const resVar = resVals.reduce((a, r) => a + (r - meanRes) ** 2, 0);

            let cov = 0;
            for (let i = 0; i < residuals.length; i++) {
                cov += (ranks[i] - meanRank) * (resVals[i] - meanRes);
            }

            const rho = (rankVar > 0 && resVar > 0)
                ? cov / Math.sqrt(rankVar * resVar)
                : 0;

            // Chi-squared test: n * rho^2 ~ chi2(1)
            const nRes = residuals.length;
            const chiSq = nRes * rho * rho;
            // p-value from chi2(1): P(X > chiSq) = 2*(1 - Phi(sqrt(chiSq)))
            const pValue = 2 * (1 - this._normalCDF(Math.sqrt(chiSq)));

            results.push({
                covariate: covariates[j],
                rho,
                chiSq,
                pValue,
                phViolated: pValue < 0.05
            });
        }

        return results;
    }

    // ─── Prediction ────────────────────────────────────────────────────

    /**
     * Predict survival curves for new data
     *
     * @param {Object} model - fitted model (coxph or aft)
     * @param {Object} newData - covariate values {age: 60, treatment: 1}
     * @param {Array} times - time points for prediction
     * @returns {Array} [{time, survival, hazard, cumHazard}, ...]
     */
    predictSurvival(model, newData, times) {
        if (model.type === 'aft') {
            return this._predictAFT(model, newData, times);
        }

        // Cox PH prediction: S(t|x) = S0(t)^exp(x'β)
        const beta = model._beta;
        const covariates = model.covariates;
        const x = covariates.map(c => newData[c] !== undefined ? Number(newData[c]) : 0);
        const xb = this._dot(x, beta);
        const expXb = Math.exp(xb);

        const baseH = model._baselineHazard;
        if (!baseH || baseH.length === 0) {
            return times.map(t => ({ time: t, survival: 1, hazard: 0, cumHazard: 0 }));
        }

        return times.map(t => {
            // Find cumulative baseline hazard at time t
            let cumH0 = 0;
            let h0 = 0;
            for (const bh of baseH) {
                if (bh.time <= t) {
                    cumH0 = bh.cumHazard;
                    h0 = bh.hazard;
                } else {
                    break;
                }
            }

            const cumHazard = cumH0 * expXb;
            const survival = Math.exp(-cumHazard);
            const hazard = h0 * expXb;

            return { time: t, survival, hazard, cumHazard };
        });
    }

    _predictAFT(model, newData, times) {
        const params = model._params;
        const covariates = model.covariates;
        const p = covariates.length;
        const sigma = model.sigma;

        const x = [1, ...covariates.map(c => newData[c] !== undefined ? Number(newData[c]) : 0)];
        const mu = this._dot(x, params.slice(0, p + 1));

        return times.map(t => {
            const logT = Math.log(Math.max(t, 1e-10));
            const z = (logT - mu) / sigma;

            let survival, hazard;
            switch (model.distribution) {
                case 'weibull': {
                    const cumH = Math.exp(z);
                    survival = Math.exp(-cumH);
                    hazard = cumH / (sigma * Math.max(t, 1e-10));
                    break;
                }
                case 'lognormal': {
                    survival = 1 - this._normalCDF(z);
                    const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
                    hazard = phi / ((survival + this.EPSILON) * sigma * Math.max(t, 1e-10));
                    break;
                }
                case 'loglogistic': {
                    survival = 1 / (1 + Math.exp(z));
                    hazard = Math.exp(z) / ((1 + Math.exp(z)) * sigma * Math.max(t, 1e-10));
                    break;
                }
                default:
                    survival = 1;
                    hazard = 0;
            }

            const cumHazard = -Math.log(survival + this.EPSILON);
            return { time: t, survival, hazard, cumHazard };
        });
    }

    // ─── Concordance Index ─────────────────────────────────────────────

    /**
     * Compute concordance index for a fitted model on data
     */
    concordanceIndex(model, data) {
        const beta = model._beta || model._params;
        const covariates = model.covariates;
        return this._concordance(beta, data, covariates);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.CoxRegressionEngine = CoxRegressionEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CoxRegressionEngine };
}
