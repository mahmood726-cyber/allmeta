/**
 * Semantic Validator for HTA Models
 * Validates HTA-specific rules beyond JSON Schema
 *
 * Reference: RFC-006 Validation Requirements
 */

// Severity levels
const Severity = {
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    INFO: 'INFO'
};

// Validation codes
const ValidationCodes = {
    // Errors (E0xx)
    REF_NOT_FOUND: 'E001',
    PROB_OUT_OF_BOUNDS: 'E002',
    MASS_CONSERVATION: 'E003',
    NEGATIVE_VALUE: 'E004',
    CIRCULAR_DEPENDENCY: 'E005',
    INVALID_EXPRESSION: 'E006',
    MISSING_REQUIRED: 'E007',
    DUPLICATE_ID: 'E008',
    INVALID_STATE_TYPE: 'E009',
    NO_INITIAL_STATE: 'E010',
    CLINICAL_IMPLAUSIBILITY: 'E011',
    TIME_HORIZON_INVALID: 'E012',
    DISCOUNT_RATE_INVALID: 'E013',

    // Warnings (W0xx)
    PROB_NEAR_BOUNDARY: 'W001',
    MISSING_EVIDENCE: 'W002',
    UTILITY_OUT_OF_RANGE: 'W003',
    EXTREME_VALUE: 'W004',
    UNUSED_PARAMETER: 'W005',
    MISSING_DESCRIPTION: 'W006',
    NO_ABSORBING_STATE: 'W007',
    PROB_CLAMPED: 'W008',
    SHORT_TIME_HORIZON: 'W009',
    HIGH_DISCOUNT_RATE: 'W010',
    NO_COMPARATOR: 'W011',
    IMPLAUSIBLE_ICER: 'W012',
    MISSING_DISTRIBUTIONS: 'W013',
    UNREALISTIC_LIFE_YEARS: 'W014',

    // Info (I0xx)
    BEST_PRACTICE: 'I001',
    MISSING_OPTIONAL: 'I002',
    DOCUMENTATION_SUGGESTION: 'I003',
    PSA_ITERATIONS_LOW: 'I004',
    NICE_COMPLIANCE: 'I005'
};

class SemanticValidator {
    constructor() {
        this.issues = [];
        this.project = null;
    }

    /**
     * Run all semantic validations
     * @param {Object} project - Parsed project.json
     * @returns {Object} Validation result
     */
    validate(project) {
        this.issues = [];
        this.project = project;

        // Core validations
        this.validateReferenceIntegrity();
        this.validateProbabilityBounds();
        this.validateMassConservation();
        this.validateNonNegativeValues();
        this.validateExpressions();

        // Model structure validations
        this.validateStateStructure();
        this.validateTransitionStructure();
        this.validateStrategies();

        // Warning-level validations
        this.checkProbabilityNearBoundaries();
        this.checkEvidenceLinks();
        this.checkUtilityRange();
        this.checkExtremeValues();
        this.checkUnusedParameters();
        this.checkDocumentation();

        // Clinical plausibility and NICE compliance
        this.checkTimeHorizon();
        this.checkDiscountRates();
        this.checkClinicalPlausibility();
        this.checkPSAConfiguration();
        this.checkNICECompliance();

        // Summarize
        const errors = this.issues.filter(i => i.severity === Severity.ERROR);
        const warnings = this.issues.filter(i => i.severity === Severity.WARNING);
        const infos = this.issues.filter(i => i.severity === Severity.INFO);

        return {
            valid: errors.length === 0,
            errors: errors.length,
            warnings: warnings.length,
            infos: infos.length,
            issues: this.issues
        };
    }

    addIssue(severity, code, path, message, recommendation = null, context = null) {
        this.issues.push({
            severity,
            code,
            path,
            message,
            recommendation,
            context
        });
    }

    // ============ ERROR CHECKS ============

    /**
     * Check all ID references are valid
     */
    validateReferenceIntegrity() {
        const { parameters, states, transitions, evidence, strategies } = this.project;

        // Collect all valid IDs
        const validParamIds = new Set(Object.keys(parameters || {}));
        const validStateIds = new Set(Object.keys(states || {}));
        const validEvidenceIds = new Set(Object.keys(evidence || {}));

        // Check transitions reference valid states
        if (transitions) {
            for (const [transId, trans] of Object.entries(transitions)) {
                if (trans.from && !validStateIds.has(trans.from)) {
                    this.addIssue(
                        Severity.ERROR,
                        ValidationCodes.REF_NOT_FOUND,
                        `transitions.${transId}.from`,
                        `State '${trans.from}' not found`,
                        `Define state '${trans.from}' in the states section`
                    );
                }
                if (trans.to && !validStateIds.has(trans.to)) {
                    this.addIssue(
                        Severity.ERROR,
                        ValidationCodes.REF_NOT_FOUND,
                        `transitions.${transId}.to`,
                        `State '${trans.to}' not found`,
                        `Define state '${trans.to}' in the states section`
                    );
                }
            }
        }

        // Check evidence references in parameters
        if (parameters) {
            for (const [paramId, param] of Object.entries(parameters)) {
                if (param.evidence_id && !validEvidenceIds.has(param.evidence_id)) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.REF_NOT_FOUND,
                        `parameters.${paramId}.evidence_id`,
                        `Evidence '${param.evidence_id}' not found`,
                        `Add evidence '${param.evidence_id}' to the evidence section`
                    );
                }
            }
        }
    }

    /**
     * Check probability values are within [0, 1]
     */
    validateProbabilityBounds() {
        const { transitions, states, parameters } = this.project;

        // Check transitions
        if (transitions) {
            for (const [transId, trans] of Object.entries(transitions)) {
                if (typeof trans.probability === 'number') {
                    if (trans.probability < 0 || trans.probability > 1) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.PROB_OUT_OF_BOUNDS,
                            `transitions.${transId}.probability`,
                            `Probability ${trans.probability} is outside [0, 1]`,
                            'Probability must be between 0 and 1 inclusive',
                            { value: trans.probability }
                        );
                    }
                }
            }
        }

        // Check initial probabilities
        if (states) {
            for (const [stateId, state] of Object.entries(states)) {
                if (state.initial_probability !== undefined) {
                    if (state.initial_probability < 0 || state.initial_probability > 1) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.PROB_OUT_OF_BOUNDS,
                            `states.${stateId}.initial_probability`,
                            `Initial probability ${state.initial_probability} is outside [0, 1]`,
                            'Initial probability must be between 0 and 1 inclusive',
                            { value: state.initial_probability }
                        );
                    }
                }
            }
        }
    }

    /**
     * Check transition matrix row sums equal 1
     */
    validateMassConservation() {
        const { states, transitions } = this.project;
        if (!states || !transitions) return;

        const epsilon = 1e-6;

        // Group transitions by 'from' state
        const transitionsByFrom = {};
        for (const [transId, trans] of Object.entries(transitions)) {
            if (!transitionsByFrom[trans.from]) {
                transitionsByFrom[trans.from] = [];
            }
            transitionsByFrom[trans.from].push({ id: transId, ...trans });
        }

        // Check each state's outgoing transitions
        for (const [stateId, state] of Object.entries(states)) {
            if (state.type === 'absorbing') continue; // Absorbing states don't need outgoing

            const outgoing = transitionsByFrom[stateId] || [];

            // Sum probabilities (only numeric, not expressions)
            let sum = 0;
            let hasExpression = false;

            for (const trans of outgoing) {
                if (typeof trans.probability === 'number') {
                    sum += trans.probability;
                } else if (typeof trans.probability === 'string') {
                    hasExpression = true;
                }
            }

            // Only check if all probabilities are numeric
            if (!hasExpression && outgoing.length > 0) {
                if (Math.abs(sum - 1.0) > epsilon) {
                    this.addIssue(
                        Severity.ERROR,
                        ValidationCodes.MASS_CONSERVATION,
                        `states.${stateId}`,
                        `Transition probabilities sum to ${sum.toFixed(6)}, not 1.0`,
                        'Adjust transition probabilities so they sum to exactly 1.0',
                        { sum, difference: sum - 1.0 }
                    );
                }
            }
        }
    }

    /**
     * Check for negative costs and other values that should be positive
     */
    validateNonNegativeValues() {
        const { states, parameters, settings } = this.project;

        // Check state costs
        if (states) {
            for (const [stateId, state] of Object.entries(states)) {
                if (typeof state.cost === 'number' && state.cost < 0) {
                    this.addIssue(
                        Severity.ERROR,
                        ValidationCodes.NEGATIVE_VALUE,
                        `states.${stateId}.cost`,
                        `Cost ${state.cost} is negative`,
                        'Costs should be non-negative values'
                    );
                }
            }
        }

        // Check settings
        if (settings) {
            if (settings.time_horizon !== undefined && settings.time_horizon < 0) {
                this.addIssue(
                    Severity.ERROR,
                    ValidationCodes.NEGATIVE_VALUE,
                    'settings.time_horizon',
                    'Time horizon cannot be negative'
                );
            }
            if (settings.cycle_length !== undefined && settings.cycle_length <= 0) {
                this.addIssue(
                    Severity.ERROR,
                    ValidationCodes.NEGATIVE_VALUE,
                    'settings.cycle_length',
                    'Cycle length must be positive'
                );
            }
        }
    }

    /**
     * Validate all expressions parse correctly and have no circular dependencies
     */
    validateExpressions() {
        const expressions = {};

        // Collect all expressions
        const collectExpressions = (obj, prefix) => {
            if (!obj) return;
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    if (typeof value.value === 'string' && !value.value.match(/^[\d.+-]+$/)) {
                        expressions[`${prefix}.${key}`] = value.value;
                    }
                    if (typeof value.cost === 'string') {
                        expressions[`${prefix}.${key}.cost`] = value.cost;
                    }
                    if (typeof value.utility === 'string') {
                        expressions[`${prefix}.${key}.utility`] = value.utility;
                    }
                    if (typeof value.probability === 'string') {
                        expressions[`${prefix}.${key}.probability`] = value.probability;
                    }
                }
            }
        };

        collectExpressions(this.project.parameters, 'parameters');
        collectExpressions(this.project.states, 'states');
        collectExpressions(this.project.transitions, 'transitions');

        // Validate each expression
        for (const [path, expr] of Object.entries(expressions)) {
            try {
                const result = ExpressionParser.validate(expr);
                if (!result.valid) {
                    this.addIssue(
                        Severity.ERROR,
                        ValidationCodes.INVALID_EXPRESSION,
                        path,
                        `Invalid expression: ${result.error}`,
                        'Check expression syntax',
                        { expression: expr }
                    );
                }
            } catch (e) {
                this.addIssue(
                    Severity.ERROR,
                    ValidationCodes.INVALID_EXPRESSION,
                    path,
                    `Expression parse error: ${e.message}`,
                    'Check expression syntax',
                    { expression: expr }
                );
            }
        }

        // Check for circular dependencies
        if (Object.keys(expressions).length > 0) {
            try {
                const analysis = ExpressionParser.analyzeDepedencies(expressions);
                if (analysis.cycles && analysis.cycles.length > 0) {
                    for (const cycle of analysis.cycles) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.CIRCULAR_DEPENDENCY,
                            cycle[0],
                            `Circular dependency detected: ${cycle.join(' → ')}`,
                            'Break the circular dependency by using fixed values'
                        );
                    }
                }
            } catch (e) {
                // Ignore analysis errors
            }
        }
    }

    /**
     * Validate state structure
     */
    validateStateStructure() {
        const { states } = this.project;
        if (!states) return;

        let hasInitial = false;
        let hasAbsorbing = false;

        for (const [stateId, state] of Object.entries(states)) {
            // Check for initial state
            if (state.initial_probability && state.initial_probability > 0) {
                hasInitial = true;
            }

            // Check for absorbing states
            if (state.type === 'absorbing') {
                hasAbsorbing = true;
            }
        }

        if (!hasInitial && Object.keys(states).length > 0) {
            this.addIssue(
                Severity.ERROR,
                ValidationCodes.NO_INITIAL_STATE,
                'states',
                'No initial state defined',
                'Set initial_probability > 0 for at least one state'
            );
        }

        if (!hasAbsorbing && Object.keys(states).length > 0) {
            this.addIssue(
                Severity.WARNING,
                ValidationCodes.NO_ABSORBING_STATE,
                'states',
                'No absorbing state defined',
                'Consider adding an absorbing state (e.g., Dead) for proper cohort tracking'
            );
        }
    }

    /**
     * Validate transition structure
     */
    validateTransitionStructure() {
        const { states, transitions } = this.project;
        if (!transitions) return;

        // Check for duplicate transitions
        const transitionPairs = new Set();
        for (const [transId, trans] of Object.entries(transitions)) {
            const pair = `${trans.from}->${trans.to}`;
            if (transitionPairs.has(pair)) {
                this.addIssue(
                    Severity.WARNING,
                    ValidationCodes.DUPLICATE_ID,
                    `transitions.${transId}`,
                    `Duplicate transition from ${trans.from} to ${trans.to}`,
                    'Consider combining these transitions'
                );
            }
            transitionPairs.add(pair);
        }
    }

    /**
     * Validate strategies
     */
    validateStrategies() {
        const { strategies, parameters } = this.project;
        if (!strategies) return;

        let hasComparator = false;

        for (const [stratId, strat] of Object.entries(strategies)) {
            if (strat.is_comparator) {
                hasComparator = true;
            }

            // Check parameter overrides reference valid parameters
            if (strat.parameter_overrides) {
                for (const paramId of Object.keys(strat.parameter_overrides)) {
                    if (parameters && !(paramId in parameters)) {
                        this.addIssue(
                            Severity.WARNING,
                            ValidationCodes.REF_NOT_FOUND,
                            `strategies.${stratId}.parameter_overrides.${paramId}`,
                            `Override references undefined parameter '${paramId}'`
                        );
                    }
                }
            }
        }

        if (Object.keys(strategies).length > 1 && !hasComparator) {
            this.addIssue(
                Severity.WARNING,
                ValidationCodes.MISSING_REQUIRED,
                'strategies',
                'No comparator strategy defined',
                'Set is_comparator: true for the baseline strategy'
            );
        }
    }

    // ============ WARNING CHECKS ============

    /**
     * Check for probabilities near 0 or 1
     */
    checkProbabilityNearBoundaries() {
        const { transitions } = this.project;
        if (!transitions) return;

        const lowerThreshold = 0.001;
        const upperThreshold = 0.999;

        for (const [transId, trans] of Object.entries(transitions)) {
            if (typeof trans.probability === 'number') {
                if (trans.probability > 0 && trans.probability < lowerThreshold) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.PROB_NEAR_BOUNDARY,
                        `transitions.${transId}.probability`,
                        `Probability ${trans.probability} is very close to 0`,
                        'Review if this rare event is clinically plausible',
                        { value: trans.probability }
                    );
                }
                if (trans.probability < 1 && trans.probability > upperThreshold) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.PROB_NEAR_BOUNDARY,
                        `transitions.${transId}.probability`,
                        `Probability ${trans.probability} is very close to 1`,
                        'Review if this certainty is clinically plausible',
                        { value: trans.probability }
                    );
                }
            }
        }
    }

    /**
     * Check for missing evidence links
     */
    checkEvidenceLinks() {
        const { parameters } = this.project;
        if (!parameters) return;

        for (const [paramId, param] of Object.entries(parameters)) {
            if (!param.evidence_id) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.MISSING_EVIDENCE,
                    `parameters.${paramId}`,
                    'Parameter has no evidence link',
                    'Add evidence_id to document the source of this value'
                );
            }
        }
    }

    /**
     * Check utility values are within typical range
     */
    checkUtilityRange() {
        const { states } = this.project;
        if (!states) return;

        for (const [stateId, state] of Object.entries(states)) {
            if (typeof state.utility === 'number') {
                if (state.utility < 0) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.UTILITY_OUT_OF_RANGE,
                        `states.${stateId}.utility`,
                        `Utility ${state.utility} is negative (states worse than death)`,
                        'Verify this is intentional for states worse than death'
                    );
                }
                if (state.utility > 1) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.UTILITY_OUT_OF_RANGE,
                        `states.${stateId}.utility`,
                        `Utility ${state.utility} exceeds 1 (perfect health)`,
                        'Standard utility values are typically 0-1'
                    );
                }
            }
        }
    }

    /**
     * Check for extreme parameter values
     */
    checkExtremeValues() {
        const { parameters } = this.project;
        if (!parameters) return;

        for (const [paramId, param] of Object.entries(parameters)) {
            if (typeof param.value === 'number') {
                if (param.value > 1e10) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.EXTREME_VALUE,
                        `parameters.${paramId}.value`,
                        `Very large value: ${param.value.toExponential(2)}`,
                        'Verify this value is correct'
                    );
                }
                if (param.value !== 0 && Math.abs(param.value) < 1e-10) {
                    this.addIssue(
                        Severity.WARNING,
                        ValidationCodes.EXTREME_VALUE,
                        `parameters.${paramId}.value`,
                        `Very small value: ${param.value.toExponential(2)}`,
                        'Verify this value is correct'
                    );
                }
            }
        }
    }

    /**
     * Check for unused parameters
     */
    checkUnusedParameters() {
        const { parameters, states, transitions, strategies } = this.project;
        if (!parameters) return;

        // Collect all parameter references
        const usedParams = new Set();

        const collectRefs = (obj) => {
            if (!obj) return;
            const str = JSON.stringify(obj);
            for (const paramId of Object.keys(parameters)) {
                if (str.includes(paramId)) {
                    usedParams.add(paramId);
                }
            }
        };

        collectRefs(states);
        collectRefs(transitions);
        collectRefs(strategies);

        // Find unused
        for (const paramId of Object.keys(parameters)) {
            if (!usedParams.has(paramId)) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.UNUSED_PARAMETER,
                    `parameters.${paramId}`,
                    'Parameter appears to be unused',
                    'Remove if not needed or reference in model structure'
                );
            }
        }
    }

    /**
     * Check for missing documentation
     */
    checkDocumentation() {
        const { parameters, states } = this.project;

        if (parameters) {
            for (const [paramId, param] of Object.entries(parameters)) {
                if (!param.label && !param.description) {
                    this.addIssue(
                        Severity.INFO,
                        ValidationCodes.MISSING_DESCRIPTION,
                        `parameters.${paramId}`,
                        'Parameter has no label or description',
                        'Add descriptive label and/or description for clarity'
                    );
                }
            }
        }

        if (states) {
            for (const [stateId, state] of Object.entries(states)) {
                if (!state.description) {
                    this.addIssue(
                        Severity.INFO,
                        ValidationCodes.MISSING_DESCRIPTION,
                        `states.${stateId}`,
                        'State has no description',
                        'Add description explaining the health state'
                    );
                }
            }
        }
    }

    // ============ NICE COMPLIANCE CHECKS ============

    /**
     * Check time horizon is appropriate
     */
    checkTimeHorizon() {
        const { settings } = this.project;
        if (!settings) return;

        const timeHorizon = settings.time_horizon;
        if (timeHorizon === undefined) {
            this.addIssue(
                Severity.ERROR,
                ValidationCodes.TIME_HORIZON_INVALID,
                'settings.time_horizon',
                'Time horizon not specified',
                'Specify time horizon in years. NICE typically requires lifetime horizon.'
            );
            return;
        }

        if (timeHorizon < 0) {
            this.addIssue(
                Severity.ERROR,
                ValidationCodes.TIME_HORIZON_INVALID,
                'settings.time_horizon',
                'Time horizon cannot be negative'
            );
        }

        if (timeHorizon < 5) {
            this.addIssue(
                Severity.WARNING,
                ValidationCodes.SHORT_TIME_HORIZON,
                'settings.time_horizon',
                `Time horizon of ${timeHorizon} years may be too short`,
                'NICE reference case typically requires lifetime horizon unless justified'
            );
        }

        // Check if starting age + time horizon exceeds realistic lifespan
        const startingAge = settings.starting_age || 50;
        if (startingAge + timeHorizon > 110) {
            this.addIssue(
                Severity.WARNING,
                ValidationCodes.UNREALISTIC_LIFE_YEARS,
                'settings.time_horizon',
                `Model extends to age ${startingAge + timeHorizon}, which exceeds realistic lifespan`,
                'Consider whether all patients would die before end of time horizon'
            );
        }
    }

    /**
     * Check discount rates are appropriate
     */
    checkDiscountRates() {
        const { settings } = this.project;
        if (!settings) return;

        const discountCosts = settings.discount_rate_costs;
        const discountQalys = settings.discount_rate_qalys;

        // NICE reference case: 3.5%
        const niceRate = 0.035;
        const tolerance = 0.001;

        if (discountCosts !== undefined) {
            if (discountCosts < 0 || discountCosts > 0.15) {
                this.addIssue(
                    Severity.ERROR,
                    ValidationCodes.DISCOUNT_RATE_INVALID,
                    'settings.discount_rate_costs',
                    `Discount rate ${discountCosts} is outside plausible range [0, 15%]`
                );
            } else if (Math.abs(discountCosts - niceRate) > tolerance) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.NICE_COMPLIANCE,
                    'settings.discount_rate_costs',
                    `Discount rate ${(discountCosts * 100).toFixed(1)}% differs from NICE reference case (3.5%)`,
                    'NICE reference case uses 3.5% for costs. Deviation requires justification.'
                );
            }
        }

        if (discountQalys !== undefined) {
            if (discountQalys < 0 || discountQalys > 0.15) {
                this.addIssue(
                    Severity.ERROR,
                    ValidationCodes.DISCOUNT_RATE_INVALID,
                    'settings.discount_rate_qalys',
                    `Discount rate ${discountQalys} is outside plausible range [0, 15%]`
                );
            } else if (Math.abs(discountQalys - niceRate) > tolerance) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.NICE_COMPLIANCE,
                    'settings.discount_rate_qalys',
                    `Discount rate ${(discountQalys * 100).toFixed(1)}% differs from NICE reference case (3.5%)`,
                    'NICE reference case uses 3.5% for QALYs. Deviation requires justification.'
                );
            }
        }

        // Check differential discounting
        if (discountCosts !== undefined && discountQalys !== undefined) {
            if (Math.abs(discountCosts - discountQalys) > tolerance) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.NICE_COMPLIANCE,
                    'settings',
                    'Different discount rates for costs and QALYs',
                    'NICE reference case uses equal discount rates. Differential discounting requires justification.'
                );
            }
        }
    }

    /**
     * Check clinical plausibility of parameter values
     */
    checkClinicalPlausibility() {
        const { parameters, states } = this.project;

        // Check mortality rates
        if (parameters) {
            for (const [paramId, param] of Object.entries(parameters)) {
                const label = (param.label || paramId).toLowerCase();
                const value = param.value;

                if (typeof value !== 'number') continue;

                // Mortality rate checks
                if (label.includes('death') || label.includes('mortality') || paramId.includes('death')) {
                    if (value > 0.5 && !label.includes('annual')) {
                        this.addIssue(
                            Severity.WARNING,
                            ValidationCodes.CLINICAL_IMPLAUSIBILITY,
                            `parameters.${paramId}`,
                            `Death probability ${value} seems high for a single cycle`,
                            'Verify this represents cycle-specific, not annual, mortality'
                        );
                    }
                }

                // Hazard ratio checks
                if (label.includes('hazard') || label.includes('hr') || paramId.includes('hr_')) {
                    if (value < 0) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.CLINICAL_IMPLAUSIBILITY,
                            `parameters.${paramId}`,
                            'Hazard ratio cannot be negative'
                        );
                    }
                    if (value > 10) {
                        this.addIssue(
                            Severity.WARNING,
                            ValidationCodes.CLINICAL_IMPLAUSIBILITY,
                            `parameters.${paramId}`,
                            `Hazard ratio ${value} is unusually high`,
                            'Verify this extreme treatment effect is supported by evidence'
                        );
                    }
                    if (value > 0 && value < 0.1) {
                        this.addIssue(
                            Severity.WARNING,
                            ValidationCodes.CLINICAL_IMPLAUSIBILITY,
                            `parameters.${paramId}`,
                            `Hazard ratio ${value} implies >90% risk reduction`,
                            'Such large treatment effects are rare in clinical practice'
                        );
                    }
                }

                // Cost checks
                if (label.includes('cost') || paramId.startsWith('c_')) {
                    if (value > 1000000) {
                        this.addIssue(
                            Severity.WARNING,
                            ValidationCodes.EXTREME_VALUE,
                            `parameters.${paramId}`,
                            `Cost £${value.toLocaleString()} per cycle is very high`,
                            'Verify this is the correct per-cycle cost'
                        );
                    }
                }
            }
        }

        // Check utility values for clinical plausibility
        if (states) {
            for (const [stateId, state] of Object.entries(states)) {
                if (typeof state.utility === 'number') {
                    const label = (state.label || stateId).toLowerCase();

                    // Dead state should have utility 0
                    if ((label.includes('dead') || label.includes('death')) && state.utility !== 0) {
                        this.addIssue(
                            Severity.WARNING,
                            ValidationCodes.UTILITY_OUT_OF_RANGE,
                            `states.${stateId}.utility`,
                            `Death state has utility ${state.utility}, expected 0`,
                            'Death states should have utility 0'
                        );
                    }

                    // Healthy states should have high utility
                    if (label.includes('healthy') && state.utility < 0.8) {
                        this.addIssue(
                            Severity.INFO,
                            ValidationCodes.CLINICAL_IMPLAUSIBILITY,
                            `states.${stateId}.utility`,
                            `Healthy state has utility ${state.utility}`,
                            'Healthy states typically have utility ≥0.8'
                        );
                    }
                }
            }
        }
    }

    /**
     * Check PSA configuration
     */
    checkPSAConfiguration() {
        const { parameters } = this.project;
        if (!parameters) return;

        let paramsWithDist = 0;
        let paramsWithoutDist = 0;
        let fixedParams = 0;

        for (const [paramId, param] of Object.entries(parameters)) {
            if (param.distribution) {
                paramsWithDist++;

                // Check distribution parameters are valid
                const dist = param.distribution;
                if (dist.type === 'beta') {
                    if (dist.alpha !== undefined && dist.alpha <= 0) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.NEGATIVE_VALUE,
                            `parameters.${paramId}.distribution.alpha`,
                            'Beta distribution alpha must be positive'
                        );
                    }
                    if (dist.beta !== undefined && dist.beta <= 0) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.NEGATIVE_VALUE,
                            `parameters.${paramId}.distribution.beta`,
                            'Beta distribution beta must be positive'
                        );
                    }
                }

                if (dist.type === 'gamma') {
                    if (dist.shape !== undefined && dist.shape <= 0) {
                        this.addIssue(
                            Severity.ERROR,
                            ValidationCodes.NEGATIVE_VALUE,
                            `parameters.${paramId}.distribution.shape`,
                            'Gamma distribution shape must be positive'
                        );
                    }
                }
            } else if (typeof param.value === 'number') {
                if (param.value !== 0 && param.value !== 1) {
                    paramsWithoutDist++;
                } else {
                    fixedParams++;
                }
            }
        }

        // Check if sufficient parameters have distributions for PSA
        const totalParams = paramsWithDist + paramsWithoutDist;
        if (totalParams > 0 && paramsWithoutDist > paramsWithDist) {
            this.addIssue(
                Severity.WARNING,
                ValidationCodes.MISSING_DISTRIBUTIONS,
                'parameters',
                `${paramsWithoutDist} of ${totalParams} uncertain parameters lack distributions`,
                'Add distributions to enable comprehensive PSA. NICE requires structural uncertainty to be explored.'
            );
        }
    }

    /**
     * Check NICE reference case compliance
     */
    checkNICECompliance() {
        const { settings, model, strategies } = this.project;

        // Check half-cycle correction
        if (settings && settings.half_cycle_correction === 'none') {
            this.addIssue(
                Severity.INFO,
                ValidationCodes.NICE_COMPLIANCE,
                'settings.half_cycle_correction',
                'No half-cycle correction applied',
                'NICE reference case typically expects half-cycle correction'
            );
        }

        // Check perspective (should be NHS/PSS)
        if (settings && settings.perspective) {
            const perspective = settings.perspective.toLowerCase();
            if (!perspective.includes('nhs') && !perspective.includes('pss') && !perspective.includes('healthcare')) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.NICE_COMPLIANCE,
                    'settings.perspective',
                    `Perspective '${settings.perspective}' may not align with NICE reference case`,
                    'NICE reference case uses NHS and PSS perspective'
                );
            }
        }

        // Check for comparator strategy
        if (strategies) {
            const hasComparator = Object.values(strategies).some(s => s.is_comparator);
            if (Object.keys(strategies).length > 1 && !hasComparator) {
                this.addIssue(
                    Severity.WARNING,
                    ValidationCodes.NO_COMPARATOR,
                    'strategies',
                    'Multiple strategies but no comparator defined',
                    'Define is_comparator: true for the baseline strategy'
                );
            }
        }

        // Check model type
        if (model && model.type) {
            const supportedTypes = ['markov_cohort', 'partitioned_survival', 'decision_tree'];
            if (!supportedTypes.includes(model.type)) {
                this.addIssue(
                    Severity.INFO,
                    ValidationCodes.BEST_PRACTICE,
                    'model.type',
                    `Model type '${model.type}' may require additional validation`,
                    'Ensure model structure is appropriate for the decision problem'
                );
            }
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SemanticValidator = SemanticValidator;
    window.Severity = Severity;
    window.ValidationCodes = ValidationCodes;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SemanticValidator, Severity, ValidationCodes };
}
