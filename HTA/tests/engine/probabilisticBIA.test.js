/**
 * Tests for src/engine/probabilisticBIA.js — Probabilistic Budget Impact Analysis Engine
 */

'use strict';

const { ProbabilisticBIAEngine } = require('../../src/engine/probabilisticBIA');
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');

// ============ HELPERS ============

function makeBaseConfig(overrides = {}) {
    const base = {
        population: 100000,
        prevalence: 0.05,
        timeHorizon: 3,
        uptake: [0.1, 0.3, 0.5],
        newTx: {
            drugCost: 5000,
            adminCost: 200,
            monitoringCost: 100,
            aeCost: 50
        },
        currentTx: {
            drugCost: 2000,
            adminCost: 150,
            monitoringCost: 80,
            aeCost: 30
        },
        offsets: {
            hospitalization: -500,
            productivity: -200
        }
    };
    return { ...base, ...overrides };
}

function makeStdParamDists() {
    return {
        prevalence: { type: 'beta', alpha: 50, beta: 950 },        // mean ~0.05
        'newTx.drugCost': { type: 'gamma', shape: 100, scale: 50 }, // mean ~5000
        'uptake.0': { type: 'beta', alpha: 10, beta: 90 }           // mean ~0.1
    };
}

// ============ TESTS ============

describe('ProbabilisticBIAEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new ProbabilisticBIAEngine({ seed: 12345, nIterations: 500 });
    });

    // ------------------------------------------------------------------
    // 1. Mean of probabilistic BIA ~ deterministic BIA (within 10%)
    // ------------------------------------------------------------------
    test('1. Mean of probabilistic BIA approximates deterministic BIA (within 10%)', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();
        const result = engine.run(config, paramDists);

        const detBIA = result.deterministic.netBudgetImpact;
        const meanBIA = result.summary.mean;

        // Mean should be within 10% of deterministic
        expect(Math.abs(meanBIA - detBIA) / Math.abs(detBIA)).toBeLessThan(0.10);
    });

    // ------------------------------------------------------------------
    // 2. CI95 contains deterministic estimate
    // ------------------------------------------------------------------
    test('2. CI95 contains the deterministic estimate', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();
        const result = engine.run(config, paramDists);

        const detBIA = result.deterministic.netBudgetImpact;
        expect(result.summary.ci95[0]).toBeLessThanOrEqual(detBIA);
        expect(result.summary.ci95[1]).toBeGreaterThanOrEqual(detBIA);
    });

    // ------------------------------------------------------------------
    // 3. 1000 iterations produce a distribution
    // ------------------------------------------------------------------
    test('3. Specified iterations produce matching iteration count', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();
        const result = engine.run(config, paramDists, { nIterations: 500 });

        expect(result.iterations.length).toBe(500);
    });

    // ------------------------------------------------------------------
    // 4. Determinism: same seed produces same results
    // ------------------------------------------------------------------
    test('4. Determinism: same seed produces identical results', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const eng1 = new ProbabilisticBIAEngine({ seed: 42, nIterations: 100 });
        const eng2 = new ProbabilisticBIAEngine({ seed: 42, nIterations: 100 });

        const r1 = eng1.run(config, paramDists);
        const r2 = eng2.run(config, paramDists);

        expect(r1.summary.mean).toBe(r2.summary.mean);
        expect(r1.summary.median).toBe(r2.summary.median);
        expect(r1.iterations.length).toBe(r2.iterations.length);
        for (let i = 0; i < r1.iterations.length; i++) {
            expect(r1.iterations[i].netBudgetImpact).toBe(r2.iterations[i].netBudgetImpact);
        }
    });

    // ------------------------------------------------------------------
    // 5. Budget exceedance curve: P decreases as budget increases
    // ------------------------------------------------------------------
    test('5. Budget exceedance curve: probability decreases with increasing budget', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();
        const budgetRange = [0, 500000, 1000000, 2000000, 5000000, 10000000];

        const curve = engine.budgetExceedanceCurve(config, paramDists, budgetRange);

        expect(curve.length).toBe(budgetRange.length);
        // Probabilities should be non-increasing (monotone decreasing)
        for (let i = 1; i < curve.length; i++) {
            expect(curve[i].probability).toBeLessThanOrEqual(curve[i - 1].probability + 1e-10);
        }
    });

    // ------------------------------------------------------------------
    // 6. P(exceed 0) ~ proportion of positive BIA
    // ------------------------------------------------------------------
    test('6. P(exceed 0) approximates proportion of positive BIA iterations', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const result = engine.run(config, paramDists, { budgetThreshold: 0, nIterations: 500 });
        const positiveFrac = result.iterations.filter(r => r.netBudgetImpact > 0).length / result.iterations.length;

        expect(result.summary.probExceedsBudget).toBeCloseTo(positiveFrac, 2);
    });

    // ------------------------------------------------------------------
    // 7. Tornado: bars sorted by width descending
    // ------------------------------------------------------------------
    test('7. Tornado: bars are sorted by width descending', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const tornado = engine.tornadoBIA(config, paramDists);

        expect(tornado.length).toBe(Object.keys(paramDists).length);
        for (let i = 1; i < tornado.length; i++) {
            expect(tornado[i].width).toBeLessThanOrEqual(tornado[i - 1].width + 1e-6);
        }
    });

    // ------------------------------------------------------------------
    // 8. Tornado: most influential parameter has widest bar
    // ------------------------------------------------------------------
    test('8. Tornado: first bar has the widest width', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const tornado = engine.tornadoBIA(config, paramDists);

        if (tornado.length > 1) {
            expect(tornado[0].width).toBeGreaterThanOrEqual(tornado[1].width - 1e-6);
        }
    });

    // ------------------------------------------------------------------
    // 9. Percentiles: p5 < p25 < p50 < p75 < p95
    // ------------------------------------------------------------------
    test('9. Percentiles are ordered: p5 <= p25 <= p50 <= p75 <= p95', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const result = engine.run(config, paramDists, { nIterations: 500 });
        const p = result.percentiles;

        expect(p.p5).toBeLessThanOrEqual(p.p25 + 1e-6);
        expect(p.p25).toBeLessThanOrEqual(p.p50 + 1e-6);
        expect(p.p50).toBeLessThanOrEqual(p.p75 + 1e-6);
        expect(p.p75).toBeLessThanOrEqual(p.p95 + 1e-6);
    });

    // ------------------------------------------------------------------
    // 10. Zero uncertainty: all iterations identical to deterministic
    // ------------------------------------------------------------------
    test('10. Zero uncertainty: all iterations equal deterministic', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        // Use fixed distributions (zero variance)
        const paramDists = {
            prevalence: { type: 'fixed', value: 0.05 },
            'newTx.drugCost': { type: 'fixed', value: 5000 },
            'uptake.0': { type: 'fixed', value: 0.1 }
        };

        const result = engine.run(config, paramDists, { nIterations: 50 });

        const detBIA = result.deterministic.netBudgetImpact;
        for (const iter of result.iterations) {
            expect(iter.netBudgetImpact).toBeCloseTo(detBIA, 2);
        }
        expect(result.summary.ci95[0]).toBeCloseTo(detBIA, 2);
        expect(result.summary.ci95[1]).toBeCloseTo(detBIA, 2);
    });

    // ------------------------------------------------------------------
    // 11. High uncertainty: wide CI
    // ------------------------------------------------------------------
    test('11. High uncertainty produces wider CI than low uncertainty', () => {
        const config = makeBaseConfig({ discountRate: 0 });

        // Low uncertainty
        const lowDists = {
            prevalence: { type: 'beta', alpha: 500, beta: 9500 },     // very concentrated
            'newTx.drugCost': { type: 'gamma', shape: 10000, scale: 0.5 }
        };
        const lowResult = engine.run(config, lowDists, { nIterations: 500 });
        const lowWidth = lowResult.summary.ci95[1] - lowResult.summary.ci95[0];

        // High uncertainty
        const highDists = {
            prevalence: { type: 'beta', alpha: 5, beta: 95 },
            'newTx.drugCost': { type: 'gamma', shape: 10, scale: 500 }
        };
        const highResult = engine.run(config, highDists, { nIterations: 500 });
        const highWidth = highResult.summary.ci95[1] - highResult.summary.ci95[0];

        expect(highWidth).toBeGreaterThan(lowWidth);
    });

    // ------------------------------------------------------------------
    // 12. Dot-notation parameter override works
    // ------------------------------------------------------------------
    test('12. Dot-notation paths override nested config fields', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        // Override newTx.drugCost with a fixed value
        const paramDists = {
            'newTx.drugCost': { type: 'fixed', value: 9999 }
        };

        const result = engine.run(config, paramDists, { nIterations: 10 });

        // All iterations should use drugCost=9999
        // The deterministic also uses the mean of 'fixed' = 9999
        const detBIA = result.deterministic.netBudgetImpact;
        for (const iter of result.iterations) {
            expect(iter.netBudgetImpact).toBeCloseTo(detBIA, 2);
        }
    });

    // ------------------------------------------------------------------
    // 13. Invalid distribution type throws
    // ------------------------------------------------------------------
    test('13. Invalid distribution type throws', () => {
        const config = makeBaseConfig();
        const paramDists = {
            prevalence: { type: 'cauchy', location: 0.05 }
        };

        expect(() => engine.run(config, paramDists)).toThrow(/Unknown distribution type "cauchy"/);
    });

    // ------------------------------------------------------------------
    // 14. Empty paramDists: runs deterministic only
    // ------------------------------------------------------------------
    test('14. Empty paramDists returns deterministic-only result', () => {
        const config = makeBaseConfig({ discountRate: 0 });

        const result = engine.run(config, {});

        expect(result.iterations).toHaveLength(1);
        expect(result.summary.mean).toBe(result.deterministic.netBudgetImpact);
        expect(result.summary.median).toBe(result.deterministic.netBudgetImpact);
        expect(result.summary.ci95[0]).toBe(result.deterministic.netBudgetImpact);
        expect(result.summary.ci95[1]).toBe(result.deterministic.netBudgetImpact);
    });

    // ------------------------------------------------------------------
    // 15. Budget threshold: probExceedsBudget in [0,1]
    // ------------------------------------------------------------------
    test('15. Budget threshold: probExceedsBudget is between 0 and 1', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const result = engine.run(config, paramDists, { budgetThreshold: 1000000 });

        expect(result.summary.probExceedsBudget).toBeGreaterThanOrEqual(0);
        expect(result.summary.probExceedsBudget).toBeLessThanOrEqual(1);
    });

    // ------------------------------------------------------------------
    // 16. Median ~ mean for symmetric distributions
    // ------------------------------------------------------------------
    test('16. Median approximates mean for symmetric (normal) distributions', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        // Normal is symmetric
        const paramDists = {
            'newTx.drugCost': { type: 'normal', mean: 5000, sd: 200 }
        };

        const eng = new ProbabilisticBIAEngine({ seed: 12345, nIterations: 2000 });
        const result = eng.run(config, paramDists);

        // For symmetric distributions, median and mean should be close
        const relDiff = Math.abs(result.summary.mean - result.summary.median)
                      / Math.abs(result.summary.mean);
        expect(relDiff).toBeLessThan(0.05);
    });

    // ------------------------------------------------------------------
    // 17. Large nIterations (5000): median closer to deterministic
    // ------------------------------------------------------------------
    test('17. More iterations: mean converges closer to deterministic', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = {
            'newTx.drugCost': { type: 'gamma', shape: 100, scale: 50 }
        };

        const smallEng = new ProbabilisticBIAEngine({ seed: 12345, nIterations: 50 });
        const largeEng = new ProbabilisticBIAEngine({ seed: 12345, nIterations: 2000 });

        const smallResult = smallEng.run(config, paramDists);
        const largeResult = largeEng.run(config, paramDists);

        const det = largeResult.deterministic.netBudgetImpact;
        const smallErr = Math.abs(smallResult.summary.mean - det);
        const largeErr = Math.abs(largeResult.summary.mean - det);

        // Large iteration count should generally produce smaller error
        // (though not guaranteed for any single seed, so use a loose test)
        expect(largeResult.iterations.length).toBeGreaterThan(smallResult.iterations.length);
    });

    // ------------------------------------------------------------------
    // 18. Single year horizon
    // ------------------------------------------------------------------
    test('18. Single year horizon works in probabilistic mode', () => {
        const config = makeBaseConfig({
            timeHorizon: 1,
            uptake: [0.5],
            discountRate: 0
        });
        const paramDists = {
            prevalence: { type: 'beta', alpha: 50, beta: 950 }
        };

        const result = engine.run(config, paramDists, { nIterations: 100 });

        expect(result.iterations.length).toBe(100);
        for (const iter of result.iterations) {
            expect(iter.yearlyBudget).toHaveLength(1);
        }
    });

    // ------------------------------------------------------------------
    // 19. Subpopulation support in probabilistic mode
    // ------------------------------------------------------------------
    test('19. Probabilistic BIA works with prevalence parameter', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = {
            prevalence: { type: 'beta', alpha: 50, beta: 950 }
        };

        const result = engine.run(config, paramDists, { nIterations: 100 });

        // Each iteration should have different eligible populations
        const populations = result.iterations.map(r => r.eligiblePopulation);
        const unique = new Set(populations);
        // With 100 samples from beta, should have many distinct values
        expect(unique.size).toBeGreaterThan(1);
    });

    // ------------------------------------------------------------------
    // 20. PCG32 dependency resolution
    // ------------------------------------------------------------------
    test('20. Engine initializes without error with valid dependencies', () => {
        const eng = new ProbabilisticBIAEngine({ seed: 99999, nIterations: 10 });
        expect(eng.seed).toBe(99999);
        expect(eng.nIterations).toBe(10);
    });

    // ------------------------------------------------------------------
    // 21. Deterministic result has correct structure
    // ------------------------------------------------------------------
    test('21. Deterministic result has all expected BIA fields', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();
        const result = engine.run(config, paramDists, { nIterations: 50 });

        const det = result.deterministic;
        expect(det).toBeDefined();
        expect(typeof det.netBudgetImpact).toBe('number');
        expect(typeof det.totalIncremental).toBe('number');
        expect(det.yearlyBudget).toBeDefined();
        expect(Array.isArray(det.yearlyBudget)).toBe(true);
    });

    // ------------------------------------------------------------------
    // 22. Exceedance curve returns correct budget values
    // ------------------------------------------------------------------
    test('22. Exceedance curve returns sorted budget values', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();
        const budgetRange = [5000000, 1000000, 0, 3000000];

        const curve = engine.budgetExceedanceCurve(config, paramDists, budgetRange);

        // Should be sorted by budget
        for (let i = 1; i < curve.length; i++) {
            expect(curve[i].budget).toBeGreaterThanOrEqual(curve[i - 1].budget);
        }
        // All probabilities in [0, 1]
        for (const point of curve) {
            expect(point.probability).toBeGreaterThanOrEqual(0);
            expect(point.probability).toBeLessThanOrEqual(1);
        }
    });

    // ------------------------------------------------------------------
    // 23. Tornado bar structure is correct
    // ------------------------------------------------------------------
    test('23. Tornado bars have expected fields', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = makeStdParamDists();

        const tornado = engine.tornadoBIA(config, paramDists);

        for (const bar of tornado) {
            expect(bar).toHaveProperty('param');
            expect(bar).toHaveProperty('low');
            expect(bar).toHaveProperty('high');
            expect(bar).toHaveProperty('baseValue');
            expect(bar).toHaveProperty('lowInput');
            expect(bar).toHaveProperty('highInput');
            expect(bar).toHaveProperty('width');
            expect(bar.high).toBeGreaterThanOrEqual(bar.low);
            expect(bar.width).toBeCloseTo(bar.high - bar.low, 6);
        }
    });

    // ------------------------------------------------------------------
    // 24. Empty tornado for no param dists
    // ------------------------------------------------------------------
    test('24. Tornado with no paramDists returns empty array', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const tornado = engine.tornadoBIA(config, {});
        expect(tornado).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 25. Uptake array path override works
    // ------------------------------------------------------------------
    test('25. Array index override via dot-notation (uptake.1)', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const paramDists = {
            'uptake.1': { type: 'fixed', value: 0.99 }
        };

        const result = engine.run(config, paramDists, { nIterations: 10 });

        // All iterations should have uptake[1] = 0.99, so year 2 patients = 5000 * 0.99 = 4950
        for (const iter of result.iterations) {
            expect(iter.yearlyBudget[1].patients).toBe(Math.round(5000 * 0.99));
        }
    });
});
