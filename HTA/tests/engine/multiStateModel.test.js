/**
 * Tests for src/engine/multiStateModel.js — MultiStateModelEngine
 */

'use strict';

const { MultiStateModelEngine, matrixExponential, zeroMatrix, identityMatrix, matMul } =
    require('../../src/engine/multiStateModel');

// ---------------------------------------------------------------------------
// Helper: standard 4-state model config (Healthy → Mild → Severe → Dead)
// ---------------------------------------------------------------------------
function fourStateConfig(overrides = {}) {
    return Object.assign({
        states: [
            { name: 'Healthy', initial: 0.8 },
            { name: 'Mild', initial: 0.2 },
            { name: 'Severe', initial: 0 },
            { name: 'Dead', initial: 0, absorbing: true }
        ],
        transitions: [
            { from: 'Healthy', to: 'Mild', rate: 0.1 },
            { from: 'Healthy', to: 'Dead', rate: 0.02 },
            { from: 'Mild', to: 'Severe', rate: 0.15 },
            { from: 'Mild', to: 'Dead', rate: 0.05 },
            { from: 'Severe', to: 'Dead', rate: 0.2 }
        ],
        rewards: {
            Healthy: { cost: 100, qaly: 0.9 },
            Mild: { cost: 3000, qaly: 0.6 },
            Severe: { cost: 8000, qaly: 0.3 },
            Dead: { cost: 0, qaly: 0 }
        },
        timeHorizon: 20,
        cycleLength: 1,
        discountRateCosts: 0.035,
        discountRateOutcomes: 0.035,
        halfCycleCorrection: false
    }, overrides);
}

// Simple 3-state: Healthy → Sick → Dead
function threeStateConfig(overrides = {}) {
    return Object.assign({
        states: [
            { name: 'Healthy', initial: 1.0 },
            { name: 'Sick', initial: 0 },
            { name: 'Dead', initial: 0, absorbing: true }
        ],
        transitions: [
            { from: 'Healthy', to: 'Sick', rate: 0.1 },
            { from: 'Healthy', to: 'Dead', rate: 0.02 },
            { from: 'Sick', to: 'Dead', rate: 0.15 }
        ],
        rewards: {
            Healthy: { cost: 500, qaly: 0.9 },
            Sick: { cost: 5000, qaly: 0.5 },
            Dead: { cost: 0, qaly: 0 }
        },
        timeHorizon: 10,
        cycleLength: 1,
        discountRateCosts: 0.035,
        discountRateOutcomes: 0.035,
        halfCycleCorrection: false
    }, overrides);
}

describe('MultiStateModelEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new MultiStateModelEngine();
    });

    // ===== Core simulation =====
    test('1. 3-state model: state trace sums to 1.0 each cycle', () => {
        const result = engine.run(threeStateConfig());
        for (const occ of result.stateTrace) {
            const sum = occ.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 8);
        }
    });

    test('2. Matrix exponential: identity for Q=0', () => {
        const I = identityMatrix(3);
        const Q = zeroMatrix(3);
        const P = matrixExponential(Q, 1.0);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                expect(P[i][j]).toBeCloseTo(I[i][j], 10);
            }
        }
    });

    test('3. Matrix exponential: known result for 2x2', () => {
        // Q = [[-a, a], [0, 0]] => P = exp(Q) = [[exp(-a), 1-exp(-a)], [0, 1]]
        const a = 0.5;
        const Q = [new Float64Array([-a, a]), new Float64Array([0, 0])];
        const P = matrixExponential(Q, 1.0);
        expect(P[0][0]).toBeCloseTo(Math.exp(-a), 6);
        expect(P[0][1]).toBeCloseTo(1 - Math.exp(-a), 6);
        expect(P[1][0]).toBeCloseTo(0, 10);
        expect(P[1][1]).toBeCloseTo(1, 10);
    });

    test('4. Absorbing state accumulates population', () => {
        const result = engine.run(threeStateConfig({ timeHorizon: 50 }));
        const lastOcc = result.stateTrace[result.stateTrace.length - 1];
        // Dead is index 2 — should have most population
        expect(lastOcc[2]).toBeGreaterThan(0.9);
    });

    test('5. All in Dead by very long horizon', () => {
        const result = engine.run(threeStateConfig({ timeHorizon: 200 }));
        const lastOcc = result.stateTrace[result.stateTrace.length - 1];
        // Dead (index 2) should be ~1.0
        expect(lastOcc[2]).toBeCloseTo(1.0, 3);
        expect(lastOcc[0]).toBeCloseTo(0, 3);
        expect(lastOcc[1]).toBeCloseTo(0, 3);
    });

    test('6. Discount rates applied correctly', () => {
        const noDiscount = engine.run(threeStateConfig({
            discountRateCosts: 0,
            discountRateOutcomes: 0
        }));
        const withDiscount = engine.run(threeStateConfig({
            discountRateCosts: 0.05,
            discountRateOutcomes: 0.05
        }));
        // Discounting should reduce totals
        expect(withDiscount.totalCosts).toBeLessThan(noDiscount.totalCosts);
        expect(withDiscount.totalQalys).toBeLessThan(noDiscount.totalQalys);
    });

    test('7. Half-cycle correction changes results', () => {
        const without = engine.run(threeStateConfig({ halfCycleCorrection: false }));
        const withHCC = engine.run(threeStateConfig({ halfCycleCorrection: true }));
        // Results should differ
        expect(withHCC.totalCosts).not.toBeCloseTo(without.totalCosts, 2);
    });

    test('8. Steady state: all weight in absorbing states', () => {
        const result = engine.run(threeStateConfig());
        const ss = result.steadyState;
        // For a model with one absorbing state, steady state should have all mass there
        expect(ss[2]).toBeCloseTo(1.0, 3);
        expect(ss[0]).toBeCloseTo(0, 3);
    });

    test('9. Mean sojourn time: reasonable for given rates', () => {
        const result = engine.run(threeStateConfig());
        const sojourn = result.sojournTimes;
        // Healthy: 1/(0.1+0.02) = ~8.33 years
        expect(sojourn['Healthy']).toBeCloseTo(1 / 0.12, 1);
        // Sick: 1/0.15 = ~6.67 years
        expect(sojourn['Sick']).toBeCloseTo(1 / 0.15, 1);
        // Dead: absorbing → Infinity
        expect(sojourn['Dead']).toBe(Infinity);
    });

    test('10. Transition probability matrix has non-negative entries', () => {
        const result = engine.run(fourStateConfig());
        const P = result.transitionProbMatrix;
        for (let i = 0; i < P.length; i++) {
            for (let j = 0; j < P[i].length; j++) {
                expect(P[i][j]).toBeGreaterThanOrEqual(-1e-10);
            }
        }
    });

    test('11. Row sums of P = 1.0', () => {
        const result = engine.run(fourStateConfig());
        const P = result.transitionProbMatrix;
        for (let i = 0; i < P.length; i++) {
            let rowSum = 0;
            for (let j = 0; j < P[i].length; j++) rowSum += P[i][j];
            expect(rowSum).toBeCloseTo(1.0, 6);
        }
    });

    test('12. Costs and QALYs computed correctly', () => {
        const result = engine.run(fourStateConfig());
        expect(result.totalCosts).toBeGreaterThan(0);
        expect(result.totalQalys).toBeGreaterThan(0);
        // QALYs should be less than timeHorizon * 1.0 (max utility)
        expect(result.totalQalys).toBeLessThan(20);
        // Costs should be greater than just healthy costs
        expect(result.totalCosts).toBeGreaterThan(100);
    });

    test('13. Single state: stays at 100%', () => {
        const config = {
            states: [{ name: 'Only', initial: 1.0, absorbing: true }],
            transitions: [],
            rewards: { Only: { cost: 100, qaly: 0.8 } },
            timeHorizon: 5,
            cycleLength: 1,
            discountRateCosts: 0,
            discountRateOutcomes: 0,
            halfCycleCorrection: false
        };
        const result = engine.run(config);
        for (const occ of result.stateTrace) {
            expect(occ[0]).toBeCloseTo(1.0, 10);
        }
    });

    test('14. Two absorbing states: population splits', () => {
        const config = {
            states: [
                { name: 'Alive', initial: 1.0 },
                { name: 'Dead_A', initial: 0, absorbing: true },
                { name: 'Dead_B', initial: 0, absorbing: true }
            ],
            transitions: [
                { from: 'Alive', to: 'Dead_A', rate: 0.1 },
                { from: 'Alive', to: 'Dead_B', rate: 0.2 }
            ],
            rewards: {
                Alive: { cost: 0, qaly: 1 },
                Dead_A: { cost: 0, qaly: 0 },
                Dead_B: { cost: 0, qaly: 0 }
            },
            timeHorizon: 100,
            cycleLength: 1,
            discountRateCosts: 0,
            discountRateOutcomes: 0,
            halfCycleCorrection: false
        };
        const result = engine.run(config);
        const last = result.stateTrace[result.stateTrace.length - 1];
        // Population should split proportionally: Dead_A ~ 1/3, Dead_B ~ 2/3
        expect(last[1]).toBeCloseTo(1 / 3, 1);
        expect(last[2]).toBeCloseTo(2 / 3, 1);
    });

    // ===== Validation =====
    test('15. Validation: negative rate throws', () => {
        const config = threeStateConfig();
        config.transitions[0].rate = -0.1;
        expect(() => engine.run(config)).toThrow(/Negative/i);
    });

    test('16. Validation: no absorbing state warns', () => {
        const config = {
            states: [
                { name: 'A', initial: 0.5 },
                { name: 'B', initial: 0.5 }
            ],
            transitions: [
                { from: 'A', to: 'B', rate: 0.1 },
                { from: 'B', to: 'A', rate: 0.1 }
            ],
            rewards: { A: { cost: 0, qaly: 1 }, B: { cost: 0, qaly: 1 } },
            timeHorizon: 5,
            cycleLength: 1,
            discountRateCosts: 0,
            discountRateOutcomes: 0,
            halfCycleCorrection: false
        };
        const validation = engine.validate(config);
        expect(validation.warnings.length).toBeGreaterThan(0);
        expect(validation.warnings.some(w => /absorbing/i.test(w))).toBe(true);
    });

    test('17. Validation: disconnected states detected', () => {
        const config = {
            states: [
                { name: 'A', initial: 0.5 },
                { name: 'B', initial: 0.5 },
                { name: 'Orphan', initial: 0 },
                { name: 'Dead', initial: 0, absorbing: true }
            ],
            transitions: [
                { from: 'A', to: 'Dead', rate: 0.1 },
                { from: 'B', to: 'Dead', rate: 0.1 }
            ],
            rewards: { A: { cost: 0, qaly: 1 }, B: { cost: 0, qaly: 1 }, Orphan: { cost: 0, qaly: 0 }, Dead: { cost: 0, qaly: 0 } },
            timeHorizon: 5,
            cycleLength: 1,
            discountRateCosts: 0,
            discountRateOutcomes: 0,
            halfCycleCorrection: false
        };
        const validation = engine.validate(config);
        expect(validation.warnings.some(w => /disconnected|Orphan/i.test(w))).toBe(true);
    });

    test('18. Large model (10 states): completes within 2 seconds', () => {
        const states = [];
        for (let i = 0; i < 9; i++) {
            states.push({ name: `S${i}`, initial: i === 0 ? 1.0 : 0 });
        }
        states.push({ name: 'Dead', initial: 0, absorbing: true });

        const transitions = [];
        for (let i = 0; i < 9; i++) {
            // Each state transitions to next and to Dead
            if (i < 8) transitions.push({ from: `S${i}`, to: `S${i + 1}`, rate: 0.1 });
            transitions.push({ from: `S${i}`, to: 'Dead', rate: 0.02 });
        }

        const rewards = {};
        for (let i = 0; i < 9; i++) rewards[`S${i}`] = { cost: 100 * (i + 1), qaly: 0.9 - i * 0.1 };
        rewards['Dead'] = { cost: 0, qaly: 0 };

        const config = {
            states, transitions, rewards,
            timeHorizon: 30,
            cycleLength: 1,
            discountRateCosts: 0.035,
            discountRateOutcomes: 0.035,
            halfCycleCorrection: false
        };

        const start = Date.now();
        const result = engine.run(config);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(2000);
        expect(result.totalCosts).toBeGreaterThan(0);
        expect(result.stateTrace.length).toBe(31);
    });

    test('19. Determinism: same config produces same results', () => {
        const config = fourStateConfig();
        const r1 = engine.run(config);
        const r2 = engine.run(config);
        expect(r1.totalCosts).toBe(r2.totalCosts);
        expect(r1.totalQalys).toBe(r2.totalQalys);
        expect(r1.stateTrace).toEqual(r2.stateTrace);
    });

    // ===== Matrix utilities =====
    test('20. matMul: identity * A = A', () => {
        const I = identityMatrix(3);
        const A = [
            new Float64Array([1, 2, 3]),
            new Float64Array([4, 5, 6]),
            new Float64Array([7, 8, 9])
        ];
        const R = matMul(I, A);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                expect(R[i][j]).toBeCloseTo(A[i][j], 10);
            }
        }
    });

    test('21. 4-state model: per-cycle data has correct length', () => {
        const result = engine.run(fourStateConfig());
        expect(result.perCycle.length).toBe(20);
        expect(result.perCycle[0].cycle).toBe(1);
        expect(result.perCycle[19].cycle).toBe(20);
    });

    test('22. Transition rate matrix Q: diagonal equals negative row sum', () => {
        const config = threeStateConfig();
        const Q = engine.transitionMatrix(config.transitions, config.states);
        for (let i = 0; i < Q.length; i++) {
            let offDiagSum = 0;
            for (let j = 0; j < Q[i].length; j++) {
                if (j !== i) offDiagSum += Q[i][j];
            }
            expect(Q[i][i]).toBeCloseTo(-offDiagSum, 10);
        }
    });

    test('23. No rewards: costs and QALYs are zero', () => {
        const config = threeStateConfig();
        config.rewards = {};
        const result = engine.run(config);
        expect(result.totalCosts).toBeCloseTo(0, 10);
        expect(result.totalQalys).toBeCloseTo(0, 10);
    });

    test('24. Validation rejects initial probabilities not summing to 1', () => {
        const config = threeStateConfig();
        config.states[0].initial = 0.5;
        // Now sums to 0.5 instead of 1.0
        const validation = engine.validate(config);
        expect(validation.valid).toBe(false);
        expect(validation.errors.some(e => /initial/i.test(e) || /sum/i.test(e))).toBe(true);
    });

    test('25. CycleLength < 1: finer time steps work correctly', () => {
        const config = threeStateConfig({ cycleLength: 0.25, timeHorizon: 5 });
        const result = engine.run(config);
        // 5 / 0.25 = 20 cycles
        expect(result.perCycle.length).toBe(20);
        // State trace sums to 1
        for (const occ of result.stateTrace) {
            const sum = occ.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 8);
        }
    });
});
