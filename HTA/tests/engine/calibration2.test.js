/**
 * Additional tests for src/engine/calibration.js
 * Targeting uncovered lines: 596-794
 * Focus: evaluateLogPrior, randomNormal, gridSearch,
 *        calculateGoodnessOfFit, chiSquaredCDF, regularizedGammaP/Q, logGamma
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { StatUtils } = require('../../src/utils/mathUtils');
const { ExpressionParser } = require('../../src/parser/expression');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.PCG32 = PCG32;
global.StatUtils = StatUtils;
global.ExpressionParser = ExpressionParser;

const { MarkovEngine } = require('../../src/engine/markov');
global.MarkovEngine = MarkovEngine;

const { CalibrationEngine } = require('../../src/engine/calibration');

// ---------------------------------------------------------------------------
// evaluateLogPrior (lines 596-616)
// ---------------------------------------------------------------------------

describe('CalibrationEngine evaluateLogPrior', () => {
    let engine;

    beforeEach(() => {
        engine = new CalibrationEngine({ seed: 42 });
    });

    test('normal prior returns correct log-prior', () => {
        const lp = engine.evaluateLogPrior(5, { type: 'normal', mean: 5, sd: 1 });
        // At mean: -0.5 * ((5-5)/1)^2 = 0
        expect(lp).toBeCloseTo(0, 10);
    });

    test('normal prior penalizes values away from mean', () => {
        const lp = engine.evaluateLogPrior(8, { type: 'normal', mean: 5, sd: 1 });
        expect(lp).toBeLessThan(0);
    });

    test('beta prior returns -Infinity at boundaries', () => {
        expect(engine.evaluateLogPrior(0, { type: 'beta', alpha: 2, beta: 5 })).toBe(-Infinity);
        expect(engine.evaluateLogPrior(1, { type: 'beta', alpha: 2, beta: 5 })).toBe(-Infinity);
    });

    test('beta prior returns finite value for interior', () => {
        const lp = engine.evaluateLogPrior(0.5, { type: 'beta', alpha: 2, beta: 5 });
        expect(Number.isFinite(lp)).toBe(true);
    });

    test('gamma prior returns -Infinity for non-positive', () => {
        expect(engine.evaluateLogPrior(0, { type: 'gamma', shape: 2, rate: 1 })).toBe(-Infinity);
        expect(engine.evaluateLogPrior(-1, { type: 'gamma', shape: 2, rate: 1 })).toBe(-Infinity);
    });

    test('gamma prior returns finite value for positive input', () => {
        const lp = engine.evaluateLogPrior(2, { type: 'gamma', shape: 2, rate: 1 });
        expect(Number.isFinite(lp)).toBe(true);
    });

    test('gamma prior with alpha/scale parameters', () => {
        const lp = engine.evaluateLogPrior(2, { type: 'gamma', alpha: 2, scale: 1 });
        expect(Number.isFinite(lp)).toBe(true);
    });

    test('unknown prior type returns 0 (uniform)', () => {
        expect(engine.evaluateLogPrior(5, { type: 'unknown' })).toBe(0);
        expect(engine.evaluateLogPrior(5, {})).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// randomNormal (lines 621-626)
// ---------------------------------------------------------------------------

describe('CalibrationEngine randomNormal', () => {
    test('produces values around the mean', () => {
        const engine = new CalibrationEngine({ seed: 42 });
        // Ensure rng.random exists
        if (engine.rng && !engine.rng.random) {
            engine.rng.random = engine.rng.nextDouble.bind(engine.rng);
        }

        const values = [];
        for (let i = 0; i < 200; i++) {
            values.push(engine.randomNormal(10, 2));
        }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        expect(mean).toBeGreaterThan(8);
        expect(mean).toBeLessThan(12);
    });
});

// ---------------------------------------------------------------------------
// gridSearch (lines 631-685)
// ---------------------------------------------------------------------------

describe('CalibrationEngine gridSearch', () => {
    test('finds optimal parameters on simple problem', async () => {
        const engine = new CalibrationEngine({ seed: 42 });

        const paramInfo = [
            { id: 'x', lower: -2, upper: 2 },
            { id: 'y', lower: -2, upper: 2 }
        ];

        const targets = [{ observed: 0, se: 1, id: 't0', type: 'custom', time: 0, weight: 1 }];

        // Override methods
        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            return -(paramValues.x ** 2 + paramValues.y ** 2);
        };
        engine.calculateGoodnessOfFit = () => ({ rSquared: 1, rmse: 0 });
        engine.getTargetComparison = () => [];
        engine.arrayToParamValues = (arr, info) => {
            const result = {};
            info.forEach((p, i) => result[p.id] = arr[i]);
            return result;
        };

        const result = await engine.gridSearch({}, paramInfo, targets, { gridPoints: 5 });

        expect(result.method).toBe('grid');
        expect(result.converged).toBe(true);
        expect(result.parameters.x).toBeCloseTo(0, 0);
        expect(result.parameters.y).toBeCloseTo(0, 0);
        expect(result.totalEvaluations).toBe(25); // 5^2
    });
});

// ---------------------------------------------------------------------------
// chiSquaredCDF and gamma functions (lines 728-795)
// ---------------------------------------------------------------------------

describe('CalibrationEngine chiSquaredCDF', () => {
    let engine;

    beforeEach(() => {
        engine = new CalibrationEngine({ seed: 42 });
    });

    test('returns 0 for x <= 0', () => {
        expect(engine.chiSquaredCDF(0, 5)).toBe(0);
        expect(engine.chiSquaredCDF(-1, 5)).toBe(0);
    });

    test('returns value between 0 and 1 for positive x', () => {
        const val = engine.chiSquaredCDF(5, 4);
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThan(1);
    });

    test('increases monotonically with x', () => {
        let prev = 0;
        for (let x = 1; x <= 20; x += 2) {
            const val = engine.chiSquaredCDF(x, 5);
            expect(val).toBeGreaterThanOrEqual(prev - 1e-10);
            prev = val;
        }
    });
});

describe('CalibrationEngine regularizedGammaP', () => {
    let engine;

    beforeEach(() => {
        engine = new CalibrationEngine({ seed: 42 });
    });

    test('returns 0 for x=0 or a<=0', () => {
        expect(engine.regularizedGammaP(2, 0)).toBe(0);
        expect(engine.regularizedGammaP(0, 5)).toBe(0);
        expect(engine.regularizedGammaP(-1, 5)).toBe(0);
    });

    test('series branch (x < a+1) returns value in (0,1)', () => {
        const val = engine.regularizedGammaP(5, 3);
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThan(1);
    });

    test('continued fraction branch (x >= a+1) returns value in (0,1)', () => {
        const val = engine.regularizedGammaP(2, 10);
        expect(val).toBeGreaterThan(0.5);
        expect(val).toBeLessThanOrEqual(1);
    });
});

describe('CalibrationEngine logGamma', () => {
    let engine;

    beforeEach(() => {
        engine = new CalibrationEngine({ seed: 42 });
    });

    test('logGamma(1) = 0', () => {
        expect(engine.logGamma(1)).toBeCloseTo(0, 5);
    });

    test('logGamma(2) = 0', () => {
        expect(engine.logGamma(2)).toBeCloseTo(0, 5);
    });

    test('logGamma(0.5) = log(sqrt(pi))', () => {
        expect(engine.logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 3);
    });

    test('logGamma(5) = log(24)', () => {
        expect(engine.logGamma(5)).toBeCloseTo(Math.log(24), 3);
    });
});
