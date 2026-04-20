/**
 * Tests for WorkerPool and TaskScheduler
 *
 * Since jsdom does not support real Web Workers, all tests exercise the
 * synchronous fallback path (_runSync). Browser-mode Worker execution
 * is tested separately via Selenium/Playwright integration tests.
 */

'use strict';

const { WorkerPool, ENGINE_REGISTRY } = require('../../src/utils/workerPool');
const { TaskScheduler } = require('../../src/utils/taskScheduler');

// ============ WorkerPool — Core ============

describe('WorkerPool', () => {

    let pool;

    afterEach(() => {
        if (pool) {
            pool.terminate();
            pool = null;
        }
    });

    // ─── Test 1: poolSize defaults based on navigator.hardwareConcurrency or 4 ───
    test('poolSize defaults to hardwareConcurrency or 4', () => {
        pool = new WorkerPool();
        const expected = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency)
            ? navigator.hardwareConcurrency
            : 4;
        expect(pool.poolSize).toBe(expected);
        expect(pool.poolSize).toBeGreaterThanOrEqual(1);
    });

    // ─── Test 2: custom poolSize respected ───
    test('custom poolSize is respected', () => {
        pool = new WorkerPool({ poolSize: 8 });
        expect(pool.poolSize).toBe(8);
    });

    // ─── Test 3: sync fallback used in test environment ───
    test('sync fallback is used in test (jsdom) environment', () => {
        pool = new WorkerPool();
        expect(pool.isSyncMode).toBe(true);
        expect(pool.isBrowser).toBe(false);
    });

    // ─── Test 4: run() with markov engine produces valid result ───
    test('run() with markov engine produces a valid result', async () => {
        pool = new WorkerPool();
        const project = {
            states: {
                healthy: { initial_probability: 0.8, cost: 100, utility: 0.9 },
                sick:    { initial_probability: 0.2, cost: 500, utility: 0.5 },
                dead:    { initial_probability: 0.0, cost: 0, utility: 0.0, absorbing: true }
            },
            transitions: {
                t1: { from: 'healthy', to: 'sick', probability: 0.1 },
                t2: { from: 'healthy', to: 'dead', probability: 0.02 },
                t3: { from: 'sick', to: 'dead', probability: 0.15 }
            },
            settings: {
                time_horizon: 10,
                cycle_length: 1,
                discount_rate_costs: 0.03,
                discount_rate_qalys: 0.03
            }
        };

        const result = await pool.run('markov', 'run', [project]);
        expect(result).toBeDefined();
        expect(result.trace).toBeDefined();
        expect(result.trace.cycles).toBeDefined();
        expect(Array.isArray(result.trace.cycles)).toBe(true);
        expect(result.trace.cycles.length).toBeGreaterThan(0);
        expect(result.total_costs).toBeDefined();
        expect(result.total_qalys).toBeDefined();
        expect(typeof result.total_costs).toBe('number');
    });

    // ─── Test 5: run() with budgetImpact engine ───
    test('run() with budgetImpact engine produces a valid result', async () => {
        pool = new WorkerPool();
        const config = {
            population: 100000,
            prevalence: 0.05,
            timeHorizon: 3,
            uptake: [0.1, 0.3, 0.5],
            newTx: { drugCost: 2000, adminCost: 200 },
            currentTx: { drugCost: 500, adminCost: 100 }
        };

        const result = await pool.run('budgetImpact', 'run', [config]);
        expect(result).toBeDefined();
        expect(result.yearlyBudget).toBeDefined();
        expect(result.yearlyBudget.length).toBe(3);
    });

    // ─── Test 6: run() with mcda engine ───
    test('run() with mcda engine produces a valid result', async () => {
        pool = new WorkerPool();
        const alternatives = [
            { name: 'DrugA', values: { efficacy: 0.8, safety: 0.6 } },
            { name: 'DrugB', values: { efficacy: 0.6, safety: 0.9 } }
        ];
        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [0, 1] },
            { name: 'safety', direction: 'maximize', scale: [0, 1] }
        ];
        const weights = { efficacy: 0.6, safety: 0.4 };

        const result = await pool.run('mcda', 'weightedSum', [alternatives, criteria, weights]);
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
        // DrugA: 0.8*0.6 + 0.6*0.4 = 0.72; DrugB: 0.6*0.6 + 0.9*0.4 = 0.72
        // Tied scores => alphabetical: DrugA first
        expect(result[0].name).toBe('DrugA');
    });

    // ─── Test 7: unknown engine throws meaningful error ───
    test('unknown engine throws a meaningful error', async () => {
        pool = new WorkerPool();
        await expect(pool.run('nonExistentEngine', 'run', []))
            .rejects.toThrow(/Unknown engine "nonExistentEngine"/);
    });

    // ─── Test 8: unknown method throws meaningful error ───
    test('unknown method throws a meaningful error', async () => {
        pool = new WorkerPool();
        await expect(pool.run('mcda', 'totallyFakeMethod', []))
            .rejects.toThrow(/has no method "totallyFakeMethod"/);
    });

    // ─── Test 9: terminate is idempotent ───
    test('terminate() is idempotent — can call multiple times without error', () => {
        pool = new WorkerPool();
        expect(() => {
            pool.terminate();
            pool.terminate();
            pool.terminate();
        }).not.toThrow();
        expect(pool.stats.terminated).toBe(true);
    });

    // ─── Test 10: terminated pool rejects new tasks ───
    test('terminated pool rejects new tasks', async () => {
        pool = new WorkerPool();
        pool.terminate();
        await expect(pool.run('markov', 'run', [{}]))
            .rejects.toThrow(/terminated/);
    });

    // ─── Test 11: registeredEngines lists all engines ───
    test('registeredEngines returns all engine names', () => {
        pool = new WorkerPool();
        const engines = pool.registeredEngines;
        expect(engines).toContain('markov');
        expect(engines).toContain('psa');
        expect(engines).toContain('budgetImpact');
        expect(engines).toContain('mcda');
        expect(engines).toContain('nma');
        expect(engines).toContain('correlatedPSA');
        expect(engines).toContain('semiMarkov');
        expect(engines).toContain('modelAveraging');
        expect(engines).toContain('competingRisks');
        expect(engines).toContain('decisionTree');
        expect(engines.length).toBeGreaterThanOrEqual(15);
    });

    // ─── Test 12: registry covers all engines (they all load via _runSync) ───
    test('every registered engine can be loaded without error', () => {
        pool = new WorkerPool();
        const path = require('path');
        for (const engineName of pool.registeredEngines) {
            const entry = ENGINE_REGISTRY[engineName];
            expect(entry).toBeDefined();
            expect(entry.path).toBeDefined();
            expect(entry.className).toBeDefined();

            // Resolve relative to workerPool.js (src/utils/) not the test file
            const absPath = path.resolve(__dirname, '../../src/utils', entry.path);
            let mod;
            expect(() => {
                mod = require(absPath);
            }).not.toThrow();
            expect(mod).toBeDefined();

            // The className should exist or at least one function export
            const hasClass = mod[entry.className] || Object.values(mod).some(v => typeof v === 'function');
            expect(hasClass).toBeTruthy();
        }
    });

    // ─── Test 13: stats reports correct state ───
    test('stats reports pool state', () => {
        pool = new WorkerPool({ poolSize: 6 });
        const s = pool.stats;
        expect(s.poolSize).toBe(6);
        expect(s.activeWorkers).toBe(0);
        expect(s.queueLength).toBe(0);
        expect(s.terminated).toBe(false);
    });

    // ─── Test 14: custom engine registry for testing ───
    test('custom engine registry override works', async () => {
        const mockEngine = {
            MockEngine: class {
                greet(name) { return `Hello, ${name}`; }
            }
        };
        // Temporarily register mock in require cache
        const mockPath = 'mock-engine-for-test';
        require.cache[require.resolve ? mockPath : mockPath] = undefined;

        pool = new WorkerPool({
            engineRegistry: {
                mock: { path: '../../src/engine/mcda', className: 'MCDAEngine' }
            }
        });

        // Should only see 'mock' in registered engines
        expect(pool.registeredEngines).toEqual(['mock']);
    });
});

// ============ WorkerPool — runBatch ============

describe('WorkerPool.runBatch', () => {

    let pool;

    beforeAll(() => {
        pool = new WorkerPool();
    });

    afterAll(() => {
        pool.terminate();
    });

    // ─── Test 15: empty batch returns empty array ───
    test('empty batch returns empty array', async () => {
        const results = await pool.runBatch([]);
        expect(results).toEqual([]);
    });

    // ─── Test 16: single task batch works ───
    test('single task batch returns one result', async () => {
        const alternatives = [
            { name: 'A', values: { cost: 100 } },
            { name: 'B', values: { cost: 200 } }
        ];
        const criteria = [{ name: 'cost', direction: 'minimize', scale: [0, 1000] }];
        const weights = { cost: 1.0 };

        const results = await pool.runBatch([
            { engine: 'mcda', method: 'weightedSum', args: [alternatives, criteria, weights] }
        ]);

        expect(results.length).toBe(1);
        expect(Array.isArray(results[0])).toBe(true);
    });

    // ─── Test 17: runBatch with 3 tasks returns 3 results ───
    test('runBatch with 3 tasks returns 3 results', async () => {
        const mkTask = (costA, costB) => ({
            engine: 'mcda',
            method: 'weightedSum',
            args: [
                [
                    { name: 'A', values: { cost: costA } },
                    { name: 'B', values: { cost: costB } }
                ],
                [{ name: 'cost', direction: 'minimize', scale: [0, 1000] }],
                { cost: 1.0 }
            ]
        });

        const results = await pool.runBatch([
            mkTask(100, 200),
            mkTask(300, 50),
            mkTask(500, 500)
        ]);

        expect(results.length).toBe(3);
        // In task 1, A has lower cost → higher score → rank 1
        expect(results[0][0].name).toBe('A');
        // In task 2, B has lower cost → higher score → rank 1
        expect(results[1][0].name).toBe('B');
    });

    // ─── Test 18: runBatch preserves order ───
    test('runBatch preserves input order', async () => {
        const mkBIA = (pop) => ({
            engine: 'budgetImpact',
            method: 'run',
            args: [{
                population: pop,
                prevalence: 0.01,
                timeHorizon: 2,
                uptake: [0.5, 0.5],
                newTx: { drugCost: 1000 },
                currentTx: { drugCost: 500 }
            }]
        });

        const results = await pool.runBatch([
            mkBIA(100000),
            mkBIA(200000),
            mkBIA(50000)
        ]);

        expect(results.length).toBe(3);
        // Population 200000 should have larger budget impact than 100000
        expect(results[1].totalIncremental).toBeGreaterThan(results[0].totalIncremental);
        // Population 50000 should have smaller budget impact than 100000
        expect(results[2].totalIncremental).toBeLessThan(results[0].totalIncremental);
    });

    // ─── Test 19: error in one task doesn't crash others (allSettled pattern) ───
    test('error in one batch task produces rejected promise but does not prevent other tasks', async () => {
        // We test that a bad task throws, but the pool itself remains usable
        const badTask = pool.run('mcda', 'weightedSum', [[], [], {}]);
        await expect(badTask).rejects.toThrow();

        // Pool should still work after error
        const goodResult = await pool.run('mcda', 'weightedSum', [
            [{ name: 'X', values: { v: 5 } }],
            [{ name: 'v', direction: 'maximize', scale: [0, 10] }],
            { v: 1.0 }
        ]);
        expect(goodResult).toBeDefined();
        expect(goodResult[0].name).toBe('X');
    });

    // ─── Test 20: runBatch rejects non-array input ───
    test('runBatch rejects non-array input', async () => {
        await expect(pool.runBatch('not-an-array'))
            .rejects.toThrow(/expects an array/);
    });
});

// ============ TaskScheduler ============

describe('TaskScheduler', () => {

    let pool;
    let scheduler;

    beforeAll(() => {
        pool = new WorkerPool({ poolSize: 2 });
        scheduler = new TaskScheduler(pool);
    });

    afterAll(() => {
        scheduler.cancelAll();
        pool.terminate();
    });

    // ─── Test 21: constructor requires pool ───
    test('constructor throws without a WorkerPool', () => {
        expect(() => new TaskScheduler()).toThrow(/requires a WorkerPool/);
        expect(() => new TaskScheduler(null)).toThrow(/requires a WorkerPool/);
    });

    // ─── Test 22: schedulePSA splits iterations across pool ───
    test('schedulePSA splits iterations across pool threads', async () => {
        // With poolSize=2 and 100 iterations, should create 2 batches of 50
        // We need an engine that has a "runBatch" method. Since standard engines
        // don't have runBatch, we use a custom registry.
        const batchCalls = [];
        const mockPool = {
            poolSize: 2,
            run: jest.fn(async (engine, method, args) => {
                const [config, count, seed] = args;
                batchCalls.push({ engine, method, count, seed });
                // Return mock batch results
                return {
                    iterations: Array.from({ length: count }, (_, i) => ({
                        id: seed + i,
                        cost: 1000 + i,
                        qaly: 5 + i * 0.01
                    })),
                    summary: { meanCost: 1000, meanQaly: 5, n: count }
                };
            })
        };

        const mockScheduler = new TaskScheduler(mockPool);
        const result = await mockScheduler.schedulePSA('psa', { model: 'test' }, 100, null);

        expect(batchCalls.length).toBe(2);
        expect(batchCalls[0].count).toBe(50);
        expect(batchCalls[1].count).toBe(50);
        // Different seeds
        expect(batchCalls[0].seed).toBe(0);
        expect(batchCalls[1].seed).toBe(1000);
        // Merged result
        expect(result.iterations.length).toBe(100);
        expect(result.taskId).toBeDefined();
    });

    // ─── Test 23: schedulePSA merges results correctly ───
    test('schedulePSA merges iteration arrays from batches', async () => {
        const mockPool = {
            poolSize: 3,
            run: jest.fn(async (engine, method, args) => {
                const [, count] = args;
                return {
                    iterations: Array.from({ length: count }, (_, i) => ({ v: i })),
                    summary: { total: count }
                };
            })
        };

        const s = new TaskScheduler(mockPool);
        const result = await s.schedulePSA('psa', {}, 10);

        // ceil(10/3)=4 → batches of 4, 4, 2
        expect(result.iterations.length).toBe(10);
        expect(result.summary.total).toBeDefined();
    });

    // ─── Test 24: schedulePSA progress callback is called ───
    test('schedulePSA calls onProgress for each completed batch', async () => {
        const progressCalls = [];
        const mockPool = {
            poolSize: 2,
            run: jest.fn(async (engine, method, args) => {
                const [, count] = args;
                return { iterations: Array(count).fill(null), summary: {} };
            })
        };

        const s = new TaskScheduler(mockPool);
        await s.schedulePSA('psa', {}, 100, (done, total) => {
            progressCalls.push({ done, total });
        });

        expect(progressCalls.length).toBe(2); // 2 batches
        expect(progressCalls[0].total).toBe(100);
        expect(progressCalls[1].total).toBe(100);
        // Last call should report full completion
        expect(progressCalls[progressCalls.length - 1].done).toBe(100);
    });

    // ─── Test 25: cancel marks task cancelled ───
    test('cancel() marks a task as cancelled', () => {
        // Manually insert a task entry to test cancellation
        const taskId = 'test-cancel-1';
        scheduler.running.set(taskId, {
            promise: new Promise(() => {}),
            cancelled: false,
            cancel: jest.fn()
        });

        expect(scheduler.isRunning(taskId)).toBe(true);
        const result = scheduler.cancel(taskId);
        expect(result).toBe(true);
        expect(scheduler.isRunning(taskId)).toBe(false);
    });

    // ─── Test 26: cancel returns false for unknown taskId ───
    test('cancel() returns false for unknown taskId', () => {
        expect(scheduler.cancel('nonexistent-task')).toBe(false);
    });

    // ─── Test 27: activeTaskCount tracks running tasks ───
    test('activeTaskCount reflects running tasks', () => {
        scheduler.running.set('t1', { promise: null, cancelled: false });
        scheduler.running.set('t2', { promise: null, cancelled: false });
        expect(scheduler.activeTaskCount).toBe(2);
        scheduler.running.delete('t1');
        scheduler.running.delete('t2');
        expect(scheduler.activeTaskCount).toBe(0);
    });

    // ─── Test 28: cancelAll cancels all running tasks ───
    test('cancelAll() cancels all running tasks', () => {
        scheduler.running.set('a1', { promise: null, cancelled: false, cancel: jest.fn() });
        scheduler.running.set('a2', { promise: null, cancelled: false, cancel: jest.fn() });
        scheduler.running.set('a3', { promise: null, cancelled: false, cancel: jest.fn() });

        const count = scheduler.cancelAll();
        expect(count).toBe(3);
        expect(scheduler.activeTaskCount).toBe(0);
    });

    // ─── Test 29: schedulePSA rejects invalid nIterations ───
    test('schedulePSA rejects invalid nIterations', async () => {
        await expect(scheduler.schedulePSA('psa', {}, 0))
            .rejects.toThrow(/positive integer/);
        await expect(scheduler.schedulePSA('psa', {}, -5))
            .rejects.toThrow(/positive integer/);
        await expect(scheduler.schedulePSA('psa', {}, NaN))
            .rejects.toThrow(/positive integer/);
    });

    // ─── Test 30: schedulePSA rejects invalid engineName ───
    test('schedulePSA rejects empty engineName', async () => {
        await expect(scheduler.schedulePSA('', {}, 100))
            .rejects.toThrow(/non-empty string/);
    });

    // ─── Test 31: _mergeResults handles empty input ───
    test('_mergeResults returns empty on no results', () => {
        const merged = scheduler._mergeResults([]);
        expect(merged.iterations).toEqual([]);
        expect(merged.summary).toEqual({});
    });

    // ─── Test 32: _mergeResults handles raw arrays ───
    test('_mergeResults handles raw array results', () => {
        const merged = scheduler._mergeResults([
            [{ v: 1 }, { v: 2 }],
            [{ v: 3 }]
        ]);
        expect(merged.iterations.length).toBe(3);
    });

    // ─── Test 33: _mergeResults handles mixed result types ───
    test('_mergeResults handles objects with iterations + summary', () => {
        const merged = scheduler._mergeResults([
            { iterations: [{ a: 1 }], summary: { mean: 10, tags: ['x'] } },
            { iterations: [{ a: 2 }], summary: { mean: 20, tags: ['y'] } }
        ]);
        expect(merged.iterations.length).toBe(2);
        expect(merged.summary.mean).toBe(15); // averaged
        expect(merged.summary.tags).toEqual(['x', 'y']); // concatenated
    });

    // ─── Test 34: scheduleTask dispatches single task ───
    test('scheduleTask dispatches and returns result', async () => {
        const mockPool = {
            poolSize: 1,
            run: jest.fn(async () => 42)
        };
        const s = new TaskScheduler(mockPool);
        const { taskId, result } = await s.scheduleTask('markov', 'run', [{}]);
        expect(taskId).toBeDefined();
        expect(result).toBe(42);
    });

    // ─── Test 35: progress callback error does not crash pipeline ───
    test('progress callback error does not crash schedulePSA', async () => {
        const mockPool = {
            poolSize: 1,
            run: jest.fn(async (engine, method, args) => {
                const [, count] = args;
                return { iterations: Array(count).fill(null), summary: {} };
            })
        };

        const s = new TaskScheduler(mockPool);
        // onProgress throws — should not propagate
        const result = await s.schedulePSA('psa', {}, 50, () => {
            throw new Error('UI crashed');
        });
        expect(result.iterations.length).toBe(50);
    });
});
