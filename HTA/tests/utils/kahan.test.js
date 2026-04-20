/**
 * Tests for src/utils/kahan.js — KahanSum and NeumaierSum
 */

'use strict';

const { KahanSum, NeumaierSum } = require('../../src/utils/kahan');

// ---------------------------------------------------------------------------
// KahanSum
// ---------------------------------------------------------------------------
describe('KahanSum', () => {
    test('basic sum correctness: 1+2+3 = 6', () => {
        const ks = new KahanSum();
        ks.add(1);
        ks.add(2);
        ks.add(3);
        expect(ks.total()).toBe(6);
    });

    test('catastrophic cancellation: 1e16 + (-1e16) + 1 recovers the small addend', () => {
        // Kahan recovers small values added after large cancellation
        const ks = new KahanSum();
        ks.add(1e16);
        ks.add(-1e16);
        ks.add(1.0);
        expect(ks.total()).toBe(1.0);
    });

    test('Kahan loses precision when small value sandwiched between large (known limitation)', () => {
        // When 1.0 is added between 1e16 and -1e16, standard Kahan cannot recover it.
        // NeumaierSum handles this case correctly.
        const ks = new KahanSum();
        ks.add(1e16);
        ks.add(1.0);
        ks.add(-1e16);
        expect(ks.total()).toBe(0);
    });

    test('large-n accumulation: sum 10 million 0.1s closer to 1e6 than naive', () => {
        const N = 10_000_000;
        const ks = new KahanSum();
        let naive = 0;
        for (let i = 0; i < N; i++) {
            ks.add(0.1);
            naive += 0.1;
        }
        const expected = N * 0.1; // 1_000_000
        const kahanError = Math.abs(ks.total() - expected);
        const naiveError = Math.abs(naive - expected);
        expect(kahanError).toBeLessThan(naiveError);
    });

    test('static sum on arrays', () => {
        expect(KahanSum.sum([1, 2, 3, 4, 5])).toBe(15);
        expect(KahanSum.sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6, 14);
    });

    test('reset clears state', () => {
        const ks = new KahanSum();
        ks.add(42);
        expect(ks.total()).toBe(42);
        ks.reset();
        expect(ks.total()).toBe(0);
        ks.add(7);
        expect(ks.total()).toBe(7);
    });

    test('empty usage returns 0', () => {
        const ks = new KahanSum();
        expect(ks.total()).toBe(0);
    });

    test('static sum of empty array returns 0', () => {
        expect(KahanSum.sum([])).toBe(0);
    });

    test('negative values', () => {
        const ks = new KahanSum();
        ks.add(-5);
        ks.add(-3);
        ks.add(-2);
        expect(ks.total()).toBe(-10);
    });

    test('alternating signs: 1000 values of +/-1e-10 should be near 0', () => {
        const ks = new KahanSum();
        for (let i = 0; i < 1000; i++) {
            ks.add(i % 2 === 0 ? 1e-10 : -1e-10);
        }
        expect(Math.abs(ks.total())).toBeLessThan(1e-15);
    });

    test('mixed positive and negative values', () => {
        expect(KahanSum.sum([10, -3, 5, -12])).toBe(0);
    });

    test('single value', () => {
        const ks = new KahanSum();
        ks.add(3.14159);
        expect(ks.total()).toBe(3.14159);
    });
});

// ---------------------------------------------------------------------------
// NeumaierSum
// ---------------------------------------------------------------------------
describe('NeumaierSum', () => {
    test('basic sum correctness: 1+2+3 = 6', () => {
        const ns = new NeumaierSum();
        ns.add(1);
        ns.add(2);
        ns.add(3);
        expect(ns.total()).toBe(6);
    });

    test('catastrophic cancellation: 1e16 + 1 + (-1e16) should be 1', () => {
        const ns = new NeumaierSum();
        ns.add(1e16);
        ns.add(1.0);
        ns.add(-1e16);
        expect(ns.total()).toBe(1.0);
    });

    test('large-n accumulation: sum 10 million 0.1s closer to 1e6 than naive', () => {
        const N = 10_000_000;
        const ns = new NeumaierSum();
        let naive = 0;
        for (let i = 0; i < N; i++) {
            ns.add(0.1);
            naive += 0.1;
        }
        const expected = N * 0.1;
        const neumaierError = Math.abs(ns.total() - expected);
        const naiveError = Math.abs(naive - expected);
        expect(neumaierError).toBeLessThan(naiveError);
    });

    test('static sum on arrays', () => {
        expect(NeumaierSum.sum([1, 2, 3, 4, 5])).toBe(15);
        expect(NeumaierSum.sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6, 14);
    });

    test('reset clears state', () => {
        const ns = new NeumaierSum();
        ns.add(42);
        expect(ns.total()).toBe(42);
        ns.reset();
        expect(ns.total()).toBe(0);
        ns.add(7);
        expect(ns.total()).toBe(7);
    });

    test('empty usage returns 0', () => {
        const ns = new NeumaierSum();
        expect(ns.total()).toBe(0);
    });

    test('static sum of empty array returns 0', () => {
        expect(NeumaierSum.sum([])).toBe(0);
    });

    test('negative values', () => {
        const ns = new NeumaierSum();
        ns.add(-5);
        ns.add(-3);
        ns.add(-2);
        expect(ns.total()).toBe(-10);
    });

    test('alternating signs: 1000 values of +/-1e-10 should be near 0', () => {
        const ns = new NeumaierSum();
        for (let i = 0; i < 1000; i++) {
            ns.add(i % 2 === 0 ? 1e-10 : -1e-10);
        }
        expect(Math.abs(ns.total())).toBeLessThan(1e-15);
    });

    test('instance matches static for same values', () => {
        const values = [1e16, 1, -1e16, 3.14, -2.71, 0.001, -0.001];
        const ns = new NeumaierSum();
        for (const v of values) ns.add(v);
        expect(ns.total()).toBe(NeumaierSum.sum(values));
    });

    test('mixed positive and negative values', () => {
        expect(NeumaierSum.sum([10, -3, 5, -12])).toBe(0);
    });

    test('Neumaier handles case where addend > running sum', () => {
        // Triggers the else branch: |value| > |sum|
        const ns = new NeumaierSum();
        ns.add(1e-20);  // sum is tiny
        ns.add(1e16);   // addend much larger than sum
        ns.add(-1e16);
        expect(ns.total()).toBeCloseTo(1e-20, 30);
    });
});
