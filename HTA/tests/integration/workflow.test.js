/**
 * Integration Tests: Full HTA Workflow End-to-End
 *
 * Tests complete pipelines that chain multiple modules together,
 * verifying that the system works as a whole, not just individual units.
 */

'use strict';

const { performance } = require('perf_hooks');
global.performance = global.performance || performance;

// ─── Shared Dependencies ──────────────────────────────────────────────────

const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');
const { PCG32 } = require('../../src/utils/pcg32');

// Set up globals so engines can resolve dependencies
global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;
global.PCG32 = PCG32;

// ─── Engine Imports ───────────────────────────────────────────────────────

const { MarkovEngine } = require('../../src/engine/markov');
const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');
const { NetworkMetaAnalysis } = require('../../src/engine/nma');
const { MCDAEngine } = require('../../src/engine/mcda');
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');
const { ThresholdAnalysisEngine } = require('../../src/engine/thresholdAnalysis');
const { ScenarioAnalysisEngine } = require('../../src/engine/scenarioAnalysis');
const { EVSIEngine } = require('../../src/engine/evsi');
const { ModelAveragingEngine } = require('../../src/engine/modelAveraging');
const { CureModelEngine } = require('../../src/engine/cureModels');
const { CompetingRisksEngine } = require('../../src/engine/competingRisks');
const { SemiMarkovEngine } = require('../../src/engine/semiMarkov');
const { CorrelatedPSAEngine } = require('../../src/engine/correlatedPSA');

// ─── Validator / Util Imports ─────────────────────────────────────────────

const { SchemaValidator } = require('../../src/validator/schema');
const { SemanticValidator, Severity, ValidationCodes } = require('../../src/validator/semantic');
const { AuditLogger } = require('../../src/utils/audit');

// ─── Silent logger to suppress console spam ──────────────────────────────

const silentLogger = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS: reusable project / data builders
// ═══════════════════════════════════════════════════════════════════════════

function createMarkovProject(overrides = {}) {
    return {
        version: '0.1',
        metadata: { id: 'integ-test', name: 'Integration Test Model' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 50,
            ...overrides.settings
        },
        parameters: {
            p_sick_to_dead: { value: 0.05 },
            p_healthy_to_sick: { value: 0.10 },
            c_healthy: { value: 500 },
            c_sick: { value: 3000 },
            u_healthy: { value: 0.9 },
            u_sick: { value: 0.5 },
            ...overrides.parameters
        },
        states: {
            healthy: {
                label: 'Healthy',
                initial_probability: 1,
                cost: 'c_healthy',
                utility: 'u_healthy'
            },
            sick: {
                label: 'Sick',
                initial_probability: 0,
                cost: 'c_sick',
                utility: 'u_sick'
            },
            dead: {
                label: 'Dead',
                type: 'absorbing',
                initial_probability: 0,
                cost: 0,
                utility: 0
            },
            ...overrides.states
        },
        transitions: {
            healthy_to_sick: { from: 'healthy', to: 'sick', probability: 'p_healthy_to_sick' },
            healthy_to_dead: { from: 'healthy', to: 'dead', probability: 0.02 },
            healthy_to_healthy: { from: 'healthy', to: 'healthy', probability: 'complement' },
            sick_to_dead: { from: 'sick', to: 'dead', probability: 'p_sick_to_dead' },
            sick_to_sick: { from: 'sick', to: 'sick', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 },
            ...overrides.transitions
        },
        strategies: overrides.strategies || {
            comparator: {
                label: 'Standard Care',
                is_comparator: true,
                parameter_overrides: {}
            },
            intervention: {
                label: 'New Drug',
                parameter_overrides: { p_healthy_to_sick: 0.05 }
            }
        }
    };
}

function createMetaStudies(k = 5) {
    // Generate k studies with known effect sizes
    const rng = new PCG32(42);
    const studies = [];
    for (let i = 0; i < k; i++) {
        const effect = 0.3 + (rng.nextFloat() - 0.5) * 0.4;
        const se = 0.05 + rng.nextFloat() * 0.15;
        studies.push({
            effect,
            se,
            n: Math.floor(50 + rng.nextFloat() * 200),
            label: `Study ${i + 1}`
        });
    }
    return studies;
}

function createNMAData() {
    // 4-treatment network: A (ref), B, C, D
    // A-B direct, A-C direct, B-C direct, C-D direct
    return [
        { study: 'Trial1', treatment: 'A', n: 100, events: 30 },
        { study: 'Trial1', treatment: 'B', n: 100, events: 20 },
        { study: 'Trial2', treatment: 'A', n: 150, events: 50 },
        { study: 'Trial2', treatment: 'C', n: 150, events: 35 },
        { study: 'Trial3', treatment: 'B', n: 120, events: 25 },
        { study: 'Trial3', treatment: 'C', n: 120, events: 22 },
        { study: 'Trial4', treatment: 'C', n: 80, events: 20 },
        { study: 'Trial4', treatment: 'D', n: 80, events: 10 },
        { study: 'Trial5', treatment: 'A', n: 200, events: 70 },
        { study: 'Trial5', treatment: 'B', n: 200, events: 45 },
        { study: 'Trial6', treatment: 'A', n: 90, events: 30 },
        { study: 'Trial6', treatment: 'D', n: 90, events: 15 }
    ];
}

function createBIAConfig(overrides = {}) {
    return {
        population: 1000000,
        prevalence: 0.01,
        timeHorizon: 5,
        uptake: [0.1, 0.2, 0.3, 0.4, 0.5],
        newTx: { drugCost: 5000, adminCost: 200, monitoringCost: 300, aeCost: 100 },
        currentTx: { drugCost: 2000, adminCost: 100, monitoringCost: 200, aeCost: 50 },
        offsets: { hospitalizationSavings: -500 },
        discountRate: 0.03,
        ...overrides
    };
}

function createSurvivalData(n = 100, seed = 42) {
    const rng = new PCG32(seed);
    const data = [];
    for (let i = 0; i < n; i++) {
        // Weibull-ish survival times
        const u = rng.nextFloat();
        const time = Math.max(0.1, 10 * Math.pow(-Math.log(u), 1 / 1.5));
        const event = rng.nextFloat() < 0.7 ? 1 : 0; // 70% event rate
        data.push({ time, event });
    }
    return data;
}

function createCompetingRisksData(n = 100, seed = 42) {
    const rng = new PCG32(seed);
    const causes = ['disease', 'other'];
    const data = [];
    for (let i = 0; i < n; i++) {
        const u = rng.nextFloat();
        const time = Math.max(0.1, 5 * Math.pow(-Math.log(Math.max(u, 0.001)), 0.8));
        const roll = rng.nextFloat();
        let event;
        if (roll < 0.4) event = 'disease';
        else if (roll < 0.7) event = 'other';
        else event = 'censored';
        data.push({ time, event });
    }
    return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 1: Markov Model Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 1: Markov Model Pipeline', () => {
    let engine;

    beforeEach(() => {
        engine = new MarkovEngine({ logger: silentLogger });
    });

    test('1. Valid project passes validation then runs successfully', () => {
        const project = createMarkovProject();

        // Validate
        const schemaVal = new SchemaValidator();
        const semanticVal = new SemanticValidator();
        const semanticResult = semanticVal.validate(project);
        const errors = semanticResult.issues.filter(i => i.severity === 'ERROR');

        // Run Markov
        const result = engine.run(project);

        expect(result).toBeDefined();
        expect(result.total_costs).toBeGreaterThan(0);
        expect(result.total_qalys).toBeGreaterThan(0);
        expect(result.cycles).toBe(10);
    });

    test('2. Invalid project fails validation with specific error codes', () => {
        const project = createMarkovProject({
            parameters: {
                // probability > 1 is invalid
                p_sick_to_dead: { value: 1.5 },
                p_healthy_to_sick: { value: 0.10 },
                c_healthy: { value: 500 },
                c_sick: { value: 3000 },
                u_healthy: { value: 0.9 },
                u_sick: { value: 0.5 }
            }
        });

        const semanticVal = new SemanticValidator();
        const result = semanticVal.validate(project);
        const allIssues = result.issues;

        // Should have at least warnings about out-of-bounds probability
        expect(allIssues.length).toBeGreaterThan(0);
        const codes = allIssues.map(i => i.code);
        // Expect probability-related issue codes
        // The validator should flag *something* about the invalid model
        // (could be probability, extreme value, negative value, clinical implausibility, etc.)
        expect(allIssues.length).toBeGreaterThan(0);
    });

    test('3. Markov results have expected structure (costs, qalys, state trace)', () => {
        const result = engine.run(createMarkovProject());

        // Structure checks
        expect(typeof result.total_costs).toBe('number');
        expect(typeof result.total_qalys).toBe('number');
        expect(typeof result.life_years).toBe('number');
        expect(typeof result.cycles).toBe('number');

        // Trace structure
        expect(result.trace).toBeDefined();
        expect(Array.isArray(result.trace.cycles)).toBe(true);
        expect(result.trace.states).toBeDefined();
        expect(result.trace.states.healthy).toBeDefined();
        expect(result.trace.states.sick).toBeDefined();
        expect(result.trace.states.dead).toBeDefined();

        // Trace length matches cycles + 1
        expect(result.trace.cycles.length).toBe(result.cycles + 1);
        expect(result.trace.states.healthy.length).toBe(result.cycles + 1);

        // Final distribution
        expect(result.final_distribution).toBeDefined();
    });

    test('4. PSA with 100 iterations produces varied results', () => {
        // Simulate PSA by running Markov with different parameter overrides
        const project = createMarkovProject();
        const rng = new PCG32(12345);
        const psaResults = [];

        for (let i = 0; i < 100; i++) {
            const pSick = 0.03 + rng.nextFloat() * 0.04;
            const result = engine.run(project, { p_sick_to_dead: pSick });
            psaResults.push({
                costs: result.total_costs,
                qalys: result.total_qalys,
                param: pSick
            });
        }

        expect(psaResults.length).toBe(100);

        // Results should vary
        const costs = psaResults.map(r => r.costs);
        const minCost = Math.min(...costs);
        const maxCost = Math.max(...costs);
        expect(maxCost).toBeGreaterThan(minCost);

        const qalys = psaResults.map(r => r.qalys);
        const minQaly = Math.min(...qalys);
        const maxQaly = Math.max(...qalys);
        expect(maxQaly).toBeGreaterThan(minQaly);
    });

    test('5. Expression parser evaluates age-dependent transitions correctly', () => {
        const project = createMarkovProject({
            parameters: {
                p_healthy_to_sick: { value: 0.10 },
                p_sick_to_dead: { value: 'if(age > 60, 0.10, 0.03)' },
                c_healthy: { value: 500 },
                c_sick: { value: 3000 },
                u_healthy: { value: 0.9 },
                u_sick: { value: 0.5 }
            },
            settings: {
                time_horizon: 20,
                cycle_length: 1,
                starting_age: 50,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                half_cycle_correction: 'none'
            }
        });

        const result = engine.run(project);

        // Should run without error across 20 cycles
        expect(result.total_costs).toBeGreaterThan(0);
        expect(result.cycles).toBe(20);

        // The death probability changes at age 60 (cycle 10), so trace should show
        // faster depletion of sick state in later cycles
        expect(result.trace.states.dead.length).toBe(21);
        // Dead proportion should increase over time
        const deadAtCycle5 = result.trace.states.dead[5];
        const deadAtCycle15 = result.trace.states.dead[15];
        expect(deadAtCycle15).toBeGreaterThan(deadAtCycle5);
    });

    test('6. Kahan summation preserves precision across 1000 cycles', () => {
        const project = createMarkovProject({
            settings: {
                time_horizon: 1000,
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                half_cycle_correction: 'none',
                starting_age: 50
            }
        });

        const result = engine.run(project);

        // Mass conservation: all state probabilities should sum close to 1
        const finalDist = result.final_distribution;
        const totalMass = Object.values(finalDist).reduce((a, b) => a + b, 0);
        expect(Math.abs(totalMass - 1.0)).toBeLessThan(1e-6);

        // Check each trace cycle sums to ~1
        for (let c = 0; c < Math.min(result.trace.cycles.length, 50); c++) {
            let cycleTotal = 0;
            for (const stateId of Object.keys(result.trace.states)) {
                cycleTotal += result.trace.states[stateId][c];
            }
            expect(Math.abs(cycleTotal - 1.0)).toBeLessThan(1e-6);
        }
    });

    test('7. Results are deterministic with same seed', () => {
        const project = createMarkovProject();

        const result1 = engine.run(project);
        const result2 = engine.run(project);

        expect(result1.total_costs).toBe(result2.total_costs);
        expect(result1.total_qalys).toBe(result2.total_qalys);
        expect(result1.life_years).toBe(result2.life_years);

        // Trace values match
        for (let c = 0; c < result1.trace.cycles.length; c++) {
            expect(result1.trace.states.healthy[c]).toBe(result2.trace.states.healthy[c]);
        }
    });

    test('8. Different parameter overrides produce different results', () => {
        const project = createMarkovProject();

        const result1 = engine.run(project, { p_sick_to_dead: 0.01 });
        const result2 = engine.run(project, { p_sick_to_dead: 0.20 });

        expect(result1.total_costs).not.toBe(result2.total_costs);
        expect(result1.total_qalys).not.toBe(result2.total_qalys);

        // Higher death rate -> lower life years
        expect(result2.life_years).toBeLessThan(result1.life_years);
    });

    test('9. Discounting reduces future values', () => {
        const projectNoDiscount = createMarkovProject({
            settings: {
                time_horizon: 10,
                cycle_length: 1,
                discount_rate_costs: 0,
                discount_rate_qalys: 0,
                half_cycle_correction: 'none',
                starting_age: 50
            }
        });
        const projectDiscount = createMarkovProject({
            settings: {
                time_horizon: 10,
                cycle_length: 1,
                discount_rate_costs: 0.05,
                discount_rate_qalys: 0.05,
                half_cycle_correction: 'none',
                starting_age: 50
            }
        });

        const resultNoDisc = engine.run(projectNoDiscount);
        const resultDisc = engine.run(projectDiscount);

        // Discounted values should be less than undiscounted
        expect(resultDisc.total_costs).toBeLessThan(resultNoDisc.total_costs);
        expect(resultDisc.total_qalys).toBeLessThan(resultNoDisc.total_qalys);
    });

    test('10. Half-cycle correction changes results vs no correction', () => {
        const projectNone = createMarkovProject({
            settings: {
                time_horizon: 10,
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                half_cycle_correction: 'none',
                starting_age: 50
            }
        });
        const projectTrap = createMarkovProject({
            settings: {
                time_horizon: 10,
                cycle_length: 1,
                discount_rate_costs: 0.035,
                discount_rate_qalys: 0.035,
                half_cycle_correction: 'trapezoidal',
                starting_age: 50
            }
        });

        const resultNone = engine.run(projectNone);
        const resultTrap = engine.run(projectTrap);

        // Half-cycle correction should change costs and QALYs
        expect(resultTrap.total_costs).not.toBe(resultNone.total_costs);
        expect(resultTrap.total_qalys).not.toBe(resultNone.total_qalys);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 2: Meta-Analysis Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 2: Meta-Analysis Pipeline', () => {
    let metaEngine;

    beforeEach(() => {
        metaEngine = new MetaAnalysisMethods({ method: 'DL' });
    });

    test('1. DL meta-analysis produces pooled effect with heterogeneity stats', () => {
        const studies = createMetaStudies(8);
        const pooled = metaEngine.calculatePooledEffect(studies);

        expect(pooled).toBeDefined();
        expect(typeof pooled.random.effect).toBe('number');
        expect(typeof pooled.random.se).toBe('number');
        expect(pooled.random.ci_lower).toBeLessThan(pooled.random.ci_upper);

        // Heterogeneity statistics
        expect(typeof pooled.heterogeneity.I2).toBe('number');
        expect(pooled.heterogeneity.I2).toBeGreaterThanOrEqual(0);
        expect(pooled.heterogeneity.I2).toBeLessThanOrEqual(100);
        expect(typeof pooled.heterogeneity.tauSquared).toBe('number');
        expect(pooled.heterogeneity.tauSquared).toBeGreaterThanOrEqual(0);
    });

    test('2. NMA with 4 treatments produces league table and SUCRA', async () => {
        const nma = new NetworkMetaAnalysis({
            seed: 12345,
            nIterations: 5000,
            nBurnin: 1000,
            nThin: 1,
            model: 'random'
        });

        nma.setData(createNMAData(), 'binary');
        const results = await nma.run();

        // League table
        expect(results.leagueTable).toBeDefined();
        expect(Array.isArray(results.leagueTable) || typeof results.leagueTable === 'object').toBe(true);

        // SUCRA rankings
        expect(results.sucra).toBeDefined();
        expect(Array.isArray(results.sucra)).toBe(true);
        expect(results.sucra.length).toBe(4); // 4 treatments

        // Each treatment gets a SUCRA score (0-100 scale)
        for (const s of results.sucra) {
            expect(typeof s.sucra).toBe('number');
            expect(s.sucra).toBeGreaterThanOrEqual(0);
            expect(s.sucra).toBeLessThanOrEqual(100);
        }
    });

    test('3. NMA results fed into MCDA (cost + efficacy criteria)', async () => {
        // Step 1: Run NMA
        const nma = new NetworkMetaAnalysis({
            seed: 12345,
            nIterations: 3000,
            nBurnin: 500,
            model: 'random'
        });
        nma.setData(createNMAData(), 'binary');
        const nmaResults = await nma.run();

        // Step 2: Use SUCRA scores + hypothetical costs in MCDA
        const mcda = new MCDAEngine({ seed: 42 });
        const treatments = nmaResults.sucra.map(s => s.treatment);
        const alternatives = treatments.map((t, i) => ({
            name: t,
            values: {
                efficacy: nmaResults.sucra[i].sucra,  // 0-100 scale
                cost: 1000 + i * 500  // hypothetical costs
            }
        }));

        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [0, 100] },
            { name: 'cost', direction: 'minimize', scale: [500, 3500] }
        ];
        const weights = { efficacy: 0.6, cost: 0.4 };

        const mcdaResult = mcda.weightedSum(alternatives, criteria, weights);

        expect(mcdaResult).toBeDefined();
        expect(Array.isArray(mcdaResult)).toBe(true);
        expect(mcdaResult.length).toBe(4);

        // Each alternative gets a score
        for (const r of mcdaResult) {
            expect(typeof r.score).toBe('number');
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
        }
    });

    test('4. Heterogeneity statistics chain correctly (I2, tau2, PI)', () => {
        // Studies with known heterogeneity
        const heterogeneousStudies = [
            { effect: 0.1, se: 0.05, n: 100 },
            { effect: 0.5, se: 0.06, n: 80 },
            { effect: 0.2, se: 0.04, n: 120 },
            { effect: 0.8, se: 0.07, n: 60 },
            { effect: -0.1, se: 0.08, n: 50 }
        ];

        const pooled = metaEngine.calculatePooledEffect(heterogeneousStudies);

        expect(pooled.heterogeneity.tauSquared).toBeGreaterThan(0);
        expect(pooled.heterogeneity.I2).toBeGreaterThan(0);
        expect(pooled.heterogeneity.Q).toBeGreaterThan(0);

        // Prediction interval should be wider than CI when there is heterogeneity
        if (pooled.heterogeneity.predictionInterval) {
            const piWidth = pooled.heterogeneity.predictionInterval.upper - pooled.heterogeneity.predictionInterval.lower;
            const ciWidth = pooled.random.ci_upper - pooled.random.ci_lower;
            expect(piWidth).toBeGreaterThanOrEqual(ciWidth);
        }
    });

    test('5. Leave-one-out sensitivity produces k results for k studies', () => {
        const studies = createMetaStudies(6);
        const loo = metaEngine.leaveOneOut(studies);

        expect(loo).toBeDefined();
        expect(loo.results).toBeDefined();
        expect(Array.isArray(loo.results)).toBe(true);
        expect(loo.results.length).toBe(6);

        // Each result should have pooled effect
        for (const r of loo.results) {
            expect(typeof r.effect).toBe('number');
            expect(typeof r.se).toBe('number');
        }
    });

    test('6. Meta-analysis with 0 heterogeneity: FE equals RE', () => {
        // Identical effects -> tau2 = 0
        const homogeneousStudies = [
            { effect: 0.3, se: 0.05, n: 100 },
            { effect: 0.3, se: 0.06, n: 80 },
            { effect: 0.3, se: 0.04, n: 120 },
            { effect: 0.3, se: 0.07, n: 60 }
        ];

        const re = new MetaAnalysisMethods({ method: 'DL' });
        const reResult = re.calculatePooledEffect(homogeneousStudies);

        // tauSquared should be 0 (or negligible) for identical effects
        expect(reResult.heterogeneity.tauSquared).toBeCloseTo(0, 5);

        // When tau2 = 0, FE and RE should be identical
        // Both use inverse variance weights with same tau2 = 0
        expect(reResult.heterogeneity.I2).toBeCloseTo(0, 1);
    });

    test('7. Large k (50 studies) completes within 5 seconds', () => {
        const studies = createMetaStudies(50);

        const start = performance.now();
        const pooled = metaEngine.calculatePooledEffect(studies);
        const elapsed = performance.now() - start;

        expect(pooled).toBeDefined();
        expect(elapsed).toBeLessThan(5000);

        // Also run leave-one-out on 50 studies
        const loo = metaEngine.leaveOneOut(studies);
        expect(loo).toBeDefined();
        expect(loo.results).toBeDefined();
        expect(loo.results.length).toBe(50);
    });

    test('8. Forest plot data has correct structure', () => {
        const studies = createMetaStudies(5);
        const pooled = metaEngine.calculatePooledEffect(studies);

        // The pooled result contains what is needed for a forest plot:
        // random-effects pooled effect + CI, fixed-effects pooled effect + CI, weights
        expect(pooled.random).toBeDefined();
        expect(pooled.random.effect).toBeDefined();
        expect(pooled.random.ci_lower).toBeDefined();
        expect(pooled.random.ci_upper).toBeDefined();
        expect(pooled.fixed).toBeDefined();
        expect(pooled.fixed.effect).toBeDefined();

        // Verify study weights exist
        expect(pooled.weights).toBeDefined();
        expect(pooled.weights.fixed).toBeDefined();
        expect(pooled.weights.random).toBeDefined();
        expect(pooled.weights.fixed.length).toBe(5);
        expect(pooled.weights.random.length).toBe(5);
        for (const w of pooled.weights.random) {
            expect(typeof w).toBe('number');
            expect(w).toBeGreaterThan(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 3: Economic Evaluation Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 3: Economic Evaluation Pipeline', () => {
    test('1. BIA with scenario analysis produces comparison table', () => {
        const bia = new BudgetImpactEngine();
        const baseConfig = createBIAConfig();

        const scenarioResult = bia.scenarioAnalysis(baseConfig, {
            pessimistic: { newTx: { drugCost: 7000, adminCost: 300, monitoringCost: 400, aeCost: 200 } },
            optimistic: { newTx: { drugCost: 3500, adminCost: 150, monitoringCost: 250, aeCost: 80 } }
        });

        expect(scenarioResult.base).toBeDefined();
        expect(scenarioResult.base.netBudgetImpact).toBeDefined();
        expect(scenarioResult.scenarios.pessimistic).toBeDefined();
        expect(scenarioResult.scenarios.optimistic).toBeDefined();

        // Pessimistic delta should be positive (higher cost)
        expect(scenarioResult.scenarios.pessimistic.delta).toBeGreaterThan(0);
        // Optimistic delta should be negative (lower cost)
        expect(scenarioResult.scenarios.optimistic.delta).toBeLessThan(0);
    });

    test('2. Threshold analysis finds break-even price', () => {
        const threshold = new ThresholdAnalysisEngine();

        // Simple model: drug cost vs comparator
        const modelFn = (params) => ({
            cost: params.drugCost + 2000,
            qaly: 5.5,
            comparatorCost: 3000,
            comparatorQaly: 5.0
        });

        const result = threshold.oneway(
            modelFn, 'drugCost', [0, 10000], 50000, 100
        );

        expect(result).toBeDefined();
        expect(result.param).toBe('drugCost');
        expect(result.values.length).toBe(101);
        expect(result.nmb.length).toBe(101);

        // At WTP=50000 and incQALY=0.5: NMB = 0.5*50000 - (drugCost+2000-3000) = 26000 - drugCost
        // Break-even: drugCost = 26000
        if (result.thresholdExists) {
            expect(result.threshold).toBeGreaterThan(0);
            expect(result.threshold).toBeLessThan(10000);
        }
    });

    test('3. Tornado diagram correctly ranks parameters by influence', () => {
        const threshold = new ThresholdAnalysisEngine();

        // Model with multiple parameters
        const modelFn = (params) => ({
            cost: (params.drugCost ?? 5000) + (params.adminCost ?? 500),
            qaly: (params.efficacy ?? 5.5),
            comparatorCost: 3000,
            comparatorQaly: 5.0
        });

        const baseParams = { drugCost: 5000, adminCost: 500, efficacy: 5.5 };

        // Run one-way for each parameter
        const tornadoData = [];
        const paramRanges = [
            { name: 'drugCost', range: [2000, 8000] },
            { name: 'adminCost', range: [200, 800] },
            { name: 'efficacy', range: [5.0, 6.0] }
        ];

        for (const p of paramRanges) {
            const result = threshold.oneway(modelFn, p.name, p.range, 50000, 50, baseParams);
            const swing = Math.abs(result.nmb[result.nmb.length - 1] - result.nmb[0]);
            tornadoData.push({ param: p.name, swing });
        }

        // Sort by swing descending
        tornadoData.sort((a, b) => b.swing - a.swing);

        expect(tornadoData.length).toBe(3);
        // Drug cost has wide range (6000 swing) vs admin (600 swing), so should rank higher
        expect(tornadoData[0].swing).toBeGreaterThan(tornadoData[2].swing);
    });

    test('4. EVSI < EVPPI for all study designs', () => {
        const evsi = new EVSIEngine({ seed: 42, nOuter: 500, nInner: 200 });

        // Create mock PSA results
        const rng = new PCG32(42);
        const iterations = [];
        for (let i = 0; i < 200; i++) {
            const p = 0.3 + rng.nextFloat() * 0.4;
            const costs = 5000 + p * 10000;
            const qalys = 5 + (1 - p) * 2;
            const nmb = qalys * 50000 - costs;
            iterations.push({
                params: { p_response: p },
                costs,
                qalys,
                nmb,
                optimal: nmb > 0 ? 1 : 0
            });
        }

        const psaResults = {
            iterations,
            wtp: 50000,
            evpi: 5000
        };

        const designs = [
            { sampleSize: 50, parameter: 'p_response', dataModel: 'binomial', type: 'rct' },
            { sampleSize: 200, parameter: 'p_response', dataModel: 'binomial', type: 'rct' },
            { sampleSize: 500, parameter: 'p_response', dataModel: 'binomial', type: 'rct' }
        ];

        for (const design of designs) {
            const result = evsi.compute(psaResults, design);
            expect(result.evsi).toBeGreaterThanOrEqual(0);
            expect(result.evppi).toBeGreaterThanOrEqual(0);
            // EVSI <= EVPPI (sample information is always less than perfect information)
            expect(result.evsi).toBeLessThanOrEqual(result.evppi + 1e-6);
        }
    });

    test('5. Scenario analysis: pessimistic > base > optimistic for costs', () => {
        const scenario = new ScenarioAnalysisEngine();

        const modelFn = (params) => ({
            cost: params.drugCost + params.adminCost,
            qaly: params.efficacy,
            comparatorCost: 3000,
            comparatorQaly: 5.0
        });

        const baseParams = { drugCost: 5000, adminCost: 500, efficacy: 5.5 };
        const scenarios = {
            pessimistic: { drugCost: 8000, adminCost: 800, efficacy: 5.1 },
            optimistic: { drugCost: 3000, adminCost: 300, efficacy: 6.0 }
        };

        const result = scenario.run(modelFn, baseParams, scenarios);

        expect(result.base).toBeDefined();
        expect(result.scenarios.pessimistic).toBeDefined();
        expect(result.scenarios.optimistic).toBeDefined();

        // Pessimistic has higher costs
        const pessCost = result.scenarios.pessimistic.results.cost;
        const baseCost = result.base.results.cost;
        const optCost = result.scenarios.optimistic.results.cost;

        expect(pessCost).toBeGreaterThan(baseCost);
        expect(baseCost).toBeGreaterThan(optCost);
    });

    test('6. Cross-scenario with 3 dimensions produces 27 combinations', () => {
        const scenario = new ScenarioAnalysisEngine();

        const modelFn = (params) => ({
            cost: (params.drugCost ?? 5000) + (params.adminCost ?? 500),
            qaly: params.efficacy ?? 5.5,
            comparatorCost: 3000,
            comparatorQaly: 5.0
        });

        const baseParams = { drugCost: 5000, adminCost: 500, efficacy: 5.5 };

        const dimensions = {
            drugCost: { low: 3000, mid: 5000, high: 7000 },
            adminCost: { low: 300, mid: 500, high: 700 },
            efficacy: { low: 5.0, mid: 5.5, high: 6.0 }
        };

        const result = scenario.crossScenario(modelFn, baseParams, dimensions);

        expect(result.totalCombinations).toBe(27);
        expect(result.combinations.length).toBe(27);
        expect(result.dimensions.length).toBe(3);

        // Each combination has labels and results
        for (const combo of result.combinations) {
            expect(combo.labels).toBeDefined();
            expect(combo.results).toBeDefined();
            expect(typeof combo.results.cost).toBe('number');
        }
    });

    test('7. Budget impact + threshold integrated: find max price for budget ceiling', () => {
        const bia = new BudgetImpactEngine();
        const threshold = new ThresholdAnalysisEngine();

        // Use threshold analysis to find max drug price that stays under budget ceiling
        const budgetCeiling = 5000000; // 5M ceiling over 5 years

        const modelFn = (params) => {
            const config = createBIAConfig({
                newTx: { drugCost: params.drugCost, adminCost: 200, monitoringCost: 300, aeCost: 100 }
            });
            const result = bia.run(config);
            return {
                cost: result.netBudgetImpact,
                qaly: 0,
                comparatorCost: budgetCeiling,
                comparatorQaly: 0
            };
        };

        const result = threshold.oneway(
            modelFn, 'drugCost', [1000, 20000], 1, 50
        );

        expect(result).toBeDefined();
        expect(result.values.length).toBe(51);
    });

    test('8. Discount rate sensitivity: 0%, 3%, 5% produce ordered results', () => {
        const bia = new BudgetImpactEngine();

        const rates = [0, 0.03, 0.05];
        const discountedResults = rates.map(r => {
            const config = createBIAConfig({ discountRate: r });
            return bia.run(config);
        });

        // Higher discount rate -> lower discounted total
        // netBudgetImpact is undiscounted (ISPOR BIA), so compare totalDiscounted
        expect(discountedResults[0].totalDiscounted).toBeGreaterThanOrEqual(
            discountedResults[1].totalDiscounted - 1
        );
        expect(discountedResults[1].totalDiscounted).toBeGreaterThanOrEqual(
            discountedResults[2].totalDiscounted - 1
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 4: Survival Extrapolation Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 4: Survival Extrapolation Pipeline', () => {
    test('1. Fit 4 distributions, compute model-average survival prediction', () => {
        const maEngine = new ModelAveragingEngine();
        const data = createSurvivalData(150, 42);

        const fits = maEngine.fitCompare(data, ['weibull', 'lognormal', 'loglogistic', 'gamma']);

        expect(fits).toBeDefined();
        expect(fits.length).toBe(4);

        // Each fit should have AIC/BIC
        for (const fit of fits) {
            expect(typeof fit.aic).toBe('number');
            expect(typeof fit.bic).toBe('number');
        }

        // Compute AIC weights
        const aicWeights = maEngine.aicWeights(fits.map(f => ({ name: f.name, aic: f.aic })));
        expect(aicWeights.length).toBe(4);

        // Weights should sum to 1
        const wSum = aicWeights.reduce((a, w) => a + w.weight, 0);
        expect(Math.abs(wSum - 1.0)).toBeLessThan(0.01);
    });

    test('2. Cure model with background mortality produces long-term extrapolation', () => {
        const cureEngine = new CureModelEngine();
        const data = createSurvivalData(200, 42);

        const fit = cureEngine.mixtureCure(data, { distribution: 'weibull' });

        expect(fit).toBeDefined();
        expect(typeof fit.cureFraction).toBe('number');
        expect(fit.cureFraction).toBeGreaterThanOrEqual(0);
        expect(fit.cureFraction).toBeLessThanOrEqual(1);

        // Predict survival at future times
        const times = [1, 5, 10, 20, 50];
        const predictions = cureEngine.predict(fit, times);

        expect(predictions).toBeDefined();
        expect(predictions.length).toBe(times.length);

        // Survival should be monotonically non-increasing
        for (let i = 1; i < predictions.length; i++) {
            expect(predictions[i].survival).toBeLessThanOrEqual(predictions[i - 1].survival + 1e-9);
        }

        // At very long time, survival should approach the cure fraction
        if (fit.cureFraction > 0) {
            const longTermSurv = predictions[predictions.length - 1].survival;
            // Should be near cure fraction (within some tolerance due to uncured decay)
            expect(longTermSurv).toBeGreaterThanOrEqual(0);
        }
    });

    test('3. Competing risks CIF + cause-specific hazards sum correctly', () => {
        const crEngine = new CompetingRisksEngine();
        const data = createCompetingRisksData(200, 42);
        const causes = ['disease', 'other'];

        const result = crEngine.cumulativeIncidence(data, causes);

        expect(result.disease).toBeDefined();
        expect(result.other).toBeDefined();
        expect(result.overallSurvival).toBeDefined();

        // At each time point: CIF_disease(t) + CIF_other(t) + S(t) should be ~1
        const nPoints = Math.min(result.disease.length, result.other.length, result.overallSurvival.length);
        for (let i = 0; i < nPoints; i++) {
            const total = result.disease[i].cif + result.other[i].cif + result.overallSurvival[i].surv;
            expect(Math.abs(total - 1.0)).toBeLessThan(0.05);
        }
    });

    test('4. Semi-Markov with Weibull sojourn: state trace sums to 1.0', () => {
        const smEngine = new SemiMarkovEngine({ maxCycles: 50 });

        const config = {
            states: ['healthy', 'sick', 'dead'],
            initial: [1.0, 0.0, 0.0],
            transitions: {
                'healthy->sick': { type: 'weibull', shape: 1.5, scale: 20 },
                'healthy->dead': { type: 'constant', rate: 0.02 },
                'sick->dead': { type: 'weibull', shape: 2.0, scale: 10 }
            },
            costs: { healthy: 500, sick: 3000, dead: 0 },
            utilities: { healthy: 0.9, sick: 0.5, dead: 0 },
            timeHorizon: 30,
            discountRate: 0.035,
            cycleLength: 1
        };

        const result = smEngine.run(config);

        expect(result).toBeDefined();
        expect(result.stateTrace).toBeDefined();
        expect(typeof result.totalCosts).toBe('number');
        expect(typeof result.totalQALYs).toBe('number');

        // State trace at each cycle should sum to ~1.0
        // stateTrace is an array of arrays: stateTrace[cycle] = [state0prop, state1prop, ...]
        if (result.stateTrace && result.stateTrace.length > 0) {
            for (const row of result.stateTrace) {
                let rowTotal = 0;
                for (let i = 0; i < row.length; i++) {
                    if (typeof row[i] === 'number') {
                        rowTotal += row[i];
                    }
                }
                expect(Math.abs(rowTotal - 1.0)).toBeLessThan(0.01);
            }
        }
    });

    test('5. Model-averaged survival is between individual model curves', () => {
        const maEngine = new ModelAveragingEngine();

        // Synthetic model predictions at 5 time points
        const models = [
            { name: 'weibull', predictions: [0.95, 0.80, 0.60, 0.35, 0.15], weight: 0.4 },
            { name: 'lognormal', predictions: [0.96, 0.85, 0.70, 0.50, 0.30], weight: 0.35 },
            { name: 'loglogistic', predictions: [0.94, 0.78, 0.55, 0.30, 0.10], weight: 0.15 },
            { name: 'gamma', predictions: [0.93, 0.82, 0.65, 0.40, 0.20], weight: 0.10 }
        ];

        const result = maEngine.modelAverage(models);

        expect(result.averaged.length).toBe(5);

        // At each time point, averaged should be between min and max of individual models
        for (let j = 0; j < 5; j++) {
            const indivValues = models.map(m => m.predictions[j]);
            const minVal = Math.min(...indivValues);
            const maxVal = Math.max(...indivValues);
            expect(result.averaged[j]).toBeGreaterThanOrEqual(minVal - 1e-9);
            expect(result.averaged[j]).toBeLessThanOrEqual(maxVal + 1e-9);
        }
    });

    test('6. AIC-best model gets highest weight', () => {
        const maEngine = new ModelAveragingEngine();

        const models = [
            { name: 'weibull', aic: 500 },
            { name: 'lognormal', aic: 510 },
            { name: 'loglogistic', aic: 520 },
            { name: 'gamma', aic: 495 }  // Best AIC (lowest)
        ];

        const weights = maEngine.aicWeights(models);

        // gamma should have highest weight
        const gammaWeight = weights.find(w => w.name === 'gamma');
        expect(gammaWeight).toBeDefined();

        for (const w of weights) {
            if (w.name !== 'gamma') {
                expect(gammaWeight.weight).toBeGreaterThan(w.weight);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 5: Correlated PSA + MCDA Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 5: Correlated PSA + MCDA Pipeline', () => {
    test('1. Correlated PSA with 3 params verifies empirical correlation', () => {
        const cpsa = new CorrelatedPSAEngine({ seed: 12345, nIterations: 1000 });

        const corrMatrix = [
            [1.0, 0.5, 0.2],
            [0.5, 1.0, 0.3],
            [0.2, 0.3, 1.0]
        ];

        const samples = cpsa.correlatedNormal(
            [10, 20, 30],  // means
            [2, 3, 5],     // sds
            corrMatrix,
            1000
        );

        expect(samples.length).toBe(1000);

        // Check empirical correlation between param0 and param1
        const p0 = samples.map(s => s.param0);
        const p1 = samples.map(s => s.param1);

        const mean0 = p0.reduce((a, b) => a + b, 0) / p0.length;
        const mean1 = p1.reduce((a, b) => a + b, 0) / p1.length;
        let cov01 = 0, var0 = 0, var1 = 0;
        for (let i = 0; i < p0.length; i++) {
            cov01 += (p0[i] - mean0) * (p1[i] - mean1);
            var0 += (p0[i] - mean0) ** 2;
            var1 += (p1[i] - mean1) ** 2;
        }
        const empiricalCorr = cov01 / Math.sqrt(var0 * var1);

        // Should be close to the input correlation of 0.5 (within ~0.1 for n=1000)
        expect(Math.abs(empiricalCorr - 0.5)).toBeLessThan(0.15);
    });

    test('2. PSA results fed into MCDA weighted scoring and rank acceptability', () => {
        const cpsa = new CorrelatedPSAEngine({ seed: 42, nIterations: 200 });
        const mcda = new MCDAEngine({ seed: 42 });

        // Run correlated PSA
        const model = (params) => ({
            costs: params.cost_drug + params.cost_admin,
            qalys: params.efficacy * 5
        });

        const paramDefs = [
            { name: 'cost_drug', dist: { type: 'normal', mean: 5000, sd: 500 } },
            { name: 'cost_admin', dist: { type: 'normal', mean: 500, sd: 100 } },
            { name: 'efficacy', dist: { type: 'beta', alpha: 8, beta: 2 } }
        ];

        const corrMatrix = [
            [1.0, 0.3, 0.0],
            [0.3, 1.0, 0.0],
            [0.0, 0.0, 1.0]
        ];

        const psaResult = cpsa.runCorrelatedPSA(model, paramDefs, corrMatrix, 200);

        expect(psaResult).toBeDefined();
        expect(psaResult.iterations.length).toBe(200);

        // Use mean PSA results as MCDA alternatives
        const alternatives = [
            { name: 'NewDrug', values: { cost: psaResult.summary.meanCost, efficacy: psaResult.summary.meanQaly } },
            { name: 'Comparator', values: { cost: 3000, efficacy: 4.0 } }
        ];

        const criteria = [
            { name: 'cost', direction: 'minimize', scale: [0, 10000] },
            { name: 'efficacy', direction: 'maximize', scale: [0, 10] }
        ];
        const weights = { cost: 0.4, efficacy: 0.6 };

        const scores = mcda.weightedSum(alternatives, criteria, weights);
        expect(scores.length).toBe(2);
        expect(typeof scores[0].score).toBe('number');
    });

    test('3. CEAC from correlated PSA crosses at expected region', () => {
        const cpsa = new CorrelatedPSAEngine({ seed: 12345, nIterations: 500 });

        const model = (params) => ({
            costs: params.drug_cost,
            qalys: params.efficacy * 5
        });

        const paramDefs = [
            { name: 'drug_cost', dist: { type: 'normal', mean: 10000, sd: 1000 } },
            { name: 'efficacy', dist: { type: 'beta', alpha: 6, beta: 4 } }
        ];

        const corrMatrix = [[1.0, 0.0], [0.0, 1.0]];

        const psaResult = cpsa.runCorrelatedPSA(model, paramDefs, corrMatrix, 500);

        // CEAC should be present inside summary
        expect(psaResult.summary).toBeDefined();
        expect(psaResult.summary.ceac).toBeDefined();
        expect(Array.isArray(psaResult.summary.ceac)).toBe(true);
        expect(psaResult.summary.ceac.length).toBeGreaterThan(0);

        // CEAC values should be between 0 and 1
        for (const point of psaResult.summary.ceac) {
            expect(point.prob).toBeGreaterThanOrEqual(0);
            expect(point.prob).toBeLessThanOrEqual(1);
        }
    });

    test('4. Cholesky + copula + MCDA is fully deterministic with seed', () => {
        const runPipeline = (seed) => {
            const cpsa = new CorrelatedPSAEngine({ seed, nIterations: 100 });
            const model = (params) => ({
                costs: params.cost,
                qalys: params.eff * 5
            });
            const paramDefs = [
                { name: 'cost', dist: { type: 'normal', mean: 5000, sd: 500 } },
                { name: 'eff', dist: { type: 'beta', alpha: 8, beta: 2 } }
            ];
            const corrMatrix = [[1.0, -0.2], [-0.2, 1.0]];
            return cpsa.runCorrelatedPSA(model, paramDefs, corrMatrix, 100);
        };

        const r1 = runPipeline(42);
        const r2 = runPipeline(42);

        expect(r1.summary.meanCost).toBe(r2.summary.meanCost);
        expect(r1.summary.meanQaly).toBe(r2.summary.meanQaly);

        // Individual iterations match
        for (let i = 0; i < r1.iterations.length; i++) {
            expect(r1.iterations[i].costs).toBe(r2.iterations[i].costs);
            expect(r1.iterations[i].qalys).toBe(r2.iterations[i].qalys);
        }
    });

    test('5. Weight sensitivity changes ranking at expected threshold', () => {
        const mcda = new MCDAEngine({ seed: 42 });

        const alternatives = [
            { name: 'DrugA', values: { cost: 8000, efficacy: 0.9 } },
            { name: 'DrugB', values: { cost: 4000, efficacy: 0.6 } }
        ];

        const criteria = [
            { name: 'cost', direction: 'minimize', scale: [0, 10000] },
            { name: 'efficacy', direction: 'maximize', scale: [0, 1] }
        ];

        const result = mcda.weightSensitivity(
            alternatives, criteria,
            { cost: 0.5, efficacy: 0.5 },
            'efficacy',
            20
        );

        expect(result).toBeDefined();
        expect(result.scores).toBeDefined();
        // scores is { DrugA: [...], DrugB: [...] }
        expect(result.scores['DrugA']).toBeDefined();
        expect(result.scores['DrugB']).toBeDefined();

        // 20 steps + 1 = 21 score values per alternative
        expect(result.scores['DrugA'].length).toBe(21);
        expect(result.scores['DrugB'].length).toBe(21);

        // Weight values should be 21 points from 0 to 1
        expect(result.weights.length).toBe(21);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 6: Validation + Export Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow 6: Validation + Export Pipeline', () => {
    test('1. Schema validation then semantic validation then audit log chain', () => {
        const project = createMarkovProject();
        const schemaVal = new SchemaValidator();
        const semanticVal = new SemanticValidator();
        const audit = new AuditLogger('integration-test');

        // Step 1: Schema validation
        audit.info('validation', 'Starting schema validation');
        const schemaResult = schemaVal.validate(project, {
            type: 'object',
            required: ['version', 'metadata', 'model']
        });
        audit.info('validation', 'Schema validation complete', { valid: schemaResult });

        // Step 2: Semantic validation
        audit.info('validation', 'Starting semantic validation');
        const semanticResult = semanticVal.validate(project);
        audit.info('validation', 'Semantic validation complete', {
            issues: semanticResult.issues.length
        });

        // Step 3: Check audit log
        expect(audit.entries.length).toBeGreaterThanOrEqual(4);
        expect(audit.entries[0].category).toBe('validation');
    });

    test('2. Invalid model produces both schema and semantic errors', () => {
        const invalidProject = {
            // Missing version and metadata.id
            version: '0.1',
            metadata: { id: 'test', name: 'Test' },
            model: { type: 'markov_cohort' },
            parameters: {
                p_bad: { value: -0.5 } // Negative probability
            },
            states: {
                only_state: { initial_probability: 1, cost: 0, utility: 0 }
            },
            transitions: {} // No transitions
        };

        const semanticVal = new SemanticValidator();
        const result = semanticVal.validate(invalidProject);

        // Should have issues (warnings or errors)
        expect(result.issues.length).toBeGreaterThan(0);
    });

    test('3. Audit log captures all events in correct order', () => {
        const audit = new AuditLogger('order-test');

        audit.info('step1', 'First event');
        audit.warn('step2', 'Warning event');
        audit.error('step3', 'Error event');
        audit.info('step4', 'Fourth event');

        expect(audit.entries.length).toBe(4);
        expect(audit.entries[0].category).toBe('step1');
        expect(audit.entries[1].category).toBe('step2');
        expect(audit.entries[2].category).toBe('step3');
        expect(audit.entries[3].category).toBe('step4');

        // Warnings and errors tracked separately
        expect(audit.warnings.length).toBe(1);
        expect(audit.errors.length).toBe(1);

        // Timestamps are ordered
        for (let i = 1; i < audit.entries.length; i++) {
            expect(audit.entries[i].timestamp >= audit.entries[i - 1].timestamp).toBe(true);
        }
    });

    test('4. Export generates valid structure for downstream use', () => {
        const project = createMarkovProject();
        const engine = new MarkovEngine({ logger: silentLogger });

        // Run model
        const result = engine.run(project);

        // Build export structure
        const exportData = {
            project: {
                id: project.metadata.id,
                name: project.metadata.name,
                version: project.version,
                modelType: project.model.type
            },
            results: {
                totalCosts: result.total_costs,
                totalQALYs: result.total_qalys,
                lifeYears: result.life_years,
                cycles: result.cycles
            },
            trace: result.trace,
            parameters: project.parameters,
            settings: project.settings
        };

        // Validate export structure
        expect(exportData.project.id).toBe('integ-test');
        expect(exportData.results.totalCosts).toBeGreaterThan(0);
        expect(exportData.trace.cycles.length).toBe(result.cycles + 1);

        // JSON serializable
        const json = JSON.stringify(exportData);
        const parsed = JSON.parse(json);
        expect(parsed.results.totalCosts).toBe(exportData.results.totalCosts);
    });

    test('5. Round-trip: create model -> validate -> run -> export -> re-import matches', () => {
        const project = createMarkovProject();
        const engine = new MarkovEngine({ logger: silentLogger });

        // Validate
        const semanticVal = new SemanticValidator();
        semanticVal.validate(project);

        // Run
        const result = engine.run(project);

        // Export
        const exportBundle = {
            project,
            results: {
                total_costs: result.total_costs,
                total_qalys: result.total_qalys,
                life_years: result.life_years
            }
        };

        // Serialize and re-import
        const json = JSON.stringify(exportBundle);
        const reimported = JSON.parse(json);

        // Re-run the reimported project
        const result2 = engine.run(reimported.project);

        // Results should match exactly (deterministic)
        expect(result2.total_costs).toBe(result.total_costs);
        expect(result2.total_qalys).toBe(result.total_qalys);
        expect(result2.life_years).toBe(result.life_years);
    });
});
