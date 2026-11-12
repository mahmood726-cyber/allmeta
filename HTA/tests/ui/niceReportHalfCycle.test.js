/**
 * The NICE report must state the within-cycle convention the engine actually used.
 *
 * Requirement: MarkovEngine.getSettings() runs `half_cycle_correction || 'trapezoidal'` (src/engine/markov.js), and
 * only 'trapezoidal' is a half-cycle correction; 'start' / 'none' count at the start of each cycle and 'end' at the
 * end, with no correction. So the report must say APPLIED only when the engine applies the trapezoidal rule
 * (including when the setting is absent), and must never say APPLIED for 'none'.
 * Before the fix the report tested string truthiness ('none' -> "APPLIED", unset -> "NOT APPLIED" and "None").
 */

'use strict';

global.HTAValidator = class { _validateProjectObject() { return { valid: true, errors: [], warnings: [], infos: [] }; } };
global.MarkovEngine = class { runAllStrategies() { return { strategies: {}, incremental: null }; } };
global.PSAEngine = class { onProgress() {} async run() { return {}; } };
global.Chart = jest.fn(() => ({ destroy: jest.fn(), update: jest.fn() }));
Chart.defaults = { color: '', borderColor: '' };
Chart.instances = {};

const { HTAApp } = require('../../src/ui/app');

function report(setting) {
    const app = Object.create(HTAApp.prototype);
    const settings = { time_horizon: 10, cycle_length: 1, discount_rate_costs: 0.035, discount_rate_qalys: 0.035 };
    if (setting !== undefined) settings.half_cycle_correction = setting;
    app.project = { metadata: {}, settings, states: {}, parameters: {} };
    app.validationResults = null;
    app.results = null;
    app.psaResults = null;
    app.evpiResults = null;
    return app.generateNICEReport();
}

function lines(text) {
    return text.split('\n').filter(l => l.startsWith('Half-Cycle Correction:'));
}

describe('NICE report: half-cycle correction wording', () => {
    test("'none' is reported as not applied", () => {
        const ls = lines(report('none'));
        expect(ls.length).toBeGreaterThan(0);
        for (const l of ls) expect(l).not.toMatch(/: APPLIED/);
        expect(ls.join('\n')).toMatch(/NOT APPLIED/);
    });

    test("'start' and 'end' are reported as not applied, with the convention named", () => {
        for (const m of ['start', 'end']) {
            const ls = lines(report(m));
            for (const l of ls) expect(l).not.toMatch(/: APPLIED/);
            expect(ls.join('\n')).toMatch(m === 'start' ? /start of each cycle/ : /end of each cycle/);
        }
    });

    test("'trapezoidal' is reported as applied", () => {
        const ls = lines(report('trapezoidal'));
        expect(ls.join('\n')).toMatch(/: APPLIED \(trapezoidal/);
        for (const l of ls) expect(l).not.toMatch(/NOT APPLIED/);
    });

    test('an absent setting is reported as the engine default (trapezoidal, applied)', () => {
        const ls = lines(report(undefined));
        expect(ls.length).toBe(2);
        for (const l of ls) expect(l).toMatch(/trapezoidal/);
        for (const l of ls) expect(l).not.toMatch(/NOT APPLIED|: None/);
    });
});
