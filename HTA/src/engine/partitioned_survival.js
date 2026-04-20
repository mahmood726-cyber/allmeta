/**
 * Partitioned Survival Analysis Engine
 * Common model structure for oncology cost-effectiveness analysis
 *
 * Reference: NICE DSU TSD 14, TSD 19
 *
 * Features:
 * - Three-state model: PFS, Progressed, Dead
 * - Parametric survival curves (Weibull, log-normal, log-logistic, exponential, Gompertz)
 * - Treatment effect modifiers (hazard ratios)
 * - Treatment effect waning
 * - Background mortality adjustment
 * - Extrapolation validation
 */

class PartitionedSurvivalEngine {
    constructor(options = {}) {
        this.options = {
            tolerance: 1e-9,
            maxCycles: 10000,
            ...options
        };
        this.lifeTable = typeof LifeTable !== 'undefined' ? new LifeTable() : null;
    }

    /**
     * Run partitioned survival model
     * @param {Object} project - HTA project with PSM configuration
     * @param {Object} overrides - Parameter overrides
     * @returns {Object} Results
     */
    run(project, overrides = {}) {
        const startTime = performance.now();
        const settings = this.getSettings(project);
        const parameters = this.resolveParameters(project.parameters, overrides);

        // Get survival functions
        const osSurvival = this.buildSurvivalFunction(
            parameters.os_distribution || 'weibull',
            parameters.os_params || { scale: 24, shape: 1.2 },
            parameters.os_hr || 1.0
        );

        const pfsSurvival = this.buildSurvivalFunction(
            parameters.pfs_distribution || 'weibull',
            parameters.pfs_params || { scale: 12, shape: 1.0 },
            parameters.pfs_hr || 1.0
        );

        // Determine cycles
        const cycles = Math.min(
            Math.ceil(settings.time_horizon / settings.cycle_length),
            this.options.maxCycles
        );

        // Initialize accumulators
        const costAccum = new KahanSum();
        const qalyAccum = new KahanSum();
        const lyAccum = new KahanSum();

        // Store trace
        const trace = {
            cycles: [],
            time: [],
            pfs: [],
            progressed: [],
            dead: [],
            os: []
        };

        // Cost and utility parameters
        const cPFS = parameters.c_pfs || 0;
        const cProgressed = parameters.c_progressed || 0;
        const cDeath = parameters.c_death || 0;
        const uPFS = parameters.u_pfs || 1;
        const uProgressed = parameters.u_progressed || 0.7;

        // Treatment effect waning
        const waningStart = parameters.waning_start_year || Infinity;
        const waningDuration = parameters.waning_duration || 5;

        // Run simulation
        for (let cycle = 0; cycle <= cycles; cycle++) {
            const time = cycle * settings.cycle_length;
            const age = (settings.starting_age || 60) + time;

            // Calculate survival probabilities at this time point
            let osProb = osSurvival(time);
            let pfsProb = pfsSurvival(time);

            // Apply treatment effect waning if applicable
            if (time > waningStart) {
                const waningProgress = Math.min(1, (time - waningStart) / waningDuration);
                const hr = parameters.os_hr || 1.0;
                const effectiveHR = hr + waningProgress * (1 - hr);
                // Recalculate OS with waning
                osProb = this.buildSurvivalFunction(
                    parameters.os_distribution || 'weibull',
                    parameters.os_params || { scale: 24, shape: 1.2 },
                    effectiveHR
                )(time);
            }

            // Apply background mortality constraint
            if (this.lifeTable && parameters.apply_background_mortality) {
                const bgSurvival = this.lifeTable.getSurvival(
                    settings.starting_age || 60,
                    age,
                    parameters.sex || 'male'
                );
                osProb = Math.min(osProb, bgSurvival);
            }

            // Ensure PFS <= OS
            pfsProb = Math.min(pfsProb, osProb);

            // Calculate state occupancies
            const dead = 1 - osProb;
            const progressed = osProb - pfsProb;
            const pfs = pfsProb;

            // Record trace
            trace.cycles.push(cycle);
            trace.time.push(time);
            trace.pfs.push(pfs);
            trace.progressed.push(progressed);
            trace.dead.push(dead);
            trace.os.push(osProb);

            // Calculate outcomes (half-cycle correction)
            let hccFactor = 1.0;
            if (settings.half_cycle_correction === 'trapezoidal') {
                if (cycle === 0 || cycle === cycles) {
                    hccFactor = 0.5;
                }
            }

            // Discounting
            const discountCost = this.getDiscountFactor(cycle, settings.cycle_length, settings.discount_rate_costs);
            const discountQaly = this.getDiscountFactor(cycle, settings.cycle_length, settings.discount_rate_qalys);

            // Costs
            const cycleCost = (pfs * cPFS + progressed * cProgressed) * settings.cycle_length * hccFactor;
            costAccum.add(cycleCost * discountCost);

            // Death costs (one-time at transition)
            if (cycle > 0) {
                const prevDead = trace.dead[cycle - 1] || 0;
                const newDeaths = dead - prevDead;
                if (newDeaths > 0) {
                    costAccum.add(newDeaths * cDeath * discountCost);
                }
            }

            // QALYs
            const cycleQaly = (pfs * uPFS + progressed * uProgressed) * settings.cycle_length * hccFactor;
            qalyAccum.add(cycleQaly * discountQaly);

            // Life years
            const cycleLY = osProb * settings.cycle_length * hccFactor;
            lyAccum.add(cycleLY * discountQaly);
        }

        const computationTime = Math.round(performance.now() - startTime);

        return {
            total_costs: costAccum.total(),
            total_qalys: qalyAccum.total(),
            life_years: lyAccum.total(),
            cycles: cycles,
            trace: trace,
            computation_time_ms: computationTime,
            extrapolation_info: this.getExtrapolationInfo(osSurvival, pfsSurvival, settings)
        };
    }

    /**
     * Build survival function from distribution and parameters
     */
    buildSurvivalFunction(distribution, params, hr = 1.0) {
        switch (distribution.toLowerCase()) {
            case 'weibull':
                return (t) => this.weibullSurvival(t, params.scale, params.shape, hr);

            case 'exponential':
                return (t) => this.exponentialSurvival(t, params.rate, hr);

            case 'lognormal':
                return (t) => this.lognormalSurvival(t, params.meanlog, params.sdlog, hr);

            case 'loglogistic':
                return (t) => this.loglogisticSurvival(t, params.scale, params.shape, hr);

            case 'gompertz':
                return (t) => this.gompertzSurvival(t, params.shape, params.rate, hr);

            case 'generalized_gamma':
                return (t) => this.genGammaSurvival(t, params.mu, params.sigma, params.Q, hr);

            default:
                // Unknown distribution, falling back to Weibull
                return (t) => this.weibullSurvival(t, params.scale || 24, params.shape || 1, hr);
        }
    }

    /**
     * Weibull survival function
     * S(t) = exp(-(t/scale)^shape)
     */
    weibullSurvival(t, scale, shape, hr = 1.0) {
        if (t <= 0) return 1;
        // HR applied to hazard: h(t) = h0(t) * HR
        // S(t) = S0(t)^HR
        return Math.pow(Math.exp(-Math.pow(t / scale, shape)), hr);
    }

    /**
     * Exponential survival function
     * S(t) = exp(-rate * t)
     */
    exponentialSurvival(t, rate, hr = 1.0) {
        if (t <= 0) return 1;
        return Math.exp(-rate * hr * t);
    }

    /**
     * Log-normal survival function
     */
    lognormalSurvival(t, meanlog, sdlog, hr = 1.0) {
        if (t <= 0) return 1;

        // For AFT: T* = T / exp(log(HR)/sigma) ≈ HR applied via time scaling
        const logT = Math.log(t);
        const z = (logT - meanlog) / sdlog;

        // Standard normal CDF approximation
        const cdf = this.normalCDF(z);

        // Survival = 1 - CDF, adjusted for HR
        const baseSurvival = 1 - cdf;
        return Math.pow(baseSurvival, hr);
    }

    /**
     * Log-logistic survival function
     * S(t) = 1 / (1 + (t/scale)^shape)
     */
    loglogisticSurvival(t, scale, shape, hr = 1.0) {
        if (t <= 0) return 1;
        const baseSurvival = 1 / (1 + Math.pow(t / scale, shape));
        return Math.pow(baseSurvival, hr);
    }

    /**
     * Gompertz survival function
     * S(t) = exp(-(rate/shape) * (exp(shape*t) - 1))
     */
    gompertzSurvival(t, shape, rate, hr = 1.0) {
        if (t <= 0) return 1;
        if (Math.abs(shape) < 1e-10) {
            // Approaches exponential when shape → 0
            return Math.exp(-rate * hr * t);
        }
        const baseSurvival = Math.exp(-(rate / shape) * (Math.exp(shape * t) - 1));
        return Math.pow(baseSurvival, hr);
    }

    /**
     * Generalized gamma survival function (3-parameter)
     */
    genGammaSurvival(t, mu, sigma, Q, hr = 1.0) {
        if (t <= 0) return 1;

        // Convert to standard parametrization
        const gamma = Math.abs(Q);
        const logT = Math.log(t);
        const w = (logT - mu) / sigma;

        let cdf;
        if (Q > 0) {
            const u = Math.exp(gamma * w);
            cdf = this.gammaIncompleteCDF(1 / (Q * Q), u / (Q * Q));
        } else if (Q < 0) {
            const u = Math.exp(-gamma * w);
            cdf = 1 - this.gammaIncompleteCDF(1 / (Q * Q), u / (Q * Q));
        } else {
            // Q = 0: log-normal
            cdf = this.normalCDF(w);
        }

        const baseSurvival = 1 - cdf;
        return Math.pow(Math.max(0, baseSurvival), hr);
    }

    /**
     * Normal CDF approximation
     */
    normalCDF(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return 0.5 * (1.0 + sign * y);
    }

    /**
     * Incomplete gamma CDF (regularized)
     */
    gammaIncompleteCDF(a, x) {
        if (x <= 0) return 0;
        if (x < a + 1) {
            // Series representation
            let sum = 1 / a;
            let term = sum;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-10) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
        } else {
            // Continued fraction
            return 1 - this.gammaIncompleteUpperCDF(a, x);
        }
    }

    /**
     * Upper incomplete gamma (for large x)
     */
    gammaIncompleteUpperCDF(a, x) {
        let b = x + 1 - a;
        let c = 1 / 1e-30;
        let d = 1 / b;
        let h = d;

        for (let i = 1; i <= 100; i++) {
            const an = -i * (i - a);
            b += 2;
            d = an * d + b;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = b + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1) < 1e-10) break;
        }

        return Math.exp(-x + a * Math.log(x) - this.logGamma(a)) * h;
    }

    /**
     * Log gamma function
     */
    logGamma(x) {
        const c = [76.18009173, -86.50532033, 24.01409822,
                   -1.231739516, 0.00120858003, -0.00000536382];
        let sum = 1.000000000190015;
        let y = x;

        for (let i = 0; i < 6; i++) {
            y += 1;
            sum += c[i] / y;
        }

        const tmp = x + 5.5;
        return -tmp + (x + 0.5) * Math.log(tmp) + Math.log(2.5066282746310005 * sum / x);
    }

    /**
     * Get settings with defaults
     */
    getSettings(project) {
        const s = project.settings || {};
        return {
            time_horizon: s.time_horizon || 40,
            cycle_length: s.cycle_length || 1/12, // Monthly by default for oncology
            discount_rate_costs: s.discount_rate_costs || 0.035,
            discount_rate_qalys: s.discount_rate_qalys || 0.035,
            half_cycle_correction: s.half_cycle_correction || 'trapezoidal',
            currency: s.currency || 'GBP',
            starting_age: s.starting_age || 60
        };
    }

    /**
     * Resolve parameters with overrides
     */
    resolveParameters(parameters, overrides) {
        const resolved = {};

        for (const [id, param] of Object.entries(parameters || {})) {
            if (id in overrides) {
                resolved[id] = overrides[id];
            } else if (typeof param === 'object' && param.value !== undefined) {
                resolved[id] = param.value;
            } else {
                resolved[id] = param;
            }
        }

        // Apply overrides
        for (const [id, value] of Object.entries(overrides)) {
            resolved[id] = value;
        }

        return resolved;
    }

    /**
     * Calculate discount factor
     */
    getDiscountFactor(cycle, cycleLength, rate) {
        if (rate <= 0) return 1;
        const time = cycle * cycleLength;
        return Math.pow(1 + rate, -time);
    }

    /**
     * Get extrapolation information
     */
    getExtrapolationInfo(osFn, pfsFn, settings) {
        const observedDuration = settings.observed_duration || 24; // months
        const extrapolationStart = observedDuration / 12; // years

        // Calculate statistics at key time points
        const timePoints = [1, 2, 5, 10, settings.time_horizon];
        const info = {
            observed_duration_years: extrapolationStart,
            time_horizon_years: settings.time_horizon,
            extrapolation_ratio: settings.time_horizon / extrapolationStart,
            survival_at_timepoints: {}
        };

        for (const t of timePoints) {
            if (t <= settings.time_horizon) {
                info.survival_at_timepoints[`${t}y`] = {
                    os: osFn(t),
                    pfs: pfsFn(t),
                    is_extrapolated: t > extrapolationStart
                };
            }
        }

        // Calculate median survival if possible
        info.median_os = this.findMedianSurvival(osFn, settings.time_horizon);
        info.median_pfs = this.findMedianSurvival(pfsFn, settings.time_horizon);

        // Calculate restricted mean survival time (RMST) at time horizon
        info.rmst_os = this.calculateRMST(osFn, settings.time_horizon, settings.cycle_length);
        info.rmst_pfs = this.calculateRMST(pfsFn, settings.time_horizon, settings.cycle_length);

        return info;
    }

    /**
     * Find median survival time (when S(t) = 0.5)
     */
    findMedianSurvival(survFn, maxTime) {
        // Binary search for S(t) = 0.5
        let lo = 0;
        let hi = maxTime;

        if (survFn(maxTime) > 0.5) {
            return null; // Median not reached within time horizon
        }

        for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            const s = survFn(mid);

            if (Math.abs(s - 0.5) < 0.001) {
                return mid;
            }

            if (s > 0.5) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        return (lo + hi) / 2;
    }

    /**
     * Calculate Restricted Mean Survival Time (area under curve)
     */
    calculateRMST(survFn, maxTime, cycleLength = 1/12) {
        const sum = new KahanSum();
        const steps = Math.ceil(maxTime / cycleLength);

        for (let i = 0; i <= steps; i++) {
            const t = i * cycleLength;
            const s = survFn(t);

            // Trapezoidal integration
            const weight = (i === 0 || i === steps) ? 0.5 : 1;
            sum.add(s * cycleLength * weight);
        }

        return sum.total();
    }

    /**
     * Run comparative analysis (intervention vs comparator)
     */
    runComparative(project, interventionParams = {}, comparatorParams = {}) {
        const intResults = this.run(project, interventionParams);
        const compResults = this.run(project, comparatorParams);

        const incCosts = intResults.total_costs - compResults.total_costs;
        const incQalys = intResults.total_qalys - compResults.total_qalys;
        const incLY = intResults.life_years - compResults.life_years;

        let icer = null;
        let dominance = 'none';

        if (incQalys > 0.001) {
            if (incCosts > 0) {
                icer = incCosts / incQalys;
            } else {
                dominance = 'dominant';
            }
        } else if (incQalys < -0.001) {
            if (incCosts > 0) {
                dominance = 'dominated';
            } else {
                icer = incCosts / incQalys;
            }
        }

        return {
            intervention: intResults,
            comparator: compResults,
            incremental: {
                costs: incCosts,
                qalys: incQalys,
                life_years: incLY,
                icer: icer,
                dominance: dominance,
                nmb_20k: incQalys * 20000 - incCosts,
                nmb_30k: incQalys * 30000 - incCosts,
                nmb_50k: incQalys * 50000 - incCosts
            }
        };
    }

    /**
     * Model selection - fit multiple distributions and compare
     */
    fitDistributions(kmData, distributions = ['weibull', 'lognormal', 'loglogistic', 'exponential', 'gompertz']) {
        // Note: Full fitting requires optimization - this provides structure
        // Actual fitting would need least squares or maximum likelihood

        const fits = {};

        for (const dist of distributions) {
            fits[dist] = {
                distribution: dist,
                parameters: this.initialGuess(dist, kmData),
                aic: null,
                bic: null,
                visual_fit: null
            };
        }

        return {
            distributions: fits,
            recommendation: 'Visual inspection and clinical plausibility should guide selection. NICE prefers the simplest adequate model.'
        };
    }

    /**
     * Initial parameter guess for distribution
     */
    initialGuess(distribution, kmData) {
        // Simple moment-based estimates
        const medianTime = kmData.median || 12;

        switch (distribution) {
            case 'weibull':
                return { scale: medianTime / Math.pow(Math.log(2), 1), shape: 1 };
            case 'exponential':
                return { rate: Math.log(2) / medianTime };
            case 'lognormal':
                return { meanlog: Math.log(medianTime), sdlog: 0.5 };
            case 'loglogistic':
                return { scale: medianTime, shape: 1.5 };
            case 'gompertz':
                return { shape: 0.1, rate: Math.log(2) / medianTime };
            default:
                return { scale: medianTime, shape: 1 };
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.PartitionedSurvivalEngine = PartitionedSurvivalEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PartitionedSurvivalEngine };
}
