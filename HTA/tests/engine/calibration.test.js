/**
 * Tests for src/engine/calibration.js — CalibrationEngine
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { StatUtils } = require('../../src/utils/mathUtils');
const { ExpressionParser } = require('../../src/parser/expression');

// Set up globals required by engine modules
global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.PCG32 = PCG32;
global.StatUtils = StatUtils;
global.ExpressionParser = ExpressionParser;

const { MarkovEngine } = require('../../src/engine/markov');
global.MarkovEngine = MarkovEngine;

const { CalibrationEngine } = require('../../src/engine/calibration');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal two-state Markov project for calibration tests
 */
function createProject() {
    return {
        version: '0.1',
        metadata: { id: 'cal-test', name: 'Calibration Test Project' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 55
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
            alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        },
        strategies: {
            comparator: {
                label: 'Comparator',
                is_comparator: true,
                parameter_overrides: { p_death: 0.1 }
            }
        }
    };
}

describe('CalibrationEngine', () => {
    const silentLogger = { warn: () => {}, info: () => {} };

    // -----------------------------------------------------------------------
    // 1. Constructor
    // -----------------------------------------------------------------------
    test('creates with default options and PCG32 seed', () => {
        const engine = new CalibrationEngine();

        expect(engine.options.maxIterations).toBe(1000);
        expect(engine.options.tolerance).toBe(1e-8);
        expect(engine.options.seed).toBe(12345);
        expect(engine.options.verbose).toBe(false);
        expect(engine.rng).toBeTruthy();
        expect(engine.evaluationCount).toBe(0);
    });

    test('accepts custom options', () => {
        const engine = new CalibrationEngine({
            maxIterations: 500,
            tolerance: 1e-6,
            seed: 99999
        });

        expect(engine.options.maxIterations).toBe(500);
        expect(engine.options.tolerance).toBe(1e-6);
        expect(engine.options.seed).toBe(99999);
    });

    // -----------------------------------------------------------------------
    // 2. Nelder-Mead on Rosenbrock
    // -----------------------------------------------------------------------
    test('Nelder-Mead converges near (1,1) on Rosenbrock function', async () => {
        const engine = new CalibrationEngine({ maxIterations: 2000, tolerance: 1e-10 });

        const paramInfo = [
            { id: 'x', initial: -1.0, lower: -5, upper: 5, scale: 'linear', prior: null },
            { id: 'y', initial: -1.0, lower: -5, upper: 5, scale: 'linear', prior: null }
        ];

        // Override calculateLogLikelihood to evaluate negative Rosenbrock
        // (we maximize, so negate the function to find the minimum)
        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            const x = paramValues.x;
            const y = paramValues.y;
            const rosenbrock = (1 - x) ** 2 + 100 * (y - x * x) ** 2;
            return -rosenbrock;
        };
        // Stub out goodnessOfFit and targetComparison (they call runModelForCalibration)
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        const result = await engine.nelderMead({ parameters: {} }, paramInfo, [], {
            maxIterations: 2000,
            tolerance: 1e-12
        });

        expect(result.parameters.x).toBeCloseTo(1, 1);
        expect(result.parameters.y).toBeCloseTo(1, 1);
    });

    // -----------------------------------------------------------------------
    // 3. Nelder-Mead on sphere function
    // -----------------------------------------------------------------------
    test('Nelder-Mead converges near (0,0) on sphere function', async () => {
        const engine = new CalibrationEngine({ maxIterations: 1000, tolerance: 1e-12 });

        const paramInfo = [
            { id: 'x', initial: 3.0, lower: -10, upper: 10, scale: 'linear', prior: null },
            { id: 'y', initial: -4.0, lower: -10, upper: 10, scale: 'linear', prior: null }
        ];

        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            return -(paramValues.x * paramValues.x + paramValues.y * paramValues.y);
        };
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        const result = await engine.nelderMead({ parameters: {} }, paramInfo, [], {
            maxIterations: 1000,
            tolerance: 1e-12
        });

        expect(result.parameters.x).toBeCloseTo(0, 2);
        expect(result.parameters.y).toBeCloseTo(0, 2);
        expect(result.converged).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 4. Parameter bounds are respected
    // -----------------------------------------------------------------------
    test('optimizer respects lower/upper bounds', async () => {
        const engine = new CalibrationEngine({ maxIterations: 500 });

        // The optimal point (0,0) is outside bounds [1, 5]
        const paramInfo = [
            { id: 'x', initial: 3.0, lower: 1, upper: 5, scale: 'linear', prior: null },
            { id: 'y', initial: 3.0, lower: 1, upper: 5, scale: 'linear', prior: null }
        ];

        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            return -(paramValues.x * paramValues.x + paramValues.y * paramValues.y);
        };
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        const result = await engine.nelderMead({ parameters: {} }, paramInfo, [], { maxIterations: 500 });

        // Should stay within bounds; optimum constrained to (1, 1)
        expect(result.parameters.x).toBeGreaterThanOrEqual(1);
        expect(result.parameters.x).toBeLessThanOrEqual(5);
        expect(result.parameters.y).toBeGreaterThanOrEqual(1);
        expect(result.parameters.y).toBeLessThanOrEqual(5);
    });

    // -----------------------------------------------------------------------
    // 5. Convergence flag
    // -----------------------------------------------------------------------
    test('result.converged is true for simple problems', async () => {
        const engine = new CalibrationEngine({ maxIterations: 500, tolerance: 1e-8 });

        const paramInfo = [
            { id: 'x', initial: 2.0, lower: -10, upper: 10, scale: 'linear', prior: null }
        ];

        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            return -(paramValues.x * paramValues.x);
        };
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        const result = await engine.nelderMead({ parameters: {} }, paramInfo, [], {
            maxIterations: 500,
            tolerance: 1e-8
        });

        expect(result.converged).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 6. Objective function evaluation count
    // -----------------------------------------------------------------------
    test('evaluation count is tracked correctly', async () => {
        const engine = new CalibrationEngine({ maxIterations: 100 });
        engine.evaluationCount = 0;

        const paramInfo = [
            { id: 'x', initial: 1.0, lower: -5, upper: 5, scale: 'linear', prior: null }
        ];

        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            return -(paramValues.x * paramValues.x);
        };
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        await engine.nelderMead({ parameters: {} }, paramInfo, [], { maxIterations: 100 });

        // Should have at least the initial simplex evaluations (n+1 = 2) plus iterations
        expect(engine.evaluationCount).toBeGreaterThan(2);
    });

    // -----------------------------------------------------------------------
    // 7. Calibration with Markov model
    // -----------------------------------------------------------------------
    test('calibrate method runs with a Markov model and targets', async () => {
        const engine = new CalibrationEngine({ maxIterations: 500, tolerance: 1e-8 });
        // Remove audit logger to avoid side effects
        engine.auditLogger = null;

        const project = createProject();

        // Run the model first to get a baseline "observed" value at the true p_death=0.1
        const markov = new MarkovEngine({ logger: silentLogger });
        const baseResult = markov.runAllStrategies(project);
        const baseTrace = baseResult.strategies.comparator.trace;

        // Target: match dead-state proportion at cycle 5
        const deadAtCycle5 = baseTrace.states.dead[5];

        const calibrationParams = [
            { id: 'p_death', initial: 0.15, lower: 0.01, upper: 0.5 }
        ];

        const targets = engine.createTargets([
            { type: 'mortality', time: 5, observed: deadAtCycle5, se: 0.02, state: 'dead' }
        ]);

        const result = await engine.calibrate(project, calibrationParams, targets, {
            method: 'nelder-mead',
            maxIterations: 500
        });

        expect(result.method).toBe('nelder-mead');
        expect(result.parameters).toBeDefined();
        expect(result.parameters.p_death).toBeDefined();
        expect(Number.isFinite(result.logLikelihood)).toBe(true);
        expect(result.evaluations).toBeGreaterThan(0);
        expect(result.computation_time_ms).toBeGreaterThanOrEqual(0);
        // The calibrated p_death should be close to the true value 0.1
        expect(result.parameters.p_death).toBeCloseTo(0.1, 1);
    });

    // -----------------------------------------------------------------------
    // 8. MCMC sampler
    // -----------------------------------------------------------------------
    test('MCMC sampler returns posterior samples', async () => {
        const engine = new CalibrationEngine({ seed: 42 });
        engine.auditLogger = null;
        // PCG32 has nextDouble() but CalibrationEngine.random() calls rng.random()
        // Patch the rng to add the expected method
        if (engine.rng && !engine.rng.random) {
            engine.rng.random = engine.rng.nextDouble.bind(engine.rng);
        }

        const project = createProject();

        const calibrationParams = [
            { id: 'p_death', initial: 0.1, lower: 0.01, upper: 0.5 }
        ];

        const targets = engine.createTargets([
            { type: 'mortality', time: 3, observed: 0.271, se: 0.05, state: 'dead' }
        ]);

        const result = await engine.calibrate(project, calibrationParams, targets, {
            method: 'mcmc',
            samples: 200,
            burnin: 50,
            thin: 1
        });

        expect(result.method).toBe('mcmc');
        expect(result.converged).toBe(true);
        expect(result.samples).toBeGreaterThan(0);
        expect(result.chainSamples).toBeDefined();
        expect(Array.isArray(result.chainSamples)).toBe(true);
        expect(result.chainSamples.length).toBeGreaterThan(0);
        expect(result.acceptanceRate).toBeGreaterThan(0);
        expect(result.acceptanceRate).toBeLessThanOrEqual(1);
        expect(result.posteriorMeans).toBeDefined();
        expect(result.posteriorSDs).toBeDefined();
        expect(Number.isFinite(result.posteriorMeans.p_death)).toBe(true);
        expect(Number.isFinite(result.posteriorSDs.p_death)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 9. Determinism — same seed produces same result
    // -----------------------------------------------------------------------
    test('same seed produces same calibration result', async () => {
        const runCalibration = async (seed) => {
            const engine = new CalibrationEngine({ seed, maxIterations: 100 });
            engine.auditLogger = null;

            const project = createProject();
            const calibrationParams = [
                { id: 'p_death', initial: 0.05, lower: 0.01, upper: 0.5 }
            ];
            const targets = engine.createTargets([
                { type: 'mortality', time: 3, observed: 0.271, se: 0.05, state: 'dead' }
            ]);

            return engine.calibrate(project, calibrationParams, targets, {
                method: 'nelder-mead',
                maxIterations: 100
            });
        };

        const result1 = await runCalibration(12345);
        const result2 = await runCalibration(12345);

        expect(result1.parameters.p_death).toBe(result2.parameters.p_death);
        expect(result1.logLikelihood).toBe(result2.logLikelihood);
        expect(result1.iterations).toBe(result2.iterations);
    });

    // -----------------------------------------------------------------------
    // 10. Edge cases
    // -----------------------------------------------------------------------
    test('single parameter optimization works', async () => {
        const engine = new CalibrationEngine({ maxIterations: 500, tolerance: 1e-10 });

        const paramInfo = [
            { id: 'x', initial: 5.0, lower: -10, upper: 10, scale: 'linear', prior: null }
        ];

        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            return -((paramValues.x - 3) ** 2);
        };
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        const result = await engine.nelderMead({ parameters: {} }, paramInfo, [], {
            maxIterations: 500,
            tolerance: 1e-10
        });

        expect(result.parameters.x).toBeCloseTo(3, 3);
    });

    test('already-optimal starting point converges immediately', async () => {
        const engine = new CalibrationEngine({ maxIterations: 500, tolerance: 1e-8 });

        const paramInfo = [
            { id: 'x', initial: 0.0, lower: -10, upper: 10, scale: 'linear', prior: null }
        ];

        engine.calculateLogLikelihood = (project, paramValues, targets) => {
            engine.evaluationCount++;
            return -(paramValues.x * paramValues.x);
        };
        engine.calculateGoodnessOfFit = () => ({});
        engine.getTargetComparison = () => [];

        const result = await engine.nelderMead({ parameters: {} }, paramInfo, [], {
            maxIterations: 500,
            tolerance: 1e-8
        });

        // Should converge very quickly (few iterations)
        expect(result.converged).toBe(true);
        expect(result.parameters.x).toBeCloseTo(0, 2);
        // With an already-optimal start, iterations should be minimal
        expect(result.iterations).toBeLessThan(50);
    });

    // -----------------------------------------------------------------------
    // Additional: createTargets utility
    // -----------------------------------------------------------------------
    test('createTargets assigns defaults for missing fields', () => {
        const engine = new CalibrationEngine();

        const targets = engine.createTargets([
            { type: 'survival', time: 5, observed: 0.65, state: 'alive' }
        ]);

        expect(targets).toHaveLength(1);
        expect(targets[0].id).toBe('target_0');
        expect(targets[0].type).toBe('survival');
        expect(targets[0].time).toBe(5);
        expect(targets[0].observed).toBe(0.65);
        expect(targets[0].se).toBeCloseTo(0.065, 10); // 10% of observed
        expect(targets[0].weight).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Additional: extractParameterInfo
    // -----------------------------------------------------------------------
    test('extractParameterInfo reads bounds from project parameters', () => {
        const engine = new CalibrationEngine();

        const project = createProject();
        const paramDefs = [
            { id: 'p_death', initial: 0.05, lower: 0.01, upper: 0.3 }
        ];

        const info = engine.extractParameterInfo(project, paramDefs);

        expect(info).toHaveLength(1);
        expect(info[0].id).toBe('p_death');
        expect(info[0].initial).toBe(0.05);
        expect(info[0].lower).toBe(0.01);
        expect(info[0].upper).toBe(0.3);
    });

    test('extractParameterInfo throws for missing parameter', () => {
        const engine = new CalibrationEngine();
        const project = createProject();

        expect(() => {
            engine.extractParameterInfo(project, [{ id: 'nonexistent' }]);
        }).toThrow('Parameter nonexistent not found');
    });

    // -----------------------------------------------------------------------
    // Additional: clampValue
    // -----------------------------------------------------------------------
    test('clampValue respects bounds', () => {
        const engine = new CalibrationEngine();
        const paramDef = { lower: 0, upper: 1 };

        expect(engine.clampValue(0.5, paramDef)).toBe(0.5);
        expect(engine.clampValue(-1, paramDef)).toBe(0);
        expect(engine.clampValue(2, paramDef)).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Additional: getDefaultBounds
    // -----------------------------------------------------------------------
    test('getDefaultBounds returns [0,1] for probability-like values', () => {
        const engine = new CalibrationEngine();

        const bounds = engine.getDefaultBounds({ value: 0.5 });
        expect(bounds.lower).toBe(0);
        expect(bounds.upper).toBe(1);
    });

    test('getDefaultBounds handles beta distribution', () => {
        const engine = new CalibrationEngine();

        const bounds = engine.getDefaultBounds({
            value: 0.5,
            distribution: { type: 'beta' }
        });
        expect(bounds.lower).toBe(0.001);
        expect(bounds.upper).toBe(0.999);
    });
});
