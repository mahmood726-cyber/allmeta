/**
 * Tests for src/engine/reporting.js — report formatting, CINeMA, NMA quality,
 * parameter tables, text export, discussion/PSA/base-case narrative
 */

'use strict';

const { ReportingStandards } = require('../../src/engine/reporting');

// Shared fixture
function createMinimalProject() {
    return {
        name: 'Test HTA',
        settings: {
            time_horizon: 25, cycle_length: 1,
            discount_rate_costs: 0.035, discount_rate_qalys: 0.035,
            half_cycle_correction: true, starting_age: 60,
            perspective: 'NHS and PSS', model_type: 'Markov cohort'
        },
        states: { alive: { label: 'Alive' }, dead: { label: 'Dead' } },
        transitions: { alive_to_dead: { from: 'alive', to: 'dead' } },
        strategies: {
            comparator: { label: 'Comparator' },
            intervention: { label: 'Intervention' }
        },
        parameters: {
            p_death: { value: 0.05, distribution: { type: 'beta', alpha: 5, beta: 95 }, source: 'ONS' },
            c_alive: { value: 1000 }
        }
    };
}

describe('ReportingStandards — CINeMA framework', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('assessCINEMA generates comparisons for all treatment pairs', () => {
        const nmaResults = {
            treatments: ['A', 'B', 'C'],
            heterogeneity: { I2: 30 },
            consistency: {},
            funnelTest: { pValue: 0.5 },
            effects: []
        };
        const result = rs.assessCINEMA(nmaResults);
        // 3 treatments => 3 pairs: A vs B, A vs C, B vs C
        expect(result.comparisons).toHaveLength(3);
    });

    test('each comparison has domains and overallConfidence', () => {
        const nmaResults = {
            treatments: ['A', 'B'],
            heterogeneity: { I2: 10 },
            consistency: {},
            funnelTest: { pValue: 0.8 },
            effects: []
        };
        const result = rs.assessCINEMA(nmaResults);
        const comp = result.comparisons[0];
        expect(comp.domains).toBeDefined();
        expect(comp.overallConfidence).toBeDefined();
        expect(comp.recommendation).toBeDefined();
    });

    test('high heterogeneity yields Major concerns for heterogeneity domain', () => {
        const nmaResults = {
            treatments: ['A', 'B'],
            heterogeneity: { I2: 85 },
            consistency: {},
            funnelTest: { pValue: 0.5 },
            effects: []
        };
        const result = rs.assessCINEMA(nmaResults);
        expect(result.comparisons[0].domains.heterogeneity.level).toBe('Major concerns');
    });

    test('funnel pValue < 0.1 yields Major concerns for reporting bias', () => {
        const nmaResults = {
            treatments: ['A', 'B'],
            heterogeneity: { I2: 10 },
            consistency: {},
            funnelTest: { pValue: 0.05 },
            effects: []
        };
        const result = rs.assessCINEMA(nmaResults);
        expect(result.comparisons[0].domains.reportingBias.level).toBe('Major concerns');
    });
});

describe('ReportingStandards — deriveOverallConfidence', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('all Major concerns → Very low', () => {
        const domains = {
            a: { level: 'Major concerns' },
            b: { level: 'Major concerns' }
        };
        expect(rs.deriveOverallConfidence(domains)).toBe('Very low');
    });

    test('all Low concern → High', () => {
        const domains = {
            a: { level: 'Low concern' },
            b: { level: 'Low concern' }
        };
        expect(rs.deriveOverallConfidence(domains)).toBe('High');
    });

    test('all Some concerns → Moderate (avg=1, not >1)', () => {
        const domains = {
            a: { level: 'Some concerns' },
            b: { level: 'Some concerns' }
        };
        expect(rs.deriveOverallConfidence(domains)).toBe('Moderate');
    });

    test('mix of Low and Some → High (avg=0.5, not >0.5)', () => {
        const domains = {
            a: { level: 'Low concern' },
            b: { level: 'Some concerns' }
        };
        expect(rs.deriveOverallConfidence(domains)).toBe('High');
    });

    test('mostly Some concerns with one Low → Moderate (avg > 0.5)', () => {
        const domains = {
            a: { level: 'Some concerns' },
            b: { level: 'Some concerns' },
            c: { level: 'Low concern' }
        };
        // avg = (1+1+0)/3 = 0.667 > 0.5 => Moderate
        expect(rs.deriveOverallConfidence(domains)).toBe('Moderate');
    });
});

describe('ReportingStandards — getCINEMARecommendation', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test.each([
        ['Very low', 'urgently'],
        ['Low', 'substantially'],
        ['Moderate', 'close to'],
        ['High', 'Very unlikely']
    ])('confidence %s contains keyword %s', (level, keyword) => {
        expect(rs.getCINEMARecommendation(level)).toContain(keyword);
    });

    test('unknown level returns default message', () => {
        expect(rs.getCINEMARecommendation('unknown')).toContain('not assessed');
    });
});

describe('ReportingStandards — generateHTAReport', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('returns report with title and sections array', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project, {});
        expect(report.title).toBe('Test HTA');
        expect(report.sections).toBeDefined();
        expect(report.sections.length).toBeGreaterThan(0);
    });

    test('includes executive summary', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project, {});
        expect(report.sections.some(s => s.heading === 'Executive Summary')).toBe(true);
    });

    test('includes reporting standards compliance', () => {
        const project = createMinimalProject();
        const report = rs.generateHTAReport(project, {});
        expect(report.sections.some(s => s.heading === 'Reporting Standards Compliance')).toBe(true);
    });
});

describe('ReportingStandards — exportReportAsText', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('produces formatted text with headings', () => {
        const report = {
            title: 'Test Report',
            generatedDate: '2026-01-01',
            sections: [
                { heading: 'Intro', content: 'Introduction text' },
                { heading: 'Methods', subsections: [
                    { heading: 'Design', content: 'RCT design' }
                ]}
            ]
        };
        const text = rs.exportReportAsText(report);
        expect(text).toContain('Test Report');
        expect(text).toContain('## Intro');
        expect(text).toContain('### Design');
        expect(text).toContain('RCT design');
    });

    test('handles subsections with tables', () => {
        const report = {
            title: 'T', generatedDate: '2026-01-01',
            sections: [{
                heading: 'Data',
                subsections: [{
                    heading: 'Params',
                    content: 'x',
                    table: [{ name: 'p', value: 0.5 }]
                }]
            }]
        };
        const text = rs.exportReportAsText(report);
        expect(text).toContain('name');
        expect(text).toContain('0.5');
    });
});

describe('ReportingStandards — formatTable', () => {
    let rs;

    beforeEach(() => {
        rs = new ReportingStandards();
    });

    test('formats array of objects into text table', () => {
        const data = [
            { param: 'alpha', value: '0.05' },
            { param: 'beta', value: '0.10' }
        ];
        const output = rs.formatTable(data);
        expect(output).toContain('param');
        expect(output).toContain('alpha');
        expect(output).toContain('0.10');
    });

    test('returns empty string for empty array', () => {
        expect(rs.formatTable([])).toBe('');
    });

    test('returns empty string for non-array', () => {
        expect(rs.formatTable('not an array')).toBe('');
    });
});
