/**
 * Tests for src/engine/performanceWrapper.js
 */

'use strict';

const {
    FastMath,
    OptimizedAlgorithms,
    accelerate,
    BatchProcessor,
    LazyComputation,
    Environment
} = require('../../src/engine/performanceWrapper');

// ---------------------------------------------------------------------------
// FastMath
// ---------------------------------------------------------------------------

describe('FastMath', () => {
    test('normCDF(0) = 0.5', () => {
        expect(FastMath.normCDF(0)).toBeCloseTo(0.5, 8);
    });

    test('normCDF is symmetric: normCDF(-x) = 1 - normCDF(x)', () => {
        for (const x of [0.5, 1, 1.96, 2.5]) {
            expect(FastMath.normCDF(-x)).toBeCloseTo(1 - FastMath.normCDF(x), 5);
        }
    });

    test('normCDF(1.96) ~ 0.975', () => {
        expect(FastMath.normCDF(1.96)).toBeCloseTo(0.975, 2);
    });

    test('normQuantile(0.975) ~ 1.96', () => {
        expect(FastMath.normQuantile(0.975)).toBeCloseTo(1.96, 2);
    });

    test('normQuantile(0.5) ~ 0', () => {
        expect(FastMath.normQuantile(0.5)).toBeCloseTo(0, 4);
    });

    test('normQuantile handles extreme tails', () => {
        const low = FastMath.normQuantile(0.001);
        expect(low).toBeLessThan(-3);

        const high = FastMath.normQuantile(0.999);
        expect(high).toBeGreaterThan(3);
    });

    test('lgamma(1) = 0', () => {
        expect(FastMath.lgamma(1)).toBeCloseTo(0, 6);
    });

    test('lgamma(0.5) = log(sqrt(pi))', () => {
        expect(FastMath.lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 4);
    });

    test('lbeta(a,b) = lgamma(a) + lgamma(b) - lgamma(a+b)', () => {
        const a = 2, b = 3;
        expect(FastMath.lbeta(a, b)).toBeCloseTo(
            FastMath.lgamma(a) + FastMath.lgamma(b) - FastMath.lgamma(a + b), 8
        );
    });

    test('chiSquaredCDF returns 0 for x <= 0', () => {
        expect(FastMath.chiSquaredCDF(0, 5)).toBe(0);
        expect(FastMath.chiSquaredCDF(-1, 5)).toBe(0);
    });

    test('chiSquaredCDF(3.84, 1) ~ 0.95', () => {
        expect(FastMath.chiSquaredCDF(3.84, 1)).toBeCloseTo(0.95, 1);
    });

    test('tQuantile(0.975, 1000) ~ normQuantile(0.975)', () => {
        // For large df, t approaches normal
        const tq = FastMath.tQuantile(0.975, 1000);
        const nq = FastMath.normQuantile(0.975);
        expect(tq).toBeCloseTo(nq, 1);
    });

    test('tQuantile(0.975, 2) > tQuantile(0.975, 30)', () => {
        const t2 = FastMath.tQuantile(0.975, 2);
        const t30 = FastMath.tQuantile(0.975, 30);
        expect(t2).toBeGreaterThan(t30);
    });

    test('tCDF(0, df) = 0.5', () => {
        expect(FastMath.tCDF(0, 5)).toBeCloseTo(0.5, 3);
        expect(FastMath.tCDF(0, 30)).toBeCloseTo(0.5, 3);
    });

    test('_gammainc returns 0 for x=0', () => {
        expect(FastMath._gammainc(2, 0)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// OptimizedAlgorithms - DerSimonian-Laird
// ---------------------------------------------------------------------------

describe('OptimizedAlgorithms - DerSimonian-Laird', () => {
    test('returns zeros for empty input', () => {
        const result = OptimizedAlgorithms.derSimonianLaird([], []);
        expect(result.effect).toBe(0);
        expect(result.se).toBe(0);
        expect(result.tau2).toBe(0);
    });

    test('returns study value for single study', () => {
        const result = OptimizedAlgorithms.derSimonianLaird([0.5], [0.04]);
        expect(result.effect).toBe(0.5);
    });

    test('produces valid meta-analysis for multiple studies', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.04, 0.16, 0.09];

        const result = OptimizedAlgorithms.derSimonianLaird(effects, variances);

        expect(result.effect).toBeGreaterThan(0.2);
        expect(result.effect).toBeLessThan(0.8);
        expect(result.se).toBeGreaterThan(0);
        expect(result.tau2).toBeGreaterThanOrEqual(0);
        expect(result.I2).toBeGreaterThanOrEqual(0);
        expect(result.I2).toBeLessThanOrEqual(100);
        expect(result.ci[0]).toBeLessThan(result.effect);
        expect(result.ci[1]).toBeGreaterThan(result.effect);
    });

    test('HKSJ adjustment is applied by default', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.04, 0.16, 0.09];

        const result = OptimizedAlgorithms.derSimonianLaird(effects, variances);
        expect(result.adjustment).toBe('HKSJ');
    });

    test('HKSJ can be disabled', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.04, 0.16, 0.09];

        const result = OptimizedAlgorithms.derSimonianLaird(effects, variances, { hksj: false });
        expect(result.adjustment).toBe('none');
    });

    test('prediction interval requires >= 3 studies', () => {
        const effects2 = [0.3, 0.5];
        const variances2 = [0.04, 0.09];
        const result2 = OptimizedAlgorithms.derSimonianLaird(effects2, variances2);
        expect(result2.predictionInterval.lower).toBeNull();

        const effects3 = [0.3, 0.5, 0.7];
        const variances3 = [0.04, 0.09, 0.04];
        const result3 = OptimizedAlgorithms.derSimonianLaird(effects3, variances3);
        expect(result3.predictionInterval.lower).not.toBeNull();
    });

    test('I2 CI is computed', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.04, 0.16, 0.09];

        const result = OptimizedAlgorithms.derSimonianLaird(effects, variances);
        expect(result.I2CI).toBeDefined();
        expect(result.I2CI.lower).toBeGreaterThanOrEqual(0);
        expect(result.I2CI.upper).toBeLessThanOrEqual(100);
    });

    test('handles zero variance studies gracefully', () => {
        const effects = [0.5, 0.5];
        const variances = [0, 0.01];

        // Should not throw
        const result = OptimizedAlgorithms.derSimonianLaird(effects, variances);
        expect(Number.isFinite(result.effect)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// OptimizedAlgorithms - REML
// ---------------------------------------------------------------------------

describe('OptimizedAlgorithms - REML', () => {
    test('returns zeros for empty input', () => {
        const result = OptimizedAlgorithms.reml([], []);
        expect(result.effect).toBe(0);
    });

    test('REML converges and returns valid result', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.04, 0.16, 0.09];

        const result = OptimizedAlgorithms.reml(effects, variances);

        expect(result.method).toBe('REML');
        expect(result.effect).toBeGreaterThan(0);
        expect(result.se).toBeGreaterThan(0);
        expect(result.tau2).toBeGreaterThanOrEqual(0);
        expect(result.ci[0]).toBeLessThan(result.effect);
        expect(result.ci[1]).toBeGreaterThan(result.effect);
    });

    test('REML and DL give similar pooled effects', () => {
        const effects = [0.3, 0.5, 0.7, 0.4, 0.6];
        const variances = [0.04, 0.09, 0.04, 0.16, 0.09];

        const dl = OptimizedAlgorithms.derSimonianLaird(effects, variances, { hksj: false });
        const reml = OptimizedAlgorithms.reml(effects, variances, { hksj: false });

        expect(reml.effect).toBeCloseTo(dl.effect, 1);
    });
});

// ---------------------------------------------------------------------------
// OptimizedAlgorithms - Kaplan-Meier
// ---------------------------------------------------------------------------

describe('OptimizedAlgorithms - Kaplan-Meier', () => {
    test('survival starts at 1 and decreases', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1];

        const result = OptimizedAlgorithms.kaplanMeier(times, events);

        expect(result.survival[0]).toBeLessThanOrEqual(1);
        for (let i = 1; i < result.survival.length; i++) {
            expect(result.survival[i]).toBeLessThanOrEqual(result.survival[i - 1] + 1e-10);
        }
    });

    test('all survival values are non-negative', () => {
        const times = [1, 2, 3, 4, 5];
        const events = [1, 1, 1, 1, 1];

        const result = OptimizedAlgorithms.kaplanMeier(times, events);
        for (const s of result.survival) {
            expect(s).toBeGreaterThanOrEqual(0);
        }
    });

    test('nRisk decreases over time', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 1, 1, 0, 1, 0, 1, 1, 0, 1];

        const result = OptimizedAlgorithms.kaplanMeier(times, events);
        for (let i = 1; i < result.nRisk.length; i++) {
            expect(result.nRisk[i]).toBeLessThanOrEqual(result.nRisk[i - 1]);
        }
    });

    test('SE is computed via Greenwood formula', () => {
        const times = [1, 2, 3, 4, 5];
        const events = [1, 1, 1, 1, 1];

        const result = OptimizedAlgorithms.kaplanMeier(times, events);
        for (const se of result.se) {
            expect(se).toBeGreaterThanOrEqual(0);
        }
    });

    test('CI bounds are within [0, 1]', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const events = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1];

        const result = OptimizedAlgorithms.kaplanMeier(times, events);
        for (let i = 0; i < result.ciLower.length; i++) {
            expect(result.ciLower[i]).toBeGreaterThanOrEqual(0);
            expect(result.ciUpper[i]).toBeLessThanOrEqual(1);
        }
    });

    test('no events produces empty result', () => {
        const times = [1, 2, 3, 4, 5];
        const events = [0, 0, 0, 0, 0];

        const result = OptimizedAlgorithms.kaplanMeier(times, events);
        expect(result.times.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// OptimizedAlgorithms - Cholesky
// ---------------------------------------------------------------------------

describe('OptimizedAlgorithms - Cholesky', () => {
    test('decomposes 2x2 positive definite matrix', () => {
        // A = [4, 2; 2, 3]
        const A = new Float64Array([4, 2, 2, 3]);
        const L = OptimizedAlgorithms.cholesky(A, 2);

        // L[0] = sqrt(4) = 2
        expect(L[0]).toBeCloseTo(2, 8);
        // L[2] = 2/2 = 1
        expect(L[2]).toBeCloseTo(1, 8);
        // L[3] = sqrt(3-1) = sqrt(2)
        expect(L[3]).toBeCloseTo(Math.sqrt(2), 6);
    });
});

// ---------------------------------------------------------------------------
// accelerate wrapper
// ---------------------------------------------------------------------------

describe('accelerate', () => {
    test('wraps a class and adds vector operations', () => {
        class DummyClass {
            constructor() { this.value = 42; }
        }

        const AcceleratedDummy = accelerate(DummyClass);
        const instance = new AcceleratedDummy();

        expect(instance.value).toBe(42);
        expect(typeof instance.vectorSum).toBe('function');
        expect(typeof instance.vectorMean).toBe('function');
        expect(typeof instance.vectorVariance).toBe('function');
        expect(typeof instance.vectorAdd).toBe('function');
        expect(typeof instance.vectorMul).toBe('function');
        expect(typeof instance.vectorDot).toBe('function');
    });

    test('vectorSum computes correct sum', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        const arr = new Float64Array([1, 2, 3, 4, 5]);
        expect(inst.vectorSum(arr)).toBeCloseTo(15, 10);
    });

    test('vectorMean computes correct mean', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        const arr = new Float64Array([2, 4, 6, 8]);
        expect(inst.vectorMean(arr)).toBeCloseTo(5, 10);
    });

    test('vectorMean returns 0 for empty array', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        expect(inst.vectorMean(new Float64Array([]))).toBe(0);
    });

    test('vectorVariance computes sample variance', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        // Var of [2, 4, 6, 8] = 6.6667 (sample variance with Bessel)
        const arr = new Float64Array([2, 4, 6, 8]);
        expect(inst.vectorVariance(arr)).toBeCloseTo(20 / 3, 4);
    });

    test('vectorVariance returns 0 for single element', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        expect(inst.vectorVariance(new Float64Array([5]))).toBe(0);
    });

    test('vectorDot computes dot product', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([4, 5, 6]);
        expect(inst.vectorDot(a, b)).toBeCloseTo(32, 10);
    });

    test('vectorAdd element-wise adds two arrays', () => {
        class Base {}
        const Accel = accelerate(Base);
        const inst = new Accel();

        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([4, 5, 6]);
        const c = inst.vectorAdd(a, b);
        expect(c[0]).toBeCloseTo(5, 10);
        expect(c[1]).toBeCloseTo(7, 10);
        expect(c[2]).toBeCloseTo(9, 10);
    });
});

// ---------------------------------------------------------------------------
// BatchProcessor
// ---------------------------------------------------------------------------

describe('BatchProcessor', () => {
    test('processBatches splits items into batches', async () => {
        const bp = new BatchProcessor({ batchSize: 3, concurrency: 1 });
        const items = [1, 2, 3, 4, 5, 6, 7];

        const results = await bp.processBatches(items, async (batch) => batch.length);

        // Should have 3 batches: [1,2,3], [4,5,6], [7]
        expect(results.length).toBe(3);
        expect(results[0]).toBe(3);
        expect(results[2]).toBe(1);
    });

    test('mapReduce applies mapper and reducer', async () => {
        const bp = new BatchProcessor({ batchSize: 5, concurrency: 1 });
        const items = [1, 2, 3, 4, 5];

        const sum = await bp.mapReduce(items, x => x * 2, (a, b) => a + b, 0);
        expect(sum).toBe(30);
    });
});

// ---------------------------------------------------------------------------
// LazyComputation
// ---------------------------------------------------------------------------

describe('LazyComputation', () => {
    test('defers computation until value is accessed', () => {
        let computed = false;
        const lazy = LazyComputation.defer(() => {
            computed = true;
            return 42;
        });

        expect(computed).toBe(false);
        expect(lazy.value).toBe(42);
        expect(computed).toBe(true);
    });

    test('caches result on second access', () => {
        let count = 0;
        const lazy = LazyComputation.defer(() => {
            count++;
            return 99;
        });

        lazy.value;
        lazy.value;
        expect(count).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

describe('Environment', () => {
    test('isNode is true in Node.js', () => {
        expect(Environment.isNode).toBe(true);
    });

    test('hardwareConcurrency is a positive integer', () => {
        expect(Environment.hardwareConcurrency).toBeGreaterThan(0);
    });
});
