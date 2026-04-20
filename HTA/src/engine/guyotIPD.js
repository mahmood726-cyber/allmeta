/**
 * Guyot IPD Reconstruction Engine
 *
 * Reconstructs individual patient data (IPD) from published Kaplan-Meier curves
 * and at-risk tables, following the algorithm of Guyot et al. (2012).
 *
 * Features:
 * - Single-arm and two-arm IPD reconstruction
 * - Validation of reconstructed vs original KM
 * - Parametric model fitting to reconstructed IPD
 * - Deterministic (seeded PRNG) output
 *
 * Reference:
 * - Guyot P, Ades AE, Ouwens MJNM, Welton NJ (2012)
 *   "Enhanced secondary analysis of survival data: reconstructing the data
 *   from published Kaplan-Meier survival curves."
 *   BMC Medical Research Methodology, 12:9.
 */

'use strict';

class GuyotIPDEngine {
    constructor() {
        this.EPSILON = 1e-15;
    }

    // ─── Seeded PRNG (xoshiro128**) ────────────────────────────────────

    /**
     * Create a seeded PRNG for deterministic output
     */
    _createRNG(seed) {
        // Simple seed expansion via splitmix32
        let s = seed >>> 0;
        function splitmix32() {
            s = (s + 0x9e3779b9) >>> 0;
            let z = s;
            z = (z ^ (z >>> 16)) >>> 0;
            z = Math.imul(z, 0x85ebca6b);
            z = (z ^ (z >>> 13)) >>> 0;
            z = Math.imul(z, 0xc2b2ae35);
            z = (z ^ (z >>> 16)) >>> 0;
            return z;
        }

        let a = splitmix32(), b = splitmix32(), c = splitmix32(), d = splitmix32();

        return function xoshiro128ss() {
            const t = (b * 5) >>> 0;
            const result = (((t << 7) | (t >>> 25)) * 9) >>> 0;
            const u = (b << 9) >>> 0;
            c ^= a; d ^= b; b ^= c; a ^= d;
            c ^= u;
            d = ((d << 11) | (d >>> 21)) >>> 0;
            return result / 4294967296;
        };
    }

    // ─── Core Reconstruction ───────────────────────────────────────────

    /**
     * Reconstruct IPD from published KM curve and at-risk table
     *
     * @param {Array} kmPoints - [{time, survival}, ...] ordered by time
     * @param {Array} nRisk - [{time, nRisk}, ...] at-risk numbers
     * @param {number} totalN - total number of patients
     * @param {Object} options - {seed, method, arm}
     * @returns {Object} reconstructed IPD + validation
     */
    reconstruct(kmPoints, nRisk, totalN, options = {}) {
        const {
            seed = 12345,
            method = 'guyot',
            arm = 'treatment'
        } = options;

        if (!kmPoints || kmPoints.length < 2) {
            throw new Error('At least 2 KM points required');
        }
        if (totalN < 1) {
            throw new Error('totalN must be >= 1');
        }

        const rng = this._createRNG(seed);

        // Sort KM points by time
        const km = [...kmPoints].sort((a, b) => a.time - b.time);

        // Ensure starts at time 0 with survival 1
        if (km[0].time > 0) {
            km.unshift({ time: 0, survival: 1.0 });
        }

        // Build at-risk lookup
        const riskTable = this._buildRiskTable(nRisk, totalN, km);

        // Guyot algorithm: compute events and censoring per interval
        const intervals = this._computeIntervals(km, riskTable, totalN);

        // Generate individual event/censor times
        const ipd = this._generateIPD(intervals, totalN, arm, rng);

        // Reconstruct KM from IPD for validation
        const reconstructedKM = this._kaplanMeierFromIPD(ipd);

        // Validation metrics
        const validation = this.validateReconstruction(km, ipd);

        // Median survival
        const medianSurvival = this._computeMedian(reconstructedKM);

        return {
            ipd,
            nPatients: ipd.length,
            nEvents: ipd.filter(p => p.event === 1).length,
            nCensored: ipd.filter(p => p.event === 0).length,
            medianSurvival,
            kaplanMeier: reconstructedKM,
            validation
        };
    }

    /**
     * Build interpolated at-risk table
     */
    _buildRiskTable(nRisk, totalN, km) {
        const table = {};
        if (nRisk && nRisk.length > 0) {
            const sorted = [...nRisk].sort((a, b) => a.time - b.time);
            for (const r of sorted) {
                table[r.time] = r.nRisk;
            }
        }
        // Ensure time 0
        if (table[0] === undefined) {
            table[0] = totalN;
        }
        return table;
    }

    /**
     * Compute events and censoring per interval (Guyot algorithm)
     */
    _computeIntervals(km, riskTable, totalN) {
        const intervals = [];
        const nIntervals = km.length - 1;

        // Get at-risk numbers at KM time points
        const riskTimes = Object.keys(riskTable).map(Number).sort((a, b) => a - b);

        for (let i = 0; i < nIntervals; i++) {
            const tStart = km[i].time;
            const tEnd = km[i + 1].time;
            const sStart = km[i].survival;
            const sEnd = km[i + 1].survival;

            // Effective at-risk at start of interval
            let nAtRisk;
            if (riskTable[tStart] !== undefined) {
                nAtRisk = riskTable[tStart];
            } else {
                // Interpolate from nearest risk table entries
                nAtRisk = this._interpolateRisk(tStart, riskTimes, riskTable, totalN);
            }

            // Number of events in this interval
            // From KM: S(t_end) = S(t_start) * (1 - d/n)^k for k sub-intervals
            // Simplified: d = n * (1 - S(t_end)/S(t_start))
            let nEvents = 0;
            if (sStart > this.EPSILON) {
                const survRatio = sEnd / sStart;
                nEvents = Math.round(nAtRisk * (1 - survRatio));
                nEvents = Math.max(0, Math.min(nEvents, nAtRisk));
            }

            // At-risk at end of interval (for censoring calculation)
            let nAtRiskEnd;
            if (riskTable[tEnd] !== undefined) {
                nAtRiskEnd = riskTable[tEnd];
            } else {
                nAtRiskEnd = this._interpolateRisk(tEnd, riskTimes, riskTable, totalN);
            }

            // Censoring: nAtRisk - nEvents - nAtRiskEnd
            let nCensored = nAtRisk - nEvents - nAtRiskEnd;
            nCensored = Math.max(0, nCensored);

            intervals.push({
                tStart,
                tEnd,
                sStart,
                sEnd,
                nAtRisk,
                nEvents,
                nCensored
            });
        }

        return intervals;
    }

    /**
     * Interpolate at-risk number for a given time
     */
    _interpolateRisk(t, riskTimes, riskTable, totalN) {
        if (riskTimes.length === 0) return totalN;

        // Find bracketing times
        let lower = riskTimes[0];
        let upper = riskTimes[riskTimes.length - 1];

        for (let i = 0; i < riskTimes.length; i++) {
            if (riskTimes[i] <= t) lower = riskTimes[i];
            if (riskTimes[i] >= t) { upper = riskTimes[i]; break; }
        }

        if (lower === upper) return riskTable[lower];

        // Linear interpolation
        const frac = (t - lower) / (upper - lower);
        return Math.round(riskTable[lower] + frac * (riskTable[upper] - riskTable[lower]));
    }

    /**
     * Generate individual patient data from interval summaries
     */
    _generateIPD(intervals, totalN, arm, rng) {
        const ipd = [];
        let id = 1;

        for (const interval of intervals) {
            const { tStart, tEnd, nEvents, nCensored } = interval;

            // Distribute events uniformly within interval
            for (let e = 0; e < nEvents; e++) {
                const frac = nEvents > 1 ? e / (nEvents - 1) : 0.5;
                // Use rng for slight jitter
                const jitter = (rng() - 0.5) * 0.01 * (tEnd - tStart);
                const time = tStart + frac * (tEnd - tStart) + jitter;
                ipd.push({
                    id: id++,
                    time: Math.max(tStart, Math.min(tEnd, time)),
                    event: 1,
                    arm
                });
            }

            // Distribute censoring uniformly within interval
            for (let c = 0; c < nCensored; c++) {
                const frac = nCensored > 1 ? c / (nCensored - 1) : 0.5;
                const jitter = (rng() - 0.5) * 0.01 * (tEnd - tStart);
                const time = tStart + frac * (tEnd - tStart) + jitter;
                ipd.push({
                    id: id++,
                    time: Math.max(tStart, Math.min(tEnd, time)),
                    event: 0,
                    arm
                });
            }
        }

        // If we have fewer patients than totalN, add censored at last time
        const lastTime = intervals.length > 0
            ? intervals[intervals.length - 1].tEnd
            : 0;
        while (ipd.length < totalN) {
            ipd.push({
                id: id++,
                time: lastTime,
                event: 0,
                arm
            });
        }

        // If we generated more than totalN, truncate (shouldn't normally happen)
        if (ipd.length > totalN) {
            ipd.length = totalN;
        }

        // Sort by time
        ipd.sort((a, b) => a.time - b.time);

        // Re-assign sequential IDs
        ipd.forEach((p, i) => { p.id = i + 1; });

        return ipd;
    }

    // ─── KM from IPD ───────────────────────────────────────────────────

    /**
     * Compute Kaplan-Meier from IPD
     */
    _kaplanMeierFromIPD(ipd) {
        const sorted = [...ipd].sort((a, b) => a.time - b.time);
        const n = sorted.length;
        const km = [];
        let nAtRisk = n;
        let survival = 1.0;

        km.push({ time: 0, survival: 1.0, nRisk: n, nEvent: 0, nCensor: 0 });

        let i = 0;
        while (i < n) {
            const t = sorted[i].time;
            let events = 0;
            let censored = 0;

            while (i < n && sorted[i].time === t) {
                if (sorted[i].event === 1) events++;
                else censored++;
                i++;
            }

            if (events > 0) {
                survival *= (1 - events / nAtRisk);
                km.push({ time: t, survival, nRisk: nAtRisk, nEvent: events, nCensor: censored });
            }

            nAtRisk -= (events + censored);
        }

        return km;
    }

    /**
     * Compute median survival from KM curve
     */
    _computeMedian(km) {
        for (let i = 1; i < km.length; i++) {
            if (km[i].survival <= 0.5) {
                if (km[i - 1].survival > 0.5) {
                    // Linear interpolation
                    const frac = (km[i - 1].survival - 0.5) /
                        (km[i - 1].survival - km[i].survival + this.EPSILON);
                    return km[i - 1].time + frac * (km[i].time - km[i - 1].time);
                }
                return km[i].time;
            }
        }
        return null; // Median not reached
    }

    // ─── Two-Arm Reconstruction ────────────────────────────────────────

    /**
     * Reconstruct IPD for two-arm study
     *
     * @param {Array} treatmentKM - treatment arm KM points
     * @param {Array} controlKM - control arm KM points
     * @param {number} treatmentN - treatment arm total N
     * @param {number} controlN - control arm total N
     * @param {Object} nRisk - {treatment: [...], control: [...]}
     * @param {Object} options
     * @returns {Object} combined IPD with arm labels
     */
    reconstructTwoArm(treatmentKM, controlKM, treatmentN, controlN, nRisk = {}, options = {}) {
        const seed = options.seed || 12345;

        const treatmentIPD = this.reconstruct(treatmentKM,
            nRisk.treatment || [], treatmentN,
            { ...options, seed, arm: 'treatment' });

        const controlIPD = this.reconstruct(controlKM,
            nRisk.control || [], controlN,
            { ...options, seed: seed + 1000, arm: 'control' });

        // Combine
        const combinedIPD = [
            ...treatmentIPD.ipd,
            ...controlIPD.ipd
        ];

        // Re-assign sequential IDs
        combinedIPD.forEach((p, i) => { p.id = i + 1; });

        return {
            ipd: combinedIPD,
            nPatients: combinedIPD.length,
            treatment: {
                nPatients: treatmentIPD.nPatients,
                nEvents: treatmentIPD.nEvents,
                nCensored: treatmentIPD.nCensored,
                medianSurvival: treatmentIPD.medianSurvival,
                validation: treatmentIPD.validation
            },
            control: {
                nPatients: controlIPD.nPatients,
                nEvents: controlIPD.nEvents,
                nCensored: controlIPD.nCensored,
                medianSurvival: controlIPD.medianSurvival,
                validation: controlIPD.validation
            }
        };
    }

    // ─── Validation ────────────────────────────────────────────────────

    /**
     * Validate reconstructed IPD against original KM curve
     *
     * @param {Array} originalKM - [{time, survival}, ...]
     * @param {Array} reconstructedIPD - IPD array
     * @returns {Object} validation metrics
     */
    validateReconstruction(originalKM, reconstructedIPD) {
        const reconKM = Array.isArray(reconstructedIPD[0]) ? reconstructedIPD : this._kaplanMeierFromIPD(reconstructedIPD);

        let maxDeviation = 0;
        let sumSqDev = 0;
        let nCompared = 0;

        const origSorted = [...originalKM].sort((a, b) => a.time - b.time);

        for (const orig of origSorted) {
            // Find closest reconstructed time
            const reconSurv = this._interpolateKM(orig.time, reconKM);
            const dev = Math.abs(orig.survival - reconSurv);
            maxDeviation = Math.max(maxDeviation, dev);
            sumSqDev += dev * dev;
            nCompared++;
        }

        const rmse = nCompared > 0 ? Math.sqrt(sumSqDev / nCompared) : 0;

        return {
            maxDeviation,
            rmse,
            nCompared
        };
    }

    /**
     * Interpolate survival from KM at a given time
     */
    _interpolateKM(t, km) {
        if (km.length === 0) return 1;
        if (t <= km[0].time) return km[0].survival;
        if (t >= km[km.length - 1].time) return km[km.length - 1].survival;

        for (let i = 1; i < km.length; i++) {
            if (km[i].time >= t) {
                // KM is a step function: survival is constant between events
                return km[i - 1].survival;
            }
        }
        return km[km.length - 1].survival;
    }

    // ─── Parametric Fitting ────────────────────────────────────────────

    /**
     * Fit parametric survival models to reconstructed IPD
     *
     * @param {Array} ipd - [{id, time, event}, ...]
     * @param {Array} distributions - ['weibull', 'lognormal', 'loglogistic', 'exponential']
     * @returns {Array} model fits sorted by AIC
     */
    fitSurvivalToIPD(ipd, distributions = ['weibull', 'lognormal', 'loglogistic', 'exponential']) {
        const results = [];

        for (const dist of distributions) {
            try {
                const fit = this._fitParametric(ipd, dist);
                results.push({ distribution: dist, ...fit });
            } catch (e) {
                results.push({
                    distribution: dist,
                    error: e.message,
                    aic: Infinity,
                    bic: Infinity
                });
            }
        }

        // Sort by AIC
        results.sort((a, b) => (a.aic || Infinity) - (b.aic || Infinity));

        return results;
    }

    /**
     * Fit a single parametric distribution via MLE
     */
    _fitParametric(ipd, distribution) {
        const n = ipd.length;
        const nEvents = ipd.filter(p => p.event === 1).length;
        if (nEvents === 0) throw new Error('No events to fit');

        const times = ipd.map(p => Math.max(p.time, 1e-10));
        const events = ipd.map(p => p.event);

        switch (distribution) {
            case 'exponential': {
                // MLE: lambda = nEvents / sum(times)
                const totalTime = times.reduce((a, b) => a + b, 0);
                const lambda = nEvents / totalTime;
                const logLik = nEvents * Math.log(lambda) - lambda * totalTime;
                const nPar = 1;
                return {
                    parameters: { lambda },
                    logLik,
                    aic: -2 * logLik + 2 * nPar,
                    bic: -2 * logLik + nPar * Math.log(n),
                    median: Math.log(2) / lambda
                };
            }
            case 'weibull': {
                // MLE via Newton-Raphson for shape (k) and scale (lambda)
                // Parameterization: f(t) = (k/lambda)(t/lambda)^(k-1) exp(-(t/lambda)^k)
                let k = 1.0; // shape
                const maxIter = 100;
                const tol = 1e-8;

                for (let iter = 0; iter < maxIter; iter++) {
                    // Given k, MLE of lambda: lambda = (sum(t^k * event_i) / nEvents)^(1/k)
                    // ... actually, (sum(t^k)/nEvents)^(1/k)
                    let sumTk = 0, sumTkLogT = 0, sumLogT = 0;
                    for (let i = 0; i < n; i++) {
                        const tk = Math.pow(times[i], k);
                        sumTk += tk;
                        sumTkLogT += tk * Math.log(times[i]);
                        if (events[i] === 1) sumLogT += Math.log(times[i]);
                    }

                    const lambda = Math.pow(sumTk / nEvents, 1 / k);

                    // Profile score for k
                    const score = nEvents / k + sumLogT - nEvents * sumTkLogT / sumTk;

                    if (Math.abs(score) < tol) {
                        const logLik = nEvents * Math.log(k) - nEvents * k * Math.log(lambda)
                            + (k - 1) * sumLogT - sumTk / Math.pow(lambda, k);
                        const nPar = 2;
                        return {
                            parameters: { shape: k, scale: lambda },
                            logLik,
                            aic: -2 * logLik + 2 * nPar,
                            bic: -2 * logLik + nPar * Math.log(n),
                            median: lambda * Math.pow(Math.log(2), 1 / k)
                        };
                    }

                    // Newton step for k (profile)
                    const d2 = -nEvents / (k * k) - nEvents *
                        ((sumTk * (sumTkLogT * Math.log(times[0]) || 0)) - sumTkLogT * sumTkLogT) /
                        (sumTk * sumTk);

                    // Simpler: use bisection-like damped step
                    const step = Math.min(0.5, Math.max(-0.5, score * 0.1));
                    k += step;
                    k = Math.max(0.01, k);
                }

                // Final estimates
                let sumTk = 0, sumLogT = 0;
                for (let i = 0; i < n; i++) {
                    sumTk += Math.pow(times[i], k);
                    if (events[i] === 1) sumLogT += Math.log(times[i]);
                }
                const lambda = Math.pow(sumTk / nEvents, 1 / k);
                const logLik = nEvents * Math.log(k) - nEvents * k * Math.log(lambda)
                    + (k - 1) * sumLogT - sumTk / Math.pow(lambda, k);
                const nPar = 2;
                return {
                    parameters: { shape: k, scale: lambda },
                    logLik,
                    aic: -2 * logLik + 2 * nPar,
                    bic: -2 * logLik + nPar * Math.log(n),
                    median: lambda * Math.pow(Math.log(2), 1 / k)
                };
            }
            case 'lognormal': {
                // MLE: mu = mean(log(eventTimes)), sigma = sd(log(eventTimes))
                // For censored data, use simple EM-like approach
                const logTimes = [];
                for (let i = 0; i < n; i++) {
                    if (events[i] === 1) logTimes.push(Math.log(times[i]));
                }
                const mu = logTimes.reduce((a, b) => a + b, 0) / logTimes.length;
                const sigma = Math.sqrt(
                    logTimes.reduce((a, v) => a + (v - mu) ** 2, 0) / logTimes.length
                );

                // Log-likelihood (approximate for censored)
                let logLik = 0;
                for (let i = 0; i < n; i++) {
                    const z = (Math.log(times[i]) - mu) / (sigma + 1e-10);
                    if (events[i] === 1) {
                        logLik += -0.5 * z * z - Math.log(sigma + 1e-10)
                            - Math.log(times[i]) - 0.5 * Math.log(2 * Math.PI);
                    } else {
                        const Phi = this._normalCDF(z);
                        logLik += Math.log(1 - Phi + 1e-15);
                    }
                }
                const nPar = 2;
                return {
                    parameters: { mu, sigma },
                    logLik,
                    aic: -2 * logLik + 2 * nPar,
                    bic: -2 * logLik + nPar * Math.log(n),
                    median: Math.exp(mu)
                };
            }
            case 'loglogistic': {
                // Parameterization: S(t) = 1/(1+(t/alpha)^beta)
                // Approximate MLE: use log-logistic as logistic on log-scale
                const logTimes = [];
                for (let i = 0; i < n; i++) {
                    if (events[i] === 1) logTimes.push(Math.log(times[i]));
                }
                const mu = logTimes.reduce((a, b) => a + b, 0) / logTimes.length;
                const s = Math.sqrt(
                    logTimes.reduce((a, v) => a + (v - mu) ** 2, 0) / logTimes.length
                ) * Math.sqrt(3) / Math.PI; // logistic scale from variance

                const alpha = Math.exp(mu);
                const beta = 1 / Math.max(s, 0.01);

                let logLik = 0;
                for (let i = 0; i < n; i++) {
                    const u = Math.pow(times[i] / alpha, beta);
                    if (events[i] === 1) {
                        logLik += Math.log(beta) + (beta - 1) * Math.log(times[i])
                            - beta * Math.log(alpha) - 2 * Math.log(1 + u);
                    } else {
                        logLik += -Math.log(1 + u);
                    }
                }
                const nPar = 2;
                return {
                    parameters: { alpha, beta },
                    logLik,
                    aic: -2 * logLik + 2 * nPar,
                    bic: -2 * logLik + nPar * Math.log(n),
                    median: alpha
                };
            }
            default:
                throw new Error(`Unknown distribution: ${distribution}`);
        }
    }

    /**
     * Standard normal CDF
     */
    _normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        const t = 1.0 / (1.0 + p * Math.abs(x));
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
        return 0.5 * (1.0 + sign * y);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.GuyotIPDEngine = GuyotIPDEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GuyotIPDEngine };
}
