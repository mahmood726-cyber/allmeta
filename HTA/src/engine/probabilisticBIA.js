/**
 * Probabilistic Budget Impact Analysis (BIA) Engine
 * Monte Carlo wrapper around BudgetImpactEngine with parameter uncertainty.
 *
 * Features:
 * - Sample parameters from distributions (beta, gamma, normal, etc.)
 * - Dot-notation parameter overrides for nested config fields
 * - Budget exceedance curve: P(BIA > threshold) for a range of budgets
 * - Tornado diagram: one-at-a-time sensitivity via 5th/95th percentiles
 * - Deterministic base case always included for comparison
 *
 * Depends on: BudgetImpactEngine, PCG32
 */

var BIARef = (function() {
    if (typeof globalThis !== 'undefined' && globalThis.BudgetImpactEngine) return globalThis.BudgetImpactEngine;
    if (typeof require === 'function') { try { return require('./budgetImpact').BudgetImpactEngine; } catch(e) {} }
    return null;
})();

var PCG32Ref = (function() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) return globalThis.PCG32;
    if (typeof require === 'function') { try { return require('../utils/pcg32').PCG32; } catch(e) {} }
    return null;
})();

// ============ HELPERS ============

/**
 * Deep clone a plain object (arrays, nested objects, primitives).
 * Does not handle Date, Map, Set, etc. — not needed for BIA configs.
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const out = {};
    for (const key of Object.keys(obj)) {
        out[key] = deepClone(obj[key]);
    }
    return out;
}

/**
 * Set a value in a nested object using dot-notation path.
 * E.g. setByPath(obj, 'newTx.drugCost', 4000)
 */
function setByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        // Handle array indices: 'uptake.0' → uptake[0]
        if (Array.isArray(current)) {
            const idx = parseInt(key, 10);
            if (current[idx] === undefined || current[idx] === null) {
                current[idx] = {};
            }
            current = current[idx];
        } else {
            if (current[key] === undefined || current[key] === null) {
                current[key] = {};
            }
            current = current[key];
        }
    }
    const lastKey = parts[parts.length - 1];
    if (Array.isArray(current)) {
        current[parseInt(lastKey, 10)] = value;
    } else {
        current[lastKey] = value;
    }
}

/**
 * Get a value from a nested object using dot-notation path.
 */
function getByPath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const key of parts) {
        if (current === null || current === undefined) return undefined;
        if (Array.isArray(current)) {
            current = current[parseInt(key, 10)];
        } else {
            current = current[key];
        }
    }
    return current;
}

/**
 * Compute the mean of a distribution specification (analytical).
 */
function distributionMean(dist) {
    if (!dist || !dist.type) return 0;
    switch (dist.type.toLowerCase()) {
        case 'fixed':
        case 'constant':
            return dist.value;
        case 'normal':
        case 'gaussian':
            return dist.mean;
        case 'lognormal':
            return Math.exp(dist.meanlog + 0.5 * dist.sdlog * dist.sdlog);
        case 'beta':
            return dist.alpha / (dist.alpha + dist.beta);
        case 'gamma':
            return dist.shape * dist.scale;
        case 'uniform':
            return (dist.min + dist.max) / 2;
        case 'triangular':
            return (dist.min + dist.mode + dist.max) / 3;
        case 'exponential':
            return 1 / dist.rate;
        case 'weibull':
            // Approximate: scale * Gamma(1 + 1/shape); use scale for simplicity
            return dist.scale;
        default:
            return 0;
    }
}

/**
 * Compute the 5th and 95th percentile of a distribution via sampling.
 * Uses PCG32 for determinism.
 */
function distributionPercentiles(dist, rng, n = 2000) {
    const samples = [];
    // Save state, sample, restore is unnecessary — caller manages RNG lifecycle
    const tempRng = new PCG32Ref(54321); // Fixed seed for percentile estimation
    for (let i = 0; i < n; i++) {
        samples.push(tempRng.sample(dist));
    }
    samples.sort((a, b) => a - b);
    const p5idx = Math.max(0, Math.floor(n * 0.05));
    const p95idx = Math.min(n - 1, Math.floor(n * 0.95));
    return { p5: samples[p5idx], p95: samples[p95idx] };
}

/**
 * Compute sorted percentiles from an array of numbers.
 */
function computePercentiles(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const pct = (p) => {
        const idx = p * (n - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return sorted[lo];
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };
    return {
        p5: pct(0.05),
        p25: pct(0.25),
        p50: pct(0.50),
        p75: pct(0.75),
        p95: pct(0.95)
    };
}

// ============ VALIDATION ============

const SUPPORTED_DIST_TYPES = new Set([
    'fixed', 'constant', 'normal', 'gaussian', 'lognormal',
    'beta', 'gamma', 'uniform', 'triangular', 'exponential', 'weibull'
]);

function validateParamDists(paramDists) {
    if (!paramDists || typeof paramDists !== 'object') return;
    for (const [path, dist] of Object.entries(paramDists)) {
        if (!dist || !dist.type) {
            throw new Error(`Invalid distribution for parameter "${path}": missing type`);
        }
        if (!SUPPORTED_DIST_TYPES.has(dist.type.toLowerCase())) {
            throw new Error(`Unknown distribution type "${dist.type}" for parameter "${path}"`);
        }
    }
}

// ============ ENGINE ============

class ProbabilisticBIAEngine {
    /**
     * @param {Object} options
     * @param {number} [options.seed=12345] - PCG32 seed for reproducibility
     * @param {number} [options.nIterations=1000] - Default number of Monte Carlo iterations
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 12345;
        this.nIterations = options.nIterations ?? 1000;
    }

    /**
     * Run probabilistic BIA.
     * @param {Object} config - BudgetImpactEngine.run() config
     * @param {Object} paramDists - Map of dot-notation paths to distribution specs
     * @param {Object} [runOptions] - Override options for this run
     * @param {number} [runOptions.nIterations] - Override iteration count
     * @param {number} [runOptions.budgetThreshold] - Compute P(BIA > threshold)
     * @returns {Object} Probabilistic BIA results
     */
    run(config, paramDists = {}, runOptions = {}) {
        if (!BIARef) {
            throw new Error('BudgetImpactEngine required for probabilistic BIA');
        }
        if (!PCG32Ref) {
            throw new Error('PCG32 required for probabilistic BIA');
        }

        validateParamDists(paramDists);

        const nIter = runOptions.nIterations ?? this.nIterations;
        const budgetThreshold = runOptions.budgetThreshold ?? null;
        const rng = new PCG32Ref(this.seed);
        const bia = new BIARef();

        // Run deterministic base case with mean parameter values
        const baseConfig = deepClone(config);
        for (const [path, dist] of Object.entries(paramDists)) {
            const meanVal = distributionMean(dist);
            setByPath(baseConfig, path, meanVal);
        }
        const deterministic = bia.run(baseConfig);

        // If no param distributions, return deterministic only
        const paramKeys = Object.keys(paramDists);
        if (paramKeys.length === 0) {
            return {
                iterations: [deterministic],
                summary: {
                    mean: deterministic.netBudgetImpact,
                    median: deterministic.netBudgetImpact,
                    ci95: [deterministic.netBudgetImpact, deterministic.netBudgetImpact],
                    ci90: [deterministic.netBudgetImpact, deterministic.netBudgetImpact],
                    probExceedsBudget: budgetThreshold != null
                        ? (deterministic.netBudgetImpact > budgetThreshold ? 1 : 0)
                        : undefined
                },
                percentiles: {
                    p5: deterministic.netBudgetImpact,
                    p25: deterministic.netBudgetImpact,
                    p50: deterministic.netBudgetImpact,
                    p75: deterministic.netBudgetImpact,
                    p95: deterministic.netBudgetImpact
                },
                deterministic
            };
        }

        // Monte Carlo iterations
        const iterations = [];
        const netBIAs = [];

        for (let i = 0; i < nIter; i++) {
            const iterConfig = deepClone(config);

            // Sample each parameter
            for (const [path, dist] of Object.entries(paramDists)) {
                const sampled = rng.sample(dist);
                setByPath(iterConfig, path, sampled);
            }

            try {
                const result = bia.run(iterConfig);
                iterations.push(result);
                netBIAs.push(result.netBudgetImpact);
            } catch (e) {
                // Skip invalid samples (e.g. sampled negative values)
                continue;
            }
        }

        if (netBIAs.length === 0) {
            throw new Error('All Monte Carlo iterations failed — check parameter distributions');
        }

        // Compute summary statistics
        const mean = netBIAs.reduce((a, b) => a + b, 0) / netBIAs.length;
        const pct = computePercentiles(netBIAs);

        let probExceedsBudget;
        if (budgetThreshold != null) {
            const exceedCount = netBIAs.filter(v => v > budgetThreshold).length;
            probExceedsBudget = exceedCount / netBIAs.length;
        }

        // CI95 = 2.5th and 97.5th percentiles
        const sorted = [...netBIAs].sort((a, b) => a - b);
        const n = sorted.length;
        const pctAt = (p) => {
            const idx = p * (n - 1);
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            if (lo === hi) return sorted[lo];
            return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
        };
        const ci95 = [pctAt(0.025), pctAt(0.975)];
        const ci90 = [pctAt(0.05), pctAt(0.95)];

        return {
            iterations,
            summary: {
                mean,
                median: pct.p50,
                ci95,
                ci90,
                probExceedsBudget: probExceedsBudget !== undefined ? probExceedsBudget : undefined
            },
            percentiles: pct,
            deterministic
        };
    }

    /**
     * Budget exceedance curve: P(BIA > threshold) for a range of budgets.
     * @param {Object} config - BIA config
     * @param {Object} paramDists - Parameter distributions
     * @param {number[]} budgetRange - Array of budget thresholds to evaluate
     * @param {Object} [runOptions] - Override options
     * @returns {Array} [{budget, probability}, ...]
     */
    budgetExceedanceCurve(config, paramDists, budgetRange, runOptions = {}) {
        if (!BIARef) throw new Error('BudgetImpactEngine required');
        if (!PCG32Ref) throw new Error('PCG32 required');
        if (!Array.isArray(budgetRange) || budgetRange.length === 0) {
            throw new Error('budgetRange must be a non-empty array');
        }

        validateParamDists(paramDists);

        const nIter = runOptions.nIterations ?? this.nIterations;
        const rng = new PCG32Ref(this.seed);
        const bia = new BIARef();

        // Run all iterations once and collect net BIA values
        const netBIAs = [];
        for (let i = 0; i < nIter; i++) {
            const iterConfig = deepClone(config);
            for (const [path, dist] of Object.entries(paramDists)) {
                setByPath(iterConfig, path, rng.sample(dist));
            }
            try {
                const result = bia.run(iterConfig);
                netBIAs.push(result.netBudgetImpact);
            } catch (e) {
                continue;
            }
        }

        if (netBIAs.length === 0) {
            throw new Error('All Monte Carlo iterations failed');
        }

        // Sort budgetRange to report in order
        const sortedBudgets = [...budgetRange].sort((a, b) => a - b);

        return sortedBudgets.map(budget => ({
            budget,
            probability: netBIAs.filter(v => v > budget).length / netBIAs.length
        }));
    }

    /**
     * Tornado diagram for BIA: one-at-a-time sensitivity.
     * Vary each parameter to its 5th/95th percentile while others at mean.
     * @param {Object} config - BIA config
     * @param {Object} paramDists - Parameter distributions
     * @returns {Array} [{param, low, high, baseValue, lowInput, highInput, width}, ...] sorted by width desc
     */
    tornadoBIA(config, paramDists) {
        if (!BIARef) throw new Error('BudgetImpactEngine required');
        if (!PCG32Ref) throw new Error('PCG32 required');

        validateParamDists(paramDists);

        const bia = new BIARef();
        const paramKeys = Object.keys(paramDists);

        if (paramKeys.length === 0) {
            return [];
        }

        // Build base config with all parameters at their means
        const baseConfig = deepClone(config);
        for (const [path, dist] of Object.entries(paramDists)) {
            setByPath(baseConfig, path, distributionMean(dist));
        }
        const baseResult = bia.run(baseConfig);
        const baseValue = baseResult.netBudgetImpact;

        // For each parameter, vary to p5 and p95, keeping others at mean
        const bars = [];
        for (const param of paramKeys) {
            const dist = paramDists[param];
            const pcts = distributionPercentiles(dist, null);

            // Low scenario: parameter at p5
            const lowConfig = deepClone(baseConfig);
            setByPath(lowConfig, param, pcts.p5);
            const lowResult = bia.run(lowConfig);

            // High scenario: parameter at p95
            const highConfig = deepClone(baseConfig);
            setByPath(highConfig, param, pcts.p95);
            const highResult = bia.run(highConfig);

            const lowBIA = lowResult.netBudgetImpact;
            const highBIA = highResult.netBudgetImpact;

            bars.push({
                param,
                low: Math.min(lowBIA, highBIA),
                high: Math.max(lowBIA, highBIA),
                baseValue,
                lowInput: pcts.p5,
                highInput: pcts.p95,
                width: Math.abs(highBIA - lowBIA)
            });
        }

        // Sort by width descending (most influential first)
        bars.sort((a, b) => b.width - a.width);

        return bars;
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.ProbabilisticBIAEngine = ProbabilisticBIAEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProbabilisticBIAEngine };
}
