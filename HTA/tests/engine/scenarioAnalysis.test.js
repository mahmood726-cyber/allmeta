/**
 * Tests for src/engine/scenarioAnalysis.js — ScenarioAnalysisEngine
 */

'use strict';

const { ScenarioAnalysisEngine } = require('../../src/engine/scenarioAnalysis');

// ---------------------------------------------------------------------------
// Test model
// ---------------------------------------------------------------------------
const simpleModel = (params) => ({
    cost: (params.drug_cost ?? 5000) + 1000,
    qaly: (params.utility ?? 0.8) * 10,
    comparatorCost: 3000,
    comparatorQaly: 7
});

describe('ScenarioAnalysisEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new ScenarioAnalysisEngine();
    });

    // ===== run =====
    describe('run', () => {
        const baseParams = { drug_cost: 5000, utility: 0.8 };

        test('1. base case computed correctly', () => {
            const result = engine.run(simpleModel, baseParams, {});
            // cost = 5000+1000 = 6000, qaly = 0.8*10 = 8
            expect(result.base.results.cost).toBe(6000);
            expect(result.base.results.qaly).toBe(8);
        });

        test('2. scenario overrides specific parameters only', () => {
            const result = engine.run(simpleModel, baseParams, {
                expensive: { drug_cost: 10000 }
            });
            // drug_cost overridden to 10000, utility stays 0.8
            expect(result.scenarios.expensive.params.drug_cost).toBe(10000);
            expect(result.scenarios.expensive.params.utility).toBe(0.8);
            expect(result.scenarios.expensive.results.cost).toBe(11000);
            expect(result.scenarios.expensive.results.qaly).toBe(8);
        });

        test('3. delta computed: scenario - base', () => {
            const result = engine.run(simpleModel, baseParams, {
                expensive: { drug_cost: 10000 }
            });
            // Base cost = 6000, scenario cost = 11000, delta = 5000
            expect(result.scenarios.expensive.delta.cost).toBeCloseTo(5000, 0);
            // QALY unchanged
            expect(result.scenarios.expensive.delta.qaly).toBeCloseTo(0, 0);
        });

        test('4. summary identifies bestCase (lowest ICER)', () => {
            const result = engine.run(simpleModel, baseParams, {
                pessimistic: { drug_cost: 8000, utility: 0.6 },
                optimistic: { drug_cost: 3000, utility: 0.9 }
            });
            expect(result.summary.bestCase).toBe('optimistic');
        });

        test('5. summary identifies worstCase (highest ICER)', () => {
            const result = engine.run(simpleModel, baseParams, {
                pessimistic: { drug_cost: 8000, utility: 0.6 },
                optimistic: { drug_cost: 3000, utility: 0.9 }
            });
            expect(result.summary.worstCase).toBe('pessimistic');
        });

        test('6. rangeICER spans from best to worst ICER', () => {
            const result = engine.run(simpleModel, baseParams, {
                pessimistic: { drug_cost: 8000, utility: 0.6 },
                optimistic: { drug_cost: 3000, utility: 0.9 }
            });
            expect(result.summary.rangeICER).toHaveLength(2);
            expect(result.summary.rangeICER[0]).toBeLessThanOrEqual(result.summary.rangeICER[1]);
        });

        test('7. empty scenarios: just returns base', () => {
            const result = engine.run(simpleModel, baseParams, {});
            expect(Object.keys(result.scenarios)).toHaveLength(0);
            expect(result.base.results.cost).toBe(6000);
        });

        test('8. single scenario', () => {
            const result = engine.run(simpleModel, baseParams, {
                generic: { drug_cost: 1000 }
            });
            expect(Object.keys(result.scenarios)).toHaveLength(1);
            expect(result.scenarios.generic.results.cost).toBe(2000);
        });

        test('9. all parameters overridden', () => {
            const result = engine.run(simpleModel, baseParams, {
                custom: { drug_cost: 8000, utility: 0.6 }
            });
            expect(result.scenarios.custom.results.cost).toBe(9000);
            expect(result.scenarios.custom.results.qaly).toBeCloseTo(6, 0);
        });

        test('10. scenario identical to base has delta = 0', () => {
            const result = engine.run(simpleModel, baseParams, {
                same: { drug_cost: 5000, utility: 0.8 }
            });
            expect(result.scenarios.same.delta.cost).toBeCloseTo(0, 5);
            expect(result.scenarios.same.delta.qaly).toBeCloseTo(0, 5);
        });

        test('11. ICER computed for each scenario', () => {
            const result = engine.run(simpleModel, baseParams, {
                cheap: { drug_cost: 1000 }
            });
            // ICER = (2000-3000)/(8-7) = -1000 (dominant)
            expect(result.scenarios.cheap.results.icer).toBeCloseTo(-1000, 0);
        });
    });

    // ===== autoScenarios =====
    describe('autoScenarios', () => {
        const baseParams = { cost: 5000, utility: 0.8 };
        const paramDefs = [
            { name: 'cost', ci: [3000, 7000], direction: 'cost' },
            { name: 'utility', ci: [0.6, 0.95], direction: 'benefit' }
        ];

        test('12. extreme pessimistic uses worse bounds', () => {
            const result = engine.autoScenarios(baseParams, paramDefs, 'extreme');
            // Cost: higher = worse → pessimistic uses upper CI
            expect(result.pessimistic.cost).toBe(7000);
            // Utility: lower = worse → pessimistic uses lower CI
            expect(result.pessimistic.utility).toBe(0.6);
        });

        test('13. extreme optimistic uses better bounds', () => {
            const result = engine.autoScenarios(baseParams, paramDefs, 'extreme');
            expect(result.optimistic.cost).toBe(3000);
            expect(result.optimistic.utility).toBe(0.95);
        });

        test('14. realistic type generates one-at-a-time scenarios', () => {
            const result = engine.autoScenarios(baseParams, paramDefs, 'realistic');
            expect(result).toHaveProperty('cost_low');
            expect(result).toHaveProperty('cost_high');
            expect(result).toHaveProperty('utility_low');
            expect(result).toHaveProperty('utility_high');
            expect(result.cost_low.cost).toBe(3000);
            expect(result.cost_high.cost).toBe(7000);
        });

        test('15. default direction detects cost-like params (P2-4: higher cost = pessimistic)', () => {
            const noDirDefs = [
                { name: 'cost', ci: [3000, 7000] },
                { name: 'utility', ci: [0.6, 0.95] }
            ];
            const result = engine.autoScenarios(baseParams, noDirDefs, 'extreme');
            // P2-4: cost-named params get higher=pessimistic, lower=optimistic
            expect(result.pessimistic.cost).toBe(7000);
            expect(result.optimistic.cost).toBe(3000);
            // Non-cost params: lower = pessimistic, upper = optimistic
            expect(result.pessimistic.utility).toBe(0.6);
            expect(result.optimistic.utility).toBe(0.95);
        });
    });

    // ===== crossScenario =====
    describe('crossScenario', () => {
        const baseParams = { drug_cost: 5000, utility: 0.8 };

        test('16. 2 dimensions x 3 levels = 9 combinations', () => {
            const dimensions = {
                drug_cost: { low: 3000, mid: 5000, high: 8000 },
                utility: { low: 0.6, mid: 0.8, high: 0.95 }
            };
            const result = engine.crossScenario(simpleModel, baseParams, dimensions);
            expect(result.totalCombinations).toBe(9);
            expect(result.combinations).toHaveLength(9);
        });

        test('17. 2 dimensions x 2 levels = 4 combinations', () => {
            const dimensions = {
                drug_cost: { low: 3000, high: 8000 },
                utility: { low: 0.6, high: 0.95 }
            };
            const result = engine.crossScenario(simpleModel, baseParams, dimensions);
            expect(result.totalCombinations).toBe(4);
        });

        test('18. each combination has correct labels', () => {
            const dimensions = {
                drug_cost: { low: 3000, high: 8000 },
                utility: { low: 0.6, high: 0.95 }
            };
            const result = engine.crossScenario(simpleModel, baseParams, dimensions);
            const labels = result.combinations.map(c => c.labels);
            // All 4 combinations should be present
            expect(labels).toContainEqual({ drug_cost: 'low', utility: 'low' });
            expect(labels).toContainEqual({ drug_cost: 'low', utility: 'high' });
            expect(labels).toContainEqual({ drug_cost: 'high', utility: 'low' });
            expect(labels).toContainEqual({ drug_cost: 'high', utility: 'high' });
        });

        test('19. each combination has model results', () => {
            const dimensions = {
                drug_cost: { low: 3000, high: 8000 },
                utility: { low: 0.6, high: 0.95 }
            };
            const result = engine.crossScenario(simpleModel, baseParams, dimensions);
            for (const combo of result.combinations) {
                expect(combo.results).toHaveProperty('cost');
                expect(combo.results).toHaveProperty('qaly');
                expect(combo.results).toHaveProperty('icer');
            }
        });

        test('20. dimensions and levels are recorded', () => {
            const dimensions = {
                drug_cost: { low: 3000, high: 8000 },
                utility: { low: 0.6, high: 0.95 }
            };
            const result = engine.crossScenario(simpleModel, baseParams, dimensions);
            expect(result.dimensions).toEqual(['drug_cost', 'utility']);
            expect(result.levels.drug_cost).toEqual(['low', 'high']);
            expect(result.levels.utility).toEqual(['low', 'high']);
        });
    });
});
