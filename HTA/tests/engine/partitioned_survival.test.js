/**
 * Tests for src/engine/partitioned_survival.js — PartitionedSurvivalEngine
 */

'use strict';

const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');

// Set up globals required by the engine
global.performance = global.performance || performance;
global.KahanSum = KahanSum;

const { PartitionedSurvivalEngine } = require('../../src/engine/partitioned_survival');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal PSM project with Weibull survival curves
 */
function createPSMProject(overrides = {}) {
    return {
        version: '0.1',
        metadata: { id: 'psm-test', name: 'PSM Test Project' },
        model: { type: 'partitioned_survival' },
        settings: {
            time_horizon: 10,
            cycle_length: 1, // Annual cycles for simpler arithmetic
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

describe('PartitionedSurvivalEngine', () => {
    // -----------------------------------------------------------------------
    // 1. Constructor
    // -----------------------------------------------------------------------
    test('creates with default options', () => {
        const engine = new PartitionedSurvivalEngine();

        expect(engine.options.tolerance).toBe(1e-9);
        expect(engine.options.maxCycles).toBe(10000);
    });

    test('accepts custom options', () => {
        const engine = new PartitionedSurvivalEngine({
            tolerance: 1e-6,
            maxCycles: 500
        });

        expect(engine.options.tolerance).toBe(1e-6);
        expect(engine.options.maxCycles).toBe(500);
    });

    // -----------------------------------------------------------------------
    // 2. Basic PSM — 3-state model runs and returns results
    // -----------------------------------------------------------------------
    test('3-state model (PFS/Progressed/Dead) runs and returns results', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.run(project);

        expect(result).toBeDefined();
        expect(result.total_costs).toBeDefined();
        expect(result.total_qalys).toBeDefined();
        expect(result.life_years).toBeDefined();
        expect(result.trace).toBeDefined();
        expect(result.trace.pfs).toBeDefined();
        expect(result.trace.progressed).toBeDefined();
        expect(result.trace.dead).toBeDefined();
        expect(result.computation_time_ms).toBeGreaterThanOrEqual(0);
    });

    // -----------------------------------------------------------------------
    // 3. Survival curves — PFS S(t) <= OS S(t) always (no inversion)
    // -----------------------------------------------------------------------
    test('PFS proportion is always <= OS survival (no curve inversion)', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.run(project);

        for (let i = 0; i < result.trace.pfs.length; i++) {
            // PFS <= OS always (PFS proportion in PFS state is part of alive)
            // OS = PFS + Progressed
            const os = result.trace.os[i];
            const pfs = result.trace.pfs[i];
            expect(pfs).toBeLessThanOrEqual(os + 1e-12);
        }
    });

    // -----------------------------------------------------------------------
    // 4. Costs accumulate — total costs are positive and finite
    // -----------------------------------------------------------------------
    test('total costs are positive and finite', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.run(project);

        expect(result.total_costs).toBeGreaterThan(0);
        expect(Number.isFinite(result.total_costs)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 5. QALYs accumulate — positive, less than time horizon
    // -----------------------------------------------------------------------
    test('total QALYs are positive and bounded by time horizon', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();
        const settings = engine.getSettings(project);

        const result = engine.run(project);

        expect(result.total_qalys).toBeGreaterThan(0);
        // QALYs cannot exceed time_horizon (max utility is 1 per year)
        expect(result.total_qalys).toBeLessThanOrEqual(settings.time_horizon + 1);
        expect(Number.isFinite(result.total_qalys)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 6. Discounting — discounted values <= undiscounted values
    // -----------------------------------------------------------------------
    test('discounted values are less than or equal to undiscounted values', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        // Run with discounting
        const discountedResult = engine.run(project);

        // Run without discounting
        const noDiscountProject = createPSMProject({
            settings: {
                discount_rate_costs: 0,
                discount_rate_qalys: 0
            }
        });
        const undiscountedResult = engine.run(noDiscountProject);

        // Discounted values should be <= undiscounted (positive discount rate reduces present value)
        expect(discountedResult.total_costs).toBeLessThanOrEqual(
            undiscountedResult.total_costs + 1e-6
        );
        expect(discountedResult.total_qalys).toBeLessThanOrEqual(
            undiscountedResult.total_qalys + 1e-6
        );
        expect(discountedResult.life_years).toBeLessThanOrEqual(
            undiscountedResult.life_years + 1e-6
        );
    });

    // -----------------------------------------------------------------------
    // 7. Time horizon — model runs for correct number of cycles
    // -----------------------------------------------------------------------
    test('model runs for correct number of cycles', () => {
        const engine = new PartitionedSurvivalEngine();

        // Test with annual cycles and 10-year horizon
        const project = createPSMProject({
            settings: { time_horizon: 10, cycle_length: 1 }
        });
        const result = engine.run(project);

        // Cycles = ceil(time_horizon / cycle_length)
        expect(result.cycles).toBe(10);
        // Trace includes cycle 0 through cycle N => N+1 entries
        expect(result.trace.cycles).toHaveLength(11);
        expect(result.trace.cycles[0]).toBe(0);
        expect(result.trace.cycles[10]).toBe(10);
    });

    test('model respects different cycle lengths', () => {
        const engine = new PartitionedSurvivalEngine();

        // Monthly cycles over 2 years
        const project = createPSMProject({
            settings: { time_horizon: 2, cycle_length: 1 / 12 }
        });
        const result = engine.run(project);

        expect(result.cycles).toBe(24);
        expect(result.trace.cycles).toHaveLength(25);
    });

    // -----------------------------------------------------------------------
    // 8. State proportions sum to 1 at each cycle
    // -----------------------------------------------------------------------
    test('state proportions (PFS + Progressed + Dead) sum to 1 at each cycle', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.run(project);

        for (let i = 0; i < result.trace.pfs.length; i++) {
            const total = result.trace.pfs[i] + result.trace.progressed[i] + result.trace.dead[i];
            expect(total).toBeCloseTo(1, 10);
        }
    });

    // -----------------------------------------------------------------------
    // 9. HR modifier — HR < 1 increases PFS/OS
    // -----------------------------------------------------------------------
    test('applying HR < 1 increases OS and PFS survival', () => {
        const engine = new PartitionedSurvivalEngine();

        // Baseline: HR = 1
        const baseProject = createPSMProject();
        const baseResult = engine.run(baseProject);

        // Intervention: HR < 1 (better survival)
        const hrProject = createPSMProject({
            parameters: {
                os_hr: { value: 0.7 },
                pfs_hr: { value: 0.7 }
            }
        });
        const hrResult = engine.run(hrProject);

        // With HR < 1, OS and PFS should be higher at each cycle (beyond cycle 0)
        for (let i = 1; i < baseResult.trace.os.length; i++) {
            expect(hrResult.trace.os[i]).toBeGreaterThanOrEqual(baseResult.trace.os[i] - 1e-12);
        }

        // QALYs and life years should be higher with HR < 1
        expect(hrResult.total_qalys).toBeGreaterThan(baseResult.total_qalys);
        expect(hrResult.life_years).toBeGreaterThan(baseResult.life_years);
    });

    // -----------------------------------------------------------------------
    // 10. Edge cases
    // -----------------------------------------------------------------------
    test('single cycle model runs without error', () => {
        const engine = new PartitionedSurvivalEngine();

        const project = createPSMProject({
            settings: { time_horizon: 1, cycle_length: 1 }
        });
        const result = engine.run(project);

        expect(result.cycles).toBe(1);
        expect(result.trace.cycles).toHaveLength(2); // cycle 0 and cycle 1
        expect(Number.isFinite(result.total_costs)).toBe(true);
        expect(Number.isFinite(result.total_qalys)).toBe(true);
    });

    test('very high hazard leads to near-immediate death', () => {
        const engine = new PartitionedSurvivalEngine();

        // Weibull with very small scale = very high hazard (rapid death)
        const project = createPSMProject({
            parameters: {
                os_params: { value: { scale: 0.01, shape: 1.0 } },
                pfs_params: { value: { scale: 0.005, shape: 1.0 } }
            }
        });
        const result = engine.run(project);

        // By cycle 1, nearly everyone should be dead
        const deadAtCycle1 = result.trace.dead[1];
        expect(deadAtCycle1).toBeGreaterThan(0.99);

        // QALYs and life years should be very small
        expect(result.total_qalys).toBeLessThan(1);
        // Life years accumulate OS*cycle_length; with near-instant death and
        // cycle 0 always contributing S(0)=1, life_years may slightly exceed 1
        expect(result.life_years).toBeLessThan(2);
    });

    // -----------------------------------------------------------------------
    // Additional: survival function builders
    // -----------------------------------------------------------------------
    test('Weibull survival is 1 at t=0 and decreasing', () => {
        const engine = new PartitionedSurvivalEngine();
        const survFn = engine.buildSurvivalFunction('weibull', { scale: 10, shape: 1.5 });

        expect(survFn(0)).toBe(1);
        expect(survFn(1)).toBeLessThan(1);
        expect(survFn(5)).toBeLessThan(survFn(1));
        expect(survFn(10)).toBeLessThan(survFn(5));
        expect(survFn(100)).toBeGreaterThanOrEqual(0);
    });

    test('exponential survival decays correctly', () => {
        const engine = new PartitionedSurvivalEngine();
        const rate = 0.1;
        const survFn = engine.buildSurvivalFunction('exponential', { rate });

        expect(survFn(0)).toBe(1);
        // S(t) = exp(-rate*t)
        expect(survFn(1)).toBeCloseTo(Math.exp(-rate), 10);
        expect(survFn(10)).toBeCloseTo(Math.exp(-rate * 10), 10);
    });

    test('log-logistic survival has correct shape', () => {
        const engine = new PartitionedSurvivalEngine();
        const survFn = engine.buildSurvivalFunction('loglogistic', { scale: 10, shape: 2 });

        expect(survFn(0)).toBe(1);
        // S(t) = 1 / (1 + (t/scale)^shape) at t=scale: S = 0.5
        expect(survFn(10)).toBeCloseTo(0.5, 5);
        expect(survFn(100)).toBeLessThan(0.01);
    });

    test('gompertz survival works with positive and zero shape', () => {
        const engine = new PartitionedSurvivalEngine();

        // Positive shape
        const survFn = engine.buildSurvivalFunction('gompertz', { shape: 0.05, rate: 0.02 });
        expect(survFn(0)).toBe(1);
        expect(survFn(10)).toBeLessThan(1);
        expect(survFn(10)).toBeGreaterThan(0);

        // Zero shape (should behave like exponential)
        const survFnZero = engine.buildSurvivalFunction('gompertz', { shape: 0, rate: 0.1 });
        expect(survFnZero(0)).toBe(1);
        expect(survFnZero(5)).toBeCloseTo(Math.exp(-0.1 * 5), 5);
    });

    // -----------------------------------------------------------------------
    // Additional: getDiscountFactor
    // -----------------------------------------------------------------------
    test('getDiscountFactor matches expected values', () => {
        const engine = new PartitionedSurvivalEngine();

        expect(engine.getDiscountFactor(0, 1, 0.035)).toBe(1);
        expect(engine.getDiscountFactor(1, 1, 0)).toBe(1);
        expect(engine.getDiscountFactor(1, 1, 0.035)).toBeCloseTo(1 / 1.035, 10);
        expect(engine.getDiscountFactor(5, 1, 0.035)).toBeCloseTo(Math.pow(1.035, -5), 10);
    });

    // -----------------------------------------------------------------------
    // Additional: comparative analysis
    // -----------------------------------------------------------------------
    test('runComparative calculates ICER and incremental outcomes', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.runComparative(
            project,
            { os_hr: 0.7, pfs_hr: 0.7, c_pfs: 10000 },  // Intervention: better survival, higher cost
            { os_hr: 1.0, pfs_hr: 1.0 }                    // Comparator: baseline
        );

        expect(result.intervention).toBeDefined();
        expect(result.comparator).toBeDefined();
        expect(result.incremental).toBeDefined();
        expect(Number.isFinite(result.incremental.costs)).toBe(true);
        expect(Number.isFinite(result.incremental.qalys)).toBe(true);
        expect(result.incremental.qalys).toBeGreaterThan(0); // HR < 1 should yield more QALYs
    });

    // -----------------------------------------------------------------------
    // Additional: extrapolation info and median survival
    // -----------------------------------------------------------------------
    test('extrapolation info includes median survival and RMST', () => {
        const engine = new PartitionedSurvivalEngine();
        const project = createPSMProject();

        const result = engine.run(project);

        expect(result.extrapolation_info).toBeDefined();
        expect(result.extrapolation_info.survival_at_timepoints).toBeDefined();
        expect(result.extrapolation_info.rmst_os).toBeGreaterThan(0);
        expect(result.extrapolation_info.rmst_pfs).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Additional: resolveParameters with overrides
    // -----------------------------------------------------------------------
    test('resolveParameters applies overrides correctly', () => {
        const engine = new PartitionedSurvivalEngine();

        const params = {
            a: { value: 10 },
            b: { value: 20 }
        };

        const resolved = engine.resolveParameters(params, { b: 99, c: 42 });

        expect(resolved.a).toBe(10);
        expect(resolved.b).toBe(99);
        expect(resolved.c).toBe(42);
    });

    // -----------------------------------------------------------------------
    // Additional: half-cycle correction
    // -----------------------------------------------------------------------
    test('trapezoidal half-cycle correction reduces totals compared to no correction', () => {
        const engine = new PartitionedSurvivalEngine();

        const noneProject = createPSMProject({
            settings: { half_cycle_correction: 'none' }
        });
        const trapProject = createPSMProject({
            settings: { half_cycle_correction: 'trapezoidal' }
        });

        const noneResult = engine.run(noneProject);
        const trapResult = engine.run(trapProject);

        // Trapezoidal correction halves the first and last cycle contributions,
        // so totals should be slightly less
        expect(trapResult.total_qalys).toBeLessThan(noneResult.total_qalys);
        expect(trapResult.life_years).toBeLessThan(noneResult.life_years);
    });
});
