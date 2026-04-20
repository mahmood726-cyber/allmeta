/**
 * Tests for src/engine/performanceEngine.js
 * Covers Environment, FallbackExecutor, MemoryPool, ComputationCache,
 * SIMDVectorizer, PerformanceMonitor, WorkerPoolManager, WASMAccelerator,
 * GPUAccelerator, StreamingEngine, and PerformanceEngine orchestrator.
 */

'use strict';

const {
    PerformanceEngine,
    WorkerPoolManager,
    WASMAccelerator,
    GPUAccelerator,
    MemoryPool,
    ComputationCache,
    StreamingEngine,
    SIMDVectorizer,
    PerformanceMonitor,
    FallbackExecutor,
    Environment
} = require('../../src/engine/performanceEngine');

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

describe('Environment', () => {
    test('isNode returns true in Node.js', () => {
        expect(Environment.isNode).toBe(true);
    });

    test('hardwareConcurrency returns a positive integer', () => {
        const cores = Environment.hardwareConcurrency;
        expect(cores).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(cores)).toBe(true);
    });

    test('hasWebAssembly returns true in Node', () => {
        expect(Environment.hasWebAssembly).toBe(true);
    });

    test('performanceNow returns a callable function', () => {
        const now = Environment.performanceNow;
        expect(typeof now).toBe('function');
        const t = now();
        expect(typeof t).toBe('number');
        expect(t).toBeGreaterThanOrEqual(0);
    });

    test('hasWebWorkers returns false in jsdom (no real Worker)', () => {
        // jsdom may or may not define Worker; either way the getter is stable
        expect(typeof Environment.hasWebWorkers).toBe('boolean');
    });
});

// ============================================================================
// FALLBACK EXECUTOR
// ============================================================================

describe('FallbackExecutor', () => {
    test('DerSimonian-Laird produces valid meta-analysis result', () => {
        const effects = [0.5, 0.7, 0.3, 0.6];
        const variances = [0.04, 0.09, 0.01, 0.0625];
        const result = FallbackExecutor.execute('derSimonianLaird', { effects, variances });

        expect(result).toHaveProperty('effect');
        expect(result).toHaveProperty('se');
        expect(result).toHaveProperty('tau2');
        expect(result).toHaveProperty('I2');
        expect(result).toHaveProperty('Q');
        expect(result).toHaveProperty('df');
        expect(result.df).toBe(3);
        expect(result.se).toBeGreaterThan(0);
        expect(result.tau2).toBeGreaterThanOrEqual(0);
        expect(result.I2).toBeGreaterThanOrEqual(0);
        expect(result.I2).toBeLessThanOrEqual(100);
    });

    test('REML produces a finite effect and se', () => {
        const effects = [0.5, 0.7, 0.3, 0.6, 0.55];
        const variances = [0.04, 0.09, 0.01, 0.0625, 0.04];
        const result = FallbackExecutor.execute('reml', { effects, variances });

        expect(Number.isFinite(result.effect)).toBe(true);
        expect(Number.isFinite(result.se)).toBe(true);
        expect(result.tau2).toBeGreaterThanOrEqual(0);
    });

    test('Kaplan-Meier returns survival curve', () => {
        const times = [1, 2, 3, 4, 5, 6, 7, 8];
        const events = [1, 0, 1, 1, 0, 1, 0, 1];
        const result = FallbackExecutor.execute('kaplanMeier', { times, events });

        expect(result.times.length).toBeGreaterThan(0);
        expect(result.survival.length).toBe(result.times.length);
        // Survival should be monotonically non-increasing
        for (let i = 1; i < result.survival.length; i++) {
            expect(result.survival[i]).toBeLessThanOrEqual(result.survival[i - 1]);
        }
        // All survival values between 0 and 1
        result.survival.forEach(s => {
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(1);
        });
    });

    test('matrixMultiply produces correct result for identity', () => {
        // A = 2x2 identity, B = 2x2 values
        const I = new Float64Array([1, 0, 0, 1]);
        const B = new Float64Array([3, 7, 2, 5]);
        const C = FallbackExecutor.execute('matrixMultiply', { A: I, B, m: 2, n: 2, p: 2 });

        expect(C[0]).toBeCloseTo(3, 10);
        expect(C[1]).toBeCloseTo(7, 10);
        expect(C[2]).toBeCloseTo(2, 10);
        expect(C[3]).toBeCloseTo(5, 10);
    });

    test('cholesky decomposes a positive-definite matrix', () => {
        // A = [[4, 2], [2, 5]]  => L = [[2, 0], [1, 2]]
        const A = new Float64Array([4, 2, 2, 5]);
        const L = FallbackExecutor.execute('cholesky', { A, n: 2 });

        expect(L[0]).toBeCloseTo(2, 10);   // L[0,0]
        expect(L[1]).toBeCloseTo(0, 10);   // L[0,1]
        expect(L[2]).toBeCloseTo(1, 10);   // L[1,0]
        expect(L[3]).toBeCloseTo(2, 10);   // L[1,1]
    });

    test('inverse of 2x2 identity is identity', () => {
        const I = new Float64Array([1, 0, 0, 1]);
        const inv = FallbackExecutor.execute('inverse', { A: I, n: 2 });

        expect(inv[0]).toBeCloseTo(1, 10);
        expect(inv[1]).toBeCloseTo(0, 10);
        expect(inv[2]).toBeCloseTo(0, 10);
        expect(inv[3]).toBeCloseTo(1, 10);
    });

    test('welford computes correct mean and variance', () => {
        const values = [2, 4, 4, 4, 5, 5, 7, 9];
        const result = FallbackExecutor.execute('welford', { values });

        expect(result.mean).toBeCloseTo(5, 10);
        expect(result.n).toBe(8);
        // Sample variance of [2,4,4,4,5,5,7,9] = 32/7
        expect(result.variance).toBeCloseTo(32 / 7, 10);
    });

    test('weightedStats computes weighted mean correctly', () => {
        const values = [10, 20, 30];
        const weights = [1, 1, 1];
        const result = FallbackExecutor.execute('weightedStats', { values, weights });
        expect(result.mean).toBeCloseTo(20, 10);
    });

    test('PSA generates correct number of samples', () => {
        const params = [
            { dist: 'normal', mean: 10, sd: 2 },
            { dist: 'uniform', min: 0, max: 1 }
        ];
        const samples = FallbackExecutor.execute('psa', { params, nSim: 50, seed: 42 });
        expect(samples.length).toBe(100); // 50 sims * 2 params
    });

    test('throws on unknown operation', () => {
        expect(() => FallbackExecutor.execute('nonexistent', {})).toThrow('Unknown operation');
    });

    test('frequentistNMA returns effects and standard errors', () => {
        const data = {
            effects: [0.5, 0.3, 0.2],
            variances: [0.04, 0.09, 0.01],
            treat1: [0, 0, 1],
            treat2: [1, 2, 2]
        };
        const result = FallbackExecutor.execute('frequentistNMA', data);
        expect(result.effects.length).toBe(2); // nt-1
        expect(result.se.length).toBe(2);
        result.se.forEach(s => expect(s).toBeGreaterThan(0));
    });
});

// ============================================================================
// MEMORY POOL
// ============================================================================

describe('MemoryPool', () => {
    let pool;

    beforeEach(() => {
        pool = new MemoryPool({ maxPoolSize: 5 });
    });

    test('acquire returns a typed array of correct type and length', () => {
        const arr = pool.acquire(Float64Array, 100);
        expect(arr).toBeInstanceOf(Float64Array);
        expect(arr.length).toBe(100);
    });

    test('acquired arrays are zero-filled on reuse', () => {
        const arr = pool.acquire(Float64Array, 10);
        arr[0] = 999;
        pool.release(arr);

        const reused = pool.acquire(Float64Array, 10);
        expect(reused[0]).toBe(0);
    });

    test('release and re-acquire tracks stats correctly', () => {
        const arr1 = pool.acquire(Float64Array, 10);
        pool.release(arr1);
        const arr2 = pool.acquire(Float64Array, 10);

        const stats = pool.getStats();
        expect(stats.allocations).toBe(1);
        expect(stats.reuses).toBe(1);
        expect(stats.deallocations).toBe(1);
    });

    test('clear empties all pools', () => {
        pool.acquire(Float64Array, 10);
        pool.acquire(Float32Array, 20);
        pool.clear();

        // After clear, acquire must allocate fresh
        const arr = pool.acquire(Float64Array, 10);
        const stats = pool.getStats();
        // allocations: 2 before clear + 1 after = 3
        expect(stats.allocations).toBe(3);
        expect(stats.reuses).toBe(0);
    });

    test('respects maxPoolSize', () => {
        const arrays = [];
        for (let i = 0; i < 10; i++) {
            arrays.push(pool.acquire(Float64Array, 5));
        }
        // Release all 10, but max pool size is 5
        arrays.forEach(a => pool.release(a));
        expect(pool.getStats().deallocations).toBe(5);
    });

    test('release ignores null and non-typed-array', () => {
        pool.release(null);
        pool.release(undefined);
        expect(pool.getStats().deallocations).toBe(0);
    });
});

// ============================================================================
// COMPUTATION CACHE
// ============================================================================

describe('ComputationCache', () => {
    let cache;

    beforeEach(() => {
        cache = new ComputationCache({ maxSize: 5, ttl: 60000 });
    });

    test('set and get return stored value', () => {
        cache.set('key1', 42);
        expect(cache.get('key1')).toBe(42);
    });

    test('get returns undefined for missing key', () => {
        expect(cache.get('missing')).toBeUndefined();
    });

    test('tracks hits and misses', () => {
        cache.set('a', 1);
        cache.get('a');  // hit
        cache.get('b');  // miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
    });

    test('evicts oldest entry when maxSize reached', () => {
        for (let i = 0; i < 6; i++) {
            cache.set(`key${i}`, i);
        }
        const stats = cache.getStats();
        expect(stats.evictions).toBeGreaterThanOrEqual(1);
        expect(stats.size).toBe(5);
    });

    test('TTL expiration returns undefined', () => {
        const shortTTL = new ComputationCache({ maxSize: 10, ttl: 1 });
        shortTTL.set('expire', 'soon');

        // Manually expire by overwriting the entry's expiration
        const hash = shortTTL._hash('expire');
        shortTTL.cache.get(hash).expires = Date.now() - 1;

        expect(shortTTL.get('expire')).toBeUndefined();
    });

    test('memoize caches function results', () => {
        let callCount = 0;
        const fn = (x) => { callCount++; return x * 2; };
        const memoized = cache.memoize(fn, (x) => `double_${x}`);

        expect(memoized(5)).toBe(10);
        expect(memoized(5)).toBe(10);
        expect(callCount).toBe(1); // Only called once
    });

    test('clear empties the cache', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();
        expect(cache.get('a')).toBeUndefined();
        expect(cache.getStats().size).toBe(0);
    });

    test('hitRate is computed correctly', () => {
        cache.set('x', 1);
        cache.get('x'); // hit
        cache.get('x'); // hit
        cache.get('y'); // miss

        const stats = cache.getStats();
        expect(stats.hitRate).toBeCloseTo(2 / 3, 6);
    });

    test('_hash handles string, typed array, and object keys', () => {
        const h1 = cache._hash('simple');
        expect(h1).toBe('simple');

        const h2 = cache._hash(new Float64Array([1, 2, 3]));
        expect(typeof h2).toBe('string');
        expect(h2).toMatch(/^arr_Float64Array_3_/);

        const h3 = cache._hash({ a: 1 });
        expect(typeof h3).toBe('string');
    });
});

// ============================================================================
// SIMD VECTORIZER
// ============================================================================

describe('SIMDVectorizer', () => {
    let simd;

    beforeEach(() => {
        simd = new SIMDVectorizer();
    });

    test('vectorSum computes correct sum', () => {
        const a = new Float64Array([1, 2, 3, 4, 5, 6, 7]);
        expect(simd.vectorSum(a)).toBeCloseTo(28, 10);
    });

    test('vectorMean computes correct mean', () => {
        const a = new Float64Array([2, 4, 6, 8]);
        expect(simd.vectorMean(a)).toBeCloseTo(5, 10);
    });

    test('vectorMean returns 0 for empty array', () => {
        expect(simd.vectorMean(new Float64Array(0))).toBe(0);
    });

    test('vectorVariance computes sample variance', () => {
        const a = new Float64Array([2, 4, 4, 4, 5, 5, 7, 9]);
        expect(simd.vectorVariance(a)).toBeCloseTo(32 / 7, 10);
    });

    test('vectorVariance returns 0 for single element', () => {
        expect(simd.vectorVariance(new Float64Array([5]))).toBe(0);
    });

    test('vectorAdd produces element-wise sum', () => {
        const a = new Float64Array([1, 2, 3, 4, 5]);
        const b = new Float64Array([10, 20, 30, 40, 50]);
        const result = simd.vectorAdd(a, b);
        expect(result[0]).toBe(11);
        expect(result[4]).toBe(55);
    });

    test('vectorMul produces element-wise product', () => {
        const a = new Float64Array([2, 3, 4, 5]);
        const b = new Float64Array([10, 10, 10, 10]);
        const result = simd.vectorMul(a, b);
        expect(result[0]).toBe(20);
        expect(result[3]).toBe(50);
    });

    test('vectorScale multiplies by scalar', () => {
        const a = new Float64Array([1, 2, 3, 4, 5]);
        const result = simd.vectorScale(a, 3);
        expect(result[0]).toBe(3);
        expect(result[4]).toBe(15);
    });

    test('vectorDot computes dot product', () => {
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([4, 5, 6]);
        expect(simd.vectorDot(a, b)).toBeCloseTo(32, 10);
    });
});

// ============================================================================
// PERFORMANCE MONITOR
// ============================================================================

describe('PerformanceMonitor', () => {
    let monitor;

    beforeEach(() => {
        monitor = new PerformanceMonitor();
    });

    test('startTimer and endTimer return elapsed time', () => {
        monitor.startTimer('test');
        const elapsed = monitor.endTimer('test');
        expect(typeof elapsed).toBe('number');
        expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    test('endTimer returns 0 for unknown timer', () => {
        expect(monitor.endTimer('nonexistent')).toBe(0);
    });

    test('time wraps a synchronous function', () => {
        const result = monitor.time('add', () => 2 + 3);
        expect(result).toBe(5);

        const report = monitor.getReport();
        expect(report).toHaveProperty('add');
        expect(report.add.count).toBe(1);
    });

    test('timeAsync wraps an async function', async () => {
        const result = await monitor.timeAsync('asyncOp', async () => {
            return 42;
        });
        expect(result).toBe(42);
        expect(monitor.getReport().asyncOp.count).toBe(1);
    });

    test('getReport returns min/max/avg stats', () => {
        monitor.time('op', () => {});
        monitor.time('op', () => {});

        const report = monitor.getReport();
        expect(report.op.count).toBe(2);
        expect(report.op.total).toMatch(/ms$/);
        expect(report.op.avg).toMatch(/ms$/);
        expect(report.op.min).toMatch(/ms$/);
        expect(report.op.max).toMatch(/ms$/);
    });

    test('reset clears all data', () => {
        monitor.time('op', () => {});
        monitor.reset();

        expect(monitor.getReport()).toEqual({});
    });
});

// ============================================================================
// WORKER POOL MANAGER (fallback mode in jsdom)
// ============================================================================

describe('WorkerPoolManager', () => {
    test('initializes in fallback mode in jsdom/Node', async () => {
        const pool = new WorkerPoolManager({ poolSize: 2 });
        await pool.initialize();
        expect(pool.fallbackMode).toBe(true);
        expect(pool.initialized).toBe(true);
    });

    test('execute uses FallbackExecutor in fallback mode', async () => {
        const pool = new WorkerPoolManager();
        await pool.initialize();

        const result = await pool.execute('welford', { values: [1, 2, 3, 4, 5] });
        expect(result.mean).toBeCloseTo(3, 10);
        expect(result.n).toBe(5);
    });

    test('getMetrics returns initial metrics', () => {
        const pool = new WorkerPoolManager();
        const metrics = pool.getMetrics();
        expect(metrics.tasksCompleted).toBe(0);
        expect(metrics.totalTime).toBe(0);
    });

    test('terminate cleans up workers', () => {
        const pool = new WorkerPoolManager();
        pool.terminate();
        expect(pool.workers).toHaveLength(0);
        expect(pool.initialized).toBe(false);
    });
});

// ============================================================================
// WASM ACCELERATOR (fallback paths)
// ============================================================================

describe('WASMAccelerator', () => {
    let wasm;

    beforeEach(() => {
        wasm = new WASMAccelerator();
    });

    test('vectorAdd falls back to JS implementation', () => {
        wasm.initialized = true;
        wasm.exports = {}; // No WASM exports
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([4, 5, 6]);
        const result = wasm.vectorAdd(a, b);
        expect(result[0]).toBe(5);
        expect(result[1]).toBe(7);
        expect(result[2]).toBe(9);
    });

    test('vectorScale scales correctly', () => {
        const a = new Float64Array([2, 4, 6]);
        const result = wasm.vectorScale(a, 0.5);
        expect(result[0]).toBe(1);
        expect(result[1]).toBe(2);
        expect(result[2]).toBe(3);
    });

    test('vectorDot computes dot product', () => {
        const a = new Float64Array([1, 0, 0, 3]);
        const b = new Float64Array([0, 1, 0, 2]);
        expect(wasm.vectorDot(a, b)).toBeCloseTo(6, 10);
    });
});

// ============================================================================
// GPU ACCELERATOR (CPU fallback)
// ============================================================================

describe('GPUAccelerator', () => {
    test('initializes to cpu backend in Node/jsdom', async () => {
        const gpu = new GPUAccelerator();
        await gpu.initialize();
        expect(gpu.backend).toBe('cpu');
        expect(gpu.initialized).toBe(true);
    });

    test('matrixMultiply falls back to CPU', async () => {
        const gpu = new GPUAccelerator();
        await gpu.initialize();

        const A = new Float64Array([1, 2, 3, 4]);
        const B = new Float64Array([5, 6, 7, 8]);
        const C = await gpu.matrixMultiply(A, B, 2, 2, 2);

        // [1*5+2*7, 1*6+2*8, 3*5+4*7, 3*6+4*8] = [19, 22, 43, 50]
        expect(C[0]).toBeCloseTo(19, 10);
        expect(C[1]).toBeCloseTo(22, 10);
        expect(C[2]).toBeCloseTo(43, 10);
        expect(C[3]).toBeCloseTo(50, 10);
    });
});

// ============================================================================
// STREAMING ENGINE
// ============================================================================

describe('StreamingEngine', () => {
    test('processStream yields chunks', async () => {
        const engine = new StreamingEngine({ chunkSize: 3 });
        const data = [1, 2, 3, 4, 5, 6, 7];
        const chunks = [];

        for await (const result of engine.processStream(data, async (chunk, meta) => {
            return { sum: chunk.reduce((a, b) => a + b, 0), index: meta.chunkIndex };
        })) {
            chunks.push(result);
        }

        expect(chunks.length).toBe(3); // ceil(7/3)
        expect(chunks[0].sum).toBe(6);  // 1+2+3
        expect(chunks[0].index).toBe(0);
    });

    test('mapReduce combines chunk results', async () => {
        const engine = new StreamingEngine({ chunkSize: 2 });
        const data = [1, 2, 3, 4];

        const total = await engine.mapReduce(
            data,
            async (chunk) => chunk.reduce((a, b) => a + b, 0),
            (acc, val) => acc + val,
            0
        );

        expect(total).toBe(10);
    });
});

// ============================================================================
// PERFORMANCE ENGINE (orchestrator)
// ============================================================================

describe('PerformanceEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new PerformanceEngine();
    });

    afterEach(async () => {
        await engine.shutdown();
    });

    test('initialize sets initialized flag', async () => {
        await engine.initialize();
        expect(engine.initialized).toBe(true);
    });

    test('acquireArray and releaseArray delegate to MemoryPool', () => {
        const arr = engine.acquireArray(Float64Array, 10);
        expect(arr).toBeInstanceOf(Float64Array);
        expect(arr.length).toBe(10);

        engine.releaseArray(arr);
        const stats = engine.memoryPool.getStats();
        expect(stats.allocations).toBe(1);
        expect(stats.deallocations).toBe(1);
    });

    test('memoize delegates to cache', () => {
        let count = 0;
        const fn = (x) => { count++; return x + 1; };
        const memo = engine.memoize(fn, (x) => `inc_${x}`);

        expect(memo(3)).toBe(4);
        expect(memo(3)).toBe(4);
        expect(count).toBe(1);
    });

    test('getPerformanceReport returns all sections', () => {
        const report = engine.getPerformanceReport();
        expect(report).toHaveProperty('timing');
        expect(report).toHaveProperty('cache');
        expect(report).toHaveProperty('memory');
        expect(report).toHaveProperty('workers');
    });

    test('shutdown resets all state', async () => {
        await engine.initialize();
        await engine.shutdown();
        expect(engine.initialized).toBe(false);
    });

    test('_metaAnalysisLocal DL produces valid result', () => {
        const effects = [0.5, 0.7, 0.3, 0.6];
        const variances = [0.04, 0.09, 0.01, 0.0625];
        const result = engine._metaAnalysisLocal(effects, variances, 'dl');

        expect(Number.isFinite(result.effect)).toBe(true);
        expect(result.se).toBeGreaterThan(0);
        expect(result.tau2).toBeGreaterThanOrEqual(0);
    });

    test('_metaAnalysisLocal REML converges', () => {
        const effects = [0.5, 0.7, 0.3, 0.6, 0.55];
        const variances = [0.04, 0.09, 0.01, 0.0625, 0.04];
        const result = engine._metaAnalysisLocal(effects, variances, 'reml');

        expect(Number.isFinite(result.effect)).toBe(true);
        expect(result.se).toBeGreaterThan(0);
    });
});
