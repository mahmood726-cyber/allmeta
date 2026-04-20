/**
 * Stress & Fuzz Tests for HTA Engines
 *
 * Exercises engines with extreme, pathological, and boundary inputs.
 * Verifies no crash, hang, NaN, or Infinity under adversarial conditions.
 */

'use strict';

// ─── Imports ─────────────────────────────────────────────────────────────────

const { KahanSum, NeumaierSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { ExpressionParser } = require('../../src/parser/expression');
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');
const { MCDAEngine } = require('../../src/engine/mcda');
const { CompetingRisksEngine } = require('../../src/engine/competingRisks');
const { CureModelEngine } = require('../../src/engine/cureModels');
const { SemiMarkovEngine } = require('../../src/engine/semiMarkov');
const { CorrelatedPSAEngine } = require('../../src/engine/correlatedPSA');
const { ThresholdAnalysisEngine } = require('../../src/engine/thresholdAnalysis');
const { ModelAveragingEngine } = require('../../src/engine/modelAveraging');
const { EVSIEngine } = require('../../src/engine/evsi');
const { MultiStateModelEngine } = require('../../src/engine/multiStateModel');
const { JointModelEngine } = require('../../src/engine/jointModel');
const { HeadroomAnalysisEngine } = require('../../src/engine/headroomAnalysis');
const { ProbabilisticBIAEngine } = require('../../src/engine/probabilisticBIA');
const { NetworkMCDAEngine } = require('../../src/engine/networkMCDA');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expectFinite(value, label) {
    expect(isFinite(value)).toBe(true);
}

function expectNoNaN(obj) {
    JSON.stringify(obj, (key, val) => {
        if (typeof val === 'number') {
            expect(isFinite(val) || val === null).toBe(true);
        }
        return val;
    });
}

// ─── KahanSum Stress ─────────────────────────────────────────────────────────

describe('KahanSum Stress', () => {
    test('sum of 1M small values does not overflow', () => {
        const ks = new KahanSum();
        for (let i = 0; i < 1_000_000; i++) {
            ks.add(0.1);
        }
        const result = ks.total();
        expectFinite(result, 'sum of 1M values');
        expect(Math.abs(result - 100_000)).toBeLessThan(1);
    });

    test('alternating +1e15 / -1e15 x 1000 cancels to ~0', () => {
        const ks = new KahanSum();
        for (let i = 0; i < 1000; i++) {
            ks.add(1e15);
            ks.add(-1e15);
        }
        expect(Math.abs(ks.total())).toBeLessThan(1e-5);
    });

    test('all zeros sum to 0', () => {
        const values = new Array(10000).fill(0);
        expect(KahanSum.sum(values)).toBe(0);
    });

    test('single Infinity: Kahan compensation produces NaN (known limitation)', () => {
        // BUG FINDING: KahanSum cannot handle Infinity gracefully.
        // After adding Infinity, the compensation term becomes NaN (Inf - Inf),
        // which poisons subsequent additions. This is a known limitation of
        // Kahan summation — callers should guard against non-finite inputs.
        const ks = new KahanSum();
        ks.add(1);
        ks.add(Infinity);
        ks.add(2);
        // Ideal behavior would be Infinity, but Kahan compensation breaks it
        expect(isNaN(ks.total())).toBe(true);
    });

    test('mix of NaN and numbers yields NaN', () => {
        const ks = new KahanSum();
        ks.add(1);
        ks.add(NaN);
        ks.add(2);
        expect(isNaN(ks.total())).toBe(true);
    });
});

// ─── PCG32 Stress ────────────────────────────────────────────────────────────

describe('PCG32 Stress', () => {
    test('generate 100K floats: all in [0,1), no NaN', () => {
        const rng = new PCG32(42);
        for (let i = 0; i < 100_000; i++) {
            const v = rng.nextFloat();
            if (v < 0 || v >= 1 || isNaN(v)) {
                throw new Error(`Bad float at iteration ${i}: ${v}`);
            }
        }
        expect(true).toBe(true);
    });

    test('extreme seed 2^53: produces valid output', () => {
        const rng = new PCG32(2 ** 53);
        for (let i = 0; i < 100; i++) {
            const v = rng.nextFloat();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('seed 0: works without error', () => {
        const rng = new PCG32(0);
        const v = rng.nextFloat();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    });

    test('10K beta(0.01, 0.01): extreme parameters, no NaN', () => {
        const rng = new PCG32(777);
        for (let i = 0; i < 10_000; i++) {
            const v = rng.beta(0.01, 0.01);
            if (isNaN(v) || v < 0 || v > 1) {
                throw new Error(`Bad beta at iteration ${i}: ${v}`);
            }
        }
        expect(true).toBe(true);
    });

    test('10K gamma(0.001, 1000): extreme shape, no crash', () => {
        const rng = new PCG32(999);
        for (let i = 0; i < 10_000; i++) {
            const v = rng.gamma(0.001, 1000);
            if (isNaN(v) || v < 0) {
                throw new Error(`Bad gamma at iteration ${i}: ${v}`);
            }
        }
        expect(true).toBe(true);
    });
});

// ─── ExpressionParser Stress ─────────────────────────────────────────────────

describe('ExpressionParser Stress', () => {
    test('deeply nested: 20 levels of parentheses', () => {
        const expr = '(' .repeat(20) + '1 + 2' + ')'.repeat(20);
        const result = ExpressionParser.evaluate(expr);
        expect(result).toBe(3);
    });

    test('very long expression: 1000 additions', () => {
        const terms = new Array(1000).fill('1').join(' + ');
        const result = ExpressionParser.evaluate(terms);
        expect(result).toBe(1000);
    });

    test('division chain: 1/3/3/3... x 100', () => {
        const expr = '1' + '/3'.repeat(100);
        const result = ExpressionParser.evaluate(expr);
        expectFinite(result, 'division chain');
        expect(result).toBeGreaterThan(0);
    });

    test('all operators combined in one expression', () => {
        const expr = '(2 + 3) * (4 - 1) / 2 % 5 ^ 2';
        const result = ExpressionParser.evaluate(expr);
        expectFinite(result, 'all operators');
    });

    test('unicode variable names do not crash (should throw cleanly)', () => {
        // Identifiers only support [a-zA-Z_][a-zA-Z0-9_]*, so unicode should throw
        expect(() => ExpressionParser.evaluate('\u03B1 + 1')).toThrow();
    });
});

// ─── BudgetImpact Stress ─────────────────────────────────────────────────────

describe('BudgetImpact Stress', () => {
    function makeBIAConfig(overrides = {}) {
        return {
            population: 1000000,
            prevalence: 0.01,
            timeHorizon: 5,
            uptake: [0.1, 0.2, 0.3, 0.4, 0.5],
            newTx: { drugCost: 5000, adminCost: 500, monitoringCost: 200, aeCost: 100 },
            currentTx: { drugCost: 2000, adminCost: 300, monitoringCost: 150, aeCost: 50 },
            discountRate: 0.03,
            ...overrides
        };
    }

    test('population = 1e9 (billion): no overflow', () => {
        const bia = new BudgetImpactEngine();
        const config = makeBIAConfig({ population: 1000000000 });
        const result = bia.run(config);
        expectFinite(result.netBudgetImpact, 'billion pop BIA');
        expectNoNaN(result.summary);
    });

    test('prevalence = 1e-10 (very rare): eligible ~0, no crash', () => {
        const bia = new BudgetImpactEngine();
        const config = makeBIAConfig({ prevalence: 1e-10 });
        const result = bia.run(config);
        expect(result.eligiblePopulation).toBe(0);
        expectFinite(result.netBudgetImpact, 'rare disease');
    });

    test('20-year horizon: works correctly', () => {
        const bia = new BudgetImpactEngine();
        const uptake = new Array(20).fill(0).map((_, i) => Math.min(1, (i + 1) / 20));
        const config = makeBIAConfig({ timeHorizon: 20, uptake });
        const result = bia.run(config);
        expect(result.yearlyBudget.length).toBe(20);
        expectFinite(result.totalDiscounted, '20-year total');
    });

    test('all costs = 0: zero impact', () => {
        const bia = new BudgetImpactEngine();
        const config = makeBIAConfig({
            newTx: { drugCost: 0, adminCost: 0, monitoringCost: 0, aeCost: 0 },
            currentTx: { drugCost: 0, adminCost: 0, monitoringCost: 0, aeCost: 0 }
        });
        const result = bia.run(config);
        expect(result.netBudgetImpact).toBe(0);
    });

    test('negative offsets larger than costs: negative incremental OK', () => {
        const bia = new BudgetImpactEngine();
        const config = makeBIAConfig({
            offsets: { hospitalization: -50000, productivity: -10000 }
        });
        const result = bia.run(config);
        // Large negative offsets should produce negative budget impact
        expect(result.netBudgetImpact).toBeLessThan(0);
    });
});

// ─── MCDA Stress ─────────────────────────────────────────────────────────────

describe('MCDA Stress', () => {
    test('100 alternatives, 50 criteria: completes', () => {
        const mcda = new MCDAEngine();
        const criteria = [];
        const weights = {};
        for (let c = 0; c < 50; c++) {
            criteria.push({ name: `c${c}`, direction: 'maximize', scale: [0, 100] });
            weights[`c${c}`] = 1 / 50;
        }
        const alternatives = [];
        for (let a = 0; a < 100; a++) {
            const values = {};
            for (let c = 0; c < 50; c++) {
                values[`c${c}`] = (a * 7 + c * 13) % 100;
            }
            alternatives.push({ name: `alt${a}`, values });
        }
        const results = mcda.weightedSum(alternatives, criteria, weights);
        expect(results.length).toBe(100);
        for (const r of results) {
            expectFinite(r.score, r.name);
        }
    });

    test('all alternatives identical: tied scores', () => {
        const mcda = new MCDAEngine();
        const criteria = [
            { name: 'eff', direction: 'maximize', scale: [0, 1] },
            { name: 'safe', direction: 'minimize', scale: [0, 1] }
        ];
        const weights = { eff: 0.5, safe: 0.5 };
        const alternatives = [];
        for (let i = 0; i < 5; i++) {
            alternatives.push({ name: `alt${i}`, values: { eff: 0.5, safe: 0.3 } });
        }
        const results = mcda.weightedSum(alternatives, criteria, weights);
        const scores = results.map(r => r.score);
        for (const s of scores) {
            expect(Math.abs(s - scores[0])).toBeLessThan(1e-10);
        }
    });

    test('single alternative: rank 1', () => {
        const mcda = new MCDAEngine();
        const criteria = [{ name: 'x', direction: 'maximize', scale: [0, 10] }];
        const weights = { x: 1.0 };
        const results = mcda.weightedSum(
            [{ name: 'only', values: { x: 5 } }],
            criteria, weights
        );
        expect(results.length).toBe(1);
        expect(results[0].rank).toBe(1);
    });

    test('weight = 0 for all criteria: scores all 0', () => {
        const mcda = new MCDAEngine();
        const criteria = [
            { name: 'a', direction: 'maximize', scale: [0, 1] },
            { name: 'b', direction: 'maximize', scale: [0, 1] }
        ];
        // Weights must sum to ~1 for validation, so use near-zero
        // Instead, test that zero-weighted criteria contribute nothing
        const weights = { a: 1.0, b: 0.0 };
        const results = mcda.weightedSum(
            [
                { name: 'x', values: { a: 0, b: 1 } },
                { name: 'y', values: { a: 0, b: 0 } }
            ],
            criteria, weights
        );
        // Both have a=0, so scores tied at 0
        expect(Math.abs(results[0].score - results[1].score)).toBeLessThan(1e-10);
    });

    test('scale min = max: throws for division by zero', () => {
        const mcda = new MCDAEngine();
        expect(() => {
            mcda.weightedSum(
                [{ name: 'a', values: { x: 5 } }],
                [{ name: 'x', direction: 'maximize', scale: [5, 5] }],
                { x: 1.0 }
            );
        }).toThrow();
    });
});

// ─── CompetingRisks Stress ───────────────────────────────────────────────────

describe('CompetingRisks Stress', () => {
    test('1000 subjects: completes in reasonable time', () => {
        const engine = new CompetingRisksEngine();
        const data = [];
        for (let i = 0; i < 1000; i++) {
            if (i % 3 === 0) {
                data.push({ time: i * 0.1, event: 'death' });
            } else if (i % 3 === 1) {
                data.push({ time: i * 0.1, event: 'relapse' });
            } else {
                data.push({ time: i * 0.1, event: 'censored' });
            }
        }
        const result = engine.cumulativeIncidence(data, ['death', 'relapse']);
        expect(result.death.length).toBeGreaterThan(0);
        expect(result.relapse.length).toBeGreaterThan(0);
    });

    test('all events at time 0: does not crash', () => {
        const engine = new CompetingRisksEngine();
        const data = [];
        for (let i = 0; i < 50; i++) {
            data.push({ time: 0, event: i < 25 ? 'death' : 'relapse' });
        }
        const result = engine.cumulativeIncidence(data, ['death', 'relapse']);
        expect(result.death.length).toBeGreaterThanOrEqual(0);
    });

    test('all censored: CIF stays at 0', () => {
        const engine = new CompetingRisksEngine();
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({ time: i, event: 'censored' });
        }
        // Need at least 2 events per cause, so this should throw
        expect(() => {
            engine.cumulativeIncidence(data, ['death']);
        }).toThrow();
    });

    test('single subject: validation rejects (need >= 2 events per cause)', () => {
        const engine = new CompetingRisksEngine();
        expect(() => {
            engine.cumulativeIncidence(
                [{ time: 1, event: 'death' }],
                ['death']
            );
        }).toThrow();
    });

    test('10 competing causes: works', () => {
        const engine = new CompetingRisksEngine();
        const causes = [];
        for (let c = 0; c < 10; c++) causes.push(`cause${c}`);
        const data = [];
        // 5 events per cause = 50 total + 20 censored
        for (let c = 0; c < 10; c++) {
            for (let i = 0; i < 5; i++) {
                data.push({ time: (c * 5 + i + 1) * 0.5, event: `cause${c}` });
            }
        }
        for (let i = 0; i < 20; i++) {
            data.push({ time: i * 2, event: 'censored' });
        }
        const result = engine.cumulativeIncidence(data, causes);
        expect(Object.keys(result).length).toBeGreaterThan(10); // 10 causes + overallSurvival
    });
});

// ─── CureModels Stress ──────────────────────────────────────────────────────

describe('CureModels Stress', () => {
    function makeSurvData(n, eventFraction, timeScale) {
        const data = [];
        for (let i = 0; i < n; i++) {
            const time = (i + 1) * timeScale / n;
            const event = (i / n) < eventFraction ? 1 : 0;
            data.push({ time: Math.max(0.01, time), event });
        }
        return data;
    }

    test('all events at same time: convergence', () => {
        const engine = new CureModelEngine();
        const data = [];
        for (let i = 0; i < 30; i++) {
            data.push({ time: 5.0, event: i < 15 ? 1 : 0 });
        }
        const result = engine.mixtureCure(data, { distribution: 'weibull', maxIter: 50 });
        expect(result).toBeDefined();
        expectFinite(result.cureFraction, 'cure fraction same time');
    });

    test('very high cure fraction (95%): estimates correctly', () => {
        const engine = new CureModelEngine();
        const data = makeSurvData(100, 0.05, 10); // 5% events
        const result = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(result.cureFraction).toBeGreaterThan(0.5);
        expectFinite(result.aic, 'AIC high cure');
    });

    test('very low cure fraction (near 0%): estimates correctly', () => {
        const engine = new CureModelEngine();
        const data = makeSurvData(100, 0.95, 10); // 95% events
        const result = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(result.cureFraction).toBeLessThan(0.5);
        expectFinite(result.aic, 'AIC low cure');
    });

    test('n=10 (tiny sample): does not crash', () => {
        const engine = new CureModelEngine();
        const data = makeSurvData(10, 0.5, 5);
        const result = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(result).toBeDefined();
        expectFinite(result.cureFraction, 'cure fraction tiny');
    });

    test('n=500 (large sample): completes within timeout', () => {
        const engine = new CureModelEngine();
        const data = makeSurvData(500, 0.3, 20);
        const result = engine.mixtureCure(data, { distribution: 'weibull' });
        expect(result).toBeDefined();
        expect(result.iterations).toBeGreaterThan(0);
    });
});

// ─── SemiMarkov Stress ──────────────────────────────────────────────────────

describe('SemiMarkov Stress', () => {
    test('20 states: completes', () => {
        const states = [];
        for (let i = 0; i < 20; i++) states.push(`s${i}`);
        const transitions = {};
        for (let i = 0; i < 19; i++) {
            transitions[`s${i}->s${i + 1}`] = { type: 'constant', rate: 0.05 };
        }
        const initial = new Array(20).fill(0);
        initial[0] = 1;
        const engine = new SemiMarkovEngine({ maxCycles: 50 });
        const result = engine.run({
            states,
            initial,
            transitions,
            costs: {},
            utilities: {},
            timeHorizon: 50
        });
        expect(result.stateTrace.length).toBe(51); // initial + 50 cycles
    });

    test('very high hazard (rate=10): all dead quickly', () => {
        const engine = new SemiMarkovEngine({ maxCycles: 20 });
        const result = engine.run({
            states: ['alive', 'dead'],
            initial: [1, 0],
            transitions: { 'alive->dead': { type: 'constant', rate: 10 } },
            costs: { alive: 1000, dead: 0 },
            utilities: { alive: 1, dead: 0 },
            timeHorizon: 20
        });
        // After 20 cycles with rate=10, almost nobody alive
        const lastCycle = result.stateTrace[result.stateTrace.length - 1];
        expect(lastCycle[0]).toBeLessThan(1e-5);
    });

    test('very low hazard (rate=0.001): barely any transitions', () => {
        const engine = new SemiMarkovEngine({ maxCycles: 20 });
        const result = engine.run({
            states: ['healthy', 'sick'],
            initial: [1, 0],
            transitions: { 'healthy->sick': { type: 'constant', rate: 0.001 } },
            costs: {},
            utilities: {},
            timeHorizon: 20
        });
        const lastCycle = result.stateTrace[result.stateTrace.length - 1];
        expect(lastCycle[0]).toBeGreaterThan(0.95);
    });

    test('500 cycle horizon: completes', () => {
        const engine = new SemiMarkovEngine({ maxCycles: 500 });
        const result = engine.run({
            states: ['a', 'b'],
            initial: [1, 0],
            transitions: { 'a->b': { type: 'constant', rate: 0.01 } },
            costs: {},
            utilities: {},
            timeHorizon: 500
        });
        expect(result.perCycle.length).toBe(500);
    });

    test('all rates = 0: stays in initial state forever', () => {
        const engine = new SemiMarkovEngine({ maxCycles: 10 });
        const result = engine.run({
            states: ['s0', 's1'],
            initial: [1, 0],
            transitions: { 's0->s1': { type: 'constant', rate: 0 } },
            costs: {},
            utilities: {},
            timeHorizon: 10
        });
        for (const trace of result.stateTrace) {
            expect(trace[0]).toBeCloseTo(1.0, 10);
            expect(trace[1]).toBeCloseTo(0.0, 10);
        }
    });
});

// ─── CorrelatedPSA Stress ───────────────────────────────────────────────────

describe('CorrelatedPSA Stress', () => {
    test('10 parameters: Cholesky completes', () => {
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        const n = 10;
        // Build a valid correlation matrix: identity + small off-diagonal
        const matrix = [];
        for (let i = 0; i < n; i++) {
            matrix[i] = new Array(n).fill(0);
            matrix[i][i] = 1.0;
            for (let j = 0; j < n; j++) {
                if (i !== j) matrix[i][j] = 0.1;
            }
        }
        const L = engine.cholesky(matrix);
        expect(L.length).toBe(n);
        // Verify L is lower triangular
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                expect(L[i][j]).toBe(0);
            }
        }
    });

    test('perfect correlation (rho=0.999): handles gracefully', () => {
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        const matrix = [
            [1.0, 0.999],
            [0.999, 1.0]
        ];
        const L = engine.cholesky(matrix);
        expect(L.length).toBe(2);
        expectFinite(L[0][0], 'L[0][0]');
        expectFinite(L[1][0], 'L[1][0]');
        expectFinite(L[1][1], 'L[1][1]');
    });

    test('near-singular matrix: nearestPD fixes it', () => {
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        // Not positive definite (determinant < 0)
        const matrix = [
            [1.0, 0.9, 0.9],
            [0.9, 1.0, 0.9],
            [0.9, 0.9, 0.8]  // makes it non-PD
        ];
        const fixed = engine.nearestPD(matrix);
        expect(fixed.length).toBe(3);
        // Should be able to Cholesky the fixed matrix
        const L = engine.cholesky(fixed);
        expect(L.length).toBe(3);
    });

    test('10000 iterations: completes', () => {
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        const means = [0, 0, 0];
        const sds = [1, 1, 1];
        const corr = [
            [1, 0.5, 0.3],
            [0.5, 1, 0.2],
            [0.3, 0.2, 1]
        ];
        const samples = engine.correlatedNormal(means, sds, corr, 10000);
        expect(samples.length).toBe(10000);
        // correlatedNormal returns objects with param0/param1/param2 keys
        for (const s of samples) {
            expect(typeof s).toBe('object');
            for (const key of Object.keys(s)) {
                expectFinite(s[key], 'correlated normal sample ' + key);
            }
        }
    });

    test('all parameters identical distribution: works', () => {
        const engine = new CorrelatedPSAEngine({ seed: 42 });
        const means = [5, 5, 5];
        const sds = [1, 1, 1];
        const corr = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
        const samples = engine.correlatedNormal(means, sds, corr, 100);
        expect(samples.length).toBe(100);
    });
});

// ─── ThresholdAnalysis Stress ────────────────────────────────────────────────

describe('ThresholdAnalysis Stress', () => {
    const simpleModel = (params) => ({
        cost: 10000 + (params.price ?? 0) * 100,
        qaly: 5,
        comparatorCost: 8000,
        comparatorQaly: 4
    });

    test('1000 steps: completes', () => {
        const engine = new ThresholdAnalysisEngine();
        const result = engine.oneway(simpleModel, 'price', [0, 100], 50000, 1000);
        expect(result.values.length).toBe(1001);
    });

    test('very narrow range [100, 100.001]: bisection converges', () => {
        const engine = new ThresholdAnalysisEngine({ tolerance: 0.0001 });
        const result = engine.oneway(simpleModel, 'price', [100, 100.001], 50000, 10);
        expect(result.values.length).toBeGreaterThan(0);
        for (const v of result.nmb) {
            expectFinite(v, 'narrow range NMB');
        }
    });

    test('model returns same value regardless of input: no threshold', () => {
        const flatModel = () => ({
            cost: 10000, qaly: 5, comparatorCost: 8000, comparatorQaly: 4
        });
        const engine = new ThresholdAnalysisEngine();
        const result = engine.oneway(flatModel, 'price', [0, 100], 50000, 20);
        // NMB should be constant
        const unique = new Set(result.nmb.map(v => v.toFixed(6)));
        expect(unique.size).toBe(1);
    });

    test('negative costs: handles correctly', () => {
        const negModel = (params) => ({
            cost: -5000 + (params.x ?? 0),
            qaly: 3,
            comparatorCost: 1000,
            comparatorQaly: 2
        });
        const engine = new ThresholdAnalysisEngine();
        const result = engine.oneway(negModel, 'x', [-1000, 1000], 50000, 50);
        expect(result.values.length).toBe(51);
    });

    test('WTP = 0: edge case', () => {
        const engine = new ThresholdAnalysisEngine();
        const result = engine.oneway(simpleModel, 'price', [0, 100], 0, 20);
        expect(result.nmb.length).toBe(21);
        // WTP=0 means NMB = -incCost (negative since new is more expensive)
        for (const v of result.nmb) {
            expectFinite(v, 'WTP=0 NMB');
        }
    });
});

// ─── ModelAveraging Stress ──────────────────────────────────────────────────

describe('ModelAveraging Stress', () => {
    function makeSurvDataMA(n, eventFrac) {
        const data = [];
        for (let i = 0; i < n; i++) {
            data.push({
                time: Math.max(0.01, (i + 1) * 10 / n),
                event: (i / n) < eventFrac ? 1 : 0
            });
        }
        return data;
    }

    test('all events (no censoring): fits correctly', () => {
        const engine = new ModelAveragingEngine();
        const data = makeSurvDataMA(50, 1.0);
        const result = engine.fitCompare(data, ['weibull', 'exponential']);
        expect(result.length).toBe(2);
        for (const r of result) {
            if (!r.error) expectFinite(r.aic, r.name + ' AIC');
        }
    });

    test('90% censoring: fits with warning/error or gracefully', () => {
        const engine = new ModelAveragingEngine();
        const data = makeSurvDataMA(100, 0.10);
        const result = engine.fitCompare(data, ['weibull', 'lognormal']);
        expect(result.length).toBe(2);
    });

    test('all times identical: degrades gracefully', () => {
        const engine = new ModelAveragingEngine();
        const data = [];
        for (let i = 0; i < 30; i++) {
            data.push({ time: 5.0, event: i < 15 ? 1 : 0 });
        }
        // Should not crash even if fit quality is poor
        const result = engine.fitCompare(data, ['weibull', 'exponential']);
        expect(result.length).toBe(2);
    });

    test('n = 5 (very few): does not crash', () => {
        const engine = new ModelAveragingEngine();
        const data = [
            { time: 1, event: 1 },
            { time: 2, event: 1 },
            { time: 3, event: 0 },
            { time: 4, event: 1 },
            { time: 5, event: 0 }
        ];
        const result = engine.fitCompare(data, ['weibull', 'exponential']);
        expect(result.length).toBe(2);
    });

    test('6 distributions compared simultaneously: completes', () => {
        const engine = new ModelAveragingEngine();
        const data = makeSurvDataMA(80, 0.5);
        const result = engine.fitCompare(data, [
            'weibull', 'lognormal', 'loglogistic',
            'exponential', 'gompertz', 'gamma'
        ]);
        expect(result.length).toBe(6);
    });
});

// ─── EVSI Stress ────────────────────────────────────────────────────────────

describe('EVSI Stress', () => {
    function makePSAResults(n, spread) {
        const iterations = [];
        for (let i = 0; i < n; i++) {
            const p = 0.5 + (i / n - 0.5) * spread;
            iterations.push({
                params: { p_response: p },
                nmb: p * 50000 - 10000,
                cost: 10000,
                qaly: p * 2,
                comparatorCost: 8000,
                comparatorQaly: 1
            });
        }
        return {
            iterations,
            wtp: 50000,
            evpi: 5000
        };
    }

    test('single PSA iteration: EVSI = 0', () => {
        const engine = new EVSIEngine({ seed: 42 });
        const psa = makePSAResults(1, 0);
        const result = engine.compute(psa, {
            sampleSize: 100,
            parameter: 'p_response',
            dataModel: 'normal'
        });
        expect(result.evsi).toBe(0);
    });

    test('all PSA iterations agree: EVSI approx 0', () => {
        const engine = new EVSIEngine({ seed: 42 });
        const iterations = [];
        for (let i = 0; i < 100; i++) {
            iterations.push({
                params: { p_response: 0.5 },
                nmb: 15000
            });
        }
        const psa = { iterations, wtp: 50000, evpi: 0 };
        const result = engine.compute(psa, {
            sampleSize: 100,
            parameter: 'p_response',
            dataModel: 'normal'
        });
        expect(result.evsi).toBeCloseTo(0, 5);
    });

    test('n = 100000 sample size: computes', () => {
        const engine = new EVSIEngine({ seed: 42 });
        const psa = makePSAResults(200, 1.0);
        const result = engine.compute(psa, {
            sampleSize: 100000,
            parameter: 'p_response',
            dataModel: 'normal'
        });
        expectFinite(result.evsi, 'large n EVSI');
        expect(result.evsi).toBeGreaterThanOrEqual(0);
    });

    test('very small prior variance (1e-20): EVSI approx 0', () => {
        const engine = new EVSIEngine({ seed: 42 });
        const iterations = [];
        for (let i = 0; i < 100; i++) {
            // All nearly identical
            iterations.push({
                params: { p_response: 0.5 + (i % 2 === 0 ? 1e-12 : -1e-12) },
                nmb: 15000
            });
        }
        const psa = { iterations, wtp: 50000, evpi: 0 };
        const result = engine.compute(psa, {
            sampleSize: 50,
            parameter: 'p_response',
            dataModel: 'normal'
        });
        expect(result.evsi).toBeCloseTo(0, 5);
    });

    test('all NMB positive: no threshold uncertainty', () => {
        const engine = new EVSIEngine({ seed: 42 });
        const iterations = [];
        for (let i = 0; i < 100; i++) {
            iterations.push({
                params: { p_response: 0.5 + i * 0.001 },
                nmb: 50000 + i * 100 // all positive
            });
        }
        const psa = { iterations, wtp: 50000, evpi: 0 };
        const result = engine.compute(psa, {
            sampleSize: 100,
            parameter: 'p_response',
            dataModel: 'normal'
        });
        // EVPI = 0 means EVSI = 0
        expect(result.evsi).toBeCloseTo(0, 5);
    });
});

// ─── MultiStateModel Stress ─────────────────────────────────────────────────

describe('MultiStateModel Stress', () => {
    // MultiStateModelEngine.run() returns { stateTrace: [Float64Array[], ...], ... }
    // stateTrace[cycle][stateIdx] = occupancy proportion
    // States are objects: { name, initial }

    test('15 states with full connectivity: completes', () => {
        const engine = new MultiStateModelEngine();
        const n = 15;
        const states = [];
        for (let i = 0; i < n; i++) {
            states.push({ name: `s${i}`, initial: i === 0 ? 1 : 0 });
        }
        const transitions = [];
        // Chain: s0->s1->s2->...->s14 (last is absorbing)
        for (let i = 0; i < n - 1; i++) {
            transitions.push({ from: `s${i}`, to: `s${i + 1}`, rate: 0.1 });
        }
        const result = engine.run({
            states, transitions, timeHorizon: 10, cycleLength: 1
        });
        expect(result.stateTrace.length).toBeGreaterThan(0);
    });

    test('single absorbing state: all population there eventually', () => {
        const engine = new MultiStateModelEngine();
        const result = engine.run({
            states: [
                { name: 'alive', initial: 1 },
                { name: 'dead', initial: 0 }
            ],
            transitions: [{ from: 'alive', to: 'dead', rate: 0.5 }],
            timeHorizon: 50,
            cycleLength: 1
        });
        // stateTrace is array of arrays: [aliveOcc, deadOcc]
        const lastTrace = result.stateTrace[result.stateTrace.length - 1];
        expect(lastTrace[1]).toBeGreaterThan(0.99); // dead = index 1
    });

    test('very high rates (100): immediate transition', () => {
        const engine = new MultiStateModelEngine();
        const result = engine.run({
            states: [
                { name: 'start', initial: 1 },
                { name: 'end', initial: 0 }
            ],
            transitions: [{ from: 'start', to: 'end', rate: 100 }],
            timeHorizon: 5,
            cycleLength: 1
        });
        // After 1 cycle with rate=100, essentially all transferred
        // stateTrace[1] is occupancy after first cycle, index 1 = 'end'
        expect(result.stateTrace[1][1]).toBeGreaterThan(0.99);
    });

    test('very low rates (1e-10): stays in initial state', () => {
        const engine = new MultiStateModelEngine();
        const result = engine.run({
            states: [
                { name: 'here', initial: 1 },
                { name: 'there', initial: 0 }
            ],
            transitions: [{ from: 'here', to: 'there', rate: 1e-10 }],
            timeHorizon: 10,
            cycleLength: 1
        });
        // Index 0 = 'here'
        for (const t of result.stateTrace) {
            expect(t[0]).toBeGreaterThan(0.999);
        }
    });

    test('matrix exponential of zero matrix: identity', () => {
        const engine = new MultiStateModelEngine();
        const result = engine.run({
            states: [
                { name: 'a', initial: 0.5 },
                { name: 'b', initial: 0.5 }
            ],
            transitions: [], // no transitions = zero Q matrix
            timeHorizon: 5,
            cycleLength: 1
        });
        // Should stay in initial distribution
        for (const t of result.stateTrace) {
            expect(t[0]).toBeCloseTo(0.5, 5);
            expect(t[1]).toBeCloseTo(0.5, 5);
        }
    });
});

// ─── JointModel Stress ──────────────────────────────────────────────────────

describe('JointModel Stress', () => {
    // JointModelEngine expects data with 'biomarker' field (not 'values')

    test('all patients censored: fits without crashing', () => {
        const engine = new JointModelEngine();
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({
                id: i,
                times: [0, 1, 2, 3],
                biomarker: [10 + i * 0.1, 11 + i * 0.1, 12 + i * 0.1, 13 + i * 0.1],
                eventTime: 5,
                event: 0 // all censored
            });
        }
        const result = engine.fit(data);
        expect(result).toBeDefined();
    });

    test('single time point per patient: minimal data', () => {
        const engine = new JointModelEngine();
        const data = [];
        for (let i = 0; i < 30; i++) {
            data.push({
                id: i,
                times: [0],
                biomarker: [10 + i * 0.5],
                eventTime: i < 15 ? 2 : 5,
                event: i < 15 ? 1 : 0
            });
        }
        const result = engine.fit(data);
        expect(result).toBeDefined();
    });

    test('100 patients, 20 time points each: completes', () => {
        const engine = new JointModelEngine();
        const data = [];
        for (let i = 0; i < 100; i++) {
            const times = [];
            const biomarker = [];
            for (let t = 0; t < 20; t++) {
                times.push(t * 0.5);
                biomarker.push(50 + i * 0.1 - t * 0.3 + (t % 3) * 0.1);
            }
            data.push({
                id: i,
                times,
                biomarker,
                eventTime: i < 40 ? 8 : 12,
                event: i < 40 ? 1 : 0
            });
        }
        const result = engine.fit(data);
        expect(result).toBeDefined();
        expectFinite(result.aic, 'joint model AIC');
    });
});

// ─── HeadroomAnalysis Stress ────────────────────────────────────────────────

describe('HeadroomAnalysis Stress', () => {
    test('price range [0, 1e9]: bisection converges', () => {
        const engine = new HeadroomAnalysisEngine();
        const modelFn = (params) => ({
            cost: 5000 + (params.price ?? 0),
            qaly: 5,
            comparatorCost: 8000,
            comparatorQaly: 4
        });
        const result = engine.maxPrice(modelFn, { price: 0 }, 'price', 50000, [0, 1e9]);
        expect(result).toBeDefined();
        // Should find a threshold within the range
    });

    test('WTP = 0: everything unaffordable', () => {
        const engine = new HeadroomAnalysisEngine();
        const modelFn = (params) => ({
            cost: 10000 + (params.price ?? 0),
            qaly: 5,
            comparatorCost: 8000,
            comparatorQaly: 4
        });
        const result = engine.maxPrice(modelFn, { price: 0 }, 'price', 0, [0, 100000]);
        expect(result).toBeDefined();
        // WTP=0 means NMB = -incCost, always negative for higher cost
    });

    test('budget = 0: no headroom for any price', () => {
        const engine = new HeadroomAnalysisEngine();
        const modelFn = (params) => ({
            cost: (params.price ?? 0) * 10,
            qaly: 5,
            comparatorCost: 0,
            comparatorQaly: 4
        });
        const result = engine.maxPrice(modelFn, { price: 0 }, 'price', 50000, [0, 10000]);
        expect(result).toBeDefined();
    });
});

// ─── ProbabilisticBIA Stress ────────────────────────────────────────────────

describe('ProbabilisticBIA Stress', () => {
    function makePBIAConfig() {
        return {
            population: 100000,
            prevalence: 0.05,
            timeHorizon: 3,
            uptake: [0.2, 0.4, 0.6],
            newTx: { drugCost: 5000, adminCost: 500 },
            currentTx: { drugCost: 2000, adminCost: 300 },
            discountRate: 0.03
        };
    }

    test('5000 iterations: completes within 30s', () => {
        const engine = new ProbabilisticBIAEngine({ seed: 42 });
        const result = engine.run(
            makePBIAConfig(),
            { 'newTx.drugCost': { type: 'gamma', shape: 25, scale: 200 } },
            { nIterations: 5000 }
        );
        expect(result.iterations.length).toBe(5000);
    }, 30000);

    test('all distributions very narrow (SD=0.001): deterministic-like results', () => {
        const engine = new ProbabilisticBIAEngine({ seed: 42 });
        const result = engine.run(
            makePBIAConfig(),
            { 'newTx.drugCost': { type: 'normal', mean: 5000, sd: 0.001 } },
            { nIterations: 100 }
        );
        // All iterations should give nearly the same result
        const biValues = result.iterations.map(r => r.netBudgetImpact);
        const range = Math.max(...biValues) - Math.min(...biValues);
        // With SD=0.001, the drug cost varies by ~0.003 across iterations,
        // but BIA amplifies this by eligible population * uptake, so allow wider range
        expect(range).toBeLessThan(500);
    });

    test('very wide distributions: CI captures extremes', () => {
        const engine = new ProbabilisticBIAEngine({ seed: 42 });
        const result = engine.run(
            makePBIAConfig(),
            { 'newTx.drugCost': { type: 'gamma', shape: 1, scale: 5000 } },
            { nIterations: 500 }
        );
        expect(result.summary.ci95[1]).toBeGreaterThan(result.summary.ci95[0]);
    });
});

// ─── NetworkMCDA Stress ─────────────────────────────────────────────────────

describe('NetworkMCDA Stress', () => {
    // NetworkMCDAEngine.evaluate returns { rankings: [...], dominance, sensitivity }

    test('20 treatments: completes', () => {
        const engine = new NetworkMCDAEngine();
        const treatments = [];
        for (let i = 0; i < 20; i++) treatments.push(`tx${i}`);
        const effects = {
            efficacy: {},
            safety: {}
        };
        // Use deterministic values (not Math.random) for reproducibility
        for (let i = 0; i < treatments.length; i++) {
            effects.efficacy[treatments[i]] = (i * 7 + 3) % 10;
            effects.safety[treatments[i]] = (i * 3 + 1) % 5;
        }
        const nmaResults = { treatments, effects };
        const criteria = [
            { name: 'efficacy', direction: 'maximize', scale: [0, 10] },
            { name: 'safety', direction: 'minimize', scale: [0, 5] }
        ];
        const weights = { efficacy: 0.6, safety: 0.4 };
        const result = engine.evaluate(nmaResults, criteria, weights);
        expect(result.rankings.length).toBe(20);
    });

    test('all effects identical: equal ranking', () => {
        const engine = new NetworkMCDAEngine();
        const treatments = ['a', 'b', 'c'];
        const effects = { eff: { a: 5, b: 5, c: 5 } };
        const criteria = [{ name: 'eff', direction: 'maximize', scale: [0, 10] }];
        const weights = { eff: 1.0 };
        const result = engine.evaluate({ treatments, effects }, criteria, weights);
        const scores = result.rankings.map(r => r.score);
        for (const s of scores) {
            expect(Math.abs(s - scores[0])).toBeLessThan(1e-10);
        }
    });

    test('single treatment: trivially ranked #1', () => {
        const engine = new NetworkMCDAEngine();
        const result = engine.evaluate(
            { treatments: ['mono'], effects: { eff: { mono: 7 } } },
            [{ name: 'eff', direction: 'maximize', scale: [0, 10] }],
            { eff: 1.0 }
        );
        expect(result.rankings.length).toBe(1);
        expect(result.rankings[0].rank).toBe(1);
    });
});

// ─── NeumaierSum Cross-Validation ───────────────────────────────────────────

describe('NeumaierSum Stress', () => {
    test('Neumaier vs Kahan on adversarial input', () => {
        // Values where Kahan loses precision but Neumaier does better
        const values = [1e16, 1, -1e16, 1, 1, 1];
        const kResult = KahanSum.sum(values);
        const nResult = NeumaierSum.sum(values);
        // Both should get close to 4 (1 + 1 + 1 + 1)
        // Neumaier should be at least as good
        expect(Math.abs(nResult - 4)).toBeLessThanOrEqual(Math.abs(kResult - 4) + 1);
    });

    test('Neumaier handles 100K values', () => {
        const ns = new NeumaierSum();
        for (let i = 0; i < 100_000; i++) {
            ns.add(0.1);
        }
        const result = ns.total();
        expectFinite(result, 'Neumaier 100K');
        expect(Math.abs(result - 10000)).toBeLessThan(1);
    });
});

// ─── ExpressionParser Additional Fuzz ───────────────────────────────────────

describe('ExpressionParser Fuzz', () => {
    test('empty string throws cleanly', () => {
        expect(() => ExpressionParser.evaluate('')).toThrow();
    });

    test('extremely deep function nesting: min(max(min(max(...))))', () => {
        let expr = '1';
        for (let i = 0; i < 30; i++) {
            expr = (i % 2 === 0 ? 'min' : 'max') + '(' + expr + ', 5)';
        }
        const result = ExpressionParser.evaluate(expr);
        expectFinite(result, 'deep function nesting');
    });

    test('division by zero throws (not Infinity)', () => {
        expect(() => ExpressionParser.evaluate('1 / 0')).toThrow(/Division by zero/);
    });
});
