/**
 * Tests for src/validator/schema.js — HTASchemas and SchemaValidator
 */

'use strict';

const { HTASchemas, SchemaValidator } = require('../../src/validator/schema');

// ---------------------------------------------------------------------------
// Helper: minimal valid project object matching HTASchemas.project
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
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            ...overrides.settings
        },
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// HTASchemas existence and structure
// ---------------------------------------------------------------------------
describe('HTASchemas', () => {
    test('exports project, results, and manifest schemas', () => {
        expect(HTASchemas.project).toBeDefined();
        expect(HTASchemas.results).toBeDefined();
        expect(HTASchemas.manifest).toBeDefined();
    });

    test('project schema requires version, metadata, model', () => {
        expect(HTASchemas.project.required).toEqual(
            expect.arrayContaining(['version', 'metadata', 'model'])
        );
    });

    test('results schema requires version, run_id, timestamp, deterministic', () => {
        expect(HTASchemas.results.required).toEqual(
            expect.arrayContaining(['version', 'run_id', 'timestamp', 'deterministic'])
        );
    });

    test('manifest schema requires version, files', () => {
        expect(HTASchemas.manifest.required).toEqual(
            expect.arrayContaining(['version', 'files'])
        );
    });
});

// ---------------------------------------------------------------------------
// SchemaValidator — valid project
// ---------------------------------------------------------------------------
describe('SchemaValidator — valid data', () => {
    let sv;
    beforeEach(() => {
        sv = new SchemaValidator();
    });

    test('valid minimal project passes', () => {
        const project = makeValidProject();
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(true);
        expect(sv.getErrors()).toHaveLength(0);
    });

    test('valid project with all optional sections passes', () => {
        const project = makeValidProject({
            parameters: {
                p_death: { value: 0.1, label: 'Mortality', description: 'Annual death probability' }
            },
            states: {
                alive: { label: 'Alive', type: 'transient', initial_probability: 1.0, cost: 1000, utility: 0.8 },
                dead: { label: 'Dead', type: 'absorbing', initial_probability: 0, cost: 0, utility: 0 }
            },
            transitions: {
                alive_to_dead: { from: 'alive', to: 'dead', probability: 0.1 }
            },
            strategies: {
                base: { label: 'Base Case', is_comparator: true }
            },
            evidence: {
                ev1: { source: 'ONS', citation: 'ONS 2023' }
            }
        });

        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(true);
        expect(sv.getErrors()).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// SchemaValidator — missing required fields
// ---------------------------------------------------------------------------
describe('SchemaValidator — missing required fields', () => {
    let sv;
    beforeEach(() => {
        sv = new SchemaValidator();
    });

    test('missing version fails', () => {
        const project = makeValidProject();
        delete project.version;
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        const errors = sv.getErrors();
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].code).toBe('SCHEMA_REQUIRED');
        expect(errors[0].path).toBe('version');
    });

    test('missing metadata fails', () => {
        const project = makeValidProject();
        delete project.metadata;
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        const errors = sv.getErrors();
        expect(errors.some(e => e.code === 'SCHEMA_REQUIRED' && e.path === 'metadata')).toBe(true);
    });

    test('missing model fails', () => {
        const project = makeValidProject();
        delete project.model;
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        const errors = sv.getErrors();
        expect(errors.some(e => e.code === 'SCHEMA_REQUIRED' && e.path === 'model')).toBe(true);
    });

    test('missing metadata.id fails', () => {
        const project = makeValidProject();
        delete project.metadata.id;
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_REQUIRED')).toBe(true);
    });

    test('missing metadata.name fails', () => {
        const project = makeValidProject();
        delete project.metadata.name;
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_REQUIRED')).toBe(true);
    });

    test('missing model.type fails', () => {
        const project = makeValidProject({ model: {} });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_REQUIRED')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SchemaValidator — invalid types
// ---------------------------------------------------------------------------
describe('SchemaValidator — type validation', () => {
    let sv;
    beforeEach(() => {
        sv = new SchemaValidator();
    });

    test('string where number expected fails (time_horizon)', () => {
        const project = makeValidProject({ settings: { time_horizon: 'ten' } });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_TYPE')).toBe(true);
    });

    test('number where string expected fails (version)', () => {
        const project = makeValidProject({ version: 123 });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_TYPE')).toBe(true);
    });

    test('string where object expected fails (metadata)', () => {
        const project = makeValidProject({ metadata: 'not an object' });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
    });

    test('array where object expected fails', () => {
        const project = makeValidProject({ model: [1, 2, 3] });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SchemaValidator — nested object validation
// ---------------------------------------------------------------------------
describe('SchemaValidator — nested object validation', () => {
    let sv;
    beforeEach(() => {
        sv = new SchemaValidator();
    });

    test('settings discount_rate_costs out of range fails (>1)', () => {
        const project = makeValidProject({
            settings: { time_horizon: 10, cycle_length: 1, discount_rate_costs: 1.5 }
        });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_MAXIMUM')).toBe(true);
    });

    test('settings discount_rate_costs negative fails', () => {
        const project = makeValidProject({
            settings: { time_horizon: 10, cycle_length: 1, discount_rate_costs: -0.01 }
        });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_MINIMUM')).toBe(true);
    });

    test('invalid model type enum fails', () => {
        const project = makeValidProject({ model: { type: 'invalid_model_type' } });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_ENUM')).toBe(true);
    });

    test('valid model type enum passes', () => {
        for (const modelType of ['markov_cohort', 'partitioned_survival', 'decision_tree', 'budget_impact']) {
            const sv2 = new SchemaValidator();
            const project = makeValidProject({ model: { type: modelType } });
            expect(sv2.validate(project, HTASchemas.project)).toBe(true);
        }
    });

    test('invalid half_cycle_correction enum fails', () => {
        const project = makeValidProject({
            settings: { time_horizon: 10, half_cycle_correction: 'wrong' }
        });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_ENUM')).toBe(true);
    });

    test('state initial_probability > 1 fails', () => {
        const project = makeValidProject({
            states: { s1: { label: 'S1', initial_probability: 1.5 } }
        });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_MAXIMUM')).toBe(true);
    });

    test('transition probability accepts both number and string (oneOf)', () => {
        const sv1 = new SchemaValidator();
        const proj1 = makeValidProject({
            transitions: { t1: { from: 'a', to: 'b', probability: 0.5 } }
        });
        expect(sv1.validate(proj1, HTASchemas.project)).toBe(true);

        const sv2 = new SchemaValidator();
        const proj2 = makeValidProject({
            transitions: { t1: { from: 'a', to: 'b', probability: '1 - p_death' } }
        });
        expect(sv2.validate(proj2, HTASchemas.project)).toBe(true);
    });

    test('parameters additionalProperties validated (value required)', () => {
        const project = makeValidProject({
            parameters: { p1: { label: 'No value field' } }
        });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_REQUIRED')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SchemaValidator — edge cases
// ---------------------------------------------------------------------------
describe('SchemaValidator — edge cases', () => {
    let sv;
    beforeEach(() => {
        sv = new SchemaValidator();
    });

    test('empty object fails (missing required)', () => {
        const valid = sv.validate({}, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().length).toBeGreaterThan(0);
    });

    test('null fails type check for object', () => {
        const valid = sv.validate(null, HTASchemas.project);
        expect(valid).toBe(false);
    });

    test('validate with no schema returns true', () => {
        const valid = sv.validate({ anything: true }, null);
        expect(valid).toBe(true);
    });

    test('validate resets errors on each call', () => {
        sv.validate({}, HTASchemas.project);
        expect(sv.getErrors().length).toBeGreaterThan(0);

        sv.validate(makeValidProject(), HTASchemas.project);
        expect(sv.getErrors()).toHaveLength(0);
    });

    test('getWarnings returns array', () => {
        sv.validate(makeValidProject(), HTASchemas.project);
        expect(Array.isArray(sv.getWarnings())).toBe(true);
    });

    test('version pattern validation: "0.1" passes', () => {
        const project = makeValidProject({ version: '0.1' });
        expect(sv.validate(project, HTASchemas.project)).toBe(true);
    });

    test('version pattern validation: "1.2.3" passes', () => {
        const project = makeValidProject({ version: '1.2.3' });
        expect(sv.validate(project, HTASchemas.project)).toBe(true);
    });

    test('version pattern validation: "abc" fails', () => {
        const project = makeValidProject({ version: 'abc' });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_PATTERN')).toBe(true);
    });

    test('metadata.id pattern validation: starts with number fails', () => {
        const project = makeValidProject({ metadata: { id: '123bad', name: 'Test' } });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_PATTERN')).toBe(true);
    });

    test('metadata.name empty string fails minLength', () => {
        const project = makeValidProject({ metadata: { id: 'test', name: '' } });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
        expect(sv.getErrors().some(e => e.code === 'SCHEMA_MIN_LENGTH')).toBe(true);
    });

    test('manifest schema: sha256 pattern validation', () => {
        const validManifest = {
            version: '0.1',
            files: [{ path: 'project.json', sha256: 'a'.repeat(64) }]
        };
        expect(sv.validate(validManifest, HTASchemas.manifest)).toBe(true);

        const sv2 = new SchemaValidator();
        const invalidManifest = {
            version: '0.1',
            files: [{ path: 'project.json', sha256: 'tooshort' }]
        };
        expect(sv2.validate(invalidManifest, HTASchemas.manifest)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SchemaValidator — array validation
// ---------------------------------------------------------------------------
describe('SchemaValidator — array and multi-type validation', () => {
    let sv;
    beforeEach(() => {
        sv = new SchemaValidator();
    });

    test('tags array of strings passes', () => {
        const project = makeValidProject({
            metadata: { id: 'test', name: 'Test', tags: ['hta', 'markov'] }
        });
        expect(sv.validate(project, HTASchemas.project)).toBe(true);
    });

    test('tags array with non-string fails', () => {
        const project = makeValidProject({
            metadata: { id: 'test', name: 'Test', tags: [123, 'ok'] }
        });
        const valid = sv.validate(project, HTASchemas.project);
        expect(valid).toBe(false);
    });

    test('null type in multi-type icer field', () => {
        // results schema icer allows ["number", "string", "null"]
        const resultsSchema = HTASchemas.results;
        const icerSchema = resultsSchema.properties.deterministic
            .properties.incremental.properties.comparisons
            .items.properties.icer;
        expect(icerSchema.type).toEqual(expect.arrayContaining(['number', 'string', 'null']));
    });

    test('_validateType handles multiple types', () => {
        // Direct test: null matches type ["number", "string", "null"]
        const valid = sv._validateType(null, ['number', 'string', 'null'], 'test');
        expect(valid).toBe(true);

        const sv2 = new SchemaValidator();
        const valid2 = sv2._validateType('hello', ['number', 'string', 'null'], 'test');
        expect(valid2).toBe(true);

        const sv3 = new SchemaValidator();
        const valid3 = sv3._validateType(42, ['number', 'string', 'null'], 'test');
        expect(valid3).toBe(true);

        const sv4 = new SchemaValidator();
        const valid4 = sv4._validateType(true, ['number', 'string', 'null'], 'test');
        expect(valid4).toBe(false);
    });
});
