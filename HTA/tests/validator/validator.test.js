/**
 * Tests for src/validator/validator.js — HTAValidator
 *
 * HTAValidator depends on SchemaValidator and SemanticValidator being in scope.
 * We inject them via global before requiring the module.
 */

'use strict';

// Load dependencies that HTAValidator references as globals
const { HTASchemas, SchemaValidator } = require('../../src/validator/schema');
const { SemanticValidator, Severity, ValidationCodes } = require('../../src/validator/semantic');

// Inject globals so HTAValidator constructor can find them
global.SchemaValidator = SchemaValidator;
global.SemanticValidator = SemanticValidator;
global.HTASchemas = HTASchemas;
global.Severity = Severity;
global.ValidationCodes = ValidationCodes;

// Stub ExpressionParser for SemanticValidator
if (typeof global.ExpressionParser === 'undefined') {
    global.ExpressionParser = {
        validate: (expr) => ({ valid: true }),
        analyzeDepedencies: (exprs) => ({ cycles: [] })
    };
}

// Stub JSZip so the instanceof check doesn't throw
if (typeof global.JSZip === 'undefined') {
    global.JSZip = class JSZip {};
}

// Stub performance.now for jsdom
if (typeof performance === 'undefined') {
    global.performance = { now: () => Date.now() };
}

const { HTAValidator } = require('../../src/validator/validator');

// ---------------------------------------------------------------------------
// Helper: minimal valid project
// ---------------------------------------------------------------------------
function makeValidProject(overrides = {}) {
    return {
        version: '0.1',
        metadata: {
            id: 'test_model',
            name: 'Test Model',
            description: 'A test model',
            ...overrides.metadata
        },
        model: {
            type: 'markov_cohort',
            ...overrides.model
        },
        settings: {
            time_horizon: 40,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'trapezoidal',
            starting_age: 60,
            perspective: 'NHS and PSS',
            ...overrides.settings
        },
        parameters: {
            p_death: {
                value: 0.1,
                label: 'Annual mortality probability',
                description: 'Probability of death per cycle',
                distribution: { type: 'beta', alpha: 10, beta: 90 },
                evidence_id: 'ev1'
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
// Constructor
// ---------------------------------------------------------------------------
describe('HTAValidator — constructor', () => {
    test('constructs without errors', () => {
        const v = new HTAValidator();
        expect(v).toBeDefined();
        expect(v.schemaValidator).toBeInstanceOf(SchemaValidator);
        expect(v.semanticValidator).toBeInstanceOf(SemanticValidator);
        expect(v.results).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// validateProject() with direct object
// ---------------------------------------------------------------------------
describe('HTAValidator — validateProject with direct object', () => {
    test('valid minimal project returns valid: true', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('result has errors, warnings, infos arrays', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        expect(Array.isArray(result.errors)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(Array.isArray(result.infos)).toBe(true);
    });

    test('result has validationTime', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        expect(typeof result.validationTime).toBe('number');
        expect(result.validationTime).toBeGreaterThanOrEqual(0);
    });

    test('result.project is set to the input object', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        const result = v.validateProject(project);
        expect(result.project).toBe(project);
    });
});

// ---------------------------------------------------------------------------
// validateProject() — schema errors
// ---------------------------------------------------------------------------
describe('HTAValidator — schema validation errors', () => {
    test('missing version produces schema error', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        delete project.version;
        const result = v.validateProject(project);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.code === 'SCHEMA_REQUIRED')).toBe(true);
    });

    test('missing metadata produces schema error', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        delete project.metadata;
        const result = v.validateProject(project);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'SCHEMA_REQUIRED')).toBe(true);
    });

    test('invalid model type produces schema error', () => {
        const v = new HTAValidator();
        const project = makeValidProject({ model: { type: 'invalid' } });
        const result = v.validateProject(project);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'SCHEMA_ENUM')).toBe(true);
    });

    test('wrong type for version produces schema error', () => {
        const v = new HTAValidator();
        const project = makeValidProject({ version: 123 });
        const result = v.validateProject(project);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'SCHEMA_TYPE')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// validateProject() — semantic errors
// ---------------------------------------------------------------------------
describe('HTAValidator — semantic validation issues', () => {
    test('transition to nonexistent state produces error in result', () => {
        const v = new HTAValidator();
        const project = makeValidProject({
            transitions: {
                bad: { from: 'alive', to: 'nowhere', probability: 0.1 },
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = v.validateProject(project);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'E001')).toBe(true);
    });

    test('probability > 1 produces error in result', () => {
        const v = new HTAValidator();
        const project = makeValidProject({
            transitions: {
                alive_to_dead: { from: 'alive', to: 'dead', probability: 1.5 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = v.validateProject(project);
        expect(result.valid).toBe(false);
    });

    test('semantic warnings appear in result.warnings', () => {
        const v = new HTAValidator();
        // Near-boundary probability should trigger W001
        const project = makeValidProject({
            transitions: {
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9999 },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.0001 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = v.validateProject(project);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('issues have severity field', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        delete project.version;
        const result = v.validateProject(project);
        for (const err of result.errors) {
            expect(err.severity).toBe('ERROR');
        }
    });
});

// ---------------------------------------------------------------------------
// generateReport()
// ---------------------------------------------------------------------------
describe('HTAValidator — generateReport', () => {
    test('returns formatted string for valid project', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        const report = v.generateReport(result);
        expect(typeof report).toBe('string');
        expect(report).toContain('VALIDATION PASSED');
    });

    test('returns FAILED string for invalid project', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        delete project.version;
        const result = v.validateProject(project);
        const report = v.generateReport(result);
        expect(report).toContain('VALIDATION FAILED');
    });

    test('report includes error details', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        delete project.version;
        const result = v.validateProject(project);
        const report = v.generateReport(result);
        expect(report).toContain('Errors:');
        expect(report).toContain('SCHEMA_REQUIRED');
    });

    test('report with no results returns fallback message', () => {
        const v = new HTAValidator();
        const report = v.generateReport(null);
        expect(report).toBe('No validation results available');
    });

    test('report includes Summary section', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        const report = v.generateReport(result);
        expect(report).toContain('Summary:');
    });

    test('report with warnings shows warning count', () => {
        const v = new HTAValidator();
        const project = makeValidProject({
            transitions: {
                alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9999 },
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.0001 },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
            }
        });
        const result = v.validateProject(project);
        if (result.warnings.length > 0) {
            const report = v.generateReport(result);
            expect(report).toContain('Warnings:');
        }
    });
});

// ---------------------------------------------------------------------------
// generateJSONReport()
// ---------------------------------------------------------------------------
describe('HTAValidator — generateJSONReport', () => {
    test('returns object with expected shape', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        const jsonReport = v.generateJSONReport(result);

        expect(typeof jsonReport).toBe('object');
        expect(typeof jsonReport.valid).toBe('boolean');
        expect(jsonReport.summary).toBeDefined();
        expect(typeof jsonReport.summary.errors).toBe('number');
        expect(typeof jsonReport.summary.warnings).toBe('number');
        expect(typeof jsonReport.summary.infos).toBe('number');
        expect(typeof jsonReport.summary.validationTime).toBe('number');
        expect(Array.isArray(jsonReport.errors)).toBe(true);
        expect(Array.isArray(jsonReport.warnings)).toBe(true);
        expect(Array.isArray(jsonReport.infos)).toBe(true);
        expect(Array.isArray(jsonReport.files)).toBe(true);
    });

    test('valid project has valid: true in JSON report', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        const jsonReport = v.generateJSONReport(result);
        expect(jsonReport.valid).toBe(true);
    });

    test('invalid project has valid: false and errors populated', () => {
        const v = new HTAValidator();
        const project = makeValidProject();
        delete project.version;
        const result = v.validateProject(project);
        const jsonReport = v.generateJSONReport(result);
        expect(jsonReport.valid).toBe(false);
        expect(jsonReport.summary.errors).toBeGreaterThan(0);
        expect(jsonReport.errors.length).toBeGreaterThan(0);
    });

    test('JSON report issues array matches errors + warnings + infos', () => {
        const v = new HTAValidator();
        const result = v.validateProject(makeValidProject());
        const jsonReport = v.generateJSONReport(result);
        const total = jsonReport.errors.length + jsonReport.warnings.length + jsonReport.infos.length;
        expect(total).toBe(jsonReport.summary.errors + jsonReport.summary.warnings + jsonReport.summary.infos);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('HTAValidator — edge cases', () => {
    test('empty object fails validation', () => {
        const v = new HTAValidator();
        const result = v.validateProject({});
        expect(result.valid).toBe(false);
    });

    test('null project throws (semantic validator cannot destructure null)', () => {
        const v = new HTAValidator();
        // Schema validation fails on null but semantic validator destructures this.project
        // which throws. This is expected behavior — null is not a valid project.
        expect(() => v.validateProject(null)).toThrow();
    });

    test('multiple validation calls work independently', () => {
        const v = new HTAValidator();

        // First: invalid
        const r1 = v.validateProject({});
        expect(r1.valid).toBe(false);

        // Second: valid
        const r2 = v.validateProject(makeValidProject());
        expect(r2.valid).toBe(true);
        expect(r2.errors).toHaveLength(0);
    });
});
