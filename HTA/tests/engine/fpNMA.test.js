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
