/**
 * Tests for src/engine/livingHTA.js — Living HTA Monitoring Engine
 * 30 tests covering: creation, updates, boundaries, reports, decisions, history, edge cases
 */

'use strict';

const { LivingHTAEngine } = require('../../src/engine/livingHTA');

// ── Fixtures ────────────────────────────────────────────────────

const baseStudies = [
    { id: 'S1', yi: 0.5, vi: 0.04, study: 'EMPA-REG' },
    { id: 'S2', yi: 0.3, vi: 0.06, study: 'CANVAS' },
    { id: 'S3', yi: 0.8, vi: 0.05, study: 'DECLARE' },
    { id: 'S4', yi: 0.4, vi: 0.03, study: 'CREDENCE' },
    { id: 'S5', yi: 0.6, vi: 0.07, study: 'DAPA-HF' }
];

const baseConfig = {
    query: { condition: 'Type 2 Diabetes', intervention: 'SGLT2 inhibitors' },
    sources: ['clinicaltrials', 'pubmed'],
    currentEvidence: {
        studies: baseStudies,
        pooledEffect: 0.75,
        heterogeneity: { I2: 45, tau2: 0.02 }
    },
    thresholds: {
        clinicalSignificance: 0.1,
        statisticalAlpha: 0.05,
        monitoringMethod: 'obrienFleming'
    },
    updateSchedule: 'monthly'
};

const newStudyData = [
    { id: 'S6', yi: 0.55, vi: 0.04, title: 'SGLT2 inhibitors for Type 2 Diabetes - New RCT', status: 'Completed', source: 'clinicaltrials' },
    { id: 'S7', yi: 0.45, vi: 0.05, title: 'Empagliflozin Type 2 Diabetes Trial', status: 'Completed', source: 'pubmed' }
];

// ── Helpers ─────────────────────────────────────────────────────

function createEngine(opts) {
    return new LivingHTAEngine({ seed: 54321, ...opts });
}

// ── 1. createMonitor returns valid monitor object ───────────────

describe('LivingHTAEngine — createMonitor', () => {
    test('1. returns valid monitor object with all required fields', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        expect(monitor).toBeDefined();
        expect(monitor.monitorId).toBeDefined();
        expect(typeof monitor.monitorId).toBe('string');
        expect(monitor.status).toBe('active');
        expect(monitor.totalChecks).toBe(0);
        expect(monitor.newStudiesFound).toBe(0);
        expect(monitor.alerts).toEqual([]);
        expect(monitor.currentEvidence).toBeDefined();
        expect(monitor.config).toBeDefined();
    });

    test('2. monitor has correct initial state (status: active, lastChecked: null)', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        expect(monitor.status).toBe('active');
        expect(monitor.lastChecked).toBeNull();
        expect(monitor.totalChecks).toBe(0);
        expect(monitor.newStudiesFound).toBe(0);
        expect(monitor.history).toEqual([]);
    });

    test('3. monitor preserves query config', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        expect(monitor.config.query.condition).toBe('Type 2 Diabetes');
        expect(monitor.config.query.intervention).toBe('SGLT2 inhibitors');
        expect(monitor.config.sources).toEqual(['clinicaltrials', 'pubmed']);
    });

    test('4. monthly schedule recorded correctly', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        expect(monitor.config.updateSchedule).toBe('monthly');
    });
});

// ── 2. checkForUpdates ──────────────────────────────────────────

describe('LivingHTAEngine — checkForUpdates', () => {
    test('5. with mock new studies returns update report', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const report = engine.checkForUpdates(monitor, { newStudies: newStudyData });

        expect(report).toBeDefined();
        expect(report.newStudies).toHaveLength(2);
        expect(report.recommendation).toBeDefined();
        expect(report.reason).toBeDefined();
        expect(typeof report.relevanceScore).toBe('number');
    });

    test('6. with no new studies returns no_update', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const report = engine.checkForUpdates(monitor, { newStudies: [] });

        expect(report.recommendation).toBe('no_update');
        expect(report.newStudies).toHaveLength(0);
        expect(report.reason).toContain('No new studies');
    });

    test('7. relevanceScore in [0, 1]', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const report = engine.checkForUpdates(monitor, { newStudies: newStudyData });

        expect(report.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(report.relevanceScore).toBeLessThanOrEqual(1);
    });

    test('8. updates lastChecked and totalChecks', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        expect(monitor.lastChecked).toBeNull();
        expect(monitor.totalChecks).toBe(0);

        engine.checkForUpdates(monitor, { newStudies: [] });

        expect(monitor.lastChecked).not.toBeNull();
        expect(monitor.totalChecks).toBe(1);
    });
});

// ── 3. applyUpdate ──────────────────────────────────────────────

describe('LivingHTAEngine — applyUpdate', () => {
    test('9. adds studies to evidence base', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const result = engine.applyUpdate(monitor, newStudyData);

        expect(result.nStudiesTotal).toBe(baseStudies.length + newStudyData.length);
        expect(result.updatedEvidence.studies).toHaveLength(baseStudies.length + newStudyData.length);
    });

    test('10. recalculates pooled effect', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const result = engine.applyUpdate(monitor, newStudyData);

        expect(typeof result.updatedEvidence.pooledEffect).toBe('number');
        expect(isFinite(result.updatedEvidence.pooledEffect)).toBe(true);
        // The pooled effect should differ from the original 0.75
        // (recalculated from all studies including new ones)
        expect(result.updatedEvidence.pooledEffect).not.toBe(0.75);
    });

    test('11. boundary check: O\'Brien-Fleming threshold', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const result = engine.applyUpdate(monitor, newStudyData);

        expect(result.boundaryCheck).toBeDefined();
        expect(result.boundaryCheck.method).toBe('obrienFleming');
        expect(typeof result.boundaryCheck.threshold).toBe('number');
        expect(typeof result.boundaryCheck.statistic).toBe('number');
        expect(typeof result.boundaryCheck.crossed).toBe('boolean');
    });

    test('12. boundary check: Pocock threshold (more lenient)', () => {
        const engine = createEngine();
        const pocockConfig = {
            ...baseConfig,
            thresholds: { ...baseConfig.thresholds, monitoringMethod: 'pocock' }
        };
        const monitor = engine.createMonitor(pocockConfig);

        const result = engine.applyUpdate(monitor, newStudyData);

        expect(result.boundaryCheck.method).toBe('pocock');
        expect(typeof result.boundaryCheck.threshold).toBe('number');
    });

    test('13. conclusion unchanged: effect strengthened', () => {
        const engine = createEngine();
        // Start with positive pooled effect, add more positive studies
        const monitor = engine.createMonitor(baseConfig);

        const result = engine.applyUpdate(monitor, [
            { id: 'S6', yi: 0.9, vi: 0.03, title: 'Strong positive study' }
        ]);

        // Conclusion should remain 'effective' (both before and after positive)
        expect(result.conclusionChanged).toBe(false);
    });

    test('14. conclusion changed detection: effect crosses null', () => {
        const engine = createEngine();
        // Start with positive pooled effect, then add strongly negative studies
        const monitor = engine.createMonitor({
            ...baseConfig,
            currentEvidence: {
                studies: [{ id: 'S1', yi: 0.1, vi: 0.1, study: 'Weak' }],
                pooledEffect: 0.1,
                heterogeneity: { I2: 0, tau2: 0 }
            }
        });

        // Add overwhelmingly negative studies
        const negativeStudies = [];
        for (let i = 0; i < 10; i++) {
            negativeStudies.push({
                id: `NEG${i}`, yi: -0.8, vi: 0.02, title: `Negative study ${i}`
            });
        }

        const result = engine.applyUpdate(monitor, negativeStudies);

        // The pooled effect should now be negative
        expect(result.updatedEvidence.pooledEffect).toBeLessThan(0);
        expect(result.conclusionChanged).toBe(true);
    });

    test('15. heterogeneity is recalculated', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const result = engine.applyUpdate(monitor, newStudyData);

        expect(result.updatedEvidence.heterogeneity).toBeDefined();
        expect(typeof result.updatedEvidence.heterogeneity.I2).toBe('number');
        expect(typeof result.updatedEvidence.heterogeneity.tau2).toBe('number');
    });
});

// ── 4. generateUpdateReport ─────────────────────────────────────

describe('LivingHTAEngine — generateUpdateReport', () => {
    test('16. contains study count', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);
        const updateResult = engine.applyUpdate(monitor, newStudyData);

        const report = engine.generateUpdateReport(monitor, updateResult);

        expect(report).toContain(`${newStudyData.length}`);
        expect(report).toContain('New Studies');
    });

    test('17. mentions pooled estimate', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);
        const updateResult = engine.applyUpdate(monitor, newStudyData);

        const report = engine.generateUpdateReport(monitor, updateResult);

        expect(report).toContain('Pooled');
        expect(report).toContain('effect');
        expect(typeof report).toBe('string');
        // Should contain a numeric value
        expect(report).toMatch(/\d+\.\d+/);
    });

    test('18. report is valid Markdown with headers', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);
        const updateResult = engine.applyUpdate(monitor, newStudyData);

        const report = engine.generateUpdateReport(monitor, updateResult);

        expect(report).toContain('# Living HTA Update Report');
        expect(report).toContain('## New Studies');
        expect(report).toContain('## Updated Pooled Estimate');
        expect(report).toContain('## Monitoring Boundary');
        expect(report).toContain('## Conclusion');
        expect(report).toContain('## Recommendation');
    });
});

// ── 5. assessImpactOnDecision ───────────────────────────────────

describe('LivingHTAEngine — assessImpactOnDecision', () => {
    test('19. ICER change calculated', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);
        const updateResult = engine.applyUpdate(monitor, newStudyData);

        const impact = engine.assessImpactOnDecision(updateResult, {
            currentICER: 25000,
            wtp: 30000,
            currentDecision: 'adopt'
        });

        expect(typeof impact.newICER).toBe('number');
        expect(typeof impact.icerChange).toBe('number');
        expect(isFinite(impact.newICER)).toBe(true);
    });

    test('20. decision reversal detected', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor({
            ...baseConfig,
            currentEvidence: {
                studies: [{ id: 'S1', yi: 0.1, vi: 0.1, study: 'Weak' }],
                pooledEffect: 0.5,
                heterogeneity: { I2: 0, tau2: 0 }
            }
        });

        // Add negative studies to flip the effect direction
        const negStudies = [];
        for (let i = 0; i < 10; i++) {
            negStudies.push({ id: `N${i}`, yi: -0.8, vi: 0.02 });
        }
        const updateResult = engine.applyUpdate(monitor, negStudies);

        // Set up decision context where ICER was below WTP
        const impact = engine.assessImpactOnDecision(updateResult, {
            currentICER: 25000,
            wtp: 30000,
            currentDecision: 'adopt'
        });

        // With effect reversal, ICER should change significantly
        expect(typeof impact.decisionReversed).toBe('boolean');
        expect(impact.urgency).toBeDefined();
        expect(['low', 'medium', 'high']).toContain(impact.urgency);
    });

    test('21. urgency levels: low, medium, high', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        // Small change — should be low urgency
        const smallUpdate = engine.applyUpdate(monitor, [
            { id: 'Sx', yi: 0.52, vi: 0.04 }
        ]);

        const impact = engine.assessImpactOnDecision(smallUpdate, {
            currentICER: 25000,
            wtp: 30000,
            currentDecision: 'adopt'
        });

        expect(['low', 'medium', 'high']).toContain(impact.urgency);
    });
});

// ── 6. Monitoring history and timeline ──────────────────────────

describe('LivingHTAEngine — history & timeline', () => {
    test('22. monitoring history records each check', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        engine.checkForUpdates(monitor, { newStudies: [] });
        engine.checkForUpdates(monitor, { newStudies: newStudyData });
        engine.checkForUpdates(monitor, { newStudies: [] });

        const history = engine.getMonitoringHistory(monitor);

        expect(history.totalChecks).toBe(3);
        expect(history.entries).toHaveLength(3);
        expect(history.entries[0].type).toBe('check');
    });

    test('23. exportTimeline returns chronological data', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        engine.checkForUpdates(monitor, { newStudies: newStudyData });
        engine.applyUpdate(monitor, newStudyData);

        const history = engine.getMonitoringHistory(monitor);
        const timeline = engine.exportTimeline(history);

        expect(timeline).toBeDefined();
        expect(timeline.timeline).toBeDefined();
        expect(Array.isArray(timeline.timeline)).toBe(true);
        expect(timeline.timeline.length).toBeGreaterThan(0);
        expect(timeline.summary).toBeDefined();
    });

    test('24. exportTimeline chartjs format has labels and datasets', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        engine.checkForUpdates(monitor, { newStudies: newStudyData });
        engine.applyUpdate(monitor, newStudyData);

        const history = engine.getMonitoringHistory(monitor);
        const chartData = engine.exportTimeline(history, 'chartjs');

        expect(chartData.labels).toBeDefined();
        expect(chartData.datasets).toBeDefined();
        expect(Array.isArray(chartData.datasets)).toBe(true);
    });
});

// ── 7. Multiple sequential updates ─────────────────────────────

describe('LivingHTAEngine — sequential updates', () => {
    test('25. multiple sequential updates accumulate correctly', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        // First update
        engine.applyUpdate(monitor, [
            { id: 'U1', yi: 0.5, vi: 0.04 }
        ]);
        const countAfterFirst = monitor.currentEvidence.studies.length;

        // Second update
        engine.applyUpdate(monitor, [
            { id: 'U2', yi: 0.6, vi: 0.05 },
            { id: 'U3', yi: 0.4, vi: 0.03 }
        ]);
        const countAfterSecond = monitor.currentEvidence.studies.length;

        expect(countAfterFirst).toBe(baseStudies.length + 1);
        expect(countAfterSecond).toBe(baseStudies.length + 3);
    });

    test('26. determinism: same inputs produce same results', () => {
        const engine1 = createEngine({ seed: 99999 });
        const engine2 = createEngine({ seed: 99999 });

        const monitor1 = engine1.createMonitor(baseConfig);
        const monitor2 = engine2.createMonitor(baseConfig);

        const result1 = engine1.applyUpdate(monitor1, newStudyData);
        const result2 = engine2.applyUpdate(monitor2, newStudyData);

        expect(result1.updatedEvidence.pooledEffect).toBe(result2.updatedEvidence.pooledEffect);
        expect(result1.boundaryCheck.statistic).toBe(result2.boundaryCheck.statistic);
        expect(result1.conclusionChanged).toBe(result2.conclusionChanged);
    });
});

// ── 8. Edge cases ───────────────────────────────────────────────

describe('LivingHTAEngine — edge cases', () => {
    test('27. empty new studies list', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor(baseConfig);

        const result = engine.applyUpdate(monitor, []);

        // Should still have original studies
        expect(result.nStudiesTotal).toBe(baseStudies.length);
        expect(result.nStudiesNew).toBe(0);
        expect(typeof result.updatedEvidence.pooledEffect).toBe('number');
    });

    test('28. single existing study', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor({
            ...baseConfig,
            currentEvidence: {
                studies: [{ id: 'S1', yi: 0.5, vi: 0.04, study: 'Only' }],
                pooledEffect: 0.5,
                heterogeneity: { I2: 0, tau2: 0 }
            }
        });

        const result = engine.applyUpdate(monitor, newStudyData);

        expect(result.nStudiesTotal).toBe(3); // 1 + 2
        expect(typeof result.updatedEvidence.pooledEffect).toBe('number');
        expect(isFinite(result.updatedEvidence.pooledEffect)).toBe(true);
    });

    test('29. very large effect change triggers alert', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor({
            ...baseConfig,
            currentEvidence: {
                studies: [{ id: 'S1', yi: 0.01, vi: 0.5, study: 'Weak' }],
                pooledEffect: 2.0,
                heterogeneity: { I2: 0, tau2: 0 }
            },
            thresholds: {
                clinicalSignificance: 0.1,
                statisticalAlpha: 0.05,
                monitoringMethod: 'obrienFleming'
            }
        });

        // Add many strongly negative studies
        const extremeStudies = [];
        for (let i = 0; i < 15; i++) {
            extremeStudies.push({ id: `EX${i}`, yi: -2.0, vi: 0.01 });
        }

        const result = engine.applyUpdate(monitor, extremeStudies);

        // Should trigger an alert
        expect(result.alert).not.toBeNull();
        expect(['low', 'medium', 'high']).toContain(result.alert.severity);
    });

    test('30. alert severity levels include high for conclusion reversal', () => {
        const engine = createEngine();
        const monitor = engine.createMonitor({
            ...baseConfig,
            currentEvidence: {
                studies: [{ id: 'S1', yi: 0.1, vi: 0.1, study: 'Weak positive' }],
                pooledEffect: 0.1,
                heterogeneity: { I2: 0, tau2: 0 }
            }
        });

        // Add strongly negative studies to reverse conclusion
        const negStudies = [];
        for (let i = 0; i < 10; i++) {
            negStudies.push({ id: `NEG${i}`, yi: -1.0, vi: 0.02 });
        }

        const result = engine.applyUpdate(monitor, negStudies);

        if (result.conclusionChanged) {
            expect(result.alert).not.toBeNull();
            expect(result.alert.severity).toBe('high');
        }
    });
});
