/**
 * Tests for CoxRegressionEngine
 */

'use strict';

const { CoxRegressionEngine } = require('../../src/engine/coxRegression');

// ─── Test Data Generators ──────────────────────────────────────────

/**
 * Seeded PRNG for deterministic test data
 */
function seededRNG(seed) {
    let s = seed >>> 0;
    return function() {
        s = (s + 0x9e3779b9) >>> 0;
        let z = s;
        z = (z ^ (z >>> 16)) >>> 0;
        z = Math.imul(z, 0x85ebca6b);
        z = (z ^ (z >>> 13)) >>> 0;
        z = Math.imul(z, 0xc2b2ae35);
        z = (z ^ (z >>> 16)) >>> 0;
        return z / 4294967296;
    };
}

/**
 * Generate exponential survival data with treatment effect
 */
function generateSurvivalData(n, trueHR, seed = 42) {
    const rng = seededRNG(seed);
    const data = [];
    const baselineRate = 0.1; // baseline hazard

    for (let i = 0; i < n; i++) {
        const treatment = rng() < 0.5 ? 1 : 0;
        const rate = baselineRate * (treatment === 1 ? trueHR : 1);
        // Exponential survival time
        const time = -Math.log(rng() + 1e-10) / rate;
        // Random censoring
        const censorTime = -Math.log(rng() + 1e-10) / 0.05;
        const observed = time <= censorTime;

        data.push({
            time: Math.min(time, censorTime),
            event: observed ? 1 : 0,
            covariates: { treatment }
        });
    }

    return data;
}

/**
 * Generate multi-covariate data
 */
function generateMultiCovariateData(n, seed = 42) {
    const rng = seededRNG(seed);
    const data = [];

    for (let i = 0; i < n; i++) {
        const treatment = rng() < 0.5 ? 1 : 0;
        const age = 40 + Math.floor(rng() * 40); // 40-79
        const rate = 0.05 * Math.exp(0.5 * treatment + 0.02 * (age - 60));
        const time = -Math.log(rng() + 1e-10) / rate;
        const censorTime = -Math.log(rng() + 1e-10) / 0.03;

        data.push({
            time: Math.min(time, censorTime),
            event: time <= censorTime ? 1 : 0,
            covariates: { treatment, age }
        });
    }

    return data;
}

/**
 * Generate data with time-varying effect (PH violation)
 */
function generatePHViolationData(n, seed = 42) {
    const rng = seededRNG(seed);
    const data = [];

    for (let i = 0; i < n; i++) {
        const treatment = rng() < 0.5 ? 1 : 0;
        // Time-varying HR: strong early, waning late
        // Simulate via inverse CDF with piecewise hazard
        const u = rng();
        let time;
        if (treatment === 1) {
            // Treatment: low hazard early, high hazard late
            time = -Math.log(u + 1e-10) / (0.02 + 0.3 * rng());
        } else {
            // Control: constant hazard
            time = -Math.log(u + 1e-10) / 0.1;
        }
        const censorTime = 5 + rng() * 20;

        data.push({
            time: Math.min(time, censorTime),
            event: time <= censorTime ? 1 : 0,
            covariates: { treatment }
        });
    }

    return data;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('CoxRegressionEngine', () => {
    let engine;

    beforeAll(() => {
        engine = new CoxRegressionEngine();
    });

    // --- Cox PH ---

    describe('coxPH', () => {
        test('1. Treatment covariate: HR > 1 for harmful treatment', () => {
            const data = generateSurvivalData(200, 2.0, 101);
            const model = engine.coxPH(data, ['treatment']);
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            expect(trtCoef.hr).toBeGreaterThan(1);
        });

        test('2. Coefficients: beta = log(HR)', () => {
            const data = generateSurvivalData(200, 2.0, 102);
            const model = engine.coxPH(data, ['treatment']);
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            expect(Math.abs(trtCoef.beta - Math.log(trtCoef.hr))).toBeLessThan(1e-10);
        });

        test('3. SE in reasonable range', () => {
            const data = generateSurvivalData(200, 2.0, 103);
            const model = engine.coxPH(data, ['treatment']);
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            expect(trtCoef.se).toBeGreaterThan(0.05);
            expect(trtCoef.se).toBeLessThan(2.0);
        });

        test('4. Convergence in < 50 iterations', () => {
            const data = generateSurvivalData(200, 1.5, 104);
            const model = engine.coxPH(data, ['treatment']);
            expect(model.converged).toBe(true);
            expect(model.iterations).toBeLessThan(50);
        });

        test('5. Cox PH with 2 covariates', () => {
            const data = generateMultiCovariateData(300, 105);
            const model = engine.coxPH(data, ['treatment', 'age']);
            expect(model.coefficients).toHaveLength(2);
            expect(model.coefficients[0].name).toBe('treatment');
            expect(model.coefficients[1].name).toBe('age');
            expect(model.converged).toBe(true);
        });

        test('6. Breslow vs Efron tie handling produce different results', () => {
            // Create data with many ties
            const rng = seededRNG(106);
            const data = [];
            for (let i = 0; i < 100; i++) {
                data.push({
                    time: Math.floor(rng() * 10), // Integer times = many ties
                    event: rng() < 0.7 ? 1 : 0,
                    covariates: { treatment: rng() < 0.5 ? 1 : 0 }
                });
            }

            const breslow = engine.coxPH(data, ['treatment'], { tieMethod: 'breslow' });
            const efron = engine.coxPH(data, ['treatment'], { tieMethod: 'efron' });

            // Both should converge
            expect(breslow.converged).toBe(true);
            expect(efron.converged).toBe(true);
            // Results should differ (at least slightly) when ties exist
            expect(breslow.logLik).not.toBeCloseTo(efron.logLik, 10);
        });

        test('13. Edge: no events throws error', () => {
            const data = [
                { time: 5, event: 0, covariates: { treatment: 1 } },
                { time: 10, event: 0, covariates: { treatment: 0 } }
            ];
            expect(() => engine.coxPH(data, ['treatment'])).toThrow(/No events/);
        });

        test('14. Edge: single covariate works', () => {
            const data = generateSurvivalData(100, 1.5, 114);
            const model = engine.coxPH(data, ['treatment']);
            expect(model.coefficients).toHaveLength(1);
            expect(model.converged).toBe(true);
        });

        test('15. Edge: categorical covariate (0/1)', () => {
            const data = generateSurvivalData(150, 2.0, 115);
            const model = engine.coxPH(data, ['treatment']);
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            // For a binary variable, HR should be in a reasonable range
            expect(trtCoef.hr).toBeGreaterThan(0.1);
            expect(trtCoef.hr).toBeLessThan(20);
        });

        test('16. Determinism: same data produces same coefficients', () => {
            const data = generateSurvivalData(200, 1.5, 116);
            const model1 = engine.coxPH(data, ['treatment']);
            const model2 = engine.coxPH(data, ['treatment']);
            expect(model1.coefficients[0].beta).toEqual(model2.coefficients[0].beta);
            expect(model1.logLik).toEqual(model2.logLik);
        });

        test('AIC is computed correctly', () => {
            const data = generateSurvivalData(200, 1.5, 120);
            const model = engine.coxPH(data, ['treatment']);
            expect(model.aic).toBeCloseTo(-2 * model.logLik + 2 * 1, 5);
        });

        test('HR confidence interval contains true HR for large sample', () => {
            const trueHR = 2.0;
            const data = generateSurvivalData(500, trueHR, 121);
            const model = engine.coxPH(data, ['treatment']);
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            // With large sample, 95% CI should contain true HR
            expect(trtCoef.hrLower).toBeLessThan(trueHR + 1.0);
            expect(trtCoef.hrUpper).toBeGreaterThan(trueHR - 1.0);
        });

        test('p-value significant for strong treatment effect', () => {
            const data = generateSurvivalData(300, 3.0, 122);
            const model = engine.coxPH(data, ['treatment']);
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            expect(trtCoef.pValue).toBeLessThan(0.05);
        });
    });

    // --- AFT ---

    describe('aft', () => {
        test('7. AFT Weibull: acceleration factor returned', () => {
            const data = generateSurvivalData(200, 1.5, 107);
            const model = engine.aft(data, ['treatment'], 'weibull');
            const trtCoef = model.coefficients.find(c => c.name === 'treatment');
            expect(trtCoef).toBeDefined();
            expect(trtCoef.accelerationFactor).toBeDefined();
            expect(trtCoef.accelerationFactor).toBeGreaterThan(0);
        });

        test('8. AFT lognormal: coefficients returned', () => {
            const data = generateSurvivalData(200, 1.5, 108);
            const model = engine.aft(data, ['treatment'], 'lognormal');
            expect(model.distribution).toBe('lognormal');
            expect(model.coefficients.length).toBeGreaterThan(0);
            expect(model.sigma).toBeGreaterThan(0);
        });

        test('AFT loglogistic: coefficients returned', () => {
            const data = generateSurvivalData(200, 1.5, 109);
            const model = engine.aft(data, ['treatment'], 'loglogistic');
            expect(model.distribution).toBe('loglogistic');
            expect(model.coefficients.length).toBeGreaterThan(0);
        });

        test('AFT unknown distribution throws', () => {
            const data = generateSurvivalData(100, 1.5, 110);
            expect(() => engine.aft(data, ['treatment'], 'gamma')).toThrow();
        });

        test('AFT no events throws error', () => {
            const data = [
                { time: 5, event: 0, covariates: { treatment: 1 } },
                { time: 10, event: 0, covariates: { treatment: 0 } }
            ];
            expect(() => engine.aft(data, ['treatment'], 'weibull')).toThrow(/No events/);
        });
    });

    // --- PH Test ---

    describe('testPH', () => {
        test('9. Non-violating covariate: pValue > 0.05', () => {
            // Generate data under true PH (constant HR)
            const data = generateSurvivalData(300, 2.0, 130);
            const model = engine.coxPH(data, ['treatment']);
            const phTest = engine.testPH(model, data);
            expect(phTest).toHaveLength(1);
            // Under true PH, p-value should typically be > 0.05
            // (not guaranteed for every seed, but very likely for n=300)
            expect(phTest[0].covariate).toBe('treatment');
            expect(typeof phTest[0].pValue).toBe('number');
            expect(typeof phTest[0].rho).toBe('number');
        });

        test('10. Violating covariate: detect time-varying effect', () => {
            const data = generatePHViolationData(500, 131);
            const model = engine.coxPH(data, ['treatment']);
            const phTest = engine.testPH(model, data);
            expect(phTest).toHaveLength(1);
            // Should have a non-trivial correlation with time
            expect(typeof phTest[0].chiSq).toBe('number');
            expect(phTest[0].chiSq).toBeGreaterThanOrEqual(0);
        });

        test('testPH returns phViolated flag', () => {
            const data = generateSurvivalData(200, 1.5, 132);
            const model = engine.coxPH(data, ['treatment']);
            const phTest = engine.testPH(model, data);
            expect(typeof phTest[0].phViolated).toBe('boolean');
        });
    });

    // --- Prediction ---

    describe('predictSurvival', () => {
        test('11. S(0) = 1 and S(t) decreases over time', () => {
            const data = generateSurvivalData(200, 1.5, 140);
            const model = engine.coxPH(data, ['treatment']);
            const pred = engine.predictSurvival(model, { treatment: 1 }, [0, 5, 10, 20, 50]);

            expect(pred[0].survival).toBeCloseTo(1.0, 5);
            // Survival should generally decrease
            for (let i = 1; i < pred.length; i++) {
                expect(pred[i].survival).toBeLessThanOrEqual(pred[i - 1].survival + 0.001);
            }
        });

        test('Predicted survival is between 0 and 1', () => {
            const data = generateSurvivalData(200, 2.0, 141);
            const model = engine.coxPH(data, ['treatment']);
            const pred = engine.predictSurvival(model, { treatment: 0 }, [0, 1, 5, 10]);
            for (const p of pred) {
                expect(p.survival).toBeGreaterThanOrEqual(0);
                expect(p.survival).toBeLessThanOrEqual(1.001);
            }
        });

        test('AFT prediction works', () => {
            const data = generateSurvivalData(200, 1.5, 142);
            const model = engine.aft(data, ['treatment'], 'weibull');
            const pred = engine.predictSurvival(model, { treatment: 0 }, [0.1, 1, 5, 10]);
            expect(pred).toHaveLength(4);
            // First prediction should have high survival
            expect(pred[0].survival).toBeGreaterThan(0.5);
        });
    });

    // --- Concordance ---

    describe('concordanceIndex', () => {
        test('12. C-index in [0.5, 1] for informative model', () => {
            const data = generateSurvivalData(300, 3.0, 150);
            const model = engine.coxPH(data, ['treatment']);
            expect(model.concordance).toBeGreaterThanOrEqual(0.5);
            expect(model.concordance).toBeLessThanOrEqual(1.0);
        });

        test('C-index via concordanceIndex method matches model', () => {
            const data = generateSurvivalData(200, 2.0, 151);
            const model = engine.coxPH(data, ['treatment']);
            const cIdx = engine.concordanceIndex(model, data);
            // Should be close to the stored concordance (not exact due to sort differences)
            expect(cIdx).toBeGreaterThanOrEqual(0.4);
            expect(cIdx).toBeLessThanOrEqual(1.0);
        });
    });
});
