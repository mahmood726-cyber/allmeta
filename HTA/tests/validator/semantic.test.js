/**
 * Tests for src/validator/semantic.js — SemanticValidator, Severity, ValidationCodes
 */

'use strict';

const { SemanticValidator, Severity, ValidationCodes } = require('../../src/validator/semantic');

// Stub ExpressionParser so validateExpressions() does not throw on missing global
if (typeof global.ExpressionParser === 'undefined') {
    global.ExpressionParser = {
        validate: (expr) => ({ valid: true }),
        analyzeDepedencies: (exprs) => ({ cycles: [] })
    };
}

// ---------------------------------------------------------------------------
// Helper: minimal valid project for SemanticValidator
// ---------------------------------------------------------------------------
function makeProject(overrides = {}) {
    return {
        version: '0.1',
        metadata: { id: 'test', name: 'Test' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 40,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'trapezoidal',
            starting_age: 60,
            ...overrides.settings
        },
        parameters: {
            p_death: {
                value: 0.1,
                label: 'Annual mortality probability',
                description: 'Probability of death per cycle',
                distribution: { type: 'beta', alpha: 10, beta: 90 }
            },
            ...overrides.parameters
        },
        states: {
            alive: {
                label: 'Alive',
                description: 'Patient is alive',
                type: 'transient',
                initial_probability: 1.0,
                cost: 1000,
                utility: 0.8
            },
            dead: {
                label: 'Dead',
                description: 'Absorbing state',
                type: 'absorbing',
                initial_probability: 0,
                cost: 0,
                utility: 0
            },
            ...overrides.states
        },
        transitions: {
            alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
            alive_to_dead: { from: 'alive', to: 'dead', probability: 0.1 },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 },
            ...overrides.transitions
        },
        strategies: {
            base: { label: 'Base Case', is_comparator: true },
            ...overrides.strategies
        },
        evidence: {
            ev1: { source: 'ONS', citation: 'ONS 2023' },
            ...overrides.evidence
        },
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// Severity and ValidationCodes exports
// ---------------------------------------------------------------------------
describe('Severity and ValidationCodes', () => {
    test('Severity contains ERROR, WARNING, INFO', () => {
        expect(Severity.ERROR).toBe('ERROR');
        expect(Severity.WARNING).toBe('WARNING');
        expect(Severity.INFO).toBe('INFO');
    });

    test('error codes start with E0xx', () => {
        expect(ValidationCodes.REF_NOT_FOUND).toMatch(/^E\d+$/);
        expect(ValidationCodes.PROB_OUT_OF_BOUNDS).toMatch(/^E\d+$/);
        expect(ValidationCodes.MASS_CONSERVATION).toMatch(/^E\d+$/);
    });

    test('warning codes start with W0xx', () => {
        expect(ValidationCodes.PROB_NEAR_BOUNDARY).toMatch(/^W\d+$/);
        expect(ValidationCodes.MISSING_EVIDENCE).toMatch(/^W\d+$/);
        expect(ValidationCodes.UTILITY_OUT_OF_RANGE).toMatch(/^W\d+$/);
    });

    test('info codes start with I0xx', () => {
        expect(ValidationCodes.BEST_PRACTICE).toMatch(/^I\d+$/);
        expect(ValidationCodes.MISSING_OPTIONAL).toMatch(/^I\d+$/);
    });
});

// ---------------------------------------------------------------------------
// Valid project passes
// ---------------------------------------------------------------------------
describe('SemanticValidator — valid project', () => {
    test('well-formed project returns valid: true', () => {
        const sv = new SemanticValidator();
        const result = sv.validate(makeProject());
        expect(result.valid).toBe(true);
        expect(result.errors).toBe(0);
    });

    test('result contains issues array', () => {
        const sv = new SemanticValidator();
        const result = sv.validate(makeProject());
        expect(Array.isArray(result.issues)).toBe(true);
    });

    test('result summary has errors, warnings, infos counts', () => {
        const sv = new SemanticValidator();
        const result = sv.validate(makeProject());
        expect(typeof result.errors).toBe('number');
        expect(typeof result.warnings).toBe('number');
        expect(typeof result.infos).toBe('number');
    });
});

// ---------------------------------------------------------------------------
// Reference integrity
// ---------------------------------------------------------------------------
describe('SemanticValidator — reference integrity', () => {
    test('transition referencing nonexistent state produces error E001', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                bad: { from: 'alive', to: 'nonexistent_state', probability: 0.1 },
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const refErrors = result.issues.filter(i =>
            i.code === ValidationCodes.REF_NOT_FOUND && i.severity === Severity.ERROR
        );
        expect(refErrors.length).toBeGreaterThanOrEqual(1);
        expect(refErrors[0].path).toContain('bad.to');
    });

    test('transition from nonexistent state produces error', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                bad: { from: 'ghost', to: 'dead', probability: 0.1 },
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.1 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const refErrors = result.issues.filter(i =>
            i.code === ValidationCodes.REF_NOT_FOUND && i.severity === Severity.ERROR
        );
        expect(refErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('parameter evidence_id referencing nonexistent evidence produces warning', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.1,
                    label: 'Mortality',
                    description: 'desc',
                    evidence_id: 'nonexistent_evidence',
                    distribution: { type: 'beta', alpha: 10, beta: 90 }
                }
            }
        });
        const result = sv.validate(project);
        const refWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.REF_NOT_FOUND && i.severity === Severity.WARNING
        );
        expect(refWarnings.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Probability bounds
// ---------------------------------------------------------------------------
describe('SemanticValidator — probability bounds', () => {
    test('transition probability > 1 produces error E002', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                alive_to_dead: { from: 'alive', to: 'dead', probability: 1.5 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const probErrors = result.issues.filter(i =>
            i.code === ValidationCodes.PROB_OUT_OF_BOUNDS
        );
        expect(probErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('transition probability < 0 produces error E002', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                alive_to_dead: { from: 'alive', to: 'dead', probability: -0.1 },
                alive_to_alive: { from: 'alive', to: 'alive', probability: 1.1 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const probErrors = result.issues.filter(i =>
            i.code === ValidationCodes.PROB_OUT_OF_BOUNDS
        );
        expect(probErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('initial_probability > 1 produces error', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            states: {
                alive: {
                    label: 'Alive', description: 'desc', type: 'transient',
                    initial_probability: 2.0, cost: 0, utility: 0.8
                },
                dead: {
                    label: 'Dead', description: 'desc', type: 'absorbing',
                    initial_probability: 0, cost: 0, utility: 0
                }
            }
        });
        const result = sv.validate(project);
        const probErrors = result.issues.filter(i =>
            i.code === ValidationCodes.PROB_OUT_OF_BOUNDS
        );
        expect(probErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('valid probabilities [0,1] produce no probability errors', () => {
        const sv = new SemanticValidator();
        const result = sv.validate(makeProject());
        const probErrors = result.issues.filter(i =>
            i.code === ValidationCodes.PROB_OUT_OF_BOUNDS
        );
        expect(probErrors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Mass conservation
// ---------------------------------------------------------------------------
describe('SemanticValidator — mass conservation', () => {
    test('transition row not summing to 1 produces error E003', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.5 },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.3 },
                // sum = 0.8, not 1.0
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const massErrors = result.issues.filter(i =>
            i.code === ValidationCodes.MASS_CONSERVATION
        );
        expect(massErrors.length).toBeGreaterThanOrEqual(1);
        expect(massErrors[0].severity).toBe(Severity.ERROR);
    });

    test('transition row summing to 1 passes mass conservation', () => {
        const sv = new SemanticValidator();
        const result = sv.validate(makeProject());
        const massErrors = result.issues.filter(i =>
            i.code === ValidationCodes.MASS_CONSERVATION
        );
        expect(massErrors).toHaveLength(0);
    });

    test('absorbing state skips mass conservation check', () => {
        const sv = new SemanticValidator();
        // Dead state has no outgoing transitions except self — but we omit self-loop
        // The absorbing type should skip the check
        const project = makeProject({
            transitions: {
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.1 }
                // No dead_to_dead — absorbing should be skipped
            }
        });
        const result = sv.validate(project);
        const massErrors = result.issues.filter(i =>
            i.code === ValidationCodes.MASS_CONSERVATION
        );
        expect(massErrors).toHaveLength(0);
    });

    test('expression-based transitions skip mass conservation', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                alive_to_alive: { from: 'alive', to: 'alive', probability: '1 - p_death' },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 'p_death' },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const massErrors = result.issues.filter(i =>
            i.code === ValidationCodes.MASS_CONSERVATION
        );
        expect(massErrors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Clinical plausibility warnings
// ---------------------------------------------------------------------------
describe('SemanticValidator — clinical plausibility', () => {
    test('utility > 1 produces warning W003', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            states: {
                alive: {
                    label: 'Alive', description: 'desc', type: 'transient',
                    initial_probability: 1.0, cost: 1000, utility: 1.5
                },
                dead: {
                    label: 'Dead', description: 'desc', type: 'absorbing',
                    initial_probability: 0, cost: 0, utility: 0
                }
            }
        });
        const result = sv.validate(project);
        const utilWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.UTILITY_OUT_OF_RANGE
        );
        expect(utilWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test('negative utility produces warning (states worse than death)', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            states: {
                alive: {
                    label: 'Alive', description: 'desc', type: 'transient',
                    initial_probability: 1.0, cost: 1000, utility: -0.3
                },
                dead: {
                    label: 'Dead', description: 'desc', type: 'absorbing',
                    initial_probability: 0, cost: 0, utility: 0
                }
            }
        });
        const result = sv.validate(project);
        const utilWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.UTILITY_OUT_OF_RANGE
        );
        expect(utilWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test('high death probability triggers clinical plausibility warning', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.8,
                    label: 'Death probability',
                    description: 'High per-cycle mortality',
                    distribution: { type: 'beta', alpha: 80, beta: 20 }
                }
            }
        });
        const result = sv.validate(project);
        const clinWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.CLINICAL_IMPLAUSIBILITY || i.code === 'E011'
        );
        expect(clinWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test('extreme parameter value (>1e10) produces warning W004', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.1,
                    label: 'Mortality',
                    description: 'desc',
                    distribution: { type: 'beta', alpha: 10, beta: 90 }
                },
                c_extreme: {
                    value: 2e11,
                    label: 'Extreme cost',
                    description: 'desc'
                }
            }
        });
        const result = sv.validate(project);
        const extremeWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.EXTREME_VALUE
        );
        expect(extremeWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test('very small parameter value triggers warning', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.1,
                    label: 'Mortality',
                    description: 'desc',
                    distribution: { type: 'beta', alpha: 10, beta: 90 }
                },
                tiny: {
                    value: 1e-12,
                    label: 'Tiny param',
                    description: 'desc'
                }
            }
        });
        const result = sv.validate(project);
        const extremeWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.EXTREME_VALUE
        );
        expect(extremeWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test('near-boundary probability produces warning W001', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            transitions: {
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9999 },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.0001 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = sv.validate(project);
        const nearBound = result.issues.filter(i =>
            i.code === ValidationCodes.PROB_NEAR_BOUNDARY
        );
        expect(nearBound.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// State structure
// ---------------------------------------------------------------------------
describe('SemanticValidator — state structure', () => {
    test('no initial state produces error E010', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            states: {
                alive: {
                    label: 'Alive', description: 'desc', type: 'transient',
                    initial_probability: 0, cost: 1000, utility: 0.8
                },
                dead: {
                    label: 'Dead', description: 'desc', type: 'absorbing',
                    initial_probability: 0, cost: 0, utility: 0
                }
            }
        });
        const result = sv.validate(project);
        const noInitErrors = result.issues.filter(i =>
            i.code === ValidationCodes.NO_INITIAL_STATE
        );
        expect(noInitErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('no absorbing state produces warning W007', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            states: {
                s1: {
                    label: 'S1', description: 'desc', type: 'transient',
                    initial_probability: 1.0, cost: 100, utility: 0.8
                },
                s2: {
                    label: 'S2', description: 'desc', type: 'transient',
                    initial_probability: 0, cost: 100, utility: 0.6
                }
            }
        });
        const result = sv.validate(project);
        const noAbsorbing = result.issues.filter(i =>
            i.code === ValidationCodes.NO_ABSORBING_STATE
        );
        expect(noAbsorbing.length).toBeGreaterThanOrEqual(1);
        expect(noAbsorbing[0].severity).toBe(Severity.WARNING);
    });
});

// ---------------------------------------------------------------------------
// Negative values
// ---------------------------------------------------------------------------
describe('SemanticValidator — negative values', () => {
    test('negative state cost produces error E004', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            states: {
                alive: {
                    label: 'Alive', description: 'desc', type: 'transient',
                    initial_probability: 1.0, cost: -500, utility: 0.8
                },
                dead: {
                    label: 'Dead', description: 'desc', type: 'absorbing',
                    initial_probability: 0, cost: 0, utility: 0
                }
            }
        });
        const result = sv.validate(project);
        const negErrors = result.issues.filter(i =>
            i.code === ValidationCodes.NEGATIVE_VALUE
        );
        expect(negErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('negative time_horizon produces error', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            settings: {
                time_horizon: -5,
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                starting_age: 60
            }
        });
        const result = sv.validate(project);
        const negErrors = result.issues.filter(i =>
            i.severity === Severity.ERROR &&
            (i.code === ValidationCodes.NEGATIVE_VALUE || i.code === ValidationCodes.TIME_HORIZON_INVALID)
        );
        expect(negErrors.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// NICE compliance checks
// ---------------------------------------------------------------------------
describe('SemanticValidator — NICE compliance', () => {
    test('short time horizon (<5) produces warning W009', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            settings: {
                time_horizon: 2,
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                starting_age: 60
            }
        });
        const result = sv.validate(project);
        const shortHorizon = result.issues.filter(i =>
            i.code === ValidationCodes.SHORT_TIME_HORIZON
        );
        expect(shortHorizon.length).toBeGreaterThanOrEqual(1);
    });

    test('discount rate outside plausible range produces error E013', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            settings: {
                time_horizon: 40,
                cycle_length: 1,
                discount_rate_costs: 0.25,
                discount_rate_qalys: 0.035,
                starting_age: 60
            }
        });
        const result = sv.validate(project);
        const discErrors = result.issues.filter(i =>
            i.code === ValidationCodes.DISCOUNT_RATE_INVALID
        );
        expect(discErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('non-NICE discount rate produces info I005', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            settings: {
                time_horizon: 40,
                cycle_length: 1,
                discount_rate_costs: 0.05,
                discount_rate_qalys: 0.05,
                starting_age: 60
            }
        });
        const result = sv.validate(project);
        const niceInfos = result.issues.filter(i =>
            i.code === ValidationCodes.NICE_COMPLIANCE
        );
        expect(niceInfos.length).toBeGreaterThanOrEqual(1);
    });

    test('missing time_horizon produces error E012', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            settings: {
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                starting_age: 60
            }
        });
        delete project.settings.time_horizon;
        const result = sv.validate(project);
        const thErrors = result.issues.filter(i =>
            i.code === ValidationCodes.TIME_HORIZON_INVALID
        );
        expect(thErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('multiple strategies without comparator produces warning', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            strategies: {
                arm_a: { label: 'Treatment A' },
                arm_b: { label: 'Treatment B' }
            }
        });
        const result = sv.validate(project);
        const compWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.NO_COMPARATOR || i.code === ValidationCodes.MISSING_REQUIRED
        );
        expect(compWarnings.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Documentation and evidence checks
// ---------------------------------------------------------------------------
describe('SemanticValidator — documentation checks', () => {
    test('parameter without evidence_id produces info about missing evidence', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.1,
                    label: 'Mortality',
                    description: 'desc',
                    distribution: { type: 'beta', alpha: 10, beta: 90 }
                    // no evidence_id
                }
            }
        });
        const result = sv.validate(project);
        const evidenceInfos = result.issues.filter(i =>
            i.code === ValidationCodes.MISSING_EVIDENCE
        );
        expect(evidenceInfos.length).toBeGreaterThanOrEqual(1);
    });

    test('parameter without label or description produces info', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.1,
                    distribution: { type: 'beta', alpha: 10, beta: 90 }
                    // no label, no description
                }
            }
        });
        const result = sv.validate(project);
        const docInfos = result.issues.filter(i =>
            i.code === ValidationCodes.MISSING_DESCRIPTION
        );
        expect(docInfos.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// PSA configuration
// ---------------------------------------------------------------------------
describe('SemanticValidator — PSA configuration', () => {
    test('negative beta distribution alpha produces error', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p_death: {
                    value: 0.1,
                    label: 'Mortality',
                    description: 'desc',
                    distribution: { type: 'beta', alpha: -1, beta: 90 }
                }
            }
        });
        const result = sv.validate(project);
        const distErrors = result.issues.filter(i =>
            i.code === ValidationCodes.NEGATIVE_VALUE &&
            i.path.includes('distribution')
        );
        expect(distErrors.length).toBeGreaterThanOrEqual(1);
    });

    test('most parameters lacking distributions produces warning W013', () => {
        const sv = new SemanticValidator();
        const project = makeProject({
            parameters: {
                p1: { value: 0.1, label: 'P1', description: 'desc' },
                p2: { value: 0.2, label: 'P2', description: 'desc' },
                p3: { value: 0.3, label: 'P3', description: 'desc' },
                p4: {
                    value: 0.4,
                    label: 'P4',
                    description: 'desc',
                    distribution: { type: 'beta', alpha: 40, beta: 60 }
                }
            }
        });
        const result = sv.validate(project);
        const distWarnings = result.issues.filter(i =>
            i.code === ValidationCodes.MISSING_DISTRIBUTIONS
        );
        expect(distWarnings.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Edge: missing sections
// ---------------------------------------------------------------------------
describe('SemanticValidator — missing optional sections', () => {
    test('missing parameters section does not throw', () => {
        const sv = new SemanticValidator();
        const project = makeProject();
        delete project.parameters;
        expect(() => sv.validate(project)).not.toThrow();
    });

    test('missing states section does not throw', () => {
        const sv = new SemanticValidator();
        const project = makeProject();
        delete project.states;
        expect(() => sv.validate(project)).not.toThrow();
    });

    test('missing transitions section does not throw', () => {
        const sv = new SemanticValidator();
        const project = makeProject();
        delete project.transitions;
        expect(() => sv.validate(project)).not.toThrow();
    });

    test('missing strategies section does not throw', () => {
        const sv = new SemanticValidator();
        const project = makeProject();
        delete project.strategies;
        expect(() => sv.validate(project)).not.toThrow();
    });

    test('missing settings section does not throw', () => {
        const sv = new SemanticValidator();
        const project = makeProject();
        delete project.settings;
        expect(() => sv.validate(project)).not.toThrow();
    });
});
