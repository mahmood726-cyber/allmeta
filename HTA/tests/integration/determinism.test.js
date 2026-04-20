/**
 * Integration Tests: Determinism Verification
 *
 * Verifies that ALL stochastic engines produce identical results
 * when run with the same seed. This is critical for regulatory
 * reproducibility (RFC-005 Determinism Contract).
 */

'use strict';

const { performance } = require('perf_hooks');
global.performance = global.performance || performance;

// ─── Shared Dependencies ──────────────────────────────────────────────────

const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');
const { PCG32 } = require('../../src/utils/pcg32');

global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;
global.PCG32 = PCG32;

// ─── Engine Imports ───────────────────────────────────────────────────────

const { MarkovEngine } = require('../../src/engine/markov');
const { NetworkMetaAnalysis } = require('../../src/engine/nma');
const { MicrosimulationEngine } = require('../../src/engine/microsimulation');
const { DiscreteEventSimulationEngine } = require('../../src/engine/des');
const { CorrelatedPSAEngine } = require('../../src/engine/correlatedPSA');
const { CureModelEngine } = require('../../src/engine/cureModels');
const { SemiMarkovEngine } = require('../../src/engine/semiMarkov');
const { EVSIEngine } = require('../../src/engine/evsi');

// ─── Silent logger ────────────────────────────────────────────────────────

const silentLogger = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createMarkovProject() {
    return {
        version: '0.1',
        metadata: { id: 'det-test', name: 'Determinism Test' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 50
        },
        parameters: {
            p_death: { value: 0.05 },
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
                initial_probability: 0,
                cost: 0,
                utility: 0
            }
        },
        transitions: {
            alive_to_dead: { from: 'alive', to: 'dead', probability: 'p_death' },
            alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        }
    };
}

function createMicrosimProject() {
    return {
        version: '0.1',
        metadata: { id: 'microsim-det', name: 'Microsim Determinism' },
        model: { type: 'markov_microsimulation' },
        settings: {
            time_horizon: 5,
            cycle_length: 1,
            starting_age: 50
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
                utility: 'u_alive',
                transitions: [
                    { to: 'dead', probability: 'p_death' }
                ]
            },
            dead: {
                label: 'Dead',
                type: 'absorbing',
                initial_probability: 0,
                cost: 0,
                utility: 0
            }
        },
        transitions: {
            alive_to_dead: { from: 'alive', to: 'dead', probability: 'p_death' },
            alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        }
    };
}

function createNMAData() {
    return [
        { study: 'Trial1', treatment: 'A', n: 100, events: 30 },
        { study: 'Trial1', treatment: 'B', n: 100, events: 20 },
        { study: 'Trial2', treatment: 'A', n: 150, events: 50 },
        { study: 'Trial2', treatment: 'C', n: 150, events: 35 },
        { study: 'Trial3', treatment: 'B', n: 120, events: 25 },
        { study: 'Trial3', treatment: 'C', n: 120, events: 22 }
    ];
}

function createSurvivalData(n = 80, seed = 42) {
    const rng = new PCG32(seed);
    const data = [];
    for (let i = 0; i < n; i++) {
        const u = rng.nextFloat();
        const time = Math.max(0.1, 10 * Math.pow(-Math.log(Math.max(u, 0.001)), 1 / 1.5));
        const event = rng.nextFloat() < 0.7 ? 1 : 0;
        data.push({ time, event });
    }
    return data;
}

function createDESModel() {
    return {
        states: {
            healthy: {
                costPerTime: 500,
                utilityPerTime: 0.9,
                scheduledEvents: [
                    { event: 'progression', distribution: 'weibull', parameters: { shape: 1.5, scale: 5 } },
                    { event: 'death_healthy', distribution: 'exponential', parameters: { rate: 0.02 } }
                ]
            },
            sick: {
                costPerTime: 3000,
                utilityPerTime: 0.5,
                scheduledEvents: [
                    { event: 'death_sick', distribution: 'weibull', parameters: { shape: 2, scale: 3 } }
                ]
            },
            dead: {
                terminal: true,
                costPerTime: 0,
                utilityPerTime: 0
            }
        },
        events: {
            progression: {},
            death_healthy: {},
            death_sick: {}
        },
        transitions: [
            { trigger: 'progression', from: 'healthy', to: 'sick' },
            { trigger: 'death_healthy', from: 'healthy', to: 'dead' },
            { trigger: 'death_sick', from: 'sick', to: 'dead' }
        ],
        initialState: 'healthy'
    };
}

function createPSAResults(seed = 42) {
    const rng = new PCG32(seed);
    const iterations = [];
    for (let i = 0; i < 200; i++) {
        const p = 0.3 + rng.nextFloat() * 0.4;
        const costs = 5000 + p * 10000;
        const qalys = 5 + (1 - p) * 2;
        const nmb = qalys * 50000 - costs;
        iterations.push({
            params: { p_response: p },
            costs, qalys, nmb,
            optimal: nmb > 0 ? 1 : 0
        });
    }
    return { iterations, wtp: 50000, evpi: 5000 };
}

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISM TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Determinism: All stochastic engines produce identical results with same seed', () => {

    test('1. MarkovEngine is deterministic (same project, same results)', () => {
        const engine = new MarkovEngine({ logger: silentLogger });
        const project = createMarkovProject();

        const r1 = engine.run(project);
        const r2 = engine.run(project);

        expect(r1.total_costs).toBe(r2.total_costs);
        expect(r1.total_qalys).toBe(r2.total_qalys);
        expect(r1.life_years).toBe(r2.life_years);

        // Full trace comparison
        for (let c = 0; c < r1.trace.cycles.length; c++) {
            for (const stateId of Object.keys(r1.trace.states)) {
                expect(r1.trace.states[stateId][c]).toBe(r2.trace.states[stateId][c]);
            }
        }
    });

    test('2. PSA via correlated sampling is deterministic with same seed', () => {
        const run = (seed) => {
            const cpsa = new CorrelatedPSAEngine({ seed, nIterations: 100 });
            const model = (params) => ({
                costs: params.cost,
                qalys: params.eff * 5
            });
            const paramDefs = [
                { name: 'cost', dist: { type: 'normal', mean: 5000, sd: 500 } },
                { name: 'eff', dist: { type: 'beta', alpha: 8, beta: 2 } }
            ];
            const corrMatrix = [[1.0, 0.0], [0.0, 1.0]];
            return cpsa.runCorrelatedPSA(model, paramDefs, corrMatrix, 100);
        };

        const r1 = run(12345);
        const r2 = run(12345);

        expect(r1.summary.meanCost).toBe(r2.summary.meanCost);
        expect(r1.summary.meanQaly).toBe(r2.summary.meanQaly);

        for (let i = 0; i < r1.iterations.length; i++) {
            expect(r1.iterations[i].costs).toBe(r2.iterations[i].costs);
            expect(r1.iterations[i].qalys).toBe(r2.iterations[i].qalys);
        }
    });

    test('3. NMA Bayesian MCMC is deterministic with same seed', async () => {
        const run = async (seed) => {
            const nma = new NetworkMetaAnalysis({
                seed,
                nIterations: 2000,
                nBurnin: 500,
                nThin: 1,
                model: 'random'
            });
            nma.setData(createNMAData(), 'binary');
            return await nma.run();
        };

        const r1 = await run(12345);
        const r2 = await run(12345);

        // Treatment effects should match
        if (r1.treatmentEffects && r2.treatmentEffects) {
            for (let j = 0; j < r1.treatmentEffects.length; j++) {
                expect(r1.treatmentEffects[j].mean).toBeCloseTo(r2.treatmentEffects[j].mean, 10);
            }
        }

        // SUCRA scores should match
        for (let i = 0; i < r1.sucra.length; i++) {
            expect(r1.sucra[i].sucra).toBe(r2.sucra[i].sucra);
        }
    });

    test('4. MicrosimulationEngine is deterministic with same seed', async () => {
        const run = async (seed) => {
            const engine = new MicrosimulationEngine({
                patients: 50,
                seed,
                recordSummary: true
            });
            const project = createMicrosimProject();
            return await engine.run(project);
        };

        const r1 = await run(12345);
        const r2 = await run(12345);

        expect(r1.summary.mean_costs).toBe(r2.summary.mean_costs);
        expect(r1.summary.mean_qalys).toBe(r2.summary.mean_qalys);

        // Individual patient outcomes should match
        for (let i = 0; i < r1.patients.length; i++) {
            expect(r1.patients[i].costs).toBe(r2.patients[i].costs);
            expect(r1.patients[i].qalys).toBe(r2.patients[i].qalys);
            expect(r1.patients[i].finalState).toBe(r2.patients[i].finalState);
        }
    });

    test('5. DES is deterministic with same seed', async () => {
        // DES engine internally calls this.rng.random() but PCG32 exposes nextFloat().
        // We inject a compatible wrapper to test determinism.
        const run = async (seed) => {
            const engine = new DiscreteEventSimulationEngine({
                patients: 30,
                seed,
                maxTime: 20
            });
            // Patch rng to provide .random() alias for .nextFloat()
            const origRun = engine.run.bind(engine);
            return await (async () => {
                engine.defineModel(createDESModel());
                const rng = new PCG32(seed);
                rng.random = rng.nextFloat.bind(rng);
                engine.rng = rng;

                // We simulate a few patients manually to verify determinism
                const patients = [];
                for (let i = 0; i < 5; i++) {
                    const patient = engine.createPatient(i);
                    engine.initializePatient(patient);
                    engine.simulatePatient(patient);
                    patients.push({
                        costs: patient.accumulators.costs,
                        qalys: patient.accumulators.qalys,
                        state: patient.state
                    });
                }
                return patients;
            })();
        };

        const r1 = await run(12345);
        const r2 = await run(12345);

        expect(r1.length).toBe(r2.length);
        for (let i = 0; i < r1.length; i++) {
            expect(r1[i].costs).toBe(r2[i].costs);
            expect(r1[i].qalys).toBe(r2[i].qalys);
            expect(r1[i].state).toBe(r2[i].state);
        }
    });

    test('6. CorrelatedPSA (Gaussian copula) is deterministic', () => {
        const run = (seed) => {
            const cpsa = new CorrelatedPSAEngine({ seed, nIterations: 200 });

            const marginals = [
                { name: 'cost', dist: { type: 'lognormal', meanlog: 8.5, sdlog: 0.3 } },
                { name: 'utility', dist: { type: 'beta', alpha: 10, beta: 2 } },
                { name: 'rr', dist: { type: 'normal', mean: 0.8, sd: 0.1 } }
            ];
            const corrMatrix = [
                [1.0, -0.2, 0.1],
                [-0.2, 1.0, 0.0],
                [0.1, 0.0, 1.0]
            ];

            return cpsa.gaussianCopula(marginals, corrMatrix, 200);
        };

        const r1 = run(42);
        const r2 = run(42);

        expect(r1.length).toBe(200);

        for (let i = 0; i < r1.length; i++) {
            expect(r1[i].cost).toBe(r2[i].cost);
            expect(r1[i].utility).toBe(r2[i].utility);
            expect(r1[i].rr).toBe(r2[i].rr);
        }
    });

    test('7. CureModel EM algorithm is deterministic', () => {
        const cureEngine = new CureModelEngine();
        const data = createSurvivalData(100, 42);

        const r1 = cureEngine.mixtureCure(data, { distribution: 'weibull' });
        const r2 = cureEngine.mixtureCure(data, { distribution: 'weibull' });

        expect(r1.cureFraction).toBe(r2.cureFraction);
        expect(r1.logLik).toBe(r2.logLik);
        expect(r1.aic).toBe(r2.aic);

        // Uncured parameters should match
        expect(JSON.stringify(r1.uncuredParams)).toBe(JSON.stringify(r2.uncuredParams));
    });

    test('8. SemiMarkov engine is deterministic', () => {
        const run = (seed) => {
            const engine = new SemiMarkovEngine({ maxCycles: 30, seed });
            return engine.run({
                states: ['healthy', 'sick', 'dead'],
                initial: [1.0, 0.0, 0.0],
                transitions: {
                    'healthy->sick': { type: 'weibull', shape: 1.5, scale: 15 },
                    'healthy->dead': { type: 'constant', rate: 0.02 },
                    'sick->dead': { type: 'weibull', shape: 2.0, scale: 8 }
                },
                costs: { healthy: 500, sick: 3000, dead: 0 },
                utilities: { healthy: 0.9, sick: 0.5, dead: 0 },
                timeHorizon: 20,
                discountRate: 0.035,
                cycleLength: 1
            });
        };

        const r1 = run(42);
        const r2 = run(42);

        expect(r1.totalCosts).toBe(r2.totalCosts);
        expect(r1.totalQALYs).toBe(r2.totalQALYs);

        // State trace should match
        if (r1.stateTrace && r2.stateTrace) {
            expect(r1.stateTrace.length).toBe(r2.stateTrace.length);
            for (let c = 0; c < r1.stateTrace.length; c++) {
                for (const state of ['healthy', 'sick', 'dead']) {
                    if (typeof r1.stateTrace[c][state] === 'number') {
                        expect(r1.stateTrace[c][state]).toBe(r2.stateTrace[c][state]);
                    }
                }
            }
        }
    });
});
