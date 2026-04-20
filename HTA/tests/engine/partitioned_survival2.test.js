/**
 * Additional tests for src/engine/partitioned_survival.js
 * Targeting uncovered lines: 272-376 (genGammaSurvival, normalCDF,
 *   gammaIncompleteCDF, gammaIncompleteUpperCDF, logGamma),
 *   532-602 (comparative ICER/dominance, fitDistributions, initialGuess)
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');

global.performance = global.performance || performance;
global.KahanSum = KahanSum;

const { PartitionedSurvivalEngine } = require('../../src/engine/partitioned_survival');

function createPSMProject(overrides = {}) {
    return {
        version: '0.1',
        metadata: { id: 'psm-test', name: 'PSM Test' },
        model: { type: 'partitioned_survival' },
        settings: {
            time_horizon: 10,
            cycle_length: 1,
            discount_rate_costs: 0.035,
            discount_rate_qalys: 0.035,
            half_cycle_correction: 'none',
            starting_age: 60,
            ...(overrides.settings || {})
        },
        parameters: {
            os_distribution: { value: 'weibull' },
            os_params: { value: { scale: 15, shape: 1.2 } },
            os_hr: { value: 1.0 },
            pfs_distribution: { value: 'weibull' },
            pfs_params: { value: { scale: 8, shape: 1.0 } },
            pfs_hr: { value: 1.0 },
            c_pfs: { value: 5000 },
            c_progressed: { value: 8000 },
            c_death: { value: 2000 },
            u_pfs: { value: 0.8 },
            u_progressed: { value: 0.5 },
            ...(overrides.parameters || {})
        }
    };
}

// ---------------------------------------------------------------------------
// Generalized gamma survival (lines 272-293)
// ---------------------------------------------------------------------------

describe('PartitionedSurvivalEngine genGammaSurvival', () => {
    const engine = new PartitionedSurvivalEngine();

    test('returns 1 at t=0', () => {
        expect(engine.genGammaSurvival(0, 2, 0.5, 0.5)).toBe(1);
    });

    test('Q > 0 branch returns value in (0, 1)', () => {
        const s = engine.genGammaSurvival(5, 2, 0.5, 0.5);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });

    test('Q < 0 branch returns value in (0, 1)', () => {
        const s = engine.genGammaSurvival(5, 2, 0.5, -0.5);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });

    test('Q = 0 (log-normal) branch returns value in (0, 1)', () => {
        const s = engine.genGammaSurvival(5, 2, 0.5, 0);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });

    test('HR < 1 increases survival', () => {
        const sBase = engine.genGammaSurvival(10, 2, 0.5, 0.5, 1.0);
        const sHR = engine.genGammaSurvival(10, 2, 0.5, 0.5, 0.5);
        expect(sHR).toBeGreaterThan(sBase);
    });
});

// ---------------------------------------------------------------------------
// Math helper functions (lines 298-377)
// ---------------------------------------------------------------------------

describe('PartitionedSurvivalEngine math helpers', () => {
    const engine = new PartitionedSurvivalEngine();

    test('normalCDF returns 0.5 at 0', () => {
        expect(engine.normalCDF(0)).toBeCloseTo(0.5, 4);
    });

    test('normalCDF boundary values', () => {
        expect(engine.normalCDF(-5)).toBeLessThan(0.01);
        expect(engine.normalCDF(5)).toBeGreaterThan(0.99);
    });

    test('gammaIncompleteCDF returns 0 for x <= 0', () => {
        expect(engine.gammaIncompleteCDF(2, 0)).toBe(0);
        expect(engine.gammaIncompleteCDF(2, -1)).toBe(0);
    });

    test('gammaIncompleteCDF series branch (x < a+1)', () => {
        const val = engine.gammaIncompleteCDF(5, 3);
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThan(1);
    });

    test('gammaIncompleteCDF continued fraction branch (x >= a+1)', () => {
        const val = engine.gammaIncompleteCDF(2, 10);
        expect(val).toBeGreaterThan(0.9);
        expect(val).toBeLessThanOrEqual(1);
    });

    test('logGamma returns finite values', () => {
        expect(Number.isFinite(engine.logGamma(1))).toBe(true);
        expect(Number.isFinite(engine.logGamma(5))).toBe(true);
        expect(Number.isFinite(engine.logGamma(0.5))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Comparative analysis ICER/dominance (lines 525-555)
// ---------------------------------------------------------------------------

describe('PartitionedSurvivalEngine comparative dominance', () => {
    test('dominant when intervention cheaper and more effective', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        // Intervention: better survival AND lower cost
        const result = engine.runComparative(
            project,
            { os_hr: 0.5, pfs_hr: 0.5, c_pfs: 3000 },  // better and cheaper
            { os_hr: 1.0, pfs_hr: 1.0, c_pfs: 5000 }
        );

        expect(result.incremental).toBeDefined();
        expect(result.incremental.qalys).toBeGreaterThan(0);
    });

    test('dominated when intervention more expensive and less effective', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        // Intervention: worse survival AND higher cost
        const result = engine.runComparative(
            project,
            { os_hr: 2.0, pfs_hr: 2.0, c_pfs: 20000 },
            { os_hr: 1.0, pfs_hr: 1.0, c_pfs: 5000 }
        );

        expect(result.incremental).toBeDefined();
        expect(result.incremental.qalys).toBeLessThan(0);
    });

    test('NMB at multiple WTP thresholds computed', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.runComparative(
            project,
            { os_hr: 0.7, pfs_hr: 0.7, c_pfs: 10000 },
            { os_hr: 1.0, pfs_hr: 1.0 }
        );

        expect(Number.isFinite(result.incremental.nmb_20k)).toBe(true);
        expect(Number.isFinite(result.incremental.nmb_30k)).toBe(true);
        expect(Number.isFinite(result.incremental.nmb_50k)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// fitDistributions / initialGuess (lines 561-604)
// ---------------------------------------------------------------------------

describe('PartitionedSurvivalEngine fitDistributions', () => {
    test('fitDistributions returns fits for all requested distributions', () => {
        const engine = new PartitionedSurvivalEngine();
        const kmData = { median: 12 };

        const result = engine.fitDistributions(kmData, ['weibull', 'exponential', 'lognormal']);

        expect(result.distributions.weibull).toBeDefined();
        expect(result.distributions.exponential).toBeDefined();
        expect(result.distributions.lognormal).toBeDefined();
        expect(result.recommendation).toBeDefined();
    });

    test('initialGuess returns parameters for each distribution type', () => {
        const engine = new PartitionedSurvivalEngine();
        const kmData = { median: 10 };

        const weibull = engine.initialGuess('weibull', kmData);
        expect(weibull.scale).toBeDefined();
        expect(weibull.shape).toBeDefined();

        const exp = engine.initialGuess('exponential', kmData);
        expect(exp.rate).toBeGreaterThan(0);

        const ln = engine.initialGuess('lognormal', kmData);
        expect(ln.meanlog).toBeDefined();
        expect(ln.sdlog).toBeGreaterThan(0);

        const ll = engine.initialGuess('loglogistic', kmData);
        expect(ll.scale).toBeDefined();
        expect(ll.shape).toBeDefined();

        const gomp = engine.initialGuess('gompertz', kmData);
        expect(gomp.shape).toBeDefined();
        expect(gomp.rate).toBeGreaterThan(0);

        // Unknown distribution gets default
        const unk = engine.initialGuess('unknown_dist', kmData);
        expect(unk.scale).toBeDefined();
    });
});
