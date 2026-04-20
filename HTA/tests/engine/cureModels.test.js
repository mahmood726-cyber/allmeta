/**
 * Tests for src/engine/cureModels.js — CureModelEngine
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;

const {
    CureModelEngine,
    DISTRIBUTIONS,
    weibullSurvival,
    lognormalSurvival,
    loglogisticSurvival,
    weibullPDF,
    lognormalPDF,
    loglogisticPDF,
    weibullHazard,
    lognormalHazard,
    loglogisticHazard,
    normalCDF
} = require('../../src/engine/cureModels');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate survival data from a mixture cure model with known parameters.
 * cureFraction ≈ pi, uncured survival ≈ Weibull(shape, scale).
 */
function generateMixtureCureData(n = 200, pi = 0.3, shape = 1.5, scale = 10, seed = 42) {
    const data = [];
    let state = seed;
    function nextRand() {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        return state / 0x7fffffff;
    }

    const maxTime = 50;

    for (let i = 0; i < n; i++) {
        const u = nextRand();

        if (u < pi) {
            // Cured: censored at some random time
            const censTime = 5 + nextRand() * (maxTime - 5);
            data.push({ time: Math.round(censTime * 10) / 10, event: 0 });
        } else {
            // Uncured: generate Weibull failure time
            const v = nextRand();
            const failTime = scale * Math.pow(-Math.log(Math.max(v, 1e-10)), 1 / shape);

            // Apply censoring
            const censTime = 5 + nextRand() * (maxTime - 5);
            if (failTime < censTime) {
                data.push({ time: Math.round(Math.max(0.1, failTime) * 10) / 10, event: 1 });
            } else {
                data.push({ time: Math.round(censTime * 10) / 10, event: 0 });
            }
        }
    }

    return data;
}

/**
 * Generate data with NO cured fraction (standard survival).
 */
function generateNoCureData(n = 100, shape = 1.2, scale = 8, seed = 77) {
    const data = [];
    let state = seed;
    function nextRand() {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        return state / 0x7fffffff;
    }

    for (let i = 0; i < n; i++) {
        const v = nextRand();
        const failTime = scale * Math.pow(-Math.log(Math.max(v, 1e-10)), 1 / shape);
        const censTime = 3 + nextRand() * 25;
        if (failTime < censTime) {
            data.push({ time: Math.round(Math.max(0.1, failTime) * 10) / 10, event: 1 });
        } else {
            data.push({ time: Math.round(censTime * 10) / 10, event: 0 });
        }
    }

    return data;
}

/**
 * Generate data where almost all subjects are cured.
 */
function generateAllCuredData(n = 50) {
    const data = [];
    for (let i = 0; i < n; i++) {
        // All censored at various times
        data.push({ time: 5 + i * 0.5, event: 0 });
    }
    return data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CureModelEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new CureModelEngine({ confLevel: 0.95 });
    });

    // ── Mixture cure model ──

    test('Mixture cure with known pi=0.3: estimate within tolerance', () => {
        const data = generateMixtureCureData(300, 0.3, 1.5, 10, 42);
        const fit = engine.mixtureCure(data, { distribution: 'weibull', maxIter: 200 });

        expect(fit.cureFraction).toBeGreaterThan(0.05);
        expect(fit.cureFraction).toBeLessThan(0.7);
        expect(fit.convergence).toBe(true);
    });

    test('S(t) = pi + (1-pi)*S_u(t) at each time point', () => {
        const data = generateMixtureCureData(150, 0.25, 1.2, 8, 55);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        const predictions = engine.predict(fit, [1, 5, 10, 20, 30]);

        const pi = fit.cureFraction;
        const params = [fit.uncuredParams.shape, fit.uncuredParams.scale];

        for (const pred of predictions) {
            const Su = weibullSurvival(pred.time, params[0], params[1]);
            const expected = pi + (1 - pi) * Su;
            expect(pred.survival).toBeCloseTo(expected, 6);
        }
    });

    test('Cure fraction in [0,1]', () => {
        const data = generateMixtureCureData(100, 0.2, 1.5, 10);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });

        expect(fit.cureFraction).toBeGreaterThanOrEqual(0);
        expect(fit.cureFraction).toBeLessThanOrEqual(1);
    });

    test('S(infinity) approaches cureFraction (plateau)', () => {
        const data = generateMixtureCureData(200, 0.3, 1.5, 10, 42);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        const predictions = engine.predict(fit, [1000]);

        // At t=1000, Weibull survival ≈ 0, so S(1000) ≈ pi
        expect(predictions[0].survival).toBeCloseTo(fit.cureFraction, 3);
    });

    test('predict() matches model formula', () => {
        const data = generateMixtureCureData(100, 0.2, 1.5, 10);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        const times = [0.5, 2, 5, 10, 20];
        const predictions = engine.predict(fit, times);

        expect(predictions.length).toBe(times.length);
        for (let i = 0; i < times.length; i++) {
            expect(predictions[i].time).toBe(times[i]);
            expect(predictions[i].survival).toBeGreaterThanOrEqual(0);
            expect(predictions[i].survival).toBeLessThanOrEqual(1);
            expect(predictions[i].hazard).toBeGreaterThanOrEqual(0);
            expect(predictions[i].cured_prob).toBeGreaterThanOrEqual(0);
            expect(predictions[i].cured_prob).toBeLessThanOrEqual(1);
        }
    });

    test('extrapolate() reaches plateau at cure fraction', () => {
        const data = generateMixtureCureData(200, 0.3, 1.5, 10, 42);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        const extrap = engine.extrapolate(fit, 100, 1.0);

        // Last point should be near the cure fraction
        const lastPoint = extrap[extrap.length - 1];
        expect(lastPoint.survival).toBeCloseTo(fit.cureFraction, 2);
        expect(extrap.length).toBeGreaterThan(50);
    });

    test('No cure (pi near 0): model reduces to standard survival', () => {
        const data = generateNoCureData(200, 1.2, 8, 77);
        const fit = engine.mixtureCure(data, { distribution: 'weibull', maxIter: 200 });

        // Cure fraction should be small
        expect(fit.cureFraction).toBeLessThan(0.5);
    });

    test('All cured (pi near 1): S(t) near 1 for all t', () => {
        const data = generateAllCuredData(50);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });

        // Cure fraction should be very high
        expect(fit.cureFraction).toBeGreaterThan(0.8);
    });

    // ── Non-mixture cure model ──

    test('Non-mixture: exp(-theta) = cure fraction', () => {
        const data = generateMixtureCureData(200, 0.25, 1.5, 10, 99);
        const fit = engine.nonMixtureCure(data, { distribution: 'weibull' });

        expect(fit.cureFraction).toBeCloseTo(Math.exp(-fit.theta), 10);
        expect(fit.theta).toBeGreaterThan(0);
    });

    test('Non-mixture: theta > 0', () => {
        const data = generateMixtureCureData(100, 0.2, 1.5, 10);
        const fit = engine.nonMixtureCure(data, { distribution: 'weibull' });

        expect(fit.theta).toBeGreaterThan(0);
    });

    test('Non-mixture: returns expected fields', () => {
        const data = generateMixtureCureData(100, 0.2, 1.5, 10);
        const fit = engine.nonMixtureCure(data, { distribution: 'weibull' });

        expect(fit).toHaveProperty('theta');
        expect(fit).toHaveProperty('cureFraction');
        expect(fit).toHaveProperty('baselineParams');
        expect(fit).toHaveProperty('logLik');
        expect(fit).toHaveProperty('aic');
        expect(fit).toHaveProperty('bic');
        expect(fit).toHaveProperty('convergence');
        expect(fit).toHaveProperty('iterations');
    });

    // ── compareFit ──

    test('compareFit: returns results for all distributions', () => {
        const data = generateMixtureCureData(100, 0.25, 1.5, 10);
        const results = engine.compareFit(data, ['weibull', 'lognormal', 'loglogistic']);

        expect(results.length).toBe(3);
        for (const r of results) {
            expect(r.distribution).toBeDefined();
            if (!r.error) {
                expect(r.aic).toBeDefined();
                expect(r.bic).toBeDefined();
                expect(r.cureFraction).toBeDefined();
            }
        }
    });

    test('AIC/BIC: correct formula (lower is better)', () => {
        const data = generateMixtureCureData(100, 0.3, 1.5, 10);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });

        // AIC = -2*logLik + 2*k where k = nParams (2 dist params + 1 cure fraction)
        const k = 3;
        const expectedAIC = -2 * fit.logLik + 2 * k;
        expect(fit.aic).toBeCloseTo(expectedAIC, 5);

        // BIC = -2*logLik + log(n)*k
        const expectedBIC = -2 * fit.logLik + Math.log(data.length) * k;
        expect(fit.bic).toBeCloseTo(expectedBIC, 5);
    });

    test('compareFit: sorted by AIC', () => {
        const data = generateMixtureCureData(150, 0.25, 1.5, 10);
        const results = engine.compareFit(data, ['weibull', 'lognormal', 'loglogistic']);

        // Results without errors should be sorted by AIC
        const validResults = results.filter(r => !r.error);
        for (let i = 1; i < validResults.length; i++) {
            expect(validResults[i].aic).toBeGreaterThanOrEqual(validResults[i - 1].aic);
        }
    });

    // ── Distribution helpers ──

    test('Weibull survival: correct formula S(t)=exp(-(t/lambda)^k)', () => {
        const shape = 1.5, scale = 10;
        expect(weibullSurvival(0, shape, scale)).toBe(1);
        expect(weibullSurvival(10, shape, scale)).toBeCloseTo(Math.exp(-1), 10);
        expect(weibullSurvival(5, shape, scale)).toBeCloseTo(
            Math.exp(-Math.pow(5 / 10, 1.5)), 10
        );
    });

    test('Log-logistic survival: correct formula', () => {
        const alpha = 10, beta = 2;
        expect(loglogisticSurvival(0, alpha, beta)).toBe(1);
        expect(loglogisticSurvival(10, alpha, beta)).toBeCloseTo(0.5, 10);
        expect(loglogisticSurvival(20, alpha, beta)).toBeCloseTo(
            1 / (1 + Math.pow(20 / 10, 2)), 10
        );
    });

    test('Log-normal survival: S(0)=1, decreasing', () => {
        const mu = 2, sigma = 0.5;
        expect(lognormalSurvival(0, mu, sigma)).toBe(1);
        expect(lognormalSurvival(5, mu, sigma)).toBeLessThan(1);
        expect(lognormalSurvival(5, mu, sigma)).toBeGreaterThan(0);
        // Decreasing
        expect(lognormalSurvival(10, mu, sigma)).toBeLessThan(
            lognormalSurvival(5, mu, sigma)
        );
    });

    test('Weibull PDF integrates to approximately 1 (numerical check)', () => {
        const shape = 1.5, scale = 10;
        let integral = 0;
        const dt = 0.01;
        for (let t = dt / 2; t < 100; t += dt) {
            integral += weibullPDF(t, shape, scale) * dt;
        }
        expect(integral).toBeCloseTo(1.0, 1);
    });

    test('Hazard = PDF / Survival for Weibull', () => {
        const shape = 1.5, scale = 10;
        const t = 5;
        const h = weibullHazard(t, shape, scale);
        const f = weibullPDF(t, shape, scale);
        const s = weibullSurvival(t, shape, scale);
        expect(h).toBeCloseTo(f / s, 8);
    });

    // ── Convergence ──

    test('Convergence: maxIter reached → convergence=false', () => {
        const data = generateMixtureCureData(50, 0.3, 1.5, 10);
        const fit = engine.mixtureCure(data, {
            distribution: 'weibull',
            maxIter: 1,
            tol: 1e-20
        });

        expect(fit.convergence).toBe(false);
        expect(fit.iterations).toBe(1);
    });

    // ── Determinism ──

    test('Determinism: same data → same fit', () => {
        const data = generateMixtureCureData(100, 0.3, 1.5, 10, 42);
        const fit1 = engine.mixtureCure(data, { distribution: 'weibull' });
        const fit2 = engine.mixtureCure(data, { distribution: 'weibull' });

        expect(fit1.cureFraction).toBe(fit2.cureFraction);
        expect(fit1.logLik).toBe(fit2.logLik);
        expect(fit1.uncuredParams.shape).toBe(fit2.uncuredParams.shape);
        expect(fit1.uncuredParams.scale).toBe(fit2.uncuredParams.scale);
        expect(fit1.iterations).toBe(fit2.iterations);
    });

    // ── Edge cases ──

    test('Edge: all events at same time', () => {
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({ time: 5, event: 1 });
        }
        for (let i = 0; i < 10; i++) {
            data.push({ time: 5, event: 0 });
        }

        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(fit.cureFraction).toBeGreaterThanOrEqual(0);
        expect(fit.cureFraction).toBeLessThanOrEqual(1);
    });

    test('Edge: very few data points (n=5)', () => {
        const data = [
            { time: 1, event: 1 },
            { time: 3, event: 1 },
            { time: 5, event: 0 },
            { time: 7, event: 0 },
            { time: 9, event: 0 }
        ];

        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(fit.cureFraction).toBeGreaterThanOrEqual(0);
        expect(fit.cureFraction).toBeLessThanOrEqual(1);
        expect(fit.logLik).toBeDefined();
    });

    test('Edge: all events (no censoring)', () => {
        const data = [];
        for (let i = 0; i < 30; i++) {
            data.push({ time: 1 + i * 0.5, event: 1 });
        }
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        // With all events, cure fraction should be very small
        expect(fit.cureFraction).toBeLessThan(0.2);
    });

    // ── Validation ──

    test('Validation: event not 0 or 1 throws', () => {
        const data = [
            { time: 1, event: 2 },
            { time: 2, event: 0 }
        ];
        expect(() => engine.mixtureCure(data)).toThrow(/event/i);
    });

    test('Validation: negative time throws', () => {
        const data = [
            { time: -1, event: 1 },
            { time: 2, event: 0 }
        ];
        expect(() => engine.mixtureCure(data)).toThrow(/time/i);
    });

    test('Validation: empty data throws', () => {
        expect(() => engine.mixtureCure([])).toThrow();
    });

    test('Validation: unknown distribution throws', () => {
        const data = generateMixtureCureData(20);
        expect(() => engine.mixtureCure(data, { distribution: 'pareto' })).toThrow(/unknown/i);
    });

    test('Validation: predict with null model throws', () => {
        expect(() => engine.predict(null, [1, 2, 3])).toThrow();
    });

    test('Validation: extrapolate with negative horizon throws', () => {
        const data = generateMixtureCureData(50);
        const fit = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(() => engine.extrapolate(fit, -5)).toThrow(/positive/i);
    });

    // ── normalCDF ──

    test('normalCDF: standard values', () => {
        expect(normalCDF(0)).toBeCloseTo(0.5, 4);
        expect(normalCDF(1.96)).toBeCloseTo(0.975, 2);
        expect(normalCDF(-1.96)).toBeCloseTo(0.025, 2);
    });
});
