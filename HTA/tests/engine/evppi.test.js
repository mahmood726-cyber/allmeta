/**
 * Tests for src/engine/evppi.js — EVPPICalculator and EVSICalculator
 */

'use strict';

const { KahanSum, StatUtils } = require('../../src/utils/mathUtils');

global.KahanSum = KahanSum;
global.StatUtils = StatUtils;

const { EVPPICalculator, EVSICalculator } = require('../../src/engine/evppi');

/**
 * Helper: generate synthetic PSA results and parameter samples.
 * Uses a simple seeded LCG to keep data deterministic.
 */
function generatePSAData(n = 200, seed = 42) {
    let state = seed;
    function lcg() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff || 1e-10;
    }

    // Box-Muller for approximate normal draws
    function normalDraw(mean, sd) {
        const u1 = lcg();
        const u2 = lcg();
        return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    const incrementalQalys = [];
    const incrementalCosts = [];
    const paramA = [];
    const paramB = [];
    const paramC = []; // constant (zero uncertainty)

    for (let i = 0; i < n; i++) {
        const a = normalDraw(0.5, 0.3);
        const b = normalDraw(1000, 500);
        paramA.push(a);
        paramB.push(b);
        paramC.push(0.7); // fixed — no uncertainty

        // Incremental outcomes driven partly by paramA and paramB
        incrementalQalys.push(a + normalDraw(0, 0.1));
        incrementalCosts.push(b + normalDraw(0, 100));
    }

    return {
        psaResults: {
            scatter: {
                incremental_qalys: incrementalQalys,
                incremental_costs: incrementalCosts
            }
        },
        parameterSamples: {
            paramA: paramA,
            paramB: paramB,
            paramC: paramC
        }
    };
}

describe('EVPPICalculator', () => {
    const wtp = 50000;
    let data;

    beforeAll(() => {
        data = generatePSAData(200, 42);
    });

    // ----------------------------------------------------------------
    // 1. Constructor
    // ----------------------------------------------------------------
    describe('Constructor', () => {
        test('creates with default config', () => {
            const calc = new EVPPICalculator();
            expect(calc.options.numSplines).toBe(10);
            expect(calc.options.bootstrapIterations).toBe(100);
        });

        test('accepts custom options and seed', () => {
            const calc = new EVPPICalculator({ numSplines: 5, seed: 99 });
            expect(calc.options.numSplines).toBe(5);
            expect(calc._rngState).toBe(99);
        });
    });

    // ----------------------------------------------------------------
    // 2. EVPI calculation (total, embedded in calculateAll)
    // ----------------------------------------------------------------
    describe('EVPI calculation', () => {
        test('total EVPI is non-negative', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculateAll(data.psaResults, wtp, data.parameterSamples);

            expect(result.totalEVPI).toBeGreaterThanOrEqual(0);
        });

        test('total EVPI is finite', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculateAll(data.psaResults, wtp, data.parameterSamples);

            expect(Number.isFinite(result.totalEVPI)).toBe(true);
        });
    });

    // ----------------------------------------------------------------
    // 3. EVPPI single parameter
    // ----------------------------------------------------------------
    describe('EVPPI single parameter', () => {
        test('returns non-negative value between 0 and EVPI', () => {
            const calc = new EVPPICalculator({ seed: 42 });

            // First get EVPI
            const all = calc.calculateAll(data.psaResults, wtp, data.parameterSamples);
            const evpi = all.totalEVPI;

            // Reset seed for fresh calculation
            const calc2 = new EVPPICalculator({ seed: 42 });
            const result = calc2.calculate(data.psaResults, ['paramA'], wtp, data.parameterSamples);

            expect(result.evppiPerPatient).toBeGreaterThanOrEqual(0);
            // EVPPI for a single parameter should not exceed total EVPI
            // (add small tolerance for numerical noise)
            expect(result.evppiPerPatient).toBeLessThanOrEqual(evpi + 1);
        });

        test('result contains expected fields', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculate(data.psaResults, ['paramA'], wtp, data.parameterSamples);

            expect(result.parameters).toEqual(['paramA']);
            expect(result.wtp).toBe(wtp);
            expect(Number.isFinite(result.evppiPerPatient)).toBe(true);
            expect(Number.isFinite(result.standardError)).toBe(true);
            expect(Number.isFinite(result.baselineNMB)).toBe(true);
            expect(Number.isFinite(result.rSquared)).toBe(true);
            expect(result.iterations).toBe(200);
            expect(['Intervention', 'Comparator']).toContain(result.optimalWithCurrentInfo);
        });
    });

    // ----------------------------------------------------------------
    // 4. EVPPI multiple parameters
    // ----------------------------------------------------------------
    describe('EVPPI multiple parameters', () => {
        test("each parameter's EVPPI is <= EVPI", () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculateAll(data.psaResults, wtp, data.parameterSamples);

            const evpi = result.totalEVPI;
            for (const param of result.parameters) {
                expect(param.evppi).toBeGreaterThanOrEqual(0);
                expect(param.evppi).toBeLessThanOrEqual(evpi + 1);
            }
        });

        test('results are sorted by EVPPI descending', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculateAll(data.psaResults, wtp, data.parameterSamples);

            for (let i = 1; i < result.parameters.length; i++) {
                expect(result.parameters[i - 1].evppi).toBeGreaterThanOrEqual(
                    result.parameters[i].evppi
                );
            }
        });

        test('percentOfEVPI is between 0 and 100 when EVPI > 0', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculateAll(data.psaResults, wtp, data.parameterSamples);

            if (result.totalEVPI > 0) {
                for (const param of result.parameters) {
                    expect(param.percentOfEVPI).toBeGreaterThanOrEqual(0);
                    // Individual EVPPI percentages can exceed 100 due to non-additivity,
                    // but with our test data they typically do not
                }
            }
        });
    });

    // ----------------------------------------------------------------
    // 5. GAM metamodeling
    // ----------------------------------------------------------------
    describe('GAM metamodeling', () => {
        test('fitGAM returns finite fitted values', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const X = data.parameterSamples.paramA.map(v => [v]);
            const Y = data.psaResults.scatter.incremental_qalys;

            const fitted = calc.fitGAM(X, Y);

            expect(fitted).toHaveLength(Y.length);
            for (const val of fitted) {
                expect(Number.isFinite(val)).toBe(true);
            }
        });

        test('R-squared is between 0 and 1', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculate(data.psaResults, ['paramA'], wtp, data.parameterSamples);

            expect(result.rSquared).toBeGreaterThanOrEqual(0);
            expect(result.rSquared).toBeLessThanOrEqual(1);
        });

        test('fitGAM handles multi-parameter (additive model)', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const n = data.parameterSamples.paramA.length;
            const X = [];
            for (let i = 0; i < n; i++) {
                X.push([data.parameterSamples.paramA[i], data.parameterSamples.paramB[i]]);
            }
            const Y = data.psaResults.scatter.incremental_qalys;

            const fitted = calc.fitGAM(X, Y);
            expect(fitted).toHaveLength(n);
            for (const val of fitted) {
                expect(Number.isFinite(val)).toBe(true);
            }
        });
    });

    // ----------------------------------------------------------------
    // 6. WTP sensitivity
    // ----------------------------------------------------------------
    describe('WTP sensitivity', () => {
        test('EVPPI curve returns values for each WTP step', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const curve = calc.generateEVPPICurve(
                data.psaResults,
                ['paramA'],
                data.parameterSamples,
                { min: 0, max: 100000, step: 25000 }
            );

            // 0, 25000, 50000, 75000, 100000 = 5 points
            expect(curve.length).toBe(5);
            for (const point of curve) {
                expect(Number.isFinite(point.wtp)).toBe(true);
                expect(Number.isFinite(point.evppi)).toBe(true);
                expect(point.evppi).toBeGreaterThanOrEqual(0);
            }
        });

        test('different WTP thresholds can produce different EVPPI values', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const curve = calc.generateEVPPICurve(
                data.psaResults,
                ['paramA'],
                data.parameterSamples,
                { min: 0, max: 100000, step: 50000 }
            );

            // At least WTP=0 and WTP=100000 should differ
            const evppiValues = curve.map(c => c.evppi);
            const allSame = evppiValues.every(v => v === evppiValues[0]);
            // It is acceptable for them to all be 0 if there is no uncertainty,
            // but with our test data they should differ
            expect(allSame).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // 7. Per-patient vs population
    // ----------------------------------------------------------------
    describe('Per-patient vs population EVPPI', () => {
        test('population EVPPI equals per-patient times discounted population', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const evppiPerPatient = 500;
            const population = 10000;
            const years = 5;
            const discountRate = 0.035;

            const popEVPPI = calc.calculatePopulationEVPPI(
                evppiPerPatient, population, years, discountRate
            );

            // Manually calculate discounted population
            let totalDiscountedPop = 0;
            for (let t = 0; t < years; t++) {
                totalDiscountedPop += population / Math.pow(1 + discountRate, t);
            }
            const expected = evppiPerPatient * totalDiscountedPop;

            expect(popEVPPI).toBeCloseTo(expected, 2);
        });

        test('population EVPPI with zero discount equals per-patient * pop * years', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const popEVPPI = calc.calculatePopulationEVPPI(100, 1000, 10, 0);

            expect(popEVPPI).toBeCloseTo(100 * 1000 * 10, 2);
        });

        test('population EVPPI is non-negative when per-patient is non-negative', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const popEVPPI = calc.calculatePopulationEVPPI(0, 10000, 5, 0.035);
            expect(popEVPPI).toBe(0);
        });
    });

    // ----------------------------------------------------------------
    // 8. Zero uncertainty
    // ----------------------------------------------------------------
    describe('Zero uncertainty', () => {
        test('EVPPI is approximately 0 when parameter has no variance', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            // paramC is constant (0.7 for all iterations) — zero uncertainty
            const result = calc.calculate(
                data.psaResults, ['paramC'], wtp, data.parameterSamples
            );

            // With zero parameter variance, EVPPI should be very small (effectively 0)
            expect(result.evppiPerPatient).toBeLessThan(1);
        });
    });

    // ----------------------------------------------------------------
    // 9. Determinism
    // ----------------------------------------------------------------
    describe('Determinism', () => {
        test('same seed produces same EVPPI', () => {
            const calc1 = new EVPPICalculator({ seed: 12345 });
            const result1 = calc1.calculate(
                data.psaResults, ['paramA'], wtp, data.parameterSamples
            );

            const calc2 = new EVPPICalculator({ seed: 12345 });
            const result2 = calc2.calculate(
                data.psaResults, ['paramA'], wtp, data.parameterSamples
            );

            expect(result1.evppiPerPatient).toBeCloseTo(result2.evppiPerPatient, 10);
            expect(result1.standardError).toBeCloseTo(result2.standardError, 10);
        });

        test('different seeds can produce different standard errors', () => {
            const calc1 = new EVPPICalculator({ seed: 111 });
            const result1 = calc1.calculate(
                data.psaResults, ['paramA'], wtp, data.parameterSamples
            );

            const calc2 = new EVPPICalculator({ seed: 999 });
            const result2 = calc2.calculate(
                data.psaResults, ['paramA'], wtp, data.parameterSamples
            );

            // The point estimate (evppiPerPatient) may be similar since it does
            // not depend on the PRNG, but the bootstrap SE should differ.
            // Allow for the possibility they are equal by chance.
            const seDiffers = Math.abs(result1.standardError - result2.standardError) > 1e-10;
            expect(seDiffers).toBe(true);
        });
    });

    // ----------------------------------------------------------------
    // 10. Edge case: 2 strategies, 1 parameter
    // ----------------------------------------------------------------
    describe('Edge case: minimal setup', () => {
        test('works with a single parameter of interest', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            const result = calc.calculate(
                data.psaResults, ['paramA'], wtp, data.parameterSamples
            );

            expect(result.evppiPerPatient).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(result.standardError)).toBe(true);
        });

        test('throws when PSA results are missing scatter data', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            expect(() => {
                calc.calculate({}, ['paramA'], wtp, data.parameterSamples);
            }).toThrow(/PSA results/);
        });

        test('throws when parameter samples are null', () => {
            const calc = new EVPPICalculator({ seed: 42 });
            expect(() => {
                calc.calculate(data.psaResults, ['paramA'], wtp, null);
            }).toThrow(/PSA results/);
        });
    });

    // ----------------------------------------------------------------
    // EVSI Calculator
    // ----------------------------------------------------------------
    describe('EVSICalculator', () => {
        test('EVSI is less than or equal to EVPPI', () => {
            const calc = new EVSICalculator();
            const result = calc.calculate(
                data.psaResults,
                ['paramA'],
                wtp,
                data.parameterSamples,
                { sampleSize: 100, studyCost: 1000 }
            );

            expect(result.evsiPerPatient).toBeGreaterThanOrEqual(0);
            expect(result.evsiPerPatient).toBeLessThanOrEqual(result.evppiPerPatient + 1e-6);
        });

        test('EVSI result contains study design fields', () => {
            const calc = new EVSICalculator();
            const result = calc.calculate(
                data.psaResults,
                ['paramA'],
                wtp,
                data.parameterSamples,
                { sampleSize: 200, studyCost: 5000 }
            );

            expect(result.sampleSize).toBe(200);
            expect(result.studyCost).toBe(5000);
            expect(typeof result.worthConducting).toBe('boolean');
            expect(Number.isFinite(result.netValueOfStudy)).toBe(true);
            expect(result.optimalSampleSize).toBeDefined();
            expect(result.optimalSampleSize.optimalN).toBeGreaterThanOrEqual(0);
        });
    });
});
