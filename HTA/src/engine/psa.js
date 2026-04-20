/**
 * Probabilistic Sensitivity Analysis (PSA) Engine
 * Runs multiple iterations with sampled parameters
 *
 * Reference: RFC-005 Determinism Contract
 *
 * Features:
 * - Deterministic RNG (PCG32)
 * - Parameter sampling from distributions
 * - CE plane generation
 * - CEAC calculation
 * - Summary statistics with confidence intervals
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

var guidanceDefaults = OmanGuidanceRef?.defaults || {
    discount_rate_costs: 0.03,
    discount_rate_qalys: 0.03,
    currency: 'OMR',
    placeholder_gdp_per_capita_omr: 10000
};

// ============ NAMED CONSTANTS ============
const DEFAULT_WTP_MAX = 100000;
const DEFAULT_WTP_STEP = 1000;
const DEFAULT_PSA_ITERATIONS = 10000;
const DEFAULT_PSA_SEED = 12345;
const DEFAULT_CONVERGENCE_CHECK_INTERVAL = 500;
const DEFAULT_CONVERGENCE_THRESHOLD = 0.01;
const PROGRESS_REPORT_INTERVAL = 500;  // Report progress every N iterations
const ICER_ZERO_THRESHOLD = 1e-10;     // Threshold for treating incQALYs as zero

function resolveWtpThresholds(settings) {
    if (OmanGuidanceRef?.resolveWtpThresholds) {
        return OmanGuidanceRef.resolveWtpThresholds(settings).thresholds;
    }
    const explicit = Array.isArray(settings?.wtp_thresholds) ? settings.wtp_thresholds : null;
    if (explicit && explicit.length) return explicit;
    return [20000, 30000, 50000];
}

function resolvePrimaryWtp(settings) {
    const thresholds = resolveWtpThresholds(settings);
    return thresholds[0];
}

function resolveWtpRange(settings, options) {
    const thresholds = resolveWtpThresholds(settings);
    const maxThreshold = Math.max(...thresholds);

    const wtpMin = options.wtpMin ?? 0;
    let wtpMax = options.wtpMax ?? DEFAULT_WTP_MAX;
    const wtpStep = options.wtpStep ?? DEFAULT_WTP_STEP;

    // If the WTP max is the generic default, adapt it to the project's thresholds.
    if (wtpMax === DEFAULT_WTP_MAX && Number.isFinite(maxThreshold)) {
        wtpMax = Math.max(maxThreshold, Math.round(maxThreshold * 1.5));
    }

    return { wtpMin, wtpMax, wtpStep, thresholds };
}

function formatCurrency(value, settings, options) {
    if (OmanGuidanceRef?.formatCurrency) {
        return OmanGuidanceRef.formatCurrency(value, settings, options);
    }
    const currency = settings?.currency || guidanceDefaults.currency;
    const symbol = currency ? currency + ' ' : '';
    if (!Number.isFinite(value)) return String(value);
    const digits = options?.maximumFractionDigits ?? 0;
    return symbol + value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

class PSAEngine {
    constructor(options = {}) {
        this.options = {
            seed: DEFAULT_PSA_SEED,
            iterations: DEFAULT_PSA_ITERATIONS,
            wtpMin: 0,
            wtpMax: DEFAULT_WTP_MAX,
            wtpStep: DEFAULT_WTP_STEP,
            convergenceCheckInterval: DEFAULT_CONVERGENCE_CHECK_INTERVAL,
            convergenceThreshold: DEFAULT_CONVERGENCE_THRESHOLD,
            progressInterval: PROGRESS_REPORT_INTERVAL,
            correlationMatrix: null,
            ...options
        };

        this.rng = new PCG32(this.options.seed);
        this.markovEngine = new MarkovEngine();
        this.progressCallback = null;
        this.auditLog = [];
    }

    /**
     * Log an audit event
     */
    log(event, details = {}) {
        this.auditLog.push({
            timestamp: new Date().toISOString(),
            event,
            ...details
        });
    }

    /**
     * Set progress callback
     * @param {Function} callback - Called with (current, total, results)
     */
    onProgress(callback) {
        this.progressCallback = callback;
    }

    /**
     * Run PSA
     * @param {Object} project - HTA project
     * @param {Object} interventionOverrides - Intervention parameter overrides
     * @param {Object} comparatorOverrides - Comparator parameter overrides
     * @returns {Object} PSA results
     */
    async run(project, interventionOverrides = {}, comparatorOverrides = {}) {
        const startTime = performance.now();
        const iterations = this.options.iterations;
        const settings = project.settings || {};
        const wtpInfo = resolveWtpRange(settings, this.options);
        const primaryWtp = resolvePrimaryWtp(settings);

        // Reset RNG with seed for reproducibility
        this.rng = new PCG32(this.options.seed);

        // Pre-allocate arrays for better performance (avoid dynamic resizing)
        const incCosts = new Array(iterations);
        const incQalys = new Array(iterations);
        const intCosts = new Array(iterations);
        const intQalys = new Array(iterations);
        const compCosts = new Array(iterations);
        const compQalys = new Array(iterations);
        const icerValues = [];  // Variable length (skips when incQ === 0)

        // Cache project parameters for the loop
        const projectParams = project.parameters || {};

        // Run iterations
        for (let i = 0; i < iterations; i++) {
            // Sample parameters
            const sampledParams = this.sampleParameters(projectParams);

            // Merge with overrides (reuse objects to reduce allocation)
            const intOverrides = Object.assign({}, sampledParams, interventionOverrides);
            const compOverrides = Object.assign({}, sampledParams, comparatorOverrides);

            // Run model
            const intResult = this.markovEngine.run(project, intOverrides);
            const compResult = this.markovEngine.run(project, compOverrides);

            // Store results (direct assignment instead of push)
            intCosts[i] = intResult.total_costs;
            intQalys[i] = intResult.total_qalys;
            compCosts[i] = compResult.total_costs;
            compQalys[i] = compResult.total_qalys;

            const incC = intResult.total_costs - compResult.total_costs;
            const incQ = intResult.total_qalys - compResult.total_qalys;

            incCosts[i] = incC;
            incQalys[i] = incQ;

            // Calculate ICER (handling edge cases)
            if (incQ !== 0) {
                icerValues.push(incC / incQ);
            }

            // Report progress at configured interval (default 500 iterations)
            if (this.progressCallback && i % this.options.progressInterval === 0) {
                try {
                    await this.progressCallback(i, iterations, null);
                    // Yield to event loop
                    await new Promise(resolve => setTimeout(resolve, 0));
                } catch (progressError) {
                    // Log but don't crash analysis on progress callback errors
                    console.warn('PSA progress callback error:', progressError);
                }
            }
        }

        // Compute summary statistics
        const summary = this.computeSummary(incCosts, incQalys, icerValues, settings);

        // Generate CEAC
        const ceac = this.computeCEAC(incCosts, incQalys, settings, wtpInfo);

        // Compute CE plane quadrant distribution
        const quadrants = this.computeQuadrants(incCosts, incQalys);

        // Run convergence diagnostics
        const convergence = this.checkConvergence(incCosts, incQalys, icerValues, primaryWtp);

        const computationTime = Math.round(performance.now() - startTime);

        const results = {
            iterations: iterations,
            seed: this.options.seed,
            summary: summary,
            ceac: ceac,
            quadrants: quadrants,
            wtp_thresholds: wtpInfo.thresholds,
            primary_wtp: primaryWtp,
            wtp_range: {
                min: wtpInfo.wtpMin,
                max: wtpInfo.wtpMax,
                step: wtpInfo.wtpStep
            },
            guidance_note: OmanGuidanceRef?.guidanceNote ? OmanGuidanceRef.guidanceNote(settings) : null,
            settings_snapshot: {
                currency: settings.currency || guidanceDefaults.currency,
                discount_rate_costs: settings.discount_rate_costs ?? guidanceDefaults.discount_rate_costs,
                discount_rate_qalys: settings.discount_rate_qalys ?? guidanceDefaults.discount_rate_qalys,
                gdp_per_capita_omr: settings.gdp_per_capita_omr,
                wtp_thresholds: settings.wtp_thresholds,
                wtp_multipliers: settings.wtp_multipliers
            },
            scatter: {
                incremental_costs: incCosts,
                incremental_qalys: incQalys
            },
            strategy_results: {
                intervention: {
                    mean_costs: this.mean(intCosts),
                    mean_qalys: this.mean(intQalys)
                },
                comparator: {
                    mean_costs: this.mean(compCosts),
                    mean_qalys: this.mean(compQalys)
                }
            },
            convergence: convergence,
            computation_time_ms: computationTime
        };

        if (this.progressCallback) {
            try {
                await this.progressCallback(iterations, iterations, results);
            } catch (progressError) {
                console.warn('PSA final progress callback error:', progressError);
            }
        }

        return results;
    }

    /**
     * Sample all parameters from their distributions
     * Supports correlated sampling via Cholesky decomposition
     */
    sampleParameters(parameters, correlationMatrix = null) {
        // Check if we need correlated sampling
        const useCorrelation = correlationMatrix &&
            this.options.correlationMatrix &&
            Object.keys(this.options.correlationMatrix).length > 0;

        if (useCorrelation) {
            // Correlated sampling using Cholesky decomposition
            return this.sampleCorrelated(parameters, correlationMatrix);
        }

        // Independent sampling (standard approach)
        const sampled = {};
        for (const [paramId, param] of Object.entries(parameters || {})) {
            if (param.distribution) {
                sampled[paramId] = this.sampleDistribution(param.distribution, param.value);
            } else if (typeof param.value === 'number') {
                sampled[paramId] = param.value;  // Fixed value
            }
        }

        return sampled;
    }

    /**
     * Cholesky decomposition of a correlation matrix
     * Returns lower triangular matrix L where R = L * L'
     */
    choleskyDecomposition(matrix) {
        const n = matrix.length;
        const L = Array(n).fill(null).map(() => Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += L[i][k] * L[j][k];
                }
                if (i === j) {
                    const val = matrix[i][i] - sum;
                    if (val < 0) {
                        throw new Error('Matrix is not positive definite');
                    }
                    L[i][j] = Math.sqrt(val);
                } else {
                    L[i][j] = (matrix[i][j] - sum) / L[j][j];
                }
            }
        }
        return L;
    }

    /**
     * Sample correlated parameters using Cholesky decomposition
     * Transforms independent standard normal samples to correlated samples
     */
    sampleCorrelated(parameters, correlationSpec) {
        const sampled = {};
        const paramIds = Object.keys(parameters);

        // Get correlation matrix for parameters that have correlations defined
        const correlatedParams = correlationSpec.parameters || [];
        const corrMatrix = correlationSpec.matrix || [];

        if (correlatedParams.length === 0 || corrMatrix.length === 0) {
            // Fall back to independent sampling
            for (const [paramId, param] of Object.entries(parameters)) {
                if (param.distribution) {
                    sampled[paramId] = this.sampleDistribution(param.distribution, param.value);
                } else if (typeof param.value === 'number') {
                    sampled[paramId] = param.value;
                }
            }
            return sampled;
        }

        // Cholesky decomposition
        const L = this.choleskyDecomposition(corrMatrix);
        const n = correlatedParams.length;

        // Generate independent standard normal samples
        const z = [];
        for (let i = 0; i < n; i++) {
            z.push(this.rng.normal(0, 1));
        }

        // Transform to correlated samples
        const correlatedZ = [];
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let j = 0; j <= i; j++) {
                sum += L[i][j] * z[j];
            }
            correlatedZ.push(sum);
        }

        // Convert correlated standard normals to parameter values
        for (let i = 0; i < n; i++) {
            const paramId = correlatedParams[i];
            const param = parameters[paramId];
            if (param && param.distribution) {
                // Transform standard normal to desired distribution
                sampled[paramId] = this.transformFromNormal(
                    correlatedZ[i],
                    param.distribution,
                    param.value
                );
            }
        }

        // Sample uncorrelated parameters independently
        for (const [paramId, param] of Object.entries(parameters)) {
            if (!(paramId in sampled)) {
                if (param.distribution) {
                    sampled[paramId] = this.sampleDistribution(param.distribution, param.value);
                } else if (typeof param.value === 'number') {
                    sampled[paramId] = param.value;
                }
            }
        }

        return sampled;
    }

    /**
     * Transform a standard normal sample to a target distribution
     * Uses inverse CDF method
     */
    transformFromNormal(z, dist, baseValue) {
        // Convert z to uniform [0, 1] via standard normal CDF
        const u = this.normalCDF(z);

        // Use inverse CDF of target distribution
        switch (dist.type.toLowerCase()) {
            case 'normal':
            case 'gaussian': {
                const mean = dist.mean ?? baseValue;
                const sd = dist.sd ?? dist.se ?? 0;
                return mean + sd * z;  // Direct transform for normal
            }

            case 'lognormal': {
                let meanlog, sdlog;
                if (dist.meanlog !== undefined && dist.sdlog !== undefined) {
                    meanlog = dist.meanlog;
                    sdlog = dist.sdlog;
                } else {
                    const mean = dist.mean ?? baseValue;
                    const sd = dist.sd ?? dist.se ?? mean * 0.1;
                    sdlog = Math.sqrt(Math.log(1 + (sd * sd) / (mean * mean)));
                    meanlog = Math.log(mean) - sdlog * sdlog / 2;
                }
                return Math.exp(meanlog + sdlog * z);
            }

            case 'beta': {
                let alpha, beta;
                if (dist.alpha !== undefined && dist.beta !== undefined) {
                    alpha = dist.alpha;
                    beta = dist.beta;
                } else {
                    const mean = dist.mean ?? baseValue;
                    const se = dist.se ?? dist.sd ?? mean * 0.1;
                    const variance = se * se;
                    alpha = mean * (mean * (1 - mean) / variance - 1);
                    beta = (1 - mean) * (mean * (1 - mean) / variance - 1);
                }
                return this.betaInverseCDF(u, alpha, beta);
            }

            case 'gamma': {
                let shape, scale;
                if (dist.shape !== undefined && dist.scale !== undefined) {
                    shape = dist.shape;
                    scale = dist.scale;
                } else if (dist.shape !== undefined && dist.rate !== undefined) {
                    shape = dist.shape;
                    scale = 1 / dist.rate;
                } else {
                    const mean = dist.mean ?? baseValue;
                    const se = dist.se ?? dist.sd ?? mean * 0.1;
                    const variance = se * se;
                    shape = mean * mean / variance;
                    scale = variance / mean;
                }
                return this.gammaInverseCDF(u, shape, scale);
            }

            case 'uniform': {
                const min = dist.min ?? 0;
                const max = dist.max ?? 1;
                return min + u * (max - min);
            }

            default:
                // Fall back to normal approximation
                const mean = dist.mean ?? baseValue;
                const sd = dist.sd ?? dist.se ?? mean * 0.1;
                return mean + sd * z;
        }
    }

    /**
     * Standard normal CDF (cumulative distribution function)
     */
    normalCDF(x) {
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

    /**
     * Beta inverse CDF (approximation using Newton-Raphson)
     */
    betaInverseCDF(p, alpha, beta) {
        if (p <= 0) return 0;
        if (p >= 1) return 1;

        // Initial guess
        let x = alpha / (alpha + beta);

        // Newton-Raphson iteration
        for (let i = 0; i < 50; i++) {
            const fx = this.betaCDF(x, alpha, beta) - p;
            if (Math.abs(fx) < 1e-10) break;

            const fpx = this.betaPDF(x, alpha, beta);
            if (fpx < 1e-15) break;

            x = x - fx / fpx;
            x = Math.max(1e-10, Math.min(1 - 1e-10, x));
        }

        return x;
    }

    /**
     * Beta CDF (incomplete beta function)
     */
    betaCDF(x, alpha, beta) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        return this.incompleteBeta(x, alpha, beta);
    }

    /**
     * Beta PDF
     */
    betaPDF(x, alpha, beta) {
        if (x <= 0 || x >= 1) return 0;
        const B = this.betaFunction(alpha, beta);
        return Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1) / B;
    }

    /**
     * Beta function B(a, b)
     */
    betaFunction(a, b) {
        return Math.exp(this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b));
    }

    /**
     * Log gamma function (Lanczos approximation)
     */
    logGamma(x) {
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

        if (x < 0.5) {
            return Math.log(Math.PI / Math.sin(Math.PI * x)) - this.logGamma(1 - x);
        }

        x -= 1;
        let a = c[0];
        const t = x + g + 0.5;

        for (let i = 1; i < g + 2; i++) {
            a += c[i] / (x + i);
        }

        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    }

    /**
     * Incomplete beta function
     */
    incompleteBeta(x, a, b) {
        if (x === 0 || x === 1) return x;

        // Use continued fraction representation
        const bt = Math.exp(
            this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
            a * Math.log(x) + b * Math.log(1 - x)
        );

        if (x < (a + 1) / (a + b + 2)) {
            return bt * this.betaContinuedFraction(x, a, b) / a;
        } else {
            return 1 - bt * this.betaContinuedFraction(1 - x, b, a) / b;
        }
    }

    /**
     * Continued fraction for incomplete beta
     */
    betaContinuedFraction(x, a, b) {
        const maxIterations = 200;
        const epsilon = 1e-14;

        let qab = a + b;
        let qap = a + 1;
        let qam = a - 1;
        let c = 1;
        let d = 1 - qab * x / qap;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        d = 1 / d;
        let h = d;

        for (let m = 1; m <= maxIterations; m++) {
            let m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + aa / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + aa / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            let del = d * c;
            h *= del;
            if (Math.abs(del - 1) < epsilon) break;
        }

        return h;
    }

    /**
     * Gamma inverse CDF (approximation)
     */
    gammaInverseCDF(p, shape, scale) {
        if (p <= 0) return 0;
        if (p >= 1) return Infinity;

        // Initial guess using Wilson-Hilferty approximation
        const u = this.normalInverseCDF(p);
        let x = shape * Math.pow(1 + u / Math.sqrt(9 * shape) - 1 / (9 * shape), 3);
        if (x < 0) x = 0.01;

        // Newton-Raphson refinement
        for (let i = 0; i < 50; i++) {
            const fx = this.gammaCDF(x / scale, shape) - p;
            if (Math.abs(fx) < 1e-10) break;

            const fpx = this.gammaPDF(x / scale, shape) / scale;
            if (fpx < 1e-15) break;

            x = x - fx / fpx;
            x = Math.max(1e-10, x);
        }

        return x;
    }

    /**
     * Gamma CDF (incomplete gamma function)
     */
    gammaCDF(x, shape) {
        if (x <= 0) return 0;
        return this.incompleteGamma(shape, x) / Math.exp(this.logGamma(shape));
    }

    /**
     * Gamma PDF
     */
    gammaPDF(x, shape) {
        if (x <= 0) return 0;
        return Math.pow(x, shape - 1) * Math.exp(-x) / Math.exp(this.logGamma(shape));
    }

    /**
     * Incomplete gamma function (lower)
     */
    incompleteGamma(a, x) {
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;

        if (x < a + 1) {
            // Use series representation
            let sum = 1 / a;
            let term = sum;
            for (let n = 1; n < 200; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
        } else {
            // Use continued fraction
            return Math.exp(this.logGamma(a)) - this.incompleteGammaUpper(a, x);
        }
    }

    /**
     * Upper incomplete gamma function
     */
    incompleteGammaUpper(a, x) {
        let b = x + 1 - a;
        let c = 1 / 1e-30;
        let d = 1 / b;
        let h = d;

        for (let i = 1; i <= 200; i++) {
            let an = -i * (i - a);
            b += 2;
            d = an * d + b;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = b + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            let del = d * c;
            h *= del;
            if (Math.abs(del - 1) < 1e-14) break;
        }

        return Math.exp(-x + a * Math.log(x) - this.logGamma(a)) * h;
    }

    /**
     * Standard normal inverse CDF (probit function)
     */
    normalInverseCDF(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;

        // Rational approximation
        const a = [
            -3.969683028665376e1,
            2.209460984245205e2,
            -2.759285104469687e2,
            1.383577518672690e2,
            -3.066479806614716e1,
            2.506628277459239e0
        ];
        const b = [
            -5.447609879822406e1,
            1.615858368580409e2,
            -1.556989798598866e2,
            6.680131188771972e1,
            -1.328068155288572e1
        ];
        const c = [
            -7.784894002430293e-3,
            -3.223964580411365e-1,
            -2.400758277161838e0,
            -2.549732539343734e0,
            4.374664141464968e0,
            2.938163982698783e0
        ];
        const d = [
            7.784695709041462e-3,
            3.224671290700398e-1,
            2.445134137142996e0,
            3.754408661907416e0
        ];

        const pLow = 0.02425;
        const pHigh = 1 - pLow;

        let q, r;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
                   ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q /
                   (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
                    ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
        }
    }

    /**
     * Sample from a distribution
     */
    sampleDistribution(dist, baseValue) {
        switch (dist.type.toLowerCase()) {
            case 'fixed':
            case 'constant':
                return baseValue;

            case 'normal':
            case 'gaussian':
                return this.rng.normal(dist.mean ?? baseValue, dist.sd ?? dist.se ?? 0);

            case 'lognormal':
                if (dist.meanlog !== undefined && dist.sdlog !== undefined) {
                    return this.rng.lognormal(dist.meanlog, dist.sdlog);
                } else {
                    // Convert from mean/sd of original scale
                    const mean = dist.mean ?? baseValue;
                    const sd = dist.sd ?? dist.se ?? mean * 0.1;
                    const sdlog = Math.sqrt(Math.log(1 + (sd * sd) / (mean * mean)));
                    const meanlog = Math.log(mean) - sdlog * sdlog / 2;
                    return this.rng.lognormal(meanlog, sdlog);
                }

            case 'beta':
                if (dist.alpha !== undefined && dist.beta !== undefined) {
                    return this.rng.beta(dist.alpha, dist.beta);
                } else {
                    // Method of moments from mean/se
                    const mean = dist.mean ?? baseValue;
                    const se = dist.se ?? dist.sd ?? mean * 0.1;
                    const variance = se * se;
                    const alpha = mean * (mean * (1 - mean) / variance - 1);
                    const beta = (1 - mean) * (mean * (1 - mean) / variance - 1);
                    if (alpha > 0 && beta > 0) {
                        return this.rng.beta(alpha, beta);
                    }
                    return mean;
                }

            case 'gamma':
                if (dist.shape !== undefined && dist.scale !== undefined) {
                    return this.rng.gamma(dist.shape, dist.scale);
                } else if (dist.shape !== undefined && dist.rate !== undefined) {
                    return this.rng.gamma(dist.shape, 1 / dist.rate);
                } else {
                    // Method of moments
                    const mean = dist.mean ?? baseValue;
                    const se = dist.se ?? dist.sd ?? mean * 0.1;
                    const variance = se * se;
                    const shape = mean * mean / variance;
                    const scale = variance / mean;
                    return this.rng.gamma(shape, scale);
                }

            case 'uniform':
                return this.rng.uniform(dist.min ?? 0, dist.max ?? 1);

            case 'triangular':
                return this.rng.triangular(
                    dist.min ?? baseValue * 0.8,
                    dist.mode ?? baseValue,
                    dist.max ?? baseValue * 1.2
                );

            default:
                // Unknown distribution type, returning base value
                return baseValue;
        }
    }

    /**
     * Compute summary statistics (optimized - sorts arrays once)
     */
    computeSummary(incCosts, incQalys, icerValues, settings = {}) {
        // Filter valid ICERs (remove Inf, NaN)
        const validIcers = icerValues.filter(x => isFinite(x));
        const wtpThresholds = resolveWtpThresholds(settings);
        const primaryWtp = resolvePrimaryWtp(settings);

        const probCE = {};
        for (const wtp of wtpThresholds) {
            probCE[wtp] = this.computeProbCE(incCosts, incQalys, wtp);
        }
        const primaryProb = probCE[primaryWtp];

        // Sort arrays once for percentile calculations (optimization)
        const sortedCosts = [...incCosts].sort((a, b) => a - b);
        const sortedQalys = [...incQalys].sort((a, b) => a - b);
        const sortedIcers = validIcers.length > 0 ? [...validIcers].sort((a, b) => a - b) : null;

        return {
            mean_incremental_costs: this.mean(incCosts),
            mean_incremental_qalys: this.mean(incQalys),
            sd_incremental_costs: this.sd(incCosts),
            sd_incremental_qalys: this.sd(incQalys),

            mean_icer: validIcers.length > 0 ? this.mean(validIcers) : null,
            median_icer: sortedIcers ? this.percentileFromSorted(sortedIcers, 0.5) : null,
            sd_icer: validIcers.length > 0 ? this.sd(validIcers) : null,

            ci_lower_costs: this.percentileFromSorted(sortedCosts, 0.025),
            ci_upper_costs: this.percentileFromSorted(sortedCosts, 0.975),
            ci_lower_qalys: this.percentileFromSorted(sortedQalys, 0.025),
            ci_upper_qalys: this.percentileFromSorted(sortedQalys, 0.975),
            ci_lower_icer: sortedIcers ? this.percentileFromSorted(sortedIcers, 0.025) : null,
            ci_upper_icer: sortedIcers ? this.percentileFromSorted(sortedIcers, 0.975) : null,

            prob_ce: probCE,
            wtp_thresholds: wtpThresholds,
            primary_wtp: primaryWtp,
            // Compatibility fields: treat the primary Oman threshold as the headline probability.
            prob_ce_20k: primaryProb,
            prob_ce_30k: primaryProb,
            prob_ce_50k: primaryProb
        };
    }

    /**
     * Compute probability of being cost-effective at a WTP threshold
     */
    computeProbCE(incCosts, incQalys, wtp) {
        let count = 0;
        const n = incCosts.length;

        for (let i = 0; i < n; i++) {
            // Cost-effective if NMB > 0
            const nmb = incQalys[i] * wtp - incCosts[i];
            if (nmb >= 0) count++;
        }

        return count / n;
    }

    /**
     * Compute CEAC (Cost-Effectiveness Acceptability Curve)
     */
    computeCEAC(incCosts, incQalys, settings = {}, wtpInfo = null) {
        const ceac = [];
        const info = wtpInfo || resolveWtpRange(settings, this.options);

        const wtpPoints = [];
        for (let wtp = info.wtpMin; wtp <= info.wtpMax; wtp += info.wtpStep) {
            wtpPoints.push(wtp);
        }
        // Ensure the guidance thresholds appear exactly on the CEAC.
        for (const threshold of info.thresholds) {
            wtpPoints.push(threshold);
        }

        const uniquePoints = Array.from(new Set(wtpPoints)).sort((a, b) => a - b);

        for (const wtp of uniquePoints) {
            const prob = this.computeProbCE(incCosts, incQalys, wtp);
            ceac.push({ wtp, probability: prob });
        }

        return ceac;
    }

    /**
     * Compute CE plane quadrant distribution
     */
    computeQuadrants(incCosts, incQalys) {
        const n = incCosts.length;
        let ne = 0, nw = 0, se = 0, sw = 0;

        for (let i = 0; i < n; i++) {
            const c = incCosts[i];
            const q = incQalys[i];

            if (q >= 0 && c >= 0) ne++;      // NE: more effective, more costly
            else if (q >= 0 && c < 0) nw++;  // NW: more effective, less costly (dominant)
            else if (q < 0 && c >= 0) se++;  // SE: less effective, more costly (dominated)
            else sw++;                        // SW: less effective, less costly
        }

        return {
            NE: ne / n,  // More effective, more costly
            NW: nw / n,  // Dominant
            SE: se / n,  // Dominated
            SW: sw / n   // Less effective, less costly
        };
    }

    // Statistical helper functions
    mean(arr) {
        if (arr.length === 0) return 0;
        const sum = new KahanSum();
        for (const v of arr) sum.add(v);
        return sum.total() / arr.length;
    }

    sd(arr) {
        if (arr.length < 2) return 0;
        const m = this.mean(arr);
        const sum = new KahanSum();
        for (const v of arr) {
            sum.add((v - m) * (v - m));
        }
        return Math.sqrt(sum.total() / (arr.length - 1));
    }

    percentile(arr, p) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        return this.percentileFromSorted(sorted, p);
    }

    /**
     * Compute percentile from pre-sorted array (optimization)
     * Use when computing multiple percentiles from the same data
     */
    percentileFromSorted(sorted, p) {
        if (sorted.length === 0) return 0;
        const index = (sorted.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const fraction = index - lower;
        return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
    }

    /**
     * Check PSA convergence by comparing statistics across halves
     * Uses split-half analysis to assess stability
     * @param {Array} incCosts - Incremental costs array
     * @param {Array} incQalys - Incremental QALYs array
     * @param {Array} icerValues - Valid ICER values
     * @param {number} wtp - WTP threshold for P(CE) calculation
     * @returns {Object} Convergence assessment
     */
    checkConvergence(incCosts, incQalys, icerValues, wtp) {
        const n = incCosts.length;
        if (n < 200) {
            return {
                converged: false,
                reason: 'Insufficient iterations (minimum 200 required)',
                iterations: n,
                recommendation: 'Run at least 1000 iterations for stable estimates'
            };
        }

        const half = Math.floor(n / 2);
        const threshold = this.options.convergenceThreshold;

        // Split arrays into halves
        const firstHalfCosts = incCosts.slice(0, half);
        const secondHalfCosts = incCosts.slice(half);
        const firstHalfQalys = incQalys.slice(0, half);
        const secondHalfQalys = incQalys.slice(half);

        // Calculate metrics for each half
        const meanCost1 = this.mean(firstHalfCosts);
        const meanCost2 = this.mean(secondHalfCosts);
        const meanQaly1 = this.mean(firstHalfQalys);
        const meanQaly2 = this.mean(secondHalfQalys);

        // Calculate P(CE) for each half
        const pCE1 = this.computeProbCE(firstHalfCosts, firstHalfQalys, wtp);
        const pCE2 = this.computeProbCE(secondHalfCosts, secondHalfQalys, wtp);

        // Calculate relative changes
        const costChange = meanCost1 !== 0 ? Math.abs((meanCost2 - meanCost1) / meanCost1) : 0;
        const qalyChange = meanQaly1 !== 0 ? Math.abs((meanQaly2 - meanQaly1) / meanQaly1) : 0;
        const pCEChange = Math.abs(pCE2 - pCE1);

        const converged = costChange < threshold &&
                          qalyChange < threshold &&
                          pCEChange < threshold;

        // Monte Carlo Standard Error
        const mcse_costs = this.sd(incCosts) / Math.sqrt(n);
        const mcse_qalys = this.sd(incQalys) / Math.sqrt(n);

        return {
            converged: converged,
            iterations: n,
            metrics: {
                cost_relative_change: costChange,
                qaly_relative_change: qalyChange,
                prob_ce_absolute_change: pCEChange
            },
            monte_carlo_se: {
                costs: mcse_costs,
                qalys: mcse_qalys
            },
            threshold: threshold,
            recommendation: converged
                ? 'PSA has converged. Results are stable.'
                : `Consider running more iterations. Cost change: ${(costChange*100).toFixed(2)}%, QALY change: ${(qalyChange*100).toFixed(2)}%, P(CE) change: ${(pCEChange*100).toFixed(2)}%`
        };
    }
}

/**
 * Run PSA with Web Worker for non-blocking execution
 */
class PSAWorkerRunner {
    constructor() {
        this.worker = null;
    }

    /**
     * Run PSA in a Web Worker
     */
    async run(project, iterations, seed, onProgress) {
        // For now, run synchronously but with progress updates
        // In production, this would use a real Web Worker
        const engine = new PSAEngine({
            iterations,
            seed
        });

        engine.onProgress(async (current, total, results) => {
            if (onProgress) {
                onProgress(current, total, results);
            }
        });

        return await engine.run(project);
    }
}

/**
 * Deterministic Sensitivity Analysis (DSA) Engine
 * Generates tornado diagrams by varying parameters one at a time
 */
class DSAEngine {
    constructor(options = {}) {
        this.options = {
            percentageRange: 0.2,  // +/- 20% by default
            ...options
        };
        this.markovEngine = new MarkovEngine();
        this.progressCallback = null;
    }

    /**
     * Set progress callback for UI updates
     * @param {Function} callback - Function receiving (current, total) arguments
     */
    onProgress(callback) {
        this.progressCallback = callback;
    }

    /**
     * Report progress to callback if set
     */
    reportProgress(current, total) {
        if (this.progressCallback) {
            this.progressCallback(current, total);
        }
    }

    /**
     * Run one-way sensitivity analysis for all parameters
     * Supports two call signatures for backward compatibility:
     * 1. run(project, outcomeMetric, wtp) - legacy
     * 2. run(project, intOverrides, compOverrides, options) - app.js format
     * @returns {Object} DSA results for tornado diagram
     */
    run(project, arg2, arg3, arg4) {
        // Detect call signature
        let outcomeMetric = 'icer';
        let wtp = null;
        let percentageRange = this.options.percentageRange;

        if (typeof arg2 === 'string') {
            // Legacy signature: run(project, outcomeMetric, wtp)
            outcomeMetric = arg2 || 'icer';
            wtp = arg3;
        } else if (typeof arg4 === 'object' && arg4 !== null) {
            // App.js signature: run(project, intOverrides, compOverrides, { range, metric })
            outcomeMetric = arg4.metric || 'icer';
            if (typeof arg4.range === 'number') {
                percentageRange = arg4.range;
            }
        }

        const results = [];
        const parameters = project.parameters || {};
        const settings = project.settings || {};
        const resolvedWtp = Number.isFinite(wtp) ? wtp : resolvePrimaryWtp(settings);

        // Get baseline values
        const baseline = this.markovEngine.runAllStrategies(project);
        const baselineIcer = this.getOutcome(baseline, outcomeMetric, resolvedWtp);

        // Get list of numeric parameters
        const paramEntries = Object.entries(parameters).filter(
            ([_, param]) => typeof param.value === 'number'
        );
        const totalParams = paramEntries.length;
        let processed = 0;

        // Analyze each parameter
        for (const [paramId, param] of paramEntries) {
            const baseValue = param.value;
            let lowValue, highValue;

            // Determine range based on distribution or percentage
            if (param.distribution) {
                const range = this.getDistributionRange(param.distribution, baseValue);
                lowValue = range.low;
                highValue = range.high;
            } else {
                lowValue = baseValue * (1 - percentageRange);
                highValue = baseValue * (1 + percentageRange);
            }

            // Clamp probabilities to [0, 1]
            if (paramId.includes('prob') || paramId.startsWith('p_')) {
                lowValue = Math.max(0, lowValue);
                highValue = Math.min(1, highValue);
            }

            // Run low scenario (modify in place, then restore - avoids deep clone)
            const originalValue = project.parameters[paramId].value;
            project.parameters[paramId].value = lowValue;
            const lowRun = this.markovEngine.runAllStrategies(project);
            const lowOutcome = this.getOutcome(lowRun, outcomeMetric, resolvedWtp);

            // Run high scenario
            project.parameters[paramId].value = highValue;
            const highRun = this.markovEngine.runAllStrategies(project);
            const highOutcome = this.getOutcome(highRun, outcomeMetric, resolvedWtp);

            // Restore original value
            project.parameters[paramId].value = originalValue;

            const swing = Math.abs(highOutcome - lowOutcome);
            results.push({
                parameter: paramId,
                label: param.label || paramId,
                baseValue: baseValue,
                lowValue: lowValue,
                highValue: highValue,
                baseOutcome: baselineIcer,
                // Property names expected by app.js displayDSAResults
                lowResult: lowOutcome,
                highResult: highOutcome,
                swing: swing,
                // Legacy property names for backward compatibility
                lowOutcome: lowOutcome,
                highOutcome: highOutcome,
                range: swing,
                minOutcome: Math.min(lowOutcome, highOutcome),
                maxOutcome: Math.max(lowOutcome, highOutcome)
            });

            // Report progress
            processed++;
            this.reportProgress(processed, totalParams);
        }

        // Sort by impact (swing)
        results.sort((a, b) => b.swing - a.swing);

        return {
            baseline: baselineIcer,
            metric: outcomeMetric,
            wtp: resolvedWtp,
            parameters: results,
            topParameters: results.slice(0, 10)  // Top 10 most influential
        };
    }

    /**
     * Get outcome value from results
     */
    getOutcome(results, metric, wtp) {
        if (!results.incremental || !results.incremental.comparisons ||
            results.incremental.comparisons.length === 0) {
            return 0;
        }

        const comp = results.incremental.comparisons[0];
        switch (metric) {
            case 'icer':
                return typeof comp.icer === 'number' ? comp.icer : 0;
            case 'costs':
                return comp.incremental_costs;
            case 'qalys':
                return comp.incremental_qalys;
            case 'nmb':
                return comp.incremental_qalys * wtp - comp.incremental_costs;
            default:
                return comp.icer || 0;
        }
    }

    /**
     * Get parameter range from distribution (2.5th to 97.5th percentile)
     */
    getDistributionRange(dist, baseValue) {
        switch (dist.type?.toLowerCase()) {
            case 'beta': {
                const alpha = dist.alpha || 10;
                const beta = dist.beta || 10;
                // Approximate percentiles
                const mean = alpha / (alpha + beta);
                const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
                const sd = Math.sqrt(variance);
                const z = this.normalInverseCDF(0.975);
                return {
                    low: Math.max(0, mean - z * sd),
                    high: Math.min(1, mean + z * sd)
                };
            }
            case 'gamma': {
                const mean = dist.mean || baseValue;
                const se = dist.se || dist.sd || mean * 0.1;
                const z = this.normalInverseCDF(0.975);
                return {
                    low: Math.max(0, mean - z * se),
                    high: mean + z * se
                };
            }
            case 'normal':
            case 'gaussian': {
                const mean = dist.mean || baseValue;
                const sd = dist.sd || dist.se || mean * 0.1;
                const z = this.normalInverseCDF(0.975);
                return {
                    low: mean - z * sd,
                    high: mean + z * sd
                };
            }
            case 'lognormal': {
                const mean = dist.mean || baseValue;
                const sd = dist.sd || dist.se || mean * 0.3;
                const z = this.normalInverseCDF(0.975);
                return {
                    low: Math.max(0, mean - z * sd),
                    high: mean + z * sd
                };
            }
            case 'uniform': {
                return {
                    low: dist.min ?? baseValue * 0.8,
                    high: dist.max ?? baseValue * 1.2
                };
            }
            default:
                return {
                    low: baseValue * 0.8,
                    high: baseValue * 1.2
                };
        }
    }

    /**
     * Find threshold-crossing value for a parameter (OWSA threshold analysis)
     * Uses bisection to find the parameter value where ICER crosses WTP threshold
     * @param {Object} project - HTA project
     * @param {string} paramId - Parameter ID to analyze
     * @param {number} wtp - WTP threshold
     * @param {Object} options - { tolerance, maxIterations }
     * @returns {Object|null} { thresholdValue, direction, baseValue } or null if no crossing
     */
    findThresholdCrossing(project, paramId, wtp, options = {}) {
        const tolerance = options.tolerance || 0.01;  // 1% tolerance
        const maxIterations = options.maxIterations || 50;
        const param = project.parameters[paramId];
        if (!param || typeof param.value !== 'number') return null;

        const baseValue = param.value;
        const range = this.getDistributionRange(param.distribution || {}, baseValue);

        // Get baseline ICER
        const baselineRun = this.markovEngine.runAllStrategies(project);
        const baselineIcer = this.getOutcome(baselineRun, 'icer', wtp);
        if (!Number.isFinite(baselineIcer)) return null;

        const baselineCE = baselineIcer <= wtp;

        // Check if threshold crossing exists in range
        const originalValue = project.parameters[paramId].value;

        project.parameters[paramId].value = range.low;
        const lowRun = this.markovEngine.runAllStrategies(project);
        const lowIcer = this.getOutcome(lowRun, 'icer', wtp);
        const lowCE = Number.isFinite(lowIcer) && lowIcer <= wtp;

        project.parameters[paramId].value = range.high;
        const highRun = this.markovEngine.runAllStrategies(project);
        const highIcer = this.getOutcome(highRun, 'icer', wtp);
        const highCE = Number.isFinite(highIcer) && highIcer <= wtp;

        project.parameters[paramId].value = originalValue;

        // No crossing if both ends have same CE conclusion
        if (lowCE === highCE) {
            return null;
        }

        // Bisection search
        let lo = range.low, hi = range.high;
        for (let i = 0; i < maxIterations; i++) {
            const mid = (lo + hi) / 2;
            project.parameters[paramId].value = mid;
            const midRun = this.markovEngine.runAllStrategies(project);
            const midIcer = this.getOutcome(midRun, 'icer', wtp);
            const midCE = Number.isFinite(midIcer) && midIcer <= wtp;

            if (Math.abs(hi - lo) / Math.abs(baseValue) < tolerance) {
                project.parameters[paramId].value = originalValue;
                return {
                    thresholdValue: mid,
                    direction: midIcer > baselineIcer ? 'increases' : 'decreases',
                    baseValue: baseValue,
                    baselineIcer: baselineIcer,
                    thresholdIcer: midIcer,
                    wtpThreshold: wtp
                };
            }

            if (midCE === lowCE) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        project.parameters[paramId].value = originalValue;
        return null;
    }

    /**
     * Run threshold analysis for all parameters
     * @param {Object} project - HTA project
     * @param {number} wtp - WTP threshold
     * @returns {Array} Parameters with threshold crossings
     */
    runThresholdAnalysis(project, wtp) {
        const parameters = project.parameters || {};
        const settings = project.settings || {};
        const resolvedWtp = Number.isFinite(wtp) ? wtp : resolvePrimaryWtp(settings);
        const results = [];

        for (const [paramId, param] of Object.entries(parameters)) {
            if (typeof param.value !== 'number') continue;

            const crossing = this.findThresholdCrossing(project, paramId, resolvedWtp);
            if (crossing) {
                results.push({
                    parameter: paramId,
                    label: param.label || paramId,
                    ...crossing
                });
            }
        }

        return {
            wtp: resolvedWtp,
            crossings: results,
            summary: `${results.length} of ${Object.keys(parameters).length} parameters have threshold crossings at WTP=${resolvedWtp}`
        };
    }

    /**
     * Run two-way sensitivity analysis
     */
    runTwoWay(project, param1Id, param2Id, steps = 10, outcomeMetric = 'icer', wtp) {
        const param1 = project.parameters[param1Id];
        const param2 = project.parameters[param2Id];
        const settings = project.settings || {};
        const resolvedWtp = Number.isFinite(wtp) ? wtp : resolvePrimaryWtp(settings);

        if (!param1 || !param2) {
            throw new Error('Invalid parameter IDs');
        }

        const range1 = this.getDistributionRange(param1.distribution || {}, param1.value);
        const range2 = this.getDistributionRange(param2.distribution || {}, param2.value);

        const step1 = (range1.high - range1.low) / steps;
        const step2 = (range2.high - range2.low) / steps;

        const results = [];
        const values1 = [];
        const values2 = [];

        for (let i = 0; i <= steps; i++) {
            values1.push(range1.low + i * step1);
            values2.push(range2.low + i * step2);
        }

        for (let i = 0; i <= steps; i++) {
            const row = [];
            for (let j = 0; j <= steps; j++) {
                const modProject = JSON.parse(JSON.stringify(project));
                modProject.parameters[param1Id].value = values1[i];
                modProject.parameters[param2Id].value = values2[j];

                const run = this.markovEngine.runAllStrategies(modProject);
                const outcome = this.getOutcome(run, outcomeMetric, resolvedWtp);
                row.push(outcome);
            }
            results.push(row);
        }

        return {
            parameter1: { id: param1Id, label: param1.label, values: values1 },
            parameter2: { id: param2Id, label: param2.label, values: values2 },
            outcomes: results,
            metric: outcomeMetric,
            wtp: resolvedWtp
        };
    }
}

/**
 * EVPI (Expected Value of Perfect Information) Calculator
 * Calculates the value of eliminating all parameter uncertainty
 */
class EVPICalculator {
    constructor() {
        this.psaEngine = null;
    }

    /**
     * Calculate EVPI from PSA results
     * @param {Object} psaResults - Results from PSA run
     * @param {number} wtp - Willingness-to-pay threshold
     * @param {number} population - Affected population size (annual)
     * @param {number} timeHorizon - Technology relevance horizon (years)
     * @returns {Object} EVPI results
     */
    calculate(psaResults, wtp, population = 10000, timeHorizon = 10) {
        const settings = psaResults?.settings_snapshot || {};
        const resolvedWtp = Number.isFinite(wtp) ? wtp : (psaResults?.primary_wtp || resolvePrimaryWtp(settings));
        const { scatter } = psaResults;
        const incCosts = scatter.incremental_costs;
        const incQalys = scatter.incremental_qalys;
        const n = incCosts.length;

        // Calculate NMB for each iteration
        const nmbs = [];
        for (let i = 0; i < n; i++) {
            nmbs.push(incQalys[i] * resolvedWtp - incCosts[i]);
        }

        // Expected NMB with current information
        const expectedNMB = nmbs.reduce((a, b) => a + b, 0) / n;
        const currentDecision = expectedNMB >= 0 ? 'adopt' : 'reject';

        // Expected NMB with perfect information
        // = E[max(NMB_intervention, NMB_comparator)]
        // = E[max(NMB, 0)] (since comparator NMB = 0)
        let perfectNMB = 0;
        for (let i = 0; i < n; i++) {
            perfectNMB += Math.max(nmbs[i], 0);
        }
        perfectNMB /= n;

        // EVPI per patient
        const evpiPerPatient = perfectNMB - Math.max(expectedNMB, 0);

        // Population EVPI
        const populationEVPI = evpiPerPatient * population * timeHorizon;

        // Calculate probability of wrong decision
        let wrongDecisions = 0;
        for (let i = 0; i < n; i++) {
            const optimalChoice = nmbs[i] >= 0;
            const currentChoice = expectedNMB >= 0;
            if (optimalChoice !== currentChoice) {
                wrongDecisions++;
            }
        }
        const probWrongDecision = wrongDecisions / n;

        return {
            wtp: resolvedWtp,
            expectedNMB: expectedNMB,
            currentDecision: currentDecision,
            perfectNMB: perfectNMB,
            evpiPerPatient: evpiPerPatient,
            population: population,
            timeHorizon: timeHorizon,
            populationEVPI: populationEVPI,
            probWrongDecision: probWrongDecision,
            interpretation: this.interpret(evpiPerPatient, populationEVPI, probWrongDecision, settings)
        };
    }

    /**
     * Calculate EVPI across WTP range for EVPI curve
     */
    calculateCurve(psaResults, wtpMin, wtpMax, wtpStep, population = 10000, timeHorizon = 10) {
        const settings = psaResults?.settings_snapshot || {};
        const thresholds = resolveWtpThresholds(settings);
        const maxThreshold = Math.max(...thresholds);
        const derivedMax = Math.max(maxThreshold, Math.round(maxThreshold * 1.5));

        const min = Number.isFinite(wtpMin) ? wtpMin : 0;
        const max = Number.isFinite(wtpMax) ? wtpMax : derivedMax;
        const step = Number.isFinite(wtpStep) ? wtpStep : Math.max(1000, Math.round(max / 20));

        const curve = [];
        const wtpPoints = [];
        for (let wtp = min; wtp <= max; wtp += step) {
            wtpPoints.push(wtp);
        }
        for (const threshold of thresholds) {
            wtpPoints.push(threshold);
        }
        const uniquePoints = Array.from(new Set(wtpPoints)).sort((a, b) => a - b);

        for (const wtp of uniquePoints) {
            const result = this.calculate(psaResults, wtp, population, timeHorizon);
            curve.push({
                wtp: wtp,
                evpiPerPatient: result.evpiPerPatient,
                populationEVPI: result.populationEVPI
            });
        }
        return curve;
    }

    /**
     * Generate interpretation text
     */
    interpret(evpiPerPatient, populationEVPI, probWrongDecision, settings = {}) {
        const interpretations = [];

        if (evpiPerPatient < 100) {
            interpretations.push('Very low per-patient EVPI suggests parameter uncertainty has minimal impact on the decision.');
        } else if (evpiPerPatient < 1000) {
            interpretations.push('Moderate per-patient EVPI indicates some value in reducing uncertainty.');
        } else {
            interpretations.push('High per-patient EVPI suggests significant value in conducting further research.');
        }

        if (populationEVPI > 10000000) {
            const popMillions = formatCurrency(populationEVPI / 1000000, settings, { maximumFractionDigits: 1 });
            interpretations.push(`Population EVPI of ${popMillions}M suggests substantial research investment may be justified.`);
        } else if (populationEVPI > 1000000) {
            const popMillions = formatCurrency(populationEVPI / 1000000, settings, { maximumFractionDigits: 1 });
            interpretations.push(`Population EVPI of ${popMillions}M suggests moderate research investment may be worthwhile.`);
        }

        if (probWrongDecision > 0.4) {
            interpretations.push(`High probability of wrong decision (${(probWrongDecision*100).toFixed(0)}%) indicates substantial decision uncertainty.`);
        }

        return interpretations.join(' ');
    }
}

/**
 * Convergence Diagnostics for PSA
 * Monitors stability of PSA estimates over iterations
 */
class ConvergenceDiagnostics {
    constructor() {
        this.history = {
            iterations: [],
            meanCosts: [],
            meanQalys: [],
            meanIcer: [],
            probCE: []
        };
    }

    /**
     * Record diagnostic data point
     */
    record(iteration, incCosts, incQalys, wtp) {
        const n = incCosts.length;
        if (n === 0) return;
        const resolvedWtp = Number.isFinite(wtp) ? wtp : resolvePrimaryWtp({});

        const meanCost = incCosts.reduce((a, b) => a + b, 0) / n;
        const meanQaly = incQalys.reduce((a, b) => a + b, 0) / n;
        const meanIcer = meanQaly !== 0 ? meanCost / meanQaly : null;

        let ceCount = 0;
        for (let i = 0; i < n; i++) {
            if (incQalys[i] * resolvedWtp - incCosts[i] >= 0) ceCount++;
        }
        const probCE = ceCount / n;

        this.history.iterations.push(iteration);
        this.history.meanCosts.push(meanCost);
        this.history.meanQalys.push(meanQaly);
        this.history.meanIcer.push(meanIcer);
        this.history.probCE.push(probCE);
    }

    /**
     * Check if PSA has converged
     * @param {number} threshold - Maximum relative change threshold (default 1%)
     * @param {number} window - Number of recent points to compare
     */
    checkConvergence(threshold = 0.01, window = 5) {
        const h = this.history;
        const n = h.iterations.length;

        if (n < window * 2) {
            return {
                converged: false,
                reason: 'Insufficient iterations for convergence check',
                metrics: {}
            };
        }

        const metrics = {};

        // Check each metric
        const checkMetric = (values, name) => {
            const recent = values.slice(-window);
            const previous = values.slice(-window * 2, -window);

            const recentMean = recent.filter(x => x !== null).reduce((a, b) => a + b, 0) / recent.length;
            const previousMean = previous.filter(x => x !== null).reduce((a, b) => a + b, 0) / previous.length;

            if (previousMean === 0) {
                return { converged: Math.abs(recentMean) < 0.001, change: 0 };
            }

            const relativeChange = Math.abs((recentMean - previousMean) / previousMean);
            return { converged: relativeChange < threshold, change: relativeChange };
        };

        metrics.costs = checkMetric(h.meanCosts, 'costs');
        metrics.qalys = checkMetric(h.meanQalys, 'qalys');
        metrics.probCE = checkMetric(h.probCE, 'probCE');

        const allConverged = metrics.costs.converged &&
                           metrics.qalys.converged &&
                           metrics.probCE.converged;

        return {
            converged: allConverged,
            iterations: n,
            metrics: metrics,
            recommendation: allConverged
                ? 'PSA has converged. Results are stable.'
                : `Consider running more iterations. Current change: costs ${(metrics.costs.change*100).toFixed(2)}%, QALYs ${(metrics.qalys.change*100).toFixed(2)}%, P(CE) ${(metrics.probCE.change*100).toFixed(2)}%`
        };
    }

    /**
     * Get convergence trace data for plotting
     */
    getTrace() {
        return { ...this.history };
    }

    /**
     * Calculate Monte Carlo standard error
     */
    calculateMCSE(values) {
        const n = values.length;
        if (n < 2) return 0;

        const mean = values.reduce((a, b) => a + b, 0) / n;
        let sumSq = 0;
        for (const v of values) {
            sumSq += (v - mean) ** 2;
        }
        const sd = Math.sqrt(sumSq / (n - 1));
        return sd / Math.sqrt(n);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.PSAEngine = PSAEngine;
    window.PSA = PSAEngine;
    window.ProbabilisticSensitivityAnalysis = PSAEngine;
    window.PSAWorkerRunner = PSAWorkerRunner;
    window.DSAEngine = DSAEngine;
    window.EVPICalculator = EVPICalculator;
    window.ConvergenceDiagnostics = ConvergenceDiagnostics;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PSAEngine, PSAWorkerRunner };
}
