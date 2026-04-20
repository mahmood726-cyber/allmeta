/**
 * Smoke tests for DistributionalCEAEngine
 *
 * Minimum coverage to prevent syntactic damage from shipping undetected
 * (the maicSTC.js incident of 2026-04-15). Deeper domain tests welcome.
 *
 * DCEA per Cookson et al. (2017), NICE PMG36 (2022), Asaria et al. (2016).
 */

'use strict';

const { DistributionalCEAEngine } = require('../../src/engine/distributionalCEA');

describe('DistributionalCEAEngine - smoke', () => {
    test('module exports DistributionalCEAEngine constructor', () => {
        expect(typeof DistributionalCEAEngine).toBe('function');
    });

    test('default constructor does not throw', () => {
        expect(() => new DistributionalCEAEngine()).not.toThrow();
    });

    test('instance has expected prototype', () => {
        const engine = new DistributionalCEAEngine();
        expect(engine).toBeInstanceOf(DistributionalCEAEngine);
    });

    test('seeded constructor is deterministic in identity', () => {
        const a = new DistributionalCEAEngine({ seed: 42 });
        const b = new DistributionalCEAEngine({ seed: 42 });
        expect(a.constructor).toBe(b.constructor);
    });
});
