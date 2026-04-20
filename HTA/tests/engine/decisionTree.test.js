/**
 * Tests for src/engine/decisionTree.js — DecisionTreeEngine
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;

const { DecisionTreeEngine } = require('../../src/engine/decisionTree');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple two-strategy decision tree:
 *
 *   [Decision] root
 *     ├── (Chance) strategyA
 *     │     ├── (Terminal) A_good  p=0.7  cost=1000  qaly=5
 *     │     └── (Terminal) A_bad   p=0.3  cost=5000  qaly=1
 *     └── (Chance) strategyB
 *           ├── (Terminal) B_good  p=0.6  cost=800   qaly=6
 *           └── (Terminal) B_bad   p=0.4  cost=6000  qaly=2
 */
function buildSimpleTree() {
    const dt = new DecisionTreeEngine();

    dt.createDecisionNode('root', 'Treatment Choice');
    dt.setRoot('root');

    // Strategy A
    dt.createChanceNode('chanceA', 'Strategy A');
    dt.createTerminalNode('tA_good', 'A Good', { cost: 1000, effectiveness: 5, qaly: 5 });
    dt.createTerminalNode('tA_bad', 'A Bad', { cost: 5000, effectiveness: 1, qaly: 1 });
    dt.addChild('root', 'chanceA', { label: 'Strategy A', strategyName: 'Strategy A' });
    dt.addChild('chanceA', 'tA_good', { probability: 0.7 });
    dt.addChild('chanceA', 'tA_bad', { probability: 0.3 });

    // Strategy B
    dt.createChanceNode('chanceB', 'Strategy B');
    dt.createTerminalNode('tB_good', 'B Good', { cost: 800, effectiveness: 6, qaly: 6 });
    dt.createTerminalNode('tB_bad', 'B Bad', { cost: 6000, effectiveness: 2, qaly: 2 });
    dt.addChild('root', 'chanceB', { label: 'Strategy B', strategyName: 'Strategy B' });
    dt.addChild('chanceB', 'tB_good', { probability: 0.6 });
    dt.addChild('chanceB', 'tB_bad', { probability: 0.4 });

    return dt;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionTreeEngine', () => {

    test('constructor creates engine with default config', () => {
        const dt = new DecisionTreeEngine();

        expect(dt.discountRate).toBe(0);
        expect(dt.perspective).toBe('healthcare_payer');
        expect(dt.currency).toBe('OMR');
        expect(dt.precision).toBe(6);
        expect(dt.rootId).toBeNull();
        expect(dt.nodes.size).toBe(0);
        expect(dt.calculationCache.size).toBe(0);
    });

    test('constructor respects custom options', () => {
        const dt = new DecisionTreeEngine({
            discountRate: 0.035,
            perspective: 'societal',
            currency: 'USD',
            precision: 4
        });

        expect(dt.discountRate).toBe(0.035);
        expect(dt.perspective).toBe('societal');
        expect(dt.currency).toBe('USD');
        expect(dt.precision).toBe(4);
    });

    test('single terminal node returns cost and utility directly', () => {
        const dt = new DecisionTreeEngine();

        dt.createDecisionNode('root', 'Root');
        dt.createTerminalNode('leaf', 'Leaf', {
            cost: 2500,
            effectiveness: 3.5,
            qaly: 3.5,
            lys: 4.0
        });
        dt.addChild('root', 'leaf', { label: 'Only Option', strategyName: 'Only' });
        dt.setRoot('root');

        const result = dt.rollBack();

        expect(result.rootExpectedValue.cost).toBeCloseTo(2500, 10);
        expect(result.rootExpectedValue.qaly).toBeCloseTo(3.5, 10);
        expect(result.rootExpectedValue.lys).toBeCloseTo(4.0, 10);
    });

    test('chance node computes probability-weighted expected value', () => {
        const dt = new DecisionTreeEngine();

        dt.createChanceNode('chance', 'Event');
        dt.createTerminalNode('win', 'Win', { cost: 100, effectiveness: 10, qaly: 10 });
        dt.createTerminalNode('lose', 'Lose', { cost: 900, effectiveness: 2, qaly: 2 });

        // Wrap in a decision node so rollBack can run from root
        dt.createDecisionNode('root', 'Root');
        dt.addChild('root', 'chance', { label: 'Play', strategyName: 'Play' });
        dt.addChild('chance', 'win', { probability: 0.8 });
        dt.addChild('chance', 'lose', { probability: 0.2 });
        dt.setRoot('root');

        const result = dt.rollBack();

        // EV(cost)  = 0.8*100 + 0.2*900 = 260
        // EV(qaly)  = 0.8*10  + 0.2*2   = 8.4
        expect(result.rootExpectedValue.cost).toBeCloseTo(260, 10);
        expect(result.rootExpectedValue.qaly).toBeCloseTo(8.4, 10);
    });

    test('decision node selects strategy with best expected effectiveness', () => {
        const dt = buildSimpleTree();
        const result = dt.rollBack();

        // Strategy A: EV_eff = 0.7*5 + 0.3*1 = 3.8
        // Strategy B: EV_eff = 0.6*6 + 0.4*2 = 4.4
        // Best by effectiveness: Strategy B
        expect(result.rootExpectedValue.effectiveness).toBeCloseTo(4.4, 10);
        expect(result.optimalStrategy).toBe('Strategy B');
    });

    test('rollBack correctly propagates values up the tree', () => {
        const dt = buildSimpleTree();
        const result = dt.rollBack();
        const nodeResults = result.nodeResults;

        // Terminal node values
        expect(nodeResults.tA_good.cost).toBe(1000);
        expect(nodeResults.tA_bad.cost).toBe(5000);

        // Chance node A: EV(cost) = 0.7*1000 + 0.3*5000 = 2200
        expect(nodeResults.chanceA.cost).toBeCloseTo(2200, 10);

        // Chance node B: EV(cost) = 0.6*800 + 0.4*6000 = 2880
        expect(nodeResults.chanceB.cost).toBeCloseTo(2880, 10);

        // Root picks by effectiveness, so rootExpectedValue reflects the best strategy
        expect(result.rootExpectedValue).toBeDefined();
        expect(result.rootExpectedValue.nodeType).toBe('decision');
    });

    test('validate detects probabilities not summing to 1', () => {
        const dt = new DecisionTreeEngine();

        dt.createDecisionNode('root', 'Root');
        dt.createChanceNode('chance', 'Chance');
        dt.createTerminalNode('t1', 'T1', { cost: 100, effectiveness: 1, qaly: 1 });
        dt.createTerminalNode('t2', 'T2', { cost: 200, effectiveness: 2, qaly: 2 });

        dt.addChild('root', 'chance', { label: 'Only' });
        dt.addChild('chance', 't1', { probability: 0.3 });
        dt.addChild('chance', 't2', { probability: 0.3 });
        dt.setRoot('root');

        const validation = dt.validate();

        expect(validation.valid).toBe(false);
        expect(validation.errors.some(e => e.includes('probabilities sum to'))).toBe(true);
    });

    test('one-way sensitivity analysis varies a parameter and tracks optimal strategy', () => {
        const dt = buildSimpleTree();

        // Vary probability of good outcome for strategy A
        const dsa = dt.oneWaySensitivity(
            'chanceA.prob_0',
            { min: 0.0, max: 1.0 },
            10
        );

        expect(dsa.parameterId).toBe('chanceA.prob_0');
        expect(dsa.results.length).toBe(11); // 0..10 inclusive
        expect(dsa.results[0].parameterValue).toBeCloseTo(0.0, 10);
        expect(dsa.results[10].parameterValue).toBeCloseTo(1.0, 10);

        // Each result should have finite expected cost
        for (const r of dsa.results) {
            expect(Number.isFinite(r.expectedCost)).toBe(true);
        }
    });

    test('nested 3-level deep tree computes correctly', () => {
        const dt = new DecisionTreeEngine();

        // Root (Decision) -> Chance -> Chance -> Terminal
        dt.createDecisionNode('root', 'Root');
        dt.createChanceNode('c1', 'Level 1 Chance');
        dt.createChanceNode('c2a', 'Level 2a Chance');
        dt.createChanceNode('c2b', 'Level 2b Chance');
        dt.createTerminalNode('t1', 'T1', { cost: 100, effectiveness: 10, qaly: 10 });
        dt.createTerminalNode('t2', 'T2', { cost: 200, effectiveness: 5, qaly: 5 });
        dt.createTerminalNode('t3', 'T3', { cost: 300, effectiveness: 8, qaly: 8 });
        dt.createTerminalNode('t4', 'T4', { cost: 400, effectiveness: 3, qaly: 3 });

        dt.addChild('root', 'c1', { label: 'Path', strategyName: 'Path' });
        dt.addChild('c1', 'c2a', { probability: 0.5 });
        dt.addChild('c1', 'c2b', { probability: 0.5 });
        dt.addChild('c2a', 't1', { probability: 0.6 });
        dt.addChild('c2a', 't2', { probability: 0.4 });
        dt.addChild('c2b', 't3', { probability: 0.7 });
        dt.addChild('c2b', 't4', { probability: 0.3 });
        dt.setRoot('root');

        const result = dt.rollBack();

        // c2a EV(cost) = 0.6*100 + 0.4*200 = 140
        // c2b EV(cost) = 0.7*300 + 0.3*400 = 330
        // c1 EV(cost)  = 0.5*140 + 0.5*330 = 235
        expect(result.rootExpectedValue.cost).toBeCloseTo(235, 10);

        // c2a EV(qaly) = 0.6*10 + 0.4*5 = 8
        // c2b EV(qaly) = 0.7*8 + 0.3*3 = 6.5
        // c1 EV(qaly)  = 0.5*8 + 0.5*6.5 = 7.25
        expect(result.rootExpectedValue.qaly).toBeCloseTo(7.25, 10);
    });

    test('zero probability branch does not affect expected value', () => {
        const dt = new DecisionTreeEngine();

        dt.createDecisionNode('root', 'Root');
        dt.createChanceNode('chance', 'Chance');
        dt.createTerminalNode('real', 'Real', { cost: 500, effectiveness: 4, qaly: 4 });
        dt.createTerminalNode('impossible', 'Impossible', { cost: 999999, effectiveness: 0, qaly: 0 });

        dt.addChild('root', 'chance', { label: 'Only', strategyName: 'Only' });
        dt.addChild('chance', 'real', { probability: 1.0 });
        dt.addChild('chance', 'impossible', { probability: 0.0 });
        dt.setRoot('root');

        const result = dt.rollBack();

        // EV should be entirely from the "real" branch
        expect(result.rootExpectedValue.cost).toBeCloseTo(500, 10);
        expect(result.rootExpectedValue.qaly).toBeCloseTo(4, 10);
    });

    test('determinism: same input produces identical output on repeated runs', () => {
        const dt = buildSimpleTree();

        const result1 = dt.rollBack();
        dt.invalidateCache();
        const result2 = dt.rollBack();

        expect(result1.rootExpectedValue.cost).toBe(result2.rootExpectedValue.cost);
        expect(result1.rootExpectedValue.qaly).toBe(result2.rootExpectedValue.qaly);
        expect(result1.rootExpectedValue.effectiveness).toBe(result2.rootExpectedValue.effectiveness);
        expect(result1.optimalStrategy).toBe(result2.optimalStrategy);
    });

    test('validate returns valid for well-formed tree', () => {
        const dt = buildSimpleTree();
        const validation = dt.validate();

        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
    });

    test('validate detects missing root', () => {
        const dt = new DecisionTreeEngine();
        dt.createTerminalNode('t1', 'T1', { cost: 0, effectiveness: 0 });

        const validation = dt.validate();

        expect(validation.valid).toBe(false);
        expect(validation.errors.some(e => e.includes('No root node'))).toBe(true);
    });

    test('export and import round-trip preserves tree structure', () => {
        const dt = buildSimpleTree();
        const exported = dt.export();

        const dt2 = new DecisionTreeEngine();
        dt2.import(exported);

        const r1 = dt.rollBack();
        const r2 = dt2.rollBack();

        expect(r1.rootExpectedValue.cost).toBe(r2.rootExpectedValue.cost);
        expect(r1.rootExpectedValue.qaly).toBe(r2.rootExpectedValue.qaly);
        expect(r1.optimalStrategy).toBe(r2.optimalStrategy);
    });

    test('clone produces an independent copy', () => {
        const dt = buildSimpleTree();
        const clone = dt.clone();

        // Mutate the optimal strategy's terminal in the original
        // Strategy B is optimal by effectiveness; change its terminal payoff
        dt.nodes.get('tB_good').payoff.cost = 99999;
        dt.invalidateCache();

        const original = dt.rollBack();
        const cloned = clone.rollBack();

        // Original should now reflect the mutated cost; clone should not
        // Original Strategy B cost = 0.6*99999 + 0.4*6000 = 62399.4
        expect(original.nodeResults.chanceB.cost).toBeCloseTo(62399.4, 1);
        // Clone should still have the original cost = 2880
        expect(cloned.nodeResults.chanceB.cost).toBeCloseTo(2880, 10);
    });

    test('decision criterion "cost" minimizes cost', () => {
        const dt = buildSimpleTree();

        // Strategy A EV(cost) = 0.7*1000 + 0.3*5000 = 2200
        // Strategy B EV(cost) = 0.6*800  + 0.4*6000 = 2880
        // Minimizing cost => Strategy A
        const result = dt.rollBack({ decisionCriterion: 'cost' });

        expect(result.optimalStrategy).toBe('Strategy A');
        expect(result.rootExpectedValue.cost).toBeCloseTo(2200, 10);
    });

    test('riskProfile returns strategy comparison data', () => {
        const dt = buildSimpleTree();
        const profile = dt.riskProfile();

        expect(profile.strategies).toBeDefined();
        expect(Object.keys(profile.strategies).length).toBeGreaterThanOrEqual(1);

        // Check that each strategy has expected fields
        for (const [name, strategy] of Object.entries(profile.strategies)) {
            expect(strategy.expectedCost).toBeGreaterThanOrEqual(0);
            expect(strategy.outcomes.length).toBeGreaterThan(0);
        }
    });

    test('addChild throws when adding child to terminal node', () => {
        const dt = new DecisionTreeEngine();
        dt.createTerminalNode('leaf', 'Leaf', { cost: 0 });
        dt.createTerminalNode('child', 'Child', { cost: 0 });

        expect(() => dt.addChild('leaf', 'child')).toThrow('Cannot add children to terminal node');
    });

    test('rollBack throws when no root is set', () => {
        const dt = new DecisionTreeEngine();
        dt.createTerminalNode('t', 'T', { cost: 0 });

        expect(() => dt.rollBack()).toThrow('No root node set');
    });
});
