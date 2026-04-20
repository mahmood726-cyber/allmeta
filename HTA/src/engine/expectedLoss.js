/**
 * Expected Loss Analysis Engine
 *
 * Implements expected loss framework for health technology assessment,
 * following Basu & Meltzer (2015) decision-analytic approach.
 *
 * Features:
 * - Expected loss curves across WTP range
 * - Optimal strategy identification
 * - Crossing point detection
 * - Population-level scaling with discounting
 * - Opportunity cost under budget constraints
 * - EVPI comparison (information value)
 *
 * Reference:
 * - Basu A, Meltzer D (2015) "Value of information on preference heterogeneity
 *   and individualized care." Medical Decision Making, 27(2): 112-127.
 * - Claxton K (1999) "The irrelevance of inference." J Health Econ, 18(3): 341-364.
 */

'use strict';

class ExpectedLossEngine {
    constructor() {
        this.EPSILON = 1e-15;
    }

    // ─── Core Expected Loss ────────────────────────────────────────────

    /**
     * Compute expected loss curves across WTP range
     *
     * For each WTP lambda:
     *   NMB_k = lambda * QALY_k - Cost_k   for strategy k
     *   Optimal = argmax_k( E[NMB_k] )
     *   Expected loss = E[ max_k(NMB_k) ] - max_k( E[NMB_k] )
     *
     * @param {Array} psaIterations - [{costs: {A:x, B:y}, qalys: {A:q1, B:q2}}, ...]
     * @param {Array} strategies - ['A', 'B', ...]
     * @param {Array} wtpRange - [0, 5000, 10000, ..., 200000]
     * @returns {Object} expected loss results
     */
    compute(psaIterations, strategies, wtpRange) {
        if (!psaIterations || psaIterations.length === 0) {
            throw new Error('No PSA iterations provided');
        }
        if (!strategies || strategies.length === 0) {
            throw new Error('No strategies provided');
        }
        if (!wtpRange || wtpRange.length === 0) {
            throw new Error('No WTP range provided');
        }

        const nIter = psaIterations.length;
        const nStrat = strategies.length;
        const curves = [];

        for (const wtp of wtpRange) {
            // Compute NMB for each strategy in each iteration
            const nmbMatrix = []; // [iteration][strategy]
            const meanNMB = new Array(nStrat).fill(0);

            for (let i = 0; i < nIter; i++) {
                const row = [];
                for (let k = 0; k < nStrat; k++) {
                    const s = strategies[k];
                    const cost = psaIterations[i].costs[s] ?? 0;
                    const qaly = psaIterations[i].qalys[s] ?? 0;
                    const nmb = wtp * qaly - cost;
                    row.push(nmb);
                    meanNMB[k] += nmb;
                }
                nmbMatrix.push(row);
            }

            // Mean NMB per strategy
            for (let k = 0; k < nStrat; k++) {
                meanNMB[k] /= nIter;
            }

            // max_k(E[NMB_k]) — NMB of optimal strategy based on means
            let maxMeanNMB = -Infinity;
            let optimalIdx = 0;
            for (let k = 0; k < nStrat; k++) {
                if (meanNMB[k] > maxMeanNMB) {
                    maxMeanNMB = meanNMB[k];
                    optimalIdx = k;
                }
            }

            // E[max_k(NMB_k)] — expected value of perfect information
            let expectedMaxNMB = 0;
            const optimalCounts = new Array(nStrat).fill(0);
            for (let i = 0; i < nIter; i++) {
                let maxNMB = -Infinity;
                let bestK = 0;
                for (let k = 0; k < nStrat; k++) {
                    if (nmbMatrix[i][k] > maxNMB) {
                        maxNMB = nmbMatrix[i][k];
                        bestK = k;
                    }
                }
                expectedMaxNMB += maxNMB;
                optimalCounts[bestK]++;
            }
            expectedMaxNMB /= nIter;

            // Expected loss = E[max_k(NMB_k)] - max_k(E[NMB_k])
            const expectedLoss = expectedMaxNMB - maxMeanNMB;

            // Probability optimal
            const probOptimal = optimalCounts[optimalIdx] / nIter;

            curves.push({
                wtp,
                expectedLoss: Math.max(0, expectedLoss), // Should be >= 0 by Jensen's inequality
                optimalStrategy: strategies[optimalIdx],
                probOptimal,
                meanNMB: Object.fromEntries(strategies.map((s, k) => [s, meanNMB[k]]))
            });
        }

        // Find WTP where expected loss is minimized
        let minLoss = Infinity;
        let optimalWTP = wtpRange[0];
        for (const c of curves) {
            if (c.expectedLoss < minLoss) {
                minLoss = c.expectedLoss;
                optimalWTP = c.wtp;
            }
        }

        // Find crossing points (where optimal strategy changes)
        const crossingPoints = [];
        for (let i = 1; i < curves.length; i++) {
            if (curves[i].optimalStrategy !== curves[i - 1].optimalStrategy) {
                crossingPoints.push({
                    wtp: (curves[i - 1].wtp + curves[i].wtp) / 2,
                    from: curves[i - 1].optimalStrategy,
                    to: curves[i].optimalStrategy
                });
            }
        }

        // Strategy summaries
        const strategySummaries = strategies.map(s => {
            const costs = psaIterations.map(it => it.costs[s] ?? 0);
            const qalys = psaIterations.map(it => it.qalys[s] ?? 0);
            const meanCost = costs.reduce((a, b) => a + b, 0) / nIter;
            const meanQaly = qalys.reduce((a, b) => a + b, 0) / nIter;

            return {
                name: s,
                meanCost,
                meanQaly,
                dominance: null // Will be filled below
            };
        });

        // Check dominance
        for (let i = 0; i < nStrat; i++) {
            let dominated = false;
            for (let j = 0; j < nStrat; j++) {
                if (i === j) continue;
                if (strategySummaries[j].meanCost <= strategySummaries[i].meanCost &&
                    strategySummaries[j].meanQaly >= strategySummaries[i].meanQaly &&
                    (strategySummaries[j].meanCost < strategySummaries[i].meanCost ||
                     strategySummaries[j].meanQaly > strategySummaries[i].meanQaly)) {
                    dominated = true;
                    break;
                }
            }
            strategySummaries[i].dominance = dominated ? 'dominated' : 'non-dominated';
        }

        return {
            curves,
            optimalWTP,
            minimumLoss: minLoss,
            crossingPoints,
            strategies: strategySummaries
        };
    }

    // ─── Opportunity Cost ──────────────────────────────────────────────

    /**
     * Expected loss incorporating budget constraints
     *
     * @param {Array} psaIterations
     * @param {Array} strategies
     * @param {Array} wtpRange
     * @param {number} budget - maximum available budget
     * @returns {Object} opportunity cost results
     */
    opportunityCost(psaIterations, strategies, wtpRange, budget) {
        if (!budget || budget <= 0) {
            throw new Error('Budget must be positive');
        }

        const nIter = psaIterations.length;
        const nStrat = strategies.length;
        const curves = [];

        for (const wtp of wtpRange) {
            const nmbMatrix = [];
            const meanNMB = new Array(nStrat).fill(0);
            const meanCost = new Array(nStrat).fill(0);

            for (let i = 0; i < nIter; i++) {
                const row = [];
                for (let k = 0; k < nStrat; k++) {
                    const s = strategies[k];
                    const cost = psaIterations[i].costs[s] ?? 0;
                    const qaly = psaIterations[i].qalys[s] ?? 0;
                    const nmb = wtp * qaly - cost;
                    row.push(nmb);
                    meanNMB[k] += nmb;
                    meanCost[k] += cost;
                }
                nmbMatrix.push(row);
            }

            for (let k = 0; k < nStrat; k++) {
                meanNMB[k] /= nIter;
                meanCost[k] /= nIter;
            }

            // Feasible strategies: mean cost <= budget
            const feasible = strategies.map((s, k) => ({
                strategy: s,
                idx: k,
                feasible: meanCost[k] <= budget
            })).filter(f => f.feasible);

            if (feasible.length === 0) {
                curves.push({
                    wtp,
                    opportunityCost: Infinity,
                    optimalStrategy: null,
                    budgetExceeded: true
                });
                continue;
            }

            // Best feasible
            let bestFeasible = feasible[0];
            for (const f of feasible) {
                if (meanNMB[f.idx] > meanNMB[bestFeasible.idx]) {
                    bestFeasible = f;
                }
            }

            // Unconstrained optimal
            let unconstrainedBest = 0;
            for (let k = 1; k < nStrat; k++) {
                if (meanNMB[k] > meanNMB[unconstrainedBest]) unconstrainedBest = k;
            }

            // Opportunity cost = NMB loss from budget constraint
            const oppCost = Math.max(0, meanNMB[unconstrainedBest] - meanNMB[bestFeasible.idx]);

            curves.push({
                wtp,
                opportunityCost: oppCost,
                optimalStrategy: bestFeasible.strategy,
                unconstrainedOptimal: strategies[unconstrainedBest],
                budgetExceeded: false
            });
        }

        return {
            curves,
            budget
        };
    }

    // ─── Population-Level Loss ─────────────────────────────────────────

    /**
     * Scale per-patient expected loss to population level
     *
     * @param {Object} expectedLossResult - result from compute()
     * @param {number} population - target population size
     * @param {number} timeHorizon - years over which to apply
     * @param {number} discountRate - annual discount rate (e.g. 0.035)
     * @returns {Object} population-level expected loss
     */
    populationLoss(expectedLossResult, population, timeHorizon, discountRate = 0.035) {
        if (population <= 0) throw new Error('Population must be positive');
        if (timeHorizon <= 0) throw new Error('Time horizon must be positive');

        // Discount factor: sum of 1/(1+r)^t for t = 0..T-1
        let discountFactor = 0;
        for (let t = 0; t < timeHorizon; t++) {
            discountFactor += 1 / Math.pow(1 + discountRate, t);
        }

        const popCurves = expectedLossResult.curves.map(c => ({
            wtp: c.wtp,
            perPatientLoss: c.expectedLoss,
            populationLoss: c.expectedLoss * population * discountFactor,
            optimalStrategy: c.optimalStrategy
        }));

        // Minimum population loss
        let minPopLoss = Infinity;
        let optWTP = 0;
        for (const c of popCurves) {
            if (c.populationLoss < minPopLoss) {
                minPopLoss = c.populationLoss;
                optWTP = c.wtp;
            }
        }

        return {
            curves: popCurves,
            population,
            timeHorizon,
            discountRate,
            discountFactor,
            minimumPopulationLoss: minPopLoss,
            optimalWTP: optWTP
        };
    }

    // ─── Information Value Comparison ──────────────────────────────────

    /**
     * Compare expected loss with EVPI
     *
     * The expected loss at each WTP IS the EVPI. This method structures
     * the comparison for visualization, and computes derived metrics.
     *
     * @param {Object} expectedLossResult - result from compute()
     * @param {Object} evpiData - optional external EVPI [{wtp, evpi}, ...]
     * @returns {Object} information value comparison
     */
    informationValue(expectedLossResult, evpiData = null) {
        const curves = expectedLossResult.curves;

        const comparison = curves.map((c, i) => {
            const evpi = evpiData
                ? (evpiData.find(e => e.wtp === c.wtp) || {}).evpi ?? c.expectedLoss
                : c.expectedLoss;

            return {
                wtp: c.wtp,
                expectedLoss: c.expectedLoss,
                evpi,
                // Expected loss should be <= EVPI by construction
                // (they are equal when expectedLoss IS the EVPI)
                ratio: evpi > 0 ? c.expectedLoss / evpi : 1,
                optimalStrategy: c.optimalStrategy,
                probOptimal: c.probOptimal
            };
        });

        // Peak EVPI
        let peakEVPI = 0;
        let peakWTP = 0;
        for (const c of comparison) {
            if (c.evpi > peakEVPI) {
                peakEVPI = c.evpi;
                peakWTP = c.wtp;
            }
        }

        return {
            curves: comparison,
            peakEVPI,
            peakEVPIatWTP: peakWTP,
            minimumExpectedLoss: expectedLossResult.minimumLoss,
            crossingPoints: expectedLossResult.crossingPoints
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ExpectedLossEngine = ExpectedLossEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExpectedLossEngine };
}
