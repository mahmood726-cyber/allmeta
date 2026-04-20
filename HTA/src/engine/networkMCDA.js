/**
 * Network MCDA Engine
 * Combines Network Meta-Analysis results with MCDA scoring
 * for multi-criteria treatment ranking.
 *
 * Features:
 * - Normalize NMA effects to [0,1] using criteria scales
 * - Direction-aware scoring (maximize vs minimize)
 * - Weighted composite scores and treatment ranking
 * - Probabilistic ranking via NMA posterior sampling (PCG32)
 * - Value of Information: per-criterion ranking sensitivity to uncertainty
 * - Dominance detection across criteria
 */

var PCG32Ref = (function() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) return globalThis.PCG32;
    if (typeof require === 'function') { try { return require('../utils/pcg32').PCG32; } catch(e) {} }
    return null;
})();

// ============ HELPERS ============

/**
 * Normalize a raw value to [0,1] given scale [min, max].
 * Clamps to [0, 1].
 */
function normalize(raw, scale) {
    const [sMin, sMax] = scale;
    if (sMax === sMin) return 0.5; // Degenerate scale
    const norm = (raw - sMin) / (sMax - sMin);
    return Math.max(0, Math.min(1, norm));
}

/**
 * Apply direction: for 'minimize', invert normalized score.
 */
function applyDirection(normalized, direction) {
    return direction === 'minimize' ? (1 - normalized) : normalized;
}

// ============ VALIDATION ============

function validateInputs(nmaResults, criteriaConfig, weights) {
    if (!nmaResults || !Array.isArray(nmaResults.treatments) || nmaResults.treatments.length === 0) {
        throw new Error('nmaResults must have a non-empty treatments array');
    }
    if (!nmaResults.effects || typeof nmaResults.effects !== 'object') {
        throw new Error('nmaResults must have an effects object');
    }
    if (!Array.isArray(criteriaConfig) || criteriaConfig.length === 0) {
        throw new Error('criteriaConfig must be a non-empty array');
    }

    for (const c of criteriaConfig) {
        if (!c.name) throw new Error('Each criterion must have a name');
        if (c.direction !== 'maximize' && c.direction !== 'minimize') {
            throw new Error(`Invalid direction "${c.direction}" for criterion "${c.name}"`);
        }
        if (!Array.isArray(c.scale) || c.scale.length !== 2) {
            throw new Error(`Criterion "${c.name}" must have a scale [min, max]`);
        }
        if (c.scale[0] >= c.scale[1]) {
            throw new Error(`Criterion "${c.name}" scale min must be < max`);
        }
        if (!nmaResults.effects[c.name]) {
            throw new Error(`NMA effects missing criterion "${c.name}"`);
        }

        // Check all treatments have effects for this criterion
        for (const tx of nmaResults.treatments) {
            if (nmaResults.effects[c.name][tx] === undefined) {
                throw new Error(`Missing effect for treatment "${tx}" on criterion "${c.name}"`);
            }
        }
    }

    if (weights) {
        const criteriaNames = new Set(criteriaConfig.map(c => c.name));
        for (const key of Object.keys(weights)) {
            if (!criteriaNames.has(key)) {
                throw new Error(`Weight references unknown criterion "${key}"`);
            }
        }
        for (const c of criteriaConfig) {
            if (!(c.name in weights)) {
                throw new Error(`Missing weight for criterion "${c.name}"`);
            }
        }
        // Warn but don't throw if weights don't sum to 1 (normalize internally)
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1.0) > 0.01) {
            // Auto-normalize
        }
    }
}

/**
 * Normalize weights to sum to 1.
 */
function normalizeWeights(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum <= 0) throw new Error('Weights must sum to a positive value');
    const out = {};
    for (const [k, v] of Object.entries(weights)) {
        out[k] = v / sum;
    }
    return out;
}

// ============ ENGINE ============

class NetworkMCDAEngine {
    /**
     * @param {Object} options
     * @param {number} [options.seed=12345] - PCG32 seed
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 12345;
    }

    /**
     * Evaluate treatments using NMA + MCDA.
     * @param {Object} nmaResults - NMA results with treatments, effects, uncertainty
     * @param {Array} criteriaConfig - Criteria definitions [{name, direction, scale}]
     * @param {Object} weights - Criterion weights {name: weight}
     * @returns {Object} {rankings, dominance, sensitivity}
     */
    evaluate(nmaResults, criteriaConfig, weights) {
        validateInputs(nmaResults, criteriaConfig, weights);
        const normW = normalizeWeights(weights);
        const treatments = nmaResults.treatments;

        // Step 1: Normalize and score each treatment
        const scored = treatments.map(tx => {
            let totalScore = 0;
            const contributions = {};
            const normalizedValues = {};

            for (const c of criteriaConfig) {
                const raw = nmaResults.effects[c.name][tx];
                const norm = normalize(raw, c.scale);
                const directed = applyDirection(norm, c.direction);
                normalizedValues[c.name] = directed;
                const weighted = directed * normW[c.name];
                contributions[c.name] = weighted;
                totalScore += weighted;
            }

            return { name: tx, score: totalScore, contributions, normalizedValues };
        });

        // Step 2: Sort by score descending, assign ranks
        scored.sort((a, b) => {
            if (Math.abs(b.score - a.score) > 1e-12) return b.score - a.score;
            return a.name.localeCompare(b.name);
        });

        let currentRank = 1;
        for (let i = 0; i < scored.length; i++) {
            if (i > 0 && Math.abs(scored[i].score - scored[i - 1].score) < 1e-12) {
                scored[i].rank = scored[i - 1].rank;
            } else {
                scored[i].rank = currentRank;
            }
            currentRank = i + 2;
        }

        // Step 3: Dominance detection
        const dominance = [];
        for (let i = 0; i < scored.length; i++) {
            for (let j = 0; j < scored.length; j++) {
                if (i === j) continue;
                const A = scored[j]; // potential dominator
                const B = scored[i]; // potentially dominated
                let allGe = true;
                let anyGt = false;
                for (const c of criteriaConfig) {
                    const aVal = A.normalizedValues[c.name];
                    const bVal = B.normalizedValues[c.name];
                    if (aVal < bVal - 1e-12) { allGe = false; break; }
                    if (aVal > bVal + 1e-12) anyGt = true;
                }
                if (allGe && anyGt) {
                    dominance.push({ dominated: B.name, by: A.name });
                    break;
                }
            }
        }

        // Step 4: Simple weight sensitivity — per criterion
        const sensitivity = criteriaConfig.map(c => {
            // How much does this criterion's weight affect the top-ranked treatment?
            const topTx = scored[0].name;
            return {
                criterion: c.name,
                weight: normW[c.name],
                topContribution: scored[0].contributions[c.name]
            };
        });

        return {
            rankings: scored.map(s => ({
                name: s.name,
                score: s.score,
                rank: s.rank,
                contributions: s.contributions
            })),
            dominance,
            sensitivity
        };
    }

    /**
     * Probabilistic ranking: sample from NMA posteriors, compute MCDA, count rank frequencies.
     * @param {Object} nmaResults - NMA results with effects and uncertainty (SE)
     * @param {Array} criteriaConfig - Criteria definitions
     * @param {Object} weights - Criterion weights
     * @param {number} [nSim=10000] - Number of simulations
     * @returns {Object} {treatments: [{name, rankProb, meanRank, bestProb}]}
     */
    probabilisticRanking(nmaResults, criteriaConfig, weights, nSim = 10000) {
        if (!PCG32Ref) throw new Error('PCG32 required for probabilistic ranking');
        validateInputs(nmaResults, criteriaConfig, weights);
        const normW = normalizeWeights(weights);
        const treatments = nmaResults.treatments;
        const nTx = treatments.length;
        const rng = new PCG32Ref(this.seed);

        const uncertainty = nmaResults.uncertainty || {};

        // Rank counts: rankCounts[txIdx][rankIdx]
        const rankCounts = treatments.map(() => new Array(nTx).fill(0));

        for (let sim = 0; sim < nSim; sim++) {
            // Sample treatment effects for each criterion
            const sampledEffects = {};
            for (const c of criteriaConfig) {
                sampledEffects[c.name] = {};
                for (const tx of treatments) {
                    const mean = nmaResults.effects[c.name][tx];
                    const se = (uncertainty[c.name] && uncertainty[c.name][tx] !== undefined)
                        ? uncertainty[c.name][tx] : 0;
                    if (se > 0) {
                        sampledEffects[c.name][tx] = rng.normal(mean, se);
                    } else {
                        sampledEffects[c.name][tx] = mean;
                    }
                }
            }

            // Compute MCDA scores for this sample
            const scores = treatments.map((tx, idx) => {
                let score = 0;
                for (const c of criteriaConfig) {
                    const raw = sampledEffects[c.name][tx];
                    const norm = normalize(raw, c.scale);
                    const directed = applyDirection(norm, c.direction);
                    score += directed * normW[c.name];
                }
                return { idx, score };
            });

            // Sort descending
            scores.sort((a, b) => {
                if (Math.abs(b.score - a.score) > 1e-12) return b.score - a.score;
                return a.idx - b.idx;
            });

            // Record ranks
            for (let r = 0; r < nTx; r++) {
                rankCounts[scores[r].idx][r]++;
            }
        }

        // Compute rank probabilities
        const results = treatments.map((tx, idx) => {
            const rankProb = rankCounts[idx].map(c => c / nSim);
            const meanRank = rankProb.reduce((sum, p, r) => sum + p * (r + 1), 0);
            const bestProb = rankProb[0];
            return { name: tx, rankProb, meanRank, bestProb };
        });

        return { treatments: results };
    }

    /**
     * Value of Information: for each criterion, how much would eliminating
     * its uncertainty change the ranking?
     * @param {Object} nmaResults - NMA results with effects and uncertainty
     * @param {Array} criteriaConfig - Criteria definitions
     * @param {Object} weights - Criterion weights
     * @param {number} [nSim=5000] - Number of simulations
     * @returns {Array} [{criterion, voi, currentUncertainty}]
     */
    valueOfInformation(nmaResults, criteriaConfig, weights, nSim = 5000) {
        if (!PCG32Ref) throw new Error('PCG32 required for VOI');
        validateInputs(nmaResults, criteriaConfig, weights);
        const normW = normalizeWeights(weights);
        const treatments = nmaResults.treatments;
        const uncertainty = nmaResults.uncertainty || {};

        // Baseline ranking with full uncertainty
        const baseRanking = this.probabilisticRanking(nmaResults, criteriaConfig, weights, nSim);
        const baseBestProbs = {};
        for (const tx of baseRanking.treatments) {
            baseBestProbs[tx.name] = tx.bestProb;
        }

        // For each criterion, eliminate its uncertainty and re-rank
        const voiResults = criteriaConfig.map(criterion => {
            // Compute current average uncertainty for this criterion
            let totalUncertainty = 0;
            let count = 0;
            for (const tx of treatments) {
                const se = (uncertainty[criterion.name] && uncertainty[criterion.name][tx] !== undefined)
                    ? uncertainty[criterion.name][tx] : 0;
                totalUncertainty += se;
                count++;
            }
            const avgUncertainty = count > 0 ? totalUncertainty / count : 0;

            // Create modified NMA results with zero uncertainty for this criterion
            const modifiedUncertainty = {};
            for (const c of criteriaConfig) {
                modifiedUncertainty[c.name] = {};
                for (const tx of treatments) {
                    if (c.name === criterion.name) {
                        modifiedUncertainty[c.name][tx] = 0; // Eliminate uncertainty
                    } else {
                        modifiedUncertainty[c.name][tx] =
                            (uncertainty[c.name] && uncertainty[c.name][tx] !== undefined)
                                ? uncertainty[c.name][tx] : 0;
                    }
                }
            }

            const modifiedNMA = {
                treatments: nmaResults.treatments,
                effects: nmaResults.effects,
                uncertainty: modifiedUncertainty
            };

            const modRanking = this.probabilisticRanking(modifiedNMA, criteriaConfig, weights, nSim);

            // VOI = increase in decision certainty (max bestProb) when uncertainty eliminated
            const modMaxBest = Math.max(...modRanking.treatments.map(t => t.bestProb));
            const baseMaxBest = Math.max(...baseRanking.treatments.map(t => t.bestProb));
            const voi = modMaxBest - baseMaxBest;

            return {
                criterion: criterion.name,
                voi: Math.max(0, voi), // VOI is non-negative
                currentUncertainty: avgUncertainty
            };
        });

        // Sort by VOI descending
        voiResults.sort((a, b) => b.voi - a.voi);

        return voiResults;
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.NetworkMCDAEngine = NetworkMCDAEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NetworkMCDAEngine };
}
