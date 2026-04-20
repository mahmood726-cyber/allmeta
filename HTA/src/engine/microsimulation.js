/**
 * Microsimulation Engine for HTA Models
 * Patient-level discrete-time state transition simulation
 *
 * Reference: Briggs et al. "Decision Modelling for Health Economic Evaluation"
 * TreeAge Pro equivalent: Patient-Level Simulation / Microsimulation
 *
 * Features:
 * - Individual patient simulation with trackers
 * - Time-in-state tracking (semi-Markov)
 * - Patient heterogeneity (baseline characteristics)
 * - Competing risks
 * - Event history recording
 * - PSA integration
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
    discount_rate_qalys: 0.03,
    currency: 'OMR'
};

function resolveWtpThresholds(settings) {
    if (OmanGuidanceRef?.resolveWtpThresholds) {
        return OmanGuidanceRef.resolveWtpThresholds(settings).thresholds;
    }
    const explicit = Array.isArray(settings?.wtp_thresholds) ? settings.wtp_thresholds : null;
    if (explicit && explicit.length) return explicit;
    return [20000, 30000, 50000];
}

function resolvePrimaryWtp(settings) {
    const thresholds = resolveWtpThresholds(settings);
    return thresholds[0];
}

class MicrosimulationEngine {
    constructor(options = {}) {
        this.options = {
            patients: 10000,
            seed: 12345,
            recordHistory: false,  // Full event history (memory intensive)
            recordSummary: true,   // Summary statistics only
            progressInterval: 1000,
            ...options
        };

        this.rng = typeof PCG32 !== 'undefined' ? new PCG32(this.options.seed) : null;
        this._rngState = this.options.seed;
        this.progressCallback = null;
        this.auditLogger = typeof getAuditLogger !== 'undefined' ? getAuditLogger() : null;
    }

    /**
     * Set progress callback
     * Supports property assignment: engine.onProgress = callback
     */
    set onProgress(callback) {
        this.progressCallback = callback;
    }

    get onProgress() {
        return this.progressCallback;
    }

    /**
     * LCG fallback PRNG (used when PCG32 is unavailable)
     */
    _seededRandom() {
        this._rngState = (this._rngState * 1103515245 + 12345) & 0x7fffffff;
        return this._rngState / 0x7fffffff || 1e-10;
    }

    /**
     * Generate random number [0, 1)
     */
    random() {
        if (this.rng) {
            // PCG32 uses nextDouble() for [0, 1) with 53-bit precision
            return this.rng.nextDouble();
        }
        return this._seededRandom();
    }

    /**
     * Sample from normal distribution (Box-Muller)
     */
    randomNormal(mean = 0, sd = 1) {
        const u1 = this.random();
        const u2 = this.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + sd * z;
    }

    /**
     * Sample from beta distribution
     */
    randomBeta(alpha, beta) {
        // Using inverse CDF approximation
        const u = this.random();
        return this.betaInverseCDF(u, alpha, beta);
    }

    /**
     * Beta inverse CDF (Newton-Raphson approximation)
     */
    betaInverseCDF(p, alpha, beta) {
        if (p <= 0) return 0;
        if (p >= 1) return 1;

        // Initial guess using normal approximation
        const mu = alpha / (alpha + beta);
        const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
        let x = Math.max(0.001, Math.min(0.999, mu + Math.sqrt(variance) * this.normalInverseCDF(p)));

        // Newton-Raphson iterations
        for (let i = 0; i < 20; i++) {
            const cdf = this.betaCDF(x, alpha, beta);
            const pdf = this.betaPDF(x, alpha, beta);
            if (Math.abs(pdf) < 1e-12) break;

            const newX = x - (cdf - p) / pdf;
            if (Math.abs(newX - x) < 1e-10) break;
            x = Math.max(0.001, Math.min(0.999, newX));
        }

        return x;
    }

    /**
     * Beta CDF (regularized incomplete beta)
     */
    betaCDF(x, alpha, beta) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        return this.incompleteBeta(x, alpha, beta);
    }

    /**
     * Beta PDF
     */
    betaPDF(x, alpha, beta) {
        if (x <= 0 || x >= 1) return 0;
        const B = this.betaFunction(alpha, beta);
        return Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1) / B;
    }

    /**
     * Beta function B(a,b) = Gamma(a)*Gamma(b)/Gamma(a+b)
     */
    betaFunction(a, b) {
        return Math.exp(this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b));
    }

    /**
     * Log gamma function (Lanczos approximation)
     */
    logGamma(x) {
        const g = 7;
        const c = [
            0.99999999999980993,
            676.5203681218851,
            -1259.1392167224028,
            771.32342877765313,
            -176.61502916214059,
            12.507343278686905,
            -0.13857109526572012,
            9.9843695780195716e-6,
            1.5056327351493116e-7
        ];

        if (x < 0.5) {
            return Math.log(Math.PI / Math.sin(Math.PI * x)) - this.logGamma(1 - x);
        }

        x -= 1;
        let a = c[0];
        const t = x + g + 0.5;
        for (let i = 1; i < g + 2; i++) {
            a += c[i] / (x + i);
        }

        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    }

    /**
     * Regularized incomplete beta function
     */
    incompleteBeta(x, a, b) {
        if (x === 0) return 0;
        if (x === 1) return 1;

        // Use continued fraction for better convergence
        const bt = Math.exp(
            this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
            a * Math.log(x) + b * Math.log(1 - x)
        );

        if (x < (a + 1) / (a + b + 2)) {
            return bt * this.betaContinuedFraction(x, a, b) / a;
        } else {
            return 1 - bt * this.betaContinuedFraction(1 - x, b, a) / b;
        }
    }

    /**
     * Continued fraction for incomplete beta
     */
    betaContinuedFraction(x, a, b) {
        const maxIter = 100;
        const eps = 1e-14;

        let qab = a + b;
        let qap = a + 1;
        let qam = a - 1;
        let c = 1;
        let d = 1 - qab * x / qap;

        if (Math.abs(d) < 1e-30) d = 1e-30;
        d = 1 / d;
        let h = d;

        for (let m = 1; m <= maxIter; m++) {
            const m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + aa / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            h *= d * c;

            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + aa / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const del = d * c;
            h *= del;

            if (Math.abs(del - 1) < eps) break;
        }

        return h;
    }

    /**
     * Normal inverse CDF (Acklam's approximation)
     */
    normalInverseCDF(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;

        const a = [
            -3.969683028665376e+01,
            2.209460984245205e+02,
            -2.759285104469687e+02,
            1.383577518672690e+02,
            -3.066479806614716e+01,
            2.506628277459239e+00
        ];
        const b = [
            -5.447609879822406e+01,
            1.615858368580409e+02,
            -1.556989798598866e+02,
            6.680131188771972e+01,
            -1.328068155288572e+01
        ];
        const c = [
            -7.784894002430293e-03,
            -3.223964580411365e-01,
            -2.400758277161838e+00,
            -2.549732539343734e+00,
            4.374664141464968e+00,
            2.938163982698783e+00
        ];
        const d = [
            7.784695709041462e-03,
            3.224671290700398e-01,
            2.445134137142996e+00,
            3.754408661907416e+00
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

    /**
     * Create a patient with baseline characteristics
     */
    createPatient(id, project, parameterValues) {
        const settings = project.settings || {};
        const startAge = settings.starting_age || 50;

        // Sample patient characteristics with heterogeneity
        const patient = {
            id: id,
            age: startAge + this.randomNormal(0, 5),  // Age variation
            sex: this.random() < 0.5 ? 'male' : 'female',
            currentState: null,
            timeInState: 0,
            totalTime: 0,
            alive: true,
            history: [],
            trackers: {},
            cumulativeCosts: 0,
            cumulativeQALYs: 0,
            cumulativeLYs: 0
        };

        // Set initial state
        const states = project.states || {};
        for (const [stateId, state] of Object.entries(states)) {
            if (state.initial_probability > 0) {
                if (this.random() < state.initial_probability) {
                    patient.currentState = stateId;
                    break;
                }
            }
        }

        // Default to first state if none selected
        if (!patient.currentState) {
            patient.currentState = Object.keys(states)[0];
        }

        // Initialize trackers
        patient.trackers = {
            stateVisits: {},
            timeInStates: {},
            transitionCounts: {}
        };

        for (const stateId of Object.keys(states)) {
            patient.trackers.stateVisits[stateId] = 0;
            patient.trackers.timeInStates[stateId] = 0;
        }

        patient.trackers.stateVisits[patient.currentState] = 1;

        return patient;
    }

    /**
     * Evaluate expression with patient-specific context
     * Uses safe ExpressionParser instead of Function() constructor
     */
    evaluateExpression(expr, parameterValues, patient, cycle) {
        if (typeof expr === 'number') return expr;
        if (typeof expr !== 'string') return 0;

        // Check if it's a simple parameter reference
        if (Object.hasOwn(parameterValues, expr)) {
            return parameterValues[expr];
        }

        // Build evaluation context with numeric values only
        const context = {
            ...parameterValues,
            _age: patient.age + cycle,
            _cycle: cycle,
            _time_in_state: patient.timeInState,
            _sex: patient.sex === 'male' ? 1 : 0
        };

        // Add tracker values
        for (const [key, val] of Object.entries(patient.trackers.stateVisits || {})) {
            context[`_visits_${key}`] = val;
        }
        for (const [key, val] of Object.entries(patient.trackers.timeInStates || {})) {
            context[`_time_${key}`] = val;
        }

        try {
            // Use safe ExpressionParser if available
            if (typeof ExpressionParser !== 'undefined' && ExpressionParser.evaluate) {
                const result = ExpressionParser.evaluate(expr, context);
                return typeof result === 'number' && isFinite(result) ? result : 0;
            }

            // Fallback: check if it's a simple identifier in context
            const trimmed = expr.trim();
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && Object.hasOwn(context, trimmed)) {
                return context[trimmed];
            }

            // Last resort: try to parse as a number
            const num = parseFloat(expr);
            return isNaN(num) ? 0 : num;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Get transition probabilities for current state
     */
    getTransitionProbabilities(patient, project, parameterValues, cycle) {
        const transitions = project.transitions || {};
        const currentState = patient.currentState;
        const probs = {};

        // Find all transitions from current state
        for (const [transId, trans] of Object.entries(transitions)) {
            if (trans.from === currentState) {
                let prob = this.evaluateExpression(trans.probability, parameterValues, patient, cycle);

                // Clamp probability
                prob = Math.max(0, Math.min(1, prob));
                probs[trans.to] = (probs[trans.to] || 0) + prob;
            }
        }

        // Normalize if sum > 1
        const sum = Object.values(probs).reduce((a, b) => a + b, 0);
        if (sum > 1) {
            for (const key of Object.keys(probs)) {
                probs[key] /= sum;
            }
        }

        return probs;
    }

    /**
     * Simulate one cycle for a patient
     */
    simulateCycle(patient, project, parameterValues, cycle, cycleLength) {
        if (!patient.alive) return;

        const states = project.states || {};
        const currentStateData = states[patient.currentState];

        // Get transition probabilities
        const probs = this.getTransitionProbabilities(patient, project, parameterValues, cycle);

        // Sample next state
        const u = this.random();
        let cumProb = 0;
        let nextState = patient.currentState;

        for (const [toState, prob] of Object.entries(probs)) {
            cumProb += prob;
            if (u < cumProb) {
                nextState = toState;
                break;
            }
        }

        // Calculate costs and utilities for this cycle
        let cycleCost = 0;
        let cycleUtility = 0;

        if (currentStateData) {
            cycleCost = this.evaluateExpression(currentStateData.cost, parameterValues, patient, cycle);
            cycleUtility = this.evaluateExpression(currentStateData.utility, parameterValues, patient, cycle);
        }

        // Apply discounting
        const settings = project.settings || {};
        const discountCosts = settings.discount_rate_costs ?? guidanceDefaults.discount_rate_costs;
        const discountQalys = settings.discount_rate_qalys ?? guidanceDefaults.discount_rate_qalys;
        const discountFactorCosts = 1 / Math.pow(1 + discountCosts, cycle * cycleLength);
        const discountFactorQalys = 1 / Math.pow(1 + discountQalys, cycle * cycleLength);

        // Half-cycle correction factor
        const timeHorizon = settings.time_horizon || 40;
        const maxCycles = Math.ceil(timeHorizon / cycleLength);
        const hccMethod = settings.half_cycle_correction || 'trapezoidal';
        let hccFactor = 1.0;

        if (hccMethod === 'trapezoidal') {
            // First and last cycles get half weight
            if (cycle === 0 || cycle === maxCycles - 1 || !patient.alive) {
                hccFactor = 0.5;
            }
        } else if (hccMethod === 'start') {
            if (cycle === 0) {
                hccFactor = 0.5;
            }
        } else if (hccMethod === 'end') {
            if (cycle === maxCycles - 1 || !patient.alive) {
                hccFactor = 0.5;
            }
        }
        // 'none' - no correction applied (hccFactor stays 1.0)

        // Accumulate outcomes (pro-rated by cycle length and half-cycle correction)
        patient.cumulativeCosts += cycleCost * cycleLength * discountFactorCosts * hccFactor;
        patient.cumulativeQALYs += cycleUtility * cycleLength * discountFactorQalys * hccFactor;
        patient.cumulativeLYs += cycleLength * discountFactorQalys * hccFactor;

        // Record history
        if (this.options.recordHistory) {
            patient.history.push({
                cycle: cycle,
                state: patient.currentState,
                nextState: nextState,
                cost: cycleCost,
                utility: cycleUtility,
                timeInState: patient.timeInState
            });
        }

        // Update state
        if (nextState !== patient.currentState) {
            // Transition occurred
            const transKey = `${patient.currentState}->${nextState}`;
            patient.trackers.transitionCounts[transKey] =
                (patient.trackers.transitionCounts[transKey] || 0) + 1;

            patient.currentState = nextState;
            patient.timeInState = 0;
            patient.trackers.stateVisits[nextState] =
                (patient.trackers.stateVisits[nextState] || 0) + 1;
        } else {
            patient.timeInState += cycleLength;
        }

        // Update time in state tracker
        patient.trackers.timeInStates[patient.currentState] =
            (patient.trackers.timeInStates[patient.currentState] || 0) + cycleLength;

        // Check if absorbing state
        const nextStateData = states[nextState];
        if (nextStateData?.type === 'absorbing') {
            patient.alive = false;
        }

        // Update patient age and total time
        patient.age += cycleLength;
        patient.totalTime += cycleLength;
    }

    /**
     * Run microsimulation for a single patient
     */
    simulatePatient(patientId, project, parameterValues) {
        const settings = project.settings || {};
        const timeHorizon = settings.time_horizon || 40;
        const cycleLength = settings.cycle_length || 1;
        const maxCycles = Math.ceil(timeHorizon / cycleLength);

        const patient = this.createPatient(patientId, project, parameterValues);

        for (let cycle = 0; cycle < maxCycles && patient.alive; cycle++) {
            this.simulateCycle(patient, project, parameterValues, cycle, cycleLength);
        }

        return patient;
    }

    /**
     * Run full microsimulation
     * Supports two call signatures:
     * 1. run(project, parameterOverrides) - single override object
     * 2. run(project, intOverrides, compOverrides) - intervention and comparator overrides
     */
    async run(project, arg2 = {}, arg3 = null) {
        const startTime = performance.now();
        const numPatients = this.options.patients;

        // Detect call signature and build combined parameter overrides
        let parameterOverrides = {};
        if (arg3 !== null && typeof arg3 === 'object') {
            // Called with (project, intOverrides, compOverrides)
            // Merge intervention overrides (they take priority for intervention arm)
            parameterOverrides = { ...arg2 };
        } else {
            // Called with (project, parameterOverrides)
            parameterOverrides = arg2 || {};
        }

        // Build parameter values
        const parameterValues = {};
        const params = project.parameters || {};

        for (const [paramId, param] of Object.entries(params)) {
            parameterValues[paramId] = parameterOverrides[paramId] ?? param.value;
        }

        // Apply strategy overrides
        for (const [key, value] of Object.entries(parameterOverrides)) {
            if (typeof value === 'string' && Object.hasOwn(parameterValues, value)) {
                parameterValues[key] = parameterValues[value];
            } else if (typeof value === 'number') {
                parameterValues[key] = value;
            }
        }

        // Results storage
        const results = {
            patients: [],
            summary: {
                n: numPatients,
                mean_costs: 0,
                mean_qalys: 0,
                mean_lys: 0,
                sd_costs: 0,
                sd_qalys: 0,
                median_survival: 0
            },
            stateOccupancy: {},
            transitionCounts: {}
        };

        // Initialize state occupancy tracking
        const states = project.states || {};
        for (const stateId of Object.keys(states)) {
            results.stateOccupancy[stateId] = [];
        }

        // Run simulation for each patient
        let totalCosts = 0, totalQALYs = 0, totalLYs = 0;
        const costValues = [], qalyValues = [], lyValues = [];

        for (let i = 0; i < numPatients; i++) {
            const patient = this.simulatePatient(i, project, parameterValues);

            // Store summary (not full patient data to save memory)
            if (this.options.recordSummary) {
                results.patients.push({
                    id: patient.id,
                    finalState: patient.currentState,
                    totalTime: patient.totalTime,
                    costs: patient.cumulativeCosts,
                    qalys: patient.cumulativeQALYs,
                    lys: patient.cumulativeLYs
                });
            }

            // Accumulate
            totalCosts += patient.cumulativeCosts;
            totalQALYs += patient.cumulativeQALYs;
            totalLYs += patient.cumulativeLYs;

            costValues.push(patient.cumulativeCosts);
            qalyValues.push(patient.cumulativeQALYs);
            lyValues.push(patient.cumulativeLYs);

            // Aggregate transition counts
            for (const [trans, count] of Object.entries(patient.trackers.transitionCounts)) {
                results.transitionCounts[trans] = (results.transitionCounts[trans] || 0) + count;
            }

            // Progress callback
            if (this.progressCallback && (i + 1) % this.options.progressInterval === 0) {
                await this.progressCallback(i + 1, numPatients);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Calculate summary statistics
        results.summary.mean_costs = totalCosts / numPatients;
        results.summary.mean_qalys = totalQALYs / numPatients;
        results.summary.mean_lys = totalLYs / numPatients;

        // Standard deviations
        const meanCost = results.summary.mean_costs;
        const meanQaly = results.summary.mean_qalys;

        let sumSqCosts = 0, sumSqQalys = 0;
        for (let i = 0; i < numPatients; i++) {
            sumSqCosts += (costValues[i] - meanCost) ** 2;
            sumSqQalys += (qalyValues[i] - meanQaly) ** 2;
        }

        results.summary.sd_costs = Math.sqrt(sumSqCosts / (numPatients - 1));
        results.summary.sd_qalys = Math.sqrt(sumSqQalys / (numPatients - 1));

        // Confidence intervals (95%)
        const se_costs = results.summary.sd_costs / Math.sqrt(numPatients);
        const se_qalys = results.summary.sd_qalys / Math.sqrt(numPatients);
        const z = this.normalInverseCDF(0.975);

        results.summary.ci_costs_lower = results.summary.mean_costs - z * se_costs;
        results.summary.ci_costs_upper = results.summary.mean_costs + z * se_costs;
        results.summary.ci_qalys_lower = results.summary.mean_qalys - z * se_qalys;
        results.summary.ci_qalys_upper = results.summary.mean_qalys + z * se_qalys;

        // Median survival (from LY distribution)
        lyValues.sort((a, b) => a - b);
        results.summary.median_survival = lyValues[Math.floor(numPatients / 2)];

        // Percentiles
        results.summary.p25_lys = lyValues[Math.floor(numPatients * 0.25)];
        results.summary.p75_lys = lyValues[Math.floor(numPatients * 0.75)];

        results.computation_time_ms = performance.now() - startTime;
        results.seed = this.options.seed;

        // Log to audit
        if (this.auditLogger) {
            this.auditLogger.info('microsimulation', 'Microsimulation completed', {
                patients: numPatients,
                mean_costs: results.summary.mean_costs,
                mean_qalys: results.summary.mean_qalys,
                computation_time_ms: results.computation_time_ms
            });
        }

        return results;
    }

    /**
     * Run microsimulation with PSA (outer loop PSA, inner loop patients)
     */
    async runWithPSA(project, intOverrides = {}, compOverrides = {}, psaOptions = {}) {
        const iterations = psaOptions.iterations || 1000;
        const patientsPerIteration = psaOptions.patientsPerIteration || 1000;
        const settings = project.settings || {};
        const wtpThresholds = resolveWtpThresholds(settings);
        const primaryWtp = resolvePrimaryWtp(settings);

        const results = {
            iterations: iterations,
            patientsPerIteration: patientsPerIteration,
            intervention: { costs: [], qalys: [] },
            comparator: { costs: [], qalys: [] },
            incremental: { costs: [], qalys: [], nmb: [] },
            summary: {},
            wtp_thresholds: wtpThresholds,
            primary_wtp: primaryWtp
        };

        const params = project.parameters || {};

        for (let iter = 0; iter < iterations; iter++) {
            // Sample parameters for this iteration
            const sampledParams = {};
            for (const [paramId, param] of Object.entries(params)) {
                if (param.distribution) {
                    sampledParams[paramId] = this.sampleDistribution(param.distribution, param.value);
                } else {
                    sampledParams[paramId] = param.value;
                }
            }

            // Run microsim for intervention
            this.options.patients = patientsPerIteration;
            const intParams = { ...sampledParams };
            for (const [key, value] of Object.entries(intOverrides)) {
                if (typeof value === 'string' && Object.hasOwn(sampledParams, value)) {
                    intParams[key] = sampledParams[value];
                }
            }

            const intResults = await this.run(project, intParams);
            results.intervention.costs.push(intResults.summary.mean_costs);
            results.intervention.qalys.push(intResults.summary.mean_qalys);

            // Run microsim for comparator
            const compParams = { ...sampledParams };
            for (const [key, value] of Object.entries(compOverrides)) {
                if (typeof value === 'string' && Object.hasOwn(sampledParams, value)) {
                    compParams[key] = sampledParams[value];
                }
            }

            const compResults = await this.run(project, compParams);
            results.comparator.costs.push(compResults.summary.mean_costs);
            results.comparator.qalys.push(compResults.summary.mean_qalys);

            // Incremental
            const incCost = intResults.summary.mean_costs - compResults.summary.mean_costs;
            const incQaly = intResults.summary.mean_qalys - compResults.summary.mean_qalys;
            results.incremental.costs.push(incCost);
            results.incremental.qalys.push(incQaly);
            results.incremental.nmb.push(incQaly * primaryWtp - incCost);

            // Progress
            if (this.progressCallback) {
                await this.progressCallback(iter + 1, iterations);
            }
        }

        // Summary statistics
        const meanIncCost = results.incremental.costs.reduce((a, b) => a + b, 0) / iterations;
        const meanIncQaly = results.incremental.qalys.reduce((a, b) => a + b, 0) / iterations;
        const probCE = {};
        for (const wtp of wtpThresholds) {
            let ceCount = 0;
            for (let i = 0; i < iterations; i++) {
                const incCost = results.incremental.costs[i];
                const incQaly = results.incremental.qalys[i];
                if (incQaly * wtp - incCost >= 0) ceCount++;
            }
            probCE[wtp] = ceCount / iterations;
        }
        const primaryProb = probCE[primaryWtp];

        results.summary = {
            mean_incremental_costs: meanIncCost,
            mean_incremental_qalys: meanIncQaly,
            mean_icer: meanIncQaly !== 0 ? meanIncCost / meanIncQaly : Infinity,
            prob_ce: probCE,
            wtp_thresholds: wtpThresholds,
            primary_wtp: primaryWtp,
            prob_ce_primary: primaryProb,
            prob_ce_30k: primaryProb
        };

        return results;
    }

    /**
     * Sample from distribution
     */
    sampleDistribution(dist, baseValue) {
        const type = dist.type?.toLowerCase();

        switch (type) {
            case 'beta':
                return this.randomBeta(dist.alpha || 10, dist.beta || 10);

            case 'gamma': {
                const mean = dist.mean || baseValue;
                const se = dist.se || mean * 0.1;
                const shape = (mean / se) ** 2;
                const scale = (se ** 2) / mean;
                return this.randomGamma(shape, scale);
            }

            case 'normal':
                return this.randomNormal(dist.mean || baseValue, dist.sd || baseValue * 0.1);

            case 'lognormal': {
                const mu = dist.meanlog || Math.log(baseValue);
                const sigma = dist.sdlog || 0.2;
                return Math.exp(this.randomNormal(mu, sigma));
            }

            default:
                return baseValue;
        }
    }

    /**
     * Sample from gamma distribution
     */
    randomGamma(shape, scale) {
        // Marsaglia and Tsang's method
        if (shape < 1) {
            return this.randomGamma(shape + 1, scale) * Math.pow(this.random(), 1 / shape);
        }

        const d = shape - 1/3;
        const c = 1 / Math.sqrt(9 * d);

        while (true) {
            let x, v;
            do {
                x = this.randomNormal(0, 1);
                v = 1 + c * x;
            } while (v <= 0);

            v = v * v * v;
            const u = this.random();

            if (u < 1 - 0.0331 * (x * x) * (x * x)) {
                return d * v * scale;
            }

            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                return d * v * scale;
            }
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MicrosimulationEngine = MicrosimulationEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MicrosimulationEngine };
}
