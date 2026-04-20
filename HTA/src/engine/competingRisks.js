/**
 * Competing Risks Analysis Engine for HTA Survival Modeling
 *
 * Implements non-parametric cumulative incidence function (CIF) estimation
 * using the Aalen-Johansen method, Gray's test for comparing CIFs between
 * groups, Fine-Gray subdistribution hazard regression, and cause-specific
 * hazard estimation.
 *
 * Patients face multiple mutually exclusive events (e.g., death from disease,
 * death from other causes, treatment discontinuation).
 *
 * References:
 * - Aalen OO, Johansen S (1978). Scand J Stat 5:141-150.
 * - Gray RJ (1988). Ann Stat 16:1141-1154.
 * - Fine JP, Gray RJ (1999). JASA 94:496-509.
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

/**
 * Stable Kahan-aware summation helper.
 * Falls back to naive sum if KahanSum is not available.
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
 * Standard normal CDF (Abramowitz & Stegun approximation).
 */
function normalCDF(z) {
    if (z < -8) return 0;
    if (z > 8) return 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
}

/**
 * Chi-squared CDF with df degrees of freedom (Wilson-Hilferty approx).
 */
function chi2CDF(x, df) {
    if (x <= 0) return 0;
    // Wilson-Hilferty transformation
    const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
    const se = Math.sqrt(2 / (9 * df));
    return normalCDF(z / se);
}

/**
 * Standard normal quantile (inverse CDF).
 * Rational approximation (Abramowitz & Stegun 26.2.23).
 * P2-10: Promoted to module-level for consistency with normalCDF.
 * @param {number} p - Probability in (0, 1)
 * @returns {number} z such that Phi(z) = p
 */
function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const sign = p < 0.5 ? -1 : 1;
    const pp = p < 0.5 ? p : 1 - p;

    const t = Math.sqrt(-2 * Math.log(pp));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;

    const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    return sign * z;
}

class CompetingRisksEngine {
    constructor(options = {}) {
        this.options = {
            confLevel: options.confLevel ?? 0.95,
            ...options
        };
    }

    /**
     * Validate input data for competing risks analysis.
     * @param {Array} data - [{time, event}, ...]
     * @param {Array} causes - Array of event type strings
     */
    _validateData(data, causes) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        if (!Array.isArray(causes) || causes.length === 0) {
            throw new Error('Causes must be a non-empty array');
        }
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            if (d.time == null || typeof d.time !== 'number' || d.time < 0) {
                throw new Error(`Invalid time at index ${i}: time must be a non-negative number`);
            }
            if (d.event == null) {
                throw new Error(`Missing event at index ${i}`);
            }
            // event must be 'censored' or one of the causes
            if (d.event !== 'censored' && !causes.includes(d.event)) {
                throw new Error(`Unknown event type "${d.event}" at index ${i}. Must be one of: ${causes.join(', ')}, censored`);
            }
        }
        // Check at least 2 events per cause
        for (const cause of causes) {
            const count = data.filter(d => d.event === cause).length;
            if (count < 2) {
                throw new Error(`Cause "${cause}" has ${count} event(s); need at least 2`);
            }
        }
    }

    /**
     * Compute cumulative incidence functions (CIF) using the Aalen-Johansen estimator.
     *
     * CIF_k(t) = sum_{t_j <= t} S(t_j-) * (d_kj / n_j)
     * where S(t-) is the overall Kaplan-Meier survival just before time t.
     *
     * @param {Array} data - [{time, event}, ...]
     * @param {Array} causes - Event type strings (excluding 'censored')
     * @returns {Object} { [cause]: [{time, cif, se, lower, upper}], overallSurvival: [{time, surv}] }
     */
    cumulativeIncidence(data, causes) {
        this._validateData(data, causes);

        const confLevel = this.options.confLevel;
        const zAlpha = this._zQuantile((1 + confLevel) / 2);

        // Collect unique event times (sorted)
        const allTimes = [...new Set(data.map(d => d.time))].sort((a, b) => a - b);

        // Build risk table: at each time, count events of each type + censored
        const n = data.length;
        // Sort data by time
        const sorted = [...data].sort((a, b) => a.time - b.time);

        // Build event-time summary
        const timeSummary = [];
        for (const t of allTimes) {
            const atTime = sorted.filter(d => d.time === t);
            const summary = { time: t, censored: 0 };
            for (const c of causes) {
                summary[c] = 0;
            }
            for (const d of atTime) {
                if (d.event === 'censored') {
                    summary.censored++;
                } else {
                    summary[d.event]++;
                }
            }
            timeSummary.push(summary);
        }

        // Compute CIF using Aalen-Johansen
        const result = {};
        for (const c of causes) {
            result[c] = [];
        }
        result.overallSurvival = [];

        let survPrev = 1.0; // S(t-) — overall KM survival just before current time
        let atRisk = n;

        // Aalen CIF variance with cross-terms (delta-method form)
        // Var(CIF_k(t)) = sum_{s<=t} [ S(s-)^2 * d_k(n-d_k) / (n^2*(n-1))
        //                  + CIF_k_remainder(s)^2 * d*(n-d) / (n^2*(n-1))
        //                  - 2 * S(s-) * CIF_k_remainder(s) * d_k * d / (n^2*(n-1)) ]
        // where d = total failures, d_k = cause-k failures, n = at risk,
        // CIF_k_remainder(s) = CIF_k(t) - CIF_k(s) (future CIF accumulated after s)
        //
        // Since CIF_k_remainder depends on the final CIF, we use a two-pass approach:
        // Pass 1: compute CIF values at each time point
        // Pass 2: compute variances using the full CIF trajectory

        const cifAccum = {};
        for (const c of causes) {
            cifAccum[c] = 0;
        }

        // Pass 1: collect CIF trajectory and time-point data
        const trajectory = []; // [{time, atRisk, totalFailures, dk:{}, survPrev, cifSnap:{}, survCurrent}]

        for (const ts of timeSummary) {
            const t = ts.time;
            if (atRisk <= 0) break;

            // Total events at this time
            let totalEvents = ts.censored;
            for (const c of causes) {
                totalEvents += ts[c];
            }
            const totalFailures = totalEvents - ts.censored;

            // CIF increment for each cause
            const dk = {};
            for (const c of causes) {
                dk[c] = ts[c];
                if (dk[c] > 0) {
                    const increment = survPrev * (dk[c] / atRisk);
                    cifAccum[c] += increment;
                }
            }

            // Update overall survival: S(t) = S(t-) * (1 - d/n) where d = total failures
            const survCurrent = survPrev * (1 - totalFailures / atRisk);

            // Snapshot CIF values at this time
            const cifSnap = {};
            for (const c of causes) {
                cifSnap[c] = cifAccum[c];
            }

            trajectory.push({
                time: t,
                atRisk: atRisk,
                totalFailures: totalFailures,
                dk: dk,
                survPrev: survPrev,
                cifSnap: cifSnap,
                survCurrent: survCurrent,
                censored: ts.censored
            });

            // Update at-risk: remove all events and censored at this time
            atRisk -= (totalFailures + ts.censored);
            survPrev = Math.max(0, survCurrent);
        }

        // Final CIF values for each cause
        const cifFinal = {};
        for (const c of causes) {
            cifFinal[c] = trajectory.length > 0
                ? trajectory[trajectory.length - 1].cifSnap[c]
                : 0;
        }

        // Pass 2: compute variance at each time point using Aalen formula with cross-terms
        for (let tIdx = 0; tIdx < trajectory.length; tIdx++) {
            const currentCif = {};
            for (const c of causes) {
                currentCif[c] = trajectory[tIdx].cifSnap[c];
            }

            // Accumulate variance terms over all time points up to and including tIdx
            for (const c of causes) {
                let varSum = 0;
                for (let sIdx = 0; sIdx <= tIdx; sIdx++) {
                    const step = trajectory[sIdx];
                    const nRisk = step.atRisk;
                    const d = step.totalFailures;
                    const dkVal = step.dk[c];

                    if (nRisk <= 1) continue;

                    const Sm = step.survPrev; // S(s-)
                    // CIF_k accumulated after time s up to current time tIdx
                    const cifAtS = sIdx > 0 ? trajectory[sIdx - 1].cifSnap[c] : 0;
                    const cifRemainder = currentCif[c] - trajectory[sIdx].cifSnap[c];

                    const denom = nRisk * nRisk * (nRisk - 1);

                    // Term 1: S(s-)^2 * d_k * (n - d_k) / (n^2 * (n-1))
                    const term1 = Sm * Sm * dkVal * (nRisk - dkVal) / denom;

                    // Term 2: CIF_k_remainder^2 * d * (n - d) / (n^2 * (n-1))
                    const term2 = cifRemainder * cifRemainder * d * (nRisk - d) / denom;

                    // Term 3: -2 * S(s-) * CIF_k_remainder * d_k * d / (n^2 * (n-1))
                    const term3 = -2 * Sm * cifRemainder * dkVal * d / denom;

                    varSum += term1 + term2 + term3;
                }

                const se = Math.sqrt(Math.max(0, varSum));
                const lower = Math.max(0, currentCif[c] - zAlpha * se);
                const upper = Math.min(1, currentCif[c] + zAlpha * se);
                result[c].push({
                    time: trajectory[tIdx].time,
                    cif: currentCif[c],
                    se: se,
                    lower: lower,
                    upper: upper
                });
            }

            result.overallSurvival.push({
                time: trajectory[tIdx].time,
                surv: Math.max(0, trajectory[tIdx].survCurrent)
            });
        }

        return result;
    }

    /**
     * Gray's test for equality of CIFs between groups.
     *
     * Uses a weighted log-rank-type statistic on the subdistribution hazard.
     *
     * @param {Array} groups - [{name, data: [{time, event}]}, ...]
     * @param {string} cause - The cause to test
     * @returns {Object} {statistic, df, pValue, cause}
     */
    grayTest(groups, cause) {
        if (!Array.isArray(groups) || groups.length < 2) {
            throw new Error('Gray\'s test requires at least 2 groups');
        }
        if (!cause) {
            throw new Error('Must specify a cause for Gray\'s test');
        }

        const K = groups.length; // number of groups

        // Pool all data to get combined event times
        const allData = [];
        const groupLabels = [];
        for (let g = 0; g < K; g++) {
            for (const d of groups[g].data) {
                allData.push({ ...d, group: g });
            }
            groupLabels.push(groups[g].name);
        }

        // All unique event times
        const eventTimes = [...new Set(
            allData.filter(d => d.event === cause).map(d => d.time)
        )].sort((a, b) => a - b);

        if (eventTimes.length === 0) {
            return { statistic: 0, df: K - 1, pValue: 1, cause };
        }

        // For each group and each event time, compute at-risk and events
        // Using subdistribution approach: subjects who had a competing event
        // remain in the risk set
        const n = new Array(K);
        for (let g = 0; g < K; g++) {
            n[g] = groups[g].data.length;
        }

        // Compute the test statistic as a weighted sum
        // U_g = sum_j [ d_{gj} - (n_gj / n_j) * d_j ]
        // where d_{gj} = events of target cause in group g at time j,
        //       n_gj = at risk in group g at time j (subdistribution risk set),
        //       d_j = total events of target cause at time j

        const U = new Array(K).fill(0);
        const V = new Array(K * K).fill(0); // variance-covariance matrix (flattened K×K)

        for (const t of eventTimes) {
            // Count at-risk and events per group at this time
            // Subdistribution risk set: anyone who hasn't had the event of interest
            // and hasn't been censored before t. Those with competing events remain.
            const atRiskG = new Array(K).fill(0);
            const eventsG = new Array(K).fill(0);

            for (let g = 0; g < K; g++) {
                for (const d of groups[g].data) {
                    // In subdistribution risk set at time t if:
                    // 1. Haven't had the event of interest before t, AND
                    // 2. Not censored before t
                    if (d.event === cause && d.time <= t) {
                        // Had event of interest
                        if (d.time === t) {
                            eventsG[g]++;
                            atRiskG[g]++;
                        }
                        // If d.time < t, already had event, not at risk
                    } else if (d.event === 'censored' && d.time < t) {
                        // Censored before t, not at risk
                    } else {
                        // Still at risk (includes competing events)
                        atRiskG[g]++;
                    }
                }
            }

            const totalAtRisk = kahanSumArray(atRiskG);
            const totalEvents = kahanSumArray(eventsG);

            if (totalAtRisk <= 0 || totalEvents <= 0) continue;

            // Update U statistics
            for (let g = 0; g < K; g++) {
                const expected = (atRiskG[g] / totalAtRisk) * totalEvents;
                U[g] += eventsG[g] - expected;
            }

            // Variance contribution
            if (totalAtRisk > 1) {
                for (let g1 = 0; g1 < K; g1++) {
                    for (let g2 = 0; g2 < K; g2++) {
                        const covar = totalEvents * (atRiskG[g1] / totalAtRisk) *
                            ((g1 === g2 ? 1 : 0) - atRiskG[g2] / totalAtRisk) *
                            (totalAtRisk - totalEvents) / (totalAtRisk - 1);
                        V[g1 * K + g2] += covar;
                    }
                }
            }
        }

        // Chi-squared statistic: U' V^{-1} U using the first K-1 groups
        // For K=2 this simplifies to U[0]^2 / V[0]
        let statistic;
        const df = K - 1;

        if (K === 2) {
            statistic = V[0] > 0 ? (U[0] * U[0]) / V[0] : 0;
        } else {
            // General case: extract (K-1)×(K-1) leading submatrix of V,
            // invert via Gauss-Jordan, compute U_sub' * V_inv * U_sub
            const m = K - 1;

            // Extract leading (K-1)×(K-1) submatrix and U_sub
            const Vsub = new Array(m * m);
            const Usub = new Array(m);
            for (let i = 0; i < m; i++) {
                Usub[i] = U[i];
                for (let j = 0; j < m; j++) {
                    Vsub[i * m + j] = V[i * K + j];
                }
            }

            // Gauss-Jordan elimination on augmented matrix [Vsub | I]
            const aug = new Array(m * 2 * m).fill(0);
            for (let i = 0; i < m; i++) {
                for (let j = 0; j < m; j++) {
                    aug[i * (2 * m) + j] = Vsub[i * m + j];
                }
                aug[i * (2 * m) + m + i] = 1; // identity on right side
            }

            let invertible = true;
            for (let col = 0; col < m; col++) {
                // Partial pivoting: find row with largest absolute value in column
                let maxVal = Math.abs(aug[col * (2 * m) + col]);
                let maxRow = col;
                for (let row = col + 1; row < m; row++) {
                    const val = Math.abs(aug[row * (2 * m) + col]);
                    if (val > maxVal) {
                        maxVal = val;
                        maxRow = row;
                    }
                }

                if (maxVal < 1e-15) {
                    invertible = false;
                    break;
                }

                // Swap rows if needed
                if (maxRow !== col) {
                    for (let j = 0; j < 2 * m; j++) {
                        const tmp = aug[col * (2 * m) + j];
                        aug[col * (2 * m) + j] = aug[maxRow * (2 * m) + j];
                        aug[maxRow * (2 * m) + j] = tmp;
                    }
                }

                // Scale pivot row
                const pivot = aug[col * (2 * m) + col];
                for (let j = 0; j < 2 * m; j++) {
                    aug[col * (2 * m) + j] /= pivot;
                }

                // Eliminate column in all other rows
                for (let row = 0; row < m; row++) {
                    if (row === col) continue;
                    const factor = aug[row * (2 * m) + col];
                    for (let j = 0; j < 2 * m; j++) {
                        aug[row * (2 * m) + j] -= factor * aug[col * (2 * m) + j];
                    }
                }
            }

            if (!invertible) {
                // Fallback: singular matrix, use first element
                statistic = V[0] > 0 ? (U[0] * U[0]) / V[0] : 0;
            } else {
                // Extract inverse from right half of augmented matrix
                const Vinv = new Array(m * m);
                for (let i = 0; i < m; i++) {
                    for (let j = 0; j < m; j++) {
                        Vinv[i * m + j] = aug[i * (2 * m) + m + j];
                    }
                }

                // Compute U_sub' * V_inv * U_sub
                statistic = 0;
                for (let i = 0; i < m; i++) {
                    for (let j = 0; j < m; j++) {
                        statistic += Usub[i] * Vinv[i * m + j] * Usub[j];
                    }
                }

                // Ensure non-negative (numerical noise)
                if (statistic < 0) statistic = 0;
            }
        }

        // p-value from chi-squared distribution
        const pValue = 1 - chi2CDF(statistic, df);

        return {
            statistic: statistic,
            df: df,
            pValue: pValue,
            cause: cause
        };
    }

    /**
     * Fine-Gray subdistribution hazard regression (single covariate).
     *
     * Estimates the subdistribution hazard ratio for a binary covariate.
     * Uses a score-based estimator.
     *
     * @param {Array} data - [{time, event, covariate}, ...]
     * @param {string} cause - Target cause
     * @returns {Object} {hr, se, lower, upper, pValue, beta}
     */
    fineGray(data, cause) {
        if (!cause) {
            throw new Error('Must specify a cause for Fine-Gray regression');
        }
        if (!data || data.length < 5) {
            throw new Error('Fine-Gray regression requires at least 5 observations');
        }

        // Validate covariate presence
        for (let i = 0; i < data.length; i++) {
            if (data[i].covariate == null || typeof data[i].covariate !== 'number') {
                throw new Error(`Missing or non-numeric covariate at index ${i}`);
            }
        }

        const confLevel = this.options.confLevel;
        const zAlpha = this._zQuantile((1 + confLevel) / 2);

        // Sort by time
        const sorted = [...data].sort((a, b) => a.time - b.time);

        // Newton-Raphson to estimate beta (log-HR) for subdistribution hazard
        // Partial likelihood approach simplified for single covariate
        let beta = 0;
        const maxIter = 50;
        const tol = 1e-8;

        // Unique event times for the target cause (sorted)
        const uniqueEventTimes = [...new Set(
            sorted.filter(d => d.event === cause).map(d => d.time)
        )].sort((a, b) => a - b);

        if (uniqueEventTimes.length < 1) {
            throw new Error(`Need at least 2 events for cause "${cause}"`);
        }

        // Pre-compute risk sets once before NR loop (P1-12 performance fix).
        // For each unique event time, store the indices into `sorted` of
        // subjects in the subdistribution risk set, plus the event subjects.
        //
        // Subdistribution risk set at time t:
        //   - cause events with time >= t
        //   - censored with time >= t
        //   - competing events: always in risk set (remain regardless of time)
        //
        // We partition subjects into three groups:
        //   1. Competing-event subjects (always at risk) — constant set
        //   2. Cause subjects sorted by time — at risk while time >= t
        //   3. Censored subjects sorted by time — at risk while time >= t
        //
        // For groups 2 and 3 we use a pointer that advances as t increases.

        const competingSubjects = []; // always in risk set
        const causeSubjects = [];     // sorted by time, at risk while time >= t
        const censoredSubjects = [];  // sorted by time, at risk while time >= t

        for (const d of sorted) {
            if (d.event === cause) {
                causeSubjects.push(d);
            } else if (d.event === 'censored') {
                censoredSubjects.push(d);
            } else {
                competingSubjects.push(d); // competing event: always in risk set
            }
        }
        // causeSubjects and censoredSubjects are already sorted since sorted is sorted

        // Pre-compute: for each unique event time, the start indices and event covariates
        const precomputed = [];
        let causePtr = 0;
        let censoredPtr = 0;

        for (const t of uniqueEventTimes) {
            // Advance cause pointer: skip subjects with time < t
            while (causePtr < causeSubjects.length && causeSubjects[causePtr].time < t) {
                causePtr++;
            }
            // Advance censored pointer: skip subjects with time < t
            while (censoredPtr < censoredSubjects.length && censoredSubjects[censoredPtr].time < t) {
                censoredPtr++;
            }

            // Collect event covariates at this time (all tied events — P0-2 fix)
            const eventCovariates = [];
            for (let i = causePtr; i < causeSubjects.length && causeSubjects[i].time === t; i++) {
                eventCovariates.push(causeSubjects[i].covariate);
            }

            precomputed.push({
                time: t,
                causeStartIdx: causePtr,
                censoredStartIdx: censoredPtr,
                eventCovariates: eventCovariates
            });
        }

        const totalCauseEvents = sorted.filter(d => d.event === cause).length;
        if (totalCauseEvents < 2) {
            throw new Error(`Need at least 2 events for cause "${cause}"`);
        }

        for (let iter = 0; iter < maxIter; iter++) {
            let score = 0;
            let info = 0;

            for (const pc of precomputed) {
                if (pc.eventCovariates.length === 0) continue;

                // Compute weighted sums S0, S1, S2 over the risk set
                let S0 = 0, S1 = 0, S2 = 0;

                // 1. Competing-event subjects (always at risk)
                for (const r of competingSubjects) {
                    const w = Math.exp(beta * r.covariate);
                    S0 += w;
                    S1 += w * r.covariate;
                    S2 += w * r.covariate * r.covariate;
                }

                // 2. Cause subjects with time >= t
                for (let i = pc.causeStartIdx; i < causeSubjects.length; i++) {
                    const r = causeSubjects[i];
                    const w = Math.exp(beta * r.covariate);
                    S0 += w;
                    S1 += w * r.covariate;
                    S2 += w * r.covariate * r.covariate;
                }

                // 3. Censored subjects with time >= t
                for (let i = pc.censoredStartIdx; i < censoredSubjects.length; i++) {
                    const r = censoredSubjects[i];
                    const w = Math.exp(beta * r.covariate);
                    S0 += w;
                    S1 += w * r.covariate;
                    S2 += w * r.covariate * r.covariate;
                }

                if (S0 === 0) continue;

                const xbar = S1 / S0;
                // Accumulate score for all tied events at this time
                for (const cov of pc.eventCovariates) {
                    score += cov - xbar;
                }
                info += pc.eventCovariates.length * ((S2 / S0) - (xbar * xbar));
            }

            if (Math.abs(info) < 1e-15) break;

            const step = score / info;
            beta += step;

            if (Math.abs(step) < tol) break;
        }

        const hr = Math.exp(beta);

        // Estimate SE from information matrix at final beta
        let infoFinal = 0;
        for (const pc of precomputed) {
            if (pc.eventCovariates.length === 0) continue;

            let S0 = 0, S1 = 0, S2 = 0;

            for (const r of competingSubjects) {
                const w = Math.exp(beta * r.covariate);
                S0 += w;
                S1 += w * r.covariate;
                S2 += w * r.covariate * r.covariate;
            }
            for (let i = pc.causeStartIdx; i < causeSubjects.length; i++) {
                const r = causeSubjects[i];
                const w = Math.exp(beta * r.covariate);
                S0 += w;
                S1 += w * r.covariate;
                S2 += w * r.covariate * r.covariate;
            }
            for (let i = pc.censoredStartIdx; i < censoredSubjects.length; i++) {
                const r = censoredSubjects[i];
                const w = Math.exp(beta * r.covariate);
                S0 += w;
                S1 += w * r.covariate;
                S2 += w * r.covariate * r.covariate;
            }

            if (S0 > 0) {
                const xbar = S1 / S0;
                infoFinal += pc.eventCovariates.length * ((S2 / S0) - (xbar * xbar));
            }
        }

        const seBeta = infoFinal > 0 ? 1 / Math.sqrt(infoFinal) : Infinity;
        const seHR = hr * seBeta; // delta method

        const lower = Math.exp(beta - zAlpha * seBeta);
        const upper = Math.exp(beta + zAlpha * seBeta);
        const zStat = beta / seBeta;
        const pValue = 2 * (1 - normalCDF(Math.abs(zStat)));

        return {
            hr: hr,
            beta: beta,
            se: seHR,
            seBeta: seBeta,
            lower: lower,
            upper: upper,
            pValue: pValue
        };
    }

    /**
     * Cause-specific hazard estimation at each event time.
     *
     * h_k(t) = d_k(t) / n(t) where only events of type k count as failures;
     * all other events are treated as censored.
     *
     * @param {Array} data - [{time, event}, ...]
     * @param {string} cause - Target cause
     * @returns {Array} [{time, hazard, cumHazard, atRisk, events}]
     */
    causeSpecificHazard(data, cause) {
        if (!cause) {
            throw new Error('Must specify a cause');
        }
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }

        for (let i = 0; i < data.length; i++) {
            if (data[i].time < 0) {
                throw new Error(`Negative time at index ${i}`);
            }
        }

        // Sort by time
        const sorted = [...data].sort((a, b) => a.time - b.time);

        // Unique event times for the target cause
        const causeEventTimes = [...new Set(
            sorted.filter(d => d.event === cause).map(d => d.time)
        )].sort((a, b) => a - b);

        let atRisk = sorted.length;
        let cumHazard = 0;
        const results = [];
        let processedIdx = 0;

        for (const t of causeEventTimes) {
            // Remove subjects with times before t (all types)
            while (processedIdx < sorted.length && sorted[processedIdx].time < t) {
                atRisk--;
                processedIdx++;
            }

            if (atRisk <= 0) break;

            // Count cause-specific events and all events at time t
            let causeEvents = 0;
            let allEventsAtT = 0;
            let tempIdx = processedIdx;
            while (tempIdx < sorted.length && sorted[tempIdx].time === t) {
                allEventsAtT++;
                if (sorted[tempIdx].event === cause) {
                    causeEvents++;
                }
                tempIdx++;
            }

            const hazard = causeEvents / atRisk;
            cumHazard += hazard;

            results.push({
                time: t,
                hazard: hazard,
                cumHazard: cumHazard,
                atRisk: atRisk,
                events: causeEvents
            });

            // Remove all subjects at time t from risk set
            atRisk -= allEventsAtT;
            processedIdx = tempIdx;
        }

        return results;
    }

    /**
     * z-quantile for given probability p.
     * P2-10: Delegates to module-level normalQuantile for consistency with normalCDF.
     */
    _zQuantile(p) {
        return normalQuantile(p);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.CompetingRisksEngine = CompetingRisksEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CompetingRisksEngine, normalCDF, normalQuantile };
}
