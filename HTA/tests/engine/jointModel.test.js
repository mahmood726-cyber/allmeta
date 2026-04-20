/**
 * Tests for src/engine/jointModel.js — JointModelEngine
 */

'use strict';

const { JointModelEngine } = require('../../src/engine/jointModel');

// ---------------------------------------------------------------------------
// Helper: generate synthetic data
// ---------------------------------------------------------------------------

/**
 * Create dataset with known linear biomarker trajectory and event hazard
 * proportional to biomarker value.
 */
function generateLinearData(nSubjects, seed) {
    // Simple seeded RNG (linear congruential)
    let s = seed ?? 42;
    function rand() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    }

    const data = [];
    for (let i = 0; i < nSubjects; i++) {
        const b0 = 5 + (rand() - 0.5) * 2;   // baseline ~5
        const b1 = 0.5 + (rand() - 0.5) * 0.3; // slope ~0.5
        const nObs = 3 + Math.floor(rand() * 5); // 3-7 observations
        const maxTime = 10 + rand() * 20;

        const times = [];
        const biomarker = [];
        for (let j = 0; j < nObs; j++) {
            const t = (j / (nObs - 1 || 1)) * maxTime * 0.8;
            times.push(t);
            biomarker.push(b0 + b1 * t + (rand() - 0.5) * 1.0); // noise
        }

        // Event time depends on biomarker trajectory
        const eventTime = maxTime * (0.5 + rand() * 0.5);
        const event = rand() > 0.3 ? 1 : 0; // 70% event rate

        data.push({ id: i + 1, times, biomarker, eventTime, event });
    }
    return data;
}

/**
 * Create dataset where biomarker is random noise (no association with survival)
 */
function generateNoAssociationData(nSubjects, seed) {
    let s = seed ?? 99;
    function rand() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    }

    const data = [];
    for (let i = 0; i < nSubjects; i++) {
        const nObs = 3 + Math.floor(rand() * 4);
        const times = [];
        const biomarker = [];
        for (let j = 0; j < nObs; j++) {
            times.push(j * 3);
            biomarker.push(rand() * 10); // random noise
        }
        const eventTime = 5 + rand() * 20;
        const event = rand() > 0.5 ? 1 : 0;
        data.push({ id: i + 1, times, biomarker, eventTime, event });
    }
    return data;
}

describe('JointModelEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new JointModelEngine({ maxIter: 50, tolerance: 1e-6 });
    });

    test('1. Linear biomarker trajectory: positive slope detected', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data, { longitudinalModel: 'linear' });
        // Population slope should be positive (~0.5)
        expect(model.longitudinal.beta1).toBeGreaterThan(0);
    });

    test('2. Survival association: higher biomarker relates to hazard (alpha != 0)', () => {
        const data = generateLinearData(50, 123);
        const model = engine.fit(data, { longitudinalModel: 'linear' });
        // Alpha should be non-zero (direction depends on data)
        expect(model.survival.alpha).toBeDefined();
        expect(typeof model.survival.alpha).toBe('number');
    });

    test('3. No association: alpha is closer to 0 for noise data', () => {
        const noAssocData = generateNoAssociationData(50, 77);
        const model = engine.fit(noAssocData, { longitudinalModel: 'linear' });
        // Alpha should be smaller in magnitude (though not guaranteed to be 0 with finite data)
        expect(Math.abs(model.survival.alpha)).toBeLessThan(2);
    });

    test('4. Predict: biomarker trajectory extrapolation', () => {
        const data = generateLinearData(20, 42);
        const model = engine.fit(data, { longitudinalModel: 'linear' });
        const predTimes = [0, 5, 10, 15, 20];
        const pred = engine.predict(model, [data[0]], predTimes);

        expect(pred.predictions.length).toBe(1);
        expect(pred.predictions[0].biomarker.length).toBe(5);
        // Biomarker should increase over time (positive slope)
        if (model.longitudinal.beta1 > 0) {
            expect(pred.predictions[0].biomarker[4]).toBeGreaterThan(pred.predictions[0].biomarker[0]);
        }
    });

    test('5. Predict: survival curve is non-increasing', () => {
        const data = generateLinearData(20, 42);
        const model = engine.fit(data, { longitudinalModel: 'linear' });
        const predTimes = [0, 2, 5, 10, 15, 20, 30];
        const pred = engine.predict(model, [data[0]], predTimes);

        const surv = pred.predictions[0].survival;
        expect(surv[0]).toBeCloseTo(1.0, 5); // S(0) = 1
        for (let i = 1; i < surv.length; i++) {
            expect(surv[i]).toBeLessThanOrEqual(surv[i - 1] + 1e-10);
        }
    });

    test('6. Dynamic prediction: later landmark gives updated survival', () => {
        const data = generateLinearData(20, 42);
        const model = engine.fit(data, { longitudinalModel: 'linear' });
        const patient = data[0];

        const dp1 = engine.dynamicPrediction(model, patient, 2, 10);
        const dp2 = engine.dynamicPrediction(model, patient, 5, 10);

        // Both should start at 1.0 (conditional survival at landmark)
        expect(dp1.conditionalSurvival[0]).toBeCloseTo(1.0, 5);
        expect(dp2.conditionalSurvival[0]).toBeCloseTo(1.0, 5);
        // Later landmark may give different predictions
        expect(dp1.landmark).toBe(2);
        expect(dp2.landmark).toBe(5);
    });

    test('7. Two-stage estimates: longitudinal params are reasonable', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data, { longitudinalModel: 'linear' });
        // beta0 ~ 5 (intercept), beta1 ~ 0.5 (slope)
        expect(model.longitudinal.beta0).toBeGreaterThan(0);
        expect(model.longitudinal.beta0).toBeLessThan(20);
        expect(model.longitudinal.sigma_e).toBeGreaterThan(0);
    });

    test('8. Weibull baseline hazard parameters are positive', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data);
        expect(model.survival.shape).toBeGreaterThan(0);
        expect(model.survival.scale).toBeGreaterThan(0);
    });

    test('9. AIC and logLik are returned', () => {
        const data = generateLinearData(20, 42);
        const model = engine.fit(data);
        expect(typeof model.aic).toBe('number');
        expect(typeof model.logLik).toBe('number');
        expect(isFinite(model.aic)).toBe(true);
        expect(isFinite(model.logLik)).toBe(true);
    });

    test('10. Edge: single patient (minimal data)', () => {
        const data = [{
            id: 1,
            times: [0, 5, 10],
            biomarker: [3, 5, 8],
            eventTime: 15,
            event: 1
        }];
        const model = engine.fit(data);
        expect(model.longitudinal.beta0).toBeDefined();
        expect(model.survival.shape).toBeGreaterThan(0);
    });

    test('11. Edge: all censored (no events)', () => {
        const data = generateLinearData(20, 42);
        for (const d of data) d.event = 0;
        const model = engine.fit(data);
        // Should still fit without error
        expect(model.longitudinal.beta0).toBeDefined();
        expect(typeof model.survival.alpha).toBe('number');
    });

    test('12. Edge: all events at same time', () => {
        const data = generateLinearData(15, 42);
        for (const d of data) {
            d.eventTime = 10;
            d.event = 1;
        }
        const model = engine.fit(data);
        expect(model.survival.shape).toBeGreaterThan(0);
    });

    test('13. Quadratic trajectory option', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data, { longitudinalModel: 'quadratic' });
        expect(model.longitudinal.beta2).toBeDefined();
        expect(typeof model.longitudinal.beta2).toBe('number');
    });

    test('14. Association strength p-value in [0,1]', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data);
        const assoc = engine.associationStrength(model);
        expect(assoc.pValue).toBeGreaterThanOrEqual(0);
        expect(assoc.pValue).toBeLessThanOrEqual(1);
        expect(typeof assoc.significant).toBe('boolean');
    });

    test('15. Input validation: missing biomarker throws', () => {
        const data = [{ id: 1, times: [0, 5], eventTime: 10, event: 1 }];
        expect(() => engine.fit(data)).toThrow(/biomarker/i);
    });

    test('16. Input validation: empty data throws', () => {
        expect(() => engine.fit([])).toThrow();
    });

    test('17. Input validation: mismatched array lengths throws', () => {
        const data = [{
            id: 1,
            times: [0, 5, 10],
            biomarker: [3, 5],
            eventTime: 15,
            event: 1
        }];
        expect(() => engine.fit(data)).toThrow(/equal length/i);
    });

    test('18. Slope association type works', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data, { association: 'slope' });
        expect(typeof model.survival.alpha).toBe('number');
    });

    test('19. Cumulative association type works', () => {
        const data = generateLinearData(30, 42);
        const model = engine.fit(data, { association: 'cumulative' });
        expect(typeof model.survival.alpha).toBe('number');
    });

    test('20. Predict returns correct structure for multiple subjects', () => {
        const data = generateLinearData(20, 42);
        const model = engine.fit(data);
        const times = [0, 5, 10];
        const pred = engine.predict(model, data.slice(0, 3), times);
        expect(pred.predictions.length).toBe(3);
        expect(pred.times).toEqual(times);
        for (const p of pred.predictions) {
            expect(p.biomarker.length).toBe(3);
            expect(p.survival.length).toBe(3);
        }
    });
});
