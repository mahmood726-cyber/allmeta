/**
 * Budget Impact Analysis (BIA) Engine
 * Estimates the financial impact of adopting a new health technology
 * over a defined time horizon.
 *
 * Features:
 * - Multi-year budget projection with market uptake curves
 * - Discounting of future costs
 * - Cost offsets (hospitalization savings, productivity gains)
 * - Subpopulation analysis
 * - Scenario comparison (base/pessimistic/optimistic)
 * - Prevalence-based or incidence-based eligible population
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
    currency: 'OMR'
};

// ============ NAMED CONSTANTS ============
const DEFAULT_DISCOUNT_RATE = 0.03;
const DEFAULT_CURRENCY = 'USD';

// ============ HELPERS ============

/**
 * Sum all cost components in a treatment object.
 * Recognizes: drugCost, adminCost, monitoringCost, aeCost.
 */
function sumTreatmentCosts(tx) {
    return (tx.drugCost ?? 0)
         + (tx.adminCost ?? 0)
         + (tx.monitoringCost ?? 0)
         + (tx.aeCost ?? 0);
}

/**
 * Sum all cost offsets (negative values = savings).
 */
function sumOffsets(offsets) {
    if (!offsets || typeof offsets !== 'object') return 0;
    let total = 0;
    for (const key of Object.keys(offsets)) {
        total += offsets[key];
    }
    return total;
}

/**
 * Deep-merge two plain objects (single level for arrays, shallow for nested objects).
 * Arrays are replaced, not concatenated.
 */
function mergeConfig(base, override) {
    const result = {};
    for (const key of Object.keys(base)) {
        if (override.hasOwnProperty(key)) {
            const bv = base[key];
            const ov = override[key];
            if (Array.isArray(ov)) {
                result[key] = [...ov];
            } else if (ov !== null && typeof ov === 'object' && !Array.isArray(ov)) {
                result[key] = { ...bv, ...ov };
            } else {
                result[key] = ov;
            }
        } else {
            const bv = base[key];
            if (Array.isArray(bv)) {
                result[key] = [...bv];
            } else if (bv !== null && typeof bv === 'object') {
                result[key] = { ...bv };
            } else {
                result[key] = bv;
            }
        }
    }
    // Also copy keys only in override
    for (const key of Object.keys(override)) {
        if (!result.hasOwnProperty(key)) {
            result[key] = override[key];
        }
    }
    return result;
}

// ============ VALIDATION ============

function validateConfig(config) {
    const errors = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return ['config must be a configuration object'];
    }

    // population
    if (config.population == null || !Number.isSafeInteger(config.population) || config.population <= 0) {
        errors.push('population must be a positive integer');
    }

    // prevalence or incidence
    const hasPrevalence = config.prevalence != null;
    const hasIncidence = config.incidence != null;
    if (!hasPrevalence && !hasIncidence) {
        errors.push('Either prevalence or incidence must be provided');
    }
    if (hasPrevalence) {
        if (!Number.isFinite(config.prevalence) || config.prevalence < 0 || config.prevalence > 1) {
            errors.push('prevalence must be a number between 0 and 1');
        }
    }
    if (hasIncidence) {
        if (!Number.isFinite(config.incidence) || config.incidence < 0) {
            errors.push('incidence must be a non-negative number');
        }
    }

    // timeHorizon
    if (config.timeHorizon == null || !Number.isInteger(config.timeHorizon) || config.timeHorizon < 1) {
        errors.push('timeHorizon must be a positive integer');
    }

    // uptake
    if (!Array.isArray(config.uptake)) {
        errors.push('uptake must be an array');
    } else {
        if (config.timeHorizon != null && config.uptake.length !== config.timeHorizon) {
            errors.push(`uptake array length (${config.uptake.length}) must equal timeHorizon (${config.timeHorizon})`);
        }
        for (let i = 0; i < config.uptake.length; i++) {
            const u = config.uptake[i];
            if (!Number.isFinite(u) || u < 0 || u > 1) {
                errors.push(`uptake[${i}] must be a number between 0 and 1`);
            }
        }
    }

    // Treatment costs must be non-negative
    for (const txKey of ['newTx', 'currentTx']) {
        const tx = config[txKey];
        if (!tx || typeof tx !== 'object') {
            errors.push(`${txKey} must be provided as an object`);
        } else {
            for (const costKey of ['drugCost', 'adminCost', 'monitoringCost', 'aeCost']) {
                const val = tx[costKey];
                if (val != null && (!Number.isFinite(val) || val < 0)) {
                    errors.push(`${txKey}.${costKey} must be a non-negative number`);
                }
            }
        }
    }

    // Negative offsets represent actual savings, but every component must be numeric.
    if (config.offsets != null) {
        if (typeof config.offsets !== 'object' || Array.isArray(config.offsets)) {
            errors.push('offsets must be an object of finite numeric cost adjustments');
        } else {
            for (const [key, val] of Object.entries(config.offsets)) {
                if (!Number.isFinite(val)) {
                    errors.push(`offsets.${key} must be a finite number`);
                }
            }
        }
    }

    // discountRate
    if (config.discountRate != null) {
        if (!Number.isFinite(config.discountRate) || config.discountRate < 0 || config.discountRate > 1) {
            errors.push('discountRate must be a number between 0 and 1');
        }
    }

    return errors;
}

// ============ ENGINE ============

class BudgetImpactEngine {
    /**
     * @param {Object} options
     * @param {number} [options.discountRate=0.03] - Annual discount rate
     * @param {string} [options.currency='USD'] - Currency label
     */
    constructor(options = {}) {
        this.options = {
            discountRate: options.discountRate ?? DEFAULT_DISCOUNT_RATE,
            currency: options.currency ?? DEFAULT_CURRENCY
        };
    }

    /**
     * Run a Budget Impact Analysis.
     * @param {Object} config - BIA configuration (see module docstring)
     * @returns {Object} BIA results
     */
    run(config) {
        // Validate
        const errors = validateConfig(config);
        if (errors.length > 0) {
            throw new Error('BIA validation errors:\n  - ' + errors.join('\n  - '));
        }

        const discountRate = config.discountRate ?? this.options.discountRate;
        if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) {
            throw new Error('BIA validation errors:\n  - discountRate must be a finite number between 0 and 1');
        }
        const currency = config.currency ?? this.options.currency;

        // Eligible population
        let eligiblePopulation;
        if (config.incidence != null) {
            // Incidence-based: annual new cases
            eligiblePopulation = config.incidence;
        } else {
            eligiblePopulation = Math.round(config.population * config.prevalence);
        }

        const yearlyBudget = [];
        let totalIncremental = 0;
        let totalDiscounted = 0;
        let cumulativePatients = 0;
        let peakBudget = -Infinity;
        let peakYear = 1;

        const newTxPerPatient = sumTreatmentCosts(config.newTx);
        const currentTxPerPatient = sumTreatmentCosts(config.currentTx);
        const offsetPerPatient = sumOffsets(config.offsets);
        if (![eligiblePopulation, newTxPerPatient, currentTxPerPatient, offsetPerPatient].every(Number.isFinite)) {
            throw new Error('BIA numerical overflow: eligible population or per-patient costs are not finite; check units and cost magnitudes');
        }

        for (let y = 0; y < config.timeHorizon; y++) {
            const year = y + 1;
            const uptake = config.uptake[y];
            const patients = Math.round(eligiblePopulation * uptake);
            const newTxCost = patients * newTxPerPatient;
            const currentTxCost = patients * currentTxPerPatient;
            const offsetSavings = patients * offsetPerPatient;

            // P0-7: Transparency — report both "worlds" for ISPOR BIA
            const worldWithoutCost = eligiblePopulation * currentTxPerPatient;
            const worldWithCost = patients * newTxPerPatient
                                + (eligiblePopulation - patients) * currentTxPerPatient;
            const incremental = worldWithCost - worldWithoutCost + offsetSavings;

            const discountFactor = 1 / Math.pow(1 + discountRate, y);
            const discountedIncremental = incremental * discountFactor;

            if (![patients, worldWithoutCost, worldWithCost, newTxCost,
                currentTxCost, offsetSavings, incremental, discountFactor,
                discountedIncremental].every(Number.isFinite)) {
                throw new Error(`BIA numerical overflow in year ${year}; check population, treatment costs and units`);
            }
            if (!Number.isSafeInteger(patients)) {
                throw new Error(`BIA patient count exceeds safe integer precision in year ${year}`);
            }

            yearlyBudget.push({
                year,
                patients,
                worldWithoutCost,
                worldWithCost,
                newTxCost,
                currentTxCost,
                offsetSavings,
                incremental,
                discountFactor,
                discountedIncremental
            });

            totalIncremental += incremental;
            totalDiscounted += discountedIncremental;
            cumulativePatients += patients;
            if (![totalIncremental, totalDiscounted].every(Number.isFinite) ||
                !Number.isSafeInteger(cumulativePatients)) {
                throw new Error(`BIA numerical overflow in cumulative totals through year ${year}`);
            }

            if (discountedIncremental > peakBudget) {
                peakBudget = discountedIncremental;
                peakYear = year;
            }
        }

        const perPatientIncremental = cumulativePatients > 0
            ? totalIncremental / cumulativePatients
            : 0;

        return {
            eligiblePopulation,
            currency,
            yearlyBudget,
            totalIncremental,
            totalDiscounted,
            // P0-6: ISPOR BIA reference case — primary result is UNDISCOUNTED
            // (Sullivan et al. 2014; Mauskopf et al. 2017)
            netBudgetImpact: totalIncremental,
            netBudgetImpactDiscounted: totalDiscounted,
            perPatientIncremental,
            summary: {
                peakYear,
                peakBudget,
                cumulativePatients
            }
        };
    }

    /**
     * Run scenario analysis: base config + named scenario overrides.
     * @param {Object} baseConfig - Base BIA configuration
     * @param {Object} scenarios - Map of scenario name → config overrides
     * @returns {Object} { base, scenarios: { name: { result, delta } }, ... }
     */
    scenarioAnalysis(baseConfig, scenarios) {
        const baseResult = this.run(baseConfig);

        const scenarioResults = {};
        for (const [name, overrides] of Object.entries(scenarios)) {
            const merged = mergeConfig(baseConfig, overrides);
            const result = this.run(merged);
            const delta = result.netBudgetImpact - baseResult.netBudgetImpact;
            if (!Number.isFinite(delta)) {
                throw new Error('BIA numerical overflow in scenario "' + name + '" incremental budget difference');
            }
            scenarioResults[name] = {
                result,
                delta
            };
        }

        return {
            base: baseResult,
            scenarios: scenarioResults
        };
    }

    /**
     * Run subpopulation analysis.
     * Config must have a `subpopulations` array, each element having its own
     * population/prevalence/uptake/costs.
     * @param {Object} config - Must include `subpopulations` array
     * @returns {Object} { subgroups: [...], total }
     */
    subpopulationAnalysis(config) {
        if (!config.subpopulations || !Array.isArray(config.subpopulations)) {
            throw new Error('subpopulationAnalysis requires a subpopulations array');
        }

        const subgroups = [];
        let totalNetBudgetImpact = 0;
        let totalCumulativePatients = 0;

        for (const subpop of config.subpopulations) {
            const result = this.run(subpop);
            subgroups.push({
                name: subpop.name || 'Unnamed',
                result
            });
            const nextNetBudgetImpact = totalNetBudgetImpact + result.netBudgetImpact;
            const nextCumulativePatients = totalCumulativePatients + result.summary.cumulativePatients;
            if (!Number.isFinite(nextNetBudgetImpact)) {
                throw new Error('BIA numerical overflow in total subpopulation budget impact');
            }
            if (!Number.isSafeInteger(nextCumulativePatients)) {
                throw new Error('BIA total subpopulation patient count exceeds safe integer precision');
            }
            totalNetBudgetImpact = nextNetBudgetImpact;
            totalCumulativePatients = nextCumulativePatients;
        }

        return {
            subgroups,
            total: {
                netBudgetImpact: totalNetBudgetImpact,
                cumulativePatients: totalCumulativePatients
            }
        };
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.BudgetImpactEngine = BudgetImpactEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BudgetImpactEngine };
}
