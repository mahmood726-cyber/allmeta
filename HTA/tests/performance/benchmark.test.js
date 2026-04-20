/**
 * Performance Benchmark Suite for HTA Engines
 *
 * Measures execution time for each engine and asserts regression thresholds.
 * Run: npx jest tests/performance/ --no-coverage --forceExit
 */

'use strict';

const { performance } = require('perf_hooks');

// ── Global setup required by engine modules ──────────────────────────────────

const { KahanSum, NeumaierSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { ExpressionParser } = require('../../src/parser/expression');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.NeumaierSum = NeumaierSum;
global.PCG32 = PCG32;
globalThis.PCG32 = PCG32;
global.ExpressionParser = ExpressionParser;

// ── Engine imports ───────────────────────────────────────────────────────────

const { MarkovEngine } = require('../../src/engine/markov');
const { NetworkMetaAnalysis } = require('../../src/engine/nma');
const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');
const { MCDAEngine } = require('../../src/engine/mcda');
const { CompetingRisksEngine } = require('../../src/engine/competingRisks');
const { CureModelEngine } = require('../../src/engine/cureModels');
const { SemiMarkovEngine } = require('../../src/engine/semiMarkov');
const { CorrelatedPSAEngine } = require('../../src/engine/correlatedPSA');
const { ThresholdAnalysisEngine } = require('../../src/engine/thresholdAnalysis');
const { ScenarioAnalysisEngine } = require('../../src/engine/scenarioAnalysis');
const { ModelAveragingEngine } = require('../../src/engine/modelAveraging');
const { EVSIEngine } = require('../../src/engine/evsi');
const { MultiStateModelEngine, matrixExponential, identityMatrix } = require('../../src/engine/multiStateModel');
const { JointModelEngine } = require('../../src/engine/jointModel');
const { HeadroomAnalysisEngine } = require('../../src/engine/headroomAnalysis');
const { ProbabilisticBIAEngine } = require('../../src/engine/probabilisticBIA');
const { NetworkMCDAEngine } = require('../../src/engine/networkMCDA');
const { AdvancedMetaAnalysis } = require('../../src/engine/advancedMeta');
const { WorkerPool } = require('../../src/utils/workerPool');

// ── Helper: seeded LCG for deterministic data generation ─────────────────────

function makeLCG(seed) {
    let state = seed;
    return function nextRand() {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// ── Data generators ──────────────────────────────────────────────────────────

function createMarkovProject(cycles) {
    const states = {};
    const transitions = {};

    states.healthy = {
        label: 'Healthy',
        initial_probability: 0.7,
        cost: 'c_healthy',
        utility: 'u_healthy'
    };
    states.sick = {
        label: 'Sick',
        initial_probability: 0.3,
        cost: 'c_sick',
        utility: 'u_sick'
    };
    states.dead = {
        label: 'Dead',
        type: 'absorbing',
        initial_probability: 0,
        cost: 0,
        utility: 0
    };

    transitions.healthy_to_sick = { from: 'healthy', to: 'sick', probability: 'p_h2s' };
    transitions.healthy_to_dead = { from: 'healthy', to: 'dead', probability: 'p_h2d' };
    transitions.healthy_to_healthy = { from: 'healthy', to: 'healthy', probability: 'complement' };
    transitions.sick_to_dead = { from: 'sick', to: 'dead', probability: 'p_s2d' };
    transitions.sick_to_sick = { from: 'sick', to: 'sick', probability: 'complement' };
    transitions.dead_to_dead = { from: 'dead', to: 'dead', probability: 1 };

    return {
        version: '0.1',
        metadata: { id: 'bench', name: 'Benchmark Markov' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: cycles,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 55
        },
        parameters: {
            p_h2s: { value: 0.05 },
            p_h2d: { value: 0.02 },
            p_s2d: { value: 0.1 },
            c_healthy: { value: 500 },
            c_sick: { value: 5000 },
            u_healthy: { value: 0.9 },
            u_sick: { value: 0.5 }
        },
        states,
        transitions,
        strategies: {
            comparator: {
                label: 'Comparator',
                is_comparator: true,
                parameter_overrides: {}
            },
            intervention: {
                label: 'Intervention',
                parameter_overrides: { p_h2s: 'p_h2s * 0.7' }
            }
        }
    };
}

function createNMAData(nTreatments, nStudiesPerComparison) {
    const treatments = [];
    for (let i = 0; i < nTreatments; i++) {
        treatments.push(String.fromCharCode(65 + i)); // A, B, C, ...
    }
    const data = [];
    let studyIdx = 1;
    for (let i = 0; i < nTreatments; i++) {
        for (let j = i + 1; j < nTreatments; j++) {
            for (let s = 0; s < nStudiesPerComparison; s++) {
                const studyName = `S${studyIdx++}`;
                data.push({ study: studyName, treatment: treatments[i], n: 100, events: 20 + (i * 3 + j * 2 + s) % 15 });
                data.push({ study: studyName, treatment: treatments[j], n: 100, events: 15 + (j * 2 + s * 3) % 18 });
            }
        }
    }
    return data;
}

function createMetaStudies(n) {
    const rand = makeLCG(42);
    const studies = [];
    for (let i = 0; i < n; i++) {
        studies.push({
            effect: 0.1 + rand() * 0.8,
            se: 0.1 + rand() * 0.3
        });
    }
    return studies;
}

function createBIAConfig(years, population) {
    const uptake = [];
    for (let y = 0; y < years; y++) {
        uptake.push(0.05 + 0.1 * y);
    }
    return {
        population,
        prevalence: 0.05,
        timeHorizon: years,
        uptake: uptake.map(u => Math.min(u, 1.0)),
        newTx: { drugCost: 5000, adminCost: 200, monitoringCost: 100, aeCost: 50 },
        currentTx: { drugCost: 2000, adminCost: 150, monitoringCost: 80, aeCost: 30 },
        offsets: { hospitalization: -500, productivity: -200 },
        discountRate: 0.035
    };
}

function createMCDAData(nAlts, nCrit) {
    const rand = makeLCG(99);
    const criteria = [];
    const weights = {};
    const wRaw = [];
    for (let c = 0; c < nCrit; c++) {
        const name = `crit_${c}`;
        criteria.push({
            name,
            direction: c % 2 === 0 ? 'maximize' : 'minimize',
            scale: [0, 100]
        });
        wRaw.push(1 + rand() * 3);
    }
    const wSum = wRaw.reduce((a, b) => a + b, 0);
    criteria.forEach((c, i) => { weights[c.name] = wRaw[i] / wSum; });

    const alternatives = [];
    for (let a = 0; a < nAlts; a++) {
        const values = {};
        criteria.forEach(c => { values[c.name] = rand() * 100; });
        alternatives.push({ name: `Alt_${a}`, values });
    }
    return { criteria, alternatives, weights };
}

function createCompetingRisksData(n) {
    const rand = makeLCG(42);
    const data = [];
    for (let i = 0; i < n; i++) {
        const u = rand();
        const t = Math.round((1 + rand() * 20) * 10) / 10;
        let event;
        if (u < 0.40) event = 'relapse';
        else if (u < 0.60) event = 'death';
        else event = 'censored';
        data.push({ time: t, event });
    }
    return data;
}

function createCureModelData(n) {
    const rand = makeLCG(42);
    const pi = 0.3;
    const shape = 1.5;
    const scale = 10;
    const data = [];
    for (let i = 0; i < n; i++) {
        const u = rand();
        if (u < pi) {
            const censTime = 5 + rand() * 45;
            data.push({ time: Math.round(censTime * 10) / 10, event: 0 });
        } else {
            const v = rand();
            const failTime = scale * Math.pow(-Math.log(Math.max(v, 1e-10)), 1 / shape);
            const censTime = 5 + rand() * 45;
            if (failTime < censTime) {
                data.push({ time: Math.round(Math.max(0.1, failTime) * 10) / 10, event: 1 });
            } else {
                data.push({ time: Math.round(censTime * 10) / 10, event: 0 });
            }
        }
    }
    return data;
}

function createSemiMarkovConfig(nStates, cycles) {
    const states = [];
    const costs = {};
    const utilities = {};
    const transitions = {};

    for (let i = 0; i < nStates; i++) {
        const name = `State_${i}`;
        states.push(name);
        costs[name] = i === nStates - 1 ? 0 : 500 + i * 1000;
        utilities[name] = i === nStates - 1 ? 0 : 0.9 - i * 0.15;
    }

    // Forward transitions: each state to next, plus skip to last (dead)
    for (let i = 0; i < nStates - 1; i++) {
        if (i < nStates - 2) {
            transitions[`${states[i]}->${states[i + 1]}`] = { type: 'constant', rate: 0.08 + i * 0.02 };
        }
        transitions[`${states[i]}->${states[nStates - 1]}`] = { type: 'constant', rate: 0.02 + i * 0.01 };
    }

    const initial = new Array(nStates).fill(0);
    initial[0] = 1.0;

    return {
        states, initial, transitions, costs, utilities,
        timeHorizon: cycles,
        discountRate: 0.035
    };
}

function createCorrelatedPSAConfig(nParams, nIterations) {
    const params = [];
    const corrMatrix = [];
    for (let i = 0; i < nParams; i++) {
        params.push({
            name: `param_${i}`,
            dist: { type: 'normal', mean: 0.5 + i * 0.1, sd: 0.1 + i * 0.02 }
        });
        const row = [];
        for (let j = 0; j < nParams; j++) {
            if (i === j) row.push(1.0);
            else row.push(0.3); // moderate positive correlation
        }
        corrMatrix.push(row);
    }
    return { params, corrMatrix, nIterations, seed: 42 };
}

function createThresholdModel(params) {
    return {
        cost: (params.drug_cost ?? 5000) + 1000,
        qaly: (params.utility ?? 0.8) * 10,
        comparatorCost: 3000,
        comparatorQaly: 7
    };
}

function createModelAveragingData(n) {
    const rand = makeLCG(55);
    const data = [];
    for (let i = 0; i < n; i++) {
        // Weibull-like survival times
        const shape = 1.5;
        const scale = 10;
        const u = rand();
        const t = scale * Math.pow(-Math.log(Math.max(u, 1e-10)), 1 / shape);
        const cens = rand() > 0.3 ? 0 : 1;
        data.push({ time: Math.max(0.1, t), event: cens ? 0 : 1 });
    }
    return data;
}

function createEVSIPSA(n) {
    const rng = new PCG32(42);
    const iterations = [];
    for (let i = 0; i < n; i++) {
        const p = rng.beta(20, 30);
        const cost = rng.gamma(100, 50);
        const qaly = p * 10;
        const nmb = qaly * 50000 - cost;
        iterations.push({
            params: { p_response: p, cost: cost },
            nmb,
            qaly,
            cost,
            optimal: nmb > 0 ? 'Treatment' : 'Control'
        });
    }
    return { iterations, evpi: 5000, wtp: 50000 };
}

function createMultiStateConfig(nStates, cycles) {
    const states = [];
    for (let i = 0; i < nStates; i++) {
        states.push({
            name: `S${i}`,
            initial: i === 0 ? 1.0 : 0,
            absorbing: i === nStates - 1
        });
    }
    const transitions = [];
    for (let i = 0; i < nStates - 1; i++) {
        if (i < nStates - 2) {
            transitions.push({ from: `S${i}`, to: `S${i + 1}`, rate: 0.1 + i * 0.02 });
        }
        transitions.push({ from: `S${i}`, to: `S${nStates - 1}`, rate: 0.02 + i * 0.005 });
    }
    const rewards = {};
    states.forEach((s, i) => {
        rewards[s.name] = {
            cost: i === nStates - 1 ? 0 : 500 + i * 800,
            qaly: i === nStates - 1 ? 0 : 0.9 - i * 0.1
        };
    });
    return {
        states, transitions, rewards,
        timeHorizon: cycles,
        cycleLength: 1,
        discountRateCosts: 0.035,
        discountRateOutcomes: 0.035,
        halfCycleCorrection: false
    };
}

function createJointModelData(nSubjects) {
    const rand = makeLCG(42);
    const data = [];
    for (let i = 0; i < nSubjects; i++) {
        const b0 = 5 + (rand() - 0.5) * 2;
        const b1 = 0.5 + (rand() - 0.5) * 0.3;
        const nObs = 3 + Math.floor(rand() * 5);
        const maxTime = 10 + rand() * 20;
        const times = [];
        const biomarker = [];
        for (let j = 0; j < nObs; j++) {
            const t = (j / (nObs - 1 || 1)) * maxTime * 0.8;
            times.push(t);
            biomarker.push(b0 + b1 * t + (rand() - 0.5) * 1.0);
        }
        const eventTime = maxTime * (0.5 + rand() * 0.5);
        const event = rand() > 0.3 ? 1 : 0;
        data.push({ id: i + 1, times, biomarker, eventTime, event });
    }
    return data;
}

function createNetworkMCDAInputs(nTreatments, nSims) {
    const treatments = [];
    for (let i = 0; i < nTreatments; i++) {
        treatments.push(String.fromCharCode(65 + i));
    }
    const effects = { efficacy: {}, safety: {}, cost: {} };
    const uncertainty = { efficacy: {}, safety: {}, cost: {} };
    treatments.forEach((t, i) => {
        effects.efficacy[t] = i * 0.2;
        effects.safety[t] = i === 0 ? 0 : -0.1 * i;
        effects.cost[t] = 1000 + i * 2000;
        uncertainty.efficacy[t] = i === 0 ? 0 : 0.1 + i * 0.02;
        uncertainty.safety[t] = i === 0 ? 0 : 0.05 + i * 0.01;
        uncertainty.cost[t] = i === 0 ? 100 : 200 + i * 100;
    });
    return {
        nma: { treatments, effects, uncertainty },
        criteria: [
            { name: 'efficacy', direction: 'maximize', scale: [-1, 2] },
            { name: 'safety', direction: 'maximize', scale: [-1, 1] },
            { name: 'cost', direction: 'minimize', scale: [0, 20000] }
        ],
        weights: { efficacy: 0.5, safety: 0.3, cost: 0.2 },
        nSims
    };
}

function createAdvancedMetaData(n) {
    const rand = makeLCG(77);
    const data = [];
    for (let i = 0; i < n; i++) {
        // Simulate 3-level structure: n/3 studies, ~3 effects each
        const studyId = `Study_${Math.floor(i / 3)}`;
        data.push({
            study: studyId,
            effect_id: i,
            yi: 0.2 + rand() * 0.6,
            vi: 0.02 + rand() * 0.06
        });
    }
    return data;
}

// ── Timing helper ────────────────────────────────────────────────────────────

function timeExecution(fn) {
    const start = performance.now();
    const result = fn();
    const elapsed = performance.now() - start;
    return { result, elapsed };
}

async function timeExecutionAsync(fn) {
    const start = performance.now();
    const result = await fn();
    const elapsed = performance.now() - start;
    return { result, elapsed };
}

// =============================================================================
//  BENCHMARK SUITE
// =============================================================================

describe('Performance Benchmarks — Engine', () => {

    const silentLogger = { warn: () => {}, log: () => {}, error: () => {} };

    // ── 1. MarkovEngine 1000 cycles ──────────────────────────────────────────

    test('1. MarkovEngine 1000 cycles < 800ms', () => {
        const engine = new MarkovEngine({ logger: silentLogger });
        const project = createMarkovProject(1000);
        const { elapsed } = timeExecution(() => engine.run(project));
        console.log(`  MarkovEngine 1000 cycles: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(800);
    });

    // ── 2. MarkovEngine 100 cycles x 100 PSA iterations ─────────────────────

    test('2. MarkovEngine 100 cycles x 100 PSA iterations < 2000ms', () => {
        const engine = new MarkovEngine({ logger: silentLogger });
        const project = createMarkovProject(100);
        const { elapsed } = timeExecution(() => {
            for (let i = 0; i < 100; i++) {
                engine.run(project);
            }
        });
        console.log(`  MarkovEngine 100x100 PSA: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(2000);
    });

    // ── 3. NMA Bayesian 6 treatments, 1000 iterations ───────────────────────

    test('3. NMA Bayesian 6 treatments, 1000 iterations < 3000ms', async () => {
        const nma = new NetworkMetaAnalysis({
            method: 'bayesian',
            model: 'random',
            nIterations: 1000,
            nBurnin: 200,
            seed: 12345
        });
        const data = createNMAData(6, 2);
        nma.setData(data, 'binary');
        const { elapsed } = await timeExecutionAsync(() => nma.run());
        console.log(`  NMA Bayesian 6tx/1000it: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(3000);
    });

    // ── 4. NMA Frequentist 10 treatments ────────────────────────────────────

    test('4. NMA Frequentist 10 treatments < 1000ms', async () => {
        const nma = new NetworkMetaAnalysis({
            method: 'frequentist',
            model: 'random',
            seed: 12345
        });
        const data = createNMAData(10, 1);
        nma.setData(data, 'binary');
        const { elapsed } = await timeExecutionAsync(() => nma.run());
        console.log(`  NMA Frequentist 10tx: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(1000);
    });

    // ── 5. MetaAnalysis DL 100 studies ──────────────────────────────────────

    test('5. MetaAnalysis DL 100 studies < 200ms', () => {
        const ma = new MetaAnalysisMethods({ method: 'DL' });
        const studies = createMetaStudies(100);
        const { elapsed } = timeExecution(() => ma.calculatePooledEffect(studies));
        console.log(`  MetaAnalysis DL 100 studies: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(200);
    });

    // ── 6. MetaAnalysis REML 50 studies ─────────────────────────────────────

    test('6. MetaAnalysis REML 50 studies < 500ms', () => {
        const ma = new MetaAnalysisMethods({ method: 'REML' });
        const studies = createMetaStudies(50);
        const { elapsed } = timeExecution(() => ma.calculatePooledEffect(studies));
        console.log(`  MetaAnalysis REML 50 studies: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(500);
    });

    // ── 7. AdvancedMeta three-level 30 studies ──────────────────────────────

    test('7. AdvancedMeta three-level 30 studies < 1000ms', () => {
        const ama = new AdvancedMetaAnalysis({ method: 'REML' });
        const data = createAdvancedMetaData(30);
        const { elapsed } = timeExecution(() => ama.threeLevel(data));
        console.log(`  AdvancedMeta 3-level 30 studies: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(1000);
    });

    // ── 8. BudgetImpact 5-year, 1M population ──────────────────────────────

    test('8. BudgetImpact 5-year, 1M population < 100ms', () => {
        const engine = new BudgetImpactEngine();
        const config = createBIAConfig(5, 1000000);
        const { elapsed } = timeExecution(() => engine.run(config));
        console.log(`  BudgetImpact 5yr/1M pop: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(100);
    });

    // ── 9. MCDA 20 alternatives, 10 criteria ───────────────────────────────

    test('9. MCDA 20 alternatives, 10 criteria < 100ms', () => {
        const engine = new MCDAEngine();
        const { criteria, alternatives, weights } = createMCDAData(20, 10);
        const { elapsed } = timeExecution(() => engine.weightedSum(alternatives, criteria, weights));
        console.log(`  MCDA 20alts/10crit: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(100);
    });

    // ── 10. MCDA rankAcceptability 10 alts, 10000 sims ─────────────────────

    test('10. MCDA rankAcceptability 10 alts, 10000 sims < 2000ms', () => {
        const engine = new MCDAEngine({ seed: 42 });
        const { criteria, alternatives } = createMCDAData(10, 5);
        const weightDists = criteria.map(c => ({
            criterion: c.name,
            dist: { type: 'uniform', min: 0.05, max: 0.5 }
        }));
        const { elapsed } = timeExecution(() =>
            engine.rankAcceptability(alternatives, criteria, weightDists, 10000)
        );
        console.log(`  MCDA rankAcceptability 10/10000: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(2000);
    });

    // ── 11. CompetingRisks CIF 500 subjects ─────────────────────────────────

    test('11. CompetingRisks CIF 500 subjects < 500ms', () => {
        const engine = new CompetingRisksEngine({ confLevel: 0.95 });
        const data = createCompetingRisksData(500);
        const { elapsed } = timeExecution(() =>
            engine.cumulativeIncidence(data, ['relapse', 'death'])
        );
        console.log(`  CompetingRisks CIF 500: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(500);
    });

    // ── 12. CureModels mixtureCure 200 subjects ─────────────────────────────

    test('12. CureModels mixtureCure 200 subjects < 5000ms', () => {
        const engine = new CureModelEngine({ confLevel: 0.95 });
        const data = createCureModelData(200);
        const { elapsed } = timeExecution(() =>
            engine.mixtureCure(data, { distribution: 'weibull', maxIter: 200 })
        );
        console.log(`  CureModels mixtureCure 200: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(5000);
    });

    // ── 13. SemiMarkov 5 states, 100 cycles ─────────────────────────────────

    test('13. SemiMarkov 5 states, 100 cycles < 1000ms', () => {
        const engine = new SemiMarkovEngine({ maxCycles: 100 });
        const config = createSemiMarkovConfig(5, 100);
        const { elapsed } = timeExecution(() => engine.run(config));
        console.log(`  SemiMarkov 5 states/100 cycles: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(1000);
    });

    // ── 14. CorrelatedPSA 5 params, 5000 iterations ────────────────────────

    test('14. CorrelatedPSA 5 params, 5000 iterations < 3000ms', () => {
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        const nParams = 5;
        const nIter = 5000;
        const means = [];
        const sds = [];
        const corrMatrix = [];
        for (let i = 0; i < nParams; i++) {
            means.push(0.5 + i * 0.1);
            sds.push(0.1 + i * 0.02);
            const row = [];
            for (let j = 0; j < nParams; j++) {
                row.push(i === j ? 1.0 : 0.3);
            }
            corrMatrix.push(row);
        }
        const { elapsed } = timeExecution(() =>
            engine.correlatedNormal(means, sds, corrMatrix, nIter)
        );
        console.log(`  CorrelatedPSA 5p/5000it: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(3000);
    });

    // ── 15. ThresholdAnalysis oneway 200 steps ──────────────────────────────

    test('15. ThresholdAnalysis oneway 200 steps < 500ms', () => {
        const engine = new ThresholdAnalysisEngine({ tolerance: 0.001 });
        const { elapsed } = timeExecution(() =>
            engine.oneway(createThresholdModel, 'drug_cost', [1000, 100000], 50000, 200)
        );
        console.log(`  ThresholdAnalysis oneway 200: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(500);
    });

    // ── 16. ThresholdAnalysis twoway 100x100 grid ───────────────────────────

    test('16. ThresholdAnalysis twoway 100x100 grid < 2000ms', () => {
        const engine = new ThresholdAnalysisEngine({ tolerance: 0.001 });
        const { elapsed } = timeExecution(() =>
            engine.twoway(
                createThresholdModel,
                'drug_cost', [1000, 100000],
                'utility', [0.3, 1.0],
                50000, 100
            )
        );
        console.log(`  ThresholdAnalysis twoway 100x100: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(2000);
    });

    // ── 17. ScenarioAnalysis 3 scenarios ────────────────────────────────────

    test('17. ScenarioAnalysis 3 scenarios < 200ms', () => {
        const engine = new ScenarioAnalysisEngine();
        const baseParams = { drug_cost: 5000, utility: 0.8 };
        const scenarios = {
            pessimistic: { drug_cost: 8000, utility: 0.6 },
            optimistic: { drug_cost: 3000, utility: 0.9 },
            alternative: { drug_cost: 6000, utility: 0.75 }
        };
        const { elapsed } = timeExecution(() =>
            engine.run(createThresholdModel, baseParams, scenarios)
        );
        console.log(`  ScenarioAnalysis 3 scenarios: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(200);
    });

    // ── 18. ModelAveraging fitCompare 6 distributions, 200 subjects ─────────

    test('18. ModelAveraging fitCompare 6 dists, 200 subjects < 5000ms', () => {
        const engine = new ModelAveragingEngine();
        const data = createModelAveragingData(200);
        const distributions = ['weibull', 'lognormal', 'loglogistic', 'exponential', 'gamma', 'gompertz'];
        const { elapsed } = timeExecution(() => engine.fitCompare(data, distributions));
        console.log(`  ModelAveraging fitCompare 6/200: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(5000);
    });

    // ── 19. EVSI compute 1000 PSA iterations ────────────────────────────────

    test('19. EVSI compute 1000 PSA iterations < 1000ms', () => {
        const engine = new EVSIEngine({ seed: 42 });
        const psa = createEVSIPSA(1000);
        const studyDesign = { sampleSize: 100, parameter: 'p_response', dataModel: 'binomial' };
        const { elapsed } = timeExecution(() =>
            engine.compute(psa, studyDesign)
        );
        console.log(`  EVSI compute 1000 PSA: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(1000);
    });

    // ── 20. MultiStateModel 10 states, 50 cycles ───────────────────────────

    test('20. MultiStateModel 10 states, 50 cycles < 500ms', () => {
        const engine = new MultiStateModelEngine();
        const config = createMultiStateConfig(10, 50);
        const { elapsed } = timeExecution(() => engine.run(config));
        console.log(`  MultiStateModel 10 states/50 cycles: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(500);
    });

    // ── 21. JointModel fit 50 patients ──────────────────────────────────────

    test('21. JointModel fit 50 patients < 2000ms', () => {
        const engine = new JointModelEngine();
        const data = createJointModelData(50);
        const { elapsed } = timeExecution(() => engine.fit(data));
        console.log(`  JointModel fit 50 patients: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(2000);
    });

    // ── 22. HeadroomAnalysis 100 WTP points ─────────────────────────────────

    test('22. HeadroomAnalysis 100 WTP points < 500ms', () => {
        const engine = new HeadroomAnalysisEngine({ tolerance: 0.01 });
        const { elapsed } = timeExecution(() => {
            for (let wtp = 1000; wtp <= 100000; wtp += 1000) {
                engine.maxPrice(createThresholdModel, { price: 5000 }, 'price', wtp, [0, 200000]);
            }
        });
        console.log(`  HeadroomAnalysis 100 WTP: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(500);
    });

    // ── 23. ProbabilisticBIA 500 iterations ─────────────────────────────────

    test('23. ProbabilisticBIA 500 iterations < 3000ms', () => {
        const engine = new ProbabilisticBIAEngine({ seed: 12345, nIterations: 500 });
        const config = {
            population: 100000,
            prevalence: 0.05,
            timeHorizon: 3,
            uptake: [0.1, 0.3, 0.5],
            newTx: { drugCost: 5000, adminCost: 200, monitoringCost: 100, aeCost: 50 },
            currentTx: { drugCost: 2000, adminCost: 150, monitoringCost: 80, aeCost: 30 },
            offsets: { hospitalization: -500, productivity: -200 },
            discountRate: 0
        };
        const paramDists = {
            prevalence: { type: 'beta', alpha: 50, beta: 950 },
            'newTx.drugCost': { type: 'gamma', shape: 100, scale: 50 },
            'uptake.0': { type: 'beta', alpha: 10, beta: 90 }
        };
        const { elapsed } = timeExecution(() => engine.run(config, paramDists));
        console.log(`  ProbabilisticBIA 500it: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(3000);
    });

    // ── 24. NetworkMCDA 6 treatments, 5000 sims ────────────────────────────

    test('24. NetworkMCDA 6 treatments, 5000 sims < 2000ms', () => {
        const engine = new NetworkMCDAEngine({ seed: 12345 });
        const { nma, criteria, weights, nSims } = createNetworkMCDAInputs(6, 5000);
        const { elapsed } = timeExecution(() =>
            engine.probabilisticRanking(nma, criteria, weights, nSims)
        );
        console.log(`  NetworkMCDA 6tx/5000sims: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(2000);
    });
});

// =============================================================================
//  UTILITY BENCHMARKS
// =============================================================================

describe('Performance Benchmarks — Utilities', () => {

    // ── 25. KahanSum 1M values ──────────────────────────────────────────────

    test('25. KahanSum 1M values < 50ms', () => {
        const { elapsed } = timeExecution(() => {
            const ks = new KahanSum();
            for (let i = 0; i < 1000000; i++) {
                ks.add(0.1);
            }
            return ks.total();
        });
        console.log(`  KahanSum 1M values: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(50);
    });

    // ── 26. PCG32 1M random floats ─────────────────────────────────────────
    // PCG32 uses BigInt for 64-bit state, which is slower in JS than native u32.
    // Threshold accommodates BigInt overhead across platforms.

    test('26. PCG32 1M random floats < 8000ms', () => {
        const { elapsed } = timeExecution(() => {
            const rng = new PCG32(42);
            let sum = 0;
            for (let i = 0; i < 1000000; i++) {
                sum += rng.nextDouble();
            }
            return sum;
        });
        console.log(`  PCG32 1M floats: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(8000);
    });

    // ── 27. ExpressionParser 10K evaluations ────────────────────────────────

    test('27. ExpressionParser 10K evaluations < 1500ms', () => {
        const { elapsed } = timeExecution(() => {
            let sum = 0;
            for (let i = 0; i < 10000; i++) {
                sum += ExpressionParser.evaluate(
                    'rate_to_prob(r) * (1 + a / b)',
                    { r: 0.05 + i * 0.0001, a: 3, b: 7 }
                );
            }
            return sum;
        });
        console.log(`  ExpressionParser 10K evals: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(1500);
    });

    // ── 28. MatrixExponential 10x10 ────────────────────────────────────────

    test('28. MatrixExponential 10x10 < 50ms', () => {
        // Build a 10x10 rate matrix
        const n = 10;
        const Q = [];
        for (let i = 0; i < n; i++) {
            Q[i] = new Array(n).fill(0);
            let rowSum = 0;
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    Q[i][j] = 0.01 + (i + j) * 0.005;
                    rowSum += Q[i][j];
                }
            }
            Q[i][i] = -rowSum;
        }
        const { elapsed } = timeExecution(() => matrixExponential(Q));
        console.log(`  MatrixExponential 10x10: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(50);
    });

    // ── 29. Cholesky 20x20 ─────────────────────────────────────────────────

    test('29. Cholesky 20x20 < 10ms', () => {
        // Build a 20x20 positive definite correlation matrix
        const n = 20;
        const corrMatrix = [];
        for (let i = 0; i < n; i++) {
            corrMatrix[i] = [];
            for (let j = 0; j < n; j++) {
                if (i === j) corrMatrix[i][j] = 1.0;
                else corrMatrix[i][j] = 0.3 * Math.pow(0.95, Math.abs(i - j));
            }
        }
        // Use CorrelatedPSAEngine's cholesky method
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        const { elapsed } = timeExecution(() => engine.cholesky(corrMatrix));
        console.log(`  Cholesky 20x20: ${elapsed.toFixed(1)}ms`);
        expect(elapsed).toBeLessThan(10);
    });

    // ── 30. WorkerPool 10 sync tasks ────────────────────────────────────────

    test('30. WorkerPool 10 sync tasks < 500ms', async () => {
        const pool = new WorkerPool({ poolSize: 4 });
        const project = {
            version: '0.1',
            metadata: { id: 'bench', name: 'Bench' },
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
                alive: { label: 'Alive', initial_probability: 1, cost: 'c_alive', utility: 'u_alive' },
                dead: { label: 'Dead', type: 'absorbing', cost: 0, utility: 0 }
            },
            transitions: {
                alive_to_dead: { from: 'alive', to: 'dead', probability: 'p_death' },
                alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
                dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
            },
            strategies: {
                base: { label: 'Base', is_comparator: true, parameter_overrides: {} }
            }
        };
        const start = performance.now();
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(pool.run('markov', 'run', [project]));
        }
        const results = await Promise.all(promises);
        const elapsed = performance.now() - start;
        pool.terminate();
        console.log(`  WorkerPool 10 sync tasks: ${elapsed.toFixed(1)}ms`);
        expect(results).toHaveLength(10);
        expect(elapsed).toBeLessThan(500);
    });
});
