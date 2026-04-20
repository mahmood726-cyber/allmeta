/**
 * Scenario Analysis Engine
 * Structured framework for defining, running, and comparing scenarios.
 *
 * Features:
 * - Base case + named scenario comparison
 * - Auto-generated pessimistic/optimistic scenarios from CIs
 * - Cross-scenario (factorial) analysis across multiple dimensions
 * - Delta computation and summary statistics
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

class ScenarioAnalysisEngine {
    constructor(options = {}) {
        this.options = options;
    }

    /**
     * Compute ICER from model results.
     */
    _computeICER(result) {
        const incQaly = (result.qaly ?? 0) - (result.comparatorQaly ?? 0);
        const incCost = (result.cost ?? 0) - (result.comparatorCost ?? 0);
        if (Math.abs(incQaly) < 1e-15) return Infinity;
        return incCost / incQaly;
    }

    /**
     * Run scenario analysis: base case + named scenarios.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, ...}
     * @param {Object} baseParams - base case parameters
     * @param {Object} scenarios - {name: {paramOverrides}, ...}
     * @returns {Object} comparison results
     */
    run(modelFn, baseParams, scenarios) {
        // Run base case
        const baseResult = modelFn({ ...baseParams });
        const baseICER = this._computeICER(baseResult);

        const base = {
            params: { ...baseParams },
            results: { ...baseResult, icer: baseICER }
        };

        const scenarioResults = {};
        let bestCaseNMB = -Infinity;
        let worstCaseNMB = Infinity;
        let bestCaseName = null;
        let worstCaseName = null;
        const icerValues = [];

        // Use a reference WTP for ranking (cost per QALY threshold)
        const referenceWtp = this.options.referenceWtp ?? 50000;

        const scenarioKeys = Object.keys(scenarios ?? {});

        for (const name of scenarioKeys) {
            const overrides = scenarios[name];
            const mergedParams = { ...baseParams, ...overrides };
            const result = modelFn(mergedParams);
            const icer = this._computeICER(result);

            // Compute deltas
            const delta = {};
            for (const key of Object.keys(result)) {
                if (typeof result[key] === 'number' && typeof baseResult[key] === 'number') {
                    delta[key] = result[key] - baseResult[key];
                }
            }

            scenarioResults[name] = {
                params: mergedParams,
                results: { ...result, icer },
                delta
            };

            icerValues.push(icer);

            // Track best/worst by NMB (higher NMB = more cost-effective)
            const incQaly = (result.qaly ?? 0) - (result.comparatorQaly ?? 0);
            const incCost = (result.cost ?? 0) - (result.comparatorCost ?? 0);
            const nmb = incQaly * referenceWtp - incCost;

            if (nmb > bestCaseNMB) {
                bestCaseNMB = nmb;
                bestCaseName = name;
            }
            if (nmb < worstCaseNMB) {
                worstCaseNMB = nmb;
                worstCaseName = name;
            }
        }

        // Summary
        const allICERs = [baseICER, ...icerValues].filter(v => isFinite(v));
        const rangeICER = allICERs.length >= 2
            ? [Math.min(...allICERs), Math.max(...allICERs)]
            : allICERs.length === 1 ? [allICERs[0], allICERs[0]] : [];

        return {
            base,
            scenarios: scenarioResults,
            summary: {
                bestCase: bestCaseName,
                worstCase: worstCaseName,
                rangeICER
            }
        };
    }

    /**
     * Auto-generate pessimistic/optimistic scenarios from parameter CIs.
     *
     * @param {Object} baseParams - base case parameters
     * @param {Object[]} paramDefs - [{name, ci: [low, high]}, ...]
     * @param {string} type - 'extreme' (all worst/best) or 'realistic' (one at a time)
     * @returns {Object} {pessimistic: {...}, optimistic: {...}}
     */
    autoScenarios(baseParams, paramDefs, type) {
        type = type ?? 'extreme';

        if (type === 'extreme') {
            // All parameters at their worst/best simultaneously
            const pessimistic = {};
            const optimistic = {};

            for (const p of paramDefs) {
                // For costs: higher = worse (pessimistic), lower = better (optimistic)
                // For utilities/efficacy: lower = worse, higher = better
                // We use the CI bounds directly: low = pessimistic lower bound, high = optimistic upper bound
                // Convention: ci[0] = lower (pessimistic for utility, optimistic for cost),
                //             ci[1] = upper (optimistic for utility, pessimistic for cost)
                // Since we don't know which direction is "worse", we compute both and let the
                // caller interpret. For a standard approach:
                // pessimistic = all at their "worse" bound = lower for utility, higher for cost
                // We'll use a heuristic: if base > midpoint of CI, lower is pessimistic
                const base = baseParams[p.name];
                const mid = (p.ci[0] + p.ci[1]) / 2;

                if (p.direction === 'cost') {
                    // Higher cost = worse
                    pessimistic[p.name] = p.ci[1];
                    optimistic[p.name] = p.ci[0];
                } else if (p.direction === 'benefit') {
                    // Lower benefit = worse
                    pessimistic[p.name] = p.ci[0];
                    optimistic[p.name] = p.ci[1];
                } else {
                    // P2-4: Default heuristic — detect likely cost params by name
                    // (cost/price/fee) so higher = pessimistic; otherwise lower = pessimistic
                    const nameLower = p.name.toLowerCase();
                    const isCostLike = /cost|price|fee|charge|expense/.test(nameLower);
                    if (isCostLike) {
                        pessimistic[p.name] = p.ci[1]; // higher cost = worse
                        optimistic[p.name] = p.ci[0];
                    } else {
                        pessimistic[p.name] = p.ci[0]; // lower benefit = worse
                        optimistic[p.name] = p.ci[1];
                    }
                }
            }

            return { pessimistic, optimistic };
        } else if (type === 'realistic') {
            // One parameter at a time scenarios
            const scenarios = {};
            for (const p of paramDefs) {
                scenarios[`${p.name}_low`] = { [p.name]: p.ci[0] };
                scenarios[`${p.name}_high`] = { [p.name]: p.ci[1] };
            }
            return scenarios;
        }

        return {};
    }

    /**
     * Cross-scenario analysis: all combinations of multiple scenario dimensions.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, ...}
     * @param {Object} baseParams - base case parameters
     * @param {Object} dimensions - {dimName: {levelName: value, ...}, ...}
     * @returns {Object} matrix of all scenario combinations
     */
    crossScenario(modelFn, baseParams, dimensions) {
        const dimNames = Object.keys(dimensions);
        const dimLevels = dimNames.map(d => Object.keys(dimensions[d]));

        // Generate all combinations (cartesian product)
        const combinations = this._cartesianProduct(dimLevels);

        if (combinations.length > 10000) {
            throw new Error('Cross-scenario produces ' + combinations.length + ' combinations (max 10,000). Reduce dimensions or levels.');
        }

        const results = [];
        let totalCombinations = combinations.length;

        for (const combo of combinations) {
            const overrides = {};
            const labels = {};

            for (let d = 0; d < dimNames.length; d++) {
                const dimName = dimNames[d];
                const levelName = combo[d];
                overrides[dimName] = dimensions[dimName][levelName];
                labels[dimName] = levelName;
            }

            const mergedParams = { ...baseParams, ...overrides };
            const result = modelFn(mergedParams);
            const icer = this._computeICER(result);

            results.push({
                labels,
                params: mergedParams,
                results: { ...result, icer }
            });
        }

        return {
            dimensions: dimNames,
            levels: Object.fromEntries(dimNames.map((d, i) => [d, dimLevels[i]])),
            combinations: results,
            totalCombinations
        };
    }

    /**
     * Cartesian product of arrays.
     * @param {Array[]} arrays
     * @returns {Array[]}
     */
    _cartesianProduct(arrays) {
        if (arrays.length === 0) return [[]];
        const [first, ...rest] = arrays;
        const restProduct = this._cartesianProduct(rest);
        const result = [];
        for (const item of first) {
            for (const combo of restProduct) {
                result.push([item, ...combo]);
            }
        }
        return result;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ScenarioAnalysisEngine = ScenarioAnalysisEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScenarioAnalysisEngine };
}
