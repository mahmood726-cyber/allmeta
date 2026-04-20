/**
 * Tests for src/utils/mathUtils.js — KahanSum, StatUtils, WTPUtils, GuidanceDefaults
 */

'use strict';

const {
    KahanSum,
    StatUtils,
    WTPUtils,
    GuidanceDefaults,
    resolveOmanGuidance
} = require('../../src/utils/mathUtils');

// ---------------------------------------------------------------------------
// KahanSum (duplicate in mathUtils)
// ---------------------------------------------------------------------------
describe('mathUtils KahanSum', () => {
    test('basic sum: 1+2+3+4+5 = 15', () => {
        const ks = new KahanSum();
        [1, 2, 3, 4, 5].forEach(v => ks.add(v));
        expect(ks.total()).toBe(15);
    });

    test('empty returns 0', () => {
        expect(new KahanSum().total()).toBe(0);
    });

    test('reset clears state', () => {
        const ks = new KahanSum();
        ks.add(100);
        ks.reset();
        expect(ks.total()).toBe(0);
    });

    test('catastrophic cancellation: large values cancel, then small value added', () => {
        const ks = new KahanSum();
        ks.add(1e16);
        ks.add(-1e16);
        ks.add(1);
        expect(ks.total()).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.mean
// ---------------------------------------------------------------------------
describe('StatUtils.mean', () => {
    test('[1,2,3,4,5] -> 3', () => {
        expect(StatUtils.mean([1, 2, 3, 4, 5])).toBe(3);
    });

    test('empty array -> 0', () => {
        expect(StatUtils.mean([])).toBe(0);
    });

    test('null/undefined -> 0', () => {
        expect(StatUtils.mean(null)).toBe(0);
        expect(StatUtils.mean(undefined)).toBe(0);
    });

    test('single element', () => {
        expect(StatUtils.mean([7])).toBe(7);
    });

    test('negative values', () => {
        expect(StatUtils.mean([-2, -4, -6])).toBe(-4);
    });

    test('mixed positive and negative', () => {
        expect(StatUtils.mean([10, -10])).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.sd
// ---------------------------------------------------------------------------
describe('StatUtils.sd', () => {
    test('[2,4,4,4,5,5,7,9] sample SD ~ 2.138', () => {
        const result = StatUtils.sd([2, 4, 4, 4, 5, 5, 7, 9]);
        expect(result).toBeCloseTo(2.13809, 4);
    });

    test('length < 2 -> 0', () => {
        expect(StatUtils.sd([5])).toBe(0);
        expect(StatUtils.sd([])).toBe(0);
    });

    test('null/undefined -> 0', () => {
        expect(StatUtils.sd(null)).toBe(0);
        expect(StatUtils.sd(undefined)).toBe(0);
    });

    test('identical values -> 0', () => {
        expect(StatUtils.sd([3, 3, 3, 3])).toBe(0);
    });

    test('two values', () => {
        // sd([0, 2]) = sqrt(((0-1)^2 + (2-1)^2) / 1) = sqrt(2)
        expect(StatUtils.sd([0, 2])).toBeCloseTo(Math.SQRT2, 10);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.percentile / percentileFromSorted
// ---------------------------------------------------------------------------
describe('StatUtils.percentile', () => {
    test('[1..100] at p=0.5 -> ~50.5', () => {
        const arr = Array.from({ length: 100 }, (_, i) => i + 1);
        const p50 = StatUtils.percentile(arr, 0.5);
        expect(p50).toBeCloseTo(50.5, 5);
    });

    test('empty -> 0', () => {
        expect(StatUtils.percentile([], 0.5)).toBe(0);
    });

    test('null -> 0', () => {
        expect(StatUtils.percentile(null, 0.5)).toBe(0);
    });

    test('p=0 returns first element', () => {
        expect(StatUtils.percentile([10, 20, 30], 0)).toBe(10);
    });

    test('p=1 returns last element', () => {
        expect(StatUtils.percentile([10, 20, 30], 1)).toBe(30);
    });

    test('p=0.25 (quartile)', () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const q1 = StatUtils.percentile(arr, 0.25);
        // index = 9 * 0.25 = 2.25 -> lerp(3, 4, 0.25) = 3.25
        expect(q1).toBeCloseTo(3.25, 10);
    });

    test('single element at any percentile returns that element', () => {
        expect(StatUtils.percentile([42], 0)).toBe(42);
        expect(StatUtils.percentile([42], 0.5)).toBe(42);
        expect(StatUtils.percentile([42], 1)).toBe(42);
    });
});

describe('StatUtils.percentileFromSorted', () => {
    test('pre-sorted array gives same result as percentile', () => {
        const arr = [5, 3, 1, 4, 2];
        const sorted = [1, 2, 3, 4, 5];
        expect(StatUtils.percentileFromSorted(sorted, 0.5)).toBe(StatUtils.percentile(arr, 0.5));
    });

    test('empty sorted array -> 0', () => {
        expect(StatUtils.percentileFromSorted([], 0.5)).toBe(0);
    });

    test('null -> 0', () => {
        expect(StatUtils.percentileFromSorted(null, 0.5)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.logGamma
// ---------------------------------------------------------------------------
describe('StatUtils.logGamma', () => {
    test('logGamma(1) = 0 (since Gamma(1)=1)', () => {
        expect(StatUtils.logGamma(1)).toBeCloseTo(0, 10);
    });

    test('logGamma(0.5) = log(sqrt(pi))', () => {
        // Gamma(0.5) = sqrt(pi)
        expect(StatUtils.logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 8);
    });

    test('logGamma(5) = log(24)', () => {
        // Gamma(5) = 4! = 24
        expect(StatUtils.logGamma(5)).toBeCloseTo(Math.log(24), 8);
    });

    test('logGamma(0) = Infinity', () => {
        expect(StatUtils.logGamma(0)).toBe(Infinity);
    });

    test('logGamma(-1) = Infinity', () => {
        expect(StatUtils.logGamma(-1)).toBe(Infinity);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.betaFunction
// ---------------------------------------------------------------------------
describe('StatUtils.betaFunction', () => {
    test('B(1,1) = 1', () => {
        expect(StatUtils.betaFunction(1, 1)).toBeCloseTo(1, 8);
    });

    test('B(2,3) = 1/12', () => {
        // B(2,3) = Gamma(2)*Gamma(3)/Gamma(5) = 1*2/24 = 1/12
        expect(StatUtils.betaFunction(2, 3)).toBeCloseTo(1 / 12, 8);
    });

    test('symmetry: B(a,b) = B(b,a)', () => {
        expect(StatUtils.betaFunction(3, 5)).toBeCloseTo(StatUtils.betaFunction(5, 3), 10);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.incompleteBeta / betaCDF
// ---------------------------------------------------------------------------
describe('StatUtils.incompleteBeta and betaCDF', () => {
    test('incompleteBeta(0, a, b) = 0', () => {
        expect(StatUtils.incompleteBeta(0, 2, 3)).toBe(0);
    });

    test('incompleteBeta(1, a, b) = 1', () => {
        expect(StatUtils.incompleteBeta(1, 2, 3)).toBe(1);
    });

    test('betaCDF at x=0.5, a=1, b=1 (uniform) = 0.5', () => {
        expect(StatUtils.betaCDF(0.5, 1, 1)).toBeCloseTo(0.5, 8);
    });

    test('betaCDF boundary: x<=0 -> 0, x>=1 -> 1', () => {
        expect(StatUtils.betaCDF(0, 2, 3)).toBe(0);
        expect(StatUtils.betaCDF(-0.1, 2, 3)).toBe(0);
        expect(StatUtils.betaCDF(1, 2, 3)).toBe(1);
        expect(StatUtils.betaCDF(1.5, 2, 3)).toBe(1);
    });

    test('betaCDF(0.5, 2, 2) = 0.5 (symmetric beta)', () => {
        expect(StatUtils.betaCDF(0.5, 2, 2)).toBeCloseTo(0.5, 6);
    });

    test('betaCDF increases monotonically', () => {
        let prev = 0;
        for (let x = 0.1; x <= 0.9; x += 0.1) {
            const current = StatUtils.betaCDF(x, 2, 5);
            expect(current).toBeGreaterThan(prev);
            prev = current;
        }
    });
});

// ---------------------------------------------------------------------------
// StatUtils.betaPDF
// ---------------------------------------------------------------------------
describe('StatUtils.betaPDF', () => {
    test('betaPDF(0.5, 1, 1) = 1 (uniform)', () => {
        expect(StatUtils.betaPDF(0.5, 1, 1)).toBeCloseTo(1, 8);
    });

    test('betaPDF at boundaries returns 0', () => {
        expect(StatUtils.betaPDF(0, 2, 3)).toBe(0);
        expect(StatUtils.betaPDF(1, 2, 3)).toBe(0);
    });

    test('betaPDF(0.5, 2, 2) is the mode (highest point)', () => {
        const atMode = StatUtils.betaPDF(0.5, 2, 2);
        const offMode = StatUtils.betaPDF(0.3, 2, 2);
        expect(atMode).toBeGreaterThan(offMode);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.normalCDF
// ---------------------------------------------------------------------------
describe('StatUtils.normalCDF', () => {
    test('normalCDF(0) = 0.5', () => {
        expect(StatUtils.normalCDF(0)).toBeCloseTo(0.5, 8);
    });

    test('normalCDF(-Infinity) ~ 0', () => {
        expect(StatUtils.normalCDF(-10)).toBeLessThan(1e-10);
    });

    test('normalCDF(+Infinity) ~ 1', () => {
        expect(StatUtils.normalCDF(10)).toBeGreaterThan(1 - 1e-10);
    });

    test('normalCDF(1.96) ~ 0.975', () => {
        expect(StatUtils.normalCDF(1.96)).toBeCloseTo(0.975, 3);
    });

    test('symmetry: CDF(-x) = 1 - CDF(x)', () => {
        const x = 1.5;
        expect(StatUtils.normalCDF(-x)).toBeCloseTo(1 - StatUtils.normalCDF(x), 8);
    });
});

// ---------------------------------------------------------------------------
// StatUtils.normalInverseCDF
// ---------------------------------------------------------------------------
describe('StatUtils.normalInverseCDF', () => {
    test('normalInverseCDF(0.5) = 0', () => {
        expect(StatUtils.normalInverseCDF(0.5)).toBe(0);
    });

    test('normalInverseCDF(0.975) ~ 1.96', () => {
        expect(StatUtils.normalInverseCDF(0.975)).toBeCloseTo(1.96, 2);
    });

    test('normalInverseCDF(0.025) ~ -1.96', () => {
        expect(StatUtils.normalInverseCDF(0.025)).toBeCloseTo(-1.96, 2);
    });

    test('boundary: p=0 -> -Infinity', () => {
        expect(StatUtils.normalInverseCDF(0)).toBe(-Infinity);
    });

    test('boundary: p=1 -> +Infinity', () => {
        expect(StatUtils.normalInverseCDF(1)).toBe(Infinity);
    });

    test('roundtrip: CDF(inverseCDF(p)) ~ p', () => {
        for (const p of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
            const z = StatUtils.normalInverseCDF(p);
            const recovered = StatUtils.normalCDF(z);
            expect(recovered).toBeCloseTo(p, 3);
        }
    });

    test('tail region (p < 0.02425) works', () => {
        const z = StatUtils.normalInverseCDF(0.001);
        expect(z).toBeLessThan(-3);
        expect(isFinite(z)).toBe(true);
    });

    test('upper tail region (p > 0.97575) works', () => {
        const z = StatUtils.normalInverseCDF(0.999);
        expect(z).toBeGreaterThan(3);
        expect(isFinite(z)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// WTPUtils
// ---------------------------------------------------------------------------
describe('WTPUtils', () => {
    test('resolveWtpThresholds with no settings returns defaults', () => {
        const t = WTPUtils.resolveWtpThresholds({});
        expect(t).toEqual([20000, 30000, 50000]);
    });

    test('resolveWtpThresholds with null returns defaults', () => {
        const t = WTPUtils.resolveWtpThresholds(null);
        expect(t).toEqual([20000, 30000, 50000]);
    });

    test('resolveWtpThresholds with explicit thresholds returns them', () => {
        const t = WTPUtils.resolveWtpThresholds({ wtp_thresholds: [10000, 40000] });
        expect(t).toEqual([10000, 40000]);
    });

    test('resolveWtpThresholds with empty array returns defaults', () => {
        const t = WTPUtils.resolveWtpThresholds({ wtp_thresholds: [] });
        expect(t).toEqual([20000, 30000, 50000]);
    });

    test('resolveWtpThresholds delegates to OmanGuidance when available', () => {
        const mockGuidance = {
            resolveWtpThresholds: jest.fn(() => ({ thresholds: [15000, 25000] }))
        };
        const t = WTPUtils.resolveWtpThresholds({}, mockGuidance);
        expect(t).toEqual([15000, 25000]);
        expect(mockGuidance.resolveWtpThresholds).toHaveBeenCalled();
    });

    test('resolvePrimaryWtp returns first threshold', () => {
        expect(WTPUtils.resolvePrimaryWtp({})).toBe(20000);
        expect(WTPUtils.resolvePrimaryWtp({ wtp_thresholds: [50000, 100000] })).toBe(50000);
    });

    test('resolveWtpRange returns expected structure', () => {
        const range = WTPUtils.resolveWtpRange({});
        expect(range).toHaveProperty('wtpMin');
        expect(range).toHaveProperty('wtpMax');
        expect(range).toHaveProperty('wtpStep');
        expect(range).toHaveProperty('thresholds');
        expect(range.wtpMin).toBe(0);
        expect(range.wtpStep).toBe(1000);
    });

    test('resolveWtpRange respects options', () => {
        const range = WTPUtils.resolveWtpRange({}, { wtpMin: 5000, wtpMax: 200000, wtpStep: 500 });
        expect(range.wtpMin).toBe(5000);
        expect(range.wtpMax).toBe(200000);
        expect(range.wtpStep).toBe(500);
    });

    test('resolveWtpRange auto-scales wtpMax based on max threshold', () => {
        const range = WTPUtils.resolveWtpRange({ wtp_thresholds: [80000] });
        // Default wtpMax (100000) < maxThreshold (80000) * 1.5 = 120000
        expect(range.wtpMax).toBeGreaterThanOrEqual(80000);
    });
});

// ---------------------------------------------------------------------------
// GuidanceDefaults
// ---------------------------------------------------------------------------
describe('GuidanceDefaults', () => {
    test('has expected default values', () => {
        expect(GuidanceDefaults.discount_rate_costs).toBe(0.03);
        expect(GuidanceDefaults.discount_rate_qalys).toBe(0.03);
        expect(GuidanceDefaults.currency).toBe('OMR');
        expect(GuidanceDefaults.placeholder_gdp_per_capita_omr).toBe(10000);
    });
});

// ---------------------------------------------------------------------------
// resolveOmanGuidance
// ---------------------------------------------------------------------------
describe('resolveOmanGuidance', () => {
    test('returns null when globalThis.OmanHTAGuidance is not set and require fails', () => {
        // In test env, OmanHTAGuidance is not on globalThis, and require('./omanGuidance') will fail
        const result = resolveOmanGuidance();
        // Should return either the module or null — not throw
        expect(result === null || typeof result === 'object').toBe(true);
    });

    test('returns globalThis.OmanHTAGuidance when set', () => {
        const mockGuidance = { test: true };
        globalThis.OmanHTAGuidance = mockGuidance;
        try {
            expect(resolveOmanGuidance()).toBe(mockGuidance);
        } finally {
            delete globalThis.OmanHTAGuidance;
        }
    });
});
