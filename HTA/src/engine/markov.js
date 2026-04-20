/**
 * Deterministic Markov Cohort Engine
 * Implements cohort-level Markov state-transition simulation
 *
 * Reference: RFC-005 Determinism Contract
 *
 * Features:
 * - Kahan summation for numerical stability
 * - Half-cycle correction (multiple methods)
 * - Discounting (costs and QALYs)
 * - Expression evaluation per cycle
 * - State trace recording
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

function resolveDependency(globalName, requirePath, exportName) {
    if (typeof globalThis !== 'undefined' && globalThis[globalName]) {
        return globalThis[globalName];
    }
    if (typeof require === 'function') {
        try {
            const moduleRef = require(requirePath);
            if (moduleRef && moduleRef[exportName]) {
                return moduleRef[exportName];
            }
        } catch (err) {
            return null;
        }
    }
    return null;
}

var KahanSumRef = resolveDependency('KahanSum', '../utils/kahan', 'KahanSum');
var ExpressionParserRef = resolveDependency('ExpressionParser', '../parser/expression', 'ExpressionParser');
var LifeTableRef = resolveDependency('LifeTable', '../utils/lifetable', 'LifeTable');
var PerformanceRef = (typeof globalThis !== 'undefined' &&
    globalThis.performance &&
    typeof globalThis.performance.now === 'function')
    ? globalThis.performance
    : { now: () => Date.now() };

class MarkovEngine {
    constructor(options = {}) {
        this.options = {
            tolerance: 1e-9,  // Mass conservation tolerance
            maxCycles: 10000, // Safety limit
            ...options
        };
        this.logger = options.logger || console;
        this.dependencies = {
            KahanSum: options.KahanSum || KahanSumRef,
            ExpressionParser: options.ExpressionParser || ExpressionParserRef,
            LifeTable: options.LifeTable || LifeTableRef,
            performance: options.performance || PerformanceRef
        };
        this.warnedParameters = new Set();
        this.currentRunWarnings = [];
        this.currentRunWarningKeys = new Set();
    }

    getKahanSumClass() {
        const Kahan = this.dependencies.KahanSum;
        if (typeof Kahan !== 'function') {
            throw new Error('MarkovEngine dependency missing: KahanSum');
        }
        return Kahan;
    }

    getExpressionParser() {
        const parser = this.dependencies.ExpressionParser;
        if (!parser || typeof parser.evaluate !== 'function') {
            throw new Error('MarkovEngine dependency missing: ExpressionParser.evaluate');
        }
        return parser;
    }

    getPerformance() {
        const perf = this.dependencies.performance;
        if (perf && typeof perf.now === 'function') {
            return perf;
        }
        return PerformanceRef;
    }

    warnOnce(key, message, context = {}) {
        if (!this.warnedParameters.has(key)) {
            if (this.logger && typeof this.logger.warn === 'function') {
                this.logger.warn(message);
            }
            this.warnedParameters.add(key);
        }
        if (!this.currentRunWarningKeys.has(key)) {
            this.currentRunWarningKeys.add(key);
            this.currentRunWarnings.push({
                key,
                message,
                ...context
            });
        }
    }

    isSimpleIdentifier(input) {
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(input);
    }

    tryEvaluateExpression(expression, context, warningKeyPrefix) {
        const parser = this.getExpressionParser();

        if (typeof expression === 'number') {
            return { ok: true, value: expression, retryable: false };
        }

        if (typeof expression !== 'string') {
            return { ok: true, value: 0, retryable: false };
        }

        const trimmed = expression.trim();
        if (!trimmed) {
            this.warnOnce(`${warningKeyPrefix}:empty`, `Empty expression for ${warningKeyPrefix}. Defaulting to 0.`);
            return { ok: false, value: 0, retryable: false };
        }

        if (this.isSimpleIdentifier(trimmed)) {
            if (Object.hasOwn(context, trimmed)) {
                return { ok: true, value: context[trimmed], retryable: false };
            }
            return { ok: false, value: 0, retryable: true, reason: `Undefined variable: ${trimmed}` };
        }

        try {
            const value = parser.evaluate(expression, context);
            if (!Number.isFinite(value)) {
                this.warnOnce(
                    `${warningKeyPrefix}:nonfinite`,
                    `Non-finite expression result for ${warningKeyPrefix}. Defaulting to 0.`
                );
                return { ok: false, value: 0, retryable: false, reason: 'Non-finite expression result' };
            }
            return { ok: true, value, retryable: false };
        } catch (e) {
            const message = e && e.message ? e.message : String(e);
            if (typeof message === 'string' && message.startsWith('Undefined variable:')) {
                return { ok: false, value: 0, retryable: true, reason: message };
            }
            this.warnOnce(
                `${warningKeyPrefix}:eval`,
                `Failed to evaluate ${warningKeyPrefix}: ${message}`
            );
            return { ok: false, value: 0, retryable: false, reason: message };
        }
    }

    evaluateExpressionMap(expressions, context, scope) {
        const parser = this.getExpressionParser();
        const pendingExpressions = { ...expressions };
        if (!Object.keys(pendingExpressions).length) return;

        if (typeof parser.analyzeDependencies === 'function') {
            try {
                const analysis = parser.analyzeDependencies(pendingExpressions);
                if (Array.isArray(analysis?.cycles) && analysis.cycles.length) {
                    const cycleNodes = new Set();
                    for (const cyclePath of analysis.cycles) {
                        for (const node of cyclePath) {
                            if (Object.hasOwn(pendingExpressions, node)) {
                                cycleNodes.add(node);
                            }
                        }
                    }
                    if (cycleNodes.size) {
                        const unresolvedCycleNodes = [];
                        for (const node of cycleNodes) {
                            // Keep cyclic expressions if a baseline value already
                            // exists in context (common for self-referential overrides).
                            if (Object.hasOwn(context, node)) continue;
                            unresolvedCycleNodes.push(node);
                        }

                        if (unresolvedCycleNodes.length) {
                            const nodes = unresolvedCycleNodes.sort();
                            this.warnOnce(
                                `${scope}:cycle:${nodes.join('|')}`,
                                `Circular dependency detected in ${scope}: ${nodes.join(', ')}`
                            );
                            for (const node of nodes) {
                                context[node] = 0;
                                delete pendingExpressions[node];
                            }
                        }
                    }
                }
            } catch (e) {
                const message = e && e.message ? e.message : String(e);
                this.warnOnce(
                    `${scope}:dependency-analysis`,
                    `Failed dependency analysis for ${scope}: ${message}`
                );
            }
        }

        const pending = new Set(Object.keys(pendingExpressions));
        const pendingReasons = {};
        const maxPasses = Math.max(1, pending.size * 2);

        for (let pass = 0; pass < maxPasses && pending.size; pass++) {
            let progress = false;

            for (const id of Array.from(pending)) {
                const evalResult = this.tryEvaluateExpression(
                    pendingExpressions[id],
                    context,
                    `${scope}.${id}`
                );

                if (evalResult.ok) {
                    context[id] = evalResult.value;
                    pending.delete(id);
                    delete pendingReasons[id];
                    progress = true;
                } else if (!evalResult.retryable) {
                    context[id] = 0;
                    pending.delete(id);
                    delete pendingReasons[id];
                    progress = true;
                } else if (evalResult.reason) {
                    pendingReasons[id] = evalResult.reason;
                }
            }

            if (!progress) break;
        }

        for (const unresolvedId of pending) {
            const reason = pendingReasons[unresolvedId] || 'Unresolved dependency';
            this.warnOnce(
                `${scope}.${unresolvedId}:unresolved`,
                `Failed to resolve ${scope}.${unresolvedId}: ${reason}. Defaulting to 0.`
            );
            context[unresolvedId] = 0;
        }
    }

    /**
     * Run a deterministic Markov cohort simulation
     * @param {Object} project - The HTA project definition
     * @param {Object} overrides - Parameter overrides (for scenarios/strategies)
     * @returns {Object} Simulation results
     */
    run(project, overrides = {}) {
        const perf = this.getPerformance();
        const Kahan = this.getKahanSumClass();
        this.getExpressionParser();
        this.currentRunWarnings = [];
        this.currentRunWarningKeys = new Set();
        const startTime = perf.now();

        // Extract model components
        const settings = this.getSettings(project);
        const { baseValues, overrideExpressions } = this.resolveParameters(project.parameters, overrides);
        const states = project.states;
        const transitions = project.transitions;

        // Determine number of cycles
        const cycles = Math.min(
            Math.ceil(settings.time_horizon / settings.cycle_length),
            this.options.maxCycles
        );

        // Initialize state occupancy (cohort distribution)
        const stateIds = Object.keys(states);
        let distribution = this.initializeDistribution(states);

        // Initialize accumulators (Kahan summation)
        const costAccum = new Kahan();
        const qalyAccum = new Kahan();
        const lyAccum = new Kahan();

        // Store trace
        const trace = {
            cycles: [],
            states: {}
        };
        for (const stateId of stateIds) {
            trace.states[stateId] = [];
        }

        // Run simulation
        for (let cycle = 0; cycle <= cycles; cycle++) {
            // Build evaluation context with base values first, then apply overrides
            const context = this.buildContext(baseValues, overrideExpressions, settings, cycle);

            // Record trace
            trace.cycles.push(cycle);
            for (const stateId of stateIds) {
                trace.states[stateId].push(distribution[stateId]);
            }

            // Compute cycle outcomes (costs and QALYs)
            const { cycleCost, cycleQaly, cycleLY } = this.computeCycleOutcomes(
                states, distribution, context, cycle, cycles, settings
            );

            // Apply discounting
            const discountFactor = this.getDiscountFactor(cycle, settings.cycle_length, settings.discount_rate_costs);
            const discountFactorQaly = this.getDiscountFactor(cycle, settings.cycle_length, settings.discount_rate_qalys);

            costAccum.add(cycleCost * discountFactor);
            qalyAccum.add(cycleQaly * discountFactorQaly);
            lyAccum.add(cycleLY * discountFactorQaly);

            // Update state distribution (except last cycle)
            if (cycle < cycles) {
                const transMatrix = this.buildTransitionMatrix(transitions, stateIds, context);
                distribution = this.applyTransitions(distribution, transMatrix, stateIds);
            }
        }

        const computationTime = Math.round(perf.now() - startTime);

        return {
            total_costs: costAccum.total(),
            total_qalys: qalyAccum.total(),
            life_years: lyAccum.total(),
            cycles: cycles,
            trace: trace,
            computation_time_ms: computationTime,
            final_distribution: distribution,
            warnings: [...this.currentRunWarnings]
        };
    }

    /**
     * Get model settings with defaults
     */
    getSettings(project) {
        const s = project.settings || {};
        return {
            time_horizon: s.time_horizon ?? 40,
            cycle_length: s.cycle_length ?? 1,
            discount_rate_costs: s.discount_rate_costs ?? guidanceDefaults.discount_rate_costs,
            discount_rate_qalys: s.discount_rate_qalys ?? guidanceDefaults.discount_rate_qalys,
            half_cycle_correction: s.half_cycle_correction || 'trapezoidal',
            currency: s.currency || guidanceDefaults.currency,
            starting_age: s.starting_age ?? 50,
            gdp_per_capita_omr: s.gdp_per_capita_omr,
            wtp_thresholds: s.wtp_thresholds,
            wtp_multipliers: s.wtp_multipliers,
            // Background mortality settings
            use_background_mortality: s.use_background_mortality ?? false,
            background_mortality_sex: s.background_mortality_sex || 'mixed',
            // Tunnel state settings
            tunnel_states: s.tunnel_states || {}
        };
    }

    /**
     * Get background mortality rate for given age and sex
     * Uses life tables when available, otherwise returns 0
     */
    getBackgroundMortality(age, sex, settings) {
        if (!settings.use_background_mortality) return 0;

        // Check if LifeTable is available
        const LifeTableClass = this.dependencies.LifeTable;
        if (typeof LifeTableClass !== 'function') return 0;

        try {
            const lifeTable = new LifeTableClass();
            const roundedAge = Math.floor(age);
            const resolveRate = (sexLabel) => {
                const rate = lifeTable.getMortalityRate(roundedAge, sexLabel);
                return Number.isFinite(rate) ? rate : 0;
            };

            // Use deterministic averaging for mixed populations to preserve
            // reproducibility across runs and platforms.
            const configuredSex = settings.background_mortality_sex || sex || 'mixed';
            if (configuredSex === 'mixed') {
                const maleRate = resolveRate('male');
                const femaleRate = resolveRate('female');
                return (maleRate + femaleRate) / 2;
            }

            if (configuredSex !== 'male' && configuredSex !== 'female') {
                const maleRate = resolveRate('male');
                const femaleRate = resolveRate('female');
                return (maleRate + femaleRate) / 2;
            }

            return resolveRate(configuredSex);
        } catch (e) {
            return 0;
        }
    }

    /**
     * Resolve parameters with overrides
     * Returns { baseValues, overrideExpressions } to handle strategy differentiation
     */
    resolveParameters(parameters, overrides) {
        const baseValues = {};
        const overrideExpressions = {};

        for (const [id, param] of Object.entries(parameters || {})) {
            // Always store the base value first
            if (typeof param.value === 'number') {
                baseValues[id] = param.value;
            } else if (typeof param.value === 'string') {
                // Expression - will be evaluated in context
                baseValues[id] = param.value;
            } else {
                baseValues[id] = 0;
            }

            // If there's an override, store it separately
            if (id in overrides) {
                overrideExpressions[id] = overrides[id];
            }
        }

        return { baseValues, overrideExpressions };
    }

    /**
     * Initialize state distribution based on initial probabilities
     */
    initializeDistribution(states) {
        const dist = {};
        let total = 0;

        for (const [stateId, state] of Object.entries(states)) {
            const initProb = state.initial_probability || 0;
            dist[stateId] = initProb;
            total += initProb;
        }

        // Normalize if not exactly 1
        if (Math.abs(total - 1) > 1e-9 && total > 0) {
            for (const stateId of Object.keys(dist)) {
                dist[stateId] /= total;
            }
        }

        // If no initial specified, start in first state
        if (total === 0) {
            const firstState = Object.keys(states)[0];
            dist[firstState] = 1.0;
        }

        return dist;
    }

    /**
     * Build evaluation context for expressions
     * Handles strategy differentiation by evaluating overrides AFTER base values are established
     */
    buildContext(baseValues, overrideExpressions, settings, cycle) {
        const context = {
            cycle: cycle,
            time: cycle * settings.cycle_length,
            age: (settings.starting_age || 50) + cycle * settings.cycle_length
        };

        // STEP 1: Add all numeric base parameters to context first
        const baseExpressionMap = {};
        for (const [id, value] of Object.entries(baseValues)) {
            if (typeof value === 'number') {
                context[id] = value;
            } else if (typeof value === 'string' && !(id in overrideExpressions)) {
                baseExpressionMap[id] = value;
            }
        }

        // STEP 2: Resolve base expression parameters in dependency-aware order.
        if (Object.keys(baseExpressionMap).length) {
            this.evaluateExpressionMap(baseExpressionMap, context, 'base_parameters');
        }

        // STEP 3: Apply override literals first.
        const overrideExpressionMap = {};
        for (const [id, overrideExpr] of Object.entries(overrideExpressions)) {
            if (typeof overrideExpr === 'number') {
                context[id] = overrideExpr;
            } else if (typeof overrideExpr === 'string') {
                overrideExpressionMap[id] = overrideExpr;
            } else if (!(id in context)) {
                this.warnOnce(
                    `override.${id}:unsupported`,
                    `Unsupported override type for ${id}. Defaulting to existing/base value.`,
                    { override: overrideExpr }
                );
            }
        }

        // STEP 4: Resolve override expressions (supports interdependent overrides).
        if (Object.keys(overrideExpressionMap).length) {
            this.evaluateExpressionMap(overrideExpressionMap, context, 'override_parameters');
        }

        return context;
    }

    /**
     * Compute costs, QALYs and life-years for a cycle
     */
    computeCycleOutcomes(states, distribution, context, cycle, totalCycles, settings) {
        let cycleCost = 0;
        let cycleQaly = 0;
        let cycleLY = 0;
        const parser = this.getExpressionParser();

        const hccMethod = settings.half_cycle_correction;

        for (const [stateId, state] of Object.entries(states)) {
            const occupancy = distribution[stateId];
            if (occupancy <= 0) continue;

            // Get cost for this state
            let cost = 0;
            if (typeof state.cost === 'number') {
                cost = state.cost;
            } else if (typeof state.cost === 'string') {
                try {
                    cost = parser.evaluate(state.cost, context);
                } catch (e) {
                    this.warnOnce(`state_cost.${stateId}`, `Failed to evaluate cost for ${stateId}: ${e.message}`);
                }
            }

            // Get utility for this state
            let utility = 1;
            if (typeof state.utility === 'number') {
                utility = state.utility;
            } else if (typeof state.utility === 'string') {
                try {
                    utility = parser.evaluate(state.utility, context);
                } catch (e) {
                    this.warnOnce(`state_utility.${stateId}`, `Failed to evaluate utility for ${stateId}: ${e.message}`);
                }
            }

            // Apply half-cycle correction
            let hccFactor = 1.0;
            if (hccMethod === 'trapezoidal') {
                if (cycle === 0 || cycle === totalCycles) {
                    hccFactor = 0.5;
                }
            } else if (hccMethod === 'start') {
                if (cycle === 0) {
                    hccFactor = 0.5;
                }
            } else if (hccMethod === 'end') {
                if (cycle === totalCycles) {
                    hccFactor = 0.5;
                }
            }
            // 'none' = no adjustment

            // Life-years should represent time alive. By default, absorbing
            // dead states contribute zero LY unless explicitly overridden.
            let lyWeight = 1;
            if (typeof state.life_year_weight === 'number' && Number.isFinite(state.life_year_weight)) {
                lyWeight = state.life_year_weight;
            } else {
                const label = String(state.label || stateId).toLowerCase();
                const appearsDead = label.includes('dead') || label.includes('death');
                if (state.type === 'absorbing' && (appearsDead || utility <= 0)) {
                    lyWeight = 0;
                }
            }

            cycleCost += occupancy * cost * settings.cycle_length * hccFactor;
            cycleQaly += occupancy * utility * settings.cycle_length * hccFactor;
            cycleLY += occupancy * lyWeight * settings.cycle_length * hccFactor;
        }

        return { cycleCost, cycleQaly, cycleLY };
    }

    /**
     * Build transition probability matrix
     * Validates row sums and handles complement transitions
     */
    buildTransitionMatrix(transitions, stateIds, context) {
        const parser = this.getExpressionParser();
        const matrix = {};

        // Initialize empty matrix
        for (const fromId of stateIds) {
            matrix[fromId] = {};
            for (const toId of stateIds) {
                matrix[fromId][toId] = 0;
            }
        }

        // Fill in transitions
        for (const [transId, trans] of Object.entries(transitions || {})) {
            let prob = 0;
            const rawProbability = typeof trans.probability === 'string'
                ? trans.probability.trim()
                : trans.probability;

            if (typeof rawProbability === 'number') {
                prob = rawProbability;
            } else if (typeof rawProbability === 'string') {
                // Check for complement keyword
                if (rawProbability.toLowerCase() === 'complement' || rawProbability.toUpperCase() === 'C') {
                    continue; // Handle complements after all explicit transitions
                }
                try {
                    prob = parser.evaluate(rawProbability, context);
                } catch (e) {
                    this.warnOnce(`transition_eval.${transId}`, `Failed to evaluate transition ${transId}: ${e.message}`);
                }
            }

            // Clamp probability to [0, 1]
            const originalProb = prob;
            prob = Math.max(0, Math.min(1, prob));
            if (Math.abs(prob - originalProb) > this.options.tolerance) {
                this.warnOnce(
                    `transition_clamp.${transId}`,
                    `Transition ${transId} probability clamped from ${originalProb} to ${prob}.`
                );
            }

            if (trans.from in matrix && trans.to in matrix[trans.from]) {
                matrix[trans.from][trans.to] = prob;
            } else {
                this.warnOnce(
                    `transition_reference.${transId}`,
                    `Transition ${transId} references unknown state(s): ${trans.from} -> ${trans.to}.`
                );
            }
        }

        // Handle complement transitions
        for (const [transId, trans] of Object.entries(transitions || {})) {
            const rawProbability = typeof trans.probability === 'string'
                ? trans.probability.trim()
                : trans.probability;
            if (typeof rawProbability === 'string' &&
                (rawProbability.toLowerCase() === 'complement' || rawProbability.toUpperCase() === 'C')) {
                if (trans.from in matrix && trans.to in matrix[trans.from]) {
                    // Calculate complement probability
                    let rowSum = 0;
                    for (const toId of stateIds) {
                        if (`${trans.from}->${toId}` !== `${trans.from}->${trans.to}`) {
                            rowSum += matrix[trans.from][toId];
                        }
                    }
                    matrix[trans.from][trans.to] = Math.max(0, 1 - rowSum);
                }
            }
        }

        // Validate row sums and warn if they don't equal 1.0
        const rowTolerance = 1e-6;
        for (const fromId of stateIds) {
            for (const toId of stateIds) {
                if (matrix[fromId][toId] < 0) {
                    this.warnOnce(
                        `transition_negative.${fromId}.${toId}`,
                        `Negative transition probability detected for ${fromId} -> ${toId}. Clamping to 0.`
                    );
                    matrix[fromId][toId] = 0;
                }
            }

            let rowSum = 0;
            for (const toId of stateIds) {
                rowSum += matrix[fromId][toId];
            }

            if (rowSum < rowTolerance) {
                // No transitions defined - assume stay in same state
                for (const toId of stateIds) {
                    matrix[fromId][toId] = 0;
                }
                matrix[fromId][fromId] = 1.0;
            } else if (Math.abs(rowSum - 1.0) > rowTolerance) {
                if (rowSum > 1.0) {
                    // Row sum exceeds 1 - normalize
                    this.warnOnce(
                        `transition_rowsum_high.${fromId}`,
                        `Transition probabilities from state "${fromId}" sum to ${rowSum.toFixed(4)} (>1.0). Normalizing.`
                    );
                    for (const toId of stateIds) {
                        matrix[fromId][toId] /= rowSum;
                    }
                } else {
                    // Row sum less than 1 - assign remainder to self-transition
                    const remainder = 1.0 - rowSum;
                    matrix[fromId][fromId] += remainder;
                    this.warnOnce(
                        `transition_rowsum_low.${fromId}`,
                        `Transition probabilities from state "${fromId}" sum to ${rowSum.toFixed(4)} (<1.0). Assigning ${remainder.toFixed(4)} to self-transition.`
                    );
                }
            }

            // Final normalization guard for numerical drift.
            let normalizedSum = 0;
            for (const toId of stateIds) {
                normalizedSum += matrix[fromId][toId];
            }
            if (normalizedSum > rowTolerance && Math.abs(normalizedSum - 1.0) > this.options.tolerance) {
                for (const toId of stateIds) {
                    matrix[fromId][toId] /= normalizedSum;
                }
            }
        }

        return matrix;
    }

    /**
     * Apply transitions to update state distribution
     */
    applyTransitions(distribution, matrix, stateIds) {
        const Kahan = this.getKahanSumClass();
        const newDist = {};

        for (const toId of stateIds) {
            const accum = new Kahan();
            for (const fromId of stateIds) {
                accum.add(distribution[fromId] * matrix[fromId][toId]);
            }
            newDist[toId] = accum.total();
        }

        const totalMass = Object.values(newDist).reduce((sum, value) => sum + value, 0);
        if (totalMass > this.options.tolerance && Math.abs(totalMass - 1) > this.options.tolerance) {
            this.warnOnce(
                'distribution_mass_drift',
                `Distribution mass drift detected (${totalMass}). Renormalizing.`
            );
            for (const stateId of stateIds) {
                newDist[stateId] /= totalMass;
            }
        }

        return newDist;
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
     * Run incremental analysis (intervention vs comparator)
     */
    runIncremental(project, interventionOverrides = {}, comparatorOverrides = {}) {
        const settings = this.getSettings(project);
        // Run intervention
        const intResults = this.run(project, interventionOverrides);

        // Run comparator
        const compResults = this.run(project, comparatorOverrides);

        // Calculate incremental values
        const incCosts = intResults.total_costs - compResults.total_costs;
        const incQalys = intResults.total_qalys - compResults.total_qalys;

        // Calculate ICER with proper handling of all quadrants and edge cases
        let icer = null;
        let dominance = 'none';

        if (Math.abs(incQalys) < 1e-10) {
            // Incremental QALYs essentially zero - ICER undefined
            if (incCosts > 0) {
                dominance = 'more_costly_equal_effect';
                icer = 'Undefined (no QALY difference)';
            } else if (incCosts < 0) {
                dominance = 'less_costly_equal_effect';
                icer = 'Undefined (no QALY difference)';
            } else {
                dominance = 'equivalent';
                icer = 'Equivalent';
            }
        } else if (incQalys > 0) {
            if (incCosts > 0) {
                icer = incCosts / incQalys;
            } else {
                dominance = 'dominant';
                icer = 'Dominant';
            }
        } else {
            if (incCosts > 0) {
                dominance = 'dominated';
                icer = 'Dominated';
            } else {
                icer = incCosts / incQalys; // SW quadrant - trade-off
            }
        }

        // Calculate NMB at different WTP thresholds
        const wtpThresholds = resolveWtpThresholds(settings);
        const primaryWtp = resolvePrimaryWtp(settings);
        const nmb = {};
        for (const wtp of wtpThresholds) {
            nmb[wtp] = incQalys * wtp - incCosts;
        }

        return {
            intervention: intResults,
            comparator: compResults,
            incremental: {
                costs: incCosts,
                qalys: incQalys,
                life_years: intResults.life_years - compResults.life_years,
                icer: icer,
                dominance: dominance,
                nmb: nmb,
                wtp_thresholds: wtpThresholds,
                primary_wtp: primaryWtp,
                nmb_primary: incQalys * primaryWtp - incCosts
            }
        };
    }

    /**
     * Run all strategies defined in the project
     */
    runAllStrategies(project) {
        const strategies = project.strategies || {};
        const settings = this.getSettings(project);
        const wtpThresholds = resolveWtpThresholds(settings);
        const primaryWtp = resolvePrimaryWtp(settings);
        const results = {
            strategies: {},
            incremental: null,
            wtp_thresholds: wtpThresholds,
            primary_wtp: primaryWtp
        };

        // Find comparator
        let comparatorId = null;
        for (const [stratId, strat] of Object.entries(strategies)) {
            if (strat.is_comparator) {
                comparatorId = stratId;
                break;
            }
        }

        // Run each strategy
        for (const [stratId, strat] of Object.entries(strategies)) {
            const overrides = strat.parameter_overrides || {};
            const stratResults = this.run(project, overrides);
            results.strategies[stratId] = {
                label: strat.label,
                ...stratResults
            };
        }

        // Calculate incremental results vs comparator
        if (comparatorId) {
            const comparisons = [];
            const compResults = results.strategies[comparatorId];

            for (const [stratId, stratResults] of Object.entries(results.strategies)) {
                if (stratId === comparatorId) continue;

                const incCosts = stratResults.total_costs - compResults.total_costs;
                const incQalys = stratResults.total_qalys - compResults.total_qalys;

                let icer = null;
                let dominance = 'none';

                // Handle ICER calculation for all four quadrants of the CE plane
                // Plus edge case when incremental QALYs is zero
                if (Math.abs(incQalys) < 1e-10) {
                    // Incremental QALYs essentially zero - ICER undefined
                    icer = null;
                    if (incCosts > 0) {
                        dominance = 'more_costly_equal_effect';
                    } else if (incCosts < 0) {
                        dominance = 'less_costly_equal_effect';
                    } else {
                        dominance = 'equivalent';
                    }
                } else if (incQalys > 0) {
                    // Northeast or Northwest quadrant
                    if (incCosts > 0) {
                        icer = incCosts / incQalys;
                    } else {
                        dominance = 'dominant';
                    }
                } else {
                    // Southeast or Southwest quadrant
                    if (incCosts > 0) {
                        dominance = 'dominated';
                    } else {
                        icer = incCosts / incQalys;
                    }
                }

                comparisons.push({
                    strategy: stratId,
                    label: stratResults.label,
                    incremental_costs: incCosts,
                    incremental_qalys: incQalys,
                    icer: icer,
                    dominance: dominance,
                    nmb_30k: incQalys * primaryWtp - incCosts,
                    nmb_primary: incQalys * primaryWtp - incCosts,
                    wtp_used: primaryWtp
                });
            }

            results.incremental = {
                comparator: comparatorId,
                comparisons: comparisons
            };
        }

        return results;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MarkovEngine = MarkovEngine;
    window.MarkovModel = MarkovEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MarkovEngine };
}
