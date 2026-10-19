/**
 * HTA BIA numeric-domain integrity: finite inputs, exact patient count range,
 * aggregate overflow and scenario delta overflow.
 * Synthetic boundary cases; they are NOT real health-economic model inputs.
 */
'use strict';

const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');
const group = (population, drugCost = 1) => ({
    population, prevalence: 1, timeHorizon: 1, uptake: [1],
    newTx: { drugCost }, currentTx: { drugCost: 0 }, discountRate: 0
});

describe('BudgetImpactEngine fail-closed finite arithmetic', () => {
    let engine;
    beforeEach(() => { engine = new BudgetImpactEngine(); });

    test('rejects missing finite inputs, invalid signed offsets and overflow', () => {
        expect(() => engine.run({ ...group(100), prevalence: NaN })).toThrow(/prevalence/);
        expect(() => engine.run({ ...group(100), uptake: [Infinity] })).toThrow(/uptake/);
        expect(() => engine.run({ ...group(100), newTx: { drugCost: Infinity } })).toThrow(/drugCost/);
        expect(() => engine.run({ ...group(100), offsets: { savings: '-3' } })).toThrow(/offsets/);
        expect(() => engine.run({ ...group(100), population: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/population/);
        expect(() => engine.run(group(1000000000, Number.MAX_VALUE))).toThrow(/overflow/);
    });

    test('refuses unsafe sum of otherwise representable subgroup patient counts', () => {
        const M = Number.MAX_SAFE_INTEGER;
        expect((BigInt(M) * 2n + 1n).toString()).toBe('18014398509481983');
        expect(() => engine.subpopulationAnalysis({
            subpopulations: [group(M), group(M), group(1)]
        })).toThrow(/safe integer|precision|overflow/);
    });

    test('refuses nonfinite sum of individually finite subgroup budgets', () => {
        const single = engine.run(group(1, 1e308));
        expect(single.netBudgetImpact).toBe(1e308);
        expect(() => engine.subpopulationAnalysis({
            subpopulations: [group(1, 1e308), group(1, 1e308)]
        })).toThrow(/numerical overflow/);
    });

    test('refuses infinite scenario delta even if both scenario totals are finite', () => {
        const base = { ...group(1, 0), offsets: { savings: -1e308 } };
        const change = { newTx: { drugCost: 1e308 }, offsets: { savings: 0 } };
        expect(engine.run(base).netBudgetImpact).toBe(-1e308);
        expect(engine.run({ ...base, ...change }).netBudgetImpact).toBe(1e308);
        expect(() => engine.scenarioAnalysis(base, { reversal: change }))
            .toThrow(/scenario.*overflow|overflow.*scenario/);
    });

    test('valid subpopulation totals and scenario differences remain reproducible', () => {
        const result = engine.subpopulationAnalysis({
            subpopulations: [group(100, 2), group(100, 2)]
        });
        expect(result.total.cumulativePatients).toBe(200);
        expect(result.total.netBudgetImpact).toBe(400);
        const comparison = engine.scenarioAnalysis(group(100, 2), {
            reduced: { newTx: { drugCost: 1 } },
            increased: { newTx: { drugCost: 3 } }
        });
        expect(comparison.base.netBudgetImpact).toBe(200);
        expect(comparison.scenarios.reduced.delta).toBe(-100);
        expect(comparison.scenarios.increased.delta).toBe(100);
    });

    test('existing valid three-year reference remains unchanged after refusal', () => {
        expect(() => engine.run({ ...group(1), prevalence: NaN })).toThrow();
        const out = engine.run({
            population: 100000, prevalence: 0.05,
            timeHorizon: 3, uptake: [0.1, 0.3, 0.5],
            newTx: { drugCost: 5000 }, currentTx: { drugCost: 2000 },
            offsets: { hospitalization: -500 }, discountRate: 0.03
        });
        expect(out.yearlyBudget.map(y => y.patients)).toEqual([500, 1500, 2500]);
        expect(out.netBudgetImpact).toBe(11250000);
        expect(out.totalDiscounted).toBeCloseTo(10782001.13112, 4);
    });
});
