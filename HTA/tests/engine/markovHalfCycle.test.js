/**
 * Within-cycle (half-cycle) correction conventions of the Markov engine.
 *
 * Requirement (convention-free): a cohort that never leaves a state with utility 1, followed for a time horizon T,
 * accrues exactly T life-years / QALYs under every correction method, for any cycle length.
 * Requirement (documented options "start-of-cycle" / "end-of-cycle" / "trapezoidal"): with N cycles,
 *   start = sum_{t=0}^{N-1} v.p_t d(t),  end = sum_{t=1}^{N} v.p_t d(t),  trapezoidal = 0.5 v.p_0 + ... + 0.5 v.p_N d(N),
 *   d(t) = (1 + r)^-(t * cycle length). "none" = no correction, counted at the start of each cycle (same as start).
 * Reference values for the 2-state case (p_death = 0.1, 3 cycles, r = 0) equal heemod 1.1.0 run_model() with
 * method = "beginning" (2.71), "end" (2.439) and "life-table" (2.5745).
 */
'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { ExpressionParser } = require('../../src/parser/expression');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.ExpressionParser = ExpressionParser;

const { MarkovEngine } = require('../../src/engine/markov');

const quiet = { warn: () => {} };

function immortal(method, cycleLength, rate) {
    return {
        settings: { time_horizon: 10, cycle_length: cycleLength, discount_rate_costs: rate, discount_rate_qalys: rate,
            half_cycle_correction: method },
        parameters: {},
        states: { s: { label: 'Stable', initial_probability: 1, cost: 100, utility: 1 } },
        transitions: { ss: { from: 's', to: 's', probability: 1 } }
    };
}

function twoState(method) {
    return {
        settings: { time_horizon: 3, cycle_length: 1, discount_rate_costs: 0, discount_rate_qalys: 0,
            half_cycle_correction: method },
        parameters: {},
        states: {
            alive: { label: 'Alive', initial_probability: 1, cost: 100, utility: 1 },
            dead: { label: 'Dead', type: 'absorbing', cost: 0, utility: 0 }
        },
        transitions: {
            ad: { from: 'alive', to: 'dead', probability: 0.1 },
            aa: { from: 'alive', to: 'alive', probability: 'complement' },
            dd: { from: 'dead', to: 'dead', probability: 1 }
        }
    };
}

const sum = (from, to, f) => { let s = 0; for (let t = from; t <= to; t++) s += f(t); return s; };

describe('half-cycle correction conventions', () => {
    const engine = new MarkovEngine({ logger: quiet });

    test.each(['none', 'start', 'end', 'trapezoidal'])(
        'immortal cohort over 10 years accrues 10 QALYs and 10 x annual cost (%s)', (method) => {
            for (const cl of [1, 0.5]) {
                const r = engine.run(immortal(method, cl, 0));
                expect(Math.abs(r.total_qalys - 10)).toBeLessThan(1e-12);
                expect(Math.abs(r.total_costs - 1000)).toBeLessThan(1e-10);
            }
        });

    test('discounted start-, end-of-cycle and trapezoidal totals follow the documented time points', () => {
        const d = (t) => Math.pow(1.035, -t);
        const expected = {
            start: sum(0, 9, d),
            none: sum(0, 9, d),
            end: sum(1, 10, d),
            trapezoidal: 0.5 + sum(1, 9, d) + 0.5 * d(10)
        };
        for (const [method, value] of Object.entries(expected)) {
            const r = engine.run(immortal(method, 1, 0.035));
            expect(Math.abs(r.total_qalys - value)).toBeLessThan(1e-12);
        }
    });

    test('two-state cohort matches heemod beginning / end / life-table', () => {
        const ref = { start: 2.71, none: 2.71, end: 2.439, trapezoidal: 2.5745 };
        for (const [method, value] of Object.entries(ref)) {
            const r = engine.run(twoState(method));
            expect(Math.abs(r.total_qalys - value)).toBeLessThan(1e-12);
            expect(Math.abs(r.total_costs - 100 * value)).toBeLessThan(1e-10);
        }
    });
});
