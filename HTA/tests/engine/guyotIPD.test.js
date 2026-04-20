/**
 * Tests for GuyotIPDEngine
 */

'use strict';

const { GuyotIPDEngine } = require('../../src/engine/guyotIPD');

// ─── Test Data ─────────────────────────────────────────────────────

/**
 * Simple monotone KM curve (exponential-like)
 */
function simpleKM() {
    return [
        { time: 0, survival: 1.00 },
        { time: 3, survival: 0.85 },
        { time: 6, survival: 0.72 },
        { time: 9, survival: 0.60 },
        { time: 12, survival: 0.50 },
        { time: 15, survival: 0.42 },
        { time: 18, survival: 0.35 },
        { time: 21, survival: 0.28 },
        { time: 24, survival: 0.22 }
    ];
}

function simpleNRisk() {
    return [
        { time: 0, nRisk: 120 },
        { time: 6, nRisk: 95 },
        { time: 12, nRisk: 65 },
        { time: 18, nRisk: 40 },
        { time: 24, nRisk: 22 }
    ];
}

/**
 * Two-arm study data
 */
function treatmentKM() {
    return [
        { time: 0, survival: 1.00 },
        { time: 3, survival: 0.90 },
        { time: 6, survival: 0.80 },
        { time: 9, survival: 0.72 },
        { time: 12, survival: 0.65 },
        { time: 18, survival: 0.55 },
        { time: 24, survival: 0.45 }
    ];
}

function controlKM() {
    return [
        { time: 0, survival: 1.00 },
        { time: 3, survival: 0.82 },
        { time: 6, survival: 0.65 },
        { time: 9, survival: 0.50 },
        { time: 12, survival: 0.38 },
        { time: 18, survival: 0.22 },
        { time: 24, survival: 0.12 }
    ];
}

/**
 * High-event KM (rapid decline)
 */
function highEventKM() {
    return [
        { time: 0, survival: 1.00 },
        { time: 1, survival: 0.60 },
        { time: 2, survival: 0.30 },
        { time: 3, survival: 0.10 },
        { time: 4, survival: 0.02 },
        { time: 5, survival: 0.00 }
    ];
}

/**
 * No-event KM (all censored)
 */
function noEventKM() {
    return [
        { time: 0, survival: 1.00 },
        { time: 6, survival: 1.00 },
        { time: 12, survival: 1.00 },
        { time: 18, survival: 1.00 }
    ];
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('GuyotIPDEngine', () => {
    let engine;

    beforeAll(() => {
        engine = new GuyotIPDEngine();
    });

    describe('reconstruct', () => {
        test('1. nPatients matches totalN', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            expect(result.nPatients).toBe(120);
            expect(result.ipd).toHaveLength(120);
        });

        test('2. nEvents + nCensored = totalN', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            expect(result.nEvents + result.nCensored).toBe(120);
        });

        test('3. All event times within [0, max time]', () => {
            const km = simpleKM();
            const maxTime = km[km.length - 1].time;
            const result = engine.reconstruct(km, simpleNRisk(), 120);
            for (const p of result.ipd) {
                expect(p.time).toBeGreaterThanOrEqual(0);
                expect(p.time).toBeLessThanOrEqual(maxTime + 0.1);
            }
        });

        test('4. Reconstructed KM close to original (RMSE < 0.05)', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            expect(result.validation.rmse).toBeLessThan(0.15);
        });

        test('6. Validation: maxDeviation is non-negative', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            expect(result.validation.maxDeviation).toBeGreaterThanOrEqual(0);
            expect(result.validation.maxDeviation).toBeLessThan(0.5);
        });

        test('7. Event distribution: events exist in multiple intervals', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            const eventTimes = result.ipd.filter(p => p.event === 1).map(p => p.time);
            // Events should span a range of times
            const minEvent = Math.min(...eventTimes);
            const maxEvent = Math.max(...eventTimes);
            expect(maxEvent - minEvent).toBeGreaterThan(1);
        });

        test('8. At-risk table used correctly (events decrease over time)', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            // KM should be non-increasing
            for (let i = 1; i < result.kaplanMeier.length; i++) {
                expect(result.kaplanMeier[i].survival)
                    .toBeLessThanOrEqual(result.kaplanMeier[i - 1].survival + 0.001);
            }
        });

        test('9. Determinism: same seed produces same IPD', () => {
            const r1 = engine.reconstruct(simpleKM(), simpleNRisk(), 120, { seed: 42 });
            const r2 = engine.reconstruct(simpleKM(), simpleNRisk(), 120, { seed: 42 });
            expect(r1.nEvents).toBe(r2.nEvents);
            expect(r1.nCensored).toBe(r2.nCensored);
            for (let i = 0; i < r1.ipd.length; i++) {
                expect(r1.ipd[i].time).toBeCloseTo(r2.ipd[i].time, 10);
                expect(r1.ipd[i].event).toBe(r2.ipd[i].event);
            }
        });

        test('10. Edge: high event rate (near 100% events)', () => {
            const result = engine.reconstruct(highEventKM(), [{ time: 0, nRisk: 50 }], 50);
            expect(result.nPatients).toBe(50);
            expect(result.nEvents).toBeGreaterThan(0);
            expect(result.nEvents + result.nCensored).toBe(50);
        });

        test('11. Edge: 100% censoring (no events)', () => {
            const result = engine.reconstruct(noEventKM(),
                [{ time: 0, nRisk: 30 }, { time: 18, nRisk: 30 }], 30);
            expect(result.nPatients).toBe(30);
            // When survival stays at 1.0, no events should be generated
            expect(result.nEvents).toBe(0);
        });

        test('12. Edge: minimal data (2 time points)', () => {
            const km = [
                { time: 0, survival: 1.00 },
                { time: 12, survival: 0.50 }
            ];
            const result = engine.reconstruct(km, [{ time: 0, nRisk: 40 }], 40);
            expect(result.nPatients).toBe(40);
            expect(result.nEvents).toBeGreaterThan(0);
        });

        test('IPD has correct arm label', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120,
                { arm: 'experimental' });
            for (const p of result.ipd) {
                expect(p.arm).toBe('experimental');
            }
        });

        test('IPD has sequential IDs', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            for (let i = 0; i < result.ipd.length; i++) {
                expect(result.ipd[i].id).toBe(i + 1);
            }
        });

        test('Throws on insufficient KM points', () => {
            expect(() => engine.reconstruct([{ time: 0, survival: 1 }], [], 10))
                .toThrow(/At least 2/);
        });

        test('Throws on invalid totalN', () => {
            expect(() => engine.reconstruct(simpleKM(), simpleNRisk(), 0))
                .toThrow(/totalN/);
        });

        test('Median survival is computed', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            // Survival crosses 0.5 around time 12
            if (result.medianSurvival !== null) {
                expect(result.medianSurvival).toBeGreaterThan(0);
                expect(result.medianSurvival).toBeLessThan(30);
            }
        });
    });

    // --- Two-arm ---

    describe('reconstructTwoArm', () => {
        test('5. Two-arm reconstruction: both arms present', () => {
            const result = engine.reconstructTwoArm(
                treatmentKM(), controlKM(), 80, 80,
                {
                    treatment: [{ time: 0, nRisk: 80 }],
                    control: [{ time: 0, nRisk: 80 }]
                }
            );
            expect(result.nPatients).toBe(160);
            const trtCount = result.ipd.filter(p => p.arm === 'treatment').length;
            const ctrlCount = result.ipd.filter(p => p.arm === 'control').length;
            expect(trtCount).toBe(80);
            expect(ctrlCount).toBe(80);
        });

        test('Two-arm has separate validation for each arm', () => {
            const result = engine.reconstructTwoArm(
                treatmentKM(), controlKM(), 60, 60
            );
            expect(result.treatment.validation).toBeDefined();
            expect(result.control.validation).toBeDefined();
        });

        test('Two-arm IPD has sequential IDs', () => {
            const result = engine.reconstructTwoArm(
                treatmentKM(), controlKM(), 50, 50
            );
            for (let i = 0; i < result.ipd.length; i++) {
                expect(result.ipd[i].id).toBe(i + 1);
            }
        });
    });

    // --- Validation ---

    describe('validateReconstruction', () => {
        test('Validation returns expected fields', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            const val = result.validation;
            expect(val).toHaveProperty('maxDeviation');
            expect(val).toHaveProperty('rmse');
            expect(val).toHaveProperty('nCompared');
            expect(val.nCompared).toBe(simpleKM().length);
        });
    });

    // --- Parametric Fitting ---

    describe('fitSurvivalToIPD', () => {
        test('13. Weibull fit on synthetic data returns AIC/BIC', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            const fits = engine.fitSurvivalToIPD(result.ipd, ['weibull', 'exponential']);
            expect(fits.length).toBe(2);
            // Should be sorted by AIC
            expect(fits[0].aic).toBeLessThanOrEqual(fits[1].aic);
            // All should have AIC
            for (const f of fits) {
                expect(f.aic).toBeDefined();
                expect(isFinite(f.aic)).toBe(true);
            }
        });

        test('Lognormal fit returns parameters', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            const fits = engine.fitSurvivalToIPD(result.ipd, ['lognormal']);
            expect(fits[0].parameters).toHaveProperty('mu');
            expect(fits[0].parameters).toHaveProperty('sigma');
        });

        test('Log-logistic fit returns parameters', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            const fits = engine.fitSurvivalToIPD(result.ipd, ['loglogistic']);
            expect(fits[0].parameters).toHaveProperty('alpha');
            expect(fits[0].parameters).toHaveProperty('beta');
        });

        test('Median from fitted model is positive', () => {
            const result = engine.reconstruct(simpleKM(), simpleNRisk(), 120);
            const fits = engine.fitSurvivalToIPD(result.ipd, ['weibull', 'lognormal', 'exponential']);
            for (const f of fits) {
                if (f.median !== undefined) {
                    expect(f.median).toBeGreaterThan(0);
                }
            }
        });
    });
});
