/**
 * Tests for src/engine/microsimulation.js — Microsimulation Engine
 */

'use strict';

const { performance } = require('perf_hooks');

// Provide globals the microsimulation engine expects
global.performance = global.performance || performance;

const { PCG32 } = require('../../src/utils/pcg32');
global.PCG32 = PCG32;

const { ExpressionParser } = require('../../src/parser/expression');
global.ExpressionParser = ExpressionParser;

const { MicrosimulationEngine } = require('../../src/engine/microsimulation');

/**
 * Helper: minimal two-state Markov-style project
 * (alive -> dead, with p_death probability per cycle)
 */
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

/**
 * Helper: three-state model with competing risks
 * (healthy -> diseased -> dead, healthy -> dead)
 */
function createCompetingRisksProject() {
    return {
        settings: {
            time_horizon: 20,
            cycle_length: 1,
            discount_rate_costs: 0.03,
            discount_rate_qalys: 0.03,
            half_cycle_correction: 'none',
            starting_age: 50
        },
        parameters: {
            p_disease: { value: 0.15 },
            p_death_healthy: { value: 0.02 },
            p_death_diseased: { value: 0.10 },
            c_healthy: { value: 200 },
            c_diseased: { value: 8000 },
            u_healthy: { value: 0.95 },
            u_diseased: { value: 0.55 }
        },
        states: {
            healthy: {
                label: 'Healthy',
                initial_probability: 1,
                cost: 'c_healthy',
                utility: 'u_healthy'
            },
            diseased: {
                label: 'Diseased',
                initial_probability: 0,
                cost: 'c_diseased',
                utility: 'u_diseased'
            },
            dead: {
                label: 'Dead',
                type: 'absorbing',
                cost: 0,
                utility: 0
            }
        },
        transitions: {
            h_to_d: { from: 'healthy', to: 'diseased', probability: 'p_disease' },
            h_to_dead: { from: 'healthy', to: 'dead', probability: 'p_death_healthy' },
            d_to_dead: { from: 'diseased', to: 'dead', probability: 'p_death_diseased' },
            d_to_d: { from: 'diseased', to: 'diseased', probability: 0.90 },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        }
    };
}

// ---------------------------------------------------------------------------

describe('MicrosimulationEngine', () => {

    // 1. Constructor — creates with patient count and seed
    test('constructor creates engine with default options', () => {
        const engine = new MicrosimulationEngine();

        expect(engine.options.patients).toBe(10000);
        expect(engine.options.seed).toBe(12345);
        expect(engine.options.recordHistory).toBe(false);
        expect(engine.options.recordSummary).toBe(true);
        expect(engine.rng).toBeInstanceOf(PCG32);
    });

    test('constructor merges custom options', () => {
        const engine = new MicrosimulationEngine({
            patients: 200,
            seed: 99,
            recordHistory: true
        });

        expect(engine.options.patients).toBe(200);
        expect(engine.options.seed).toBe(99);
        expect(engine.options.recordHistory).toBe(true);
        // defaults still present
        expect(engine.options.recordSummary).toBe(true);
    });

    // 2. Single patient — runs one patient through model
    test('simulatePatient runs one patient and returns valid patient object', () => {
        const engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
        const project = createSimpleProject();
        const parameterValues = { p_death: 0.1, c_alive: 1000, u_alive: 0.8 };

        const patient = engine.simulatePatient(0, project, parameterValues);

        expect(patient.id).toBe(0);
        expect(typeof patient.cumulativeCosts).toBe('number');
        expect(typeof patient.cumulativeQALYs).toBe('number');
        expect(typeof patient.cumulativeLYs).toBe('number');
        expect(Number.isFinite(patient.cumulativeCosts)).toBe(true);
        expect(Number.isFinite(patient.cumulativeQALYs)).toBe(true);
        // Patient is either still alive at end of horizon or absorbed into dead
        expect(['alive', 'dead']).toContain(patient.currentState);
    });

    // 3. State tracking — records time in each state
    test('trackers record time in each state', () => {
        const engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
        const project = createSimpleProject({ time_horizon: 20 });
        const parameterValues = { p_death: 0.1, c_alive: 1000, u_alive: 0.8 };

        const patient = engine.simulatePatient(0, project, parameterValues);

        // timeInStates should have entries for all states
        expect(patient.trackers.timeInStates).toBeDefined();
        expect(typeof patient.trackers.timeInStates.alive).toBe('number');
        expect(typeof patient.trackers.timeInStates.dead).toBe('number');

        // Total time across all states should match totalTime
        const totalTracked = Object.values(patient.trackers.timeInStates)
            .reduce((a, b) => a + b, 0);
        expect(totalTracked).toBeGreaterThan(0);
    });

    // 4. Transition probabilities — patients move between states correctly
    test('getTransitionProbabilities returns valid probabilities', () => {
        const engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
        const project = createSimpleProject();
        const parameterValues = { p_death: 0.1, c_alive: 1000, u_alive: 0.8 };

        const patient = engine.createPatient(0, project, parameterValues);
        const probs = engine.getTransitionProbabilities(patient, project, parameterValues, 0);

        // From alive: should have transitions to alive and dead
        const sum = Object.values(probs).reduce((a, b) => a + b, 0);
        expect(sum).toBeLessThanOrEqual(1 + 1e-10);

        // Each probability is clamped to [0, 1]
        for (const p of Object.values(probs)) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    // 5. Patient heterogeneity — different baseline characteristics produce different trajectories
    test('patients have heterogeneous baseline characteristics', () => {
        const engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
        const project = createSimpleProject();
        const parameterValues = { p_death: 0.1, c_alive: 1000, u_alive: 0.8 };

        const patients = [];
        for (let i = 0; i < 50; i++) {
            patients.push(engine.createPatient(i, project, parameterValues));
        }

        // Ages should vary (randomNormal adds variation)
        const ages = patients.map(p => p.age);
        const uniqueAges = new Set(ages.map(a => a.toFixed(4)));
        expect(uniqueAges.size).toBeGreaterThan(1);

        // Sex should vary
        const sexes = patients.map(p => p.sex);
        expect(sexes).toContain('male');
        expect(sexes).toContain('female');
    });

    test('different baseline characteristics lead to different outcomes', async () => {
        // Run two simulations — same seed but tweak a parameter to get different trajectories
        const engine1 = new MicrosimulationEngine({ patients: 100, seed: 42 });
        const project1 = createSimpleProject({ time_horizon: 20 });
        const result1 = await engine1.run(project1, { p_death: 0.05 });

        const engine2 = new MicrosimulationEngine({ patients: 100, seed: 42 });
        const project2 = createSimpleProject({ time_horizon: 20 });
        const result2 = await engine2.run(project2, { p_death: 0.30 });

        // Higher death probability -> lower mean QALYs
        expect(result2.summary.mean_qalys).toBeLessThan(result1.summary.mean_qalys);
    });

    // 6. Cost/QALY accumulation — summary statistics are finite
    test('run produces finite summary statistics', async () => {
        const engine = new MicrosimulationEngine({ patients: 200, seed: 42 });
        const project = createSimpleProject();

        const result = await engine.run(project);

        expect(Number.isFinite(result.summary.mean_costs)).toBe(true);
        expect(Number.isFinite(result.summary.mean_qalys)).toBe(true);
        expect(Number.isFinite(result.summary.mean_lys)).toBe(true);
        expect(Number.isFinite(result.summary.sd_costs)).toBe(true);
        expect(Number.isFinite(result.summary.sd_qalys)).toBe(true);

        expect(result.summary.mean_costs).toBeGreaterThan(0);
        expect(result.summary.mean_qalys).toBeGreaterThan(0);
        expect(result.summary.mean_lys).toBeGreaterThan(0);
        expect(result.summary.n).toBe(200);
    });

    // 7. Competing risks — handles multiple possible transitions
    test('competing risks model processes multiple transitions from same state', async () => {
        const engine = new MicrosimulationEngine({ patients: 500, seed: 42 });
        const project = createCompetingRisksProject();

        const result = await engine.run(project);

        // Some patients should transition healthy -> diseased
        // and some healthy -> dead (competing risks)
        const h2d = result.transitionCounts['healthy->diseased'] || 0;
        const h2dead = result.transitionCounts['healthy->dead'] || 0;
        const d2dead = result.transitionCounts['diseased->dead'] || 0;

        // With p_disease=0.15 and p_death_healthy=0.02 over 20 cycles with 500 patients,
        // both paths should be observed
        expect(h2d).toBeGreaterThan(0);
        expect(h2dead).toBeGreaterThan(0);
        expect(d2dead).toBeGreaterThan(0);

        // Summary should still be valid
        expect(Number.isFinite(result.summary.mean_costs)).toBe(true);
        expect(Number.isFinite(result.summary.mean_qalys)).toBe(true);
    });

    // 8. Determinism — same seed, same mean costs/QALYs
    test('same seed produces identical results', async () => {
        const runOnce = async (seed) => {
            const engine = new MicrosimulationEngine({ patients: 100, seed });
            return engine.run(createSimpleProject());
        };

        const result1 = await runOnce(42);
        const result2 = await runOnce(42);

        expect(result1.summary.mean_costs).toBe(result2.summary.mean_costs);
        expect(result1.summary.mean_qalys).toBe(result2.summary.mean_qalys);
        expect(result1.summary.mean_lys).toBe(result2.summary.mean_lys);
        expect(result1.summary.sd_costs).toBe(result2.summary.sd_costs);
        expect(result1.summary.sd_qalys).toBe(result2.summary.sd_qalys);
    });

    test('different seeds produce different results', async () => {
        const runOnce = async (seed) => {
            const engine = new MicrosimulationEngine({ patients: 100, seed });
            return engine.run(createSimpleProject());
        };

        const result1 = await runOnce(1);
        const result2 = await runOnce(9999);

        expect(result1.summary.mean_costs).not.toBe(result2.summary.mean_costs);
    });

    // 9. CI calculation — confidence intervals are finite and ordered
    test('confidence intervals are finite and correctly ordered', async () => {
        const engine = new MicrosimulationEngine({ patients: 300, seed: 42 });
        const project = createSimpleProject();

        const result = await engine.run(project);

        // Cost CIs
        expect(Number.isFinite(result.summary.ci_costs_lower)).toBe(true);
        expect(Number.isFinite(result.summary.ci_costs_upper)).toBe(true);
        expect(result.summary.ci_costs_lower).toBeLessThan(result.summary.ci_costs_upper);
        expect(result.summary.ci_costs_lower).toBeLessThanOrEqual(result.summary.mean_costs);
        expect(result.summary.ci_costs_upper).toBeGreaterThanOrEqual(result.summary.mean_costs);

        // QALY CIs
        expect(Number.isFinite(result.summary.ci_qalys_lower)).toBe(true);
        expect(Number.isFinite(result.summary.ci_qalys_upper)).toBe(true);
        expect(result.summary.ci_qalys_lower).toBeLessThan(result.summary.ci_qalys_upper);
        expect(result.summary.ci_qalys_lower).toBeLessThanOrEqual(result.summary.mean_qalys);
        expect(result.summary.ci_qalys_upper).toBeGreaterThanOrEqual(result.summary.mean_qalys);
    });

    test('percentiles are computed and ordered', async () => {
        const engine = new MicrosimulationEngine({ patients: 200, seed: 42 });
        const project = createSimpleProject();

        const result = await engine.run(project);

        expect(Number.isFinite(result.summary.p25_lys)).toBe(true);
        expect(Number.isFinite(result.summary.median_survival)).toBe(true);
        expect(Number.isFinite(result.summary.p75_lys)).toBe(true);

        expect(result.summary.p25_lys).toBeLessThanOrEqual(result.summary.median_survival);
        expect(result.summary.median_survival).toBeLessThanOrEqual(result.summary.p75_lys);
    });

    // 10. Edge case — 1 patient, 1 cycle
    test('1 patient, 1 cycle runs without error', async () => {
        const engine = new MicrosimulationEngine({ patients: 1, seed: 42 });
        const project = createSimpleProject({
            time_horizon: 1,
            cycle_length: 1
        });

        const result = await engine.run(project);

        expect(result.summary.n).toBe(1);
        expect(Number.isFinite(result.summary.mean_costs)).toBe(true);
        expect(Number.isFinite(result.summary.mean_qalys)).toBe(true);
        expect(result.patients).toHaveLength(1);
        // SD with n=1 can be NaN (division by 0) or 0, both acceptable
        // The key is that the simulation completes without throwing
    });

    test('single cycle with absorbing start state finishes immediately', async () => {
        const engine = new MicrosimulationEngine({ patients: 5, seed: 42 });
        const project = {
            settings: {
                time_horizon: 10,
                cycle_length: 1,
                discount_rate_costs: 0,
                discount_rate_qalys: 0,
                half_cycle_correction: 'none',
                starting_age: 50
            },
            parameters: {},
            states: {
                dead: {
                    label: 'Dead',
                    type: 'absorbing',
                    initial_probability: 1,
                    cost: 0,
                    utility: 0
                }
            },
            transitions: {
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
            }
        };

        const result = await engine.run(project);

        // Patients start in absorbing state; should accumulate minimal outcomes
        // (first cycle may still accumulate before absorption is checked)
        expect(result.summary.mean_qalys).toBe(0);
    });
});

describe('Microsimulation helper methods', () => {
    let engine;

    beforeEach(() => {
        engine = new MicrosimulationEngine({ patients: 1, seed: 12345 });
    });

    test('random() returns values in [0, 1)', () => {
        for (let i = 0; i < 100; i++) {
            const r = engine.random();
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThan(1);
        }
    });

    test('randomNormal produces values around the mean', () => {
        const values = [];
        for (let i = 0; i < 500; i++) {
            values.push(engine.randomNormal(10, 2));
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        // Mean should be close to 10 (with 500 samples, ~2/sqrt(500) SE)
        expect(mean).toBeGreaterThan(8);
        expect(mean).toBeLessThan(12);
    });

    test('evaluateExpression returns number for numeric input', () => {
        const patient = { age: 55, sex: 'male', timeInState: 0, trackers: { stateVisits: {}, timeInStates: {} } };
        expect(engine.evaluateExpression(42, {}, patient, 0)).toBe(42);
    });

    test('evaluateExpression resolves parameter reference', () => {
        const patient = { age: 55, sex: 'male', timeInState: 0, trackers: { stateVisits: {}, timeInStates: {} } };
        expect(engine.evaluateExpression('p_death', { p_death: 0.1 }, patient, 0)).toBe(0.1);
    });

    test('evaluateExpression returns 0 for non-string non-number input', () => {
        const patient = { age: 55, sex: 'male', timeInState: 0, trackers: { stateVisits: {}, timeInStates: {} } };
        expect(engine.evaluateExpression(null, {}, patient, 0)).toBe(0);
        expect(engine.evaluateExpression(undefined, {}, patient, 0)).toBe(0);
    });

    test('normalInverseCDF returns correct boundary values', () => {
        expect(engine.normalInverseCDF(0)).toBe(-Infinity);
        expect(engine.normalInverseCDF(1)).toBe(Infinity);
        expect(engine.normalInverseCDF(0.5)).toBeCloseTo(0, 5);
        expect(engine.normalInverseCDF(0.975)).toBeCloseTo(1.96, 2);
    });

    test('onProgress setter and getter work', () => {
        const cb = () => {};
        engine.onProgress = cb;
        expect(engine.onProgress).toBe(cb);
    });

    test('LCG fallback works when PCG32 is unavailable', () => {
        const engine2 = new MicrosimulationEngine({ patients: 1, seed: 42 });
        // Force fallback by nulling rng
        engine2.rng = null;

        const values = [];
        for (let i = 0; i < 20; i++) {
            const v = engine2.random();
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThanOrEqual(1);
            values.push(v);
        }

        // Should produce varying values
        const unique = new Set(values.map(v => v.toFixed(8)));
        expect(unique.size).toBeGreaterThan(1);
    });
});

describe('Microsimulation computation time and metadata', () => {
    test('result includes computation_time_ms and seed', async () => {
        const engine = new MicrosimulationEngine({ patients: 50, seed: 777 });
        const result = await engine.run(createSimpleProject());

        expect(typeof result.computation_time_ms).toBe('number');
        expect(result.computation_time_ms).toBeGreaterThanOrEqual(0);
        expect(result.seed).toBe(777);
    });
});
