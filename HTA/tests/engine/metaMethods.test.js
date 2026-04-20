/**
 * Tests for src/engine/metaMethods.js — MetaAnalysisMethods
 */

'use strict';

const { KahanSum, StatUtils } = require('../../src/utils/mathUtils');

global.KahanSum = KahanSum;
global.StatUtils = StatUtils;

const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');

// Sample data: 5 studies with log-OR-like effects and variances
const studies = [
    { effect: 0.5, se: 0.2 },
    { effect: 0.3, se: 0.245 },
    { effect: 0.8, se: 0.224 },
    { effect: 0.4, se: 0.173 },
    { effect: 0.6, se: 0.265 }
];

// Homogeneous data: all studies have the same effect
const homogeneousStudies = [
    { effect: 0.5, se: 0.2 },
    { effect: 0.5, se: 0.15 },
    { effect: 0.5, se: 0.25 },
    { effect: 0.5, se: 0.18 },
    { effect: 0.5, se: 0.22 }
];

// Studies with subgroup labels and a continuous moderator
const studiesWithGroups = [
    { effect: 0.5, se: 0.2, group: 'A', dose: 10 },
    { effect: 0.3, se: 0.245, group: 'A', dose: 20 },
    { effect: 0.8, se: 0.224, group: 'B', dose: 30 },
    { effect: 0.4, se: 0.173, group: 'B', dose: 40 },
    { effect: 0.6, se: 0.265, group: 'A', dose: 50 },
    { effect: 0.9, se: 0.19, group: 'B', dose: 60 },
    { effect: 0.35, se: 0.21, group: 'A', dose: 15 }
];

describe('MetaAnalysisMethods', () => {
    // ----------------------------------------------------------------
    // 1. Constructor
    // ----------------------------------------------------------------
    describe('Constructor', () => {
        test('creates with default options', () => {
            const ma = new MetaAnalysisMethods();
            expect(ma.options.method).toBe('REML');
            expect(ma.options.alpha).toBe(0.05);
            expect(ma.options.ciLevel).toBe(0.95);
            expect(ma.options.predictionInterval).toBe(true);
            expect(ma.options.useHKSJ).toBe(false);
            expect(ma.options.autoHKSJ).toBe(true);
        });

        test('accepts custom options', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL', alpha: 0.10 });
            expect(ma.options.method).toBe('DL');
            expect(ma.options.alpha).toBe(0.10);
            // defaults still present
            expect(ma.options.ciLevel).toBe(0.95);
        });
    });

    // ----------------------------------------------------------------
    // 2. Fixed-effect model
    // ----------------------------------------------------------------
    describe('Fixed-effect model', () => {
        test('pooled effect is between min and max study effect', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            const effects = studies.map(s => s.effect);
            expect(result.fixed.effect).toBeGreaterThanOrEqual(Math.min(...effects));
            expect(result.fixed.effect).toBeLessThanOrEqual(Math.max(...effects));
        });

        test('fixed-effect SE is positive and less than any individual SE', () => {
            const ma = new MetaAnalysisMethods();
            const result = ma.calculatePooledEffect(studies);

            expect(result.fixed.se).toBeGreaterThan(0);
            for (const s of studies) {
                expect(result.fixed.se).toBeLessThan(s.se);
            }
        });

        test('fixed weights sum to 100%', () => {
            const ma = new MetaAnalysisMethods();
            const result = ma.calculatePooledEffect(studies);

            const weightSum = result.weights.fixed.reduce((a, b) => a + b, 0);
            expect(weightSum).toBeCloseTo(100, 5);
        });

        test('fixed-effect CI contains the point estimate', () => {
            const ma = new MetaAnalysisMethods();
            const result = ma.calculatePooledEffect(studies);

            expect(result.fixed.ci_lower).toBeLessThan(result.fixed.effect);
            expect(result.fixed.ci_upper).toBeGreaterThan(result.fixed.effect);
        });
    });

    // ----------------------------------------------------------------
    // 3. Random-effects DL
    // ----------------------------------------------------------------
    describe('Random-effects DL', () => {
        test('tau-squared is non-negative', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.tauSquared).toBeGreaterThanOrEqual(0);
            expect(result.heterogeneity.tau).toBeGreaterThanOrEqual(0);
        });

        test('random-effects pooled estimate is between min and max study effects', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            const effects = studies.map(s => s.effect);
            expect(result.random.effect).toBeGreaterThanOrEqual(Math.min(...effects));
            expect(result.random.effect).toBeLessThanOrEqual(Math.max(...effects));
        });

        test('random weights sum to 100%', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            const weightSum = result.weights.random.reduce((a, b) => a + b, 0);
            expect(weightSum).toBeCloseTo(100, 5);
        });

        test('DL tau-squared is zero for homogeneous data', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(homogeneousStudies);

            expect(result.heterogeneity.tauSquared).toBeCloseTo(0, 6);
        });
    });

    // ----------------------------------------------------------------
    // 4. Random-effects REML
    // ----------------------------------------------------------------
    describe('Random-effects REML', () => {
        test('converges to a finite estimate', () => {
            const ma = new MetaAnalysisMethods({ method: 'REML' });
            const result = ma.calculatePooledEffect(studies);

            expect(Number.isFinite(result.random.effect)).toBe(true);
            expect(Number.isFinite(result.heterogeneity.tauSquared)).toBe(true);
        });

        test('REML tau-squared is non-negative', () => {
            const ma = new MetaAnalysisMethods({ method: 'REML' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.tauSquared).toBeGreaterThanOrEqual(0);
        });

        test('REML random-effects estimate is finite with valid CI', () => {
            const ma = new MetaAnalysisMethods({ method: 'REML' });
            const result = ma.calculatePooledEffect(studies);

            expect(Number.isFinite(result.random.se)).toBe(true);
            expect(result.random.ci_lower).toBeLessThan(result.random.ci_upper);
        });
    });

    // ----------------------------------------------------------------
    // 5. Heterogeneity statistics
    // ----------------------------------------------------------------
    describe('Heterogeneity statistics', () => {
        test('I-squared is between 0 and 100', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.I2).toBeGreaterThanOrEqual(0);
            expect(result.heterogeneity.I2).toBeLessThanOrEqual(100);
        });

        test('Q statistic is positive', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.Q).toBeGreaterThan(0);
        });

        test('H is positive and equals sqrt(H2)', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.H).toBeGreaterThan(0);
            expect(result.heterogeneity.H).toBeCloseTo(
                Math.sqrt(result.heterogeneity.H2), 10
            );
        });

        test('H-squared equals Q / df', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            const expectedH2 = result.heterogeneity.Q / result.heterogeneity.df;
            expect(result.heterogeneity.H2).toBeCloseTo(expectedH2, 10);
        });

        test('degrees of freedom equals k - 1', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.df).toBe(studies.length - 1);
        });

        test('Q p-value is between 0 and 1', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.pValueQ).toBeGreaterThanOrEqual(0);
            expect(result.heterogeneity.pValueQ).toBeLessThanOrEqual(1);
        });

        test('I-squared CI has lower <= upper', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(studies);

            expect(result.heterogeneity.I2_lower).toBeLessThanOrEqual(result.heterogeneity.I2_upper);
        });

        test('I-squared is approximately 0 for homogeneous studies', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(homogeneousStudies);

            expect(result.heterogeneity.I2).toBeCloseTo(0, 1);
        });
    });

    // ----------------------------------------------------------------
    // 6. Prediction interval
    // ----------------------------------------------------------------
    describe('Prediction interval', () => {
        test('prediction interval is wider than confidence interval', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL', predictionInterval: true });
            const result = ma.calculatePooledEffect(studies);

            const pi = result.heterogeneity.predictionInterval;
            expect(pi).not.toBeNull();

            const ciWidth = result.random.ci_upper - result.random.ci_lower;
            const piWidth = pi.upper - pi.lower;
            expect(piWidth).toBeGreaterThan(ciWidth);
        });

        test('prediction interval is centered near the pooled estimate', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL', predictionInterval: true });
            const result = ma.calculatePooledEffect(studies);

            const pi = result.heterogeneity.predictionInterval;
            const midpoint = (pi.lower + pi.upper) / 2;
            expect(midpoint).toBeCloseTo(result.random.effect, 5);
        });

        test('prediction interval is null for k <= 2', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL', predictionInterval: true });
            const result = ma.calculatePooledEffect(studies.slice(0, 2));

            expect(result.heterogeneity.predictionInterval).toBeNull();
        });
    });

    // ----------------------------------------------------------------
    // 7. Subgroup analysis
    // ----------------------------------------------------------------
    describe('Subgroup analysis', () => {
        test('runs without error and returns group results', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.subgroupAnalysis(studiesWithGroups, 'group');

            expect(result.error).toBeUndefined();
            expect(result.subgroups).toBeDefined();
            expect(result.subgroups['A']).toBeDefined();
            expect(result.subgroups['B']).toBeDefined();
        });

        test('each subgroup has valid effect estimates', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.subgroupAnalysis(studiesWithGroups, 'group');

            for (const groupKey of ['A', 'B']) {
                const g = result.subgroups[groupKey];
                expect(Number.isFinite(g.effect)).toBe(true);
                expect(Number.isFinite(g.se)).toBe(true);
                expect(g.ci_lower).toBeLessThan(g.ci_upper);
                expect(g.nStudies).toBeGreaterThanOrEqual(1);
            }
        });

        test('between-group Q statistic and p-value are valid', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.subgroupAnalysis(studiesWithGroups, 'group');

            const between = result.betweenGroupHeterogeneity;
            expect(between.Q).toBeGreaterThanOrEqual(0);
            expect(between.df).toBe(1); // 2 groups - 1
            expect(between.pValue).toBeGreaterThanOrEqual(0);
            expect(between.pValue).toBeLessThanOrEqual(1);
        });

        test('returns error for fewer than 2 subgroups', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const singleGroup = studies.map(s => ({ ...s, group: 'X' }));
            const result = ma.subgroupAnalysis(singleGroup, 'group');

            expect(result.error).toBeDefined();
        });
    });

    // ----------------------------------------------------------------
    // 8. Meta-regression
    // ----------------------------------------------------------------
    describe('Meta-regression', () => {
        test('returns coefficient with CI for a continuous moderator', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.metaRegression(studiesWithGroups, ['dose']);

            expect(result.error).toBeUndefined();
            expect(result.coefficients).toBeDefined();
            expect(result.coefficients.length).toBe(2); // intercept + dose

            const doseCoeff = result.coefficients[1];
            expect(doseCoeff.name).toBe('dose');
            expect(Number.isFinite(doseCoeff.estimate)).toBe(true);
            expect(Number.isFinite(doseCoeff.se)).toBe(true);
            expect(doseCoeff.ci_lower).toBeLessThan(doseCoeff.ci_upper);
        });

        test('model fit statistics are valid', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.metaRegression(studiesWithGroups, ['dose']);

            expect(result.modelFit).toBeDefined();
            expect(result.modelFit.QModel).toBeGreaterThanOrEqual(0);
            expect(result.modelFit.R2).toBeGreaterThanOrEqual(0);
            expect(result.modelFit.R2).toBeLessThanOrEqual(100);
            expect(result.modelFit.dfModel).toBe(1);
            expect(result.modelFit.dfResidual).toBe(studiesWithGroups.length - 2);
        });

        test('fitted values and residuals have correct length', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.metaRegression(studiesWithGroups, ['dose']);

            expect(result.fitted).toHaveLength(studiesWithGroups.length);
            expect(result.residuals).toHaveLength(studiesWithGroups.length);
        });

        test('returns error when too few studies for the moderators', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            // 2 studies, 1 moderator: need p+2 = 3
            const result = ma.metaRegression(studies.slice(0, 2), ['dose']);

            expect(result.error).toBeDefined();
        });
    });

    // ----------------------------------------------------------------
    // 9. Influence diagnostics (leave-one-out)
    // ----------------------------------------------------------------
    describe('Influence diagnostics', () => {
        test('leave-one-out returns k results for k studies', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.leaveOneOut(studies);

            expect(result.error).toBeUndefined();
            expect(result.results).toHaveLength(studies.length);
        });

        test('each leave-one-out result has valid fields', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.leaveOneOut(studies);

            for (const r of result.results) {
                expect(Number.isFinite(r.effect)).toBe(true);
                expect(Number.isFinite(r.se)).toBe(true);
                expect(r.ci_lower).toBeLessThan(r.ci_upper);
                expect(Number.isFinite(r.I2)).toBe(true);
                expect(Number.isFinite(r.change)).toBe(true);
            }
        });

        test('fullEffect is reported and range brackets it', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.leaveOneOut(studies);

            expect(Number.isFinite(result.fullEffect)).toBe(true);
            expect(result.range.min).toBeLessThanOrEqual(result.fullEffect);
            expect(result.range.max).toBeGreaterThanOrEqual(result.fullEffect);
        });

        test('influenceDiagnostics returns Cook D and hat values for each study', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            // Need at least 4 studies for influenceDiagnostics
            const result = ma.influenceDiagnostics(studies);

            expect(result.error).toBeUndefined();
            expect(result.diagnostics).toHaveLength(studies.length);

            for (const d of result.diagnostics) {
                expect(Number.isFinite(d.cooksD)).toBe(true);
                expect(d.cooksD).toBeGreaterThanOrEqual(0);
                expect(Number.isFinite(d.hatValue)).toBe(true);
                expect(d.hatValue).toBeGreaterThan(0);
                expect(d.hatValue).toBeLessThan(1);
                expect(Number.isFinite(d.standardizedResidual)).toBe(true);
                expect(Number.isFinite(d.dfbetas)).toBe(true);
                expect(Number.isFinite(d.dffits)).toBe(true);
                expect(Number.isFinite(d.covRatio)).toBe(true);
                expect(typeof d.isOutlier).toBe('boolean');
                expect(typeof d.isInfluential).toBe('boolean');
            }
        });

        test('influenceDiagnostics summary counts are consistent', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.influenceDiagnostics(studies);

            const outlierCount = result.diagnostics.filter(d => d.isOutlier).length;
            const influentialCount = result.diagnostics.filter(d => d.isInfluential).length;
            expect(result.summary.nOutliers).toBe(outlierCount);
            expect(result.summary.nInfluential).toBe(influentialCount);
        });
    });

    // ----------------------------------------------------------------
    // 10. Edge cases
    // ----------------------------------------------------------------
    describe('Edge cases', () => {
        test('single study (k=1) returns valid fixed and random effect', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL', predictionInterval: true });
            const result = ma.calculatePooledEffect([{ effect: 0.5, se: 0.2 }]);

            expect(result.nStudies).toBe(1);
            expect(result.fixed.effect).toBeCloseTo(0.5, 10);
            expect(result.random.effect).toBeCloseTo(0.5, 10);
            // No heterogeneity with one study
            expect(result.heterogeneity.Q).toBeCloseTo(0, 10);
            expect(result.heterogeneity.I2).toBe(0);
            // Prediction interval requires k > 2
            expect(result.heterogeneity.predictionInterval).toBeNull();
        });

        test('two studies (k=2) returns valid pooled effect', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL', predictionInterval: true });
            const twoStudies = [
                { effect: 0.3, se: 0.2 },
                { effect: 0.7, se: 0.2 }
            ];
            const result = ma.calculatePooledEffect(twoStudies);

            expect(result.nStudies).toBe(2);
            expect(Number.isFinite(result.random.effect)).toBe(true);
            expect(result.random.effect).toBeGreaterThanOrEqual(0.3);
            expect(result.random.effect).toBeLessThanOrEqual(0.7);
            expect(result.heterogeneity.df).toBe(1);
        });

        test('homogeneous data yields tau-squared approximately 0', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.calculatePooledEffect(homogeneousStudies);

            expect(result.heterogeneity.tauSquared).toBeCloseTo(0, 6);
            expect(result.random.effect).toBeCloseTo(0.5, 5);
        });

        test('empty array returns null', () => {
            const ma = new MetaAnalysisMethods();
            const result = ma.calculatePooledEffect([]);
            expect(result).toBeNull();
        });

        test('throws on invalid input (non-array)', () => {
            const ma = new MetaAnalysisMethods();
            expect(() => ma.calculatePooledEffect('invalid')).toThrow();
        });

        test('throws on study with missing effect', () => {
            const ma = new MetaAnalysisMethods();
            expect(() => ma.calculatePooledEffect([{ se: 0.2 }])).toThrow(/effect/);
        });

        test('throws on study with zero SE', () => {
            const ma = new MetaAnalysisMethods();
            expect(() => ma.calculatePooledEffect([{ effect: 0.5, se: 0 }])).toThrow(/se/);
        });

        test('Paule-Mandel estimator returns valid result', () => {
            const ma = new MetaAnalysisMethods({ method: 'PM' });
            const result = ma.calculatePooledEffect(studies);

            expect(Number.isFinite(result.random.effect)).toBe(true);
            expect(result.heterogeneity.tauSquared).toBeGreaterThanOrEqual(0);
        });

        test('Empirical Bayes estimator returns valid result', () => {
            const ma = new MetaAnalysisMethods({ method: 'EB' });
            const result = ma.calculatePooledEffect(studies);

            expect(Number.isFinite(result.random.effect)).toBe(true);
            expect(result.heterogeneity.tauSquared).toBeGreaterThanOrEqual(0);
        });

        test('leave-one-out returns error for fewer than 3 studies', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.leaveOneOut(studies.slice(0, 2));
            expect(result.error).toBeDefined();
        });

        test('influenceDiagnostics returns error for fewer than 4 studies', () => {
            const ma = new MetaAnalysisMethods({ method: 'DL' });
            const result = ma.influenceDiagnostics(studies.slice(0, 3));
            expect(result.error).toBeDefined();
        });
    });
});
