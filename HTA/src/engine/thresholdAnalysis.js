/**
 * Threshold Analysis Engine
 * Finds critical parameter values where the optimal decision changes.
 *
 * Features:
 * - One-way threshold analysis with bisection
 * - Two-way threshold surface on a 2D grid
 * - Tornado diagram data generation
 * - Exact break-even finding via bisection
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

// ============ NAMED CONSTANTS ============
const DEFAULT_STEPS = 100;
const DEFAULT_GRID_SIZE = 50;
const DEFAULT_BISECTION_TOLERANCE = 0.01;
const DEFAULT_BISECTION_MAX_ITER = 100;

class ThresholdAnalysisEngine {
    constructor(options = {}) {
        this.tolerance = options.tolerance ?? DEFAULT_BISECTION_TOLERANCE;
        this.maxIter = options.maxIter ?? DEFAULT_BISECTION_MAX_ITER;
    }

    /**
     * Compute net monetary benefit for a given model result at a WTP threshold.
     * NMB = (qaly - comparatorQaly) * wtp - (cost - comparatorCost)
     */
    _computeNMB(result, wtp) {
        const incQaly = (result.qaly ?? 0) - (result.comparatorQaly ?? 0);
        const incCost = (result.cost ?? 0) - (result.comparatorCost ?? 0);
        return incQaly * wtp - incCost;
    }

    /**
     * Compute ICER from model result.
     * ICER = (cost - comparatorCost) / (qaly - comparatorQaly)
     */
    _computeICER(result) {
        const incQaly = (result.qaly ?? 0) - (result.comparatorQaly ?? 0);
        const incCost = (result.cost ?? 0) - (result.comparatorCost ?? 0);
        if (Math.abs(incQaly) < 1e-15) return Infinity;
        return incCost / incQaly;
    }

    /**
     * One-way threshold analysis: vary a single parameter across a range.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, comparatorCost, comparatorQaly}
     * @param {string} paramName - parameter to vary
     * @param {number[]} range - [min, max]
     * @param {number} wtp - willingness-to-pay threshold
     * @param {number} [steps=100] - number of evaluation points
     * @param {Object} [baseParams] - base parameter values to merge with the varied param (P1-5)
     * @returns {Object} threshold analysis results
     */
    oneway(modelFn, paramName, range, wtp, steps, baseParams) {
        steps = steps ?? DEFAULT_STEPS;
        const [lo, hi] = range;
        const stepSize = steps > 0 ? (hi - lo) / steps : 0;

        const values = [];
        const nmbArr = [];
        const icerArr = [];

        for (let i = 0; i <= steps; i++) {
            const v = lo + i * stepSize;
            values.push(v);

            const params = baseParams
                ? Object.assign({}, baseParams, { [paramName]: v })
                : { [paramName]: v };
            const result = modelFn(params);
            const nmb = this._computeNMB(result, wtp);
            const icer = this._computeICER(result);

            nmbArr.push(nmb);
            icerArr.push(icer);
        }

        // Find threshold via bisection where NMB crosses zero
        const thresholdResult = this.findBreakeven(modelFn, paramName, range, wtp, this.tolerance, baseParams);

        // Determine optimal strategies above and below threshold
        let optimalBelow = null;
        let optimalAbove = null;
        let thresholdExists = thresholdResult !== null;

        if (thresholdExists) {
            // Evaluate just below and above threshold
            const eps = stepSize * 0.01;
            const belowParams = baseParams
                ? Object.assign({}, baseParams, { [paramName]: thresholdResult - eps })
                : { [paramName]: thresholdResult - eps };
            const aboveParams = baseParams
                ? Object.assign({}, baseParams, { [paramName]: thresholdResult + eps })
                : { [paramName]: thresholdResult + eps };
            const belowResult = modelFn(belowParams);
            const aboveResult = modelFn(aboveParams);
            const nmbBelow = this._computeNMB(belowResult, wtp);
            const nmbAbove = this._computeNMB(aboveResult, wtp);
            optimalBelow = nmbBelow >= 0 ? 'New' : 'Current';
            optimalAbove = nmbAbove >= 0 ? 'New' : 'Current';
        } else {
            // No crossing: determine which strategy is always optimal
            const firstNMB = nmbArr[0];
            optimalBelow = firstNMB >= 0 ? 'New' : 'Current';
            optimalAbove = firstNMB >= 0 ? 'New' : 'Current';
        }

        return {
            param: paramName,
            values,
            nmb: nmbArr,
            icer: icerArr,
            threshold: thresholdResult,
            thresholdExists,
            optimalBelow,
            optimalAbove
        };
    }

    /**
     * Two-way threshold analysis: vary two parameters simultaneously on a grid.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, comparatorCost, comparatorQaly}
     * @param {Object[]} params - [{name, range: [lo, hi]}, {name, range: [lo, hi]}]
     * @param {number[][]} ranges - [[lo1, hi1], [lo2, hi2]]
     * @param {number} wtp - willingness-to-pay
     * @param {number} [gridSize=50] - grid resolution per dimension
     * @returns {Object} 2D threshold surface
     */
    twoway(modelFn, params, ranges, wtp, gridSize) {
        gridSize = gridSize ?? DEFAULT_GRID_SIZE;

        const p1Name = params[0].name ?? params[0];
        const p2Name = params[1].name ?? params[1];
        const r1 = ranges[0];
        const r2 = ranges[1];

        const p1Values = [];
        const p2Values = [];
        const step1 = (r1[1] - r1[0]) / gridSize;
        const step2 = (r2[1] - r2[0]) / gridSize;

        for (let i = 0; i <= gridSize; i++) {
            p1Values.push(r1[0] + i * step1);
            p2Values.push(r2[0] + i * step2);
        }

        // Compute NMB grid
        const nmbGrid = [];
        let positiveCount = 0;
        let negativeCount = 0;
        const totalCells = p1Values.length * p2Values.length;

        for (let i = 0; i < p1Values.length; i++) {
            const row = [];
            for (let j = 0; j < p2Values.length; j++) {
                const paramObj = {
                    [p1Name]: p1Values[i],
                    [p2Name]: p2Values[j]
                };
                const result = modelFn(paramObj);
                const nmb = this._computeNMB(result, wtp);
                row.push(nmb);
                if (nmb >= 0) positiveCount++;
                else negativeCount++;
            }
            nmbGrid.push(row);
        }

        // Extract threshold line: boundary cells where NMB sign changes
        const thresholdLine = [];
        for (let i = 0; i < p1Values.length - 1; i++) {
            for (let j = 0; j < p2Values.length - 1; j++) {
                const v00 = nmbGrid[i][j];
                const v10 = nmbGrid[i + 1][j];
                const v01 = nmbGrid[i][j + 1];
                // Check for sign change with neighbors
                if ((v00 >= 0) !== (v10 >= 0) || (v00 >= 0) !== (v01 >= 0)) {
                    thresholdLine.push({
                        p1: (p1Values[i] + p1Values[i + 1]) / 2,
                        p2: (p2Values[j] + p2Values[j + 1]) / 2
                    });
                }
            }
        }

        // Optimal regions
        const optimalRegions = [];
        if (positiveCount > 0) {
            optimalRegions.push({ strategy: 'New', fraction: positiveCount / totalCells });
        }
        if (negativeCount > 0) {
            optimalRegions.push({ strategy: 'Current', fraction: negativeCount / totalCells });
        }

        return {
            param1: { name: p1Name, values: p1Values },
            param2: { name: p2Name, values: p2Values },
            nmbGrid,
            thresholdLine,
            optimalRegions
        };
    }

    /**
     * Tornado diagram: one-way sensitivity for multiple parameters.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, comparatorCost, comparatorQaly}
     * @param {Object[]} paramRanges - [{name, low, high, baseValue}, ...]
     * @param {Object} baseParams - base case parameter values
     * @param {number} wtp - willingness-to-pay
     * @returns {Object} tornado diagram data sorted by swing
     */
    tornado(modelFn, paramRanges, baseParams, wtp) {
        // Compute base NMB
        const baseResult = modelFn({ ...baseParams });
        const baseNMB = this._computeNMB(baseResult, wtp);

        const bars = [];

        for (const p of paramRanges) {
            // Evaluate at low
            const lowParams = { ...baseParams, [p.name]: p.low };
            const lowResult = modelFn(lowParams);
            const lowNMB = this._computeNMB(lowResult, wtp);

            // Evaluate at high
            const highParams = { ...baseParams, [p.name]: p.high };
            const highResult = modelFn(highParams);
            const highNMB = this._computeNMB(highResult, wtp);

            const swing = Math.abs(highNMB - lowNMB);

            bars.push({
                name: p.name,
                lowNMB,
                highNMB,
                swing,
                lowValue: p.low,
                highValue: p.high,
                baseNMB
            });
        }

        // Sort descending by swing
        bars.sort((a, b) => b.swing - a.swing);

        return {
            bars,
            sortedBySwing: true,
            baseNMB
        };
    }

    /**
     * Find exact break-even point using bisection.
     *
     * @param {Function} modelFn - function(params) => {cost, qaly, comparatorCost, comparatorQaly}
     * @param {string} paramName - parameter to search
     * @param {number[]} range - [min, max]
     * @param {number} wtp - willingness-to-pay
     * @param {number} [tolerance] - convergence tolerance
     * @param {Object} [baseParams] - base parameter values to merge with the varied param
     * @returns {number|null} break-even value or null if none found
     */
    findBreakeven(modelFn, paramName, range, wtp, tolerance, baseParams) {
        tolerance = tolerance ?? this.tolerance;
        let [lo, hi] = range;

        const _makeParams = (val) => baseParams
            ? Object.assign({}, baseParams, { [paramName]: val })
            : { [paramName]: val };

        const loResult = modelFn(_makeParams(lo));
        const hiResult = modelFn(_makeParams(hi));
        const loNMB = this._computeNMB(loResult, wtp);
        const hiNMB = this._computeNMB(hiResult, wtp);

        // No sign change → no threshold in range
        if ((loNMB >= 0) === (hiNMB >= 0)) {
            return null;
        }

        // Bisection
        for (let iter = 0; iter < this.maxIter; iter++) {
            const mid = (lo + hi) / 2;
            const midResult = modelFn(_makeParams(mid));
            const midNMB = this._computeNMB(midResult, wtp);

            if (Math.abs(midNMB) < tolerance || (hi - lo) / 2 < tolerance) {
                return mid;
            }

            // Move toward the zero crossing
            if ((midNMB >= 0) === (loNMB >= 0)) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        return (lo + hi) / 2;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ThresholdAnalysisEngine = ThresholdAnalysisEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThresholdAnalysisEngine };
}
