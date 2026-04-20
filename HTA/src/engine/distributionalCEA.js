/**
 * Distributional Cost-Effectiveness Analysis (DCEA) Engine
 *
 * Standard CEA treats all QALYs equally. DCEA weights QALYs by equity
 * considerations — health gains in disadvantaged groups count more.
 * Incorporates NICE's 2022 severity modifier (1.0x / 1.2x / 1.7x).
 *
 * References:
 * - Cookson R, Mirelman AJ, Griffin S et al. (2017) "Using Cost-Effectiveness
 *   Analysis to Address Health Equity Concerns" Value in Health 20(2):206-212
 * - NICE (2022) Methods of Health Technology Evaluation (PMG36), Severity Modifier
 * - Asaria M, Griffin S, Cookson R (2016) "Distributional Cost-Effectiveness
 *   Analysis: A Tutorial" Medical Decision Making 36(1):8-19
 * - Atkinson AB (1970) "On the measurement of inequality" Journal of Economic Theory
 *
 * Features:
 * - NICE absolute & proportional QALY shortfall calculation
 * - Severity-weighted QALYs (1.0x / 1.2x / 1.7x multiplier)
 * - Atkinson & Kolm inequality indices
 * - Equity-weighted cost-effectiveness (distributional weights)
 * - Subgroup-level analysis with equity adjustment
 */

'use strict';

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

/** NICE severity modifier thresholds (absolute QALY shortfall) */
const NICE_MOST_SEVERE_THRESHOLD = 0.72;
const NICE_SEVERE_THRESHOLD = 0.47;

/** NICE severity multipliers (January 2022, PMG36 Table 3) */
const NICE_MULTIPLIER_MOST_SEVERE = 1.7;
const NICE_MULTIPLIER_SEVERE = 1.2;
const NICE_MULTIPLIER_NOT_SEVERE = 1.0;

/** Small epsilon for floating-point comparisons */
const EPSILON = 1e-12;

// ============ HELPERS ============

/**
 * Kahan-stable summation of an array.
 * Falls back to naive summation if KahanSum is unavailable.
 */
function stableSum(values) {
    if (KahanRef && typeof KahanRef.sum === 'function') {
        return KahanRef.sum(values);
    }
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i];
    return s;
}

/**
 * Validate that a value is a finite number.
 */
function requireFinite(val, name) {
    if (typeof val !== 'number' || !isFinite(val)) {
        throw new Error(`${name} must be a finite number, got ${val}`);
    }
}

/**
 * Validate condition object used by NICE shortfall methods.
 */
function validateCondition(condition) {
    if (!condition || typeof condition !== 'object') {
        throw new Error('condition must be an object');
    }
    requireFinite(condition.ageAtOnset, 'condition.ageAtOnset');
    requireFinite(condition.qualityOfLife, 'condition.qualityOfLife');
    requireFinite(condition.prognosis, 'condition.prognosis');
    requireFinite(condition.generalPopulationQALY, 'condition.generalPopulationQALY');
    if (condition.prognosis < 0) {
        throw new Error('condition.prognosis must be >= 0');
    }
    if (condition.generalPopulationQALY < 0) {
        throw new Error('condition.generalPopulationQALY must be >= 0');
    }
}

// ============ MAIN CLASS ============

class DistributionalCEAEngine {
    /**
     * @param {Object} [options]
     * @param {number} [options.seed=12345] - RNG seed for any Monte Carlo components
     * @param {number} [options.wtp=30000] - Default WTP per QALY
     */
    constructor(options = {}) {
        this.options = {
            seed: 12345,
            wtp: 30000,
            ...options
        };
        if (PCG32Ref) {
            this.rng = new PCG32Ref(this.options.seed);
        }
    }

    // --------------------------------------------------------
    // NICE SEVERITY MODIFIER
    // --------------------------------------------------------

    /**
     * Compute absolute QALY shortfall.
     *
     * Absolute shortfall = generalPopulationQALY - diseaseQALY
     * where diseaseQALY = qualityOfLife * prognosis (undiscounted).
     *
     * This represents how many QALYs the patient will lose due to
     * the condition relative to the general population.
     *
     * @param {Object} condition
     * @param {number} condition.ageAtOnset - Age at disease onset
     * @param {number} condition.qualityOfLife - Utility weight during disease (0-1)
     * @param {number} condition.prognosis - Years remaining without treatment
     * @param {number} condition.generalPopulationQALY - Expected QALYs for matched general population
     * @returns {number} Absolute QALY shortfall
     */
    absoluteQALYShortfall(condition) {
        validateCondition(condition);
        const diseaseQALY = condition.qualityOfLife * condition.prognosis;
        const shortfall = condition.generalPopulationQALY - diseaseQALY;
        return Math.max(0, shortfall);
    }

    /**
     * Compute proportional QALY shortfall.
     *
     * Proportional shortfall = absoluteShortfall / generalPopulationQALY
     * Returns value in [0, 1]; 0 means no shortfall, 1 means total shortfall.
     *
     * @param {Object} condition - Same as absoluteQALYShortfall
     * @returns {number} Proportional QALY shortfall in [0, 1]
     */
    proportionalQALYShortfall(condition) {
        validateCondition(condition);
        const absShortfall = this.absoluteQALYShortfall(condition);
        if (condition.generalPopulationQALY < EPSILON) {
            return 0;
        }
        return Math.min(1, Math.max(0, absShortfall / condition.generalPopulationQALY));
    }

    /**
     * Determine NICE severity category from absolute shortfall.
     *
     * NICE PMG36 Table 3:
     * - "most_severe": absolute shortfall >= 0.72
     * - "severe":      absolute shortfall in [0.47, 0.72)
     * - "not_severe":  absolute shortfall < 0.47
     *
     * @param {number} shortfall - Absolute QALY shortfall (proportion of remaining QALYs lost)
     * @returns {string} 'most_severe' | 'severe' | 'not_severe'
     */
    niceSeverityCategory(shortfall) {
        requireFinite(shortfall, 'shortfall');
        if (shortfall >= NICE_MOST_SEVERE_THRESHOLD) {
            return 'most_severe';
        }
        if (shortfall >= NICE_SEVERE_THRESHOLD) {
            return 'severe';
        }
        return 'not_severe';
    }

    /**
     * Get the NICE severity multiplier for a given category.
     *
     * @param {string} category - 'most_severe' | 'severe' | 'not_severe'
     * @returns {number} Multiplier (1.0, 1.2, or 1.7)
     */
    niceSeverityMultiplier(category) {
        switch (category) {
            case 'most_severe': return NICE_MULTIPLIER_MOST_SEVERE;
            case 'severe':      return NICE_MULTIPLIER_SEVERE;
            case 'not_severe':  return NICE_MULTIPLIER_NOT_SEVERE;
            default:
                throw new Error(`Unknown severity category: ${category}`);
        }
    }

    /**
     * Compute severity-weighted QALY.
     *
     * Applies NICE's severity modifier to a base QALY gain:
     *   weightedQALY = baseQaly * severityMultiplier
     *
     * @param {number} baseQaly - Unweighted QALY gain from intervention
     * @param {Object} condition - Patient condition (see absoluteQALYShortfall)
     * @param {Object} [options]
     * @param {boolean} [options.useProportional=false] - Use proportional shortfall
     * @returns {Object} { weightedQaly, multiplier, category, absoluteShortfall, proportionalShortfall }
     */
    severityWeightedQALY(baseQaly, condition, options = {}) {
        requireFinite(baseQaly, 'baseQaly');
        validateCondition(condition);

        const absShortfall = this.absoluteQALYShortfall(condition);
        const propShortfall = this.proportionalQALYShortfall(condition);

        // NICE uses absolute shortfall for severity categorisation
        const shortfallForCategory = options.useProportional ? propShortfall : absShortfall;
        const category = this.niceSeverityCategory(shortfallForCategory);
        const multiplier = this.niceSeverityMultiplier(category);

        return {
            weightedQaly: baseQaly * multiplier,
            multiplier,
            category,
            absoluteShortfall: absShortfall,
            proportionalShortfall: propShortfall
        };
    }

    // --------------------------------------------------------
    // EQUITY-WEIGHTED CEA
    // --------------------------------------------------------

    /**
     * Compute the Atkinson inequality index.
     *
     * A(ε) = 1 - [Σ p_i * h_i^(1-ε)]^(1/(1-ε)) / μ
     *
     * When ε = 0: A = 0 (standard utilitarian, no equity weighting)
     * When ε → 1: uses geometric mean (Rawlsian-leaning)
     * When ε > 1: increasingly prioritarian (focus on worst-off)
     *
     * @param {Array} subgroups - [{proportion, health}, ...]
     * @param {number} epsilon - Inequality aversion parameter (≥ 0)
     * @returns {number} Atkinson index in [0, 1)
     */
    atkinsonIndex(subgroups, epsilon) {
        if (!Array.isArray(subgroups) || subgroups.length === 0) {
            throw new Error('subgroups must be a non-empty array');
        }
        requireFinite(epsilon, 'epsilon');
        if (epsilon < 0) {
            throw new Error('epsilon (inequality aversion) must be >= 0');
        }

        // Compute mean health
        const meanHealth = stableSum(subgroups.map(s => s.proportion * s.health));

        if (meanHealth < EPSILON) return 0;

        // Check if all groups have equal health
        const allEqual = subgroups.every(s => Math.abs(s.health - meanHealth) < EPSILON);
        if (allEqual) return 0;

        if (Math.abs(epsilon) < EPSILON) {
            // ε = 0: standard utilitarian — no inequality weighting
            return 0;
        }

        if (Math.abs(epsilon - 1) < EPSILON) {
            // ε = 1: geometric mean
            let logSum = 0;
            for (const s of subgroups) {
                if (s.health <= 0) return 1; // degenerate: zero health → maximal inequality
                logSum += s.proportion * Math.log(s.health);
            }
            const geometricMean = Math.exp(logSum);
            return 1 - geometricMean / meanHealth;
        }

        // General case: ε ≠ 0, ε ≠ 1
        const oneMinusEps = 1 - epsilon;
        const weightedPowerSum = stableSum(
            subgroups.map(s => {
                if (s.health <= 0) return 0;
                return s.proportion * Math.pow(s.health, oneMinusEps);
            })
        );
        const ede = Math.pow(weightedPowerSum, 1 / oneMinusEps);
        return Math.max(0, 1 - ede / meanHealth);
    }

    /**
     * Compute the Kolm absolute inequality index.
     *
     * K(α) = (1/α) * ln[Σ p_i * exp(α * (μ - h_i))]
     *
     * @param {Array} subgroups - [{proportion, health}, ...]
     * @param {number} alpha - Inequality aversion (> 0)
     * @returns {number} Kolm index (≥ 0)
     */
    kolmIndex(subgroups, alpha) {
        if (!Array.isArray(subgroups) || subgroups.length === 0) {
            throw new Error('subgroups must be a non-empty array');
        }
        requireFinite(alpha, 'alpha');
        if (alpha <= 0) {
            throw new Error('alpha must be > 0 for Kolm index');
        }

        const meanHealth = stableSum(subgroups.map(s => s.proportion * s.health));
        const weightedExpSum = stableSum(
            subgroups.map(s => s.proportion * Math.exp(alpha * (meanHealth - s.health)))
        );
        return (1 / alpha) * Math.log(weightedExpSum);
    }

    /**
     * Run equity-weighted cost-effectiveness analysis.
     *
     * Adjusts Net Monetary Benefit by distributional equity weights.
     * Subgroups with lower baseline health receive higher weight when ε > 0.
     *
     * @param {Object} psaResults - PSA-style results: { incCost, incQaly } or per-subgroup
     * @param {Object} equityWeights - Equity weighting specification
     * @param {string} equityWeights.method - 'atkinson' | 'kolm' | 'custom'
     * @param {number} equityWeights.inequalityAversion - ε (Atkinson) or α (Kolm)
     * @param {Array} equityWeights.subgroups - [{name, proportion, baselineHealth, incQaly, incCost}, ...]
     * @param {Object} [options]
     * @param {number} [options.wtp] - WTP per QALY (defaults to this.options.wtp)
     * @param {Object} [options.severity] - Condition for NICE severity modifier
     * @returns {Object} Equity-adjusted CEA results
     */
    equityWeightedCEA(psaResults, equityWeights, options = {}) {
        if (!equityWeights || !equityWeights.subgroups || !Array.isArray(equityWeights.subgroups)) {
            throw new Error('equityWeights must include a subgroups array');
        }
        if (equityWeights.subgroups.length === 0) {
            throw new Error('subgroups array must not be empty');
        }

        const wtp = options.wtp ?? this.options.wtp;
        const method = equityWeights.method || 'atkinson';
        const epsilon = equityWeights.inequalityAversion ?? 0;
        const subgroups = equityWeights.subgroups;

        // Validate proportions sum to ~1
        const totalProportion = stableSum(subgroups.map(s => s.proportion));
        if (Math.abs(totalProportion - 1) > 0.01) {
            throw new Error(`Subgroup proportions must sum to 1, got ${totalProportion.toFixed(4)}`);
        }

        // Compute inequality index on baseline health
        let inequalityIndex = 0;
        const healthForIndex = subgroups.map(s => ({
            proportion: s.proportion,
            health: s.baselineHealth ?? 0.5
        }));

        if (method === 'atkinson') {
            inequalityIndex = this.atkinsonIndex(healthForIndex, epsilon);
        } else if (method === 'kolm') {
            inequalityIndex = this.kolmIndex(healthForIndex, epsilon > 0 ? epsilon : 1);
        }
        // 'custom': leave index at 0, use custom weights if provided

        // Compute equity-adjusted subgroup results
        const subgroupResults = [];
        let totalStandardNMB = 0;
        let totalEquityNMB = 0;

        for (const sg of subgroups) {
            const incQaly = sg.incQaly ?? (psaResults?.incQaly ?? 0);
            const incCost = sg.incCost ?? (psaResults?.incCost ?? 0);
            const standardNMB = incQaly * wtp - incCost;

            // Equity weight based on baseline health disadvantage
            let eqWeight = 1.0;
            if (method === 'custom' && sg.customWeight != null) {
                eqWeight = sg.customWeight;
            } else if (method === 'atkinson' && epsilon > 0) {
                // Weight = (h_i / μ)^(-ε) normalized
                const meanHealth = stableSum(healthForIndex.map(s => s.proportion * s.health));
                if (meanHealth > EPSILON && sg.baselineHealth > EPSILON) {
                    eqWeight = Math.pow(sg.baselineHealth / meanHealth, -epsilon);
                }
            } else if (method === 'kolm' && epsilon > 0) {
                const meanHealth = stableSum(healthForIndex.map(s => s.proportion * s.health));
                eqWeight = Math.exp(epsilon * (meanHealth - (sg.baselineHealth ?? 0.5)));
            }

            const equityNMB = standardNMB * eqWeight * sg.proportion;
            const standardContrib = standardNMB * sg.proportion;

            totalStandardNMB += standardContrib;
            totalEquityNMB += equityNMB;

            subgroupResults.push({
                name: sg.name,
                proportion: sg.proportion,
                baselineHealth: sg.baselineHealth,
                incQaly,
                incCost,
                standardNMB: standardContrib,
                equityWeight: eqWeight,
                equityAdjustedNMB: equityNMB
            });
        }

        // Severity modifier (optional)
        let severityMultiplier = 1.0;
        if (options.severity) {
            const sevResult = this.severityWeightedQALY(1, options.severity);
            severityMultiplier = sevResult.multiplier;
        }

        // Total distributable health (equity-weighted QALYs)
        const distributableHealth = stableSum(
            subgroups.map(s => (s.incQaly ?? (psaResults?.incQaly ?? 0)) * s.proportion)
        );

        return {
            equityAdjustedNMB: totalEquityNMB * severityMultiplier,
            standardNMB: totalStandardNMB,
            inequalityIndex,
            distributableHealth,
            severityMultiplier,
            method,
            inequalityAversion: epsilon,
            subgroupResults
        };
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.DistributionalCEAEngine = DistributionalCEAEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DistributionalCEAEngine };
}
