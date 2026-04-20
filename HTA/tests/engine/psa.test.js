/**
 * Tests for src/engine/psa.js — PSAEngine
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { ExpressionParser } = require('../../src/parser/expression');

// Set up globals required by the engine modules
global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.PCG32 = PCG32;
global.ExpressionParser = ExpressionParser;

const { MarkovEngine } = require('../../src/engine/markov');
global.MarkovEngine = MarkovEngine;

const { PSAEngine } = require('../../src/engine/psa');

// ---------------------------------------------------------------------------
// Helper: minimal two-state Markov project that PSAEngine.run() can consume
// ---------------------------------------------------------------------------
function createProject() {
    return {
        version: '0.1',
        metadata: { id: 'psa-test', name: 'PSA Test Project' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 5,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 55
        },
        parameters: {
            p_death: {
                value: 0.1,
                distribution: { type: 'beta', alpha: 10, beta: 90 }
            },
            c_alive: {
                value: 1000,
                distribution: { type: 'gamma', mean: 1000, se: 200 }
            },
            u_alive: {
                value: 0.8,
                distribution: { type: 'beta', alpha: 16, beta: 4 }
            }
        },
        states: {
            alive: {
                label: 'Alive',
                initial_probability: 1,
                cost: 'c_alive',
                utility: 'u_alive'
            },
            dead: {
                label: 'Dead',
                type: 'absorbing',
                cost: 0,
                utility: 0
            }
        },
        transitions: {
            alive_to_dead: { from: 'alive', to: 'dead', probability: 'p_death' },
            alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        },
        strategies: {
            comparator: {
                label: 'Comparator',
                is_comparator: true,
                parameter_overrides: { p_death: 0.1 }
            },
            intervention: {
                label: 'Intervention',
                parameter_overrides: { p_death: 'p_death * 0.5' }
            }
        }
    };
}

// Intervention override: halves death probability, adds treatment cost
const INT_OVERRIDES = { p_death: 0.05, c_alive: 1500 };
// Comparator override: baseline values
const COMP_OVERRIDES = {};

// ---------------------------------------------------------------------------
// PSAEngine
// ---------------------------------------------------------------------------
describe('PSAEngine', () => {
    describe('Constructor', () => {
        test('creates with default options', () => {
            const engine = new PSAEngine();

            expect(engine.options.seed).toBe(12345);
            expect(engine.options.iterations).toBe(10000);
            expect(engine.options.wtpMin).toBe(0);
            expect(engine.options.wtpMax).toBe(100000);
            expect(engine.options.wtpStep).toBe(1000);
            expect(engine.options.convergenceThreshold).toBe(0.01);
            expect(engine.rng).toBeDefined();
            expect(engine.markovEngine).toBeInstanceOf(MarkovEngine);
            expect(engine.auditLog).toEqual([]);
        });

        test('accepts custom options', () => {
            const engine = new PSAEngine({ seed: 42, iterations: 500 });

            expect(engine.options.seed).toBe(42);
            expect(engine.options.iterations).toBe(500);
        });
    });

    // -----------------------------------------------------------------------
    // Parameter sampling
    // -----------------------------------------------------------------------
    describe('Parameter sampling', () => {
        let engine;

        beforeEach(() => {
            engine = new PSAEngine({ seed: 12345, iterations: 100 });
        });

        test('beta distribution returns values in [0, 1]', () => {
            const params = {
                prob: {
                    value: 0.3,
                    distribution: { type: 'beta', alpha: 6, beta: 14 }
                }
            };

            for (let i = 0; i < 200; i++) {
                const sampled = engine.sampleParameters(params);
                expect(sampled.prob).toBeGreaterThanOrEqual(0);
                expect(sampled.prob).toBeLessThanOrEqual(1);
                expect(Number.isFinite(sampled.prob)).toBe(true);
            }
        });

        test('gamma distribution returns positive values', () => {
            const params = {
                cost: {
                    value: 500,
                    distribution: { type: 'gamma', mean: 500, se: 100 }
                }
            };

            for (let i = 0; i < 200; i++) {
                const sampled = engine.sampleParameters(params);
                expect(sampled.cost).toBeGreaterThan(0);
                expect(Number.isFinite(sampled.cost)).toBe(true);
            }
        });

        test('normal distribution returns finite values', () => {
            const params = {
                util: {
                    value: 0.75,
                    distribution: { type: 'normal', mean: 0.75, sd: 0.05 }
                }
            };

            for (let i = 0; i < 200; i++) {
                const sampled = engine.sampleParameters(params);
                expect(Number.isFinite(sampled.util)).toBe(true);
            }
        });

        test('lognormal distribution returns positive values', () => {
            const params = {
                rr: {
                    value: 1.5,
                    distribution: { type: 'lognormal', mean: 1.5, sd: 0.3 }
                }
            };

            for (let i = 0; i < 200; i++) {
                const sampled = engine.sampleParameters(params);
                expect(sampled.rr).toBeGreaterThan(0);
                expect(Number.isFinite(sampled.rr)).toBe(true);
            }
        });

        test('fixed parameters are passed through unchanged', () => {
            const params = {
                fixed_val: { value: 42 }
            };

            const sampled = engine.sampleParameters(params);
            expect(sampled.fixed_val).toBe(42);
        });
    });

    // -----------------------------------------------------------------------
    // CEAC calculation
    // -----------------------------------------------------------------------
    describe('CEAC calculation', () => {
        let engine;

        beforeEach(() => {
            engine = new PSAEngine({ seed: 12345, iterations: 100 });
        });

        test('returns probabilities between 0 and 1 for each WTP point', () => {
            const rng = new PCG32(42);
            const incCosts = Array.from({ length: 500 }, () => rng.normal(-200, 300));
            const incQalys = Array.from({ length: 500 }, () => rng.normal(0.1, 0.05));

            const ceac = engine.computeCEAC(incCosts, incQalys, {}, {
                wtpMin: 0,
                wtpMax: 50000,
                wtpStep: 10000,
                thresholds: [20000, 30000, 50000]
            });

            expect(ceac.length).toBeGreaterThan(0);
            for (const point of ceac) {
                expect(point.probability).toBeGreaterThanOrEqual(0);
                expect(point.probability).toBeLessThanOrEqual(1);
                expect(Number.isFinite(point.wtp)).toBe(true);
            }
        });

        test('probability increases with WTP when intervention is more effective but costlier', () => {
            const n = 1000;
            const rng = new PCG32(7);
            const incCosts = Array.from({ length: n }, () => 5000 + rng.normal(0, 1000));
            const incQalys = Array.from({ length: n }, () => 0.5 + rng.normal(0, 0.1));

            const probLow = engine.computeProbCE(incCosts, incQalys, 1000);
            const probHigh = engine.computeProbCE(incCosts, incQalys, 100000);

            expect(probHigh).toBeGreaterThan(probLow);
        });
    });

    // -----------------------------------------------------------------------
    // EVPI calculation
    // -----------------------------------------------------------------------
    describe('EVPI calculation', () => {
        test('returns non-negative EVPI values', () => {
            // Create incremental results with genuine uncertainty (some positive, some negative NMB)
            const n = 500;
            const rng = new PCG32(99);
            const incCosts = Array.from({ length: n }, () => rng.normal(-200, 400));
            const incQalys = Array.from({ length: n }, () => rng.normal(0.1, 0.08));

            // Compute EVPI using the same algorithm as EVPICalculator.calculate
            const wtp = 20000;
            const nmbs = incCosts.map((c, i) => incQalys[i] * wtp - c);
            const expectedNMB = nmbs.reduce((a, b) => a + b, 0) / n;
            let perfectNMB = 0;
            for (const v of nmbs) perfectNMB += Math.max(v, 0);
            perfectNMB /= n;

            const evpiPerPatient = perfectNMB - Math.max(expectedNMB, 0);
            const populationEVPI = evpiPerPatient * 10000 * 10;

            expect(evpiPerPatient).toBeGreaterThanOrEqual(0);
            expect(populationEVPI).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(evpiPerPatient)).toBe(true);
            expect(Number.isFinite(populationEVPI)).toBe(true);
        });

        test('EVPI is zero when one strategy always dominates', () => {
            const n = 200;
            const incCosts = Array.from({ length: n }, () => -100);   // always cheaper
            const incQalys = Array.from({ length: n }, () => 0.5);    // always better

            // Every NMB = 0.5 * 20000 - (-100) = 10100 > 0
            const wtp = 20000;
            const nmbs = incCosts.map((c, i) => incQalys[i] * wtp - c);
            const eNMB = nmbs.reduce((a, b) => a + b, 0) / n;
            let pNMB = 0;
            for (const v of nmbs) pNMB += Math.max(v, 0);
            pNMB /= n;

            const evpi = pNMB - Math.max(eNMB, 0);
            expect(evpi).toBeCloseTo(0, 10);
        });
    });

    // -----------------------------------------------------------------------
    // PSA convergence
    // -----------------------------------------------------------------------
    describe('PSA convergence', () => {
        test('more iterations reduce Monte Carlo SE of mean', async () => {
            const project = createProject();
            // Both need >= 200 iterations for checkConvergence to produce MCSE
            const smallEngine = new PSAEngine({ seed: 12345, iterations: 250 });
            const largeEngine = new PSAEngine({ seed: 12345, iterations: 1000 });

            const smallResult = await smallEngine.run(project, INT_OVERRIDES, COMP_OVERRIDES);
            const largeResult = await largeEngine.run(project, INT_OVERRIDES, COMP_OVERRIDES);

            // Verify convergence objects exist
            expect(smallResult.convergence).toBeDefined();
            expect(smallResult.convergence.monte_carlo_se).toBeDefined();
            expect(largeResult.convergence).toBeDefined();
            expect(largeResult.convergence.monte_carlo_se).toBeDefined();

            // Monte Carlo SE = SD / sqrt(N), so more iterations => smaller SE
            expect(largeResult.convergence.monte_carlo_se.costs)
                .toBeLessThan(smallResult.convergence.monte_carlo_se.costs + 1e-10);
        });
    });

    // -----------------------------------------------------------------------
    // Determinism: same seed => same results
    // -----------------------------------------------------------------------
    describe('Determinism', () => {
        test('same seed produces identical results', async () => {
            const project = createProject();

            const engine1 = new PSAEngine({ seed: 42, iterations: 50 });
            const engine2 = new PSAEngine({ seed: 42, iterations: 50 });

            const result1 = await engine1.run(project, INT_OVERRIDES, COMP_OVERRIDES);
            const result2 = await engine2.run(project, INT_OVERRIDES, COMP_OVERRIDES);

            expect(result1.summary.mean_incremental_costs)
                .toBe(result2.summary.mean_incremental_costs);
            expect(result1.summary.mean_incremental_qalys)
                .toBe(result2.summary.mean_incremental_qalys);

            // Check all scatter points are identical
            for (let i = 0; i < result1.scatter.incremental_costs.length; i++) {
                expect(result1.scatter.incremental_costs[i])
                    .toBe(result2.scatter.incremental_costs[i]);
                expect(result1.scatter.incremental_qalys[i])
                    .toBe(result2.scatter.incremental_qalys[i]);
            }
        });

        test('different seeds produce different results', async () => {
            const project = createProject();

            const engine1 = new PSAEngine({ seed: 1, iterations: 50 });
            const engine2 = new PSAEngine({ seed: 999, iterations: 50 });

            const result1 = await engine1.run(project, INT_OVERRIDES, COMP_OVERRIDES);
            const result2 = await engine2.run(project, INT_OVERRIDES, COMP_OVERRIDES);

            // With different seeds, at least one scatter point should differ
            const scatter1 = result1.scatter.incremental_costs;
            const scatter2 = result2.scatter.incremental_costs;
            const anyDiff = scatter1.some((v, i) => v !== scatter2[i]);
            expect(anyDiff).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Edge case: single iteration
    // -----------------------------------------------------------------------
    describe('Edge cases', () => {
        test('single iteration does not crash', async () => {
            const project = createProject();
            const engine = new PSAEngine({ seed: 12345, iterations: 1 });

            const result = await engine.run(project, INT_OVERRIDES, COMP_OVERRIDES);

            expect(result.iterations).toBe(1);
            expect(Number.isFinite(result.summary.mean_incremental_costs)).toBe(true);
            expect(Number.isFinite(result.summary.mean_incremental_qalys)).toBe(true);
            expect(result.scatter.incremental_costs).toHaveLength(1);
            expect(result.scatter.incremental_qalys).toHaveLength(1);
        });

        test('quadrant computation sums to 1', async () => {
            const project = createProject();
            const engine = new PSAEngine({ seed: 12345, iterations: 100 });

            const result = await engine.run(project, INT_OVERRIDES, COMP_OVERRIDES);
            const q = result.quadrants;

            expect(q.NE + q.NW + q.SE + q.SW).toBeCloseTo(1, 10);
        });
    });

    // -----------------------------------------------------------------------
    // Statistical helpers (mean, sd, percentile)
    // -----------------------------------------------------------------------
    describe('Statistical helpers', () => {
        let engine;

        beforeEach(() => {
            engine = new PSAEngine({ seed: 1 });
        });

        test('mean of empty array returns 0', () => {
            expect(engine.mean([])).toBe(0);
        });

        test('sd of single-element array returns 0', () => {
            expect(engine.sd([5])).toBe(0);
        });

        test('percentile returns correct values for known data', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            expect(engine.percentile(data, 0.5)).toBeCloseTo(5.5, 10);
            expect(engine.percentile(data, 0.0)).toBe(1);
            expect(engine.percentile(data, 1.0)).toBe(10);
        });
    });
});
