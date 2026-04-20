/**
 * Expected Value of Sample Information (EVSI) Engine
 * Estimates the value of collecting additional data through a proposed study.
 *
 * EVSI is always <= EVPPI (sample information <= perfect information).
 *
 * Reference:
 * - Ades AE, Lu G, Claxton K. "Expected Value of Sample Information Calculations
 *   in Medical Decision Modeling" (2004)
 * - Heath A, Manolopoulou I, Baio G. "Estimating the Expected Value of Sample
 *   Information across Different Sample Sizes"
 * - Brennan A, Kharroubi S, O'Hagan A, Chilcott J. "Calculating Partial EVPI and
 *   EVSI via Monte Carlo Simulation"
 *
 * Features:
 * - Moment matching EVSI (Ades et al. 2004)
 * - Conjugate posterior variance (binomial, normal, survival)
 * - Optimal sample size search
 * - Population-level EVSI with discounting
 * - Multi-parameter joint EVSI
 * - Deterministic via PCG32 seeded RNG
 */

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

var KahanSumRef = (function resolveKahan() {
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

class EVSIEngine {
    /**
     * @param {Object} options
     * @param {number} options.seed      - PRNG seed (default 12345)
     * @param {number} options.nOuter    - Outer MC samples (default 1000)
     * @param {number} options.nInner    - Inner MC samples (default 500)
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 12345;
        this.nOuter = options.nOuter ?? 1000;
        this.nInner = options.nInner ?? 500;
        this.rng = PCG32Ref ? new PCG32Ref(this.seed) : null;
    }

    // ----------------------------------------------------------------
    // Core EVSI computation (moment matching)
    // ----------------------------------------------------------------

    /**
     * Compute EVSI for a proposed study design.
     *
     * @param {Object} psaResults
     *   - iterations: [{params: {p_response, cost, ...}, nmb, optimal}, ...]
     *   - evpi: number (pre-computed EVPI)
     *   - wtp: number (willingness-to-pay threshold)
     * @param {Object} studyDesign
     *   - type: 'rct' | 'cohort' | 'registry'
     *   - sampleSize: number
     *   - parameter: string  (which parameter the study informs)
     *   - dataModel: 'binomial' | 'normal' | 'survival'
     * @returns {Object} EVSI results
     */
    compute(psaResults, studyDesign) {
        // --- Input validation ---
        if (!psaResults || !Array.isArray(psaResults.iterations) || psaResults.iterations.length === 0) {
            throw new Error('psaResults.iterations must be a non-empty array');
        }
        if (!studyDesign || typeof studyDesign.sampleSize !== 'number') {
            throw new Error('studyDesign.sampleSize is required and must be a number');
        }
        if (studyDesign.sampleSize < 0) {
            throw new Error('studyDesign.sampleSize must be non-negative');
        }
        if (!studyDesign.parameter) {
            throw new Error('studyDesign.parameter is required');
        }

        // Validate iterations have required NMB field
        if (psaResults.iterations.length > 0) {
            var sample = psaResults.iterations[0];
            if (sample.nmb === undefined || sample.nmb === null) {
                // Try to compute NMB from costs/qalys if wtp available
                if (psaResults.wtp !== undefined && sample.qalys !== undefined && sample.costs !== undefined) {
                    psaResults.iterations = psaResults.iterations.map(function(it) {
                        return Object.assign({}, it, { nmb: it.qalys * psaResults.wtp - it.costs });
                    });
                } else if (psaResults.wtp !== undefined && sample.qaly !== undefined && sample.cost !== undefined) {
                    psaResults.iterations = psaResults.iterations.map(function(it) {
                        return Object.assign({}, it, { nmb: it.qaly * psaResults.wtp - it.cost });
                    });
                } else {
                    throw new Error('PSA iterations must contain nmb field, or costs+qalys+wtp (or cost+qaly+wtp) for NMB computation');
                }
            }
        }

        const n = studyDesign.sampleSize;
        const paramName = studyDesign.parameter;
        const dataModel = (studyDesign.dataModel || 'normal').toLowerCase();
        const iterations = psaResults.iterations;

        // --- Extract parameter values from PSA iterations ---
        const paramValues = iterations.map(it => it.params[paramName]);
        if (paramValues.some(v => v === undefined || v === null)) {
            throw new Error(`Parameter "${paramName}" not found in all PSA iterations`);
        }

        // --- Compute prior statistics ---
        const priorMean = this._mean(paramValues);
        const priorVar = this._variance(paramValues, priorMean);

        // --- Handle edge case: zero prior variance (no uncertainty) ---
        if (priorVar < 1e-20) {
            return {
                evsi: 0,
                evppi: psaResults.evpi ?? 0,
                evpi: psaResults.evpi ?? 0,
                proportionResolved: 0,
                priorVariance: priorVar,
                posteriorVariance: priorVar,
                sampleSize: n,
                studyCost: studyDesign.studyCost ?? null
            };
        }

        // --- Compute expected posterior variance ---
        let posteriorVar;
        if (n === 0) {
            posteriorVar = priorVar; // No data → no learning
        } else {
            posteriorVar = this._posteriorVariance(priorMean, priorVar, n, dataModel, paramValues, studyDesign);
        }

        // Ensure posterior <= prior (numerically)
        posteriorVar = Math.min(posteriorVar, priorVar);

        // --- Proportion of uncertainty resolved ---
        const proportionResolved = 1 - posteriorVar / priorVar;

        // --- Compute EVPPI for this parameter if not supplied ---
        const evppi = this._computeEVPPI(psaResults, paramName);

        // --- EVSI via moment-matching linear approximation ---
        // EVSI ≈ R * EVPPI  (conservative; Ades et al. 2004)
        const evsi = Math.max(0, proportionResolved * evppi);

        return {
            evsi: evsi,
            evppi: evppi,
            evpi: psaResults.evpi ?? null,
            proportionResolved: proportionResolved,
            priorVariance: priorVar,
            posteriorVariance: posteriorVar,
            sampleSize: n,
            studyCost: studyDesign.studyCost ?? null
        };
    }

    // ----------------------------------------------------------------
    // Optimal sample size
    // ----------------------------------------------------------------

    /**
     * Find n* that maximises EVSI(n) - n * costPerPatient.
     *
     * @param {Object}  psaResults      - PSA results
     * @param {string}  parameter       - Parameter name
     * @param {number}  costPerPatient  - Cost per enrolled patient
     * @param {number}  maxN            - Maximum sample size to evaluate (default 2000)
     * @param {string}  dataModel       - 'binomial' | 'normal' | 'survival'
     * @returns {Object} optimal sample size results
     */
    optimalSampleSize(psaResults, parameter, costPerPatient, maxN = 2000, dataModel = 'normal') {
        if (costPerPatient < 0) {
            throw new Error('costPerPatient must be non-negative');
        }

        const candidates = [0, 1, 2, 5, 10, 20, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000];
        const evalPoints = candidates.filter(c => c <= maxN);
        // Ensure maxN itself is in the list
        if (!evalPoints.includes(maxN)) {
            evalPoints.push(maxN);
        }
        evalPoints.sort((a, b) => a - b);

        const curve = [];
        let bestNet = -Infinity;
        let bestIdx = 0;

        for (const nVal of evalPoints) {
            const design = {
                sampleSize: nVal,
                parameter: parameter,
                dataModel: dataModel
            };
            const result = this.compute(psaResults, design);
            const cost = nVal * costPerPatient;
            const net = result.evsi - cost;

            curve.push({
                n: nVal,
                evsi: result.evsi,
                cost: cost,
                net: net
            });

            if (net > bestNet) {
                bestNet = net;
                bestIdx = curve.length - 1;
            }
        }

        const optimal = curve[bestIdx];
        return {
            optimalN: optimal.n,
            evsiAtOptimal: optimal.evsi,
            studyCost: optimal.cost,
            netValue: optimal.net,
            curve: curve
        };
    }

    // ----------------------------------------------------------------
    // Population EVSI
    // ----------------------------------------------------------------

    /**
     * Scale EVSI by affected population over a decision-relevant time horizon
     * with annual discounting.
     *
     * @param {number} evsi           - Per-patient EVSI
     * @param {number} population     - Annual incident population
     * @param {number} timeHorizon    - Years over which new technology is relevant
     * @param {number} discountRate   - Annual discount rate (default 0.035)
     * @returns {Object} population EVSI results
     */
    populationEVSI(evsi, population, timeHorizon, discountRate = 0.035) {
        if (timeHorizon <= 0) {
            throw new Error('timeHorizon must be positive');
        }
        if (population < 0) {
            throw new Error('population must be non-negative');
        }

        let effectivePopulation = 0;
        const KS = KahanSumRef ? new KahanSumRef() : null;

        for (let t = 0; t < timeHorizon; t++) {
            const discounted = population / Math.pow(1 + discountRate, t);
            if (KS) {
                KS.add(discounted);
            } else {
                effectivePopulation += discounted;
            }
        }
        if (KS) {
            effectivePopulation = KS.total();
        }

        return {
            perPatientEVSI: evsi,
            populationEVSI: evsi * effectivePopulation,
            effectivePopulation: effectivePopulation
        };
    }

    // ----------------------------------------------------------------
    // Multi-parameter EVSI
    // ----------------------------------------------------------------

    /**
     * Joint EVSI when a study informs multiple parameters simultaneously.
     * The joint EVSI >= max individual EVSI because a single study resolves
     * uncertainty in multiple parameters at once.
     *
     * LIMITATION (P2-7): This method assumes approximate independence between
     * parameters when computing the joint proportion of uncertainty resolved:
     *   jointProportion = 1 - product(1 - R_i)
     * When parameters are positively correlated, this overestimates the joint
     * EVSI because shared uncertainty is counted multiple times. For strongly
     * correlated parameters, consider computing EVSI for the joint parameter
     * vector directly rather than combining individual estimates.
     *
     * @param {Object} psaResults     - PSA results
     * @param {Array}  studyDesigns   - Array of {parameter, sampleSize, dataModel}
     * @returns {Object} joint EVSI results
     */
    multiParameterEVSI(psaResults, studyDesigns) {
        if (!Array.isArray(studyDesigns) || studyDesigns.length === 0) {
            throw new Error('studyDesigns must be a non-empty array');
        }

        // Compute individual EVSIs
        const individual = studyDesigns.map(sd => {
            const result = this.compute(psaResults, sd);
            return {
                parameter: sd.parameter,
                evsi: result.evsi,
                proportionResolved: result.proportionResolved
            };
        });

        // Joint proportion resolved: 1 - product(1 - R_i)
        // This assumes approximate independence between parameters
        let productRemaining = 1;
        for (const ind of individual) {
            productRemaining *= (1 - ind.proportionResolved);
        }
        const jointProportion = 1 - productRemaining;

        // Compute EVPPI for the full set (sum of individual EVPPIs as upper bound)
        // The joint EVSI uses the joint proportion applied to the total EVPI
        const evpi = psaResults.evpi ?? 0;
        const jointEVSI = Math.max(0, jointProportion * evpi);

        return {
            jointEVSI: jointEVSI,
            jointProportionResolved: jointProportion,
            individual: individual,
            evpi: evpi
        };
    }

    // ----------------------------------------------------------------
    // Conjugate posterior variance helpers
    // ----------------------------------------------------------------

    /**
     * Beta-Binomial conjugate posterior variance.
     * Prior: Beta(alpha, beta), Data: n observations from Binomial.
     *
     * @param {number} priorAlpha
     * @param {number} priorBeta
     * @param {number} n - Sample size
     * @returns {number} Expected posterior variance
     */
    binomialPosteriorVar(priorAlpha, priorBeta, n) {
        // Expected number of successes = n * prior_mean
        const priorMean = priorAlpha / (priorAlpha + priorBeta);
        const expectedSuccesses = n * priorMean;
        const expectedFailures = n - expectedSuccesses;

        const postAlpha = priorAlpha + expectedSuccesses;
        const postBeta = priorBeta + expectedFailures;
        const postSum = postAlpha + postBeta;

        return (postAlpha * postBeta) / (postSum * postSum * (postSum + 1));
    }

    /**
     * Normal-Normal conjugate posterior variance.
     * Prior: N(mu_0, sigma^2_prior), Data: n observations with known variance sigma^2_data.
     *
     * @param {number} priorVar  - Prior variance
     * @param {number} dataVar   - Observation-level variance
     * @param {number} n         - Sample size
     * @returns {number} Posterior variance of the mean
     */
    normalPosteriorVar(priorVar, dataVar, n) {
        if (n <= 0) return priorVar;
        // Precision-based: 1/post_var = 1/prior_var + n/data_var
        return 1 / (1 / priorVar + n / dataVar);
    }

    /**
     * Approximate posterior variance for survival parameter.
     * Uses the relationship that precision scales roughly with number of events.
     *
     * @param {number} priorVar  - Prior variance
     * @param {number} nEvents   - Expected number of events
     * @returns {number} Approximate posterior variance
     */
    survivalPosteriorVar(priorVar, nEvents) {
        if (nEvents <= 0) return priorVar;
        // Events contribute precision ~ nEvents / (prior_var * nEvents + 1)
        // Simplified: treat like normal with effective n = nEvents
        return 1 / (1 / priorVar + nEvents);
    }

    // ----------------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------------

    /**
     * Compute posterior variance based on data model.
     * @private
     */
    _posteriorVariance(priorMean, priorVar, n, dataModel, paramValues, studyDesign) {
        switch (dataModel) {
            case 'binomial': {
                // Estimate beta prior parameters via method of moments
                const { alpha, beta } = this._estimateBetaParams(priorMean, priorVar);
                return this.binomialPosteriorVar(alpha, beta, n);
            }
            case 'normal': {
                // Estimate data-level variance from PSA sample spread
                // P2-5: configurable multiplier (default 4 = prior on mean, data on individuals)
                const dataVarMultiplier = (studyDesign && studyDesign.dataVarianceMultiplier != null)
                    ? studyDesign.dataVarianceMultiplier : 4;
                const dataVar = dataVarMultiplier * priorVar;
                return this.normalPosteriorVar(priorVar, dataVar, n);
            }
            case 'survival': {
                // Use eventRate from studyDesign if provided, default 0.7
                const eventRate = (studyDesign && studyDesign.eventRate != null) ? studyDesign.eventRate : 0.7;
                const nEvents = Math.max(1, Math.floor(n * eventRate));
                return this.survivalPosteriorVar(priorVar, nEvents);
            }
            default:
                throw new Error(`Unknown dataModel: ${dataModel}`);
        }
    }

    /**
     * Estimate Beta distribution parameters from mean and variance.
     * @private
     */
    _estimateBetaParams(mean, variance) {
        // Method of moments for Beta distribution:
        // alpha = mean * ((mean*(1-mean)/variance) - 1)
        // beta  = (1 - mean) * ((mean*(1-mean)/variance) - 1)
        const clampedMean = Math.max(0.001, Math.min(0.999, mean));
        const maxVar = clampedMean * (1 - clampedMean); // Variance upper bound for Beta
        const clampedVar = Math.min(variance, maxVar * 0.99);

        const factor = (clampedMean * (1 - clampedMean) / clampedVar) - 1;
        const alpha = Math.max(0.5, clampedMean * factor);
        const beta = Math.max(0.5, (1 - clampedMean) * factor);
        return { alpha, beta };
    }

    /**
     * Compute EVPPI using binned conditional mean approach.
     * NOTE: This is a simplified estimator known to have upward bias for small
     * bin counts (Strong et al. 2014). For production use, consider GAM-based
     * methods (Strong & Oakley 2014) or INLA (Heath et al. 2016).
     * @private
     */
    _computeEVPPI(psaResults, paramName) {
        const iterations = psaResults.iterations;
        const n = iterations.length;

        // Extract parameter values and NMBs
        const paramValues = iterations.map(it => it.params[paramName]);
        const nmbs = iterations.map(it => it.nmb);

        // Current expected NMB (baseline decision value)
        const meanNMB = this._mean(nmbs);

        // Bin-based regression: sort by parameter, compute conditional E[NMB|param]
        const nBins = Math.max(20, Math.min(50, Math.floor(Math.sqrt(n))));
        const indexed = paramValues.map((v, i) => ({ v, nmb: nmbs[i] }));
        indexed.sort((a, b) => a.v - b.v);

        const binSize = Math.ceil(n / nBins);
        let sumMaxConditional = 0;

        for (let b = 0; b < nBins; b++) {
            const start = b * binSize;
            const end = Math.min(start + binSize, n);
            if (start >= n) break;

            let binSum = 0;
            let binCount = 0;
            for (let i = start; i < end; i++) {
                binSum += indexed[i].nmb;
                binCount++;
            }
            const conditionalMean = binSum / binCount;
            sumMaxConditional += Math.max(0, conditionalMean) * (binCount / n);
        }

        const baselineValue = Math.max(0, meanNMB);
        return Math.max(0, sumMaxConditional - baselineValue);
    }

    /**
     * @private
     */
    _mean(arr) {
        if (KahanSumRef) {
            const ks = new KahanSumRef();
            for (const v of arr) ks.add(v);
            return ks.total() / arr.length;
        }
        let s = 0;
        for (const v of arr) s += v;
        return s / arr.length;
    }

    /**
     * @private
     */
    _variance(arr, mean) {
        if (!arr || arr.length < 2) return 0;
        if (mean === undefined) mean = this._mean(arr);
        if (KahanSumRef) {
            const ks = new KahanSumRef();
            for (const v of arr) ks.add((v - mean) ** 2);
            return ks.total() / (arr.length - 1);
        }
        let s = 0;
        for (const v of arr) s += (v - mean) ** 2;
        return s / (arr.length - 1);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.EVSIEngine = EVSIEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EVSIEngine };
}
