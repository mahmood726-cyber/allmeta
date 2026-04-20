/**
 * Tests for src/utils/pcg32.js — PCG32 PRNG
 */

'use strict';

const { PCG32 } = require('../../src/utils/pcg32');

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
describe('PCG32 determinism', () => {
    test('same seed produces identical 100-value sequence', () => {
        const rng1 = new PCG32(42);
        const rng2 = new PCG32(42);
        for (let i = 0; i < 100; i++) {
            expect(rng1.nextU32()).toBe(rng2.nextU32());
        }
    });

    test('different seeds produce different sequences', () => {
        const rng1 = new PCG32(1);
        const rng2 = new PCG32(2);
        const seq1 = [];
        const seq2 = [];
        for (let i = 0; i < 20; i++) {
            seq1.push(rng1.nextU32());
            seq2.push(rng2.nextU32());
        }
        // At least some values must differ
        const diffs = seq1.filter((v, i) => v !== seq2[i]).length;
        expect(diffs).toBeGreaterThan(0);
    });

    test('GOLDEN_SEQUENCE has 10 entries', () => {
        expect(PCG32.GOLDEN_SEQUENCE).toHaveLength(10);
    });

    test('verifyDeterminism returns true (golden sequence matches)', () => {
        expect(PCG32.verifyDeterminism()).toBe(true);
    });

    test('actual sequence from seed 12345 is deterministic', () => {
        const expected = [
            0.5309738010460006,
            0.5041090831311836,
            0.2835282705406984,
            0.07404825385109282,
            0.5390257852956575,
            0.8621436282890084,
            0.9612861097727017,
            0.8404628391714756,
            0.26532426339859483,
            0.40078457764130315
        ];
        const rng = new PCG32(12345);
        for (let i = 0; i < expected.length; i++) {
            expect(rng.nextDouble()).toBe(expected[i]);
        }
    });
});

// ---------------------------------------------------------------------------
// Basic generators
// ---------------------------------------------------------------------------
describe('PCG32 basic generators', () => {
    test('nextU32 returns 32-bit unsigned integers', () => {
        const rng = new PCG32(99);
        for (let i = 0; i < 100; i++) {
            const v = rng.nextU32();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(0xFFFFFFFF);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    test('nextFloat returns values in [0, 1)', () => {
        const rng = new PCG32(123);
        for (let i = 0; i < 1000; i++) {
            const v = rng.nextFloat();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('nextDouble returns values in [0, 1)', () => {
        const rng = new PCG32(456);
        for (let i = 0; i < 1000; i++) {
            const v = rng.nextDouble();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('nextInt(5, 15) stays in range over 1000 trials', () => {
        const rng = new PCG32(789);
        for (let i = 0; i < 1000; i++) {
            const v = rng.nextInt(5, 15);
            expect(v).toBeGreaterThanOrEqual(5);
            expect(v).toBeLessThanOrEqual(15);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    test('uniform(10, 20) in range', () => {
        const rng = new PCG32(321);
        for (let i = 0; i < 1000; i++) {
            const v = rng.uniform(10, 20);
            expect(v).toBeGreaterThanOrEqual(10);
            expect(v).toBeLessThanOrEqual(20);
        }
    });
});

// ---------------------------------------------------------------------------
// Distribution sampling
// ---------------------------------------------------------------------------
describe('PCG32 distributions', () => {
    test('normal(5, 2): mean ~5 and sd ~2 over 10000 samples', () => {
        const rng = new PCG32(1000);
        const samples = [];
        for (let i = 0; i < 10000; i++) {
            samples.push(rng.normal(5, 2));
        }
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
        const sd = Math.sqrt(variance);

        expect(mean).toBeCloseTo(5, 0);      // within 0.5
        expect(Math.abs(mean - 5)).toBeLessThan(0.3);
        expect(Math.abs(sd - 2)).toBeLessThan(0.3);
    });

    test('lognormal: always positive', () => {
        const rng = new PCG32(2000);
        for (let i = 0; i < 500; i++) {
            expect(rng.lognormal(0, 1)).toBeGreaterThan(0);
        }
    });

    test('gamma(2, 1): always positive', () => {
        const rng = new PCG32(3000);
        for (let i = 0; i < 500; i++) {
            expect(rng.gamma(2, 1)).toBeGreaterThan(0);
        }
    });

    test('gamma(0.5, 1): always positive (shape < 1 branch)', () => {
        const rng = new PCG32(3500);
        for (let i = 0; i < 500; i++) {
            expect(rng.gamma(0.5, 1)).toBeGreaterThan(0);
        }
    });

    test('beta(2, 5): in [0, 1]', () => {
        const rng = new PCG32(4000);
        for (let i = 0; i < 500; i++) {
            const v = rng.beta(2, 5);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    test('exponential: always positive', () => {
        const rng = new PCG32(5000);
        for (let i = 0; i < 500; i++) {
            expect(rng.exponential(1)).toBeGreaterThan(0);
        }
    });

    test('weibull: always positive', () => {
        const rng = new PCG32(6000);
        for (let i = 0; i < 500; i++) {
            expect(rng.weibull(2, 1)).toBeGreaterThan(0);
        }
    });

    test('triangular(1, 5, 10): in [1, 10]', () => {
        const rng = new PCG32(7000);
        for (let i = 0; i < 500; i++) {
            const v = rng.triangular(1, 5, 10);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(10);
        }
    });

    test('categorical([0.2, 0.3, 0.5]): indices in {0, 1, 2}', () => {
        const rng = new PCG32(8000);
        const counts = [0, 0, 0];
        for (let i = 0; i < 1000; i++) {
            const idx = rng.categorical([0.2, 0.3, 0.5]);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThanOrEqual(2);
            counts[idx]++;
        }
        // All categories should be hit
        expect(counts[0]).toBeGreaterThan(0);
        expect(counts[1]).toBeGreaterThan(0);
        expect(counts[2]).toBeGreaterThan(0);
        // Rough proportion check (within 10%)
        expect(counts[0] / 1000).toBeCloseTo(0.2, 1);
        expect(counts[1] / 1000).toBeCloseTo(0.3, 1);
        expect(counts[2] / 1000).toBeCloseTo(0.5, 1);
    });
});

// ---------------------------------------------------------------------------
// sample() dispatch
// ---------------------------------------------------------------------------
describe('PCG32 sample()', () => {
    let rng;
    beforeEach(() => {
        rng = new PCG32(9999);
    });

    test('fixed/constant returns the value', () => {
        expect(rng.sample({ type: 'fixed', value: 42 })).toBe(42);
        expect(rng.sample({ type: 'constant', value: 7 })).toBe(7);
    });

    test('normal dispatches correctly', () => {
        const v = rng.sample({ type: 'normal', mean: 10, sd: 1 });
        expect(typeof v).toBe('number');
        expect(isFinite(v)).toBe(true);
    });

    test('gaussian alias works', () => {
        const v = rng.sample({ type: 'gaussian', mean: 0, sd: 1 });
        expect(typeof v).toBe('number');
    });

    test('lognormal dispatches correctly', () => {
        const v = rng.sample({ type: 'lognormal', meanlog: 0, sdlog: 0.5 });
        expect(v).toBeGreaterThan(0);
    });

    test('beta dispatches correctly', () => {
        const v = rng.sample({ type: 'beta', alpha: 2, beta: 5 });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
    });

    test('gamma dispatches correctly', () => {
        const v = rng.sample({ type: 'gamma', shape: 2, scale: 1 });
        expect(v).toBeGreaterThan(0);
    });

    test('uniform dispatches correctly', () => {
        const v = rng.sample({ type: 'uniform', min: 5, max: 10 });
        expect(v).toBeGreaterThanOrEqual(5);
        expect(v).toBeLessThanOrEqual(10);
    });

    test('triangular dispatches correctly', () => {
        const v = rng.sample({ type: 'triangular', min: 0, mode: 5, max: 10 });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(10);
    });

    test('exponential dispatches correctly', () => {
        const v = rng.sample({ type: 'exponential', rate: 2 });
        expect(v).toBeGreaterThan(0);
    });

    test('weibull dispatches correctly', () => {
        const v = rng.sample({ type: 'weibull', shape: 2, scale: 3 });
        expect(v).toBeGreaterThan(0);
    });

    test('throws on null dist', () => {
        expect(() => rng.sample(null)).toThrow('Invalid distribution specification');
    });

    test('throws on undefined dist', () => {
        expect(() => rng.sample(undefined)).toThrow('Invalid distribution specification');
    });

    test('throws on missing type', () => {
        expect(() => rng.sample({ mean: 5 })).toThrow('Invalid distribution specification');
    });

    test('throws on unknown distribution type', () => {
        expect(() => rng.sample({ type: 'poisson', lambda: 3 })).toThrow('Unknown distribution type: poisson');
    });
});

// ---------------------------------------------------------------------------
// State save / restore
// ---------------------------------------------------------------------------
describe('PCG32 state management', () => {
    test('getState/setState: save after 50 calls, restore, next value matches', () => {
        const rng = new PCG32(42);

        // Advance 50 steps
        for (let i = 0; i < 50; i++) rng.nextU32();

        // Save state
        const savedState = rng.getState();

        // Generate next 10 values
        const expected = [];
        for (let i = 0; i < 10; i++) {
            expected.push(rng.nextU32());
        }

        // Restore state
        rng.setState(savedState);

        // Generate again — must match
        for (let i = 0; i < 10; i++) {
            expect(rng.nextU32()).toBe(expected[i]);
        }
    });

    test('getState returns serializable object with string bigints', () => {
        const rng = new PCG32(42);
        const state = rng.getState();
        expect(typeof state.state).toBe('string');
        expect(typeof state.inc).toBe('string');
        // Should be parseable as BigInt
        expect(() => BigInt(state.state)).not.toThrow();
        expect(() => BigInt(state.inc)).not.toThrow();
    });

    test('setState with another instance state produces same sequence', () => {
        const rng1 = new PCG32(100);
        for (let i = 0; i < 20; i++) rng1.nextU32();
        const state = rng1.getState();

        const rng2 = new PCG32(999); // different seed
        rng2.setState(state);

        for (let i = 0; i < 50; i++) {
            expect(rng2.nextU32()).toBe(rng1.nextU32());
        }
    });
});

// ---------------------------------------------------------------------------
// Seed method
// ---------------------------------------------------------------------------
describe('PCG32 seed()', () => {
    test('re-seeding resets the sequence', () => {
        const rng = new PCG32(42);
        const first10 = [];
        for (let i = 0; i < 10; i++) first10.push(rng.nextU32());

        // Advance further
        for (let i = 0; i < 100; i++) rng.nextU32();

        // Re-seed with same value
        rng.seed(42n);
        const second10 = [];
        for (let i = 0; i < 10; i++) second10.push(rng.nextU32());

        expect(second10).toEqual(first10);
    });
});
