/**
 * Headroom & Affordability Analysis Engine
 * Given a model and WTP threshold, finds the maximum price a new technology
 * can charge while remaining cost-effective. Also computes budget ceiling
 * and affordability thresholds.
 *
 * Features:
 * - Bisection-based max price finding (ICER = WTP)
 * - Affordability curve over WTP range
 * - Budget ceiling with dual WTP + budget constraint
 * - Price sensitivity analysis
 * - Kahan summation for numerical stability
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
const DEFAULT_BISECTION_TOL = 0.01;
const DEFAULT_BISECTION_MAX_ITER = 200;
const DEFAULT_AFFORDABILITY_STEPS = 50;
const DEFAULT_SENSITIVITY_STEPS = 100;

class HeadroomAnalysisEngine {
    constructor(options = {}) {
        this.tolerance = options.tolerance ?? DEFAULT_BISECTION_TOL;
        this.maxIter = options.maxIter ?? DEFAULT_BISECTION_MAX_ITER;
    }

    /**
     * Compute ICER from model output.
     * ICER = (cost - comparatorCost) / (qaly - comparatorQaly)
     */
    _computeICER(result) {
        const incCost = (result.cost ?? 0) - (result.comparatorCost ?? 0);
        const incQaly = (result.qaly ?? 0) - (result.comparatorQaly ?? 0);
        if (Math.abs(incQaly) < 1e-15) {
            return incCost > 0 ? Infinity : -Infinity;
        }
        return incCost / incQaly;
    }

    /**
     * Compute Net Monetary Benefit.
     * NMB = incQaly * wtp - incCost
     */
    _computeNMB(result, wtp) {
        const incCost = (result.cost ?? 0) - (result.comparatorCost ?? 0);
        const incQaly = (result.qaly ?? 0) - (result.comparatorQaly ?? 0);
        return incQaly * wtp - incCost;
    }

    /**
     * Find the maximum price where ICER <= WTP using bisection on NMB = 0.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, comparatorCost, comparatorQaly}
     * @param {Object} baseParams - Base parameter values
     * @param {string} priceParam - Name of the price parameter to vary
     * @param {number} wtp - Willingness-to-pay threshold (per QALY)
     * @param {number[]} range - [min, max] search range for price
     * @returns {Object} Headroom analysis result
     */
    maxPrice(modelFn, baseParams, priceParam, wtp, range) {
        if (!modelFn || typeof modelFn !== 'function') {
            throw new Error('modelFn must be a function');
        }
        if (!range || range.length < 2) {
            throw new Error('range must be [min, max]');
        }

        const [lo, hi] = range;
        const currentPrice = baseParams[priceParam] ?? lo;

        // Evaluate NMB at the boundaries
        const paramsLo = Object.assign({}, baseParams, { [priceParam]: lo });
        const paramsHi = Object.assign({}, baseParams, { [priceParam]: hi });

        const nmbLo = this._computeNMB(modelFn(paramsLo), wtp);
        const nmbHi = this._computeNMB(modelFn(paramsHi), wtp);

        // If NMB doesn't change sign, no threshold in range
        if (nmbLo * nmbHi > 0) {
            // Both same sign: check if both positive (all affordable) or both negative (none affordable)
            if (nmbLo > 0 && nmbHi > 0) {
                // Cost-effective everywhere in range -> max price is at least hi
                return {
                    maxPrice: null,
                    headroom: null,
                    icer: wtp,
                    isCurrentlyAffordable: true,
                    allAffordable: true,
                    noneAffordable: false
                };
            } else {
                // Not cost-effective anywhere in range
                return {
                    maxPrice: null,
                    headroom: null,
                    icer: wtp,
                    isCurrentlyAffordable: false,
                    allAffordable: false,
                    noneAffordable: true
                };
            }
        }

        // Bisection: find price where NMB = 0
        let a = lo, b = hi;
        let nmbA = nmbLo;

        for (let iter = 0; iter < this.maxIter; iter++) {
            const mid = (a + b) / 2;
            const paramsMid = Object.assign({}, baseParams, { [priceParam]: mid });
            const nmbMid = this._computeNMB(modelFn(paramsMid), wtp);

            if (Math.abs(nmbMid) < this.tolerance || (b - a) / 2 < this.tolerance) {
                const foundPrice = mid;
                return {
                    maxPrice: foundPrice,
                    headroom: foundPrice - currentPrice,
                    icer: wtp,
                    isCurrentlyAffordable: currentPrice <= foundPrice,
                    allAffordable: false,
                    noneAffordable: false
                };
            }

            if (nmbMid * nmbA > 0) {
                a = mid;
                nmbA = nmbMid;
            } else {
                b = mid;
            }
        }

        // Return best estimate after max iterations
        const finalPrice = (a + b) / 2;
        return {
            maxPrice: finalPrice,
            headroom: finalPrice - currentPrice,
            icer: wtp,
            isCurrentlyAffordable: currentPrice <= finalPrice,
            allAffordable: false,
            noneAffordable: false
        };
    }

    /**
     * Compute affordability curve: max price at each WTP threshold.
     *
     * @param {Function} modelFn - Model function
     * @param {Object} baseParams - Base parameters
     * @param {string} priceParam - Price parameter name
     * @param {number[]} wtpRange - [minWtp, maxWtp]
     * @param {number} [steps] - Number of WTP steps
     * @returns {Array} Array of {wtp, maxPrice, affordable}
     */
    affordabilityCurve(modelFn, baseParams, priceParam, wtpRange, steps) {
        steps = steps ?? DEFAULT_AFFORDABILITY_STEPS;
        const [wtpLo, wtpHi] = wtpRange;
        const stepSize = (wtpHi - wtpLo) / steps;
        const currentPrice = baseParams[priceParam] ?? 0;

        // Determine price search range: use a wide range
        const priceRange = [0, wtpHi * 2];

        const curve = [];
        for (let i = 0; i <= steps; i++) {
            const wtp = wtpLo + i * stepSize;
            const result = this.maxPrice(modelFn, baseParams, priceParam, wtp, priceRange);
            curve.push({
                wtp,
                maxPrice: result.maxPrice,
                affordable: result.isCurrentlyAffordable
            });
        }

        return curve;
    }

    /**
     * Find maximum price satisfying both ICER <= WTP AND total budget <= constraint.
     *
     * @param {Function} modelFn - Model function
     * @param {Object} baseParams - Base parameters
     * @param {string} priceParam - Price parameter name
     * @param {number} wtp - WTP threshold
     * @param {number} budgetConstraint - Maximum total budget
     * @param {number} population - Population size (for total budget calculation)
     * @returns {Object} Budget ceiling result
     */
    budgetCeiling(modelFn, baseParams, priceParam, wtp, budgetConstraint, population) {
        // First find max price from ICER constraint
        const icerResult = this.maxPrice(modelFn, baseParams, priceParam, wtp, [0, budgetConstraint]);

        // Now find max price from budget constraint: price * population <= budget
        const budgetMaxPrice = budgetConstraint / population;

        // The binding constraint is the lower of the two
        let effectiveMaxPrice;
        let bindingConstraint;

        if (icerResult.maxPrice === null) {
            if (icerResult.allAffordable) {
                effectiveMaxPrice = budgetMaxPrice;
                bindingConstraint = 'budget';
            } else {
                effectiveMaxPrice = 0;
                bindingConstraint = 'icer';
            }
        } else if (icerResult.maxPrice <= budgetMaxPrice) {
            effectiveMaxPrice = icerResult.maxPrice;
            bindingConstraint = 'icer';
        } else {
            effectiveMaxPrice = budgetMaxPrice;
            bindingConstraint = 'budget';
        }

        const currentPrice = baseParams[priceParam] ?? 0;

        return {
            maxPrice: effectiveMaxPrice,
            icerMaxPrice: icerResult.maxPrice,
            budgetMaxPrice,
            bindingConstraint,
            headroom: effectiveMaxPrice - currentPrice,
            isCurrentlyAffordable: currentPrice <= effectiveMaxPrice,
            population,
            totalBudgetAtMaxPrice: effectiveMaxPrice * population
        };
    }

    /**
     * Price sensitivity analysis: how ICER changes as price varies.
     *
     * @param {Function} modelFn - Model function
     * @param {Object} baseParams - Base parameters
     * @param {string} priceParam - Price parameter name
     * @param {number[]} priceRange - [minPrice, maxPrice]
     * @param {number} wtp - WTP threshold for cost-effectiveness determination
     * @param {number} [steps] - Number of steps
     * @returns {Array} Array of {price, icer, costEffective}
     */
    sensitivityToPrice(modelFn, baseParams, priceParam, priceRange, wtp, steps) {
        steps = steps ?? DEFAULT_SENSITIVITY_STEPS;
        const [pLo, pHi] = priceRange;
        const stepSize = steps > 0 ? (pHi - pLo) / steps : 0;

        const results = [];
        for (let i = 0; i <= steps; i++) {
            const price = pLo + i * stepSize;
            const params = Object.assign({}, baseParams, { [priceParam]: price });
            const result = modelFn(params);
            const icer = this._computeICER(result);
            results.push({
                price,
                icer,
                costEffective: isFinite(icer) ? icer <= wtp : false
            });
        }

        return results;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.HeadroomAnalysisEngine = HeadroomAnalysisEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HeadroomAnalysisEngine };
}
