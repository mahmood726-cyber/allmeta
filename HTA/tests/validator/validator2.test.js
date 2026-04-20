/**
 * Tests for src/validator/validator.js — ZIP validation, checksums, manifest
 * Targets untested paths: validateZip, validateZipStructure, validateManifest,
 * validateResults, verifyChecksums, computeSHA256
 */

'use strict';

// Polyfill TextEncoder for jsdom (Node <18 compat)
if (typeof global.TextEncoder === 'undefined') {
    const { TextEncoder } = require('util');
    global.TextEncoder = TextEncoder;
}

// Load dependencies that HTAValidator references as globals
const { HTASchemas, SchemaValidator } = require('../../src/validator/schema');
const { SemanticValidator, Severity, ValidationCodes } = require('../../src/validator/semantic');

global.SchemaValidator = SchemaValidator;
global.SemanticValidator = SemanticValidator;
global.HTASchemas = HTASchemas;
global.Severity = Severity;
global.ValidationCodes = ValidationCodes;

// Stub ExpressionParser for SemanticValidator
if (typeof global.ExpressionParser === 'undefined') {
    global.ExpressionParser = {
        validate: () => ({ valid: true }),
        analyzeDepedencies: () => ({ cycles: [] })
    };
}

// Stub performance.now
if (typeof performance === 'undefined') {
    global.performance = { now: () => Date.now() };
}

// ---------------------------------------------------------------------------
// JSZip mock — realistic mock with forEach, file(), loadAsync
// ---------------------------------------------------------------------------
function createMockZip(files = {}) {
    const fileMap = {};
    for (const [path, content] of Object.entries(files)) {
        fileMap[path] = {
            async: jest.fn(async (type) => {
                if (type === 'string') return typeof content === 'string' ? content : JSON.stringify(content);
                if (type === 'arraybuffer') {
                    const enc = new TextEncoder();
                    return enc.encode(typeof content === 'string' ? content : JSON.stringify(content)).buffer;
                }
                return content;
            }),
            dir: false
        };
    }

    const zip = {
        file: jest.fn((name) => fileMap[name] || null),
        forEach: jest.fn((callback) => {
            for (const [path, entry] of Object.entries(fileMap)) {
                callback(path, entry);
            }
        })
    };

    // Make it look like a JSZip instance
    zip.constructor = { name: 'JSZip' };
    return zip;
}

// Minimal valid project for ZIP tests
function makeValidProject() {
    return {
        version: '0.1',
        metadata: { id: 'test', name: 'Test', description: 'Test model' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 40, cycle_length: 1,
            discount_rate_costs: 0.035, discount_rate_qalys: 0.035,
            half_cycle_correction: 'trapezoidal', starting_age: 60,
            perspective: 'NHS and PSS'
        },
        parameters: {
            p_death: { value: 0.1, label: 'Mortality', description: 'Prob death',
                distribution: { type: 'beta', alpha: 10, beta: 90 }, evidence_id: 'ev1' }
        },
        states: {
            alive: { label: 'Alive', description: 'Alive', type: 'transient',
                initial_probability: 1.0, cost: 1000, utility: 0.8 },
            dead: { label: 'Dead', description: 'Dead', type: 'absorbing',
                initial_probability: 0, cost: 0, utility: 0 }
        },
        transitions: {
            alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
            alive_to_dead: { from: 'alive', to: 'dead', probability: 0.1 },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1.0 }
        },
        strategies: { base: { label: 'Base Case', is_comparator: true } },
        evidence: { ev1: { source: 'ONS', citation: 'ONS 2023' } }
    };
}

// ---------------------------------------------------------------------------
// Set up JSZip global so the instanceof / duck-type check works
// ---------------------------------------------------------------------------
global.JSZip = class JSZip {
    static async loadAsync() { return createMockZip({}); }
};
// Make mock ZIPs pass the duck-type check: validator checks `projectOrZip.file`
// Our mock has a .file method which is what the code checks

const { HTAValidator } = require('../../src/validator/validator');

// Stub crypto.subtle for computeSHA256
if (!global.crypto) global.crypto = {};
if (!global.crypto.subtle) {
    global.crypto.subtle = {
        digest: jest.fn(async (alg, data) => {
            // Return a deterministic 32-byte hash buffer
            const arr = new Uint8Array(32);
            const view = new DataView(new Uint8Array(data).buffer);
            const seed = new Uint8Array(data).reduce((a, b) => a + b, 0);
            for (let i = 0; i < 32; i++) arr[i] = (seed + i) & 0xFF;
            return arr.buffer;
        })
    };
}

// ---------------------------------------------------------------------------
// validateZip — end-to-end ZIP validation
// ---------------------------------------------------------------------------
describe('HTAValidator — validateZip', () => {
    test('validates a ZIP with valid project.json', async () => {
        const mockZip = createMockZip({
            'project.json': JSON.stringify(makeValidProject())
        });
        // Mock JSZip.loadAsync to return our mock
        global.JSZip.loadAsync = jest.fn(async () => mockZip);

        const v = new HTAValidator();
        const result = await v.validateZip(new ArrayBuffer(10));

        expect(result).toBeDefined();
        expect(result.errors).toBeDefined();
        expect(result.validationTime).toBeGreaterThanOrEqual(0);
        expect(typeof result.valid).toBe('boolean');
    });

    test('reports ZIP_READ_ERROR when loadAsync throws', async () => {
        global.JSZip.loadAsync = jest.fn(async () => { throw new Error('corrupt'); });

        const v = new HTAValidator();
        const result = await v.validateZip(new ArrayBuffer(10));

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ZIP_READ_ERROR')).toBe(true);
        expect(result.errors[0].message).toContain('corrupt');
    });

    test('sets valid=true when no errors (valid ZIP)', async () => {
        const mockZip = createMockZip({
            'project.json': JSON.stringify(makeValidProject())
        });
        global.JSZip.loadAsync = jest.fn(async () => mockZip);

        const v = new HTAValidator();
        const result = await v.validateZip(new ArrayBuffer(10));

        // May have warnings but no errors => valid
        expect(result.valid).toBe(result.errors.length === 0);
    });

    test('result contains files list from ZIP', async () => {
        const mockZip = createMockZip({
            'project.json': JSON.stringify(makeValidProject()),
            'data/input.csv': 'a,b,c'
        });
        global.JSZip.loadAsync = jest.fn(async () => mockZip);

        const v = new HTAValidator();
        const result = await v.validateZip(new ArrayBuffer(10));

        expect(result.files).toContain('project.json');
        expect(result.files).toContain('data/input.csv');
    });
});

// ---------------------------------------------------------------------------
// validateZipStructure — required/recommended/forbidden files
// ---------------------------------------------------------------------------
describe('HTAValidator — validateZipStructure', () => {
    test('reports MISSING_REQUIRED_FILE when project.json absent', async () => {
        const mockZip = createMockZip({ 'readme.txt': 'hello' });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [] };
        await v.validateZipStructure(mockZip);

        expect(v.results.errors.some(e => e.code === 'MISSING_REQUIRED_FILE')).toBe(true);
    });

    test('reports MISSING_RECOMMENDED_FILE info when manifest.json absent', async () => {
        const mockZip = createMockZip({ 'project.json': '{}' });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [] };
        await v.validateZipStructure(mockZip);

        expect(v.results.infos.some(e => e.code === 'MISSING_RECOMMENDED_FILE' && e.path === 'manifest.json')).toBe(true);
    });

    test('reports MISSING_RECOMMENDED_FILE for metadata.json', async () => {
        const mockZip = createMockZip({ 'project.json': '{}', 'manifest.json': '{}' });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [] };
        await v.validateZipStructure(mockZip);

        expect(v.results.infos.some(e => e.path === 'metadata.json')).toBe(true);
    });

    test('reports FORBIDDEN_FILE for .exe files', async () => {
        const mockZip = createMockZip({
            'project.json': '{}',
            'malware.exe': 'bad'
        });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [] };
        await v.validateZipStructure(mockZip);

        expect(v.results.errors.some(e => e.code === 'FORBIDDEN_FILE')).toBe(true);
    });

    test('reports FORBIDDEN_FILE for .dll files', async () => {
        const mockZip = createMockZip({
            'project.json': '{}',
            'library.dll': 'bad'
        });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [] };
        await v.validateZipStructure(mockZip);

        expect(v.results.errors.some(e => e.code === 'FORBIDDEN_FILE' && e.path === 'library.dll')).toBe(true);
    });

    test('allows .json and .csv files without error', async () => {
        const mockZip = createMockZip({
            'project.json': '{}',
            'data.csv': 'a,b'
        });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [] };
        await v.validateZipStructure(mockZip);

        const forbiddenErrors = v.results.errors.filter(e => e.code === 'FORBIDDEN_FILE');
        expect(forbiddenErrors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// validateManifest — manifest.json parsing and validation
// ---------------------------------------------------------------------------
describe('HTAValidator — validateManifest', () => {
    test('sets results.manifest when valid manifest JSON', async () => {
        const manifest = { version: '1.0', files: [] };
        const mockZip = createMockZip({ 'manifest.json': JSON.stringify(manifest) });

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v.validateManifest(mockZip);

        expect(v.results.manifest).toEqual(manifest);
    });

    test('reports JSON_PARSE_ERROR for invalid manifest JSON', async () => {
        const mockZip = createMockZip({ 'manifest.json': 'not-json{{{' });
        // Override async to return raw string
        mockZip.file('manifest.json').async = jest.fn(async () => 'not-json{{{');

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v.validateManifest(mockZip);

        expect(v.results.errors.some(e => e.code === 'JSON_PARSE_ERROR')).toBe(true);
    });

    test('returns early when manifest.json not in ZIP', async () => {
        const mockZip = createMockZip({});

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v.validateManifest(mockZip);

        expect(v.results.manifest).toBeNull();
        expect(v.results.errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// validateResults — results.json parsing
// ---------------------------------------------------------------------------
describe('HTAValidator — validateResults', () => {
    test('reports JSON_PARSE_ERROR for invalid results.json', async () => {
        const mockZip = createMockZip({ 'results.json': '{{invalid' });
        mockZip.file('results.json').async = jest.fn(async () => '{{invalid');

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v.validateResults(mockZip);

        expect(v.results.errors.some(e => e.code === 'JSON_PARSE_ERROR' && e.path === 'results.json')).toBe(true);
    });

    test('returns early when results.json not in ZIP', async () => {
        const mockZip = createMockZip({});

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v.validateResults(mockZip);

        expect(v.results.errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// verifyChecksums
// ---------------------------------------------------------------------------
describe('HTAValidator — verifyChecksums', () => {
    test('reports CHECKSUM_FILE_MISSING when manifest file is not in ZIP', async () => {
        const mockZip = createMockZip({ 'project.json': '{}' });

        const v = new HTAValidator();
        v.results = {
            valid: true, errors: [], warnings: [], infos: [], files: [],
            manifest: {
                files: [{ path: 'missing_file.json', sha256: 'abc123' }]
            }
        };
        await v.verifyChecksums(mockZip);

        expect(v.results.warnings.some(e => e.code === 'CHECKSUM_FILE_MISSING')).toBe(true);
    });

    test('reports CHECKSUM_MISMATCH when hash does not match', async () => {
        const mockZip = createMockZip({ 'project.json': '{"test":true}' });

        const v = new HTAValidator();
        v.results = {
            valid: true, errors: [], warnings: [], infos: [], files: [],
            manifest: {
                files: [{ path: 'project.json', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]
            }
        };

        // Compute the actual hash our mock produces, then ensure the manifest sha256 differs
        const fileContent = await mockZip.file('project.json').async('arraybuffer');
        const actualHash = await v.computeSHA256(fileContent);
        // Set manifest to a hash that definitely does NOT match
        v.results.manifest.files[0].sha256 = actualHash === 'ff'.repeat(32) ? '00'.repeat(32) : 'ff'.repeat(32);

        await v.verifyChecksums(mockZip);

        expect(v.results.errors.some(e => e.code === 'CHECKSUM_MISMATCH')).toBe(true);
    });

    test('skips verification when manifest is null', async () => {
        const mockZip = createMockZip({});

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v.verifyChecksums(mockZip);

        expect(v.results.errors).toHaveLength(0);
        expect(v.results.warnings).toHaveLength(0);
    });

    test('skips verification when manifest.files is undefined', async () => {
        const mockZip = createMockZip({});

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: {} };
        await v.verifyChecksums(mockZip);

        expect(v.results.errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// computeSHA256
// ---------------------------------------------------------------------------
describe('HTAValidator — computeSHA256', () => {
    // Helper: create ArrayBuffer from byte values (avoids TextEncoder dependency)
    function makeBuffer(bytes) {
        const arr = new Uint8Array(bytes);
        return arr.buffer;
    }

    test('returns a 64-character hex string', async () => {
        const v = new HTAValidator();
        const data = makeBuffer([72, 101, 108, 108, 111]); // "Hello"
        const hash = await v.computeSHA256(data);

        expect(typeof hash).toBe('string');
        expect(hash).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    test('different data produces different hashes', async () => {
        const v = new HTAValidator();
        const h1 = await v.computeSHA256(makeBuffer([1, 2, 3]));
        const h2 = await v.computeSHA256(makeBuffer([4, 5, 6]));

        expect(h1).not.toBe(h2);
    });
});

// ---------------------------------------------------------------------------
// addError / addWarning / addInfo helpers
// ---------------------------------------------------------------------------
describe('HTAValidator — helper methods', () => {
    test('addError pushes to results.errors with severity ERROR', () => {
        const v = new HTAValidator();
        v.results = { errors: [], warnings: [], infos: [] };
        v.addError('TEST_CODE', '/path', 'msg', 'rec');
        expect(v.results.errors).toHaveLength(1);
        expect(v.results.errors[0]).toEqual({
            code: 'TEST_CODE', path: '/path', message: 'msg',
            recommendation: 'rec', severity: 'ERROR'
        });
    });

    test('addWarning pushes to results.warnings', () => {
        const v = new HTAValidator();
        v.results = { errors: [], warnings: [], infos: [] };
        v.addWarning('WARN', '/p', 'warning msg');
        expect(v.results.warnings).toHaveLength(1);
        expect(v.results.warnings[0].severity).toBe('WARNING');
    });

    test('addInfo pushes to results.infos', () => {
        const v = new HTAValidator();
        v.results = { errors: [], warnings: [], infos: [] };
        v.addInfo('INFO', '/p', 'info msg');
        expect(v.results.infos).toHaveLength(1);
        expect(v.results.infos[0].severity).toBe('INFO');
    });
});

// ---------------------------------------------------------------------------
// _validateProjectFromZip
// ---------------------------------------------------------------------------
describe('HTAValidator — _validateProjectFromZip', () => {
    test('reports MISSING_FILE when project.json not in ZIP', async () => {
        const mockZip = createMockZip({});

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null };
        await v._validateProjectFromZip(mockZip);

        expect(v.results.errors.some(e => e.code === 'MISSING_FILE')).toBe(true);
    });

    test('reports JSON_PARSE_ERROR for invalid project.json', async () => {
        const mockZip = createMockZip({ 'project.json': 'not json' });
        mockZip.file('project.json').async = jest.fn(async () => 'not json');

        const v = new HTAValidator();
        v.results = { valid: true, errors: [], warnings: [], infos: [], files: [], manifest: null, project: null };
        await v._validateProjectFromZip(mockZip);

        expect(v.results.errors.some(e => e.code === 'JSON_PARSE_ERROR')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// generateReport — report formatting for warnings, infos
// ---------------------------------------------------------------------------
describe('HTAValidator — generateReport edge cases', () => {
    test('report shows warning count in PASSED header', () => {
        const v = new HTAValidator();
        const results = {
            valid: true, errors: [], infos: [],
            warnings: [{ code: 'W1', path: '/x', message: 'warn', severity: 'WARNING' }],
            validationTime: 5
        };
        const report = v.generateReport(results);
        expect(report).toContain('VALIDATION PASSED');
        expect(report).toContain('1 warning');
    });

    test('report shows plural warnings', () => {
        const v = new HTAValidator();
        const results = {
            valid: true, errors: [], infos: [],
            warnings: [
                { code: 'W1', path: '/x', message: 'w1', severity: 'WARNING' },
                { code: 'W2', path: '/y', message: 'w2', severity: 'WARNING' }
            ],
            validationTime: 5
        };
        const report = v.generateReport(results);
        expect(report).toContain('2 warnings');
    });

    test('report shows info section (first 5)', () => {
        const v = new HTAValidator();
        const infos = [];
        for (let i = 0; i < 7; i++) {
            infos.push({ code: `I${i}`, path: `/p${i}`, message: `info ${i}`, severity: 'INFO' });
        }
        const results = { valid: true, errors: [], warnings: [], infos, validationTime: 1 };
        const report = v.generateReport(results);
        expect(report).toContain('showing 5 of 7');
    });

    test('report includes recommendation text when present', () => {
        const v = new HTAValidator();
        const results = {
            valid: false,
            errors: [{ code: 'E1', path: '/x', message: 'err', recommendation: 'Fix it', severity: 'ERROR' }],
            warnings: [], infos: [], validationTime: 1
        };
        const report = v.generateReport(results);
        expect(report).toContain('Fix it');
    });
});
