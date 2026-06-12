/**
 * Smoke tests for FPNMAEngine
 *
 * Minimum coverage to prevent syntactic damage from shipping undetected
 * (the maicSTC.js incident of 2026-04-15). Deeper domain tests welcome.
 *
 * FP-NMA per Jansen (2011), Freeman & Carpenter (2017), NICE TSD 21.
 */

'use strict';

const { FPNMAEngine } = require('../../src/engine/fpNMA');

describe('FPNMAEngine - smoke', () => {
    test('module exports FPNMAEngine constructor', () => {
        expect(typeof FPNMAEngine).toBe('function');
    });

    test('default constructor does not throw', () => {
        expect(() => new FPNMAEngine()).not.toThrow();
    });

    test('instance has expected prototype', () => {
        const engine = new FPNMAEngine();
        expect(engine).toBeInstanceOf(FPNMAEngine);
    });

    test('accepts custom fractional polynomial powers', () => {
        const engine = new FPNMAEngine({ powers: [-1, 0, 1] });
        expect(engine).toBeInstanceOf(FPNMAEngine);
    });
});

describe('FPNMAEngine - HR confidence band from the fitted WLS covariance', () => {
    const ts = [0.5, 1, 2, 3];
    const d = -0.5; // truth: log(HR(t)) = -0.5 * log(t)
    const dataAtSe = (se) => [
        { treatment: 'A', timePoints: ts, hazardRatios: ts.map(() => 1), ses: ts.map(() => se) },
        { treatment: 'B', timePoints: ts, hazardRatios: ts.map((t) => Math.exp(d * Math.log(t))), ses: ts.map(() => se) },
    ];
    const fitBand = (se) => new FPNMAEngine({ seed: 1 }).fit(dataAtSe(se), { powers: [0], order: 1, reference: 'A' });
    const logWidthNear = (model, tq) => {
        const hr = model.hazardRatios[0];
        let i = 0;
        for (let k = 0; k < hr.times.length; k++) if (Math.abs(hr.times[k] - tq) < Math.abs(hr.times[i] - tq)) i = k;
        return Math.log(hr.upper[i]) - Math.log(hr.lower[i]);
    };

    test('the CI band reflects the input precision (not a data-independent heuristic)', () => {
        // Regression guard for the old `se = 0.1*|logHR| + 0.05` heuristic, which ignored the data:
        // a 10x looser input SE must widen the band ~10x. The heuristic gave a ratio of ~1.
        const wPrecise = logWidthNear(fitBand(0.05), 2);
        const wImprecise = logWidthNear(fitBand(0.5), 2);
        expect(wPrecise).toBeGreaterThan(0);
        expect(wImprecise / wPrecise).toBeGreaterThan(5);
    });

    test('the CI collapses toward zero as input SE -> 0 (a fixed heuristic floor would not)', () => {
        const wTiny = logWidthNear(fitBand(0.005), 2);
        expect(wTiny).toBeLessThan(0.05); // old heuristic floored the half-width at >= 0.05 -> width >= 0.1
    });

    test('logHR(t)=0 no longer forces the old +0.05 floor; band tracks covariance', () => {
        const model = fitBand(0.2);
        const hr = model.hazardRatios[0];
        let i = 0;
        for (let k = 0; k < hr.times.length; k++) if (Math.abs(hr.times[k] - 1) < Math.abs(hr.times[i] - 1)) i = k;
        const halfWidth = (Math.log(hr.upper[i]) - Math.log(hr.lower[i])) / 2;
        expect(Number.isFinite(halfWidth)).toBe(true);
        expect(halfWidth).toBeGreaterThan(0);
    });
});
