/**
 * Generalized Pairwise Comparisons / Win Ratio Engine
 *
 * Implements the Win Ratio method for composite endpoint analysis in HTA.
 * For composite endpoints (e.g., death + hospitalization), the Win Ratio
 * prioritizes outcomes hierarchically — first compare on the most severe
 * outcome, then move to less severe outcomes among tied pairs.
 *
 * References:
 * - Pocock SJ, Ariti CA, Collier TJ, Wang D (2012). Stat Med 31:3459-3484.
 * - Buyse M (2010). Stat Med 29:3245-3257.
 * - Dong G, Qiu J, Wang D, Vandemeulebroecke M (2018). Pharm Stat 17:67-83.
 */

var KahanSumRef = (function resolveKahanSum() {
    if (typeof globalThis !== 'undefined' && globalThis.KahanSum) {
        return globalThis.KahanSum;
    }
    if (typeof require === 'function') {
        try {
            const mod = require('../utils/kahan');
            if (mod && mod.KahanSum) return mod.KahanSum;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

var PCG32Ref = (function resolvePCG32() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) {
        return globalThis.PCG32;
    }
    if (typeof require === 'function') {
        try {
            const mod = require('../utils/pcg32');
            if (mod && mod.PCG32) return mod.PCG32;
        } catch (err) {
            return null;
        }
    }
    return null;
})();

// ============ NAMED CONSTANTS ============
const DEFAULT_CONFIDENCE_LEVEL = 0.95;
const DEFAULT_FOLLOW_UP = Infinity;
const MAX_WIN_RATIO_CAP = 1e6;
const TIME_TOLERANCE = 1e-10;

// ============ HELPERS ============

/**
 * Kahan-aware summation, fallback to naive.
 */
function kahanSumArray(values) {
    if (KahanSumRef) {
        return KahanSumRef.sum(values);
    }
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i];
    return s;
}

/**
 * Standard normal CDF using Abramowitz & Stegun approximation (7.1.26).
 */
function normalCDF(x) {
    if (x === 0) return 0.5;
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327; // 1/sqrt(2*PI)
    const p = d * Math.exp(-0.5 * x * x) *
        (t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
        t * (-1.821255978 + t * 1.330274429)))));
    return sign < 0 ? p : 1 - p;
}

/**
 * Normal quantile (inverse CDF) using rational approximation.
 */
function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (Math.abs(p - 0.5) < 1e-15) return 0;

    const a = [
        -3.969683028665376e1, 2.209460984245205e2,
        -2.759285104469687e2, 1.383577518672690e2,
        -3.066479806614716e1, 2.506628277459239e0
    ];
    const b = [
        -5.447609879822406e1, 1.615858368580409e2,
        -1.556989798598866e2, 6.680131188771972e1,
        -1.328068155288572e1
    ];
    const c = [
        -7.784894002430293e-3, -3.223964580411365e-1,
        -2.400758277161838e0, -2.549732539343734e0,
        4.374664141464968e0, 2.938163982698783e0
    ];
    const d = [
        7.784695709041462e-3, 3.224671290700398e-1,
        2.445134137142996e0, 3.754408661907416e0
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
}

// ============ MAIN ENGINE ============

class WinRatioEngine {
    /**
     * @param {Object} [options]
     * @param {number} [options.confidenceLevel=0.95]
     * @param {number} [options.seed=42] - Seed for matched method
     */
    constructor(options = {}) {
        this.confidenceLevel = options.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;
        this.seed = options.seed ?? 42;
    }

    /**
     * Compare two patients on a single outcome.
     * Returns: 1 (win for treatment), -1 (loss), or 0 (tie/unresolved).
     *
     * For time-to-event outcomes: compare event times.
     * For continuous outcomes (biomarker): compare values directly.
     */
    _comparePair(treatmentOutcome, controlOutcome, followUp) {
        // Continuous / value-based outcome
        if (treatmentOutcome.value !== undefined && controlOutcome.value !== undefined) {
            if (treatmentOutcome.value > controlOutcome.value + TIME_TOLERANCE) return 1;
            if (controlOutcome.value > treatmentOutcome.value + TIME_TOLERANCE) return -1;
            return 0;
        }

        // Time-to-event outcome
        const tEvent = treatmentOutcome.event ?? 0;
        const cEvent = controlOutcome.event ?? 0;
        const tTime = Math.min(treatmentOutcome.time ?? followUp, followUp);
        const cTime = Math.min(controlOutcome.time ?? followUp, followUp);

        // Both had events
        if (tEvent && cEvent) {
            // Later event is better (survived longer)
            if (tTime > cTime + TIME_TOLERANCE) return 1;
            if (cTime > tTime + TIME_TOLERANCE) return -1;
            return 0; // same time
        }

        // Only control had event — treatment survived longer → win
        if (!tEvent && cEvent) {
            // Treatment survived at least as long as control's event time
            if (tTime >= cTime - TIME_TOLERANCE) return 1;
            // Treatment censored before control event — unresolved
            return 0;
        }

        // Only treatment had event — control survived longer → loss
        if (tEvent && !cEvent) {
            if (cTime >= tTime - TIME_TOLERANCE) return -1;
            return 0;
        }

        // Neither had event — unresolved (tie)
        return 0;
    }

    /**
     * Core Win Ratio computation using generalized pairwise comparisons.
     *
     * @param {Array} treatmentData - [{id, outcomes: {name: {time, event} or {value}}}]
     * @param {Array} controlData - Same structure
     * @param {string[]} hierarchy - Priority-ordered outcome names
     * @param {Object} [options]
     * @returns {Object} Win ratio results
     */
    compute(treatmentData, controlData, hierarchy, options = {}) {
        if (!treatmentData || !controlData || treatmentData.length === 0 || controlData.length === 0) {
            throw new Error('Both treatment and control data must be non-empty arrays');
        }
        if (!hierarchy || hierarchy.length === 0) {
            throw new Error('Hierarchy must contain at least one outcome');
        }

        const followUp = options.followUp ?? DEFAULT_FOLLOW_UP;
        const confLevel = options.confidenceLevel ?? this.confidenceLevel;
        const method = options.method ?? 'unmatched';

        if (method === 'matched') {
            return this._computeMatched(treatmentData, controlData, hierarchy, followUp, confLevel);
        }

        const nT = treatmentData.length;
        const nC = controlData.length;
        const totalPairs = nT * nC;

        let totalWins = 0;
        let totalLosses = 0;
        let totalTies = 0;

        // Track component-level resolution
        const byComponent = hierarchy.map(h => ({
            outcome: h,
            wins: 0,
            losses: 0,
            ties: 0,
            resolved: 0
        }));

        // All pairwise comparisons
        for (let i = 0; i < nT; i++) {
            for (let j = 0; j < nC; j++) {
                let resolved = false;
                for (let k = 0; k < hierarchy.length; k++) {
                    const outcomeName = hierarchy[k];
                    const tOutcome = treatmentData[i].outcomes[outcomeName];
                    const cOutcome = controlData[j].outcomes[outcomeName];

                    if (!tOutcome || !cOutcome) continue;

                    const result = this._comparePair(tOutcome, cOutcome, followUp);

                    if (result === 1) {
                        totalWins++;
                        byComponent[k].wins++;
                        byComponent[k].resolved++;
                        resolved = true;
                        break;
                    } else if (result === -1) {
                        totalLosses++;
                        byComponent[k].losses++;
                        byComponent[k].resolved++;
                        resolved = true;
                        break;
                    }
                    // tie on this component — continue to next
                    byComponent[k].ties++;
                }
                if (!resolved) {
                    totalTies++;
                }
            }
        }

        // Win Ratio = wins / losses
        let winRatio;
        if (totalLosses === 0) {
            winRatio = totalWins === 0 ? 1 : MAX_WIN_RATIO_CAP;
        } else {
            winRatio = totalWins / totalLosses;
        }

        // Probabilities
        const winProb = totalWins / totalPairs;
        const lossProb = totalLosses / totalPairs;
        const tieProb = totalTies / totalPairs;

        // Net benefit
        const netBenefit = (totalWins - totalLosses) / totalPairs;

        // Confidence interval via log transform (Bebu & Lachin 2016)
        // Var(log(WR)) ≈ (1/wins + 1/losses)
        let ci, pValue;
        if (totalWins > 0 && totalLosses > 0) {
            const logWR = Math.log(winRatio);
            const seLogWR = Math.sqrt(1 / totalWins + 1 / totalLosses);
            const alpha = 1 - confLevel;
            const zAlpha = normalQuantile(1 - alpha / 2);

            ci = [
                Math.exp(logWR - zAlpha * seLogWR),
                Math.exp(logWR + zAlpha * seLogWR)
            ];

            // Two-sided z-test on log(WR)
            const zStat = logWR / seLogWR;
            pValue = 2 * (1 - normalCDF(Math.abs(zStat)));
        } else {
            ci = [winRatio, winRatio];
            pValue = totalWins === totalLosses ? 1 : 0;
        }

        return {
            winRatio,
            ci,
            pValue,
            totalPairs,
            wins: totalWins,
            losses: totalLosses,
            ties: totalTies,
            winProb,
            lossProb,
            tieProb,
            byComponent,
            netBenefit
        };
    }

    /**
     * Matched (1:1) computation. Pairs treatment-control patients by index
     * or random matching with PCG32 seed.
     */
    _computeMatched(treatmentData, controlData, hierarchy, followUp, confLevel) {
        const nPairs = Math.min(treatmentData.length, controlData.length);

        // Shuffle control using PCG32 for reproducibility
        const controlShuffled = controlData.slice();
        if (PCG32Ref) {
            const rng = new PCG32Ref(this.seed);
            for (let i = controlShuffled.length - 1; i > 0; i--) {
                const j = rng.nextInt(0, i);
                const tmp = controlShuffled[i];
                controlShuffled[i] = controlShuffled[j];
                controlShuffled[j] = tmp;
            }
        }

        let wins = 0, losses = 0, ties = 0;
        const byComponent = hierarchy.map(h => ({
            outcome: h, wins: 0, losses: 0, ties: 0, resolved: 0
        }));

        for (let p = 0; p < nPairs; p++) {
            let resolved = false;
            for (let k = 0; k < hierarchy.length; k++) {
                const outcomeName = hierarchy[k];
                const tOutcome = treatmentData[p].outcomes[outcomeName];
                const cOutcome = controlShuffled[p].outcomes[outcomeName];
                if (!tOutcome || !cOutcome) continue;

                const result = this._comparePair(tOutcome, cOutcome, followUp);
                if (result === 1) {
                    wins++;
                    byComponent[k].wins++;
                    byComponent[k].resolved++;
                    resolved = true;
                    break;
                } else if (result === -1) {
                    losses++;
                    byComponent[k].losses++;
                    byComponent[k].resolved++;
                    resolved = true;
                    break;
                }
                byComponent[k].ties++;
            }
            if (!resolved) ties++;
        }

        const totalPairs = nPairs;
        let winRatio;
        if (losses === 0) {
            winRatio = wins === 0 ? 1 : MAX_WIN_RATIO_CAP;
        } else {
            winRatio = wins / losses;
        }

        const winProb = wins / totalPairs;
        const lossProb = losses / totalPairs;
        const tieProb = ties / totalPairs;
        const netBenefit = (wins - losses) / totalPairs;

        let ci, pValue;
        if (wins > 0 && losses > 0) {
            const logWR = Math.log(winRatio);
            const seLogWR = Math.sqrt(1 / wins + 1 / losses);
            const alpha = 1 - confLevel;
            const zAlpha = normalQuantile(1 - alpha / 2);
            ci = [
                Math.exp(logWR - zAlpha * seLogWR),
                Math.exp(logWR + zAlpha * seLogWR)
            ];
            const zStat = logWR / seLogWR;
            pValue = 2 * (1 - normalCDF(Math.abs(zStat)));
        } else {
            ci = [winRatio, winRatio];
            pValue = wins === losses ? 1 : 0;
        }

        return {
            winRatio, ci, pValue, totalPairs,
            wins, losses, ties,
            winProb, lossProb, tieProb,
            byComponent, netBenefit
        };
    }

    /**
     * Stratified Win Ratio using Dong et al. (2018) method.
     * Computes WR within each stratum, then combines via weighted average
     * on the log scale with inverse-variance weights.
     *
     * @param {Array} data - [{stratum, arm: 'treatment'|'control', outcomes: {...}}]
     * @param {string} strataField - Field name for stratification
     * @param {string[]} hierarchy
     * @param {Object} [options]
     * @returns {Object}
     */
    stratifiedWinRatio(data, strataField, hierarchy, options = {}) {
        if (!data || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }

        // Group by stratum
        const strata = {};
        for (const d of data) {
            const s = d[strataField] ?? 'overall';
            if (!strata[s]) strata[s] = { treatment: [], control: [] };
            if (d.arm === 'treatment') {
                strata[s].treatment.push(d);
            } else {
                strata[s].control.push(d);
            }
        }

        const strataNames = Object.keys(strata);
        if (strataNames.length === 0) {
            throw new Error('No strata found in data');
        }

        const strataResults = [];
        const logWRs = [];
        const weights = [];

        for (const name of strataNames) {
            const { treatment, control } = strata[name];
            if (treatment.length === 0 || control.length === 0) continue;

            const result = this.compute(treatment, control, hierarchy, options);
            strataResults.push({ stratum: name, ...result });

            if (result.wins > 0 && result.losses > 0) {
                const logWR = Math.log(result.winRatio);
                const varLogWR = 1 / result.wins + 1 / result.losses;
                logWRs.push(logWR);
                weights.push(1 / varLogWR);
            }
        }

        // Inverse-variance weighted combination on log scale
        let combinedWR, combinedCI, combinedPValue;
        if (weights.length > 0) {
            const totalWeight = kahanSumArray(weights);
            const weightedLogWR = kahanSumArray(logWRs.map((lr, i) => lr * weights[i])) / totalWeight;
            const combinedSE = Math.sqrt(1 / totalWeight);

            combinedWR = Math.exp(weightedLogWR);
            const confLevel = options.confidenceLevel ?? this.confidenceLevel;
            const alpha = 1 - confLevel;
            const zAlpha = normalQuantile(1 - alpha / 2);

            combinedCI = [
                Math.exp(weightedLogWR - zAlpha * combinedSE),
                Math.exp(weightedLogWR + zAlpha * combinedSE)
            ];

            const zStat = weightedLogWR / combinedSE;
            combinedPValue = 2 * (1 - normalCDF(Math.abs(zStat)));
        } else {
            combinedWR = 1;
            combinedCI = [1, 1];
            combinedPValue = 1;
        }

        return {
            winRatio: combinedWR,
            ci: combinedCI,
            pValue: combinedPValue,
            nStrata: strataResults.length,
            strata: strataResults
        };
    }

    /**
     * Win Odds — alternative to Win Ratio that handles ties by splitting them.
     * Win Odds = (wins + 0.5 * ties) / (losses + 0.5 * ties)
     *
     * @param {Array} treatmentData
     * @param {Array} controlData
     * @param {string[]} hierarchy
     * @param {Object} [options]
     * @returns {Object}
     */
    winOdds(treatmentData, controlData, hierarchy, options = {}) {
        const result = this.compute(treatmentData, controlData, hierarchy, options);
        const { wins, losses, ties } = result;

        const numerator = wins + 0.5 * ties;
        const denominator = losses + 0.5 * ties;

        let wo;
        if (denominator === 0) {
            wo = numerator === 0 ? 1 : MAX_WIN_RATIO_CAP;
        } else {
            wo = numerator / denominator;
        }

        // CI via log transform
        const confLevel = options.confidenceLevel ?? this.confidenceLevel;
        let ci, pValue;
        if (numerator > 0 && denominator > 0) {
            const logWO = Math.log(wo);
            const seLogWO = Math.sqrt(1 / numerator + 1 / denominator);
            const alpha = 1 - confLevel;
            const zAlpha = normalQuantile(1 - alpha / 2);
            ci = [Math.exp(logWO - zAlpha * seLogWO), Math.exp(logWO + zAlpha * seLogWO)];

            const zStat = logWO / seLogWO;
            pValue = 2 * (1 - normalCDF(Math.abs(zStat)));
        } else {
            ci = [wo, wo];
            pValue = 1;
        }

        return {
            winOdds: wo,
            ci,
            pValue,
            wins,
            losses,
            ties,
            totalPairs: result.totalPairs,
            winRatioComparison: result.winRatio
        };
    }

    /**
     * Sensitivity analysis: run win ratio with multiple hierarchy orderings.
     *
     * @param {Array} treatmentData
     * @param {Array} controlData
     * @param {string[][]} hierarchies - Array of different hierarchy orderings
     * @param {Object} [options]
     * @returns {Object}
     */
    sensitivity(treatmentData, controlData, hierarchies, options = {}) {
        if (!hierarchies || hierarchies.length === 0) {
            throw new Error('At least one hierarchy must be provided');
        }

        const results = hierarchies.map(h => ({
            hierarchy: h,
            result: this.compute(treatmentData, controlData, h, options)
        }));

        // Summary
        const winRatios = results.map(r => r.result.winRatio);
        const min = Math.min(...winRatios);
        const max = Math.max(...winRatios);
        const range = max - min;

        return {
            results,
            summary: {
                minWinRatio: min,
                maxWinRatio: max,
                range,
                robust: range / ((min + max) / 2) < 0.2 // <20% relative range
            }
        };
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.WinRatioEngine = WinRatioEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WinRatioEngine, normalCDF, normalQuantile };
}
