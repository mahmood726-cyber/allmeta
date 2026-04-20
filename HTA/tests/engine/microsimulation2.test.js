/**
 * Additional tests for src/engine/microsimulation.js
 * Targeting uncovered lines: 114-259, 409-420, 679-896
 * Focus: beta distribution, log-gamma, incomplete beta, expression fallback,
 *        summary stats, CI, percentiles, PSA, sampleDistribution, randomGamma
 */

'use strict';

const { performance } = require('perf_hooks');
global.performance = global.performance || performance;

const { PCG32 } = require('../../src/utils/pcg32');
global.PCG32 = PCG32;

const { ExpressionParser } = require('../../src/parser/expression');
global.ExpressionParser = ExpressionParser;

const { MicrosimulationEngine } = require('../../src/engine/microsimulation');

function createSimpleProject(overrides = {}) {
    return {
        settings: {
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 55,
            ...overrides
        },
        parameters: {
            p_death: { value: 0.1 },
            c_alive: { value: 1000 },
            u_alive: { value: 0.8 }
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
            alive_to_alive: { from: 'alive', to: 'alive', probability: 0.9 },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        }
    };
}

// ---------------------------------------------------------------------------
// Beta distribution and related math functions (lines 114-259)
// ---------------------------------------------------------------------------

describe('Beta distribution functions', () => {
    let engine;

    beforeEach(() => {
        engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
    });

    test('randomBeta returns values in (0, 1)', () => {
        for (let i = 0; i < 50; i++) {
            const val = engine.randomBeta(2, 5);
            expect(val).toBeGreaterThan(0);
            expect(val).toBeLessThan(1);
        }
    });

    test('randomBeta with equal alpha/beta centers around 0.5', () => {
        const values = [];
        for (let i = 0; i < 200; i++) {
            values.push(engine.randomBeta(10, 10));
        }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        expect(mean).toBeGreaterThan(0.35);
        expect(mean).toBeLessThan(0.65);
    });

    test('randomBeta with skewed parameters is skewed', () => {
        const values = [];
        for (let i = 0; i < 200; i++) {
            values.push(engine.randomBeta(2, 8));
        }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        // Expected mean = alpha/(alpha+beta) = 2/10 = 0.2
        expect(mean).toBeGreaterThan(0.1);
        expect(mean).toBeLessThan(0.4);
    });

    test('betaInverseCDF handles boundary values', () => {
        expect(engine.betaInverseCDF(0, 2, 5)).toBe(0);
        expect(engine.betaInverseCDF(1, 2, 5)).toBe(1);
    });

    test('betaInverseCDF returns values for interior p', () => {
        const val = engine.betaInverseCDF(0.5, 2, 2);
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThan(1);
        // Beta(2,2) is symmetric, so median should be ~0.5
        expect(val).toBeCloseTo(0.5, 1);
    });

    test('betaCDF handles boundary values', () => {
        expect(engine.betaCDF(0, 2, 5)).toBe(0);
        expect(engine.betaCDF(1, 2, 5)).toBe(1);
    });

    test('betaCDF returns monotonically increasing values', () => {
        let prev = 0;
        for (let x = 0.1; x <= 0.9; x += 0.1) {
            const cdf = engine.betaCDF(x, 2, 5);
            expect(cdf).toBeGreaterThanOrEqual(prev - 1e-10);
            prev = cdf;
        }
    });

    test('betaPDF returns 0 at boundaries', () => {
        expect(engine.betaPDF(0, 2, 5)).toBe(0);
        expect(engine.betaPDF(1, 2, 5)).toBe(0);
    });

    test('betaPDF returns positive values for interior x', () => {
        const pdf = engine.betaPDF(0.3, 2, 5);
        expect(pdf).toBeGreaterThan(0);
    });

    test('betaFunction returns positive value', () => {
        const B = engine.betaFunction(2, 5);
        expect(B).toBeGreaterThan(0);
        expect(Number.isFinite(B)).toBe(true);
    });

    test('logGamma handles x < 0.5 reflection', () => {
        // logGamma(0.3) should be finite and use the reflection formula
        const val = engine.logGamma(0.3);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('logGamma matches known values', () => {
        // Gamma(1) = 1, so logGamma(1) = 0
        expect(engine.logGamma(1)).toBeCloseTo(0, 5);
        // Gamma(2) = 1, so logGamma(2) = 0
        expect(engine.logGamma(2)).toBeCloseTo(0, 5);
        // Gamma(0.5) = sqrt(pi) ≈ 1.7724, logGamma(0.5) ≈ 0.5724
        expect(engine.logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 3);
    });

    test('incompleteBeta handles edge values', () => {
        expect(engine.incompleteBeta(0, 2, 3)).toBe(0);
        expect(engine.incompleteBeta(1, 2, 3)).toBe(1);
    });

    test('incompleteBeta uses continued fraction for large x', () => {
        // When x >= (a+1)/(a+b+2), should use 1 - bt*cf(1-x,b,a)/b branch
        const val = engine.incompleteBeta(0.8, 2, 2);
        expect(val).toBeGreaterThan(0.5);
        expect(val).toBeLessThan(1);
    });

    test('betaContinuedFraction returns finite value', () => {
        const val = engine.betaContinuedFraction(0.3, 2, 5);
        expect(Number.isFinite(val)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Expression evaluation fallback paths (lines 409-420)
// ---------------------------------------------------------------------------

describe('Expression evaluation fallback paths', () => {
    let engine;

    beforeEach(() => {
        engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
    });

    test('evaluateExpression uses simple identifier fallback', () => {
        // Test the regex path for simple identifiers
        const patient = { age: 55, sex: 'male', timeInState: 0, trackers: { stateVisits: {}, timeInStates: {} } };
        // Direct parameter reference should work via the regex path too
        const val = engine.evaluateExpression('myParam', { myParam: 42 }, patient, 0);
        expect(val).toBe(42);
    });

    test('evaluateExpression falls back to parseFloat for numeric strings', () => {
        const patient = { age: 55, sex: 'male', timeInState: 0, trackers: { stateVisits: {}, timeInStates: {} } };
        const val = engine.evaluateExpression('3.14', {}, patient, 0);
        expect(val).toBeCloseTo(3.14, 10);
    });

    test('evaluateExpression returns 0 for unparseable string', () => {
        const patient = { age: 55, sex: 'male', timeInState: 0, trackers: { stateVisits: {}, timeInStates: {} } };
        const val = engine.evaluateExpression('not_a_number_and_not_a_param', {}, patient, 0);
        expect(val).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Run summary statistics (lines 679-734)
// ---------------------------------------------------------------------------

describe('Run summary statistics coverage', () => {
    test('SD, CI, median, and percentiles are computed correctly', async () => {
        const engine = new MicrosimulationEngine({ patients: 100, seed: 42 });
        const project = createSimpleProject({ time_horizon: 15 });
        const result = await engine.run(project);

        // Standard deviations
        expect(result.summary.sd_costs).toBeGreaterThan(0);
        expect(result.summary.sd_qalys).toBeGreaterThan(0);

        // Confidence intervals
        expect(result.summary.ci_costs_lower).toBeLessThan(result.summary.mean_costs);
        expect(result.summary.ci_costs_upper).toBeGreaterThan(result.summary.mean_costs);
        expect(result.summary.ci_qalys_lower).toBeLessThan(result.summary.mean_qalys);
        expect(result.summary.ci_qalys_upper).toBeGreaterThan(result.summary.mean_qalys);

        // Median and percentiles
        expect(result.summary.median_survival).toBeGreaterThan(0);
        expect(result.summary.p25_lys).toBeLessThanOrEqual(result.summary.median_survival);
        expect(result.summary.p75_lys).toBeGreaterThanOrEqual(result.summary.median_survival);
    });

    test('transition counts are aggregated', async () => {
        const engine = new MicrosimulationEngine({ patients: 50, seed: 42 });
        const project = createSimpleProject();
        const result = await engine.run(project);

        expect(result.transitionCounts).toBeDefined();
        const totalTransitions = Object.values(result.transitionCounts).reduce((a, b) => a + b, 0);
        expect(totalTransitions).toBeGreaterThan(0);
    });

    test('computation time and seed are recorded', async () => {
        const engine = new MicrosimulationEngine({ patients: 20, seed: 123 });
        const project = createSimpleProject();
        const result = await engine.run(project);

        expect(result.computation_time_ms).toBeGreaterThanOrEqual(0);
        expect(result.seed).toBe(123);
    });
});

// ---------------------------------------------------------------------------
// PSA integration (lines 739-835)
// ---------------------------------------------------------------------------

describe('runWithPSA', () => {
    test('returns PSA results with correct structure', async () => {
        const engine = new MicrosimulationEngine({ patients: 10, seed: 42 });
        const project = createSimpleProject({ time_horizon: 5 });
        project.parameters.p_death.distribution = { type: 'beta', alpha: 10, beta: 90 };

        const result = await engine.runWithPSA(project, {}, {}, {
            iterations: 3,
            patientsPerIteration: 10
        });

        expect(result.iterations).toBe(3);
        expect(result.patientsPerIteration).toBe(10);
        expect(result.intervention.costs).toHaveLength(3);
        expect(result.intervention.qalys).toHaveLength(3);
        expect(result.comparator.costs).toHaveLength(3);
        expect(result.comparator.qalys).toHaveLength(3);
        expect(result.incremental.costs).toHaveLength(3);
        expect(result.incremental.qalys).toHaveLength(3);
        expect(result.incremental.nmb).toHaveLength(3);
    });

    test('PSA summary includes ICER and probability CE', async () => {
        const engine = new MicrosimulationEngine({ patients: 10, seed: 42 });
        const project = createSimpleProject({ time_horizon: 5 });

        const result = await engine.runWithPSA(project, {}, {}, {
            iterations: 3,
            patientsPerIteration: 10
        });

        expect(result.summary).toBeDefined();
        expect(Number.isFinite(result.summary.mean_incremental_costs)).toBe(true);
        expect(Number.isFinite(result.summary.mean_incremental_qalys)).toBe(true);
        expect(result.summary.prob_ce).toBeDefined();
        expect(result.summary.wtp_thresholds).toBeDefined();
    });

    test('PSA with parameter overrides uses them', async () => {
        const engine = new MicrosimulationEngine({ patients: 10, seed: 42 });
        const project = createSimpleProject({ time_horizon: 5 });

        const result = await engine.runWithPSA(
            project,
            { c_alive: 'c_alive' },
            {},
            { iterations: 2, patientsPerIteration: 10 }
        );

        expect(result.iterations).toBe(2);
        expect(result.intervention.costs).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// sampleDistribution (lines 840-867)
// ---------------------------------------------------------------------------

describe('sampleDistribution', () => {
    let engine;

    beforeEach(() => {
        engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
    });

    test('beta distribution returns value in (0, 1)', () => {
        const val = engine.sampleDistribution({ type: 'beta', alpha: 2, beta: 5 }, 0.3);
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThan(1);
    });

    test('gamma distribution returns positive value', () => {
        const val = engine.sampleDistribution({ type: 'gamma', mean: 1000, se: 100 }, 1000);
        expect(val).toBeGreaterThan(0);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('normal distribution returns finite value', () => {
        const val = engine.sampleDistribution({ type: 'normal', mean: 0.5, sd: 0.1 }, 0.5);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('lognormal distribution returns positive value', () => {
        const val = engine.sampleDistribution({ type: 'lognormal', meanlog: 0, sdlog: 0.2 }, 1);
        expect(val).toBeGreaterThan(0);
    });

    test('unknown distribution returns baseValue', () => {
        const val = engine.sampleDistribution({ type: 'unknown' }, 42);
        expect(val).toBe(42);
    });

    test('null type returns baseValue', () => {
        const val = engine.sampleDistribution({}, 99);
        expect(val).toBe(99);
    });
});

// ---------------------------------------------------------------------------
// randomGamma (lines 872-899)
// ---------------------------------------------------------------------------

describe('randomGamma', () => {
    let engine;

    beforeEach(() => {
        engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
    });

    test('returns positive values for shape >= 1', () => {
        for (let i = 0; i < 20; i++) {
            const val = engine.randomGamma(2, 1);
            expect(val).toBeGreaterThan(0);
        }
    });

    test('returns positive values for shape < 1', () => {
        for (let i = 0; i < 20; i++) {
            const val = engine.randomGamma(0.5, 1);
            expect(val).toBeGreaterThan(0);
        }
    });

    test('mean approximates shape * scale', () => {
        const shape = 3;
        const scale = 2;
        const values = [];
        for (let i = 0; i < 500; i++) {
            values.push(engine.randomGamma(shape, scale));
        }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        // Expected mean = shape * scale = 6
        expect(mean).toBeGreaterThan(3);
        expect(mean).toBeLessThan(10);
    });
});
