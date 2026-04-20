/**
 * Smoke tests for WinRatioEngine
 *
 * Minimum coverage to prevent syntactic damage from shipping undetected
 * (the maicSTC.js incident of 2026-04-15). Deeper domain tests welcome.
 *
 * Win Ratio per Pocock et al. (2012), Buyse (2010), Dong et al. (2018).
 */

'use strict';

const { WinRatioEngine, normalCDF, normalQuantile } = require('../../src/engine/winRatio');

describe('WinRatioEngine - smoke', () => {
    test('module exports WinRatioEngine constructor', () => {
        expect(typeof WinRatioEngine).toBe('function');
    });

    test('default constructor does not throw', () => {
        expect(() => new WinRatioEngine()).not.toThrow();
    });

    test('instance has expected prototype', () => {
        const engine = new WinRatioEngine();
        expect(engine).toBeInstanceOf(WinRatioEngine);
    });

    test('normalCDF(0) equals 0.5 within tolerance', () => {
        expect(Math.abs(normalCDF(0) - 0.5)).toBeLessThan(1e-6);
    });

    test('normalQuantile(0.5) equals 0 within tolerance', () => {
        expect(Math.abs(normalQuantile(0.5))).toBeLessThan(1e-6);
    });

    test('accepts custom confidence level', () => {
        const engine = new WinRatioEngine({ confidenceLevel: 0.99 });
        expect(engine).toBeInstanceOf(WinRatioEngine);
    });
});
