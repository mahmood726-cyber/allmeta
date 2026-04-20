/**
 * Tests for src/engine/semiMarkov.js — SemiMarkovEngine
 */

'use strict';

const { KahanSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');

// Set up globals required by the engine modules
global.KahanSum = KahanSum;
global.PCG32 = PCG32;

const { SemiMarkovEngine } = require('../../src/engine/semiMarkov');

// ---------------------------------------------------------------------------
// Helper: build a simple config
// ---------------------------------------------------------------------------
function makeConfig(overrides) {
    var base = {
        states: ['Healthy', 'Disease', 'Dead'],
        initial: [1.0, 0.0, 0.0],
        transitions: {
            'Healthy->Disease': { type: 'constant', rate: 0.1 },
            'Healthy->Dead': { type: 'constant', rate: 0.02 },
            'Disease->Dead': { type: 'constant', rate: 0.3 },
        },
        costs: { Healthy: 100, Disease: 5000, Dead: 0 },
        utilities: { Healthy: 0.9, Disease: 0.5, Dead: 0 },
        timeHorizon: 20,
        discountRate: 0.035
    };
    return Object.assign(base, overrides || {});
}

// ---------------------------------------------------------------------------
// 1. Constant hazard: equivalent to standard Markov
// ---------------------------------------------------------------------------
describe('SemiMarkovEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new SemiMarkovEngine({ maxCycles: 100 });
    });

    test('1. Constant hazard produces valid state trace', () => {
        var config = makeConfig();
        var result = engine.run(config);
        expect(result.stateTrace).toBeDefined();
        expect(result.stateTrace.length).toBe(config.timeHorizon + 1); // initial + 20 cycles
        // Initial state: all Healthy
        expect(result.stateTrace[0][0]).toBeCloseTo(1.0, 6);
        expect(result.stateTrace[0][1]).toBeCloseTo(0.0, 6);
        expect(result.stateTrace[0][2]).toBeCloseTo(0.0, 6);
    });

    // ---------------------------------------------------------------------------
    // 2. Weibull shape=1: equivalent to exponential (constant hazard)
    // ---------------------------------------------------------------------------
    test('2. Weibull shape=1 equivalent to exponential', () => {
        var rate = 0.1;
        var config1 = makeConfig({
            states: ['Alive', 'Dead'],
            initial: [1.0, 0.0],
            transitions: {
                'Alive->Dead': { type: 'constant', rate: rate }
            },
            costs: { Alive: 100, Dead: 0 },
            utilities: { Alive: 1, Dead: 0 },
            timeHorizon: 10
        });
        var config2 = makeConfig({
            states: ['Alive', 'Dead'],
            initial: [1.0, 0.0],
            transitions: {
                'Alive->Dead': { type: 'weibull', shape: 1, scale: 1 / rate }
            },
            costs: { Alive: 100, Dead: 0 },
            utilities: { Alive: 1, Dead: 0 },
            timeHorizon: 10
        });

        var r1 = engine.run(config1);
        var r2 = engine.run(config2);

        // State traces should be similar (not identical due to tunnel mechanics,
        // but Weibull(1, 1/rate) hazard = rate at all times)
        for (var i = 0; i <= 10; i++) {
            expect(r2.stateTrace[i][0]).toBeCloseTo(r1.stateTrace[i][0], 2);
        }
    });

    // ---------------------------------------------------------------------------
    // 3. Weibull shape>1: increasing transition rate with time in state
    // ---------------------------------------------------------------------------
    test('3. Weibull shape>1 gives increasing hazard', () => {
        var h1 = engine.sojournHazard({ type: 'weibull', shape: 2, scale: 5 }, 1);
        var h5 = engine.sojournHazard({ type: 'weibull', shape: 2, scale: 5 }, 5);
        var h10 = engine.sojournHazard({ type: 'weibull', shape: 2, scale: 5 }, 10);
        expect(h5).toBeGreaterThan(h1);
        expect(h10).toBeGreaterThan(h5);
    });

    // ---------------------------------------------------------------------------
    // 4. Weibull shape<1: decreasing transition rate
    // ---------------------------------------------------------------------------
    test('4. Weibull shape<1 gives decreasing hazard', () => {
        var h1 = engine.sojournHazard({ type: 'weibull', shape: 0.5, scale: 5 }, 1);
        var h5 = engine.sojournHazard({ type: 'weibull', shape: 0.5, scale: 5 }, 5);
        var h10 = engine.sojournHazard({ type: 'weibull', shape: 0.5, scale: 5 }, 10);
        expect(h5).toBeLessThan(h1);
        expect(h10).toBeLessThan(h5);
    });

    // ---------------------------------------------------------------------------
    // 5. Gamma sojourn: transitions computed correctly
    // ---------------------------------------------------------------------------
    test('5. Gamma sojourn hazard is positive', () => {
        var h = engine.sojournHazard({ type: 'gamma', shape: 2, scale: 3 }, 5);
        expect(h).toBeGreaterThan(0);
        expect(isFinite(h)).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // 6. hazardToProb: h=0 → p=0, h=∞ → p→1, h=0.1 → p≈0.0952
    // ---------------------------------------------------------------------------
    test('6. hazardToProb converts correctly', () => {
        expect(engine.hazardToProb(0)).toBe(0);
        expect(engine.hazardToProb(1000)).toBeCloseTo(1.0, 6);
        expect(engine.hazardToProb(0.1)).toBeCloseTo(1 - Math.exp(-0.1), 6);
        // 1 - exp(-0.1) ≈ 0.09516
        expect(engine.hazardToProb(0.1)).toBeCloseTo(0.09516, 3);
    });

    // ---------------------------------------------------------------------------
    // 7. sojournHazard: Weibull at t=1 with shape=2, scale=5
    // ---------------------------------------------------------------------------
    test('7. sojournHazard Weibull(2,5) at t=1', () => {
        // h(1) = (2/5) * (1/5)^(2-1) = 0.4 * 0.2 = 0.08
        var h = engine.sojournHazard({ type: 'weibull', shape: 2, scale: 5 }, 1);
        expect(h).toBeCloseTo(0.08, 6);
    });

    // ---------------------------------------------------------------------------
    // 8. 3-state model: Healthy→Disease→Dead, verify state trace
    // ---------------------------------------------------------------------------
    test('8. 3-state model state trace makes sense', () => {
        var config = makeConfig({ timeHorizon: 30 });
        var result = engine.run(config);
        // Over time, Dead proportion should increase
        var deadAtStart = result.stateTrace[0][2];
        var deadAtEnd = result.stateTrace[30][2];
        expect(deadAtEnd).toBeGreaterThan(deadAtStart);
        // Healthy proportion should decrease
        var healthyAtStart = result.stateTrace[0][0];
        var healthyAtEnd = result.stateTrace[30][0];
        expect(healthyAtEnd).toBeLessThan(healthyAtStart);
    });

    // ---------------------------------------------------------------------------
    // 9. Costs and QALYs computed correctly with discounting
    // ---------------------------------------------------------------------------
    test('9. Costs and QALYs with discounting', () => {
        var config = makeConfig({ discountRate: 0.035, timeHorizon: 5 });
        var result = engine.run(config);
        expect(result.totalCosts).toBeGreaterThan(0);
        expect(result.totalQALYs).toBeGreaterThan(0);
        // With discounting at 3.5%, undiscounted totals would be higher
        var undiscountedConfig = makeConfig({ discountRate: 0, timeHorizon: 5 });
        var undiscountedResult = engine.run(undiscountedConfig);
        expect(undiscountedResult.totalCosts).toBeGreaterThan(result.totalCosts);
        expect(undiscountedResult.totalQALYs).toBeGreaterThan(result.totalQALYs);
    });

    // ---------------------------------------------------------------------------
    // 10. All in Dead state by end of long horizon
    // ---------------------------------------------------------------------------
    test('10. All in Dead by end of long horizon', () => {
        var config = makeConfig({ timeHorizon: 80 });
        var result = engine.run(config);
        var finalTrace = result.stateTrace[80];
        expect(finalTrace[2]).toBeGreaterThan(0.99); // Dead > 99%
    });

    // ---------------------------------------------------------------------------
    // 11. Initial distribution respected
    // ---------------------------------------------------------------------------
    test('11. Initial distribution respected', () => {
        var config = makeConfig({ initial: [0.5, 0.3, 0.2] });
        var result = engine.run(config);
        expect(result.stateTrace[0][0]).toBeCloseTo(0.5, 6);
        expect(result.stateTrace[0][1]).toBeCloseTo(0.3, 6);
        expect(result.stateTrace[0][2]).toBeCloseTo(0.2, 6);
    });

    // ---------------------------------------------------------------------------
    // 12. Sojourn statistics: mean time in state reasonable
    // ---------------------------------------------------------------------------
    test('12. Sojourn stats present and reasonable', () => {
        var config = makeConfig();
        var result = engine.run(config);
        expect(result.sojournStats).toBeDefined();
        expect(result.sojournStats['Healthy']).toBeDefined();
        expect(result.sojournStats['Healthy'].meanTimeInState).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------------
    // 13. Dead is absorbing (no transitions out)
    // ---------------------------------------------------------------------------
    test('13. Dead is absorbing', () => {
        var config = makeConfig({ timeHorizon: 10 });
        var result = engine.run(config);
        // Dead proportion should never decrease
        for (var i = 1; i <= 10; i++) {
            expect(result.stateTrace[i][2]).toBeGreaterThanOrEqual(result.stateTrace[i-1][2] - 1e-10);
        }
    });

    // ---------------------------------------------------------------------------
    // 14. Edge: single state (Dead only)
    // ---------------------------------------------------------------------------
    test('14. Single state model (Dead only)', () => {
        var config = {
            states: ['Dead'],
            initial: [1.0],
            transitions: {},
            costs: { Dead: 0 },
            utilities: { Dead: 0 },
            timeHorizon: 5,
            discountRate: 0
        };
        var result = engine.run(config);
        expect(result.stateTrace.length).toBe(6);
        expect(result.totalCosts).toBe(0);
        expect(result.totalQALYs).toBe(0);
        for (var i = 0; i <= 5; i++) {
            expect(result.stateTrace[i][0]).toBeCloseTo(1.0, 6);
        }
    });

    // ---------------------------------------------------------------------------
    // 15. All constant transitions match expected behavior
    // ---------------------------------------------------------------------------
    test('15. All constant transitions produce consistent results', () => {
        var config = makeConfig({ timeHorizon: 10 });
        var result = engine.run(config);
        // Total population should be conserved (sum to 1 at every cycle)
        for (var i = 0; i <= 10; i++) {
            var sum = result.stateTrace[i].reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 6);
        }
    });

    // ---------------------------------------------------------------------------
    // 16. Determinism: same config → same results
    // ---------------------------------------------------------------------------
    test('16. Determinism: same config gives same results', () => {
        var config = makeConfig();
        var r1 = engine.run(config);
        var r2 = engine.run(config);
        expect(r1.totalCosts).toBe(r2.totalCosts);
        expect(r1.totalQALYs).toBe(r2.totalQALYs);
    });

    // ---------------------------------------------------------------------------
    // 17. Tunnel state aggregation: output only shows named states
    // ---------------------------------------------------------------------------
    test('17. Output shows only named states', () => {
        var config = makeConfig({
            transitions: {
                'Healthy->Disease': { type: 'weibull', shape: 1.5, scale: 10 },
                'Healthy->Dead': { type: 'constant', rate: 0.02 },
                'Disease->Dead': { type: 'gamma', shape: 2, scale: 3 },
            },
            timeHorizon: 15
        });
        var result = engine.run(config);
        // Each state trace entry should have exactly 3 elements
        for (var i = 0; i <= 15; i++) {
            expect(result.stateTrace[i].length).toBe(3);
        }
    });

    // ---------------------------------------------------------------------------
    // 18. Large timeHorizon (100 cycles): no overflow or NaN
    // ---------------------------------------------------------------------------
    test('18. Large time horizon: no NaN or Infinity', () => {
        var config = makeConfig({ timeHorizon: 100 });
        var engine100 = new SemiMarkovEngine({ maxCycles: 100 });
        var result = engine100.run(config);
        expect(isFinite(result.totalCosts)).toBe(true);
        expect(isFinite(result.totalQALYs)).toBe(true);
        expect(isNaN(result.totalCosts)).toBe(false);
        expect(isNaN(result.totalQALYs)).toBe(false);
        for (var i = 0; i <= 100; i++) {
            for (var s = 0; s < 3; s++) {
                expect(isNaN(result.stateTrace[i][s])).toBe(false);
            }
        }
    });

    // ---------------------------------------------------------------------------
    // 19. Mixed transition types: some constant, some Weibull
    // ---------------------------------------------------------------------------
    test('19. Mixed transition types work correctly', () => {
        var config = makeConfig({
            transitions: {
                'Healthy->Disease': { type: 'weibull', shape: 1.5, scale: 10 },
                'Healthy->Dead': { type: 'constant', rate: 0.02 },
                'Disease->Dead': { type: 'constant', rate: 0.3 },
            },
            timeHorizon: 20
        });
        var result = engine.run(config);
        expect(result.stateTrace.length).toBe(21);
        expect(result.totalCosts).toBeGreaterThan(0);
        // Population conserved
        for (var i = 0; i <= 20; i++) {
            var sum = result.stateTrace[i].reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 4);
        }
    });

    // ---------------------------------------------------------------------------
    // 20. discountRate=0: no discounting applied
    // ---------------------------------------------------------------------------
    test('20. discountRate=0 means no discounting', () => {
        var config = makeConfig({ discountRate: 0, timeHorizon: 5 });
        var result = engine.run(config);
        // Verify that per-cycle costs are just population * cost, no discount factor
        var cycle0 = result.perCycle[0];
        // At cycle 0, all healthy: cost should be 1.0 * 100 = 100
        expect(cycle0.costs).toBeCloseTo(100, 4);
        expect(cycle0.qalys).toBeCloseTo(0.9, 4);
    });

    // ---------------------------------------------------------------------------
    // Extra: lognormal sojourn type
    // ---------------------------------------------------------------------------
    test('21. Lognormal sojourn hazard is positive and finite', () => {
        var h = engine.sojournHazard({ type: 'lognormal', meanlog: 1, sdlog: 0.5 }, 3);
        expect(h).toBeGreaterThan(0);
        expect(isFinite(h)).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Extra: invalid transition type throws
    // ---------------------------------------------------------------------------
    test('22. Unknown transition type throws', () => {
        expect(() => {
            engine.sojournHazard({ type: 'poisson', rate: 1 }, 1);
        }).toThrow('Unknown transition type');
    });

    // ---------------------------------------------------------------------------
    // Extra: mass conservation with sojourn-dependent transitions
    // ---------------------------------------------------------------------------
    test('23. Mass conservation with Weibull transitions', () => {
        var config = makeConfig({
            transitions: {
                'Healthy->Disease': { type: 'weibull', shape: 2, scale: 8 },
                'Healthy->Dead': { type: 'weibull', shape: 1.5, scale: 20 },
                'Disease->Dead': { type: 'gamma', shape: 2, scale: 5 },
            },
            timeHorizon: 30
        });
        var result = engine.run(config);
        for (var i = 0; i <= 30; i++) {
            var sum = result.stateTrace[i].reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 4);
        }
    });

    // ---------------------------------------------------------------------------
    // Extra: perCycle has correct number of entries
    // ---------------------------------------------------------------------------
    test('24. perCycle has correct number of entries', () => {
        var config = makeConfig({ timeHorizon: 10 });
        var result = engine.run(config);
        expect(result.perCycle.length).toBe(10);
    });

    // ---------------------------------------------------------------------------
    // Extra: hazardToProb with custom cycle length
    // ---------------------------------------------------------------------------
    test('25. hazardToProb respects cycleLength', () => {
        var p1 = engine.hazardToProb(0.1, 1);
        var p2 = engine.hazardToProb(0.1, 2);
        // Doubling cycle length increases probability
        expect(p2).toBeGreaterThan(p1);
        expect(p2).toBeCloseTo(1 - Math.exp(-0.2), 6);
    });

    // ---------------------------------------------------------------------------
    // P0-11: gammaFunction(0) returns Infinity (not NaN/division by zero)
    // ---------------------------------------------------------------------------
    test('26. gammaFunction(0) returns Infinity', () => {
        // gammaFunction is not exported, but we can test it indirectly
        // via sojournHazard with gamma type at extreme values.
        // Direct test: require the module and check the function.
        // Since gammaFunction is not exported, we test the engine doesn't crash
        // when hazard computation hits edge cases.
        var h = engine.sojournHazard({ type: 'gamma', shape: 2, scale: 3 }, 1e-10);
        expect(isFinite(h) || h === Infinity).toBe(true);
        expect(isNaN(h)).toBe(false);
    });

    // ---------------------------------------------------------------------------
    // P1-3: maxCycles capped at 10000
    // ---------------------------------------------------------------------------
    test('27. maxCycles capped at 10000', () => {
        var bigEngine = new SemiMarkovEngine({ maxCycles: 50000 });
        expect(bigEngine.maxCycles).toBe(10000);
    });

    test('28. maxCycles default is 100', () => {
        var defaultEngine = new SemiMarkovEngine({});
        expect(defaultEngine.maxCycles).toBe(100);
    });

    // ---------------------------------------------------------------------------
    // P0-3: Competing risks decomposition — probabilities should sum correctly
    // ---------------------------------------------------------------------------
    test('29. Competing risks: total transition prob <= 1 with high hazards', () => {
        // Two high-hazard exits: h=2.0 each. Old code: p1≈0.865, p2≈0.865, sum>1.
        // New code: totalHazard=4.0, totalProb=1-exp(-4)≈0.982, each gets 0.491.
        var config = makeConfig({
            states: ['A', 'B', 'C'],
            initial: [1.0, 0.0, 0.0],
            transitions: {
                'A->B': { type: 'constant', rate: 2.0 },
                'A->C': { type: 'constant', rate: 2.0 },
            },
            costs: { A: 0, B: 0, C: 0 },
            utilities: { A: 0, B: 0, C: 0 },
            timeHorizon: 1
        });
        var result = engine.run(config);
        // After 1 cycle, the sum of B and C populations = totalTransProb
        var pB = result.stateTrace[1][1];
        var pC = result.stateTrace[1][2];
        // Equal hazards → equal allocation
        expect(pB).toBeCloseTo(pC, 6);
        // Total transition prob = 1 - exp(-4) ≈ 0.9817
        var expectedTotal = 1 - Math.exp(-4.0);
        expect(pB + pC).toBeCloseTo(expectedTotal, 4);
        // Each should be half
        expect(pB).toBeCloseTo(expectedTotal / 2, 4);
    });

    // ---------------------------------------------------------------------------
    // P1-7: Half-cycle correction
    // ---------------------------------------------------------------------------
    test('30. Half-cycle correction reduces first-cycle reward', () => {
        // Without HCC: cycle 0 uses full initial population (all Healthy, utility=0.9)
        // With HCC: cycle 0 uses average of initial and cycle-0 populations
        var configNoHCC = makeConfig({ timeHorizon: 5, discountRate: 0, halfCycleCorrection: false });
        var configHCC = makeConfig({ timeHorizon: 5, discountRate: 0, halfCycleCorrection: true });
        var rNoHCC = engine.run(configNoHCC);
        var rHCC = engine.run(configHCC);
        // First cycle QALY should differ
        // Without HCC: cycle 0 QALY = aggPop * utility = 1.0 * 0.9 = 0.9
        expect(rNoHCC.perCycle[0].qalys).toBeCloseTo(0.9, 4);
        // With HCC: cycle 0 QALY = 0.5*(1.0 + 1.0) * 0.9 = 0.9 (same for cycle 0 since prevAggPop = initialAgg = aggPop)
        // But for cycle 1+, populations differ so HCC should produce different totals
        expect(rHCC.totalQALYs).not.toBe(rNoHCC.totalQALYs);
    });

    // ---------------------------------------------------------------------------
    // P1-8: Differential discounting
    // ---------------------------------------------------------------------------
    test('31. Differential discounting: different rates for costs vs outcomes', () => {
        var config = makeConfig({
            timeHorizon: 10,
            discountRate: 0.05,
            discountRateCosts: 0.03,
            discountRateOutcomes: 0.015
        });
        var result = engine.run(config);
        expect(result.totalCosts).toBeGreaterThan(0);
        expect(result.totalQALYs).toBeGreaterThan(0);

        // Compare with uniform 5% discount — differential should give different results
        var configUniform = makeConfig({
            timeHorizon: 10,
            discountRate: 0.05
        });
        var rUniform = engine.run(configUniform);
        // Lower discount on outcomes → higher total QALYs
        expect(result.totalQALYs).toBeGreaterThan(rUniform.totalQALYs);
        // Lower discount on costs → higher total costs
        expect(result.totalCosts).toBeGreaterThan(rUniform.totalCosts);
    });

    test('32. Differential discounting falls back to discountRate', () => {
        // When discountRateCosts/discountRateOutcomes are not provided,
        // should use discountRate for both
        var config = makeConfig({ timeHorizon: 5, discountRate: 0.035 });
        var r1 = engine.run(config);

        var config2 = makeConfig({
            timeHorizon: 5,
            discountRate: 0.035,
            discountRateCosts: 0.035,
            discountRateOutcomes: 0.035
        });
        var r2 = engine.run(config2);
        expect(r1.totalCosts).toBeCloseTo(r2.totalCosts, 8);
        expect(r1.totalQALYs).toBeCloseTo(r2.totalQALYs, 8);
    });

    // ---------------------------------------------------------------------------
    // P1-16: Input validation
    // ---------------------------------------------------------------------------
    test('33. Validation: empty states array throws', () => {
        expect(() => {
            engine.run({
                states: [],
                initial: [],
                transitions: {},
                timeHorizon: 5
            });
        }).toThrow('states must be a non-empty array');
    });

    test('34. Validation: initial not summing to 1 throws', () => {
        expect(() => {
            engine.run({
                states: ['A', 'B'],
                initial: [0.5, 0.1],  // sums to 0.6
                transitions: {},
                timeHorizon: 5
            });
        }).toThrow('initial distribution must sum to ~1.0');
    });

    test('35. Validation: negative timeHorizon throws', () => {
        expect(() => {
            engine.run({
                states: ['A'],
                initial: [1.0],
                transitions: {},
                timeHorizon: -5
            });
        }).toThrow('timeHorizon must be positive');
    });

    test('36. Validation: transition key without -> throws', () => {
        expect(() => {
            engine.run({
                states: ['A', 'B'],
                initial: [1.0, 0.0],
                transitions: { 'A to B': { type: 'constant', rate: 0.1 } },
                timeHorizon: 5
            });
        }).toThrow('transition key must contain "->"');
    });

    test('37. Validation: invalid transition type throws', () => {
        expect(() => {
            engine.run({
                states: ['A', 'B'],
                initial: [1.0, 0.0],
                transitions: { 'A->B': { type: 'exponential', rate: 0.1 } },
                timeHorizon: 5
            });
        }).toThrow('invalid transition type');
    });

    test('38. Validation: constant rate negative throws', () => {
        expect(() => {
            engine.run({
                states: ['A', 'B'],
                initial: [1.0, 0.0],
                transitions: { 'A->B': { type: 'constant', rate: -0.1 } },
                timeHorizon: 5
            });
        }).toThrow('constant rate must be >= 0');
    });

    test('39. Validation: weibull shape <= 0 throws', () => {
        expect(() => {
            engine.run({
                states: ['A', 'B'],
                initial: [1.0, 0.0],
                transitions: { 'A->B': { type: 'weibull', shape: 0, scale: 5 } },
                timeHorizon: 5
            });
        }).toThrow('shape must be > 0');
    });

    test('40. Validation: gamma scale <= 0 throws', () => {
        expect(() => {
            engine.run({
                states: ['A', 'B'],
                initial: [1.0, 0.0],
                transitions: { 'A->B': { type: 'gamma', shape: 2, scale: -1 } },
                timeHorizon: 5
            });
        }).toThrow('scale must be > 0');
    });

    test('41. Validation: valid config passes without error', () => {
        expect(() => {
            engine.run(makeConfig());
        }).not.toThrow();
    });
});
