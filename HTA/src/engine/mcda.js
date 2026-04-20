/**
 * Multi-Criteria Decision Analysis (MCDA) Engine
 * HTA benefit-risk assessment with weighted-sum, swing weighting,
 * rank acceptability analysis, and weight sensitivity.
 *
 * Methods:
 * - weightedSum: score alternatives on normalized criteria with weights
 * - swingWeight: derive weights from ranked swing ranges
 * - rankAcceptability: Monte Carlo rank probability via weight distributions
 * - detectDominance: identify dominated alternatives (Pareto)
 * - weightSensitivity: one-at-a-time weight variation trajectories
 * - partialValue: partial value functions (linear, concave, convex, step)
 */

var PCG32Ref = (function() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) return globalThis.PCG32;
    if (typeof require === 'function') {
        try { return require('../utils/pcg32').PCG32; } catch(e) {}
    }
    return null;
})();

class MCDAEngine {
    /**
     * @param {Object} options
     * @param {number} options.seed - Seed for stochastic rank acceptability (default 12345)
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 12345;
    }

    // ─── Input Validation ────────────────────────────────────────

    /**
     * Validate inputs shared across methods.
     * @param {Array} alternatives
     * @param {Array} criteria
     * @param {Object} weights
     */
    _validateInputs(alternatives, criteria, weights) {
        if (!Array.isArray(alternatives) || alternatives.length === 0) {
            throw new Error('alternatives must be a non-empty array');
        }
        if (!Array.isArray(criteria) || criteria.length === 0) {
            throw new Error('criteria must be a non-empty array');
        }

        // Validate each criterion
        for (const c of criteria) {
            if (!c.name) throw new Error('Each criterion must have a name');
            if (c.direction !== 'maximize' && c.direction !== 'minimize') {
                throw new Error(`Invalid direction "${c.direction}" for criterion "${c.name}". Must be "maximize" or "minimize".`);
            }
            if (!Array.isArray(c.scale) || c.scale.length !== 2) {
                throw new Error(`Criterion "${c.name}" must have a scale [min, max]`);
            }
            if (c.scale[0] >= c.scale[1]) {
                throw new Error(`Criterion "${c.name}" scale min (${c.scale[0]}) must be < max (${c.scale[1]})`);
            }
        }

        if (weights) {
            // Check all criteria are referenced
            const criteriaNames = new Set(criteria.map(c => c.name));
            for (const key of Object.keys(weights)) {
                if (!criteriaNames.has(key)) {
                    throw new Error(`Weight references unknown criterion "${key}"`);
                }
            }
            for (const c of criteria) {
                if (!(c.name in weights)) {
                    throw new Error(`Missing weight for criterion "${c.name}"`);
                }
            }

            // Check weights sum to ~1
            const sum = Object.values(weights).reduce((a, b) => a + b, 0);
            if (Math.abs(sum - 1.0) > 0.01) {
                throw new Error(`Weights must sum to 1 (got ${sum.toFixed(4)})`);
            }
        }
    }

    // ─── Partial Value Functions ─────────────────────────────────

    /**
     * Map a raw value to [0, 1] using a partial value function.
     * @param {number} raw - Raw criterion value
     * @param {number[]} scale - [min, max]
     * @param {string} type - 'linear' | 'concave' | 'convex' | 'step'
     * @returns {number} Value in [0, 1]
     */
    partialValue(raw, scale, type = 'linear') {
        const [sMin, sMax] = scale;
        // Clamp to scale
        const clamped = Math.max(sMin, Math.min(sMax, raw));
        const normalized = (clamped - sMin) / (sMax - sMin);

        switch (type) {
            case 'linear':
                return normalized;
            case 'concave':
                return Math.sqrt(normalized);
            case 'convex':
                return normalized * normalized;
            case 'step':
                return normalized >= 0.5 ? 1 : 0;
            default:
                throw new Error(`Unknown partial value type: "${type}"`);
        }
    }

    // ─── Normalization ───────────────────────────────────────────

    /**
     * Normalize a raw value for a criterion to [0, 1], accounting for direction.
     * @param {number} raw
     * @param {Object} criterion
     * @param {string} pvType - partial value function type
     * @returns {number}
     */
    _normalize(raw, criterion, pvType = 'linear') {
        const pv = this.partialValue(raw, criterion.scale, pvType);
        return criterion.direction === 'minimize' ? (1 - pv) : pv;
    }

    // ─── Weighted Sum ────────────────────────────────────────────

    /**
     * Compute weighted-sum scores for alternatives.
     * @param {Array} alternatives - [{name, values: {criterion: val, ...}}, ...]
     * @param {Array} criteria - [{name, direction, scale}, ...]
     * @param {Object} weights - {criterion: weight, ...} summing to 1
     * @returns {Array} [{name, score, rank, normalizedValues}, ...] sorted by score desc
     */
    weightedSum(alternatives, criteria, weights) {
        this._validateInputs(alternatives, criteria, weights);

        const results = alternatives.map(alt => {
            const normalizedValues = {};
            let score = 0;
            for (const c of criteria) {
                const raw = alt.values[c.name];
                if (raw === undefined || raw === null) {
                    throw new Error(`Alternative "${alt.name}" missing value for criterion "${c.name}"`);
                }
                // P2-8: Validate criterion values are finite numbers
                if (typeof raw !== 'number' || !isFinite(raw)) {
                    throw new Error(`Alternative "${alt.name}" has non-finite value for criterion "${c.name}": ${raw}`);
                }
                const nv = this._normalize(raw, c);
                normalizedValues[c.name] = nv;
                score += nv * weights[c.name];
            }
            return { name: alt.name, score, normalizedValues };
        });

        // Sort descending by score, then alphabetically by name for stability
        results.sort((a, b) => {
            if (Math.abs(b.score - a.score) > 1e-12) return b.score - a.score;
            return a.name.localeCompare(b.name);
        });

        // Assign ranks (1-based), ties get same rank
        let currentRank = 1;
        for (let i = 0; i < results.length; i++) {
            if (i > 0 && Math.abs(results[i].score - results[i - 1].score) < 1e-12) {
                results[i].rank = results[i - 1].rank;
            } else {
                results[i].rank = currentRank;
            }
            currentRank = i + 2; // next potential rank
        }

        return results;
    }

    // ─── Swing Weighting ─────────────────────────────────────────

    /**
     * Derive weights from swing weighting procedure.
     * Rank 1 = most important swing (weight 100), others proportional.
     * @param {Array} ranges - [{criterion, worst, best, rank}, ...]
     * @returns {Object} {criterion: weight, ...} normalized to sum=1
     */
    swingWeight(ranges) {
        if (!Array.isArray(ranges) || ranges.length === 0) {
            throw new Error('ranges must be a non-empty array');
        }

        const n = ranges.length;
        // Assign raw weights inversely proportional to rank
        // Rank 1 → 100, Rank 2 → 100*(n-1)/n, ..., Rank n → 100/n
        // Simple linear interpolation: rank 1 gets 100, rank n gets 100/n
        const rawWeights = {};
        for (const r of ranges) {
            // Weight proportional to importance: rank 1 = 100, rank k = 100 * (n - k + 1) / n
            rawWeights[r.criterion] = 100 * (n - r.rank + 1) / n;
        }

        // Normalize to sum = 1
        const total = Object.values(rawWeights).reduce((a, b) => a + b, 0);
        const weights = {};
        for (const [key, val] of Object.entries(rawWeights)) {
            weights[key] = val / total;
        }

        return weights;
    }

    // ─── Rank Acceptability Analysis ─────────────────────────────

    /**
     * Monte Carlo rank acceptability analysis.
     * Sample weights from distributions, compute weighted sum, count rank frequencies.
     * @param {Array} alternatives - [{name, values: {...}}, ...]
     * @param {Array} criteria - [{name, direction, scale}, ...]
     * @param {Array} weightDists - [{criterion, dist: {type, ...}}, ...]
     * @param {number} nSim - Number of simulations (default 10000)
     * @returns {Array} [{name, rankProb: [p1, p2, ...], centralWeight: {...}}, ...]
     */
    rankAcceptability(alternatives, criteria, weightDists, nSim = 10000) {
        if (!PCG32Ref) {
            throw new Error('PCG32 required for rank acceptability analysis');
        }

        this._validateInputs(alternatives, criteria, null);

        const rng = new PCG32Ref(this.seed);
        const nAlts = alternatives.length;
        const nCrit = criteria.length;

        // Initialize rank counts: rankCounts[altIdx][rankIdx]
        const rankCounts = alternatives.map(() => new Array(nAlts).fill(0));
        // Accumulate weights when alternative ranks 1st for central weight
        const centralWeightAccum = alternatives.map(() => {
            const obj = {};
            for (const c of criteria) obj[c.name] = 0;
            return obj;
        });
        const rank1Counts = new Array(nAlts).fill(0);

        // Pre-normalize alternative values
        const normalizedAlts = alternatives.map(alt => {
            const nv = {};
            for (const c of criteria) {
                nv[c.name] = this._normalize(alt.values[c.name], c);
            }
            return nv;
        });

        // Build dist lookup
        const distMap = {};
        for (const wd of weightDists) {
            distMap[wd.criterion] = wd.dist;
        }

        for (let sim = 0; sim < nSim; sim++) {
            // Sample raw weights from distributions
            const rawW = {};
            for (const c of criteria) {
                const dist = distMap[c.name];
                if (!dist) {
                    throw new Error(`No weight distribution for criterion "${c.name}"`);
                }
                rawW[c.name] = rng.sample(dist);
                if (rawW[c.name] < 0) rawW[c.name] = 0; // clamp negatives
            }

            // Normalize sampled weights to sum to 1
            const wSum = Object.values(rawW).reduce((a, b) => a + b, 0);
            if (wSum <= 0) continue; // skip degenerate sample
            const w = {};
            for (const c of criteria) {
                w[c.name] = rawW[c.name] / wSum;
            }

            // Compute scores
            const scores = alternatives.map((alt, idx) => {
                let s = 0;
                for (const c of criteria) {
                    s += normalizedAlts[idx][c.name] * w[c.name];
                }
                return { idx, score: s };
            });

            // Sort descending by score, stable by original index
            scores.sort((a, b) => {
                if (Math.abs(b.score - a.score) > 1e-12) return b.score - a.score;
                return a.idx - b.idx;
            });

            // Record ranks
            for (let r = 0; r < nAlts; r++) {
                const altIdx = scores[r].idx;
                rankCounts[altIdx][r]++;
                if (r === 0) {
                    rank1Counts[altIdx]++;
                    for (const c of criteria) {
                        centralWeightAccum[altIdx][c.name] += w[c.name];
                    }
                }
            }
        }

        // Compute probabilities and central weights
        const results = alternatives.map((alt, idx) => {
            const rankProb = rankCounts[idx].map(count => count / nSim);
            const centralWeight = {};
            for (const c of criteria) {
                centralWeight[c.name] = rank1Counts[idx] > 0
                    ? centralWeightAccum[idx][c.name] / rank1Counts[idx]
                    : 0;
            }
            return { name: alt.name, rankProb, centralWeight };
        });

        return results;
    }

    // ─── Dominance Detection ─────────────────────────────────────

    /**
     * Detect dominated alternatives.
     * A dominates B if A >= B on all criteria (normalized) and A > B on at least one.
     * @param {Array} alternatives - [{name, values: {...}}, ...]
     * @param {Array} criteria - [{name, direction, scale}, ...]
     * @returns {Array} [{name, dominatedBy}, ...] for dominated alternatives
     */
    detectDominance(alternatives, criteria) {
        this._validateInputs(alternatives, criteria, null);

        // Pre-normalize
        const normalizedAlts = alternatives.map(alt => {
            const nv = {};
            for (const c of criteria) {
                nv[c.name] = this._normalize(alt.values[c.name], c);
            }
            return { name: alt.name, nv };
        });

        const dominated = [];

        for (let i = 0; i < normalizedAlts.length; i++) {
            for (let j = 0; j < normalizedAlts.length; j++) {
                if (i === j) continue;

                const A = normalizedAlts[j]; // potential dominator
                const B = normalizedAlts[i]; // potentially dominated

                let allGe = true;
                let anyGt = false;

                for (const c of criteria) {
                    const aVal = A.nv[c.name];
                    const bVal = B.nv[c.name];
                    if (aVal < bVal - 1e-12) {
                        allGe = false;
                        break;
                    }
                    if (aVal > bVal + 1e-12) {
                        anyGt = true;
                    }
                }

                if (allGe && anyGt) {
                    dominated.push({ name: B.name, dominatedBy: A.name });
                    break; // Only report first dominator
                }
            }
        }

        return dominated;
    }

    // ─── Weight Sensitivity ──────────────────────────────────────

    /**
     * One-at-a-time weight sensitivity analysis.
     * Vary targetCriterion weight from 0 to 1, redistribute remaining proportionally.
     * @param {Array} alternatives
     * @param {Array} criteria
     * @param {Object} weights - base weights
     * @param {string} targetCriterion - criterion to vary
     * @param {number} steps - number of steps (default 20)
     * @returns {Object} {weights: [...], scores: {altName: [...], ...}, crossings: [...]}
     */
    weightSensitivity(alternatives, criteria, weights, targetCriterion, steps = 20) {
        this._validateInputs(alternatives, criteria, weights);

        if (!(targetCriterion in weights)) {
            throw new Error(`Target criterion "${targetCriterion}" not found in weights`);
        }

        // Sum of other weights
        const otherSum = Object.entries(weights)
            .filter(([k]) => k !== targetCriterion)
            .reduce((s, [, v]) => s + v, 0);

        const weightValues = [];
        const scoreTrajectories = {};
        for (const alt of alternatives) {
            scoreTrajectories[alt.name] = [];
        }

        for (let i = 0; i <= steps; i++) {
            const tw = i / steps;
            weightValues.push(tw);

            // Build adjusted weights
            const adjWeights = {};
            const remaining = 1 - tw;
            for (const c of criteria) {
                if (c.name === targetCriterion) {
                    adjWeights[c.name] = tw;
                } else {
                    // Redistribute proportionally
                    adjWeights[c.name] = otherSum > 1e-12
                        ? weights[c.name] / otherSum * remaining
                        : remaining / (criteria.length - 1);
                }
            }

            // Compute scores using weightedSum (but skip validation to avoid sum check issues)
            for (const alt of alternatives) {
                let score = 0;
                for (const c of criteria) {
                    const nv = this._normalize(alt.values[c.name], c);
                    score += nv * adjWeights[c.name];
                }
                scoreTrajectories[alt.name].push(score);
            }
        }

        // Detect crossings (rank changes)
        const crossings = [];
        const altNames = alternatives.map(a => a.name);
        for (let i = 1; i <= steps; i++) {
            // Get ranking at step i-1 and step i
            const prevScores = altNames.map(n => ({ name: n, score: scoreTrajectories[n][i - 1] }));
            const currScores = altNames.map(n => ({ name: n, score: scoreTrajectories[n][i] }));
            prevScores.sort((a, b) => b.score - a.score);
            currScores.sort((a, b) => b.score - a.score);

            if (prevScores[0].name !== currScores[0].name) {
                crossings.push({
                    weight: weightValues[i],
                    from: prevScores[0].name,
                    to: currScores[0].name
                });
            }
        }

        return {
            weights: weightValues,
            scores: scoreTrajectories,
            crossings
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MCDAEngine = MCDAEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MCDAEngine };
}
