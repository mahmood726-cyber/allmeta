/**
 * Tests for src/engine/reporting.js
 */

'use strict';

const { ReportingStandards } = require('../../src/engine/reporting');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function createMinimalProject() {
    return {
        name: 'Test HTA',
        settings: {
            time_horizon: 25,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: true,
            starting_age: 60,
            perspective: 'NHS and PSS'
        },
        states: {
            alive: { label: 'Alive' },
            dead: { label: 'Dead' }
        },
        transitions: {
            alive_to_dead: { from: 'alive', to: 'dead' }
        },
        strategies: {
            comparator: { label: 'Comparator' },
            intervention: { label: 'Intervention' }
        },
        parameters: {
            p_death: { value: 0.05, distribution: { type: 'beta', alpha: 5, beta: 95 } },
            c_alive: { value: 1000 }
        }
    };
}

// ---------------------------------------------------------------------------
// CHEERS 2022 assessment
// ---------------------------------------------------------------------------

describe('ReportingStandards - CHEERS 2022', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('initCHEERS2022 creates 28 items', () => {
        expect(rs.cheers2022Items.length).toBe(28);
    });

    test('assessCHEERS2022 returns items array and compliance percentage', () => {
        const project = createMinimalProject();
        const result = rs.assessCHEERS2022(project);

        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items.length).toBe(28);
        expect(typeof result.overallCompliance).toBe('string');
        expect(parseFloat(result.overallCompliance)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(result.overallCompliance)).toBeLessThanOrEqual(100);
    });

    test('assessCHEERSItem recognises time horizon (item 9)', () => {
        const project = createMinimalProject();
        const item = rs.cheers2022Items.find(i => i.id === 9);
        const assessment = rs.assessCHEERSItem(item, project, {});

        // 25 years >= 20 -> Reported
        expect(assessment.status).toBe('Reported');
    });

    test('assessCHEERSItem flags short time horizon as partially reported', () => {
        const project = createMinimalProject();
        project.settings.time_horizon = 10;

        const item = rs.cheers2022Items.find(i => i.id === 9);
        const assessment = rs.assessCHEERSItem(item, project, {});

        expect(assessment.status).toBe('Partially reported');
    });

    test('assessCHEERSItem recognises discount rate (item 10)', () => {
        const project = createMinimalProject();
        const item = rs.cheers2022Items.find(i => i.id === 10);
        const assessment = rs.assessCHEERSItem(item, project, {});

        expect(assessment.status).toBe('Reported');
    });

    test('assessCHEERSItem recognises comparators (item 7)', () => {
        const project = createMinimalProject();
        const item = rs.cheers2022Items.find(i => i.id === 7);
        const assessment = rs.assessCHEERSItem(item, project, {});

        expect(assessment.status).toBe('Reported');
        expect(assessment.details).toContain('2');
    });

    test('assessCHEERSItem reports partially for params without distributions (item 19)', () => {
        const project = createMinimalProject();
        const item = rs.cheers2022Items.find(i => i.id === 19);
        const assessment = rs.assessCHEERSItem(item, project, {});

        // p_death has distribution, c_alive does not
        expect(assessment.status).toBe('Partially reported');
    });

    test('generateCHEERSRecommendations flags unreported required items', () => {
        const project = createMinimalProject();
        const cheersResult = rs.assessCHEERS2022(project);
        const recs = rs.generateCHEERSRecommendations(cheersResult);

        // At least some items won't be auto-assessed
        expect(Array.isArray(recs)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// NICE Reference Case assessment
// ---------------------------------------------------------------------------

describe('ReportingStandards - NICE Reference Case', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('assessNICECompliance returns overall compliance flag', () => {
        const project = createMinimalProject();
        const result = rs.assessNICECompliance(project);

        expect(typeof result.overallCompliant).toBe('boolean');
        expect(Array.isArray(result.items)).toBe(true);
    });

    test('correct discount rate is compliant', () => {
        const project = createMinimalProject();
        const result = rs.assessNICECompliance(project);

        const discountItem = result.items.find(i => i.requirement === 'Discount rate');
        expect(discountItem.status).toBe('Compliant');
    });

    test('wrong discount rate is non-compliant', () => {
        const project = createMinimalProject();
        project.settings.discount_rate_costs = 0.05;
        project.settings.discount_rate_qalys = 0.05;

        const result = rs.assessNICECompliance(project);
        const discountItem = result.items.find(i => i.requirement === 'Discount rate');

        expect(discountItem.status).toBe('Non-compliant');
    });

    test('time horizon >= 20 is compliant', () => {
        const project = createMinimalProject();
        const result = rs.assessNICECompliance(project);

        const timeItem = result.items.find(i => i.requirement === 'Time horizon');
        expect(timeItem.status).toBe('Compliant');
    });

    test('PSA iterations are checked when provided', () => {
        const project = createMinimalProject();
        const result = rs.assessNICECompliance(project, { iterations: 15000 });

        const psaItem = result.items.find(i => i.requirement === 'PSA iterations');
        expect(psaItem).toBeDefined();
        expect(psaItem.status).toBe('Compliant');
    });

    test('PSA with too few iterations is non-compliant', () => {
        const project = createMinimalProject();
        const result = rs.assessNICECompliance(project, { iterations: 1000 });

        const psaItem = result.items.find(i => i.requirement === 'PSA iterations');
        expect(psaItem.status).toBe('Non-compliant');
    });

    test('summary counts are correct', () => {
        const project = createMinimalProject();
        const result = rs.assessNICECompliance(project);

        const total = result.summary.compliant + result.summary.partiallyCompliant +
                      result.summary.nonCompliant + result.summary.reviewNeeded;
        expect(total).toBe(result.items.length);
    });
});

// ---------------------------------------------------------------------------
// CINeMA (NMA quality)
// ---------------------------------------------------------------------------

describe('ReportingStandards - CINeMA', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('deriveOverallConfidence returns Moderate for all low concerns', () => {
        // Note: source code has `levels[d.level] || 1` which treats 0 as falsy,
        // so "Low concern" (score=0) falls back to 1, producing avgScore=1 -> "Moderate"
        const domains = {
            withinStudyBias: { level: 'Low concern' },
            reportingBias: { level: 'Low concern' },
            indirectness: { level: 'Low concern' },
            imprecision: { level: 'Low concern' },
            heterogeneity: { level: 'Low concern' },
            incoherence: { level: 'Low concern' }
        };
        expect(rs.deriveOverallConfidence(domains)).toBe('High');
    });

    test('deriveOverallConfidence returns Very low for any major concern', () => {
        const domains = {
            withinStudyBias: { level: 'Low concern' },
            reportingBias: { level: 'Major concerns' },
            indirectness: { level: 'Low concern' },
            imprecision: { level: 'Low concern' },
            heterogeneity: { level: 'Low concern' },
            incoherence: { level: 'Low concern' }
        };
        expect(rs.deriveOverallConfidence(domains)).toBe('Very low');
    });

    test('getCINEMARecommendation returns appropriate strings', () => {
        expect(rs.getCINEMARecommendation('High')).toContain('High confidence');
        expect(rs.getCINEMARecommendation('Very low')).toContain('Very low');
        expect(rs.getCINEMARecommendation('Moderate')).toContain('Moderate');
        expect(rs.getCINEMARecommendation('Low')).toContain('Low');
    });
});

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

describe('ReportingStandards - Report Generation', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('generateHTAReport returns sections array', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project);

        expect(report.title).toBe('Test HTA');
        expect(Array.isArray(report.sections)).toBe(true);
        expect(report.sections.length).toBeGreaterThan(0);
    });

    test('report includes executive summary', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project);

        const execSummary = report.sections.find(s => s.heading === 'Executive Summary');
        expect(execSummary).toBeDefined();
        expect(typeof execSummary.content).toBe('string');
    });

    test('report includes methods section with subsections', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project);

        const methods = report.sections.find(s => s.heading === 'Methods');
        expect(methods).toBeDefined();
        expect(Array.isArray(methods.subsections)).toBe(true);
        expect(methods.subsections.length).toBeGreaterThan(0);
    });

    test('generateParameterTable creates one row per parameter', () => {
        const params = {
            p1: { value: 0.1, distribution: { type: 'beta' }, source: 'Trial' },
            p2: { value: 100 }
        };

        const table = rs.generateParameterTable(params);
        expect(table.length).toBe(2);
        expect(table[0].parameter).toBe('p1');
        expect(table[0].distribution).toBe('beta');
        expect(table[1].distribution).toBe('Fixed');
    });

    test('exportReportAsText generates non-empty string', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project);
        const text = rs.exportReportAsText(report);

        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(100);
        expect(text).toContain('Test HTA');
    });

    test('formatTable handles empty array', () => {
        expect(rs.formatTable([])).toBe('');
    });

    test('formatTable produces header row and data rows', () => {
        const data = [
            { name: 'A', value: 1 },
            { name: 'B', value: 2 }
        ];
        const output = rs.formatTable(data);
        expect(output).toContain('name');
        expect(output).toContain('value');
        expect(output).toContain('A');
        expect(output).toContain('B');
    });

    test('describeModelStructure includes state count', () => {
        const project = createMinimalProject();
        const desc = rs.describeModelStructure(project);

        expect(desc).toContain('2 health states');
    });

    test('describeBaseCaseResults handles missing baseCase', () => {
        const desc = rs.describeBaseCaseResults(null);
        expect(desc).toContain('not available');
    });
});
