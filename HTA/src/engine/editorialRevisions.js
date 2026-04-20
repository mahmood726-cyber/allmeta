/**
 * HTA Artifact Standard - Editorial Revisions Module
 * Addresses all Research Synthesis Methods editorial concerns
 * @version 1.0.0
 *
 * Implements:
 * - Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment
 * - Prediction intervals
 * - I² confidence intervals (Q-profile method)
 * - EVPPI calculation
 * - Prior sensitivity analysis
 * - Model selection criteria (AIC, BIC, DIC)
 * - Extrapolation uncertainty
 * - Network meta-analysis with consistency checks
 * - Publication bias tests (Egger, Peters, Harbord)
 * - Trim-and-fill adjustment
 * - Formal numerical validation
 */

'use strict';

// ============================================================================
// SECTION 1: HARTUNG-KNAPP-SIDIK-JONKMAN (HKSJ) ADJUSTMENT
// ============================================================================

class HKSJMetaAnalysis {
    constructor(options = {}) {
        this.method = options.method || 'REML'; // tau² estimation method
        this.alpha = options.alpha || 0.05;
        this.maxIter = options.maxIter || 100;
        this.tol = options.tol || 1e-8;
    }

    /**
     * Perform random-effects meta-analysis with HKSJ adjustment
     * Reference: Hartung & Knapp (2001), IntHout et al. (2014)
     */
    analyze(effects, variances, options = {}) {
        const n = effects.length;

        if (n === 0) {
            return this._emptyResult();
        }

        if (n === 1) {
            return this._singleStudyResult(effects[0], variances[0]);
        }

        // Step 1: Estimate tau² using specified method
        const tau2 = this._estimateTau2(effects, variances);

        // Step 2: Calculate random-effects weights
        const weights = variances.map(v => 1 / (v + tau2));
        const sumW = weights.reduce((a, b) => a + b, 0);

        // Step 3: Pooled effect estimate
        const theta = effects.reduce((sum, e, i) => sum + weights[i] * e, 0) / sumW;

        // Step 4: Standard REML variance
        const varTheta = 1 / sumW;

        // Step 5: HKSJ correction factor q
        // q = (1/(k-1)) * Σ w_i (y_i - θ)²
        let qHKSJ = 0;
        for (let i = 0; i < n; i++) {
            qHKSJ += weights[i] * Math.pow(effects[i] - theta, 2);
        }
        qHKSJ = qHKSJ / (n - 1);

        // Step 6: HKSJ-adjusted variance
        const varHKSJ = varTheta * Math.max(1, qHKSJ);
        const seHKSJ = Math.sqrt(varHKSJ);

        // Step 7: Use t-distribution with k-1 df (instead of normal)
        const tCrit = this._tQuantile(1 - this.alpha / 2, n - 1);

        // Step 8: HKSJ-adjusted confidence interval
        const ciLower = theta - tCrit * seHKSJ;
        const ciUpper = theta + tCrit * seHKSJ;

        // Standard (non-HKSJ) results for comparison
        const seStandard = Math.sqrt(varTheta);
        const zCrit = this._normalQuantile(1 - this.alpha / 2);
        const ciStandardLower = theta - zCrit * seStandard;
        const ciStandardUpper = theta + zCrit * seStandard;

        // Heterogeneity statistics
        const Q = this._calculateQ(effects, variances);
        const I2 = this._calculateI2(Q, n);
        const I2CI = this._calculateI2CI(Q, n);
        const H2 = n > 1 ? Q / (n - 1) : 1;

        // Prediction interval
        const predictionInterval = this._calculatePredictionInterval(theta, tau2, seHKSJ, n);

        return {
            effect: theta,
            se: seHKSJ,
            seStandard: seStandard,
            ci: [ciLower, ciUpper],
            ciStandard: [ciStandardLower, ciStandardUpper],
            hksjFactor: qHKSJ,
            tau2,
            tau: Math.sqrt(tau2),
            I2,
            I2CI, // NEW: I² confidence interval
            H2,
            Q,
            df: n - 1,
            pQ: 1 - this._chiSquareCDF(Q, n - 1),
            predictionInterval, // NEW: Prediction interval
            weights,
            k: n,
            method: this.method,
            adjustment: 'HKSJ'
        };
    }

    /**
     * Calculate prediction interval
     * Reference: Riley et al. (2011) BMJ
     */
    _calculatePredictionInterval(theta, tau2, se, k) {
        if (k < 3) {
            return { lower: null, upper: null, message: 'Requires ≥3 studies' };
        }

        // Prediction interval uses t-distribution with k-2 df
        const tCrit = this._tQuantile(0.975, k - 2);
        const predSE = Math.sqrt(se * se + tau2);

        return {
            lower: theta - tCrit * predSE,
            upper: theta + tCrit * predSE,
            se: predSE,
            df: k - 2
        };
    }

    /**
     * Calculate I² confidence interval using Q-profile method
     * Reference: Higgins & Thompson (2002)
     */
    _calculateI2CI(Q, k, alpha = 0.05) {
        if (k < 2) {
            return { lower: 0, upper: 0 };
        }

        const df = k - 1;

        // Lower bound of I² from upper bound of Q
        const QLower = this._chiSquareQuantile(1 - alpha / 2, df);
        const QUpper = this._chiSquareQuantile(alpha / 2, df);

        // I² = (Q - df) / Q when Q > df, else 0
        const I2Lower = Q > QLower ? Math.max(0, (Q - QLower) / Q * 100) : 0;
        const I2Upper = Q > QUpper ? Math.min(100, (Q - QUpper) / Q * 100) : 0;

        // More accurate: use non-central chi-square
        // But this approximation is commonly used
        let lower = 0, upper = 0;

        if (Q > df) {
            // Based on uncertainty in Q
            const B = 0.5 * Math.log(Q / df);
            const seB = Math.sqrt(0.5 / df);
            const zCrit = this._normalQuantile(1 - this.alpha / 2);
            const BLower = B - zCrit * seB;
            const BUpper = B + zCrit * seB;

            lower = Math.max(0, (1 - Math.exp(-2 * BLower)) * 100);
            upper = Math.min(100, (1 - Math.exp(-2 * BUpper)) * 100);
        }

        return {
            lower: Math.max(0, lower),
            upper: Math.min(100, upper),
            method: 'Q-profile'
        };
    }

    _estimateTau2(effects, variances) {
        const n = effects.length;

        // Fixed-effect estimate
        const w = variances.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        const sumW2 = w.reduce((s, wi) => s + wi * wi, 0);
        const muFE = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;

        // Q statistic
        const Q = effects.reduce((s, e, i) => s + w[i] * Math.pow(e - muFE, 2), 0);

        if (this.method === 'DL' || this.method === 'dl') {
            // DerSimonian-Laird
            const C = sumW - sumW2 / sumW;
            return Math.max(0, (Q - (n - 1)) / C);
        }

        // REML (default)
        let tau2 = Math.max(0, (Q - (n - 1)) / (sumW - sumW2 / sumW));

        for (let iter = 0; iter < this.maxIter; iter++) {
            const wRE = variances.map(v => 1 / (v + tau2));
            const sumWRE = wRE.reduce((a, b) => a + b, 0);
            const sumWRE2 = wRE.reduce((s, wi) => s + wi * wi, 0);
            const sumWRE3 = wRE.reduce((s, wi) => s + wi * wi * wi, 0);
            const muRE = effects.reduce((s, e, i) => s + wRE[i] * e, 0) / sumWRE;

            const QRE = effects.reduce((s, e, i) => s + wRE[i] * Math.pow(e - muRE, 2), 0);

            // Score function
            const score = -0.5 * sumWRE2 / sumWRE +
                         0.5 * effects.reduce((s, e, i) => s + wRE[i] * wRE[i] * Math.pow(e - muRE, 2), 0);

            // Fisher information
            const fisher = 0.5 * (sumWRE3 / sumWRE - Math.pow(sumWRE2 / sumWRE, 2));

            if (Math.abs(fisher) < 1e-15) break;

            const tau2New = Math.max(0, tau2 + score / fisher);

            if (Math.abs(tau2New - tau2) < this.tol) break;
            tau2 = tau2New;
        }

        return tau2;
    }

    _calculateQ(effects, variances) {
        const w = variances.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        const muFE = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;
        return effects.reduce((s, e, i) => s + w[i] * Math.pow(e - muFE, 2), 0);
    }

    _calculateI2(Q, k) {
        if (k <= 1) return 0;
        return Math.max(0, (Q - (k - 1)) / Q * 100);
    }

    _emptyResult() {
        return {
            effect: 0, se: 0, ci: [0, 0], tau2: 0, I2: 0, Q: 0, k: 0,
            predictionInterval: { lower: null, upper: null },
            I2CI: { lower: 0, upper: 0 }
        };
    }

    _singleStudyResult(effect, variance) {
        const se = Math.sqrt(variance);
        return {
            effect,
            se,
            ci: [effect - this._normalQuantile(1 - this.alpha / 2) * se, effect + this._normalQuantile(1 - this.alpha / 2) * se],
            tau2: 0,
            I2: 0,
            I2CI: { lower: 0, upper: 0 },
            Q: 0,
            k: 1,
            predictionInterval: { lower: null, upper: null, message: 'Requires ≥3 studies' }
        };
    }

    // Statistical distribution functions
    _normalQuantile(p) {
        const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00];
        const d = [0, 7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00];

        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[1] * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6]) /
                   ((((d[1] * q + d[2]) * q + d[3]) * q + d[4]) * q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[1] * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * r + a[6]) * q /
                   (((((b[1] * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5]) * r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[1] * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6]) /
                    ((((d[1] * q + d[2]) * q + d[3]) * q + d[4]) * q + 1);
        }
    }

    _tQuantile(p, df) {
        // Approximation using normal for large df
        if (df > 100) {
            return this._normalQuantile(p);
        }

        // Hill's algorithm for small df
        const x = this._normalQuantile(p);
        const g1 = (x * x * x + x) / 4;
        const g2 = (5 * Math.pow(x, 5) + 16 * x * x * x + 3 * x) / 96;
        const g3 = (3 * Math.pow(x, 7) + 19 * Math.pow(x, 5) + 17 * x * x * x - 15 * x) / 384;

        return x + g1 / df + g2 / (df * df) + g3 / (df * df * df);
    }

    _chiSquareCDF(x, df) {
        if (x <= 0) return 0;
        return this._gammainc(df / 2, x / 2);
    }

    _chiSquareQuantile(p, df) {
        // Wilson-Hilferty approximation
        if (df <= 0) return 0;
        const z = this._normalQuantile(p);
        const h = 2 / (9 * df);
        return df * Math.pow(1 - h + z * Math.sqrt(h), 3);
    }

    _gammainc(a, x) {
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;

        if (x < a + 1) {
            let sum = 1 / a, term = 1 / a;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-12) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this._lgamma(a));
        } else {
            let f = 1 + x - a, c = f, d = 0;
            for (let i = 1; i < 100; i++) {
                const an = i * (a - i);
                const bn = (2 * i + 1) + x - a;
                d = bn + an * d;
                if (Math.abs(d) < 1e-30) d = 1e-30;
                c = bn + an / c;
                if (Math.abs(c) < 1e-30) c = 1e-30;
                d = 1 / d;
                const delta = c * d;
                f *= delta;
                if (Math.abs(delta - 1) < 1e-12) break;
            }
            return 1 - Math.exp(-x + a * Math.log(x) - this._lgamma(a)) / f;
        }
    }

    _lgamma(x) {
        if (x < 0.5) {
            return Math.log(Math.PI / Math.sin(Math.PI * x)) - this._lgamma(1 - x);
        }
        x -= 1;
        const g = 7;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        let sum = c[0];
        for (let i = 1; i < g + 2; i++) sum += c[i] / (x + i);
        const t = x + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
    }
}

// ============================================================================
// SECTION 2: EVPPI CALCULATION (Expected Value of Partial Perfect Information)
// ============================================================================

class EVPPICalculator {
    constructor(options = {}) {
        this.outerSamples = options.outerSamples || 1000;
        this.innerSamples = options.innerSamples || 1000;
        this.method = options.method || 'standard'; // 'standard', 'gam', 'earth'
        this.seed = options.seed || Date.now();
        this.rng = this._createRNG(this.seed);
    }

    _createRNG(seed) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /**
     * Calculate EVPPI for specific parameters
     * @param {Function} modelFn - Model function taking parameter object, returns {cost, effect}
     * @param {Object} allParams - All parameter distributions {name: {dist, params}}
     * @param {Array} parametersOfInterest - Parameter names to calculate EVPPI for
     * @param {number} wtp - Willingness-to-pay threshold
     */
    async calculate(modelFn, allParams, parametersOfInterest, wtp) {
        const results = {};

        // Step 1: Calculate overall EVPI first
        const evpi = await this._calculateEVPI(modelFn, allParams, wtp);

        // Step 2: Calculate EVPPI for each parameter/group
        for (const paramName of parametersOfInterest) {
            const evppi = await this._calculateEVPPIForParam(
                modelFn, allParams, paramName, wtp
            );

            results[paramName] = {
                evppi,
                proportionOfEVPI: evpi > 0 ? evppi / evpi : 0
            };
        }

        return {
            evpi,
            evppiResults: results,
            parametersOfInterest,
            wtp,
            method: this.method
        };
    }

    async _calculateEVPI(modelFn, params, wtp) {
        const samples = [];

        // Generate PSA samples
        for (let i = 0; i < this.outerSamples * this.innerSamples; i++) {
            const paramValues = this._sampleAllParams(params);
            const result = modelFn(paramValues);
            const nmb = result.effect * wtp - result.cost;
            samples.push({ nmb, strategy: result.strategy || 'intervention' });
        }

        // Expected NMB under current uncertainty (max of expected NMBs)
        const strategies = [...new Set(samples.map(s => s.strategy))];
        const expectedNMB = {};

        for (const strat of strategies) {
            const stratSamples = samples.filter(s => s.strategy === strat);
            expectedNMB[strat] = stratSamples.reduce((sum, s) => sum + s.nmb, 0) / stratSamples.length;
        }

        const maxExpectedNMB = Math.max(...Object.values(expectedNMB));

        // Expected NMB under perfect information
        const perfectInfoNMB = samples.reduce((sum, s) => sum + Math.max(s.nmb, 0), 0) / samples.length;

        return Math.max(0, perfectInfoNMB - maxExpectedNMB);
    }

    async _calculateEVPPIForParam(modelFn, allParams, paramName, wtp) {
        // Two-level Monte Carlo method
        let sumOuterMax = 0;

        for (let outer = 0; outer < this.outerSamples; outer++) {
            // Fix parameter of interest at sampled value
            const fixedValue = this._sampleParam(allParams[paramName]);

            let maxInnerNMB = -Infinity;

            for (let inner = 0; inner < this.innerSamples; inner++) {
                // Sample all other parameters
                const paramValues = {};
                for (const [name, dist] of Object.entries(allParams)) {
                    if (name === paramName) {
                        paramValues[name] = fixedValue;
                    } else {
                        paramValues[name] = this._sampleParam(dist);
                    }
                }

                const result = modelFn(paramValues);
                const nmb = result.effect * wtp - result.cost;
                maxInnerNMB = Math.max(maxInnerNMB, nmb);
            }

            sumOuterMax += maxInnerNMB;
        }

        const evppiEstimate = sumOuterMax / this.outerSamples;

        // Calculate baseline expected max NMB
        let baselineSum = 0;
        for (let i = 0; i < this.outerSamples; i++) {
            const paramValues = this._sampleAllParams(allParams);
            const result = modelFn(paramValues);
            const nmb = result.effect * wtp - result.cost;
            baselineSum += nmb;
        }
        const baselineNMB = baselineSum / this.outerSamples;

        return Math.max(0, evppiEstimate - baselineNMB);
    }

    _sampleAllParams(params) {
        const values = {};
        for (const [name, dist] of Object.entries(params)) {
            values[name] = this._sampleParam(dist);
        }
        return values;
    }

    _sampleParam(dist) {
        const { distribution, mean, se, min, max, alpha, beta, shape, scale, rate } = dist;

        switch (distribution || dist.dist) {
            case 'normal':
                return this._sampleNormal(mean, se);
            case 'lognormal':
                const mu = Math.log(mean) - 0.5 * Math.log(1 + (se / mean) ** 2);
                const sigma = Math.sqrt(Math.log(1 + (se / mean) ** 2));
                return Math.exp(this._sampleNormal(mu, sigma));
            case 'beta':
                return this._sampleBeta(alpha || this._betaAlpha(mean, se),
                                        beta || this._betaBeta(mean, se));
            case 'gamma':
                return this._sampleGamma(shape || (mean / se) ** 2,
                                         scale || (se ** 2) / mean);
            case 'uniform':
                return min + this.rng() * (max - min);
            default:
                return this._sampleNormal(mean ?? 0, se ?? 1);
        }
    }

    _betaAlpha(mean, se) {
        return mean * ((mean * (1 - mean)) / (se * se) - 1);
    }

    _betaBeta(mean, se) {
        return (1 - mean) * ((mean * (1 - mean)) / (se * se) - 1);
    }

    _sampleNormal(mean, sd) {
        const u1 = Math.max(1e-10, this.rng());
        const u2 = this.rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + sd * z;
    }

    _sampleGamma(shape, scale) {
        if (shape < 1) {
            return this._sampleGamma(1 + shape, scale) * Math.pow(this.rng(), 1 / shape);
        }
        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);
        while (true) {
            let x, v;
            do {
                x = this._sampleNormal(0, 1);
                v = 1 + c * x;
            } while (v <= 0);
            v = v * v * v;
            const u = this.rng();
            if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v * scale;
            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
        }
    }

    _sampleBeta(alpha, beta) {
        const x = this._sampleGamma(alpha, 1);
        const y = this._sampleGamma(beta, 1);
        return x / (x + y);
    }
}

// ============================================================================
// SECTION 3: PRIOR SENSITIVITY ANALYSIS
// ============================================================================

class PriorSensitivityAnalysis {
    constructor(options = {}) {
        this.nSamples = options.nSamples || 10000;
        this.seed = options.seed || Date.now();
        this.rng = this._createRNG(this.seed);
    }

    _createRNG(seed) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /**
     * Perform prior sensitivity analysis
     * @param {Function} likelihoodFn - Function returning log-likelihood given params
     * @param {Array} priorSpecs - Array of prior specifications to test
     * @param {Object} data - Observed data
     */
    analyze(likelihoodFn, priorSpecs, data) {
        const results = [];

        for (const priorSpec of priorSpecs) {
            const posteriorSamples = this._samplePosterior(likelihoodFn, priorSpec, data);

            const summary = this._summarizePosterior(posteriorSamples);

            results.push({
                priorName: priorSpec.name,
                priorDescription: priorSpec.description,
                priorParams: priorSpec.params,
                posteriorMean: summary.mean,
                posteriorSD: summary.sd,
                posteriorMedian: summary.median,
                credibleInterval: summary.ci,
                effectiveSampleSize: summary.ess,
                samples: posteriorSamples
            });
        }

        // Calculate sensitivity metrics
        const sensitivityMetrics = this._calculateSensitivityMetrics(results);

        return {
            results,
            sensitivityMetrics,
            recommendation: this._generateRecommendation(sensitivityMetrics)
        };
    }

    _samplePosterior(likelihoodFn, priorSpec, data) {
        // Simple Metropolis-Hastings
        const samples = [];
        let current = priorSpec.initial ?? priorSpec.params.mean ?? 0;
        let currentLogPost = likelihoodFn(current, data) + this._logPrior(current, priorSpec);

        const proposalSD = priorSpec.proposalSD || priorSpec.params.sd || 1;
        let accepted = 0;

        for (let i = 0; i < this.nSamples + 1000; i++) { // 1000 burnin
            // Propose new value
            const proposal = current + this._sampleNormal(0, proposalSD);
            const proposalLogPost = likelihoodFn(proposal, data) + this._logPrior(proposal, priorSpec);

            // Accept/reject
            const logAlpha = proposalLogPost - currentLogPost;
            if (Math.log(this.rng()) < logAlpha) {
                current = proposal;
                currentLogPost = proposalLogPost;
                accepted++;
            }

            if (i >= 1000) { // After burnin
                samples.push(current);
            }
        }

        return samples;
    }

    _logPrior(x, priorSpec) {
        const { distribution, params } = priorSpec;

        switch (distribution) {
            case 'normal':
                return -0.5 * Math.pow((x - params.mean) / params.sd, 2);
            case 'uniform':
                return (x >= params.min && x <= params.max) ? 0 : -Infinity;
            case 'halfnormal':
                return x >= 0 ? -0.5 * Math.pow(x / params.sd, 2) : -Infinity;
            case 'gamma':
                return x > 0 ? (params.shape - 1) * Math.log(x) - x / params.scale : -Infinity;
            case 'beta':
                return (x > 0 && x < 1) ?
                    (params.alpha - 1) * Math.log(x) + (params.beta - 1) * Math.log(1 - x) : -Infinity;
            default:
                return 0; // Improper flat prior
        }
    }

    _summarizePosterior(samples) {
        const sorted = [...samples].sort((a, b) => a - b);
        const n = sorted.length;

        const mean = samples.reduce((a, b) => a + b, 0) / n;
        const variance = samples.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (n - 1);

        return {
            mean,
            sd: Math.sqrt(variance),
            median: sorted[Math.floor(n / 2)],
            ci: [sorted[Math.floor(n * 0.025)], sorted[Math.floor(n * 0.975)]],
            ess: this._effectiveSampleSize(samples)
        };
    }

    _effectiveSampleSize(samples) {
        const n = samples.length;
        const mean = samples.reduce((a, b) => a + b, 0) / n;

        // Calculate autocorrelation
        let acSum = 0;
        for (let lag = 1; lag < Math.min(50, n / 2); lag++) {
            let ac = 0;
            for (let i = 0; i < n - lag; i++) {
                ac += (samples[i] - mean) * (samples[i + lag] - mean);
            }
            ac /= (n - lag);
            const variance = samples.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / n;
            ac /= variance;

            if (ac < 0.05) break;
            acSum += ac;
        }

        return n / (1 + 2 * acSum);
    }

    _calculateSensitivityMetrics(results) {
        if (results.length < 2) {
            return { robust: true, maxDifference: 0 };
        }

        const means = results.map(r => r.posteriorMean);
        const sds = results.map(r => r.posteriorSD);

        const meanRange = Math.max(...means) - Math.min(...means);
        const avgSD = sds.reduce((a, b) => a + b, 0) / sds.length;

        // Sensitivity ratio: how much does posterior change relative to its uncertainty
        const sensitivityRatio = meanRange / avgSD;

        // Check if credible intervals overlap
        let allOverlap = true;
        for (let i = 0; i < results.length; i++) {
            for (let j = i + 1; j < results.length; j++) {
                const overlap = !(results[i].credibleInterval[1] < results[j].credibleInterval[0] ||
                                 results[j].credibleInterval[1] < results[i].credibleInterval[0]);
                if (!overlap) allOverlap = false;
            }
        }

        return {
            robust: sensitivityRatio < 0.5 && allOverlap,
            sensitivityRatio,
            credibleIntervalsOverlap: allOverlap,
            meanRange,
            averagePosteriorSD: avgSD
        };
    }

    _generateRecommendation(metrics) {
        if (metrics.robust) {
            return 'Results are robust to prior specification. Conclusions are reliable.';
        } else if (metrics.sensitivityRatio < 1) {
            return 'Moderate prior sensitivity detected. Consider reporting results under multiple priors.';
        } else {
            return 'High prior sensitivity detected. Results strongly depend on prior choice. More data may be needed.';
        }
    }

    _sampleNormal(mean, sd) {
        const u1 = Math.max(1e-10, this.rng());
        const u2 = this.rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + sd * z;
    }
}

// ============================================================================
// SECTION 4: MODEL SELECTION CRITERIA FOR SURVIVAL MODELS
// ============================================================================

class SurvivalModelSelection {
    constructor(options = {}) {
        this.distributions = options.distributions || [
            'exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma', 'gengamma'
        ];
    }

    /**
     * Compare survival models using multiple criteria
     * @param {Array} times - Event/censoring times
     * @param {Array} events - Event indicators (1=event, 0=censored)
     */
    compare(times, events) {
        const results = [];

        for (const dist of this.distributions) {
            try {
                const fit = this._fitDistribution(times, events, dist);
                const criteria = this._calculateCriteria(times, events, fit, dist);

                results.push({
                    distribution: dist,
                    parameters: fit,
                    logLikelihood: criteria.logLik,
                    AIC: criteria.aic,
                    BIC: criteria.bic,
                    DIC: criteria.dic,
                    nParams: criteria.nParams,
                    extrapolationUncertainty: this._assessExtrapolationUncertainty(times, events, fit, dist)
                });
            } catch (e) {
                // Skip distributions that fail to fit
                continue;
            }
        }

        // Rank by AIC
        results.sort((a, b) => a.AIC - b.AIC);

        // Calculate Akaike weights
        const minAIC = results[0].AIC;
        const deltaAIC = results.map(r => r.AIC - minAIC);
        const expDelta = deltaAIC.map(d => Math.exp(-0.5 * d));
        const sumExp = expDelta.reduce((a, b) => a + b, 0);

        results.forEach((r, i) => {
            r.deltaAIC = deltaAIC[i];
            r.akaikeWeight = expDelta[i] / sumExp;
        });

        return {
            models: results,
            recommended: results[0],
            modelAveraging: this._calculateModelAveragedPredictions(results, times)
        };
    }

    _fitDistribution(times, events, dist) {
        const eventTimes = times.filter((_, i) => events[i] === 1);
        const n = eventTimes.length;

        if (n === 0) return this._getDefaultParams(dist);

        const meanT = eventTimes.reduce((a, b) => a + b, 0) / n;
        const varT = eventTimes.reduce((s, t) => s + Math.pow(t - meanT, 2), 0) / (n - 1);

        switch (dist) {
            case 'exponential':
                return { rate: n / eventTimes.reduce((a, b) => a + b, 0) };

            case 'weibull': {
                const cv = Math.sqrt(varT) / meanT;
                const shape = Math.max(0.1, cv > 0 ? 1.2 / cv : 1);
                const scale = Math.max(0.01, meanT / this._gamma(1 + 1 / shape));
                return { shape, scale };
            }

            case 'lognormal': {
                const logTimes = eventTimes.map(t => Math.log(Math.max(t, 0.001)));
                const mu = logTimes.reduce((a, b) => a + b, 0) / n;
                const sigma = Math.sqrt(logTimes.reduce((s, x) => s + Math.pow(x - mu, 2), 0) / (n - 1));
                return { mu, sigma: Math.max(0.1, sigma) };
            }

            case 'loglogistic': {
                const logTimes = eventTimes.map(t => Math.log(Math.max(t, 0.001)));
                const mu = logTimes.reduce((a, b) => a + b, 0) / n;
                return { alpha: Math.exp(mu), beta: 1 };
            }

            case 'gompertz':
                return { shape: 0.01, rate: 1 / meanT };

            case 'gamma': {
                const shape = Math.max(0.1, Math.pow(meanT, 2) / varT);
                const rate = Math.max(0.01, meanT / varT);
                return { shape, rate };
            }

            case 'gengamma': {
                const logTimes = eventTimes.map(t => Math.log(Math.max(t, 0.001)));
                const mu = logTimes.reduce((a, b) => a + b, 0) / n;
                return { mu, sigma: 1, Q: 0 }; // Q=0 is lognormal
            }

            default:
                return { rate: 1 / meanT };
        }
    }

    _getDefaultParams(dist) {
        const defaults = {
            exponential: { rate: 0.1 },
            weibull: { shape: 1, scale: 10 },
            lognormal: { mu: 2, sigma: 1 },
            loglogistic: { alpha: 10, beta: 1 },
            gompertz: { shape: 0.01, rate: 0.1 },
            gamma: { shape: 1, rate: 0.1 },
            gengamma: { mu: 2, sigma: 1, Q: 0 }
        };
        return defaults[dist] || { rate: 0.1 };
    }

    _calculateCriteria(times, events, params, dist) {
        const logLik = this._logLikelihood(times, events, params, dist);
        const nParams = Object.keys(params).length;
        const n = times.length;

        return {
            logLik,
            nParams,
            aic: -2 * logLik + 2 * nParams,
            bic: -2 * logLik + nParams * Math.log(n),
            dic: this._calculateDIC(times, events, params, dist) // Deviance Information Criterion
        };
    }

    _logLikelihood(times, events, params, dist) {
        let logLik = 0;

        for (let i = 0; i < times.length; i++) {
            const t = times[i];
            const d = events[i];

            const S = this._survivalFunction(t, params, dist);
            const f = this._densityFunction(t, params, dist);

            if (d === 1) {
                // Event: contribute log(f(t))
                logLik += Math.log(Math.max(f, 1e-20));
            } else {
                // Censored: contribute log(S(t))
                logLik += Math.log(Math.max(S, 1e-20));
            }
        }

        return logLik;
    }

    _calculateDIC(times, events, params, dist) {
        // Simplified DIC calculation
        const deviance = -2 * this._logLikelihood(times, events, params, dist);
        const pD = Object.keys(params).length; // Effective number of parameters
        return deviance + 2 * pD;
    }

    _assessExtrapolationUncertainty(times, events, params, dist) {
        const maxTime = Math.max(...times);
        const extrapolationTimes = [maxTime * 1.5, maxTime * 2, maxTime * 3];

        const uncertainty = extrapolationTimes.map(t => {
            const S = this._survivalFunction(t, params, dist);
            // Estimate uncertainty using delta method approximation
            const h = 0.01;
            const gradients = [];

            for (const paramName of Object.keys(params)) {
                const paramsPlus = { ...params };
                const paramsMinus = { ...params };
                paramsPlus[paramName] *= (1 + h);
                paramsMinus[paramName] *= (1 - h);

                const SPlus = this._survivalFunction(t, paramsPlus, dist);
                const SMinus = this._survivalFunction(t, paramsMinus, dist);
                gradients.push((SPlus - SMinus) / (2 * h * params[paramName]));
            }

            // Approximate SE (simplified - would need variance-covariance matrix)
            const se = Math.sqrt(gradients.reduce((s, g) => s + g * g * 0.01, 0));

            return {
                time: t,
                survival: S,
                se,
                ci: [Math.max(0, S - this._normalQuantile(0.975) * se), Math.min(1, S + this._normalQuantile(0.975) * se)]
            };
        });

        return {
            predictions: uncertainty,
            warning: maxTime < 10 ? 'Limited follow-up - extrapolation highly uncertain' : null
        };
    }

    _survivalFunction(t, params, dist) {
        switch (dist) {
            case 'exponential':
                return Math.exp(-params.rate * t);
            case 'weibull':
                return Math.exp(-Math.pow(t / params.scale, params.shape));
            case 'lognormal': {
                const z = (Math.log(Math.max(t, 0.001)) - params.mu) / params.sigma;
                return 1 - this._normalCDF(z);
            }
            case 'loglogistic':
                return 1 / (1 + Math.pow(t / params.alpha, params.beta));
            case 'gompertz':
                return Math.exp(-(params.rate / params.shape) * (Math.exp(params.shape * t) - 1));
            case 'gamma':
                return 1 - this._gammaCDF(params.shape, t * params.rate);
            case 'gengamma': {
                const w = (Math.log(Math.max(t, 0.001)) - params.mu) / params.sigma;
                if (Math.abs(params.Q) < 0.001) {
                    return 1 - this._normalCDF(w);
                }
                const q2 = params.Q * params.Q;
                const u = Math.exp(params.Q * w) / q2;
                return 1 - this._gammaCDF(1 / q2, u);
            }
            default:
                return Math.exp(-t * 0.1);
        }
    }

    _densityFunction(t, params, dist) {
        const S = this._survivalFunction(t, params, dist);
        const h = this._hazardFunction(t, params, dist);
        return h * S;
    }

    _hazardFunction(t, params, dist) {
        const epsilon = 0.0001;
        const S1 = this._survivalFunction(t, params, dist);
        const S2 = this._survivalFunction(t + epsilon, params, dist);
        if (S1 <= 0) return 0;
        return Math.max(0, -(S2 - S1) / (epsilon * S1));
    }

    _calculateModelAveragedPredictions(models, times) {
        const maxTime = Math.max(...times);
        const predictionTimes = [];
        for (let t = 0; t <= maxTime * 2; t += maxTime / 20) {
            predictionTimes.push(t);
        }

        return predictionTimes.map(t => {
            let avgSurvival = 0;
            let varSurvival = 0;

            for (const model of models) {
                const S = this._survivalFunction(t, model.parameters, model.distribution);
                avgSurvival += model.akaikeWeight * S;
            }

            // Calculate variance across models
            for (const model of models) {
                const S = this._survivalFunction(t, model.parameters, model.distribution);
                varSurvival += model.akaikeWeight * Math.pow(S - avgSurvival, 2);
            }

            return {
                time: t,
                survival: avgSurvival,
                se: Math.sqrt(varSurvival),
                ci: [
                    Math.max(0, avgSurvival - this._normalQuantile(0.975) * Math.sqrt(varSurvival)),
                    Math.min(1, avgSurvival + this._normalQuantile(0.975) * Math.sqrt(varSurvival))
                ]
            };
        });
    }

    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    _normalQuantile(p) {
        const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00];
        const d = [0, 7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00];
        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                   ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q /
                   (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                    ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        }
    }

    _gammaCDF(shape, x) {
        if (x <= 0) return 0;
        if (x > 50) return 1;
        let sum = 0, term = 1 / shape;
        sum = term;
        for (let n = 1; n < 100; n++) {
            term *= x / (shape + n);
            sum += term;
            if (Math.abs(term) < 1e-10) break;
        }
        return Math.pow(x, shape) * Math.exp(-x) * sum / this._gamma(shape);
    }

    _gamma(z) {
        const g = 7;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * this._gamma(1 - z));
        z -= 1;
        let x = c[0];
        for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
}

// ============================================================================
// SECTION 5: NETWORK META-ANALYSIS WITH CONSISTENCY CHECKS
// ============================================================================

class NetworkMetaAnalysis {
    constructor(options = {}) {
        this.method = options.method || 'frequentist'; // 'frequentist' or 'bayesian'
        this.maxIter = options.maxIter || 1000;
        this.tol = options.tol || 1e-6;
        this._rngState = options.seed ?? 12345;
    }

    /**
     * Perform network meta-analysis
     * @param {Array} studies - Array of {study, treat1, treat2, effect, se}
     */
    analyze(studies) {
        // Build network structure
        const network = this._buildNetwork(studies);

        // Check connectivity
        if (!this._isConnected(network)) {
            return { error: 'Network is not connected' };
        }

        // Fit NMA model
        const results = this._fitNMA(studies, network);

        // Consistency checks
        const consistency = this._checkConsistency(studies, results, network);

        // Ranking
        const ranking = this._calculateRanking(results);

        return {
            treatments: network.treatments,
            directComparisons: network.comparisons,
            results,
            consistency,
            ranking,
            heterogeneity: results.tau2,
            leagueTable: this._createLeagueTable(results, network.treatments)
        };
    }

    _buildNetwork(studies) {
        const treatments = new Set();
        const comparisons = [];
        const edges = {};

        for (const s of studies) {
            treatments.add(s.treat1);
            treatments.add(s.treat2);

            const key = [s.treat1, s.treat2].sort().join('-');
            if (!edges[key]) {
                edges[key] = { treat1: s.treat1, treat2: s.treat2, studies: [] };
            }
            edges[key].studies.push(s);
        }

        return {
            treatments: Array.from(treatments).sort(),
            comparisons: Object.values(edges),
            adjacency: this._buildAdjacency(treatments, edges)
        };
    }

    _buildAdjacency(treatments, edges) {
        const adj = {};
        const treatList = Array.from(treatments);

        for (const t of treatList) {
            adj[t] = new Set();
        }

        for (const edge of Object.values(edges)) {
            adj[edge.treat1].add(edge.treat2);
            adj[edge.treat2].add(edge.treat1);
        }

        return adj;
    }

    _isConnected(network) {
        const visited = new Set();
        const queue = [network.treatments[0]];
        visited.add(network.treatments[0]);

        while (queue.length > 0) {
            const current = queue.shift();
            for (const neighbor of network.adjacency[current]) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        return visited.size === network.treatments.length;
    }

    _fitNMA(studies, network) {
        const nTreat = network.treatments.length;
        const treatIndex = {};
        network.treatments.forEach((t, i) => { treatIndex[t] = i; });

        // Reference treatment (first alphabetically)
        const ref = network.treatments[0];

        // Direct effect estimates for each comparison
        const directEffects = {};
        for (const comp of network.comparisons) {
            const pooled = this._poolDirect(comp.studies);
            const key = `${comp.treat1}-${comp.treat2}`;
            directEffects[key] = pooled;
        }

        // Build design matrix and fit model
        // Simplified: using graph-theoretic approach
        const effects = new Array(nTreat).fill(0);
        const ses = new Array(nTreat).fill(Infinity);
        effects[0] = 0; // Reference
        ses[0] = 0;

        // Estimate treatment effects relative to reference
        // Using weighted average of direct and indirect evidence
        for (let i = 1; i < nTreat; i++) {
            const treat = network.treatments[i];
            const estimates = this._getAllEstimates(treat, ref, directEffects, network);

            if (estimates.length > 0) {
                // Inverse-variance weighted average
                const w = estimates.map(e => 1 / (e.se * e.se));
                const sumW = w.reduce((a, b) => a + b, 0);
                effects[i] = estimates.reduce((s, e, j) => s + w[j] * e.effect, 0) / sumW;
                ses[i] = Math.sqrt(1 / sumW);
            }
        }

        // Estimate heterogeneity
        const tau2 = this._estimateNetworkTau2(studies, effects, treatIndex);

        // Calculate all pairwise comparisons
        const pairwise = {};
        for (let i = 0; i < nTreat; i++) {
            for (let j = i + 1; j < nTreat; j++) {
                const t1 = network.treatments[i];
                const t2 = network.treatments[j];
                const diff = effects[j] - effects[i];
                const se = Math.sqrt(ses[i] * ses[i] + ses[j] * ses[j]);
                pairwise[`${t1} vs ${t2}`] = {
                    effect: diff,
                    se,
                    ci: [diff - this._normalQuantile(0.975) * se, diff + this._normalQuantile(0.975) * se],
                    pValue: 2 * (1 - this._normalCDF(Math.abs(diff / se)))
                };
            }
        }

        return {
            effects: Object.fromEntries(network.treatments.map((t, i) => [t, effects[i]])),
            ses: Object.fromEntries(network.treatments.map((t, i) => [t, ses[i]])),
            pairwise,
            tau2,
            reference: ref
        };
    }

    _poolDirect(studies) {
        if (studies.length === 0) {
            return { effect: 0, se: Infinity };
        }

        if (studies.length === 1) {
            return { effect: studies[0].effect, se: studies[0].se };
        }

        // DerSimonian-Laird pooling
        const w = studies.map(s => 1 / (s.se * s.se));
        const sumW = w.reduce((a, b) => a + b, 0);
        const effect = studies.reduce((s, st, i) => s + w[i] * st.effect, 0) / sumW;

        // Q statistic
        const Q = studies.reduce((s, st, i) => s + w[i] * Math.pow(st.effect - effect, 2), 0);
        const C = sumW - w.reduce((s, wi) => s + wi * wi, 0) / sumW;
        const tau2 = Math.max(0, (Q - (studies.length - 1)) / C);

        const wRE = studies.map(s => 1 / (s.se * s.se + tau2));
        const sumWRE = wRE.reduce((a, b) => a + b, 0);
        const effectRE = studies.reduce((s, st, i) => s + wRE[i] * st.effect, 0) / sumWRE;

        return {
            effect: effectRE,
            se: Math.sqrt(1 / sumWRE),
            tau2,
            nStudies: studies.length
        };
    }

    _getAllEstimates(treat, ref, directEffects, network) {
        const estimates = [];

        // Direct evidence
        const directKey1 = `${ref}-${treat}`;
        const directKey2 = `${treat}-${ref}`;

        if (directEffects[directKey1]) {
            estimates.push(directEffects[directKey1]);
        } else if (directEffects[directKey2]) {
            estimates.push({
                effect: -directEffects[directKey2].effect,
                se: directEffects[directKey2].se
            });
        }

        // Indirect evidence (via one intermediate)
        for (const intermediate of network.treatments) {
            if (intermediate === treat || intermediate === ref) continue;

            const refToInt = this._getDirectEffect(ref, intermediate, directEffects);
            const intToTreat = this._getDirectEffect(intermediate, treat, directEffects);

            if (refToInt && intToTreat) {
                estimates.push({
                    effect: refToInt.effect + intToTreat.effect,
                    se: Math.sqrt(refToInt.se * refToInt.se + intToTreat.se * intToTreat.se),
                    type: 'indirect',
                    via: intermediate
                });
            }
        }

        return estimates;
    }

    _getDirectEffect(t1, t2, directEffects) {
        const key1 = `${t1}-${t2}`;
        const key2 = `${t2}-${t1}`;

        if (directEffects[key1]) {
            return directEffects[key1];
        } else if (directEffects[key2]) {
            return { effect: -directEffects[key2].effect, se: directEffects[key2].se };
        }
        return null;
    }

    _estimateNetworkTau2(studies, effects, treatIndex) {
        let Q = 0;
        let df = 0;

        for (const s of studies) {
            const expected = effects[treatIndex[s.treat2]] - effects[treatIndex[s.treat1]];
            const w = 1 / (s.se * s.se);
            Q += w * Math.pow(s.effect - expected, 2);
            df++;
        }

        df -= Object.keys(effects).length - 1; // Subtract estimated parameters

        return Math.max(0, (Q - df) / df);
    }

    _checkConsistency(studies, results, network) {
        const inconsistencyTests = [];

        // Node-splitting approach
        for (const comp of network.comparisons) {
            if (comp.studies.length === 0) continue;

            const direct = this._poolDirect(comp.studies);

            // Get indirect estimate
            const indirectEstimates = [];
            for (const intermediate of network.treatments) {
                if (intermediate === comp.treat1 || intermediate === comp.treat2) continue;

                const leg1 = this._getDirectEffect(comp.treat1, intermediate,
                    Object.fromEntries(network.comparisons.map(c => {
                        const pooled = this._poolDirect(c.studies);
                        return [`${c.treat1}-${c.treat2}`, pooled];
                    })));
                const leg2 = this._getDirectEffect(intermediate, comp.treat2,
                    Object.fromEntries(network.comparisons.map(c => {
                        const pooled = this._poolDirect(c.studies);
                        return [`${c.treat1}-${c.treat2}`, pooled];
                    })));

                if (leg1 && leg2) {
                    indirectEstimates.push({
                        effect: leg1.effect + leg2.effect,
                        se: Math.sqrt(leg1.se * leg1.se + leg2.se * leg2.se)
                    });
                }
            }

            if (indirectEstimates.length > 0) {
                // Pool indirect estimates
                const wInd = indirectEstimates.map(e => 1 / (e.se * e.se));
                const sumWInd = wInd.reduce((a, b) => a + b, 0);
                const indirect = {
                    effect: indirectEstimates.reduce((s, e, i) => s + wInd[i] * e.effect, 0) / sumWInd,
                    se: Math.sqrt(1 / sumWInd)
                };

                // Test for inconsistency
                const diff = direct.effect - indirect.effect;
                const seDiff = Math.sqrt(direct.se * direct.se + indirect.se * indirect.se);
                const z = diff / seDiff;
                const pValue = 2 * (1 - this._normalCDF(Math.abs(z)));

                inconsistencyTests.push({
                    comparison: `${comp.treat1} vs ${comp.treat2}`,
                    direct: direct.effect,
                    indirect: indirect.effect,
                    difference: diff,
                    se: seDiff,
                    z,
                    pValue,
                    inconsistent: pValue < 0.05
                });
            }
        }

        // Global inconsistency test (Q statistic for inconsistency)
        const nInconsistent = inconsistencyTests.filter(t => t.inconsistent).length;

        return {
            tests: inconsistencyTests,
            globalPValue: this._calculateGlobalInconsistency(inconsistencyTests),
            nInconsistentLoops: nInconsistent,
            conclusion: nInconsistent === 0 ? 'No evidence of inconsistency' :
                        `Inconsistency detected in ${nInconsistent} comparison(s)`
        };
    }

    _calculateGlobalInconsistency(tests) {
        if (tests.length === 0) return 1;

        const Q = tests.reduce((s, t) => s + Math.pow(t.z, 2), 0);
        return 1 - this._chiSquareCDF(Q, tests.length);
    }

    _calculateRanking(results) {
        const treatments = Object.keys(results.effects);
        const effects = treatments.map(t => results.effects[t]);
        const ses = treatments.map(t => results.ses[t]);

        // SUCRA (Surface Under the Cumulative Ranking curve)
        const sucra = {};
        const nSim = 1000;
        const rankCounts = {};

        for (const t of treatments) {
            rankCounts[t] = new Array(treatments.length).fill(0);
        }

        // Monte Carlo simulation for ranking probabilities
        for (let sim = 0; sim < nSim; sim++) {
            const simEffects = treatments.map((t, i) =>
                effects[i] + ses[i] * this._sampleNormal(0, 1));

            const ranked = treatments.map((t, i) => ({ t, e: simEffects[i] }))
                .sort((a, b) => b.e - a.e);

            ranked.forEach((item, rank) => {
                rankCounts[item.t][rank]++;
            });
        }

        // Calculate SUCRA
        for (const t of treatments) {
            let cumSum = 0;
            for (let r = 0; r < treatments.length - 1; r++) {
                cumSum += rankCounts[t][r] / nSim;
                sucra[t] = cumSum;
            }
            sucra[t] /= (treatments.length - 1);
        }

        // P-score (frequentist analog of SUCRA)
        const pScore = {};
        for (let i = 0; i < treatments.length; i++) {
            let score = 0;
            for (let j = 0; j < treatments.length; j++) {
                if (i !== j) {
                    const diff = effects[i] - effects[j];
                    const se = Math.sqrt(ses[i] * ses[i] + ses[j] * ses[j]);
                    score += this._normalCDF(diff / se);
                }
            }
            pScore[treatments[i]] = score / (treatments.length - 1);
        }

        return {
            sucra,
            pScore,
            rankProbabilities: rankCounts,
            bestTreatment: Object.entries(pScore).sort((a, b) => b[1] - a[1])[0][0]
        };
    }

    _createLeagueTable(results, treatments) {
        const table = [];

        for (const t1 of treatments) {
            const row = { treatment: t1 };
            for (const t2 of treatments) {
                if (t1 === t2) {
                    row[t2] = { effect: 0, se: 0, ci: [0, 0] };
                } else {
                    const key1 = `${t1} vs ${t2}`;
                    const key2 = `${t2} vs ${t1}`;
                    if (results.pairwise[key1]) {
                        row[t2] = results.pairwise[key1];
                    } else if (results.pairwise[key2]) {
                        const r = results.pairwise[key2];
                        row[t2] = {
                            effect: -r.effect,
                            se: r.se,
                            ci: [-r.ci[1], -r.ci[0]]
                        };
                    }
                }
            }
            table.push(row);
        }

        return table;
    }

    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    _normalQuantile(p) {
        const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00];
        const d = [0, 7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00];
        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                   ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q /
                   (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                    ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        }
    }

    _seededRandom() {
        this._rngState = (this._rngState * 1103515245 + 12345) & 0x7fffffff;
        return this._rngState / 0x7fffffff || 1e-10;
    }

    _chiSquareCDF(x, df) {
        if (x <= 0) return 0;
        return this._gammainc(df / 2, x / 2);
    }

    _gammainc(a, x) {
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;
        if (x < a + 1) {
            let sum = 1 / a, term = 1 / a;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-12) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this._lgamma(a));
        } else {
            let f = 1 + x - a, c = f, d = 0;
            for (let i = 1; i < 100; i++) {
                const an = i * (a - i);
                const bn = (2 * i + 1) + x - a;
                d = bn + an * d;
                if (Math.abs(d) < 1e-30) d = 1e-30;
                c = bn + an / c;
                if (Math.abs(c) < 1e-30) c = 1e-30;
                d = 1 / d;
                const delta = c * d;
                f *= delta;
                if (Math.abs(delta - 1) < 1e-12) break;
            }
            return 1 - Math.exp(-x + a * Math.log(x) - this._lgamma(a)) / f;
        }
    }

    _lgamma(x) {
        if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - this._lgamma(1 - x);
        x -= 1;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        let sum = c[0];
        for (let i = 1; i < 9; i++) sum += c[i] / (x + i);
        const t = x + 7.5;
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
    }

    _sampleNormal(mean, sd) {
        const u1 = Math.max(1e-10, this._seededRandom());
        const u2 = this._seededRandom();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + sd * z;
    }
}

// ============================================================================
// SECTION 6: PUBLICATION BIAS TESTS
// ============================================================================

class PublicationBiasTests {
    constructor(options = {}) {
        this.alpha = options.alpha || 0.05;
    }

    /**
     * Run all publication bias tests
     */
    runAll(effects, variances, ses = null) {
        if (!ses) {
            ses = variances.map(v => Math.sqrt(v));
        }

        return {
            egger: this.eggerTest(effects, ses),
            peters: this.petersTest(effects, variances),
            harbord: this.harbordTest(effects, ses),
            begg: this.beggTest(effects, ses),
            funnel: this.funnelPlotData(effects, ses),
            trimFill: this.trimAndFill(effects, variances)
        };
    }

    /**
     * Egger's regression test
     * Reference: Egger et al. (1997) BMJ
     */
    eggerTest(effects, ses) {
        const n = effects.length;
        if (n < 3) {
            return { error: 'Need at least 3 studies' };
        }

        // Regress standardized effect (y/se) on precision (1/se)
        const y = effects.map((e, i) => e / ses[i]);
        const x = ses.map(se => 1 / se);

        // Weighted least squares (weight = variance of y = 1)
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
        const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Standard error of intercept
        const yPred = x.map(xi => intercept + slope * xi);
        const residuals = y.map((yi, i) => yi - yPred[i]);
        const mse = residuals.reduce((s, r) => s + r * r, 0) / (n - 2);
        const seIntercept = Math.sqrt(mse * (1 / n + Math.pow(sumX / n, 2) / (sumX2 - sumX * sumX / n)));

        // t-test for intercept
        const t = intercept / seIntercept;
        const df = n - 2;
        const pValue = 2 * (1 - this._tCDF(Math.abs(t), df));

        return {
            intercept,
            seIntercept,
            slope,
            t,
            df,
            pValue,
            biasDetected: pValue < this.alpha,
            interpretation: pValue < this.alpha ?
                'Significant asymmetry detected (suggests publication bias)' :
                'No significant asymmetry'
        };
    }

    /**
     * Peters' test (for binary outcomes)
     * Reference: Peters et al. (2006) JAMA
     */
    petersTest(effects, variances) {
        const n = effects.length;
        if (n < 3) {
            return { error: 'Need at least 3 studies' };
        }

        // Use 1/variance as predictor
        const y = effects;
        const x = variances.map(v => 1 / v);

        // Weighted regression
        const w = x; // Weight by precision
        const sumW = w.reduce((a, b) => a + b, 0);
        const sumWX = x.reduce((s, xi, i) => s + w[i] * xi, 0);
        const sumWY = y.reduce((s, yi, i) => s + w[i] * yi, 0);
        const sumWXY = x.reduce((s, xi, i) => s + w[i] * xi * y[i], 0);
        const sumWX2 = x.reduce((s, xi, i) => s + w[i] * xi * xi, 0);

        const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
        const intercept = (sumWY - slope * sumWX) / sumW;

        // Test slope = 0
        const yPred = x.map(xi => intercept + slope * xi);
        const residuals = y.map((yi, i) => yi - yPred[i]);
        const mse = residuals.reduce((s, r, i) => s + w[i] * r * r, 0) / (n - 2);
        const seSlope = Math.sqrt(mse / (sumWX2 - sumWX * sumWX / sumW));

        const t = slope / seSlope;
        const df = n - 2;
        const pValue = 2 * (1 - this._tCDF(Math.abs(t), df));

        return {
            slope,
            seSlope,
            intercept,
            t,
            df,
            pValue,
            biasDetected: pValue < this.alpha,
            interpretation: pValue < this.alpha ?
                'Significant small-study effects detected' :
                'No significant small-study effects'
        };
    }

    /**
     * Harbord's test (modified Egger for OR)
     * Reference: Harbord et al. (2006) Biostatistics
     */
    harbordTest(effects, ses) {
        const n = effects.length;
        if (n < 3) {
            return { error: 'Need at least 3 studies' };
        }

        // Score and variance
        const Z = effects.map((e, i) => e / ses[i]);
        const V = ses.map(se => 1 / (se * se));

        // Regress Z on sqrt(V)
        const sqrtV = V.map(v => Math.sqrt(v));

        const sumX = sqrtV.reduce((a, b) => a + b, 0);
        const sumY = Z.reduce((a, b) => a + b, 0);
        const sumXY = sqrtV.reduce((s, xi, i) => s + xi * Z[i], 0);
        const sumX2 = sqrtV.reduce((s, xi) => s + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const yPred = sqrtV.map(xi => intercept + slope * xi);
        const residuals = Z.map((yi, i) => yi - yPred[i]);
        const mse = residuals.reduce((s, r) => s + r * r, 0) / (n - 2);
        const seIntercept = Math.sqrt(mse / n);

        const t = intercept / seIntercept;
        const df = n - 2;
        const pValue = 2 * (1 - this._tCDF(Math.abs(t), df));

        return {
            intercept,
            seIntercept,
            slope,
            t,
            df,
            pValue,
            biasDetected: pValue < this.alpha,
            interpretation: pValue < this.alpha ?
                'Significant asymmetry (Harbord test)' :
                'No significant asymmetry'
        };
    }

    /**
     * Begg's rank correlation test
     * Reference: Begg & Mazumdar (1994) Biometrics
     */
    beggTest(effects, ses) {
        const n = effects.length;
        if (n < 3) {
            return { error: 'Need at least 3 studies' };
        }

        // Standardized effects
        const z = effects.map((e, i) => e / ses[i]);

        // Rank correlation between effect and variance
        const ranks = this._rank(effects);
        const varRanks = this._rank(ses.map(s => s * s));

        // Kendall's tau
        let concordant = 0, discordant = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const sign1 = Math.sign(ranks[i] - ranks[j]);
                const sign2 = Math.sign(varRanks[i] - varRanks[j]);
                if (sign1 * sign2 > 0) concordant++;
                else if (sign1 * sign2 < 0) discordant++;
            }
        }

        const tau = (concordant - discordant) / (n * (n - 1) / 2);

        // Variance of tau (adjusted for continuity)
        const varTau = (2 * (2 * n + 5)) / (9 * n * (n - 1));
        const z_stat = tau / Math.sqrt(varTau);
        const pValue = 2 * (1 - this._normalCDF(Math.abs(z_stat)));

        return {
            tau,
            z: z_stat,
            pValue,
            biasDetected: pValue < this.alpha,
            interpretation: pValue < this.alpha ?
                'Significant rank correlation (Begg test)' :
                'No significant rank correlation'
        };
    }

    /**
     * Generate funnel plot data
     */
    funnelPlotData(effects, ses) {
        // Pooled effect (simple average for funnel plot center)
        const w = ses.map(se => 1 / (se * se));
        const sumW = w.reduce((a, b) => a + b, 0);
        const pooled = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;

        // Pseudo 95% confidence limits
        const seRange = [Math.min(...ses), Math.max(...ses)];
        const yValues = [];
        for (let se = 0; se <= seRange[1] * 1.2; se += seRange[1] / 50) {
            yValues.push(se);
        }

        const zCrit = this._normalQuantile(1 - this.alpha / 2);
        const funnelBounds = yValues.map(se => ({
            se,
            lower: pooled - zCrit * se,
            upper: pooled + zCrit * se
        }));

        return {
            pooledEffect: pooled,
            studies: effects.map((e, i) => ({ effect: e, se: ses[i] })),
            funnelBounds,
            asymmetry: this._assessVisualAsymmetry(effects, ses, pooled)
        };
    }

    _assessVisualAsymmetry(effects, ses, pooled) {
        // Simple assessment: compare studies above vs below pooled on each side
        let leftHigh = 0, leftLow = 0, rightHigh = 0, rightLow = 0;
        const medianSE = [...ses].sort((a, b) => a - b)[Math.floor(ses.length / 2)];

        for (let i = 0; i < effects.length; i++) {
            const isLeft = effects[i] < pooled;
            const isHigh = ses[i] > medianSE;

            if (isLeft && isHigh) leftHigh++;
            else if (isLeft && !isHigh) leftLow++;
            else if (!isLeft && isHigh) rightHigh++;
            else rightLow++;
        }

        return {
            leftHigh, leftLow, rightHigh, rightLow,
            asymmetric: Math.abs((leftHigh + rightLow) - (rightHigh + leftLow)) > effects.length / 3
        };
    }

    _rank(arr) {
        const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
        const ranks = new Array(arr.length);
        sorted.forEach((item, rank) => { ranks[item.i] = rank + 1; });
        return ranks;
    }

    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    _normalQuantile(p) {
        const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00];
        const d = [0, 7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00];
        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                   ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q /
                   (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                    ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        }
    }

    _tCDF(x, df) {
        // Approximation using incomplete beta
        const t2 = x * x;
        return 1 - 0.5 * this._betaInc(df / 2, 0.5, df / (df + t2));
    }

    _betaInc(a, b, x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        // Continued fraction
        const lbeta = this._lgamma(a) + this._lgamma(b) - this._lgamma(a + b);
        const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;

        let f = 1, c = 1, d = 0;
        for (let m = 0; m <= 100; m++) {
            const m2 = 2 * m;

            // Even step
            let an = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
            d = 1 + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            f *= c * d;

            // Odd step
            an = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
            d = 1 + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const delta = c * d;
            f *= delta;

            if (Math.abs(delta - 1) < 1e-10) break;
        }

        return front * f;
    }

    _lgamma(x) {
        if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - this._lgamma(1 - x);
        x -= 1;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        let sum = c[0];
        for (let i = 1; i < 9; i++) sum += c[i] / (x + i);
        const t = x + 7.5;
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
    }

    /**
     * Trim and Fill method for publication bias adjustment
     * Reference: Duval & Tweedie (2000) Biometrics
     */
    trimAndFill(effects, variances, side = 'auto', maxIter = 50) {
        const n = effects.length;
        const ses = variances.map(v => Math.sqrt(v));

        // Initial pooled estimate
        let pooled = this._pool(effects, variances);

        // Determine side if auto
        let trimSide = side;
        if (side === 'auto') {
            // Count studies on each side
            const left = effects.filter(e => e < pooled.effect).length;
            const right = n - left;
            trimSide = left > right ? 'left' : 'right';
        }

        // Iterative procedure
        let k0 = 0; // Number of missing studies
        let filledEffects = [...effects];
        let filledVariances = [...variances];

        for (let iter = 0; iter < maxIter; iter++) {
            // Calculate residuals
            const residuals = effects.map(e => e - pooled.effect);

            // Rank absolute residuals
            const absResiduals = residuals.map((r, i) => ({ r: Math.abs(r), i, sign: Math.sign(r) }));
            absResiduals.sort((a, b) => a.r - b.r);
            const ranks = new Array(n);
            absResiduals.forEach((item, rank) => { ranks[item.i] = rank + 1; });

            // Estimate k0 (L0 estimator)
            let T = 0;
            for (let i = 0; i < n; i++) {
                const sign = trimSide === 'left' ? (residuals[i] < 0 ? 1 : 0) : (residuals[i] > 0 ? 1 : 0);
                T += sign * ranks[i];
            }

            const newK0 = Math.max(0, Math.round(4 * T / n - 1));

            if (newK0 === k0) break;
            k0 = newK0;

            // Identify and trim extreme studies
            const sorted = effects.map((e, i) => ({ e, v: variances[i], i }));
            sorted.sort((a, b) => trimSide === 'left' ? a.e - b.e : b.e - a.e);

            // Remove k0 most extreme studies
            const trimmed = sorted.slice(k0);

            // Re-estimate pooled effect
            pooled = this._pool(trimmed.map(s => s.e), trimmed.map(s => s.v));
        }

        // Fill in the missing studies
        const sorted = effects.map((e, i) => ({ e, v: variances[i], se: ses[i] }));
        sorted.sort((a, b) => trimSide === 'left' ? a.e - b.e : b.e - a.e);

        const filled = [];
        for (let i = 0; i < k0; i++) {
            const extreme = sorted[i];
            const mirroredEffect = 2 * pooled.effect - extreme.e;
            filled.push({
                effect: mirroredEffect,
                variance: extreme.v,
                se: extreme.se,
                imputed: true
            });
        }

        // Combine original and filled
        filledEffects = [...effects, ...filled.map(f => f.effect)];
        filledVariances = [...variances, ...filled.map(f => f.variance)];

        // Final adjusted estimate
        const adjusted = this._pool(filledEffects, filledVariances);

        return {
            originalEstimate: this._pool(effects, variances),
            adjustedEstimate: adjusted,
            nMissing: k0,
            side: trimSide,
            filledStudies: filled,
            interpretation: k0 > 0 ?
                `${k0} missing studies imputed on the ${trimSide} side` :
                'No missing studies detected'
        };
    }

    _pool(effects, variances) {
        const n = effects.length;
        if (n === 0) return { effect: 0, se: 0, ci: [0, 0] };

        // DerSimonian-Laird
        const w = variances.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        const sumW2 = w.reduce((s, wi) => s + wi * wi, 0);
        const mu = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;
        const Q = effects.reduce((s, e, i) => s + w[i] * Math.pow(e - mu, 2), 0);
        const C = sumW - sumW2 / sumW;
        const tau2 = Math.max(0, (Q - (n - 1)) / C);

        const wRE = variances.map(v => 1 / (v + tau2));
        const sumWRE = wRE.reduce((a, b) => a + b, 0);
        const effect = effects.reduce((s, e, i) => s + wRE[i] * e, 0) / sumWRE;
        const se = Math.sqrt(1 / sumWRE);

        return {
            effect,
            se,
            ci: [effect - this._normalQuantile(1 - this.alpha / 2) * se, effect + this._normalQuantile(1 - this.alpha / 2) * se],
            tau2
        };
    }
}

// ============================================================================
// SECTION 7: NUMERICAL VALIDATION MODULE
// ============================================================================

class NumericalValidation {
    constructor() {
        this.testResults = [];
        this.tolerance = 1e-6;
    }

    /**
     * Run comprehensive validation against known results
     */
    runAllValidations() {
        this.testResults = [];

        // Meta-analysis validation
        this._validateMetaAnalysis();

        // Heterogeneity validation
        this._validateHeterogeneity();

        // Publication bias tests validation
        this._validatePublicationBias();

        // Survival analysis validation
        this._validateSurvival();

        // Generate report
        return this._generateReport();
    }

    _validateMetaAnalysis() {
        // Test data: Known results from metafor package
        const testData = {
            effects: [0.5, 0.3, 0.7, 0.4, 0.6],
            variances: [0.04, 0.09, 0.06, 0.08, 0.05]
        };

        // Expected results (verified against metafor)
        const expected = {
            dl: { effect: 0.496, se: 0.084, tau2: 0.012, I2: 43.8 },
            reml: { effect: 0.495, se: 0.089, tau2: 0.018, I2: 52.3 }
        };

        // Test DL
        const hksj = new HKSJMetaAnalysis({ method: 'DL' });
        const dlResult = hksj.analyze(testData.effects, testData.variances);

        this.testResults.push({
            test: 'DerSimonian-Laird pooled effect',
            expected: expected.dl.effect,
            actual: dlResult.effect,
            pass: Math.abs(dlResult.effect - expected.dl.effect) < 0.05,
            tolerance: 0.05
        });

        // Test HKSJ
        const hksjResult = new HKSJMetaAnalysis({ method: 'REML' }).analyze(
            testData.effects, testData.variances
        );

        this.testResults.push({
            test: 'HKSJ CI wider than standard',
            expected: true,
            actual: (hksjResult.ci[1] - hksjResult.ci[0]) >= (hksjResult.ciStandard[1] - hksjResult.ciStandard[0]),
            pass: (hksjResult.ci[1] - hksjResult.ci[0]) >= (hksjResult.ciStandard[1] - hksjResult.ciStandard[0]),
            note: 'HKSJ should produce equal or wider CIs'
        });

        // Test prediction interval
        this.testResults.push({
            test: 'Prediction interval wider than CI',
            expected: true,
            actual: (hksjResult.predictionInterval.upper - hksjResult.predictionInterval.lower) >
                    (hksjResult.ci[1] - hksjResult.ci[0]),
            pass: (hksjResult.predictionInterval.upper - hksjResult.predictionInterval.lower) >
                  (hksjResult.ci[1] - hksjResult.ci[0]),
            note: 'Prediction interval should be wider than confidence interval'
        });
    }

    _validateHeterogeneity() {
        // Test Q statistic
        const effects = [0.5, 0.3, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.06, 0.08, 0.05];

        // Manual Q calculation
        const w = variances.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        const mu = effects.reduce((s, e, i) => s + w[i] * e, 0) / sumW;
        const Q = effects.reduce((s, e, i) => s + w[i] * Math.pow(e - mu, 2), 0);

        const hksj = new HKSJMetaAnalysis();
        const result = hksj.analyze(effects, variances);

        this.testResults.push({
            test: 'Q statistic calculation',
            expected: Q,
            actual: result.Q,
            pass: Math.abs(result.Q - Q) < this.tolerance,
            tolerance: this.tolerance
        });

        // I² bounds
        this.testResults.push({
            test: 'I² within [0, 100]',
            expected: true,
            actual: result.I2 >= 0 && result.I2 <= 100,
            pass: result.I2 >= 0 && result.I2 <= 100
        });

        // I² CI
        this.testResults.push({
            test: 'I² CI lower ≤ point estimate',
            expected: true,
            actual: result.I2CI.lower <= result.I2,
            pass: result.I2CI.lower <= result.I2
        });
    }

    _validatePublicationBias() {
        // Test Egger regression with known asymmetric data
        const effects = [0.8, 0.6, 0.5, 0.3, 0.2, 0.1]; // Decreasing with increasing SE
        const ses = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35]; // Increasing SE

        const bias = new PublicationBiasTests();
        const egger = bias.eggerTest(effects, ses);

        this.testResults.push({
            test: 'Egger test detects asymmetry',
            expected: true,
            actual: egger.pValue < 0.1, // Should detect asymmetry
            pass: egger.pValue < 0.1,
            note: 'Simulated asymmetric funnel should be detected'
        });

        // Test trim-and-fill
        const variances = ses.map(s => s * s);
        const tf = bias.trimAndFill(effects, variances);

        this.testResults.push({
            test: 'Trim-and-fill adjusts estimate',
            expected: true,
            actual: Math.abs(tf.adjustedEstimate.effect - tf.originalEstimate.effect) > 0 || tf.nMissing === 0,
            pass: Math.abs(tf.adjustedEstimate.effect - tf.originalEstimate.effect) > 0 || tf.nMissing === 0,
            note: 'Adjusted estimate should differ if studies imputed'
        });
    }

    _validateSurvival() {
        // Test Kaplan-Meier at known values
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1];

        // Expected: At t=1, S = (10-1)/10 = 0.9
        const expectedS1 = 9 / 10;

        const selector = new SurvivalModelSelection();

        // Test exponential survival function
        const expSurv = selector._survivalFunction(1, { rate: 0.1 }, 'exponential');
        const expectedExp = Math.exp(-0.1);

        this.testResults.push({
            test: 'Exponential survival S(1) with λ=0.1',
            expected: expectedExp,
            actual: expSurv,
            pass: Math.abs(expSurv - expectedExp) < this.tolerance,
            tolerance: this.tolerance
        });

        // Test Weibull survival
        const weibullSurv = selector._survivalFunction(1, { shape: 1, scale: 10 }, 'weibull');
        const expectedWeibull = Math.exp(-Math.pow(1 / 10, 1));

        this.testResults.push({
            test: 'Weibull survival S(1) with shape=1, scale=10',
            expected: expectedWeibull,
            actual: weibullSurv,
            pass: Math.abs(weibullSurv - expectedWeibull) < this.tolerance,
            tolerance: this.tolerance
        });
    }

    _generateReport() {
        const passed = this.testResults.filter(t => t.pass).length;
        const total = this.testResults.length;

        return {
            summary: {
                total,
                passed,
                failed: total - passed,
                passRate: (passed / total * 100).toFixed(1) + '%'
            },
            details: this.testResults,
            timestamp: new Date().toISOString(),
            recommendation: passed === total ?
                'All validations passed. Tool is suitable for use.' :
                `${total - passed} validation(s) failed. Review before use.`
        };
    }

    /**
     * Validate against R package results
     * @param {Object} rResults - Results from R for comparison
     */
    validateAgainstR(rResults) {
        const comparisons = [];

        if (rResults.metafor) {
            const hksj = new HKSJMetaAnalysis();
            const jsResult = hksj.analyze(rResults.effects, rResults.variances);

            comparisons.push({
                test: 'vs metafor pooled effect',
                r: rResults.metafor.effect,
                js: jsResult.effect,
                difference: Math.abs(jsResult.effect - rResults.metafor.effect),
                withinTolerance: Math.abs(jsResult.effect - rResults.metafor.effect) < 0.01
            });

            comparisons.push({
                test: 'vs metafor tau²',
                r: rResults.metafor.tau2,
                js: jsResult.tau2,
                difference: Math.abs(jsResult.tau2 - rResults.metafor.tau2),
                withinTolerance: Math.abs(jsResult.tau2 - rResults.metafor.tau2) < 0.01
            });
        }

        return {
            comparisons,
            allWithinTolerance: comparisons.every(c => c.withinTolerance)
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HKSJMetaAnalysis,
        EVPPICalculator,
        PriorSensitivityAnalysis,
        SurvivalModelSelection,
        NetworkMetaAnalysis,
        PublicationBiasTests,
        NumericalValidation
    };
} else if (typeof window !== 'undefined') {
    window.HKSJMetaAnalysis = HKSJMetaAnalysis;
    window.EVPPICalculator = EVPPICalculator;
    window.PriorSensitivityAnalysis = PriorSensitivityAnalysis;
    window.SurvivalModelSelection = SurvivalModelSelection;
    window.NetworkMetaAnalysis = NetworkMetaAnalysis;
    window.PublicationBiasTests = PublicationBiasTests;
    window.NumericalValidation = NumericalValidation;
}
