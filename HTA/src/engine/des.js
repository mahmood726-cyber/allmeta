/**
 * Discrete Event Simulation (DES) Engine for HTA Artifact Standard v0.2
 *
 * Features:
 * - Event-driven simulation (not time-step based)
 * - Competing risks modeling
 * - Priority-based event queues
 * - Complex patient pathways
 * - Resource constraints (optional)
 * - Time-to-event from parametric distributions
 * - Patient-level heterogeneity
 * - Parallel pathway support
 * - Cost and QALY accumulation
 *
 * This provides capabilities similar to TreeAge Pro's DES module.
 */

class DiscreteEventSimulationEngine {
    constructor(options = {}) {
        this.options = {
            patients: 1000,
            seed: 12345,
            maxTime: 100,          // Maximum simulation time (years)
            timeUnit: 'years',
            recordHistory: false,   // Record full event history
            progressInterval: 100,
            ...options
        };

        this.rng = new PCG32(this.options.seed);
        this.eventQueue = new PriorityQueue();
        this.resources = new Map();
        this.statistics = new Map();
    }

    /**
     * Create a new patient entity
     */
    createPatient(id, attributes = {}) {
        return {
            id,
            createdAt: 0,
            currentTime: 0,
            state: 'initial',
            alive: true,
            attributes: { ...attributes },
            accumulators: {
                costs: 0,
                qalys: 0,
                lifeYears: 0
            },
            eventHistory: [],
            scheduledEvents: []
        };
    }

    /**
     * Schedule an event for a patient
     */
    scheduleEvent(patient, eventType, time, priority = 0, data = {}) {
        const event = {
            patientId: patient.id,
            type: eventType,
            time: time,
            priority: priority,
            data: data
        };

        this.eventQueue.enqueue(event, time, priority);
        patient.scheduledEvents.push(event);

        return event;
    }

    /**
     * Cancel a scheduled event
     */
    cancelEvent(patient, eventType) {
        patient.scheduledEvents = patient.scheduledEvents.filter(e => {
            if (e.type === eventType) {
                this.eventQueue.remove(e);
                return false;
            }
            return true;
        });
    }

    /**
     * Cancel all scheduled events for a patient
     */
    cancelAllEvents(patient) {
        for (const event of patient.scheduledEvents) {
            this.eventQueue.remove(event);
        }
        patient.scheduledEvents = [];
    }

    /**
     * Sample time-to-event from a distribution
     */
    sampleTimeToEvent(distribution, parameters, patient) {
        const u = this.rng.random();

        switch (distribution) {
            case 'exponential': {
                const rate = this.evaluateParameter(parameters.rate, patient);
                return -Math.log(1 - u) / rate;
            }

            case 'weibull': {
                const scale = this.evaluateParameter(parameters.scale, patient);
                const shape = this.evaluateParameter(parameters.shape, patient);
                return scale * Math.pow(-Math.log(1 - u), 1 / shape);
            }

            case 'lognormal': {
                const mu = this.evaluateParameter(parameters.mu, patient);
                const sigma = this.evaluateParameter(parameters.sigma, patient);
                const z = this.normalInverse(u);
                return Math.exp(mu + sigma * z);
            }

            case 'loglogistic': {
                const alpha = this.evaluateParameter(parameters.alpha, patient);
                const beta = this.evaluateParameter(parameters.beta, patient);
                return alpha * Math.pow(u / (1 - u), 1 / beta);
            }

            case 'gompertz': {
                const a = this.evaluateParameter(parameters.a, patient);
                const b = this.evaluateParameter(parameters.b, patient);
                return (1 / a) * Math.log(1 - (a / b) * Math.log(1 - u));
            }

            case 'gamma': {
                const shape = this.evaluateParameter(parameters.shape, patient);
                const scale = this.evaluateParameter(parameters.scale, patient);
                return this.sampleGamma(shape, scale);
            }

            case 'uniform': {
                const min = this.evaluateParameter(parameters.min, patient);
                const max = this.evaluateParameter(parameters.max, patient);
                return min + u * (max - min);
            }

            case 'fixed': {
                return this.evaluateParameter(parameters.time, patient);
            }

            case 'empirical': {
                // Sample from empirical KM curve
                const curve = parameters.survivalCurve;
                return this.sampleFromSurvivalCurve(curve, u);
            }

            default:
                throw new Error(`Unknown distribution: ${distribution}`);
        }
    }

    /**
     * Sample from gamma distribution using Marsaglia and Tsang's method
     */
    sampleGamma(shape, scale) {
        if (shape < 1) {
            const u = this.rng.random();
            return this.sampleGamma(1 + shape, scale) * Math.pow(u, 1 / shape);
        }

        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);

        while (true) {
            let x, v;
            do {
                x = this.normalInverse(this.rng.random());
                v = 1 + c * x;
            } while (v <= 0);

            v = v * v * v;
            const u = this.rng.random();

            if (u < 1 - 0.0331 * (x * x) * (x * x)) {
                return d * v * scale;
            }

            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                return d * v * scale;
            }
        }
    }

    /**
     * Inverse normal CDF (probit function)
     */
    normalInverse(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;

        const a = [
            -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00
        ];
        const b = [
            -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01,
            -1.328068155288572e+01
        ];
        const c = [
            -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00
        ];
        const d = [
            7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00
        ];

        const plow = 0.02425;
        const phigh = 1 - plow;
        let q, r;

        if (p < plow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                   ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        } else if (p <= phigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
                   (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
    }

    /**
     * Sample from empirical survival curve
     */
    sampleFromSurvivalCurve(curve, u) {
        // Binary search for time where S(t) = u
        const target = 1 - u; // Convert to survival probability
        let lo = 0, hi = curve.length - 1;

        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (curve[mid].survival > target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        // Linear interpolation
        if (lo === 0) return curve[0].time;
        const prev = curve[lo - 1];
        const curr = curve[lo];
        const frac = (prev.survival - target) / (prev.survival - curr.survival);
        return prev.time + frac * (curr.time - prev.time);
    }

    /**
     * Evaluate a parameter (can be constant, function, or patient-specific)
     */
    evaluateParameter(param, patient) {
        if (typeof param === 'function') {
            return param(patient);
        } else if (typeof param === 'object' && param.type === 'covariate') {
            const baseValue = param.base;
            let value = baseValue;
            for (const [attr, coef] of Object.entries(param.coefficients || {})) {
                value *= Math.exp(coef * (patient.attributes[attr] || 0));
            }
            return value;
        }
        return param;
    }

    /**
     * Define a model with states, events, and transitions
     */
    defineModel(modelDefinition) {
        this.model = {
            states: {},
            events: {},
            transitions: [],
            initialState: modelDefinition.initialState || 'initial',
            ...modelDefinition
        };

        // Process state definitions
        for (const [name, state] of Object.entries(modelDefinition.states || {})) {
            this.model.states[name] = {
                name,
                costPerTime: state.costPerTime || 0,
                utilityPerTime: state.utilityPerTime || 0,
                onEnter: state.onEnter || null,
                onExit: state.onExit || null,
                scheduledEvents: state.scheduledEvents || [],
                ...state
            };
        }

        // Process event definitions
        for (const [name, event] of Object.entries(modelDefinition.events || {})) {
            this.model.events[name] = {
                name,
                handler: event.handler || null,
                cost: event.cost || 0,
                utilityDecrement: event.utilityDecrement || 0,
                ...event
            };
        }

        return this.model;
    }

    /**
     * Initialize a patient in the model
     */
    initializePatient(patient, parameterValues = {}) {
        patient.state = this.model.initialState;
        patient.parameterValues = parameterValues;

        // Enter initial state
        const initialState = this.model.states[patient.state];
        if (initialState) {
            this.enterState(patient, initialState);
        }

        return patient;
    }

    /**
     * Enter a state (schedule state-specific events)
     */
    enterState(patient, state) {
        patient.state = state.name;
        patient.stateEntryTime = patient.currentTime;

        // Execute onEnter callback
        if (state.onEnter) {
            state.onEnter(patient, this);
        }

        // Record history
        if (this.options.recordHistory) {
            patient.eventHistory.push({
                time: patient.currentTime,
                type: 'state_entry',
                state: state.name
            });
        }

        // Schedule events defined for this state
        for (const eventDef of state.scheduledEvents || []) {
            const timeToEvent = this.sampleTimeToEvent(
                eventDef.distribution,
                eventDef.parameters,
                patient
            );

            this.scheduleEvent(
                patient,
                eventDef.event,
                patient.currentTime + timeToEvent,
                eventDef.priority || 0,
                eventDef.data || {}
            );
        }
    }

    /**
     * Exit a state
     */
    exitState(patient, state) {
        // Accumulate costs and QALYs for time in state
        const timeInState = patient.currentTime - patient.stateEntryTime;

        patient.accumulators.lifeYears += timeInState;

        const costRate = this.evaluateParameter(state.costPerTime, patient);
        const utilityRate = this.evaluateParameter(state.utilityPerTime, patient);

        patient.accumulators.costs += costRate * timeInState;
        patient.accumulators.qalys += utilityRate * timeInState;

        // Execute onExit callback
        if (state.onExit) {
            state.onExit(patient, this);
        }

        // Cancel events specific to this state (optional based on model definition)
    }

    /**
     * Handle an event
     */
    handleEvent(patient, event) {
        // Record history
        if (this.options.recordHistory) {
            patient.eventHistory.push({
                time: event.time,
                type: event.type,
                data: event.data
            });
        }

        // Get event definition
        const eventDef = this.model.events[event.type];
        if (!eventDef) {
            return;
        }

        // Apply immediate costs and utility decrements
        if (eventDef.cost) {
            patient.accumulators.costs += this.evaluateParameter(eventDef.cost, patient);
        }
        if (eventDef.utilityDecrement) {
            patient.accumulators.qalys -= this.evaluateParameter(eventDef.utilityDecrement, patient);
        }

        // Execute event handler
        if (eventDef.handler) {
            eventDef.handler(patient, event, this);
        }

        // Check for transitions triggered by this event
        for (const transition of this.model.transitions) {
            if (transition.trigger === event.type && transition.from === patient.state) {
                // Check condition if specified
                if (transition.condition && !transition.condition(patient)) {
                    continue;
                }

                // Perform transition
                this.performTransition(patient, transition);
                break;
            }
        }
    }

    /**
     * Perform a state transition
     */
    performTransition(patient, transition) {
        const fromState = this.model.states[transition.from];
        const toState = this.model.states[transition.to];

        if (!toState) {
            return;
        }

        // Exit current state
        if (fromState) {
            this.exitState(patient, fromState);
        }

        // Apply transition costs/effects
        if (transition.cost) {
            patient.accumulators.costs += this.evaluateParameter(transition.cost, patient);
        }

        // Cancel events from previous state if specified
        if (transition.cancelEvents) {
            for (const eventType of transition.cancelEvents) {
                this.cancelEvent(patient, eventType);
            }
        }

        // Enter new state
        this.enterState(patient, toState);

        // Check for terminal state
        if (toState.terminal) {
            patient.alive = false;
            this.cancelAllEvents(patient);
        }
    }

    /**
     * Run simulation for a single patient
     */
    simulatePatient(patient) {
        while (patient.alive && patient.currentTime < this.options.maxTime) {
            // Get next event for this patient
            const event = this.getNextPatientEvent(patient);

            if (!event || event.time > this.options.maxTime) {
                // No more events, advance to max time
                patient.currentTime = this.options.maxTime;
                break;
            }

            // Advance time to event
            patient.currentTime = event.time;

            // Remove from scheduled events
            const idx = patient.scheduledEvents.findIndex(e => e === event);
            if (idx >= 0) patient.scheduledEvents.splice(idx, 1);

            // Handle the event
            this.handleEvent(patient, event);
        }

        // Final state exit to accumulate remaining costs/QALYs
        if (patient.alive) {
            const currentState = this.model.states[patient.state];
            if (currentState) {
                this.exitState(patient, currentState);
            }
        }

        return patient;
    }

    /**
     * Get next event for a specific patient
     */
    getNextPatientEvent(patient) {
        // Find earliest scheduled event for this patient
        let earliest = null;
        for (const event of patient.scheduledEvents) {
            if (!earliest || event.time < earliest.time) {
                earliest = event;
            }
        }
        return earliest;
    }

    /**
     * Run full simulation
     */
    async run(modelDefinition, parameterGenerator = null, options = {}) {
        const {
            discountRate = 0.035,
            perspective = 'healthcare',
            onProgress = null
        } = options;

        this.defineModel(modelDefinition);
        this.rng = new PCG32(this.options.seed);

        const results = {
            patients: [],
            summary: {
                totalCosts: 0,
                totalQALYs: 0,
                totalLYs: 0,
                meanCost: 0,
                meanQALY: 0,
                meanLY: 0,
                discountedCosts: 0,
                discountedQALYs: 0
            },
            stateStatistics: {},
            eventStatistics: {}
        };

        // Initialize state statistics
        for (const stateName of Object.keys(this.model.states)) {
            results.stateStatistics[stateName] = {
                entries: 0,
                totalTime: 0,
                meanTime: 0
            };
        }

        // Initialize event statistics
        for (const eventName of Object.keys(this.model.events)) {
            results.eventStatistics[eventName] = {
                count: 0,
                meanTime: 0,
                totalTime: 0
            };
        }

        // Run simulation for each patient
        for (let i = 0; i < this.options.patients; i++) {
            // Generate patient attributes
            const attributes = parameterGenerator ? parameterGenerator(i) : {};

            // Create and initialize patient
            const patient = this.createPatient(i, attributes);
            this.initializePatient(patient);

            // Simulate
            this.simulatePatient(patient);

            // Apply discounting
            const discountedCosts = this.applyDiscounting(
                patient.accumulators.costs,
                patient.accumulators.lifeYears,
                discountRate
            );
            const discountedQALYs = this.applyDiscounting(
                patient.accumulators.qalys,
                patient.accumulators.lifeYears,
                discountRate
            );

            // Accumulate results
            results.summary.totalCosts += patient.accumulators.costs;
            results.summary.totalQALYs += patient.accumulators.qalys;
            results.summary.totalLYs += patient.accumulators.lifeYears;
            results.summary.discountedCosts += discountedCosts;
            results.summary.discountedQALYs += discountedQALYs;

            // Update state statistics from history
            if (this.options.recordHistory) {
                this.updateStatisticsFromHistory(patient, results);
            }

            // Store patient results
            if (this.options.recordHistory) {
                results.patients.push({
                    id: patient.id,
                    attributes: patient.attributes,
                    accumulators: patient.accumulators,
                    history: patient.eventHistory
                });
            }

            // Report progress
            if (onProgress && i % this.options.progressInterval === 0) {
                onProgress({
                    completed: i,
                    total: this.options.patients,
                    percent: (i / this.options.patients) * 100
                });
            }
        }

        // Calculate means
        const n = this.options.patients;
        results.summary.meanCost = results.summary.totalCosts / n;
        results.summary.meanQALY = results.summary.totalQALYs / n;
        results.summary.meanLY = results.summary.totalLYs / n;
        results.summary.meanDiscountedCost = results.summary.discountedCosts / n;
        results.summary.meanDiscountedQALY = results.summary.discountedQALYs / n;

        // Finalize statistics
        for (const [name, stats] of Object.entries(results.stateStatistics)) {
            if (stats.entries > 0) {
                stats.meanTime = stats.totalTime / stats.entries;
            }
        }

        for (const [name, stats] of Object.entries(results.eventStatistics)) {
            if (stats.count > 0) {
                stats.meanTime = stats.totalTime / stats.count;
            }
        }

        return results;
    }

    /**
     * Apply discounting (simplified continuous approach)
     */
    applyDiscounting(value, duration, rate) {
        if (rate === 0) return value;
        // Continuous discounting: PV = FV * (1 - e^(-r*t)) / (r*t)
        const factor = (1 - Math.exp(-rate * duration)) / (rate * duration);
        return value * factor;
    }

    /**
     * Update statistics from patient event history
     */
    updateStatisticsFromHistory(patient, results) {
        const stateEntries = {};

        for (const event of patient.eventHistory) {
            if (event.type === 'state_entry') {
                // Record entry time
                stateEntries[event.state] = event.time;
                results.stateStatistics[event.state].entries++;
            } else {
                // Record event occurrence
                if (results.eventStatistics[event.type]) {
                    results.eventStatistics[event.type].count++;
                    results.eventStatistics[event.type].totalTime += event.time;
                }
            }
        }

        // Calculate time in each state
        let lastState = this.model.initialState;
        let lastTime = 0;

        for (const event of patient.eventHistory) {
            if (event.type === 'state_entry') {
                if (lastState && results.stateStatistics[lastState]) {
                    results.stateStatistics[lastState].totalTime += event.time - lastTime;
                }
                lastState = event.state;
                lastTime = event.time;
            }
        }

        // Add time in final state
        if (lastState && results.stateStatistics[lastState]) {
            results.stateStatistics[lastState].totalTime += patient.currentTime - lastTime;
        }
    }

    /**
     * Run comparative analysis between strategies
     */
    async runComparison(strategies, baseOptions = {}) {
        const results = {};

        for (const [name, strategy] of Object.entries(strategies)) {
            // Reset RNG for each strategy to ensure comparability
            this.rng = new PCG32(this.options.seed);

            results[name] = await this.run(
                strategy.model,
                strategy.parameterGenerator,
                { ...baseOptions, ...strategy.options }
            );
        }

        // Calculate incremental values
        const strategyNames = Object.keys(strategies);
        if (strategyNames.length === 2) {
            const [ref, comp] = strategyNames;
            const refResults = results[ref].summary;
            const compResults = results[comp].summary;

            results.incremental = {
                incrementalCost: compResults.meanDiscountedCost - refResults.meanDiscountedCost,
                incrementalQALY: compResults.meanDiscountedQALY - refResults.meanDiscountedQALY,
                icer: (compResults.meanDiscountedCost - refResults.meanDiscountedCost) /
                      (compResults.meanDiscountedQALY - refResults.meanDiscountedQALY)
            };
        }

        return results;
    }

    /**
     * Run with PSA (outer loop for parameters, inner loop for patients)
     */
    async runWithPSA(modelDefinition, parameterSampler, psaOptions = {}) {
        const {
            iterations = 1000,
            wtp = [20000, 30000, 50000],
            discountRate = 0.035,
            onProgress = null
        } = psaOptions;

        const psaResults = {
            iterations: [],
            summary: {
                meanCost: { mean: 0, se: 0, ci: [] },
                meanQALY: { mean: 0, se: 0, ci: [] }
            },
            ceac: {},
            evpi: 0
        };

        let costSum = 0, qalySumm = 0;
        let costSqSum = 0, qalySqSum = 0;

        for (let i = 0; i < iterations; i++) {
            // Sample parameters for this iteration
            const parameterValues = parameterSampler(i);

            // Create parameter generator that uses sampled values
            const paramGenerator = (patientId) => ({
                ...parameterValues,
                patientId
            });

            // Run simulation with these parameters
            this.rng = new PCG32(this.options.seed + i);
            const result = await this.run(modelDefinition, paramGenerator, { discountRate });

            // Store iteration results
            psaResults.iterations.push({
                parameters: parameterValues,
                cost: result.summary.meanDiscountedCost,
                qaly: result.summary.meanDiscountedQALY
            });

            // Accumulate for means
            costSum += result.summary.meanDiscountedCost;
            qalySumm += result.summary.meanDiscountedQALY;
            costSqSum += result.summary.meanDiscountedCost ** 2;
            qalySqSum += result.summary.meanDiscountedQALY ** 2;

            if (onProgress && i % 10 === 0) {
                onProgress({
                    completed: i,
                    total: iterations,
                    percent: (i / iterations) * 100
                });
            }
        }

        // Calculate summary statistics
        const n = iterations;
        psaResults.summary.meanCost.mean = costSum / n;
        psaResults.summary.meanQALY.mean = qalySumm / n;

        const costVar = (costSqSum - costSum ** 2 / n) / (n - 1);
        const qalyVar = (qalySqSum - qalySumm ** 2 / n) / (n - 1);

        psaResults.summary.meanCost.se = Math.sqrt(costVar / n);
        psaResults.summary.meanQALY.se = Math.sqrt(qalyVar / n);

        // 95% CI
        const z = this.normalInverse(0.975);
        psaResults.summary.meanCost.ci = [
            psaResults.summary.meanCost.mean - z * psaResults.summary.meanCost.se,
            psaResults.summary.meanCost.mean + z * psaResults.summary.meanCost.se
        ];
        psaResults.summary.meanQALY.ci = [
            psaResults.summary.meanQALY.mean - z * psaResults.summary.meanQALY.se,
            psaResults.summary.meanQALY.mean + z * psaResults.summary.meanQALY.se
        ];

        return psaResults;
    }
}


/**
 * Priority Queue implementation for event scheduling
 */
class PriorityQueue {
    constructor() {
        this.items = [];
    }

    enqueue(element, time, priority = 0) {
        const item = { element, time, priority };
        let added = false;

        for (let i = 0; i < this.items.length; i++) {
            if (time < this.items[i].time ||
                (time === this.items[i].time && priority > this.items[i].priority)) {
                this.items.splice(i, 0, item);
                added = true;
                break;
            }
        }

        if (!added) {
            this.items.push(item);
        }
    }

    dequeue() {
        if (this.isEmpty()) return null;
        return this.items.shift().element;
    }

    peek() {
        if (this.isEmpty()) return null;
        return this.items[0].element;
    }

    remove(element) {
        const idx = this.items.findIndex(item => item.element === element);
        if (idx >= 0) {
            this.items.splice(idx, 1);
            return true;
        }
        return false;
    }

    isEmpty() {
        return this.items.length === 0;
    }

    size() {
        return this.items.length;
    }
}


/**
 * PCG32 Random Number Generator (if not already defined)
 */
if (typeof PCG32 === 'undefined') {
    class PCG32 {
        constructor(seed = Date.now()) {
            this.state = BigInt(seed);
            this.inc = BigInt(1442695040888963407);
            this.step();
        }

        step() {
            const oldState = this.state;
            this.state = oldState * BigInt(6364136223846793005) + this.inc;
            this.state = this.state & BigInt('0xFFFFFFFFFFFFFFFF');
            const xorshifted = ((oldState >> BigInt(18)) ^ oldState) >> BigInt(27);
            const rot = oldState >> BigInt(59);
            const result = (xorshifted >> rot) | (xorshifted << ((BigInt(-Number(rot)) & BigInt(31))));
            return Number(result & BigInt(0xFFFFFFFF)) >>> 0;
        }

        random() {
            return this.step() / 4294967296;
        }
    }

    if (typeof window !== 'undefined') {
        window.PCG32 = PCG32;
    }
}


/**
 * Helper: Create common DES model templates
 */
const DESTemplates = {
    /**
     * Simple disease progression model
     */
    diseaseProgression(config) {
        return {
            initialState: config.initialState || 'healthy',
            states: {
                healthy: {
                    costPerTime: config.costs?.healthy || 0,
                    utilityPerTime: config.utilities?.healthy || 1.0,
                    scheduledEvents: [
                        {
                            event: 'disease_onset',
                            distribution: config.onsetDistribution || 'weibull',
                            parameters: config.onsetParams || { scale: 10, shape: 1.5 }
                        }
                    ]
                },
                diseased: {
                    costPerTime: config.costs?.diseased || 5000,
                    utilityPerTime: config.utilities?.diseased || 0.7,
                    scheduledEvents: [
                        {
                            event: 'progression',
                            distribution: config.progressionDistribution || 'exponential',
                            parameters: config.progressionParams || { rate: 0.1 }
                        },
                        {
                            event: 'death',
                            distribution: config.deathDistribution || 'exponential',
                            parameters: config.deathParams || { rate: 0.05 }
                        }
                    ]
                },
                progressed: {
                    costPerTime: config.costs?.progressed || 15000,
                    utilityPerTime: config.utilities?.progressed || 0.4,
                    scheduledEvents: [
                        {
                            event: 'death',
                            distribution: config.terminalDistribution || 'weibull',
                            parameters: config.terminalParams || { scale: 2, shape: 1.2 }
                        }
                    ]
                },
                dead: {
                    terminal: true,
                    costPerTime: 0,
                    utilityPerTime: 0
                }
            },
            events: {
                disease_onset: { cost: config.costs?.onsetEvent || 1000 },
                progression: { cost: config.costs?.progressionEvent || 5000 },
                death: { cost: 0 }
            },
            transitions: [
                { trigger: 'disease_onset', from: 'healthy', to: 'diseased' },
                { trigger: 'progression', from: 'diseased', to: 'progressed' },
                { trigger: 'death', from: 'diseased', to: 'dead' },
                { trigger: 'death', from: 'progressed', to: 'dead' }
            ]
        };
    },

    /**
     * Treatment comparison model
     */
    treatmentComparison(config) {
        const base = this.diseaseProgression(config);

        // Modify progression rates based on treatment effect
        if (config.treatmentEffect) {
            const te = config.treatmentEffect;
            base.states.diseased.scheduledEvents[0].parameters = {
                ...base.states.diseased.scheduledEvents[0].parameters,
                rate: (config.progressionParams?.rate || 0.1) * te.progressionHR
            };
        }

        return base;
    }
};


// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DiscreteEventSimulationEngine,
        PriorityQueue,
        DESTemplates
    };
}

// Browser global
if (typeof window !== 'undefined') {
    window.DiscreteEventSimulationEngine = DiscreteEventSimulationEngine;
    window.DESTemplates = DESTemplates;
}
