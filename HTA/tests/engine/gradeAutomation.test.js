/**
 * Tests for src/engine/gradeAutomation.js — GRADE Automation Engine
 */

'use strict';

const { GRADEAutomationEngine } = require('../../src/engine/gradeAutomation');

// ============ HELPERS ============

function makeMAResults(overrides = {}) {
    return {
        nStudies: 5,
        nParticipants: 2500,
        estimate: 0.75,
        measure: 'HR',
        ci95: { lower: 0.60, upper: 0.94 },
        I2: 30,
        tau2: 0.02,
        controlRate: 0.3,
        eggerP: 0.45,
        predictionInterval: { lower: 0.40, upper: 1.10 },
        ...overrides
    };
}

function makeOutcomes() {
    return [
        { name: 'Overall Survival', importance: 'critical', direction: 'beneficial' },
        { name: 'Progression-Free Survival', importance: 'important', direction: 'beneficial' }
    ];
}

function makeRoBData() {
    return [
        { study: 'TRIAL-001', randomization: 'low', blinding: 'low', attrition: 'low', reporting: 'low' },
        { study: 'TRIAL-002', randomization: 'low', blinding: 'high', attrition: 'low', reporting: 'low' },
        { study: 'TRIAL-003', randomization: 'low', blinding: 'low', attrition: 'high', reporting: 'low' },
        { study: 'TRIAL-004', randomization: 'low', blinding: 'low', attrition: 'low', reporting: 'low' },
        { study: 'TRIAL-005', randomization: 'low', blinding: 'low', attrition: 'low', reporting: 'low' }
    ];
}

function makeHighRoBData() {
    return [
        { study: 'TRIAL-001', randomization: 'high', blinding: 'high', attrition: 'low', reporting: 'low' },
        { study: 'TRIAL-002', randomization: 'high', blinding: 'high', attrition: 'high', reporting: 'low' },
        { study: 'TRIAL-003', randomization: 'high', blinding: 'low', attrition: 'high', reporting: 'high' },
        { study: 'TRIAL-004', randomization: 'low', blinding: 'low', attrition: 'low', reporting: 'low' },
        { study: 'TRIAL-005', randomization: 'low', blinding: 'low', attrition: 'low', reporting: 'low' }
    ];
}

// ============ TESTS ============

describe('GRADEAutomationEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new GRADEAutomationEngine();
    });

    // ------------------------------------------------------------------
    // 1. Assessment returns evidence profile array
    // ------------------------------------------------------------------

    test('1. Assessment returns evidence profile array', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: makeOutcomes(),
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile).toBeDefined();
        expect(Array.isArray(result.evidenceProfile)).toBe(true);
        expect(result.evidenceProfile.length).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // 2. Each profile entry has all GRADE domains
    // ------------------------------------------------------------------

    test('2. Each profile entry has all GRADE domains', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: makeOutcomes(),
            riskOfBias: makeRoBData()
        });

        for (const ep of result.evidenceProfile) {
            expect(ep.outcome).toBeDefined();
            expect(ep.nStudies).toBeDefined();
            expect(ep.riskOfBias).toBeDefined();
            expect(ep.inconsistency).toBeDefined();
            expect(ep.indirectness).toBeDefined();
            expect(ep.imprecision).toBeDefined();
            expect(ep.publicationBias).toBeDefined();
            expect(ep.overallCertainty).toBeDefined();
            expect(ep.effectEstimate).toBeDefined();
            expect(ep.importance).toBeDefined();
        }
    });

    // ------------------------------------------------------------------
    // 3. High I² → inconsistency "Serious"
    // ------------------------------------------------------------------

    test('3. High I² → inconsistency "Serious"', () => {
        const result = engine.assessEvidence(makeMAResults({ I2: 75, nStudies: 5 }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].inconsistency).toBe('Serious');
    });

    // ------------------------------------------------------------------
    // 4. Low I² → inconsistency "Not serious"
    // ------------------------------------------------------------------

    test('4. Low I² → inconsistency "Not serious"', () => {
        const result = engine.assessEvidence(makeMAResults({ I2: 20, nStudies: 5, predictionInterval: null }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].inconsistency).toBe('Not serious');
    });

    // ------------------------------------------------------------------
    // 5. Wide CI → imprecision "Serious"
    // ------------------------------------------------------------------

    test('5. Wide CI → imprecision "Serious"', () => {
        // CI crossing null line (1 for HR) — serious imprecision
        const result = engine.assessEvidence(makeMAResults({
            estimate: 0.85,
            measure: 'HR',
            ci95: { lower: 0.50, upper: 1.40 }
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].imprecision).toBe('Serious');
    });

    // ------------------------------------------------------------------
    // 6. Narrow CI → imprecision "Not serious"
    // ------------------------------------------------------------------

    test('6. Narrow CI → imprecision "Not serious"', () => {
        // CI not crossing null, narrow relative to estimate
        const result = engine.assessEvidence(makeMAResults({
            estimate: 0.60,
            measure: 'HR',
            ci95: { lower: 0.50, upper: 0.72 },
            nParticipants: 50000  // large sample to exceed OIS
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].imprecision).toBe('Not serious');
    });

    // ------------------------------------------------------------------
    // 7. Significant Egger → publication bias "Serious"
    // ------------------------------------------------------------------

    test('7. Significant Egger → publication bias "Serious"', () => {
        const result = engine.assessEvidence(makeMAResults({ eggerP: 0.03, nStudies: 12 }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].publicationBias).toBe('Serious');
    });

    // ------------------------------------------------------------------
    // 8. Overall certainty: High minus downgrades
    // ------------------------------------------------------------------

    test('8. Overall certainty: High with no serious domains', () => {
        const result = engine.assessEvidence(makeMAResults({
            I2: 10,
            estimate: 0.60,
            measure: 'HR',
            ci95: { lower: 0.50, upper: 0.72 },
            eggerP: 0.5,
            nStudies: 12,
            nParticipants: 50000,
            predictionInterval: null
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].overallCertainty).toBe('High');
    });

    test('8b. Overall certainty: Moderate with 1 serious domain', () => {
        // High I2 → 1 downgrade → Moderate
        const result = engine.assessEvidence(makeMAResults({
            I2: 75,
            estimate: 0.60,
            measure: 'HR',
            ci95: { lower: 0.50, upper: 0.72 },
            eggerP: 0.5,
            nStudies: 12,
            nParticipants: 50000,
            predictionInterval: null
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].overallCertainty).toBe('Moderate');
    });

    // ------------------------------------------------------------------
    // 9. Very low certainty: 3+ serious downgrades
    // ------------------------------------------------------------------

    test('9. Very low certainty: 3+ serious downgrades', () => {
        const result = engine.assessEvidence(makeMAResults({
            I2: 80,
            estimate: 0.90,
            measure: 'HR',
            ci95: { lower: 0.50, upper: 1.50 },
            eggerP: 0.02,
            nStudies: 12,
            nParticipants: 100,
            predictionInterval: null
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeHighRoBData(),
            indirectnessNotes: 'Serious indirectness: surrogate endpoint used'
        });

        const certainty = result.evidenceProfile[0].overallCertainty;
        // Should be Very low (4+ downgrades capped at Very low)
        expect(certainty).toBe('Very low');
    });

    // ------------------------------------------------------------------
    // 10. OIS calculation: reasonable sample size
    // ------------------------------------------------------------------

    test('10. OIS calculation returns reasonable sample size', () => {
        const ois = engine.optimalInformationSize({ controlRate: 0.2 }, 0.25, 0.05, 0.80);
        expect(ois).toBeDefined();
        expect(typeof ois).toBe('number');
        expect(ois).toBeGreaterThan(100);
        expect(ois).toBeLessThan(100000);
    });

    test('10b. OIS with different parameters', () => {
        // Smaller effect size → larger OIS
        const oisSmall = engine.optimalInformationSize({ controlRate: 0.2 }, 0.10, 0.05, 0.80);
        const oisLarge = engine.optimalInformationSize({ controlRate: 0.2 }, 0.40, 0.05, 0.80);
        expect(oisSmall).toBeGreaterThan(oisLarge);
    });

    test('10c. OIS returns null for invalid RR', () => {
        expect(engine.optimalInformationSize({ controlRate: 0.2 }, 0, 0.05, 0.80)).toBeNull();
        expect(engine.optimalInformationSize({ controlRate: 0.2 }, 1, 0.05, 0.80)).toBeNull();
    });

    // ------------------------------------------------------------------
    // 11. CINeMA returns 6 domains
    // ------------------------------------------------------------------

    test('11. CINeMA returns 6 domains', () => {
        const cinema = engine.generateCINEMA(makeMAResults());
        expect(cinema.framework).toBe('CINeMA');
        expect(cinema.domains).toBeDefined();
        expect(Object.keys(cinema.domains)).toHaveLength(6);
        expect(cinema.domains.withinStudyBias).toBeDefined();
        expect(cinema.domains.reportingBias).toBeDefined();
        expect(cinema.domains.indirectness).toBeDefined();
        expect(cinema.domains.imprecision).toBeDefined();
        expect(cinema.domains.heterogeneity).toBeDefined();
        expect(cinema.domains.incoherence).toBeDefined();
        expect(cinema.overallConfidence).toBeDefined();
    });

    // ------------------------------------------------------------------
    // 12. SoF table has outcome names and effects
    // ------------------------------------------------------------------

    test('12. SoF table has outcome names and effects', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: makeOutcomes(),
            riskOfBias: makeRoBData()
        });

        expect(result.summaryOfFindings).toBeDefined();
        expect(result.summaryOfFindings.outcomes).toHaveLength(2);
        expect(result.summaryOfFindings.outcomes[0].outcome).toBe('Overall Survival');
        expect(result.summaryOfFindings.outcomes[0].certainty).toBeDefined();
        expect(result.summaryOfFindings.outcomes[0].certaintySymbol).toBeDefined();
    });

    // ------------------------------------------------------------------
    // 13. exportGRADETable HTML contains table tags
    // ------------------------------------------------------------------

    test('13. exportGRADETable HTML contains table tags', () => {
        const assessment = engine.assessEvidence(makeMAResults(), {
            outcomes: makeOutcomes(),
            riskOfBias: makeRoBData()
        });
        const html = engine.exportGRADETable(assessment, 'html');
        expect(html).toContain('<table');
        expect(html).toContain('</table>');
        expect(html).toContain('<thead');
        expect(html).toContain('<tbody');
        expect(html).toContain('Overall Survival');
    });

    // ------------------------------------------------------------------
    // 14. exportGRADETable Markdown contains pipes
    // ------------------------------------------------------------------

    test('14. exportGRADETable Markdown contains pipes', () => {
        const assessment = engine.assessEvidence(makeMAResults(), {
            outcomes: makeOutcomes(),
            riskOfBias: makeRoBData()
        });
        const md = engine.exportGRADETable(assessment, 'markdown');
        expect(md).toContain('|');
        expect(md).toContain('Outcome');
        expect(md).toContain('Overall Survival');
        expect(md).toContain('---');
    });

    // ------------------------------------------------------------------
    // 15. Edge: single study → special handling
    // ------------------------------------------------------------------

    test('15. Single study: inconsistency not applicable', () => {
        const result = engine.assessEvidence(makeMAResults({ nStudies: 1 }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: []
        });

        expect(result.evidenceProfile[0].inconsistency).toBe('Not serious');
    });

    // ------------------------------------------------------------------
    // 16. Publication bias with < 10 studies and no Egger
    // ------------------------------------------------------------------

    test('16. Fewer than 10 studies without Egger → Undetected', () => {
        const result = engine.assessEvidence(makeMAResults({ nStudies: 5, eggerP: null }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].publicationBias).toBe('Undetected');
    });

    // ------------------------------------------------------------------
    // 17. Risk of bias with > 50% high risk → Serious
    // ------------------------------------------------------------------

    test('17. Risk of bias: >50% high risk studies → Serious', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeHighRoBData()
        });

        expect(result.evidenceProfile[0].riskOfBias).toBe('Serious');
    });

    // ------------------------------------------------------------------
    // 18. Risk of bias with low risk → Not serious
    // ------------------------------------------------------------------

    test('18. Risk of bias: mostly low risk → Not serious', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].riskOfBias).toBe('Not serious');
    });

    // ------------------------------------------------------------------
    // 19. Explanations generated for each outcome
    // ------------------------------------------------------------------

    test('19. Explanations generated for each outcome', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: makeOutcomes(),
            riskOfBias: makeRoBData()
        });

        expect(result.explanations).toBeDefined();
        expect(result.explanations['Overall Survival']).toBeDefined();
        expect(result.explanations['Progression-Free Survival']).toBeDefined();
        expect(result.explanations['Overall Survival'].riskOfBias).toBeDefined();
        expect(result.explanations['Overall Survival'].overallCertainty).toBeDefined();
    });

    // ------------------------------------------------------------------
    // 20. No outcomes provided → default profile created
    // ------------------------------------------------------------------

    test('20. No outcomes provided → fallback profile created', () => {
        const result = engine.assessEvidence(makeMAResults(), {});
        expect(result.evidenceProfile).toHaveLength(1);
        expect(result.evidenceProfile[0].outcome).toBe('Primary outcome');
    });

    // ------------------------------------------------------------------
    // 21. Null assessment export handled
    // ------------------------------------------------------------------

    test('21. exportGRADETable handles null assessment', () => {
        const html = engine.exportGRADETable(null, 'html');
        expect(html).toContain('No GRADE assessment');

        const md = engine.exportGRADETable(null, 'markdown');
        expect(md).toContain('No GRADE assessment');
    });

    // ------------------------------------------------------------------
    // 22. CINeMA heterogeneity levels
    // ------------------------------------------------------------------

    test('22. CINeMA: high I² → major concerns heterogeneity', () => {
        const cinema = engine.generateCINEMA(makeMAResults({ I2: 85 }));
        expect(cinema.domains.heterogeneity.level).toBe('Major concerns');
    });

    // ------------------------------------------------------------------
    // 23. Prediction interval crossing null → inconsistency Serious
    // ------------------------------------------------------------------

    test('23. Prediction interval crossing null triggers inconsistency Serious', () => {
        const result = engine.assessEvidence(makeMAResults({
            I2: 30,  // below cutoff
            nStudies: 5,
            predictionInterval: { lower: 0.40, upper: 1.20 }  // crosses 1 (HR null)
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        // PI crosses null → Serious even though I² is low
        expect(result.evidenceProfile[0].inconsistency).toBe('Serious');
    });

    // ------------------------------------------------------------------
    // 24. Trim-and-fill changes estimate → Serious pub bias
    // ------------------------------------------------------------------

    test('24. Trim-fill large change → publication bias Serious', () => {
        const result = engine.assessEvidence(makeMAResults({
            nStudies: 12,
            eggerP: 0.15,  // non-significant Egger
            trimFill: { original: 0.75, adjusted: 0.90 }  // 20% change
        }), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        expect(result.evidenceProfile[0].publicationBias).toBe('Serious');
    });

    // ------------------------------------------------------------------
    // 25. Effect estimate formatted correctly
    // ------------------------------------------------------------------

    test('25. Effect estimate includes measure and CI', () => {
        const result = engine.assessEvidence(makeMAResults(), {
            outcomes: [{ name: 'OS', importance: 'critical' }],
            riskOfBias: makeRoBData()
        });

        const effect = result.evidenceProfile[0].effectEstimate;
        expect(effect).toContain('HR');
        expect(effect).toContain('0.75');
        expect(effect).toContain('0.60');
        expect(effect).toContain('0.94');
    });
});
