/**
 * Tests for src/engine/budgetImpact.js — Budget Impact Analysis Engine
 */

'use strict';

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

// ============ TESTS ============

describe('BudgetImpactEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new BudgetImpactEngine();
    });

    // ------------------------------------------------------------------
    // 1. Basic 3-year BIA with linear uptake
    // ------------------------------------------------------------------
    test('1. Basic 3-year BIA: returns correct structure and yearly results', () => {
        const config = makeBaseConfig();
        const result = engine.run(config);

        expect(result.eligiblePopulation).toBe(5000);
        expect(result.yearlyBudget).toHaveLength(3);
        expect(result.yearlyBudget[0].year).toBe(1);
        expect(result.yearlyBudget[1].year).toBe(2);
        expect(result.yearlyBudget[2].year).toBe(3);
        expect(typeof result.totalIncremental).toBe('number');
        expect(typeof result.totalDiscounted).toBe('number');
        // P0-6: ISPOR BIA — primary result is undiscounted
        expect(result.netBudgetImpact).toBe(result.totalIncremental);
        expect(result.netBudgetImpactDiscounted).toBe(result.totalDiscounted);
        expect(typeof result.perPatientIncremental).toBe('number');
        expect(result.summary.peakYear).toBeGreaterThanOrEqual(1);
        expect(result.summary.cumulativePatients).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // 2. Manual calculation verification — year 1
    // ------------------------------------------------------------------
    test('2. Manual calculation: year 1 matches hand-computed values', () => {
        const config = makeBaseConfig({ discountRate: 0.035 });
        const result = engine.run(config);

        // eligible = 100000 * 0.05 = 5000
        expect(result.eligiblePopulation).toBe(5000);

        const yr1 = result.yearlyBudget[0];
        // patients = 5000 * 0.1 = 500
        expect(yr1.patients).toBe(500);

        // newTx per patient = 5000 + 200 + 100 + 50 = 5350
        // currentTx per patient = 2000 + 150 + 80 + 30 = 2260
        // offset per patient = -500 + -200 = -700
        expect(yr1.newTxCost).toBe(500 * 5350);         // 2,675,000
        expect(yr1.currentTxCost).toBe(500 * 2260);     // 1,130,000
        expect(yr1.offsetSavings).toBe(500 * -700);     // -350,000

        // incremental = 2675000 - 1130000 + (-350000) = 1,195,000
        expect(yr1.incremental).toBe(1195000);

        // year 1 → discount factor = 1/(1+0.035)^0 = 1.0
        expect(yr1.discountFactor).toBeCloseTo(1.0, 10);
        expect(yr1.discountedIncremental).toBeCloseTo(1195000, 2);
    });

    // ------------------------------------------------------------------
    // 3. Zero uptake → zero incremental in all years
    // ------------------------------------------------------------------
    test('3. Zero uptake: all years have 0 incremental', () => {
        const config = makeBaseConfig({ uptake: [0, 0, 0] });
        const result = engine.run(config);

        for (const yr of result.yearlyBudget) {
            expect(yr.patients).toBe(0);
            expect(yr.incremental).toBe(0);
            expect(yr.discountedIncremental).toBe(0);
        }
        expect(result.totalIncremental).toBe(0);
        expect(result.totalDiscounted).toBe(0);
        expect(result.netBudgetImpact).toBe(0);
    });

    // ------------------------------------------------------------------
    // 4. Full uptake (1.0): all eligible patients treated
    // ------------------------------------------------------------------
    test('4. Full uptake: all eligible patients treated each year', () => {
        const config = makeBaseConfig({ uptake: [1.0, 1.0, 1.0] });
        const result = engine.run(config);

        for (const yr of result.yearlyBudget) {
            expect(yr.patients).toBe(5000);
        }
        expect(result.summary.cumulativePatients).toBe(15000);
    });

    // ------------------------------------------------------------------
    // 5. Discounting: year 3 discounted < year 3 undiscounted (same uptake)
    // ------------------------------------------------------------------
    test('5. Discounting: later years have lower discounted incremental', () => {
        const config = makeBaseConfig({
            uptake: [0.5, 0.5, 0.5],
            discountRate: 0.05
        });
        const result = engine.run(config);

        const yr1 = result.yearlyBudget[0];
        const yr3 = result.yearlyBudget[2];

        // Same uptake, so same undiscounted incremental
        expect(yr1.incremental).toBe(yr3.incremental);

        // But yr3 discounted < yr1 discounted because of discounting
        expect(yr3.discountedIncremental).toBeLessThan(yr1.discountedIncremental);

        // Verify discount factor for year 3 (index 2): 1/(1.05)^2
        expect(yr3.discountFactor).toBeCloseTo(1 / Math.pow(1.05, 2), 10);
    });

    // ------------------------------------------------------------------
    // 6. Offsets reduce incremental cost
    // ------------------------------------------------------------------
    test('6. Offsets reduce incremental cost', () => {
        const configWithOffsets = makeBaseConfig();
        const configNoOffsets = makeBaseConfig({ offsets: undefined });

        const withOff = engine.run(configWithOffsets);
        const noOff = engine.run(configNoOffsets);

        // offsets are negative (savings), so incremental WITH offsets < WITHOUT
        expect(withOff.totalIncremental).toBeLessThan(noOff.totalIncremental);
    });

    // ------------------------------------------------------------------
    // 7. No offsets: incremental = newTx - currentTx only
    // ------------------------------------------------------------------
    test('7. No offsets: incremental equals newTx minus currentTx', () => {
        const config = makeBaseConfig({ offsets: undefined, discountRate: 0 });
        const result = engine.run(config);

        const newPerPt = 5350;   // 5000 + 200 + 100 + 50
        const curPerPt = 2260;   // 2000 + 150 + 80 + 30
        const diffPerPt = newPerPt - curPerPt; // 3090

        for (const yr of result.yearlyBudget) {
            expect(yr.offsetSavings).toBe(0);
            expect(yr.incremental).toBe(yr.patients * diffPerPt);
        }
    });

    // ------------------------------------------------------------------
    // 8. Subpopulation analysis: 2 groups, verify total
    // ------------------------------------------------------------------
    test('8. Subpopulation analysis: 2 groups with different costs', () => {
        const config = {
            subpopulations: [
                {
                    name: 'Elderly',
                    population: 50000,
                    prevalence: 0.10,
                    timeHorizon: 2,
                    uptake: [0.2, 0.4],
                    newTx: { drugCost: 8000 },
                    currentTx: { drugCost: 3000 },
                    discountRate: 0
                },
                {
                    name: 'Young',
                    population: 80000,
                    prevalence: 0.03,
                    timeHorizon: 2,
                    uptake: [0.1, 0.3],
                    newTx: { drugCost: 4000 },
                    currentTx: { drugCost: 1500 },
                    discountRate: 0
                }
            ]
        };

        const result = engine.subpopulationAnalysis(config);
        expect(result.subgroups).toHaveLength(2);
        expect(result.subgroups[0].name).toBe('Elderly');
        expect(result.subgroups[1].name).toBe('Young');

        // Total net should equal sum of subgroups
        const sumNet = result.subgroups.reduce((s, g) => s + g.result.netBudgetImpact, 0);
        expect(result.total.netBudgetImpact).toBeCloseTo(sumNet, 2);

        const sumPats = result.subgroups.reduce((s, g) => s + g.result.summary.cumulativePatients, 0);
        expect(result.total.cumulativePatients).toBe(sumPats);
    });

    // ------------------------------------------------------------------
    // 9. Scenario analysis: pessimistic > base > optimistic
    // ------------------------------------------------------------------
    test('9. Scenario analysis: pessimistic > base > optimistic', () => {
        const baseConfig = makeBaseConfig({ discountRate: 0 });
        const scenarios = {
            pessimistic: { uptake: [0.3, 0.6, 0.8] },
            optimistic: { uptake: [0.05, 0.10, 0.15] }
        };

        const result = engine.scenarioAnalysis(baseConfig, scenarios);

        expect(result.base.netBudgetImpact).toBeGreaterThan(0);
        expect(result.scenarios.pessimistic.result.netBudgetImpact)
            .toBeGreaterThan(result.base.netBudgetImpact);
        expect(result.scenarios.optimistic.result.netBudgetImpact)
            .toBeLessThan(result.base.netBudgetImpact);

        // Deltas
        expect(result.scenarios.pessimistic.delta).toBeGreaterThan(0);
        expect(result.scenarios.optimistic.delta).toBeLessThan(0);
    });

    // ------------------------------------------------------------------
    // 10. Incidence-based: annual new cases instead of prevalence
    // ------------------------------------------------------------------
    test('10. Incidence-based: uses annual new cases as eligible population', () => {
        const config = makeBaseConfig({
            prevalence: undefined,
            incidence: 2000,
            discountRate: 0
        });
        // Remove prevalence explicitly
        delete config.prevalence;

        const result = engine.run(config);
        expect(result.eligiblePopulation).toBe(2000);

        // Year 1: 2000 * 0.1 = 200 patients
        expect(result.yearlyBudget[0].patients).toBe(200);
    });

    // ------------------------------------------------------------------
    // 11. Single year horizon
    // ------------------------------------------------------------------
    test('11. Single year horizon works correctly', () => {
        const config = makeBaseConfig({
            timeHorizon: 1,
            uptake: [0.5],
            discountRate: 0
        });
        const result = engine.run(config);

        expect(result.yearlyBudget).toHaveLength(1);
        expect(result.yearlyBudget[0].year).toBe(1);
        expect(result.yearlyBudget[0].patients).toBe(2500); // 5000 * 0.5
        expect(result.summary.peakYear).toBe(1);
        expect(result.summary.cumulativePatients).toBe(2500);
    });

    // ------------------------------------------------------------------
    // 12. Edge: zero prevalence → zero impact
    // ------------------------------------------------------------------
    test('12. Zero prevalence: zero eligible population and zero impact', () => {
        const config = makeBaseConfig({ prevalence: 0 });
        const result = engine.run(config);

        expect(result.eligiblePopulation).toBe(0);
        expect(result.totalIncremental).toBe(0);
        expect(result.netBudgetImpact).toBe(0);
        for (const yr of result.yearlyBudget) {
            expect(yr.patients).toBe(0);
        }
    });

    // ------------------------------------------------------------------
    // 13. Edge: zero costs → zero impact
    // ------------------------------------------------------------------
    test('13. Zero costs for both treatments: zero incremental', () => {
        const config = makeBaseConfig({
            newTx: { drugCost: 0, adminCost: 0, monitoringCost: 0, aeCost: 0 },
            currentTx: { drugCost: 0, adminCost: 0, monitoringCost: 0, aeCost: 0 },
            offsets: undefined,
            discountRate: 0
        });
        const result = engine.run(config);

        expect(result.totalIncremental).toBe(0);
        expect(result.netBudgetImpact).toBe(0);
    });

    // ------------------------------------------------------------------
    // 14. Input validation: negative population throws
    // ------------------------------------------------------------------
    test('14. Validation: negative population throws', () => {
        const config = makeBaseConfig({ population: -100 });
        expect(() => engine.run(config)).toThrow(/population must be a positive integer/);
    });

    // ------------------------------------------------------------------
    // 15. Input validation: uptake > 1 throws
    // ------------------------------------------------------------------
    test('15. Validation: uptake > 1 throws', () => {
        const config = makeBaseConfig({ uptake: [0.1, 1.5, 0.5] });
        expect(() => engine.run(config)).toThrow(/uptake\[1\] must be a number between 0 and 1/);
    });

    // ------------------------------------------------------------------
    // 16. Input validation: uptake array length mismatch throws
    // ------------------------------------------------------------------
    test('16. Validation: uptake array length mismatch throws', () => {
        const config = makeBaseConfig({ uptake: [0.1, 0.3] }); // 2 != 3
        expect(() => engine.run(config)).toThrow(/uptake array length.*must equal timeHorizon/);
    });

    // ------------------------------------------------------------------
    // 17. perPatientIncremental calculation
    // ------------------------------------------------------------------
    test('17. perPatientIncremental is totalIncremental / cumulativePatients', () => {
        const config = makeBaseConfig();
        const result = engine.run(config);

        // P0-6: perPatientIncremental now uses undiscounted total (ISPOR BIA)
        const expected = result.totalIncremental / result.summary.cumulativePatients;
        expect(result.perPatientIncremental).toBeCloseTo(expected, 2);
    });

    // ------------------------------------------------------------------
    // 18. Summary: peakYear and peakBudget correct
    // ------------------------------------------------------------------
    test('18. Summary: peakYear and peakBudget identify the maximum year', () => {
        // Increasing uptake → year 3 should have peak (most patients)
        const config = makeBaseConfig({ discountRate: 0 });
        const result = engine.run(config);

        // With uptake [0.1, 0.3, 0.5] and discountRate 0, year 3 has highest budget
        expect(result.summary.peakYear).toBe(3);

        const yr3 = result.yearlyBudget[2];
        expect(result.summary.peakBudget).toBe(yr3.discountedIncremental);
    });

    // ------------------------------------------------------------------
    // 19. Currency pass-through
    // ------------------------------------------------------------------
    test('19. Currency from config is included in results', () => {
        const config = makeBaseConfig({ currency: 'EUR' });
        const result = engine.run(config);
        expect(result.currency).toBe('EUR');
    });

    test('19b. Default currency from engine options', () => {
        const eurEngine = new BudgetImpactEngine({ currency: 'GBP' });
        const config = makeBaseConfig();
        const result = eurEngine.run(config);
        expect(result.currency).toBe('GBP');
    });

    // ------------------------------------------------------------------
    // 20. Large population: 10 million, no overflow
    // ------------------------------------------------------------------
    test('20. Large population (10 million): no overflow or NaN', () => {
        const config = makeBaseConfig({
            population: 10000000,
            prevalence: 0.02,
            timeHorizon: 5,
            uptake: [0.1, 0.2, 0.3, 0.4, 0.5]
        });
        const result = engine.run(config);

        expect(Number.isFinite(result.totalIncremental)).toBe(true);
        expect(Number.isFinite(result.totalDiscounted)).toBe(true);
        expect(Number.isFinite(result.netBudgetImpact)).toBe(true);
        expect(result.eligiblePopulation).toBe(200000);
        expect(result.yearlyBudget).toHaveLength(5);
    });

    // ------------------------------------------------------------------
    // 21. Validation: prevalence > 1 throws
    // ------------------------------------------------------------------
    test('21. Validation: prevalence > 1 throws', () => {
        const config = makeBaseConfig({ prevalence: 1.5 });
        expect(() => engine.run(config)).toThrow(/prevalence must be a number between 0 and 1/);
    });

    // ------------------------------------------------------------------
    // 22. Validation: negative uptake throws
    // ------------------------------------------------------------------
    test('22. Validation: negative uptake throws', () => {
        const config = makeBaseConfig({ uptake: [-0.1, 0.3, 0.5] });
        expect(() => engine.run(config)).toThrow(/uptake\[0\] must be a number between 0 and 1/);
    });

    // ------------------------------------------------------------------
    // 23. Validation: non-integer population throws
    // ------------------------------------------------------------------
    test('23. Validation: non-integer population throws', () => {
        const config = makeBaseConfig({ population: 100.5 });
        expect(() => engine.run(config)).toThrow(/population must be a positive integer/);
    });

    // ------------------------------------------------------------------
    // 24. Validation: negative drug cost throws
    // ------------------------------------------------------------------
    test('24. Validation: negative drug cost throws', () => {
        const config = makeBaseConfig();
        config.newTx.drugCost = -100;
        expect(() => engine.run(config)).toThrow(/newTx.drugCost must be a non-negative number/);
    });

    // ------------------------------------------------------------------
    // 25. Validation: missing newTx throws
    // ------------------------------------------------------------------
    test('25. Validation: missing newTx throws', () => {
        const config = makeBaseConfig();
        delete config.newTx;
        expect(() => engine.run(config)).toThrow(/newTx must be provided/);
    });

    // ------------------------------------------------------------------
    // 26. Discount rate from constructor used as default
    // ------------------------------------------------------------------
    test('26. Constructor discount rate used when config omits it', () => {
        const eng = new BudgetImpactEngine({ discountRate: 0.08 });
        const config = makeBaseConfig({ uptake: [0.5, 0.5, 0.5] });
        // Don't set discountRate on config
        const result = eng.run(config);

        // Year 2 discount factor = 1/(1.08)^1
        expect(result.yearlyBudget[1].discountFactor).toBeCloseTo(1 / 1.08, 6);
    });

    // ------------------------------------------------------------------
    // 27. Config discount rate overrides constructor
    // ------------------------------------------------------------------
    test('27. Config discountRate overrides engine default', () => {
        const eng = new BudgetImpactEngine({ discountRate: 0.08 });
        const config = makeBaseConfig({
            discountRate: 0.05,
            uptake: [0.5, 0.5, 0.5]
        });
        const result = eng.run(config);

        // Year 2 discount factor should use 0.05, not 0.08
        expect(result.yearlyBudget[1].discountFactor).toBeCloseTo(1 / 1.05, 6);
    });

    // ------------------------------------------------------------------
    // 28. Discount rate 0 → all discount factors = 1.0
    // ------------------------------------------------------------------
    test('28. Zero discount rate: all discount factors are 1.0', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const result = engine.run(config);

        for (const yr of result.yearlyBudget) {
            expect(yr.discountFactor).toBe(1.0);
        }
        expect(result.totalIncremental).toBe(result.totalDiscounted);
    });

    // ------------------------------------------------------------------
    // 29. Scenario analysis: returns base and all scenario results
    // ------------------------------------------------------------------
    test('29. Scenario analysis: returns base + all named scenarios', () => {
        const baseConfig = makeBaseConfig();
        const scenarios = {
            lowUptake: { uptake: [0.05, 0.10, 0.15] },
            highCost: { newTx: { drugCost: 10000 } }
        };

        const result = engine.scenarioAnalysis(baseConfig, scenarios);

        expect(result.base).toBeDefined();
        expect(result.scenarios.lowUptake).toBeDefined();
        expect(result.scenarios.highCost).toBeDefined();
        expect(result.scenarios.lowUptake.delta).toBeLessThan(0);
        expect(result.scenarios.highCost.delta).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // 30. Scenario analysis: delta is scenario - base
    // ------------------------------------------------------------------
    test('30. Scenario analysis: delta equals scenario.net - base.net', () => {
        const baseConfig = makeBaseConfig({ discountRate: 0 });
        const scenarios = { high: { uptake: [0.5, 0.7, 0.9] } };

        const result = engine.scenarioAnalysis(baseConfig, scenarios);
        const expectedDelta = result.scenarios.high.result.netBudgetImpact
                            - result.base.netBudgetImpact;
        expect(result.scenarios.high.delta).toBeCloseTo(expectedDelta, 2);
    });

    // ------------------------------------------------------------------
    // 31. Subpopulation: missing array throws
    // ------------------------------------------------------------------
    test('31. Subpopulation: missing subpopulations array throws', () => {
        expect(() => engine.subpopulationAnalysis({}))
            .toThrow(/subpopulationAnalysis requires a subpopulations array/);
    });

    // ------------------------------------------------------------------
    // 32. Subpopulation: unnamed groups get "Unnamed" label
    // ------------------------------------------------------------------
    test('32. Subpopulation: unnamed groups get default label', () => {
        const config = {
            subpopulations: [
                {
                    population: 10000,
                    prevalence: 0.1,
                    timeHorizon: 1,
                    uptake: [0.5],
                    newTx: { drugCost: 1000 },
                    currentTx: { drugCost: 500 },
                    discountRate: 0
                }
            ]
        };
        const result = engine.subpopulationAnalysis(config);
        expect(result.subgroups[0].name).toBe('Unnamed');
    });

    // ------------------------------------------------------------------
    // 33. Incidence + prevalence both present: incidence takes precedence
    // ------------------------------------------------------------------
    test('33. When both incidence and prevalence given, incidence used', () => {
        const config = makeBaseConfig({
            prevalence: 0.05,   // would give 5000
            incidence: 1000,    // should use this
            discountRate: 0
        });
        const result = engine.run(config);
        expect(result.eligiblePopulation).toBe(1000);
    });

    // ------------------------------------------------------------------
    // 34. Partial treatment costs (only drugCost specified)
    // ------------------------------------------------------------------
    test('34. Partial treatment costs: missing cost fields default to 0', () => {
        const config = makeBaseConfig({
            newTx: { drugCost: 3000 },      // only drug
            currentTx: { drugCost: 1000 },  // only drug
            offsets: undefined,
            discountRate: 0,
            timeHorizon: 1,
            uptake: [1.0]
        });
        const result = engine.run(config);

        // 5000 patients * (3000 - 1000) = 10,000,000
        expect(result.yearlyBudget[0].incremental).toBe(5000 * 2000);
    });

    // ------------------------------------------------------------------
    // 35. Discount factor formula verification for each year
    // ------------------------------------------------------------------
    test('35. Discount factor = 1/(1+r)^(year-1) for each year', () => {
        const r = 0.04;
        const config = makeBaseConfig({
            discountRate: r,
            timeHorizon: 5,
            uptake: [0.1, 0.2, 0.3, 0.4, 0.5]
        });
        const result = engine.run(config);

        for (let i = 0; i < 5; i++) {
            const expected = 1 / Math.pow(1 + r, i);
            expect(result.yearlyBudget[i].discountFactor).toBeCloseTo(expected, 10);
        }
    });

    // ------------------------------------------------------------------
    // 36. Identical new and current treatments: zero incremental
    // ------------------------------------------------------------------
    test('36. Identical treatments produce zero incremental', () => {
        const sameTx = { drugCost: 3000, adminCost: 100, monitoringCost: 50, aeCost: 20 };
        const config = makeBaseConfig({
            newTx: { ...sameTx },
            currentTx: { ...sameTx },
            offsets: undefined,
            discountRate: 0
        });
        const result = engine.run(config);

        expect(result.totalIncremental).toBe(0);
        expect(result.netBudgetImpact).toBe(0);
    });

    // ------------------------------------------------------------------
    // 37. New treatment cheaper than current: negative incremental (savings)
    // ------------------------------------------------------------------
    test('37. Cheaper new treatment: negative incremental (budget saving)', () => {
        const config = makeBaseConfig({
            newTx: { drugCost: 1000 },      // cheaper
            currentTx: { drugCost: 5000 },  // expensive
            offsets: undefined,
            discountRate: 0
        });
        const result = engine.run(config);

        expect(result.totalIncremental).toBeLessThan(0);
        expect(result.netBudgetImpact).toBeLessThan(0);
    });

    // ------------------------------------------------------------------
    // 38. cumulativePatients sums across all years
    // ------------------------------------------------------------------
    test('38. cumulativePatients is sum of patients across years', () => {
        const config = makeBaseConfig({ discountRate: 0 });
        const result = engine.run(config);

        const sumPats = result.yearlyBudget.reduce((s, yr) => s + yr.patients, 0);
        expect(result.summary.cumulativePatients).toBe(sumPats);

        // 5000 * (0.1 + 0.3 + 0.5) = 5000 * 0.9 = 4500
        expect(sumPats).toBe(500 + 1500 + 2500);
    });

    // ------------------------------------------------------------------
    // 39. Validation: zero population throws (must be positive)
    // ------------------------------------------------------------------
    test('39. Validation: zero population throws', () => {
        const config = makeBaseConfig({ population: 0 });
        expect(() => engine.run(config)).toThrow(/population must be a positive integer/);
    });

    // ------------------------------------------------------------------
    // 40. 5-year horizon with decreasing uptake: peakYear is year 1
    // ------------------------------------------------------------------
    test('40. Decreasing uptake: peakYear is year 1', () => {
        const config = makeBaseConfig({
            timeHorizon: 5,
            uptake: [0.5, 0.4, 0.3, 0.2, 0.1],
            discountRate: 0
        });
        const result = engine.run(config);

        expect(result.summary.peakYear).toBe(1);
        expect(result.summary.peakBudget).toBe(result.yearlyBudget[0].discountedIncremental);
    });

    // ------------------------------------------------------------------
    // 41. Positive offsets increase incremental cost
    // ------------------------------------------------------------------
    test('41. Positive offsets increase incremental cost', () => {
        const config = makeBaseConfig({
            offsets: { additionalTraining: 300, facilityUpgrade: 500 },
            discountRate: 0
        });
        const configNoOff = makeBaseConfig({ offsets: undefined, discountRate: 0 });

        const withPos = engine.run(config);
        const noOff = engine.run(configNoOff);

        expect(withPos.totalIncremental).toBeGreaterThan(noOff.totalIncremental);
    });

    // ------------------------------------------------------------------
    // 42. Validation: uptake not an array throws
    // ------------------------------------------------------------------
    test('42. Validation: uptake not an array throws', () => {
        const config = makeBaseConfig({ uptake: 0.5 });
        expect(() => engine.run(config)).toThrow(/uptake must be an array/);
    });

    // ------------------------------------------------------------------
    // 43. Validation: missing both prevalence and incidence throws
    // ------------------------------------------------------------------
    test('43. Validation: missing both prevalence and incidence throws', () => {
        const config = makeBaseConfig();
        delete config.prevalence;
        delete config.incidence;
        expect(() => engine.run(config)).toThrow(/Either prevalence or incidence must be provided/);
    });
});
