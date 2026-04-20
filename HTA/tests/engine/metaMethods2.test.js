/**
 * Additional tests for src/engine/metaMethods.js
 * Targeting uncovered lines: 410-992
 * Focus: I2 CI Q-profile, chi-squared quantile, Egger test, Begg test,
 *        trimAndFill (R0/L0/Q estimators), selectionModel
 */

'use strict';

const { KahanSum, StatUtils } = require('../../src/utils/mathUtils');

global.KahanSum = KahanSum;
global.StatUtils = StatUtils;

const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');

const studies = [
    { effect: 0.5, se: 0.2 },
    { effect: 0.3, se: 0.245 },
    { effect: 0.8, se: 0.224 },
    { effect: 0.4, se: 0.173 },
    { effect: 0.6, se: 0.265 }
];

// Larger dataset for publication bias tests
const largeStudies = [
    { effect: 0.5, se: 0.2 },
    { effect: 0.3, se: 0.245 },
    { effect: 0.8, se: 0.224 },
    { effect: 0.4, se: 0.173 },
    { effect: 0.6, se: 0.265 },
    { effect: 0.7, se: 0.19 },
    { effect: 0.35, se: 0.21 },
    { effect: 0.55, se: 0.15 },
    { effect: 0.65, se: 0.30 },
    { effect: 0.45, se: 0.18 }
];

// ---------------------------------------------------------------------------
// I2 CI Q-profile method (lines 410-449)
// ---------------------------------------------------------------------------

describe('I2 CI Q-profile', () => {
    test('calculateI2CI returns Q-profile for small k', () => {
        const ma = new MetaAnalysisMethods({ method: 'DL' });
        const result = ma.calculatePooledEffect(studies);

        const I2CI = result.heterogeneity;
        expect(I2CI.I2_lower).toBeDefined();
        expect(I2CI.I2_upper).toBeDefined();
        expect(I2CI.I2_lower).toBeLessThanOrEqual(I2CI.I2_upper);
    });

    test('chiSquaredQuantile returns positive value for valid inputs', () => {
        const ma = new MetaAnalysisMethods();
        const q = ma.chiSquaredQuantile(0.95, 4);
        expect(q).toBeGreaterThan(0);
        // Known value: chi2(0.95, 4) ≈ 9.488
        expect(q).toBeCloseTo(9.488, 0);
    });

    test('chiSquaredQuantile boundary values', () => {
        const ma = new MetaAnalysisMethods();
        expect(ma.chiSquaredQuantile(0, 5)).toBe(0);
        expect(ma.chiSquaredQuantile(1, 5)).toBe(Infinity);
    });

    test('chiSquaredPDF returns 0 for x <= 0', () => {
        const ma = new MetaAnalysisMethods();
        expect(ma.chiSquaredPDF(0, 5)).toBe(0);
        expect(ma.chiSquaredPDF(-1, 5)).toBe(0);
    });

    test('chiSquaredPDF returns positive for x > 0', () => {
        const ma = new MetaAnalysisMethods();
        expect(ma.chiSquaredPDF(5, 4)).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Egger's test (lines 495-561)
// ---------------------------------------------------------------------------

describe('Egger test', () => {
    test('returns valid result for k >= 3', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.eggerTest(studies);

        expect(result.test).toBe('Egger');
        expect(Number.isFinite(result.intercept)).toBe(true);
        expect(Number.isFinite(result.slope)).toBe(true);
        expect(Number.isFinite(result.se)).toBe(true);
        expect(Number.isFinite(result.t)).toBe(true);
        expect(result.df).toBe(studies.length - 2);
        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
        expect(typeof result.significant).toBe('boolean');
        expect(result.method).toContain('Weighted');
    });

    test('returns error for k < 3', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.eggerTest([{ effect: 0.5, se: 0.1 }, { effect: 0.3, se: 0.2 }]);
        expect(result.error).toBeDefined();
    });

    test('returns error for invalid SE', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.eggerTest([
            { effect: 0.5, se: 0 },
            { effect: 0.3, se: 0.2 },
            { effect: 0.4, se: 0.1 }
        ]);
        expect(result.error).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Begg's test (lines 571-647)
// ---------------------------------------------------------------------------

describe('Begg test', () => {
    test('returns valid result for k >= 3', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.beggTest(studies);

        expect(result.test).toBe('Begg');
        expect(Number.isFinite(result.tau)).toBe(true);
        expect(Number.isFinite(result.z)).toBe(true);
        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
        expect(typeof result.significant).toBe('boolean');
    });

    test('returns error for k < 3', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.beggTest([{ effect: 0.5, se: 0.1 }, { effect: 0.3, se: 0.2 }]);
        expect(result.error).toBeDefined();
    });

    test('uses continuity correction for small samples (n < 10)', () => {
        const ma = new MetaAnalysisMethods();
        const smallStudies = studies.slice(0, 5);
        const result = ma.beggTest(smallStudies);

        expect(result.method).toContain('Continuity');
    });

    test('uses normal approximation for n >= 10', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.beggTest(largeStudies);

        expect(result.method).toContain('Normal');
    });
});

// ---------------------------------------------------------------------------
// Trim and Fill (lines 659-897)
// ---------------------------------------------------------------------------

describe('trimAndFill', () => {
    test('returns valid result with R0 estimator', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.trimAndFill(largeStudies, 'auto', { estimator: 'R0' });

        expect(result.original).toBeDefined();
        expect(result.adjusted).toBeDefined();
        expect(typeof result.nMissing).toBe('number');
        expect(result.nMissing).toBeGreaterThanOrEqual(0);
        expect(result.estimator).toBe('R0');
        expect(result.side).toBeDefined();
    });

    test('returns valid result with L0 estimator', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.trimAndFill(largeStudies, 'left', { estimator: 'L0' });

        expect(result.estimator).toBe('L0');
        expect(result.side).toBe('left');
    });

    test('returns valid result with Q estimator', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.trimAndFill(largeStudies, 'right', { estimator: 'Q' });

        expect(result.estimator).toBe('Q');
        expect(result.side).toBe('right');
    });

    test('returns error for k < 3', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.trimAndFill([{ effect: 0.5, se: 0.1 }]);
        expect(result.error).toBeDefined();
    });

    test('auto side selection uses Egger intercept', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.trimAndFill(largeStudies, 'auto');

        expect(['left', 'right']).toContain(result.side);
    });

    test('adjusted effect is finite', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.trimAndFill(largeStudies);

        expect(Number.isFinite(result.adjusted.effect)).toBe(true);
        if (result.nMissing > 0) {
            expect(result.imputedStudies.length).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------
// Selection model (lines 905-992)
// ---------------------------------------------------------------------------

describe('selectionModel', () => {
    test('returns valid result for k >= 5', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.selectionModel(largeStudies);

        expect(result.unadjusted).toBeDefined();
        expect(result.adjusted).toBeDefined();
        expect(Number.isFinite(result.adjusted.effect)).toBe(true);
        expect(Number.isFinite(result.adjusted.se)).toBe(true);
    });

    test('returns error for k < 5', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.selectionModel(studies.slice(0, 4));
        expect(result.error).toBeDefined();
    });

    test('returns selection weights', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.selectionModel(largeStudies);

        expect(result.selectionWeights).toBeDefined();
        expect(result.selectionWeights.significant).toBe(1.0); // reference
        expect(Number.isFinite(result.selectionWeights.marginal)).toBe(true);
        expect(Number.isFinite(result.selectionWeights.nonsignificant)).toBe(true);
    });

    test('custom cutpoints are respected', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.selectionModel(largeStudies, [0.01, 0.05]);

        expect(result.unadjusted).toBeDefined();
        expect(result.adjusted).toBeDefined();
    });

    test('adjusted CI is computed', () => {
        const ma = new MetaAnalysisMethods();
        const result = ma.selectionModel(largeStudies);

        expect(Number.isFinite(result.adjusted.ci_lower)).toBe(true);
        expect(Number.isFinite(result.adjusted.ci_upper)).toBe(true);
        expect(result.adjusted.ci_lower).toBeLessThan(result.adjusted.ci_upper);
    });
});
