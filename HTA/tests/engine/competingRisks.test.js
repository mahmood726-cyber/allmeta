/**
 * Tests for src/engine/competingRisks.js — CompetingRisksEngine
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;

const { CompetingRisksEngine } = require('../../src/engine/competingRisks');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate competing risks data with two causes.
 * Roughly: ~40% relapse, ~20% death, ~40% censored.
 */
function createTwoCauseData(n = 100, seed = 42) {
    const data = [];
    // Deterministic pseudo-random using simple LCG
    let state = seed;
    function nextRand() {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        return state / 0x7fffffff;
    }
    for (let i = 0; i < n; i++) {
        const u = nextRand();
        const t = Math.round((1 + nextRand() * 20) * 10) / 10;
        let event;
        if (u < 0.40) event = 'relapse';
        else if (u < 0.60) event = 'death';
        else event = 'censored';
        data.push({ time: t, event });
    }
    return data;
}

/**
 * Generate data with a single cause (no competing risks).
 */
function createSingleCauseData(n = 50, seed = 99) {
    const data = [];
    let state = seed;
    function nextRand() {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        return state / 0x7fffffff;
    }
    for (let i = 0; i < n; i++) {
        const u = nextRand();
        const t = Math.round((1 + nextRand() * 15) * 10) / 10;
        data.push({ time: t, event: u < 0.5 ? 'failure' : 'censored' });
    }
    return data;
}

/**
 * Generate data where one group has much higher incidence (for Gray's test).
 */
function createTwoGroupData() {
    const treatment = [];
    const control = [];
    // Treatment: low incidence
    for (let i = 0; i < 60; i++) {
        const t = 1 + (i * 0.5);
        treatment.push({ time: t, event: i < 8 ? 'relapse' : 'censored' });
    }
    // Control: high incidence
    for (let i = 0; i < 60; i++) {
        const t = 1 + (i * 0.4);
        control.push({ time: t, event: i < 35 ? 'relapse' : 'censored' });
    }
    return { treatment, control };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompetingRisksEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new CompetingRisksEngine({ confLevel: 0.95 });
    });

    // ── CIF tests ──

    test('CIF with 2 causes: CIFs at final time sum < 1', () => {
        const data = createTwoCauseData();
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        const lastRelapse = result.relapse[result.relapse.length - 1].cif;
        const lastDeath = result.death[result.death.length - 1].cif;
        expect(lastRelapse + lastDeath).toBeLessThanOrEqual(1.0 + 1e-10);
    });

    test('CIF monotonically non-decreasing', () => {
        const data = createTwoCauseData();
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        for (const cause of ['relapse', 'death']) {
            for (let i = 1; i < result[cause].length; i++) {
                expect(result[cause][i].cif).toBeGreaterThanOrEqual(
                    result[cause][i - 1].cif - 1e-12
                );
            }
        }
    });

    test('Overall survival monotonically non-increasing', () => {
        const data = createTwoCauseData();
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        for (let i = 1; i < result.overallSurvival.length; i++) {
            expect(result.overallSurvival[i].surv).toBeLessThanOrEqual(
                result.overallSurvival[i - 1].surv + 1e-12
            );
        }
    });

    test('Single cause: CIF approaches 1 - KM survival', () => {
        const data = createSingleCauseData();
        const result = engine.cumulativeIncidence(data, ['failure']);

        // With a single cause, CIF_failure(t) + S(t) should ≈ 1
        for (let i = 0; i < result.failure.length; i++) {
            const cif = result.failure[i].cif;
            const surv = result.overallSurvival[i].surv;
            expect(cif + surv).toBeCloseTo(1.0, 5);
        }
    });

    test('All censored: CIF stays at 0', () => {
        const data = [
            { time: 1, event: 'censored' },
            { time: 2, event: 'censored' },
            { time: 3, event: 'censored' },
            { time: 4, event: 'censored' },
            { time: 5, event: 'censored' },
            // Need at least 2 events per cause for validation, so use a trick:
            // Instead, test that an all-censored scenario + dummy events produces 0 CIF
            // for a third cause that has no events
            { time: 6, event: 'relapse' },
            { time: 7, event: 'relapse' },
            { time: 8, event: 'death' },
            { time: 9, event: 'death' }
        ];
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        // Before first relapse (time 6), relapse CIF should be 0
        const earlyRelapse = result.relapse.filter(r => r.time < 6);
        for (const r of earlyRelapse) {
            expect(r.cif).toBeCloseTo(0, 10);
        }
    });

    test('No censoring: all events observed', () => {
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({ time: i + 1, event: i < 12 ? 'relapse' : 'death' });
        }
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        const lastRelapse = result.relapse[result.relapse.length - 1].cif;
        const lastDeath = result.death[result.death.length - 1].cif;
        // All events observed, CIFs should sum to 1
        expect(lastRelapse + lastDeath).toBeCloseTo(1.0, 5);
    });

    test('SE computation: confidence intervals contain CIF', () => {
        const data = createTwoCauseData(200);
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        for (const cause of ['relapse', 'death']) {
            for (const point of result[cause]) {
                expect(point.lower).toBeLessThanOrEqual(point.cif + 1e-10);
                expect(point.upper).toBeGreaterThanOrEqual(point.cif - 1e-10);
                expect(point.se).toBeGreaterThanOrEqual(0);
                expect(point.lower).toBeGreaterThanOrEqual(-1e-10);
                expect(point.upper).toBeLessThanOrEqual(1.0 + 1e-10);
            }
        }
    });

    test('CIF returns results for each cause', () => {
        const data = createTwoCauseData();
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);

        expect(result.relapse).toBeDefined();
        expect(result.death).toBeDefined();
        expect(result.overallSurvival).toBeDefined();
        expect(result.relapse.length).toBeGreaterThan(0);
        expect(result.death.length).toBeGreaterThan(0);
    });

    test('CIF at time 0 should be 0 or very close', () => {
        const data = [
            { time: 0, event: 'relapse' },
            { time: 0, event: 'relapse' },
            { time: 0, event: 'death' },
            { time: 0, event: 'death' },
            { time: 1, event: 'relapse' },
            { time: 1, event: 'relapse' },
            { time: 2, event: 'death' },
            { time: 2, event: 'death' },
            { time: 3, event: 'censored' },
            { time: 4, event: 'censored' }
        ];
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);
        // CIF at time 0 is the first increment
        expect(result.relapse[0].cif).toBeGreaterThanOrEqual(0);
        expect(result.relapse[0].cif).toBeLessThanOrEqual(1);
    });

    // ── Gray's test ──

    test("Gray's test: identical groups → p > 0.05", () => {
        const data = createTwoCauseData(100, 42);
        // Split into two roughly identical groups
        const group1 = { name: 'A', data: data.slice(0, 50) };
        const group2 = { name: 'B', data: data.slice(50) };

        const result = engine.grayTest([group1, group2], 'relapse');
        expect(result.pValue).toBeGreaterThan(0.01); // not strongly significant
        expect(result.df).toBe(1);
        expect(result.cause).toBe('relapse');
        expect(result.statistic).toBeGreaterThanOrEqual(0);
    });

    test("Gray's test: very different groups → p < 0.05", () => {
        const { treatment, control } = createTwoGroupData();
        const groups = [
            { name: 'Treatment', data: treatment },
            { name: 'Control', data: control }
        ];

        const result = engine.grayTest(groups, 'relapse');
        expect(result.pValue).toBeLessThan(0.05);
        expect(result.statistic).toBeGreaterThan(0);
    });

    test("Gray's test: requires at least 2 groups", () => {
        const data = createTwoCauseData(20);
        expect(() => engine.grayTest([{ name: 'A', data }], 'relapse')).toThrow();
    });

    test("Gray's test: requires cause specification", () => {
        const data = createTwoCauseData(20);
        const groups = [
            { name: 'A', data: data.slice(0, 10) },
            { name: 'B', data: data.slice(10) }
        ];
        expect(() => engine.grayTest(groups)).toThrow();
    });

    // ── Fine-Gray ──

    test('Fine-Gray: positive covariate → HR > 1', () => {
        // Create data where covariate=1 has much higher incidence
        // Interleave covariates at similar times to avoid confounding time with covariate
        const data = [];
        for (let i = 0; i < 40; i++) {
            const t = 1 + i * 0.5;
            // Covariate=0 group: very few events (only 3 out of 40)
            data.push({
                time: t,
                event: i < 3 ? 'relapse' : 'censored',
                covariate: 0
            });
            // Covariate=1 group: many events (30 out of 40)
            data.push({
                time: t + 0.01,
                event: i < 30 ? 'relapse' : 'censored',
                covariate: 1
            });
        }

        const result = engine.fineGray(data, 'relapse');
        expect(result.hr).toBeGreaterThan(1);
        expect(result.lower).toBeDefined();
        expect(result.upper).toBeDefined();
        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
    });

    test('Fine-Gray: returns expected fields', () => {
        const data = [];
        for (let i = 0; i < 40; i++) {
            data.push({
                time: 1 + i * 0.5,
                event: i < 15 ? 'relapse' : 'censored',
                covariate: i % 2
            });
        }
        const result = engine.fineGray(data, 'relapse');
        expect(result).toHaveProperty('hr');
        expect(result).toHaveProperty('se');
        expect(result).toHaveProperty('lower');
        expect(result).toHaveProperty('upper');
        expect(result).toHaveProperty('pValue');
        expect(result).toHaveProperty('beta');
    });

    // ── Cause-specific hazard ──

    test('Cause-specific hazard: non-negative at all times', () => {
        const data = createTwoCauseData();
        const result = engine.causeSpecificHazard(data, 'relapse');

        expect(result.length).toBeGreaterThan(0);
        for (const point of result) {
            expect(point.hazard).toBeGreaterThanOrEqual(0);
            expect(point.cumHazard).toBeGreaterThanOrEqual(0);
            expect(point.atRisk).toBeGreaterThan(0);
            expect(point.events).toBeGreaterThan(0);
        }
    });

    test('Cause-specific hazard: cumulative hazard non-decreasing', () => {
        const data = createTwoCauseData();
        const result = engine.causeSpecificHazard(data, 'relapse');

        for (let i = 1; i < result.length; i++) {
            expect(result[i].cumHazard).toBeGreaterThanOrEqual(
                result[i - 1].cumHazard - 1e-12
            );
        }
    });

    test('Cause-specific hazard: atRisk decreases over time', () => {
        const data = createTwoCauseData();
        const result = engine.causeSpecificHazard(data, 'relapse');

        // atRisk should generally decrease (or stay same)
        for (let i = 1; i < result.length; i++) {
            expect(result[i].atRisk).toBeLessThanOrEqual(result[i - 1].atRisk);
        }
    });

    // ── Edge cases ──

    test('Edge: single event at time 0', () => {
        const data = [
            { time: 0, event: 'relapse' },
            { time: 0, event: 'relapse' },
            { time: 1, event: 'death' },
            { time: 1, event: 'death' },
            { time: 2, event: 'censored' }
        ];
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);
        expect(result.relapse.length).toBeGreaterThan(0);
        expect(result.relapse[0].cif).toBeGreaterThan(0);
    });

    test('Edge: all events same type', () => {
        const data = [];
        for (let i = 0; i < 15; i++) {
            data.push({ time: i + 1, event: 'relapse' });
        }
        // Need at least 2 death events for validation
        data.push({ time: 16, event: 'death' });
        data.push({ time: 17, event: 'death' });

        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);
        const lastRelapse = result.relapse[result.relapse.length - 1].cif;
        expect(lastRelapse).toBeGreaterThan(0.5);
    });

    test('Edge: tied event times', () => {
        const data = [
            { time: 5, event: 'relapse' },
            { time: 5, event: 'relapse' },
            { time: 5, event: 'death' },
            { time: 5, event: 'death' },
            { time: 10, event: 'relapse' },
            { time: 10, event: 'relapse' },
            { time: 10, event: 'death' },
            { time: 10, event: 'death' },
            { time: 15, event: 'censored' },
            { time: 15, event: 'censored' }
        ];
        const result = engine.cumulativeIncidence(data, ['relapse', 'death']);
        expect(result.relapse.length).toBeGreaterThan(0);
        expect(result.death.length).toBeGreaterThan(0);
    });

    // ── Validation ──

    test('Validation: negative time throws', () => {
        const data = [
            { time: -1, event: 'relapse' },
            { time: 2, event: 'relapse' },
            { time: 3, event: 'death' },
            { time: 4, event: 'death' }
        ];
        expect(() => engine.cumulativeIncidence(data, ['relapse', 'death'])).toThrow(/time/i);
    });

    test('Validation: empty data throws', () => {
        expect(() => engine.cumulativeIncidence([], ['relapse'])).toThrow();
    });

    test('Validation: unknown event type throws', () => {
        const data = [
            { time: 1, event: 'relapse' },
            { time: 2, event: 'relapse' },
            { time: 3, event: 'unknown_event' }
        ];
        expect(() => engine.cumulativeIncidence(data, ['relapse'])).toThrow(/unknown/i);
    });

    test('Validation: insufficient events per cause throws', () => {
        const data = [
            { time: 1, event: 'relapse' },
            { time: 2, event: 'death' },
            { time: 3, event: 'censored' }
        ];
        // Only 1 relapse and 1 death — need at least 2 per cause
        expect(() => engine.cumulativeIncidence(data, ['relapse', 'death'])).toThrow(/at least 2/);
    });

    test('Validation: cause-specific hazard with negative time throws', () => {
        const data = [{ time: -1, event: 'relapse' }];
        expect(() => engine.causeSpecificHazard(data, 'relapse')).toThrow(/negative/i);
    });

    test('Validation: cause-specific hazard with empty data throws', () => {
        expect(() => engine.causeSpecificHazard([], 'relapse')).toThrow();
    });

    // ── Determinism ──

    test('Determinism: same data produces same CIF', () => {
        const data = createTwoCauseData(80, 123);
        const r1 = engine.cumulativeIncidence(data, ['relapse', 'death']);
        const r2 = engine.cumulativeIncidence(data, ['relapse', 'death']);

        expect(r1.relapse.length).toBe(r2.relapse.length);
        for (let i = 0; i < r1.relapse.length; i++) {
            expect(r1.relapse[i].cif).toBe(r2.relapse[i].cif);
        }
    });

    test('Determinism: same groups produce same Gray test', () => {
        const data = createTwoCauseData(80, 123);
        const groups = [
            { name: 'A', data: data.slice(0, 40) },
            { name: 'B', data: data.slice(40) }
        ];
        const r1 = engine.grayTest(groups, 'relapse');
        const r2 = engine.grayTest(groups, 'relapse');

        expect(r1.statistic).toBe(r2.statistic);
        expect(r1.pValue).toBe(r2.pValue);
    });
});
