/**
 * MAIC & STC Engine for HTA Artifact Standard
 *
 * Matching-Adjusted Indirect Comparison (MAIC) and Simulated Treatment
 * Comparison (STC) for single-arm trial submissions per NICE TSD 18.
 *
 * References:
 * - Signorovitch et al. (2010) Comparative effectiveness without head-to-head trials
 * - Signorovitch et al. (2012) Matching-adjusted indirect comparisons: a new tool for timely comparative effectiveness research
 * - Caro & Ishak (2010) No head-to-head trial? Simulate the missing arms
 * - Phillippo et al. (2016) NICE DSU TSD 18: Methods for population-adjusted indirect comparisons
 *
 * Features:
 * - Entropy balancing (Newton method) or logistic propensity weighting
 * - Effective sample size diagnostics
 * - Balance table with standardised mean differences
 * - Non-parametric bootstrap confidence intervals
 * - STC via outcome regression and marginalisation
 * - Deterministic via PCG32
 */

var PCG32Ref = (function resolvePCG32() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) {
        return globalThis.PCG32;
    }
    if (typeof require === 'function') {
        try {
            return require('../utils/pcg32').PCG32;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Standard normal CDF (Abramowitz & Stegun 26.2.17)
 */
function normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1.0 / (1.0 + p * Math.abs(x));
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
    return 0.5 * (1.0 + sign * y);
}

/**
 * Two-sided p-value from z-score
 */
function zToPValue(z) {
    return 2 * (1 - normalCDF(Math.abs(z)));
}

/**
 * Normal quantile (Beasley-Springer-Moro rational approximation)
 */
function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [
        -3.969683028665376e+01, 2.209460984245205e+02,
        -2.759285104469687e+02, 1.383577518672690e+02,
        -3.066479806614716e+01, 2.506628277459239e+00
    ];
    const b = [
        -5.447609879822406e+01, 1.615858368580409e+02,
        -1.556989798598866e+02, 6.680131188771972e+01,
        -1.328068155288572e+01
    ];
    const c = [
        -7.784894002430293e-03, -3.223964580411365e-01,
        -2.400758277161838e+00, -2.549732539343734e+00,
        4.374664141464968e+00, 2.938163982698783e+00
    ];
    const d = [
        7.784695709041462e-03, 3.224671290700398e-01,
        2.445134137142996e+00, 3.754408661907416e+00
    ];

    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
               (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
}

/**
 * Mean of an array
 */
function mean(arr) {
    if (!arr.length) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
}

/**
 * Weighted mean
 */
function weightedMean(values, weights) {
    let num = 0, den = 0;
    for (let i = 0; i < values.length; i++) {
        num += values[i] * weights[i];
        den += weights[i];
    }
    return den === 0 ? 0 : num / den;
}

/**
 * Standard deviation (population)
 */
function stdDev(arr) {
    const m = mean(arr);
    let ss = 0;
    for (let i = 0; i < arr.length; i++) ss += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(ss / arr.length);
}

/**
 * Weighted standard deviation
 */
function weightedStdDev(values, weights) {
    const wm = weightedMean(values, weights);
    let num = 0, den = 0;
    for (let i = 0; i < values.length; i++) {
        num += weights[i] * (values[i] - wm) * (values[i] - wm);
        den += weights[i];
    }
    return den === 0 ? 0 : Math.sqrt(num / den);
}

/**
 * Pooled standard deviation for SMD
 */
function pooledSD(arr1, arr2) {
    const n1 = arr1.length, n2 = typeof arr2 === 'number' ? arr2 : arr2.length;
    const sd1 = stdDev(arr1);
    // For aggregate, we approximate with the IPD SD
    return sd1;
}

/**
 * Standardised mean difference
 */
function smdCalc(mean1, mean2, sd) {
    if (sd === 0) return 0;
    return (mean1 - mean2) / sd;
}

// ─── MAICSTCEngine ────────────────────────────────────────────────────

class MAICSTCEngine {
    /**
     * @param {Object} options
     * @param {number} [options.seed=12345] - RNG seed for bootstrap
     * @param {number} [options.maxIter=500] - Max Newton iterations
     * @param {number} [options.tol=1e-8] - Convergence tolerance
     * @param {number} [options.confLevel=0.95] - Confidence level
     */
    constructor(options = {}) {
        this.options = {
            seed: 12345,
            maxIter: 500,
            tol: 1e-8,
            confLevel: 0.95,
            ...options
        };

        if (PCG32Ref) {
            this.rng = new PCG32Ref(this.options.seed);
        } else {
            // Minimal fallback PRNG (LCG)
            let s = this.options.seed;
            this.rng = {
                nextDouble: () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; },
                nextFloat: () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; },
                normal: (mu, sd) => {
                    let u1, u2;
                    do { u1 = this.rng.nextDouble(); } while (u1 === 0);
                    u2 = this.rng.nextDouble();
                    return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                }
            };
        }
    }

    // ─── Input validation ──────────────────────────────────────────

    /**
     * Validate IPD data and aggregate data share the same covariates
     */
    _validateInputs(ipdData, aggregateData) {
        if (!Array.isArray(ipdData) || ipdData.length === 0) {
            throw new Error('ipdData must be a non-empty array');
        }
        if (!aggregateData || typeof aggregateData !== 'object') {
            throw new Error('aggregateData must be an object');
        }
        if (!aggregateData.means || typeof aggregateData.means !== 'object') {
            throw new Error('aggregateData.means must be an object of covariate means');
        }
        if (!aggregateData.outcome || typeof aggregateData.outcome !== 'object') {
            throw new Error('aggregateData.outcome must be an object with effect and se');
        }

        const aggCovs = Object.keys(aggregateData.means);
        if (aggCovs.length === 0) {
            throw new Error('aggregateData.means must contain at least one covariate');
        }

        // Check every IPD patient has the required covariates
        for (let i = 0; i < ipdData.length; i++) {
            const pat = ipdData[i];
            if (!pat.covariates || typeof pat.covariates !== 'object') {
                throw new Error(`ipdData[${i}] is missing covariates object`);
            }
            for (const cov of aggCovs) {
                if (typeof pat.covariates[cov] === 'undefined' || pat.covariates[cov] === null) {
                    throw new Error(`ipdData[${i}] is missing covariate '${cov}'`);
                }
            }
        }

        return aggCovs;
    }

    /**
     * Extract covariate matrix (n x p) from IPD
     */
    _extractCovariateMatrix(ipdData, covNames) {
        const n = ipdData.length;
        const p = covNames.length;
        const X = new Array(n);
        for (let i = 0; i < n; i++) {
            X[i] = new Array(p);
            for (let j = 0; j < p; j++) {
                X[i][j] = ipdData[i].covariates[covNames[j]];
            }
        }
        return X;
    }

    // ─── Entropy balancing (Newton method) ─────────────────────────

    /**
     * Entropy balancing: find weights minimising KL divergence
     * subject to weighted covariate means matching aggregate means.
     *
     * log(w_i) = beta' * (x_i - target)   (tilting model)
     * Newton-Raphson on the dual problem.
     *
     * @returns {{weights: number[], convergence: boolean, iterations: number}}
     */
    _entropyBalance(X, targetMeans) {
        const n = X.length;
        const p = X[0].length;

        // Centre covariates around target means
        const Xc = new Array(n);
        for (let i = 0; i < n; i++) {
            Xc[i] = new Array(p);
            for (let j = 0; j < p; j++) {
                Xc[i][j] = X[i][j] - targetMeans[j];
            }
        }

        // Initialise Lagrange multipliers
        let beta = new Array(p).fill(0);
        let converged = false;
        let iter = 0;

        for (iter = 0; iter < this.options.maxIter; iter++) {
            // Compute weights: w_i = exp(beta . Xc_i) / n
            const logW = new Array(n);
            let maxLogW = -Infinity;
            for (let i = 0; i < n; i++) {
                let dot = 0;
                for (let j = 0; j < p; j++) dot += beta[j] * Xc[i][j];
                logW[i] = dot;
                if (dot > maxLogW) maxLogW = dot;
            }

            // Stable softmax-like normalisation
            const w = new Array(n);
            let sumW = 0;
            for (let i = 0; i < n; i++) {
                w[i] = Math.exp(logW[i] - maxLogW);
                sumW += w[i];
            }
            for (let i = 0; i < n; i++) w[i] /= sumW;

            // Gradient: g_j = sum(w_i * Xc_ij)
            const grad = new Array(p).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < p; j++) {
                    grad[j] += w[i] * Xc[i][j];
                }
            }

            // Check convergence
            let maxGrad = 0;
            for (let j = 0; j < p; j++) {
                if (Math.abs(grad[j]) > maxGrad) maxGrad = Math.abs(grad[j]);
            }
            if (maxGrad < this.options.tol) {
                converged = true;
                // Return unnormalised weights that sum to n
                const weights = new Array(n);
                let sumFinal = 0;
                for (let i = 0; i < n; i++) {
                    weights[i] = Math.exp(logW[i] - maxLogW);
                    sumFinal += weights[i];
                }
                for (let i = 0; i < n; i++) weights[i] = weights[i] / sumFinal * n;
                return { weights, convergence: true, iterations: iter + 1 };
            }

            // Hessian: H_jk = sum(w_i * Xc_ij * Xc_ik) - g_j * g_k
            const H = new Array(p);
            for (let j = 0; j < p; j++) {
                H[j] = new Array(p).fill(0);
                for (let k = 0; k < p; k++) {
                    for (let i = 0; i < n; i++) {
                        H[j][k] += w[i] * Xc[i][j] * Xc[i][k];
                    }
                    H[j][k] -= grad[j] * grad[k];
                }
            }

            // Solve H * delta = -grad using Cholesky or direct inverse for small p
            const delta = this._solveLinear(H, grad.map(g => -g), p);
            if (!delta) {
                // Fallback: gradient descent step
                for (let j = 0; j < p; j++) beta[j] -= 0.1 * grad[j];
            } else {
                for (let j = 0; j < p; j++) beta[j] += delta[j];
            }
        }

        // Did not converge — return best weights anyway
        const logW = new Array(n);
        let maxLogW = -Infinity;
        for (let i = 0; i < n; i++) {
            let dot = 0;
            for (let j = 0; j < p; j++) dot += beta[j] * Xc[i][j];
            logW[i] = dot;
            if (dot > maxLogW) maxLogW = dot;
        }
        const weights = new Array(n);
        let sumW = 0;
        for (let i = 0; i < n; i++) {
            weights[i] = Math.exp(logW[i] - maxLogW);
            sumW += weights[i];
        }
        for (let i = 0; i < n; i++) weights[i] = weights[i] / sumW * n;

        return { weights, convergence: false, iterations: iter };
    }

    /**
     * Solve A * x = b for small systems (Gaussian elimination with partial pivoting)
     */
    _solveLinear(A, b, p) {
        // Deep copy
        const M = A.map(row => [...row]);
        const rhs = [...b];

        for (let col = 0; col < p; col++) {
            // Partial pivot
            let maxVal = Math.abs(M[col][col]);
            let maxRow = col;
            for (let row = col + 1; row < p; row++) {
                if (Math.abs(M[row][col]) > maxVal) {
                    maxVal = Math.abs(M[row][col]);
                    maxRow = row;
                }
            }
            if (maxVal < 1e-14) return null; // Singular

            if (maxRow !== col) {
                [M[col], M[maxRow]] = [M[maxRow], M[col]];
                [rhs[col], rhs[maxRow]] = [rhs[maxRow], rhs[col]];
            }

            // Eliminate below
            for (let row = col + 1; row < p; row++) {
                const factor = M[row][col] / M[col][col];
                for (let k = col; k < p; k++) {
                    M[row][k] -= factor * M[col][k];
                }
                rhs[row] -= factor * rhs[col];
            }
        }

        // Back-substitution
        const x = new Array(p);
        for (let i = p - 1; i >= 0; i--) {
            let s = rhs[i];
            for (let j = i + 1; j < p; j++) s -= M[i][j] * x[j];
            if (Math.abs(M[i][i]) < 1e-14) return null;
            x[i] = s / M[i][i];
        }
        return x;
    }

    // ─── Logistic propensity weighting ─────────────────────────────

    /**
     * Logistic regression approach: model P(in aggregate trial | X)
     * using method-of-moments (matching first moments).
     *
     * Simplified: fit logistic regression by IRLS where the aggregate arm
     * is represented by pseudo-observations at the aggregate means.
     *
     * In practice for MAIC the logistic weights are often estimated via
     * the same entropy/tilting approach. Here we implement a distinct
     * logistic calibration: iterate propensity scores until balance.
     *
     * @returns {{weights: number[], convergence: boolean, iterations: number}}
     */
    _logisticWeights(X, targetMeans) {
        const n = X.length;
        const p = X[0].length;

        // Use entropy balancing formulation but with logistic link:
        // w_i = exp(beta . x_i) — same dual as entropy but interpreted as odds
        // For simplicity and numerical stability, we use the same Newton
        // solver but with logistic parametrisation.

        // Create augmented dataset: IPD (label=0) + pseudo aggregate (label=1)
        // Pseudo aggregate: nPseudo copies at target means
        const nPseudo = n; // same size
        const labels = new Array(n + nPseudo);
        const XAll = new Array(n + nPseudo);

        for (let i = 0; i < n; i++) {
            XAll[i] = X[i];
            labels[i] = 0;
        }
        for (let i = 0; i < nPseudo; i++) {
            XAll[n + i] = targetMeans;
            labels[n + i] = 1;
        }

        // IRLS logistic regression
        let beta = new Array(p + 1).fill(0); // p covariates + intercept
        let converged = false;
        let iter = 0;

        for (iter = 0; iter < this.options.maxIter; iter++) {
            // Compute probabilities
            const prob = new Array(n + nPseudo);
            for (let i = 0; i < n + nPseudo; i++) {
                let eta = beta[0]; // intercept
                for (let j = 0; j < p; j++) {
                    eta += beta[j + 1] * XAll[i][j];
                }
                prob[i] = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, eta))));
            }

            // Gradient
            const grad = new Array(p + 1).fill(0);
            for (let i = 0; i < n + nPseudo; i++) {
                const r = labels[i] - prob[i];
                grad[0] += r;
                for (let j = 0; j < p; j++) {
                    grad[j + 1] += r * XAll[i][j];
                }
            }

            let maxGrad = 0;
            for (let j = 0; j <= p; j++) {
                if (Math.abs(grad[j]) > maxGrad) maxGrad = Math.abs(grad[j]);
            }
            if (maxGrad < this.options.tol) {
                converged = true;
                break;
            }

            // Hessian
            const dim = p + 1;
            const H = new Array(dim);
            for (let j = 0; j < dim; j++) H[j] = new Array(dim).fill(0);

            for (let i = 0; i < n + nPseudo; i++) {
                const w = prob[i] * (1 - prob[i]);
                // Construct xi = [1, x_1, ..., x_p]
                const xi = [1, ...XAll[i]];
                for (let j = 0; j < dim; j++) {
                    for (let k = 0; k < dim; k++) {
                        H[j][k] -= w * xi[j] * xi[k];
                    }
                }
            }

            const delta = this._solveLinear(
                H.map(row => row.map(v => -v)),
                grad,
                dim
            );

            if (!delta) {
                for (let j = 0; j <= p; j++) beta[j] += 0.01 * grad[j];
            } else {
                for (let j = 0; j <= p; j++) beta[j] += delta[j];
            }
        }

        // Compute weights for IPD subjects: w_i = p_i / (1 - p_i) (odds)
        const weights = new Array(n);
        for (let i = 0; i < n; i++) {
            let eta = beta[0];
            for (let j = 0; j < p; j++) {
                eta += beta[j + 1] * X[i][j];
            }
            const pi = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, eta))));
            weights[i] = Math.max(1e-10, pi / (1 - pi + 1e-15));
        }

        // Normalise so mean weight = 1
        const mw = mean(weights);
        for (let i = 0; i < n; i++) weights[i] /= mw;

        return { weights, convergence: converged, iterations: iter };
    }

    // ─── Effective sample size ──────────────────────────────────────

    /**
     * ESS = (sum w_i)^2 / sum(w_i^2)
     */
    _effectiveSampleSize(weights) {
        let sumW = 0, sumW2 = 0;
        for (let i = 0; i < weights.length; i++) {
            sumW += weights[i];
            sumW2 += weights[i] * weights[i];
        }
        return sumW2 === 0 ? 0 : (sumW * sumW) / sumW2;
    }

    // ─── Balance diagnostics ────────────────────────────────────────

    /**
     * Compute balance table: SMD before and after weighting
     */
    balanceDiagnostics(weights, ipdData, aggregateData) {
        const covNames = Object.keys(aggregateData.means);
        const table = [];

        for (const cov of covNames) {
            const values = ipdData.map(d => d.covariates[cov]);
            const ipdMean = mean(values);
            const ipdWeightedMean = weightedMean(values, weights);
            const aggMean = aggregateData.means[cov];
            const sd = stdDev(values);
            const smd = smdCalc(ipdMean, aggMean, sd);
            const wsd = weightedStdDev(values, weights);
            const smdWeighted = wsd === 0 ? 0 : smdCalc(ipdWeightedMean, aggMean, wsd);

            table.push({
                covariate: cov,
                ipdMean,
                ipdWeightedMean,
                aggMean,
                smd: Math.abs(smd),
                smdWeighted: Math.abs(smdWeighted)
            });
        }

        return table;
    }

    // ─── Weighted outcome estimation ────────────────────────────────

    /**
     * Estimate weighted outcome for IPD
     */
    _weightedOutcome(ipdData, weights, outcomeType) {
        const n = ipdData.length;
        const outcomes = ipdData.map(d => d.outcome);

        if (outcomeType === 'binary') {
            // Weighted proportion → log-odds
            const wSum = weights.reduce((a, b) => a + b, 0);
            let wEvents = 0;
            for (let i = 0; i < n; i++) wEvents += weights[i] * outcomes[i];
            const p = wEvents / wSum;
            const logOdds = Math.log((p + 1e-10) / (1 - p + 1e-10));
            const se = Math.sqrt(1 / (wEvents + 1e-10) + 1 / (wSum - wEvents + 1e-10));
            return { effect: logOdds, se, prop: p };
        } else if (outcomeType === 'survival') {
            // Weighted log-HR approximation via weighted Cox-like estimator
            // Simplified: weighted mean of log outcome
            const logOutcomes = outcomes.map(o => Math.log(Math.max(o, 1e-10)));
            const wm = weightedMean(logOutcomes, weights);
            const wsd = weightedStdDev(logOutcomes, weights);
            const ess = this._effectiveSampleSize(weights);
            const se = wsd / Math.sqrt(Math.max(ess, 1));
            return { effect: wm, se };
        } else {
            // Continuous: weighted mean difference
            const wm = weightedMean(outcomes, weights);
            const wsd = weightedStdDev(outcomes, weights);
            const ess = this._effectiveSampleSize(weights);
            const se = wsd / Math.sqrt(Math.max(ess, 1));
            return { effect: wm, se };
        }
    }

    // ─── MAIC main method ──────────────────────────────────────────

    /**
     * Matching-Adjusted Indirect Comparison
     *
     * @param {Array} ipdData - [{id, outcome, covariates: {age, male, ...}}, ...]
     * @param {Object} aggregateData - {means: {age: 58, ...}, outcome: {effect, se}, n}
     * @param {Object} [options] - {outcomeType, method}
     * @returns {Object} MAIC result
     */
    maic(ipdData, aggregateData, options = {}) {
        const outcomeType = options.outcomeType || 'continuous';
        const method = options.method || 'entropy';

        const covNames = this._validateInputs(ipdData, aggregateData);
        const X = this._extractCovariateMatrix(ipdData, covNames);
        const targetMeans = covNames.map(c => aggregateData.means[c]);

        // Step 1: Find weights
        let weightResult;
        if (method === 'logistic') {
            weightResult = this._logisticWeights(X, targetMeans);
        } else {
            weightResult = this._entropyBalance(X, targetMeans);
        }

        const weights = weightResult.weights;
        const ess = this._effectiveSampleSize(weights);

        // Step 2: Balance table
        const balanceTable = this.balanceDiagnostics(weights, ipdData, aggregateData);

        // Step 3: Weighted outcome
        const ipdWeightedOutcome = this._weightedOutcome(ipdData, weights, outcomeType);

        // Step 4: Indirect comparison (A vs B)
        const aggEffect = aggregateData.outcome.effect;
        const aggSE = aggregateData.outcome.se;

        let indirectEffect, indirectSE;
        if (outcomeType === 'binary') {
            // Compare log-odds: A vs B
            const aggLogOdds = Math.log((aggEffect + 1e-10) / (1 - aggEffect + 1e-10));
            const aggLogOddsSE = 1 / (aggregateData.n * aggEffect * (1 - aggEffect) + 1e-10);
            indirectEffect = ipdWeightedOutcome.effect - aggLogOdds;
            indirectSE = Math.sqrt(ipdWeightedOutcome.se * ipdWeightedOutcome.se + aggLogOddsSE);
        } else {
            // Compare on same scale (log-HR, mean difference, etc.)
            indirectEffect = ipdWeightedOutcome.effect - aggEffect;
            indirectSE = Math.sqrt(ipdWeightedOutcome.se * ipdWeightedOutcome.se + aggSE * aggSE);
        }

        const z = indirectSE > 0 ? indirectEffect / indirectSE : 0;
        const pValue = zToPValue(z);
        const alpha = 1 - this.options.confLevel;
        const zCrit = normalQuantile(1 - alpha / 2);
        const ci = [indirectEffect - zCrit * indirectSE, indirectEffect + zCrit * indirectSE];

        // Weight diagnostics
        const meanW = mean(weights);
        let maxW = -Infinity;
        for (let i = 0; i < weights.length; i++) {
            if (weights[i] > maxW) maxW = weights[i];
        }
        const wStd = stdDev(weights);
        const weightCV = meanW > 0 ? wStd / meanW : 0;

        return {
            method: 'MAIC',
            balancingMethod: method,
            weights,
            effectiveSampleSize: ess,
            originalN: ipdData.length,
            balanceTable,
            ipdWeightedOutcome: {
                effect: ipdWeightedOutcome.effect,
                se: ipdWeightedOutcome.se
            },
            indirectEffect: {
                effect: indirectEffect,
                se: indirectSE,
                ci,
                pValue
            },
            diagnostics: {
                maxWeight: maxW,
                meanWeight: meanW,
                weightCV,
                convergence: weightResult.convergence,
                iterations: weightResult.iterations
            }
        };
    }

    // ─── STC main method ───────────────────────────────────────────

    /**
     * Simulated Treatment Comparison (Caro & Ishak 2010)
     *
     * Fit outcome ~ covariates on IPD, then predict at aggregate means.
     *
     * @param {Array} ipdData - [{id, outcome, covariates: {...}}, ...]
     * @param {Object} aggregateData - {means: {...}, outcome: {effect, se}, n}
     * @param {Object} [options] - {outcomeType}
     * @returns {Object} STC result
     */
    stc(ipdData, aggregateData, options = {}) {
        const outcomeType = options.outcomeType || 'continuous';
        const covNames = this._validateInputs(ipdData, aggregateData);
        const n = ipdData.length;
        const p = covNames.length;

        // Build design matrix with intercept: [1, x1, x2, ..., xp]
        const X = new Array(n);
        const y = new Array(n);
        for (let i = 0; i < n; i++) {
            X[i] = new Array(p + 1);
            X[i][0] = 1; // intercept
            for (let j = 0; j < p; j++) {
                X[i][j + 1] = ipdData[i].covariates[covNames[j]];
            }
            y[i] = ipdData[i].outcome;
        }

        // OLS: beta = (X'X)^-1 X'y
        const dim = p + 1;
        const XtX = new Array(dim);
        const Xty = new Array(dim).fill(0);
        for (let j = 0; j < dim; j++) {
            XtX[j] = new Array(dim).fill(0);
            for (let k = 0; k < dim; k++) {
                for (let i = 0; i < n; i++) {
                    XtX[j][k] += X[i][j] * X[i][k];
                }
            }
            for (let i = 0; i < n; i++) {
                Xty[j] += X[i][j] * y[i];
            }
        }

        const beta = this._solveLinear(XtX, Xty, dim);
        if (!beta) {
            throw new Error('STC regression failed: singular design matrix');
        }

        // Residual variance
        let rss = 0;
        for (let i = 0; i < n; i++) {
            let yhat = 0;
            for (let j = 0; j < dim; j++) yhat += X[i][j] * beta[j];
            rss += (y[i] - yhat) * (y[i] - yhat);
        }
        const sigmaSquared = rss / Math.max(n - dim, 1);

        // Predict at aggregate means
        const xAgg = [1, ...covNames.map(c => aggregateData.means[c])];
        let predictedOutcome = 0;
        for (let j = 0; j < dim; j++) predictedOutcome += xAgg[j] * beta[j];

        // Prediction SE: sqrt(sigma^2 * xAgg' (X'X)^-1 xAgg)
        // Compute (X'X)^-1
        const identity = new Array(dim);
        for (let j = 0; j < dim; j++) {
            identity[j] = new Array(dim).fill(0);
            identity[j][j] = 1;
        }
        const XtXinvCols = [];
        for (let col = 0; col < dim; col++) {
            const colVec = identity.map(row => row[col]);
            const solved = this._solveLinear(XtX, colVec, dim);
            XtXinvCols.push(solved || new Array(dim).fill(0));
        }
        // xAgg' (X'X)^-1 xAgg
        let varPred = 0;
        for (let j = 0; j < dim; j++) {
            for (let k = 0; k < dim; k++) {
                varPred += xAgg[j] * XtXinvCols[k][j] * xAgg[k];
            }
        }
        const predSE = Math.sqrt(Math.max(0, sigmaSquared * varPred));

        // Indirect comparison: predicted IPD outcome vs aggregate outcome
        const aggEffect = aggregateData.outcome.effect;
        const aggSE = aggregateData.outcome.se;
        const indirectEffect = predictedOutcome - aggEffect;
        const indirectSE = Math.sqrt(predSE * predSE + aggSE * aggSE);

        const z = indirectSE > 0 ? indirectEffect / indirectSE : 0;
        const pValue = zToPValue(z);
        const alpha = 1 - this.options.confLevel;
        const zCrit = normalQuantile(1 - alpha / 2);
        const ci = [indirectEffect - zCrit * indirectSE, indirectEffect + zCrit * indirectSE];

        // Named coefficients
        const coefficients = {};
        coefficients['intercept'] = beta[0];
        for (let j = 0; j < p; j++) {
            coefficients[covNames[j]] = beta[j + 1];
        }

        // Balance table (unweighted — STC adjusts via regression)
        const balanceTable = covNames.map(cov => {
            const values = ipdData.map(d => d.covariates[cov]);
            const ipdMean = mean(values);
            const aggMean = aggregateData.means[cov];
            const sd = stdDev(values);
            return {
                covariate: cov,
                ipdMean,
                ipdWeightedMean: ipdMean, // STC: no weighting
                aggMean,
                smd: Math.abs(smdCalc(ipdMean, aggMean, sd)),
                smdWeighted: Math.abs(smdCalc(ipdMean, aggMean, sd)) // same, adjusted via regression
            };
        });

        return {
            method: 'STC',
            coefficients,
            predictedOutcome,
            predictionSE: predSE,
            residualVariance: sigmaSquared,
            originalN: n,
            effectiveSampleSize: n, // STC uses full sample
            balanceTable,
            ipdWeightedOutcome: {
                effect: predictedOutcome,
                se: predSE
            },
            indirectEffect: {
                effect: indirectEffect,
                se: indirectSE,
                ci,
                pValue
            },
            diagnostics: {
                rSquared: 1 - rss / (stdDev(y) * stdDev(y) * n || 1),
                convergence: true,
                nCovariates: p
            }
        };
    }

    // ─── Bootstrap CI ──────────────────────────────────────────────

    /**
     * Non-parametric bootstrap CI for MAIC
     *
     * @param {Array} ipdData
     * @param {Object} aggregateData
     * @param {Object} [options]
     * @param {number} [nBoot=1000]
     * @returns {Object} Bootstrap results
     */
    bootstrapCI(ipdData, aggregateData, options = {}, nBoot = 1000) {
        const n = ipdData.length;
        const effects = [];

        for (let b = 0; b < nBoot; b++) {
            // Resample IPD with replacement
            const bootSample = new Array(n);
            for (let i = 0; i < n; i++) {
                const idx = Math.floor(this.rng.nextDouble() * n);
                bootSample[i] = ipdData[idx];
            }

            try {
                const result = this.maic(bootSample, aggregateData, options);
                effects.push(result.indirectEffect.effect);
            } catch (e) {
                // Skip failed bootstrap iterations
            }
        }

        if (effects.length === 0) {
            return { ci: [NaN, NaN], se: NaN, nSuccessful: 0 };
        }

        effects.sort((a, b) => a - b);
        const alpha = 1 - this.options.confLevel;
        const lo = Math.floor(effects.length * (alpha / 2));
        const hi = Math.floor(effects.length * (1 - alpha / 2));

        const bootMean = mean(effects);
        const bootSE = stdDev(effects);

        return {
            ci: [effects[Math.max(0, lo)], effects[Math.min(effects.length - 1, hi)]],
            se: bootSE,
            mean: bootMean,
            nSuccessful: effects.length,
            nBoot
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MAICSTCEngine = MAICSTCEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MAICSTCEngine };
}
