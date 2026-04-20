/**
 * Tests for src/engine/aiInterpretation.js
 * Covers AIInterpretationEngine: constructor, meta-analysis interpretation,
 * heterogeneity, publication bias, precision, clinical significance,
 * GRADE assessment, NMA interpretation, formatting, and edge cases.
 */

'use strict';

const AIInterpretationEngine = require('../../src/engine/aiInterpretation');

// Helper: standard meta-analysis results fixture
function createMAResults(overrides = {}) {
    return {
        pooledEffect: {
            estimate: 0.5,
            ciLower: 0.2,
            ciUpper: 0.8,
            pValue: 0.001,
            ...overrides.pooledEffect
        },
        effectMeasure: overrides.effectMeasure || 'SMD',
        heterogeneity: {
            I2: 30,
            tau2: 0.05,
            Q: 5.2,
            pQ: 0.15,
            ...overrides.heterogeneity
        },
        publicationBias: overrides.publicationBias !== undefined ? overrides.publicationBias : {
            egger: { intercept: 0.5, pValue: 0.3 }
        },
        nStudies: overrides.nStudies !== undefined ? overrides.nStudies : 15,
        intervention: overrides.intervention || 'the intervention'
    };
}

describe('AIInterpretationEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new AIInterpretationEngine();
    });

    // ================================================================
    // CONSTRUCTOR AND OPTIONS
    // ================================================================

    describe('Constructor', () => {
        test('defaults to English language and comprehensive detail', () => {
            expect(engine.options.language).toBe('en');
            expect(engine.options.detailLevel).toBe('comprehensive');
            expect(engine.options.audience).toBe('mixed');
        });

        test('accepts custom options', () => {
            const custom = new AIInterpretationEngine({
                language: 'fr',
                detailLevel: 'brief',
                audience: 'clinical'
            });
            expect(custom.options.language).toBe('fr');
            expect(custom.options.detailLevel).toBe('brief');
            expect(custom.options.audience).toBe('clinical');
        });

        test('initializes rules for all domains', () => {
            expect(engine.rules).toHaveProperty('heterogeneity');
            expect(engine.rules).toHaveProperty('effectSize');
            expect(engine.rules).toHaveProperty('publicationBias');
            expect(engine.rules).toHaveProperty('consistency');
            expect(engine.rules).toHaveProperty('precision');
        });

        test('includes willingness-to-pay thresholds for multiple countries', () => {
            expect(engine.thresholds._willingness_to_pay.uk).toBe(30000);
            expect(engine.thresholds._willingness_to_pay.us).toBe(50000);
        });

        test('has minimal important difference thresholds', () => {
            expect(engine.thresholds.minimalImportantDifference.SMD).toBe(0.2);
            expect(engine.thresholds.minimalImportantDifference.OR).toBe(1.2);
            expect(engine.thresholds.minimalImportantDifference.HR).toBe(1.15);
        });
    });

    // ================================================================
    // META-ANALYSIS INTERPRETATION
    // ================================================================

    describe('interpretMetaAnalysis', () => {
        test('returns interpretation with all expected sections', () => {
            const results = createMAResults();
            const interp = engine.interpretMetaAnalysis(results);

            expect(interp).toHaveProperty('summary');
            expect(interp).toHaveProperty('detailed');
            expect(interp).toHaveProperty('clinicalSignificance');
            expect(interp).toHaveProperty('limitations');
            expect(interp).toHaveProperty('recommendations');
            expect(interp).toHaveProperty('gradeAssessment');
            expect(interp).toHaveProperty('references');
        });

        test('summary includes effect estimate and CI', () => {
            const results = createMAResults();
            const interp = engine.interpretMetaAnalysis(results);

            expect(interp.summary).toContain('95% CI');
            expect(interp.summary).toContain('0.500');
        });

        test('references are populated when includeReferences is true', () => {
            const results = createMAResults();
            const interp = engine.interpretMetaAnalysis(results);
            expect(interp.references.length).toBeGreaterThan(0);
        });

        test('omits recommendations when option is false', () => {
            const noRec = new AIInterpretationEngine({ includeRecommendations: false });
            const results = createMAResults();
            const interp = noRec.interpretMetaAnalysis(results);
            expect(interp.gradeAssessment).toBeNull();
        });
    });

    // ================================================================
    // POOLED EFFECT INTERPRETATION
    // ================================================================

    describe('interpretPooledEffect', () => {
        test('positive SMD is described as favorable', () => {
            const text = engine.interpretPooledEffect(
                { estimate: 0.5, ciLower: 0.2, ciUpper: 0.8, pValue: 0.001 },
                'SMD',
                {}
            );
            expect(text).toContain('favorable');
            expect(text).toContain('statistically significant');
        });

        test('negative SMD is described as unfavorable', () => {
            const text = engine.interpretPooledEffect(
                { estimate: -0.3, ciLower: -0.6, ciUpper: -0.1, pValue: 0.02 },
                'SMD',
                {}
            );
            expect(text).toContain('unfavorable');
        });

        test('estimate of exactly 0 for SMD says no difference', () => {
            const text = engine.interpretPooledEffect(
                { estimate: 0, ciLower: -0.2, ciUpper: 0.2, pValue: 0.99 },
                'SMD',
                {}
            );
            expect(text).toContain('No difference');
        });

        test('OR > 1 is described as higher rates', () => {
            const text = engine.interpretPooledEffect(
                { estimate: 1.5, ciLower: 1.1, ciUpper: 2.0, pValue: 0.01 },
                'OR',
                {}
            );
            expect(text).toContain('higher rates');
        });

        test('OR < 1 is described as lower rates', () => {
            const text = engine.interpretPooledEffect(
                { estimate: 0.7, ciLower: 0.5, ciUpper: 0.9, pValue: 0.01 },
                'RR',
                {}
            );
            expect(text).toContain('lower rates');
        });

        test('non-significant result (p > 0.05) states not significant', () => {
            const text = engine.interpretPooledEffect(
                { estimate: 0.1, ciLower: -0.1, ciUpper: 0.3, pValue: 0.30 },
                'SMD',
                {}
            );
            expect(text).toContain('not statistically significant');
        });
    });

    // ================================================================
    // HETEROGENEITY INTERPRETATION
    // ================================================================

    describe('interpretHeterogeneity', () => {
        test('I2 < 25 is negligible', () => {
            const result = engine.interpretHeterogeneity({ I2: 10, tau2: 0.01, Q: 2, pQ: 0.5 });
            expect(result.assessment).toContain('negligible');
        });

        test('I2 25-50 is low', () => {
            const result = engine.interpretHeterogeneity({ I2: 35, tau2: 0.03, Q: 6, pQ: 0.2 });
            expect(result.assessment).toContain('low');
        });

        test('I2 50-75 is moderate with actions', () => {
            const result = engine.interpretHeterogeneity({ I2: 60, tau2: 0.1, Q: 15, pQ: 0.01 });
            expect(result.assessment).toContain('moderate');
            expect(result.actions.length).toBeGreaterThan(0);
            expect(result.actions).toContain('Consider subgroup analysis');
        });

        test('I2 >= 75 is substantial', () => {
            const result = engine.interpretHeterogeneity({ I2: 85, tau2: 0.5, Q: 30, pQ: 0.001 });
            expect(result.assessment).toContain('substantial');
        });

        test('significant Q test noted when pQ < 0.05', () => {
            const result = engine.interpretHeterogeneity({ I2: 60, tau2: 0.1, Q: 15, pQ: 0.01 });
            expect(result.assessment).toContain('statistically significant');
        });

        test('returns empty string for null input', () => {
            expect(engine.interpretHeterogeneity(null)).toBe('');
        });
    });

    // ================================================================
    // PUBLICATION BIAS INTERPRETATION
    // ================================================================

    describe('interpretPublicationBias', () => {
        test('significant Egger test warns about bias', () => {
            const result = engine.interpretPublicationBias({
                egger: { intercept: 2.1, pValue: 0.02 }
            });
            expect(result.assessment).toContain('asymmetry');
            expect(result.recommendations.length).toBeGreaterThan(0);
        });

        test('non-significant Egger test reports no asymmetry', () => {
            const result = engine.interpretPublicationBias({
                egger: { intercept: 0.3, pValue: 0.45 }
            });
            expect(result.assessment).toContain('no significant asymmetry');
        });

        test('trim-and-fill with imputed studies noted', () => {
            const result = engine.interpretPublicationBias({
                egger: { intercept: 0.1, pValue: 0.5 },
                trimAndFill: { imputed: 3 }
            });
            expect(result.assessment).toContain('3');
            expect(result.assessment).toContain('imputed');
        });

        test('returns empty string for null input', () => {
            expect(engine.interpretPublicationBias(null)).toBe('');
        });
    });

    // ================================================================
    // PRECISION INTERPRETATION
    // ================================================================

    describe('interpretPrecision', () => {
        test('CI crossing null value for continuous measure indicates imprecision', () => {
            const result = engine.interpretPrecision({ ciLower: -0.1, ciUpper: 0.3 });
            expect(result.assessment).toContain('includes the null');
            expect(result.implications).toContain('More data');
        });

        test('CI not crossing null indicates precision', () => {
            const result = engine.interpretPrecision({ ciLower: 0.1, ciUpper: 0.5 });
            expect(result.assessment).toContain('excludes the null');
        });

        test('CI crossing 1 for ratio measures indicates imprecision', () => {
            const result = engine.interpretPrecision({ ciLower: 0.8, ciUpper: 1.3 });
            expect(result.assessment).toContain('includes the null');
        });
    });

    // ================================================================
    // CLINICAL SIGNIFICANCE
    // ================================================================

    describe('assessClinicalSignificance', () => {
        test('large SMD is clinically significant', () => {
            const text = engine.assessClinicalSignificance(
                { estimate: 0.6, ciLower: 0.3, ciUpper: 0.9 },
                { effectMeasure: 'SMD' }
            );
            expect(text).toContain('clinically');
        });

        test('very small effect is not clinically meaningful', () => {
            const text = engine.assessClinicalSignificance(
                { estimate: 0.05, ciLower: -0.1, ciUpper: 0.2 },
                { effectMeasure: 'SMD' }
            );
            expect(text).toContain('not be clinically meaningful');
        });

        test('MD without threshold mentions context-specific', () => {
            const text = engine.assessClinicalSignificance(
                { estimate: 5, ciLower: 2, ciUpper: 8 },
                { effectMeasure: 'MD' }
            );
            expect(text).toContain('context-specific');
        });
    });

    // ================================================================
    // GRADE ASSESSMENT
    // ================================================================

    describe('assessGRADE', () => {
        test('starts at High for RCTs', () => {
            const results = createMAResults({ heterogeneity: { I2: 10, tau2: 0, Q: 2, pQ: 0.5 } });
            const grade = engine.assessGRADE(results);
            expect(grade.finalRating).toBe('High');
        });

        test('downgrades for high heterogeneity', () => {
            const results = createMAResults({
                heterogeneity: { I2: 70, tau2: 0.2, Q: 20, pQ: 0.01 }
            });
            const grade = engine.assessGRADE(results);
            // Should have been downgraded from High
            expect(['Moderate', 'Low', 'Very low']).toContain(grade.finalRating);
            expect(grade.domains.inconsistency.concern).toBe('Serious');
        });

        test('downgrades for imprecision when CI crosses null', () => {
            const results = createMAResults({
                pooledEffect: { estimate: 0.1, ciLower: -0.2, ciUpper: 0.4, pValue: 0.5 },
                heterogeneity: { I2: 10, tau2: 0, Q: 2, pQ: 0.5 }
            });
            const grade = engine.assessGRADE(results);
            expect(grade.domains.imprecision).toBeDefined();
            expect(grade.domains.imprecision.concern).toBe('Serious');
        });

        test('downgrades for publication bias', () => {
            const results = createMAResults({
                heterogeneity: { I2: 10, tau2: 0, Q: 2, pQ: 0.5 },
                publicationBias: { egger: { intercept: 2.5, pValue: 0.01 } }
            });
            const grade = engine.assessGRADE(results);
            expect(grade.domains.publicationBias).toBeDefined();
        });

        test('summary includes final rating', () => {
            const results = createMAResults();
            const grade = engine.assessGRADE(results);
            expect(grade.summary).toContain(grade.finalRating.toLowerCase());
        });
    });

    // ================================================================
    // NUMERIC FORMATTING
    // ================================================================

    describe('formatEffect', () => {
        test('SMD uses 3 decimal places', () => {
            expect(engine.formatEffect(0.12345, 'SMD')).toBe('0.123');
        });

        test('OR uses 2 decimal places', () => {
            expect(engine.formatEffect(1.567, 'OR')).toBe('1.57');
        });

        test('RR uses 2 decimal places', () => {
            expect(engine.formatEffect(0.85, 'RR')).toBe('0.85');
        });

        test('HR uses 2 decimal places', () => {
            expect(engine.formatEffect(1.234, 'HR')).toBe('1.23');
        });
    });

    // ================================================================
    // DOWNGRADE UTILITY
    // ================================================================

    describe('downgrade', () => {
        test('downgrades High by 1 to Moderate', () => {
            expect(engine.downgrade('High', 1)).toBe('Moderate');
        });

        test('downgrades High by 2 to Low', () => {
            expect(engine.downgrade('High', 2)).toBe('Low');
        });

        test('downgrades Moderate by 2 to Very low', () => {
            expect(engine.downgrade('Moderate', 2)).toBe('Very low');
        });

        test('does not go below Very low', () => {
            expect(engine.downgrade('Very low', 1)).toBe('Very low');
        });
    });

    // ================================================================
    // LIMITATION IDENTIFICATION
    // ================================================================

    describe('identifyLimitations', () => {
        test('flags high heterogeneity', () => {
            const results = createMAResults({ heterogeneity: { I2: 75, tau2: 0.2, Q: 20, pQ: 0.01 } });
            const lims = engine.identifyLimitations(results);
            expect(lims.some(l => l.includes('heterogeneity'))).toBe(true);
        });

        test('flags publication bias', () => {
            const results = createMAResults({
                publicationBias: { egger: { intercept: 2, pValue: 0.02 } }
            });
            const lims = engine.identifyLimitations(results);
            expect(lims.some(l => l.includes('publication bias'))).toBe(true);
        });

        test('flags limited number of studies', () => {
            const results = createMAResults({ nStudies: 5 });
            const lims = engine.identifyLimitations(results);
            expect(lims.some(l => l.includes('Limited number'))).toBe(true);
        });

        test('returns empty array when no limitations', () => {
            const results = createMAResults({
                heterogeneity: { I2: 10, tau2: 0, Q: 2, pQ: 0.5 },
                publicationBias: { egger: { intercept: 0.1, pValue: 0.8 } },
                nStudies: 20
            });
            expect(engine.identifyLimitations(results)).toEqual([]);
        });
    });

    // ================================================================
    // NMA INTERPRETATION
    // ================================================================

    describe('NMA interpretation', () => {
        test('interpretNMA returns structured interpretation', () => {
            const nmaResults = {
                treatments: ['A', 'B', 'C'],
                studies: [{ id: 1 }, { id: 2 }, { id: 3 }],
                network: { nodes: [1, 2, 3], edges: [1, 2, 3] },
                sucra: [0.8, 0.5, 0.3],
                pScores: [0.8, 0.5, 0.3],
                nodeSplitting: { results: [] },
                inconsistency: { Q: 1, pValue: 0.5 }
            };
            const interp = engine.interpretNMA(nmaResults);

            expect(interp.summary).toContain('3 treatments');
            expect(interp.summary).toContain('3 studies');
            expect(interp.rankingInterpretation).toContain('A');
            expect(interp.rankingInterpretation).toContain('SUCRA');
        });

        test('interceptRankings identifies best and worst treatment', () => {
            const text = engine.interceptRankings(
                [0.9, 0.4, 0.1],
                [0.9, 0.4, 0.1],
                ['Drug A', 'Drug B', 'Drug C']
            );
            expect(text).toContain('Drug A');
            expect(text).toContain('Drug C');
            expect(text).toContain('90.0%');
        });

        test('interpretNMAConsistency with no inconsistency', () => {
            const text = engine.interpretNMAConsistency(
                { results: [{ consistent: true }, { consistent: true }] },
                { Q: 1, pValue: 0.5 }
            );
            expect(text).toContain('no evidence of inconsistency');
        });

        test('interpretNMAConsistency flags inconsistent comparisons', () => {
            const text = engine.interpretNMAConsistency(
                { results: [{ consistent: true }, { consistent: false }] },
                { Q: 5, pValue: 0.03 }
            );
            expect(text).toContain('inconsistency in 1 comparison');
            expect(text).toContain('global inconsistency test is significant');
        });
    });

    // ================================================================
    // RECOMMENDATION GENERATION
    // ================================================================

    describe('generateRecommendations', () => {
        test('strong recommendation for significant effect and high GRADE', () => {
            const results = createMAResults({ pooledEffect: { estimate: 0.5, ciLower: 0.2, ciUpper: 0.8, pValue: 0.001 } });
            const grade = { finalRating: 'High' };
            const recs = engine.generateRecommendations(results, grade);

            expect(recs.length).toBeGreaterThan(0);
            expect(recs[0].strength).toBe('Strong');
            expect(recs[0].certainty).toBe('High');
        });

        test('conditional recommendation for low GRADE', () => {
            const results = createMAResults({ pooledEffect: { estimate: 0.5, ciLower: 0.2, ciUpper: 0.8, pValue: 0.01 } });
            const grade = { finalRating: 'Low' };
            const recs = engine.generateRecommendations(results, grade);

            expect(recs.length).toBeGreaterThan(0);
            expect(recs[0].strength).toBe('Conditional');
        });

        test('no recommendations for non-significant result', () => {
            const results = createMAResults({ pooledEffect: { estimate: 0.1, ciLower: -0.2, ciUpper: 0.4, pValue: 0.5 } });
            const grade = { finalRating: 'High' };
            const recs = engine.generateRecommendations(results, grade);
            expect(recs).toEqual([]);
        });
    });

    // ================================================================
    // EDGE CASES
    // ================================================================

    describe('Edge cases', () => {
        test('interpretMetaAnalysis with no publication bias data', () => {
            const results = createMAResults({ publicationBias: null });
            const interp = engine.interpretMetaAnalysis(results);
            expect(interp.summary).toBeTruthy();
        });

        test('getRelevantReferences returns standard citations', () => {
            const refs = engine.getRelevantReferences({});
            expect(refs.length).toBeGreaterThanOrEqual(3);
            expect(refs.some(r => r.includes('Cochrane'))).toBe(true);
        });

        test('assessTransitivity returns informational text', () => {
            const text = engine.assessTransitivity({});
            expect(text).toContain('Transitivity');
        });

        test('getRecommendationDirection for SMD > 0 favors intervention', () => {
            const dir = engine.getRecommendationDirection({
                pooledEffect: { estimate: 0.5 },
                effectMeasure: 'SMD'
            });
            expect(dir).toContain('intervention');
        });

        test('getRecommendationDirection for OR < 1 favors intervention', () => {
            const dir = engine.getRecommendationDirection({
                pooledEffect: { estimate: 0.7 },
                effectMeasure: 'OR'
            });
            expect(dir).toContain('intervention');
        });

        test('getTreatmentName falls back when intervention not specified', () => {
            expect(engine.getTreatmentName({})).toBe('the intervention');
        });

        test('rules have expected structure', () => {
            expect(engine.rules.heterogeneity.I2.length).toBe(4);
            expect(engine.rules.effectSize.SMD.length).toBe(3);
            expect(engine.rules.publicationBias.egger).toBe(0.05);
            expect(engine.rules.precision.minEvents).toBe(100);
        });
    });
});
