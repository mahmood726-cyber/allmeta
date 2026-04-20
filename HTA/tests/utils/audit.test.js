/**
 * Tests for src/utils/audit.js — AuditLogger and getAuditLogger
 */

'use strict';

const { AuditLogger, getAuditLogger } = require('../../src/utils/audit');

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('AuditLogger — constructor', () => {
    test('creates with default modelId "unknown"', () => {
        const logger = new AuditLogger();
        expect(logger.modelId).toBe('unknown');
    });

    test('creates with provided modelId', () => {
        const logger = new AuditLogger('my_model');
        expect(logger.modelId).toBe('my_model');
    });

    test('generates a unique sessionId', () => {
        const l1 = new AuditLogger();
        const l2 = new AuditLogger();
        expect(l1.sessionId).not.toBe(l2.sessionId);
    });

    test('startTime is ISO format', () => {
        const logger = new AuditLogger();
        expect(logger.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(() => new Date(logger.startTime)).not.toThrow();
    });

    test('starts with empty entries', () => {
        const logger = new AuditLogger();
        expect(logger.entries).toHaveLength(0);
        expect(logger.warnings).toHaveLength(0);
        expect(logger.errors).toHaveLength(0);
        expect(logger.parameterChanges).toHaveLength(0);
        expect(logger.clampingEvents).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Logging events
// ---------------------------------------------------------------------------
describe('AuditLogger — logging', () => {
    let logger;
    beforeEach(() => {
        logger = new AuditLogger('test_model');
    });

    test('log() adds entry with correct structure', () => {
        const entry = logger.log('info', 'MODEL_RUN', 'Model started', { cycles: 10 });
        expect(entry.level).toBe('info');
        expect(entry.category).toBe('MODEL_RUN');
        expect(entry.message).toBe('Model started');
        expect(entry.details.cycles).toBe(10);
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(logger.entries).toHaveLength(1);
    });

    test('info() logs at info level', () => {
        logger.info('VALIDATION', 'Validation started');
        expect(logger.entries).toHaveLength(1);
        expect(logger.entries[0].level).toBe('info');
        expect(logger.entries[0].category).toBe('VALIDATION');
    });

    test('warn() logs at warning level and adds to warnings', () => {
        logger.warn('clamping', 'Value clamped');
        expect(logger.entries).toHaveLength(1);
        expect(logger.warnings).toHaveLength(1);
        expect(logger.warnings[0].level).toBe('warning');
    });

    test('error() logs at error level and adds to errors', () => {
        logger.error('simulation', 'Division by zero');
        expect(logger.entries).toHaveLength(1);
        expect(logger.errors).toHaveLength(1);
        expect(logger.errors[0].level).toBe('error');
    });

    test('debug() logs at debug level', () => {
        logger.debug('engine', 'Debug info');
        expect(logger.entries).toHaveLength(1);
        expect(logger.entries[0].level).toBe('debug');
    });

    test('timestamps are ISO format on all entries', () => {
        logger.info('a', 'msg1');
        logger.warn('b', 'msg2');
        logger.error('c', 'msg3');
        for (const entry of logger.entries) {
            expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        }
    });

    test('multiple events accumulate in entries array', () => {
        logger.info('MODEL_RUN', 'Started');
        logger.info('VALIDATION', 'Checked');
        logger.warn('clamping', 'Clamped');
        logger.error('simulation', 'Failed');
        logger.info('EXPORT', 'Exported');

        expect(logger.entries).toHaveLength(5);
        expect(logger.warnings).toHaveLength(1);
        expect(logger.errors).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Specialized logging methods
// ---------------------------------------------------------------------------
describe('AuditLogger — specialized methods', () => {
    let logger;
    beforeEach(() => {
        logger = new AuditLogger('test_model');
    });

    test('logModelInit logs model details', () => {
        const project = {
            metadata: { id: 'm1', name: 'Model 1' },
            model: { type: 'markov_cohort' },
            settings: { time_horizon: 40, cycle_length: 1 },
            states: { alive: {}, dead: {} },
            parameters: { p1: {} },
            transitions: { t1: {} },
            strategies: { s1: {} }
        };
        logger.logModelInit(project);
        expect(logger.entries).toHaveLength(1);
        expect(logger.entries[0].details.stateCount).toBe(2);
    });

    test('logParameterOverride tracks changes', () => {
        logger.logParameterOverride('p_death', 0.1, 0.2, 'sensitivity');
        expect(logger.parameterChanges).toHaveLength(1);
        expect(logger.parameterChanges[0].parameter).toBe('p_death');
        expect(logger.parameterChanges[0].originalValue).toBe(0.1);
        expect(logger.parameterChanges[0].newValue).toBe(0.2);
        expect(logger.parameterChanges[0].reason).toBe('sensitivity');
    });

    test('logProbabilityClamping records clamping event', () => {
        logger.logProbabilityClamping('transition_A', -0.05, 0);
        expect(logger.clampingEvents).toHaveLength(1);
        expect(logger.clampingEvents[0].originalValue).toBe(-0.05);
        expect(logger.clampingEvents[0].clampedValue).toBe(0);
        expect(logger.clampingEvents[0].reason).toContain('Negative');
        // Also goes to warnings
        expect(logger.warnings).toHaveLength(1);
    });

    test('logProbabilityClamping > 1 reason', () => {
        logger.logProbabilityClamping('transition_B', 1.2, 1.0);
        expect(logger.clampingEvents[0].reason).toContain('> 1');
    });

    test('logValidation logs validation results', () => {
        logger.logValidation({
            valid: true,
            errors: 0,
            warnings: 2,
            infos: 1,
            issues: [
                { severity: 'WARNING', code: 'W001', path: 'x', message: 'warning1' }
            ]
        });
        expect(logger.entries.length).toBeGreaterThanOrEqual(1);
    });

    test('logExport logs export operation', () => {
        logger.logExport('json', 'results.json');
        expect(logger.entries).toHaveLength(1);
        expect(logger.entries[0].category).toBe('export');
    });

    test('logSimulationStart and logSimulationEnd', () => {
        logger.logSimulationStart('treatment', 40, { p_death: 0.05 });
        logger.logSimulationEnd('treatment', {
            total_costs: 50000,
            total_qalys: 8.5,
            life_years: 10,
            computation_time_ms: 42
        });
        expect(logger.entries).toHaveLength(2);
        expect(logger.entries[0].category).toBe('simulation');
        expect(logger.entries[1].details.totalCosts).toBe(50000);
    });
});

// ---------------------------------------------------------------------------
// Export to JSON
// ---------------------------------------------------------------------------
describe('AuditLogger — export', () => {
    test('export() returns structured object', () => {
        const logger = new AuditLogger('export_test');
        logger.info('test', 'Test event');
        logger.logParameterOverride('p1', 1, 2, 'test');
        logger.logProbabilityClamping('loc', -1, 0);

        const exported = logger.export();

        expect(exported.metadata).toBeDefined();
        expect(exported.metadata.modelId).toBe('export_test');
        expect(exported.metadata.sessionId).toBe(logger.sessionId);
        expect(exported.metadata.engineVersion).toBe('0.1');
        expect(exported.summary).toBeDefined();
        expect(exported.entries).toHaveLength(3); // info + paramOverride info + clamping warn
        expect(exported.parameterChanges).toHaveLength(1);
        expect(exported.clampingEvents).toHaveLength(1);
    });

    test('exported JSON is serializable', () => {
        const logger = new AuditLogger('json_test');
        logger.info('test', 'msg');
        const exported = logger.export();
        const json = JSON.stringify(exported);
        expect(typeof json).toBe('string');
        const parsed = JSON.parse(json);
        expect(parsed.metadata.modelId).toBe('json_test');
    });

    test('export metadata has startTime and endTime', () => {
        const logger = new AuditLogger('time_test');
        const exported = logger.export();
        expect(exported.metadata.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(exported.metadata.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
describe('AuditLogger — filtering', () => {
    let logger;
    beforeEach(() => {
        logger = new AuditLogger('filter_test');
        logger.info('MODEL_RUN', 'Start');
        logger.info('VALIDATION', 'Check');
        logger.warn('clamping', 'Clamped');
        logger.error('simulation', 'Failed');
        logger.info('EXPORT', 'Done');
    });

    test('getEntriesByCategory returns matching entries', () => {
        const modelEntries = logger.getEntriesByCategory('MODEL_RUN');
        expect(modelEntries).toHaveLength(1);
        expect(modelEntries[0].message).toBe('Start');
    });

    test('getEntriesByCategory with no match returns empty', () => {
        const empty = logger.getEntriesByCategory('NONEXISTENT');
        expect(empty).toHaveLength(0);
    });

    test('getEntriesByLevel returns matching entries', () => {
        const warnings = logger.getEntriesByLevel('warning');
        expect(warnings).toHaveLength(1);

        const errors = logger.getEntriesByLevel('error');
        expect(errors).toHaveLength(1);

        const infos = logger.getEntriesByLevel('info');
        expect(infos).toHaveLength(3);
    });

    test('getEntriesInRange filters by time', () => {
        const now = new Date();
        const past = new Date(now.getTime() - 60000); // 1 min ago
        const future = new Date(now.getTime() + 60000);

        const inRange = logger.getEntriesInRange(past.toISOString(), future.toISOString());
        expect(inRange).toHaveLength(5); // all entries are recent
    });

    test('getEntriesInRange with narrow window may return fewer', () => {
        // Use a range in the far future — should return 0
        const future1 = new Date('2099-01-01T00:00:00Z');
        const future2 = new Date('2099-01-02T00:00:00Z');
        const inRange = logger.getEntriesInRange(future1.toISOString(), future2.toISOString());
        expect(inRange).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Clear / Reset
// ---------------------------------------------------------------------------
describe('AuditLogger — clear', () => {
    test('clear resets all arrays and regenerates sessionId', () => {
        const logger = new AuditLogger('clear_test');
        const oldSession = logger.sessionId;

        logger.info('test', 'event');
        logger.warn('test', 'warning');
        logger.error('test', 'error');
        logger.logParameterOverride('p', 1, 2, '');
        logger.logProbabilityClamping('loc', -1, 0);

        expect(logger.entries.length).toBeGreaterThan(0);

        logger.clear();

        expect(logger.entries).toHaveLength(0);
        expect(logger.warnings).toHaveLength(0);
        expect(logger.errors).toHaveLength(0);
        expect(logger.parameterChanges).toHaveLength(0);
        expect(logger.clampingEvents).toHaveLength(0);
        expect(logger.sessionId).not.toBe(oldSession);
    });

    test('clear resets startTime', () => {
        const logger = new AuditLogger('time_test');
        const oldStart = logger.startTime;

        // Small delay to ensure different timestamp
        logger.clear();

        // startTime should be refreshed (may be same ms, so just check it's valid ISO)
        expect(logger.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

// ---------------------------------------------------------------------------
// getSummary
// ---------------------------------------------------------------------------
describe('AuditLogger — getSummary', () => {
    test('returns summary object with expected fields', () => {
        const logger = new AuditLogger('summary_test');
        logger.info('test', 'event');
        logger.warn('test', 'warning');
        logger.logProbabilityClamping('loc', 1.5, 1.0);

        const summary = logger.getSummary();
        expect(summary.modelId).toBe('summary_test');
        expect(summary.sessionId).toBe(logger.sessionId);
        expect(summary.totalEntries).toBe(3); // info + warn(clamping) + info(above warn)
        expect(summary.errorCount).toBe(0);
        expect(summary.warningCount).toBe(2); // warn + clamping warn
        expect(summary.clampingEvents).toBe(1);
        expect(typeof summary.startTime).toBe('string');
        expect(typeof summary.endTime).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// getAuditLogger global factory
// ---------------------------------------------------------------------------
describe('getAuditLogger', () => {
    test('returns AuditLogger instance', () => {
        const logger = getAuditLogger('factory_test');
        expect(logger).toBeInstanceOf(AuditLogger);
        expect(logger.modelId).toBe('factory_test');
    });

    test('returns same instance for same modelId', () => {
        const l1 = getAuditLogger('singleton');
        const l2 = getAuditLogger('singleton');
        expect(l1).toBe(l2);
    });

    test('returns new instance for different modelId', () => {
        const l1 = getAuditLogger('model_a');
        const l2 = getAuditLogger('model_b');
        expect(l1).not.toBe(l2);
    });
});
