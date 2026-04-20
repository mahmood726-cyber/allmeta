/**
 * Integration-oriented tests for src/engine/markov.js
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;

const { MarkovEngine } = require('../../src/engine/markov');

function createProject() {
    return {
        version: '0.1',
        metadata: { id: 'demo', name: 'Demo Markov Project' },
        model: { type: 'markov_cohort' },
        settings: {
            time_horizon: 5,
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
            alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
            dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
        },
        strategies: {
            comparator: {
                label: 'Comparator',
                is_comparator: true,
                parameter_overrides: { p_death: 0.1 }
            },
            intervention: {
                label: 'Intervention',
                parameter_overrides: { p_death: 'p_death * 0.5' }
            }
        }
    };
}

describe('MarkovEngine', () => {
    let engine;
    const silentLogger = { warn: () => {} };

    beforeEach(() => {
        engine = new MarkovEngine({ logger: silentLogger });
    });

    test('runs a valid cohort model and preserves final distribution mass', () => {
        const result = engine.run(createProject());

        expect(result.total_costs).toBeGreaterThan(0);
        expect(result.total_qalys).toBeGreaterThan(0);
        expect(result.life_years).toBeGreaterThan(0);
        expect(result.trace.cycles).toHaveLength(6);

        const finalMass = Object.values(result.final_distribution).reduce((a, b) => a + b, 0);
        expect(finalMass).toBeCloseTo(1, 10);
    });

    test('buildTransitionMatrix resolves complement transitions correctly', () => {
        const project = createProject();
        const stateIds = Object.keys(project.states);
        const context = { p_death: 0.1 };

        const matrix = engine.buildTransitionMatrix(project.transitions, stateIds, context);
        const aliveRowSum = matrix.alive.alive + matrix.alive.dead;

        expect(matrix.alive.dead).toBeCloseTo(0.1, 10);
        expect(matrix.alive.alive).toBeCloseTo(0.9, 10);
        expect(aliveRowSum).toBeCloseTo(1, 10);
        expect(matrix.dead.dead).toBeCloseTo(1, 10);
    });

    test('getDiscountFactor matches expected behavior at boundary cases', () => {
        expect(engine.getDiscountFactor(0, 1, 0.035)).toBeCloseTo(1, 12);
        expect(engine.getDiscountFactor(5, 1, 0)).toBe(1);
        expect(engine.getDiscountFactor(1, 1, 0.035)).toBeCloseTo(1 / 1.035, 12);
    });

    test('life-years exclude dead absorbing state occupancy by default', () => {
        const states = {
            alive: { label: 'Alive', type: 'transient', cost: 0, utility: 1 },
            dead: { label: 'Dead', type: 'absorbing', cost: 0, utility: 0 }
        };
        const distribution = { alive: 0.7, dead: 0.3 };
        const outcomes = engine.computeCycleOutcomes(
            states,
            distribution,
            {},
            0,
            1,
            { half_cycle_correction: 'none', cycle_length: 1 }
        );

        expect(outcomes.cycleLY).toBeCloseTo(0.7, 12);
    });

    test('mixed background mortality is deterministic and averaged', () => {
        const deterministicEngine = new MarkovEngine({
            logger: silentLogger,
            LifeTable: class {
                getMortalityRate(_, sex) {
                    return sex === 'male' ? 0.2 : 0.1;
                }
            }
        });

        const settings = {
            use_background_mortality: true,
            background_mortality_sex: 'mixed'
        };

        const observed = new Set();
        for (let i = 0; i < 25; i++) {
            observed.add(deterministicEngine.getBackgroundMortality(65, 'mixed', settings));
        }

        expect(observed.size).toBe(1);
        expect([...observed][0]).toBeCloseTo(0.15, 12);
    });

    test('falls back to available globals for backward compatibility', () => {
        const originalLifeTable = global.LifeTable;
        global.LifeTable = class {
            getMortalityRate(_, sex) {
                return sex === 'male' ? 0.2 : 0.1;
            }
        };

        try {
            const backwardCompatibleEngine = new MarkovEngine({ logger: silentLogger });
            const settings = {
                use_background_mortality: true,
                background_mortality_sex: 'mixed'
            };

            const rate = backwardCompatibleEngine.getBackgroundMortality(65, 'mixed', settings);
            expect(rate).toBeGreaterThan(0);
        } finally {
            if (typeof originalLifeTable === 'undefined') {
                delete global.LifeTable;
            } else {
                global.LifeTable = originalLifeTable;
            }
        }
    });

    test('strategy overrides are applied in runAllStrategies', () => {
        const result = engine.runAllStrategies(createProject());

        expect(result.incremental.comparator).toBe('comparator');
        expect(result.incremental.comparisons).toHaveLength(1);

        const comparison = result.incremental.comparisons[0];
        expect(comparison.strategy).toBe('intervention');
        expect(comparison.incremental_qalys).toBeGreaterThan(0);
        expect(Number.isFinite(comparison.nmb_primary)).toBe(true);
    });

    test('resolves parameter dependencies regardless of declaration order', () => {
        const context = engine.buildContext(
            {
                a: 'b + 1',
                b: 'c + 1',
                c: 1
            },
            {},
            { cycle_length: 1, starting_age: 50 },
            0
        );

        expect(context.c).toBe(1);
        expect(context.b).toBe(2);
        expect(context.a).toBe(3);
    });

    test('captures circular parameter dependencies as warnings with safe defaults', () => {
        engine.currentRunWarnings = [];
        engine.currentRunWarningKeys = new Set();

        const context = engine.buildContext(
            {
                a: 'b + 1',
                b: 'a + 1'
            },
            {},
            { cycle_length: 1, starting_age: 50 },
            0
        );

        expect(context.a).toBe(0);
        expect(context.b).toBe(0);
        expect(engine.currentRunWarnings.some(w => w.message.includes('Circular dependency detected'))).toBe(true);
    });

    test('buildTransitionMatrix normalizes rows above 1 and fills self-transition when below 1', () => {
        engine.currentRunWarnings = [];
        engine.currentRunWarningKeys = new Set();

        const states = ['A', 'B'];
        const matrix = engine.buildTransitionMatrix(
            {
                high_1: { from: 'A', to: 'A', probability: 0.8 },
                high_2: { from: 'A', to: 'B', probability: 0.7 },
                low_1: { from: 'B', to: 'A', probability: 0.2 }
            },
            states,
            {}
        );

        expect(matrix.A.A + matrix.A.B).toBeCloseTo(1, 12);
        expect(matrix.B.A + matrix.B.B).toBeCloseTo(1, 12);
        expect(matrix.B.B).toBeCloseTo(0.8, 12);
        expect(engine.currentRunWarnings.some(w => w.key.includes('transition_rowsum_high'))).toBe(true);
        expect(engine.currentRunWarnings.some(w => w.key.includes('transition_rowsum_low'))).toBe(true);
    });

    test('run returns warnings for expression evaluation failures', () => {
        const project = createProject();
        project.states.alive.cost = 'missing_cost_parameter';
        const result = engine.run(project);

        expect(Array.isArray(result.warnings)).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.message.includes('Failed to evaluate cost'))).toBe(true);
    });

    test('supports dependency injection for parser and summation classes', () => {
        class StubKahanSum {
            constructor() {
                this.sum = 0;
            }
            add(value) {
                this.sum += value;
            }
            total() {
                return this.sum;
            }
        }

        const fakeEvaluate = jest.fn((expr, ctx) => {
            if (Object.hasOwn(ctx, expr)) return ctx[expr];
            throw new Error(`Unexpected expression: ${expr}`);
        });
        const injectedEngine = new MarkovEngine({
            logger: silentLogger,
            KahanSum: StubKahanSum,
            ExpressionParser: { evaluate: fakeEvaluate },
            performance: { now: () => 0 }
        });

        const result = injectedEngine.run(createProject());

        expect(result.total_costs).toBeGreaterThan(0);
        expect(fakeEvaluate).toHaveBeenCalled();
    });
});

describe('Numerical helpers used by the engine', () => {
    test('KahanSum remains accurate on repeated decimal additions', () => {
        const ks = new KahanSum();
        for (let i = 0; i < 10000; i++) ks.add(0.1);
        expect(ks.total()).toBeCloseTo(1000, 10);
    });

    test('ExpressionParser conversions are inverses for rate/probability', () => {
        const rate = 0.15;
        const p = ExpressionParser.evaluate('rate_to_prob(r)', { r: rate });
        const recovered = ExpressionParser.evaluate('prob_to_rate(p)', { p });

        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
        expect(ExpressionParser.evaluate('prob_to_rate(0)', {})).toBeCloseTo(0, 12);
        expect(recovered).toBeCloseTo(rate, 10);
    });
});
