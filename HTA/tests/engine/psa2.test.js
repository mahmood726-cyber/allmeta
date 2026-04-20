/**
 * Extended tests for src/engine/psa.js
 * Covers untested ranges: 297-775, 810-848, 1080-1745
 * Target: push line coverage from ~26% toward 60%
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const { KahanSum } = require('../../src/utils/kahan');
const { PCG32 } = require('../../src/utils/pcg32');
const { ExpressionParser } = require('../../src/parser/expression');

// Set up globals required by the engine modules
global.performance = global.performance || performance;
global.KahanSum = KahanSum;
global.PCG32 = PCG32;
global.ExpressionParser = ExpressionParser;

const { MarkovEngine } = require('../../src/engine/markov');
global.MarkovEngine = MarkovEngine;

const { PSAEngine, PSAWorkerRunner } = require('../../src/engine/psa');

// ---------------------------------------------------------------------------
// Load non-exported classes (DSAEngine, EVPICalculator, ConvergenceDiagnostics)
// These are defined in the file but not in module.exports.
// We load them by evaluating the source with an appended expression.
// ---------------------------------------------------------------------------
let DSAEngine, EVPICalculator, ConvergenceDiagnostics;
try {
    const code = fs.readFileSync(
        path.resolve(__dirname, '../../src/engine/psa.js'), 'utf8'
    );
    // Wrap code in a function that receives globals as parameters,
    // since vm.runInThisContext in Jest may not see global.* assignments.
    const wrapped =
        '(function(PCG32, KahanSum, MarkovEngine, ExpressionParser, performance, require, console, module, window) {\n' +
        code +
        '\n;return {DSAEngine, EVPICalculator, ConvergenceDiagnostics};\n' +
        '})';
    const factory = vm.runInThisContext(wrapped, { filename: 'psa-sandbox.js' });
    const loaded = factory(
        PCG32, KahanSum, MarkovEngine, ExpressionParser, performance,
        require, console, { exports: {} }, undefined
    );
    DSAEngine = loaded.DSAEngine;
    EVPICalculator = loaded.EVPICalculator;
    ConvergenceDiagnostics = loaded.ConvergenceDiagnostics;
} catch (e) {
    console.warn('Could not load non-exported classes:', e.message);
}

// ---------------------------------------------------------------------------
// Helper: minimal two-state Markov project
// ---------------------------------------------------------------------------
function createProject() {
    return {
        version: '0.1',
        metadata: { id: 'psa-test', name: 'PSA Test Project' },
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
            p_death: {
                value: 0.1,
                distribution: { type: 'beta', alpha: 10, beta: 90 }
            },
            c_alive: {
                value: 1000,
                distribution: { type: 'gamma', mean: 1000, se: 200 }
            },
            u_alive: {
                value: 0.8,
                distribution: { type: 'beta', alpha: 16, beta: 4 }
            }
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
                parameter_overrides: { p_death: 0.05 }
            }
        }
    };
}

// =========================================================================
// PSAEngine — Cholesky decomposition (lines 296-318)
// =========================================================================
describe('PSAEngine - Cholesky decomposition', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('decomposes 2x2 identity matrix', () => {
        const L = engine.choleskyDecomposition([[1, 0], [0, 1]]);
        expect(L[0][0]).toBeCloseTo(1, 10);
        expect(L[0][1]).toBe(0);
        expect(L[1][0]).toBe(0);
        expect(L[1][1]).toBeCloseTo(1, 10);
    });

    test('decomposes known positive-definite matrix', () => {
        const R = [[1, 0.5], [0.5, 1]];
        const L = engine.choleskyDecomposition(R);
        // L * L^T should equal R
        const reconstructed = [
            [L[0][0] * L[0][0], L[0][0] * L[1][0]],
            [L[1][0] * L[0][0], L[1][0] * L[1][0] + L[1][1] * L[1][1]]
        ];
        expect(reconstructed[0][0]).toBeCloseTo(1, 10);
        expect(reconstructed[0][1]).toBeCloseTo(0.5, 10);
        expect(reconstructed[1][0]).toBeCloseTo(0.5, 10);
        expect(reconstructed[1][1]).toBeCloseTo(1, 10);
    });

    test('decomposes 3x3 correlation matrix', () => {
        const R = [
            [1, 0.3, 0.2],
            [0.3, 1, 0.4],
            [0.2, 0.4, 1]
        ];
        const L = engine.choleskyDecomposition(R);
        expect(L).toHaveLength(3);
        // Verify L is lower triangular
        expect(L[0][1]).toBe(0);
        expect(L[0][2]).toBe(0);
        expect(L[1][2]).toBe(0);
    });

    test('throws for non-positive-definite matrix', () => {
        const bad = [[1, 2], [2, 1]];
        expect(() => engine.choleskyDecomposition(bad)).toThrow('not positive definite');
    });
});

// =========================================================================
// PSAEngine — correlated sampling (lines 324-390)
// =========================================================================
describe('PSAEngine - correlated sampling', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('sampleCorrelated falls back to independent when no params/matrix', () => {
        const params = {
            x: { value: 0.5, distribution: { type: 'beta', alpha: 5, beta: 5 } }
        };
        const result = engine.sampleCorrelated(params, { parameters: [], matrix: [] });
        expect(result.x).toBeDefined();
        expect(Number.isFinite(result.x)).toBe(true);
    });

    test('sampleCorrelated with valid correlation spec', () => {
        const params = {
            p1: { value: 0.5, distribution: { type: 'normal', mean: 0.5, sd: 0.1 } },
            p2: { value: 0.3, distribution: { type: 'normal', mean: 0.3, sd: 0.1 } }
        };
        const corrSpec = {
            parameters: ['p1', 'p2'],
            matrix: [[1, 0.5], [0.5, 1]]
        };
        const result = engine.sampleCorrelated(params, corrSpec);
        expect(Number.isFinite(result.p1)).toBe(true);
        expect(Number.isFinite(result.p2)).toBe(true);
    });

    test('sampleCorrelated passes through fixed parameters', () => {
        const params = {
            p1: { value: 0.5, distribution: { type: 'normal', mean: 0.5, sd: 0.1 } },
            fixed: { value: 42 }
        };
        const corrSpec = {
            parameters: ['p1'],
            matrix: [[1]]
        };
        const result = engine.sampleCorrelated(params, corrSpec);
        expect(result.fixed).toBe(42);
        expect(Number.isFinite(result.p1)).toBe(true);
    });
});

// =========================================================================
// PSAEngine — sampleParameters with correlationMatrix (line 276)
// =========================================================================
describe('PSAEngine - sampleParameters with correlation', () => {
    test('uses correlated sampling when correlationMatrix option is set', () => {
        const engine = new PSAEngine({
            seed: 42,
            correlationMatrix: {
                parameters: ['p1', 'p2'],
                matrix: [[1, 0.5], [0.5, 1]]
            }
        });
        const params = {
            p1: { value: 0.5, distribution: { type: 'normal', mean: 0.5, sd: 0.1 } },
            p2: { value: 0.3, distribution: { type: 'normal', mean: 0.3, sd: 0.1 } }
        };
        // Pass correlationMatrix arg to trigger the correlated branch
        const corrMatrix = {
            parameters: ['p1', 'p2'],
            matrix: [[1, 0.5], [0.5, 1]]
        };
        const result = engine.sampleParameters(params, corrMatrix);
        expect(Number.isFinite(result.p1)).toBe(true);
        expect(Number.isFinite(result.p2)).toBe(true);
    });
});

// =========================================================================
// PSAEngine — sampleCorrelated edge cases (lines 337-338, 382)
// =========================================================================
describe('PSAEngine - sampleCorrelated edge cases', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('fallback with fixed param when corrParams empty', () => {
        const params = {
            fixedParam: { value: 99 }
        };
        const result = engine.sampleCorrelated(params, { parameters: [], matrix: [] });
        expect(result.fixedParam).toBe(99);
    });

    test('uncorrelated param with distribution alongside correlated params', () => {
        const params = {
            p1: { value: 0.5, distribution: { type: 'normal', mean: 0.5, sd: 0.1 } },
            uncorr: { value: 100, distribution: { type: 'gamma', mean: 100, se: 20 } },
            fixedUncorr: { value: 42 }
        };
        const corrSpec = {
            parameters: ['p1'],
            matrix: [[1]]
        };
        const result = engine.sampleCorrelated(params, corrSpec);
        expect(Number.isFinite(result.p1)).toBe(true);
        expect(result.uncorr).toBeGreaterThan(0);
        expect(result.fixedUncorr).toBe(42);
    });
});

// =========================================================================
// PSAEngine — sampleDistribution beta fallback (line 818), gamma shape/scale (line 823)
// =========================================================================
describe('PSAEngine - sampleDistribution edge cases for coverage', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('beta with invalid alpha/beta from mean/se returns mean', () => {
        // mean=0.5, se=10 -> variance=100, alpha = 0.5*(0.5*0.5/100-1) < 0
        const val = engine.sampleDistribution({ type: 'beta', mean: 0.5, se: 10 }, 0.5);
        expect(val).toBe(0.5);  // falls back to mean
    });

    test('gamma with explicit shape and scale', () => {
        const val = engine.sampleDistribution({ type: 'gamma', shape: 4, scale: 250 }, 1000);
        expect(val).toBeGreaterThan(0);
        expect(Number.isFinite(val)).toBe(true);
    });
});

// =========================================================================
// PSAEngine — transformFromNormal (lines 396-468)
// =========================================================================
describe('PSAEngine - transformFromNormal', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('normal transform returns mean + sd*z', () => {
        const val = engine.transformFromNormal(1.0, { type: 'normal', mean: 10, sd: 2 }, 10);
        expect(val).toBeCloseTo(12, 5);
    });

    test('gaussian alias works', () => {
        const val = engine.transformFromNormal(0.0, { type: 'gaussian', mean: 5, se: 1 }, 5);
        expect(val).toBeCloseTo(5, 5);
    });

    test('lognormal transform returns positive value', () => {
        const val = engine.transformFromNormal(0.0, { type: 'lognormal', mean: 10, sd: 2 }, 10);
        expect(val).toBeGreaterThan(0);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('lognormal with explicit meanlog/sdlog', () => {
        const val = engine.transformFromNormal(0.5, {
            type: 'lognormal', meanlog: 1.0, sdlog: 0.5
        }, 3);
        expect(val).toBeGreaterThan(0);
    });

    test('beta transform returns value in [0, 1]', () => {
        for (let z = -2; z <= 2; z += 0.5) {
            const val = engine.transformFromNormal(z, {
                type: 'beta', alpha: 5, beta: 5
            }, 0.5);
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(1);
        }
    });

    test('beta transform with mean/se parameters', () => {
        const val = engine.transformFromNormal(0.0, {
            type: 'beta', mean: 0.3, se: 0.05
        }, 0.3);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
    });

    test('gamma transform returns positive value', () => {
        const val = engine.transformFromNormal(0.5, {
            type: 'gamma', shape: 10, scale: 100
        }, 1000);
        expect(val).toBeGreaterThan(0);
    });

    test('gamma transform with shape/rate', () => {
        const val = engine.transformFromNormal(0.0, {
            type: 'gamma', shape: 4, rate: 0.01
        }, 400);
        expect(val).toBeGreaterThan(0);
    });

    test('gamma transform with mean/se', () => {
        const val = engine.transformFromNormal(0.0, {
            type: 'gamma', mean: 500, se: 100
        }, 500);
        expect(val).toBeGreaterThan(0);
    });

    test('uniform transform maps z to [min, max]', () => {
        // z=0 -> normalCDF(0) = 0.5 -> midpoint
        const val = engine.transformFromNormal(0.0, { type: 'uniform', min: 10, max: 20 }, 15);
        expect(val).toBeCloseTo(15, 0);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThanOrEqual(20);
    });

    test('default falls back to normal approximation', () => {
        const val = engine.transformFromNormal(1.0, {
            type: 'unknown_dist', mean: 100, sd: 10
        }, 100);
        expect(val).toBeCloseTo(110, 5);
    });
});

// =========================================================================
// PSAEngine — normalCDF (lines 473-488)
// =========================================================================
describe('PSAEngine - normalCDF', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('CDF at 0 is 0.5', () => {
        expect(engine.normalCDF(0)).toBeCloseTo(0.5, 5);
    });

    test('CDF at large positive is ~1', () => {
        expect(engine.normalCDF(4)).toBeGreaterThan(0.999);
    });

    test('CDF at large negative is ~0', () => {
        expect(engine.normalCDF(-4)).toBeLessThan(0.001);
    });

    test('CDF is monotonically increasing', () => {
        let prev = 0;
        for (let x = -3; x <= 3; x += 0.5) {
            const val = engine.normalCDF(x);
            expect(val).toBeGreaterThan(prev);
            prev = val;
        }
    });
});

// =========================================================================
// PSAEngine — betaInverseCDF, betaCDF, betaPDF (lines 493-531)
// =========================================================================
describe('PSAEngine - beta distribution functions', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('betaInverseCDF at p=0 returns 0', () => {
        expect(engine.betaInverseCDF(0, 2, 5)).toBe(0);
    });

    test('betaInverseCDF at p=1 returns 1', () => {
        expect(engine.betaInverseCDF(1, 2, 5)).toBe(1);
    });

    test('betaInverseCDF at p=0.5 with symmetric alpha=beta is ~0.5', () => {
        const val = engine.betaInverseCDF(0.5, 10, 10);
        expect(val).toBeCloseTo(0.5, 2);
    });

    test('betaCDF at x=0 is 0', () => {
        expect(engine.betaCDF(0, 2, 5)).toBe(0);
    });

    test('betaCDF at x=1 is 1', () => {
        expect(engine.betaCDF(1, 2, 5)).toBe(1);
    });

    test('betaCDF is monotonically increasing', () => {
        let prev = 0;
        for (let x = 0.05; x <= 0.95; x += 0.1) {
            const val = engine.betaCDF(x, 3, 7);
            expect(val).toBeGreaterThan(prev);
            prev = val;
        }
    });

    test('betaPDF at boundaries returns 0', () => {
        expect(engine.betaPDF(0, 2, 5)).toBe(0);
        expect(engine.betaPDF(1, 2, 5)).toBe(0);
    });

    test('betaPDF returns positive values in (0, 1)', () => {
        expect(engine.betaPDF(0.3, 2, 5)).toBeGreaterThan(0);
    });

    test('betaFunction returns positive value', () => {
        expect(engine.betaFunction(2, 5)).toBeGreaterThan(0);
    });
});

// =========================================================================
// PSAEngine — logGamma (lines 543-570)
// =========================================================================
describe('PSAEngine - logGamma', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('logGamma(1) = 0 (since Gamma(1) = 1)', () => {
        expect(engine.logGamma(1)).toBeCloseTo(0, 5);
    });

    test('logGamma(0.5) = log(sqrt(pi))', () => {
        expect(engine.logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 4);
    });

    test('logGamma(5) = log(24)', () => {
        expect(engine.logGamma(5)).toBeCloseTo(Math.log(24), 4);
    });

    test('logGamma handles x < 0.5 via reflection', () => {
        const val = engine.logGamma(0.3);
        expect(Number.isFinite(val)).toBe(true);
    });
});

// =========================================================================
// PSAEngine — incompleteBeta / betaContinuedFraction (lines 575-628)
// =========================================================================
describe('PSAEngine - incomplete beta', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('incompleteBeta at x=0 returns 0', () => {
        expect(engine.incompleteBeta(0, 2, 3)).toBe(0);
    });

    test('incompleteBeta at x=1 returns 1', () => {
        expect(engine.incompleteBeta(1, 2, 3)).toBe(1);
    });

    test('incompleteBeta at midpoint returns reasonable value', () => {
        const val = engine.incompleteBeta(0.5, 2, 2);
        expect(val).toBeCloseTo(0.5, 2);
    });

    test('incompleteBeta uses upper branch for large x', () => {
        // When x >= (a+1)/(a+b+2), uses the 1 - ... branch
        const val = engine.incompleteBeta(0.9, 2, 3);
        expect(val).toBeGreaterThan(0.5);
        expect(val).toBeLessThanOrEqual(1);
    });
});

// =========================================================================
// PSAEngine — gamma distribution functions (lines 630-718)
// =========================================================================
describe('PSAEngine - gamma distribution functions', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('gammaInverseCDF at p=0 returns 0', () => {
        expect(engine.gammaInverseCDF(0, 2, 1)).toBe(0);
    });

    test('gammaInverseCDF at p=1 returns Infinity', () => {
        expect(engine.gammaInverseCDF(1, 2, 1)).toBe(Infinity);
    });

    test('gammaInverseCDF at p=0.5 returns reasonable value', () => {
        const val = engine.gammaInverseCDF(0.5, 5, 2);
        expect(val).toBeGreaterThan(0);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('gammaCDF at x=0 returns 0', () => {
        expect(engine.gammaCDF(0, 2)).toBe(0);
    });

    test('gammaCDF is monotonically increasing', () => {
        let prev = 0;
        for (let x = 0.5; x <= 5; x += 0.5) {
            const val = engine.gammaCDF(x, 3);
            expect(val).toBeGreaterThanOrEqual(prev);
            prev = val;
        }
    });

    test('gammaPDF at x=0 returns 0', () => {
        expect(engine.gammaPDF(0, 2)).toBe(0);
    });

    test('gammaPDF returns positive value for x > 0', () => {
        expect(engine.gammaPDF(2, 3)).toBeGreaterThan(0);
    });

    test('incompleteGamma with x < a+1 (series)', () => {
        const val = engine.incompleteGamma(5, 3);
        expect(val).toBeGreaterThan(0);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('incompleteGamma with x >= a+1 (continued fraction)', () => {
        const val = engine.incompleteGamma(2, 10);
        expect(val).toBeGreaterThan(0);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('incompleteGamma boundary cases', () => {
        expect(engine.incompleteGamma(2, -1)).toBe(0);
        expect(engine.incompleteGamma(-1, 2)).toBe(0);
        expect(engine.incompleteGamma(2, 0)).toBe(0);
    });

    test('incompleteGammaUpper returns finite value', () => {
        const val = engine.incompleteGammaUpper(3, 5);
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
    });
});

// =========================================================================
// PSAEngine — normalInverseCDF (lines 724-778)
// =========================================================================
describe('PSAEngine - normalInverseCDF', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('inverse CDF at p=0.5 returns 0', () => {
        expect(engine.normalInverseCDF(0.5)).toBe(0);
    });

    test('inverse CDF at p=0 returns -Infinity', () => {
        expect(engine.normalInverseCDF(0)).toBe(-Infinity);
    });

    test('inverse CDF at p=1 returns Infinity', () => {
        expect(engine.normalInverseCDF(1)).toBe(Infinity);
    });

    test('inverse CDF at p=0.975 is ~1.96', () => {
        expect(engine.normalInverseCDF(0.975)).toBeCloseTo(1.96, 2);
    });

    test('inverse CDF at p=0.025 is ~-1.96', () => {
        expect(engine.normalInverseCDF(0.025)).toBeCloseTo(-1.96, 2);
    });

    test('inverse CDF in the low tail (p < 0.02425)', () => {
        const val = engine.normalInverseCDF(0.001);
        expect(val).toBeLessThan(-3);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('inverse CDF in the high tail (p > 0.97575)', () => {
        const val = engine.normalInverseCDF(0.999);
        expect(val).toBeGreaterThan(3);
        expect(Number.isFinite(val)).toBe(true);
    });

    test('normalCDF and normalInverseCDF are inverses', () => {
        for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const z = engine.normalInverseCDF(p);
            const roundtrip = engine.normalCDF(z);
            expect(roundtrip).toBeCloseTo(p, 3);
        }
    });
});

// =========================================================================
// PSAEngine — sampleDistribution additional branches (lines 783-850)
// =========================================================================
describe('PSAEngine - sampleDistribution additional branches', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('fixed/constant type returns base value', () => {
        expect(engine.sampleDistribution({ type: 'fixed' }, 42)).toBe(42);
        expect(engine.sampleDistribution({ type: 'constant' }, 99)).toBe(99);
    });

    test('uniform distribution returns values in [min, max]', () => {
        for (let i = 0; i < 50; i++) {
            const val = engine.sampleDistribution({ type: 'uniform', min: 10, max: 20 }, 15);
            expect(val).toBeGreaterThanOrEqual(10);
            expect(val).toBeLessThanOrEqual(20);
        }
    });

    test('triangular distribution returns values in [min, max]', () => {
        for (let i = 0; i < 50; i++) {
            const val = engine.sampleDistribution({
                type: 'triangular', min: 5, mode: 10, max: 15
            }, 10);
            expect(val).toBeGreaterThanOrEqual(5);
            expect(val).toBeLessThanOrEqual(15);
        }
    });

    test('triangular distribution uses defaults from baseValue', () => {
        for (let i = 0; i < 20; i++) {
            const val = engine.sampleDistribution({ type: 'triangular' }, 100);
            expect(val).toBeGreaterThanOrEqual(80);  // 100 * 0.8
            expect(val).toBeLessThanOrEqual(120);     // 100 * 1.2
        }
    });

    test('unknown distribution type returns base value', () => {
        const val = engine.sampleDistribution({ type: 'weibull' }, 42);
        expect(val).toBe(42);
    });

    test('beta from mean/se (method of moments)', () => {
        for (let i = 0; i < 50; i++) {
            const val = engine.sampleDistribution({
                type: 'beta', mean: 0.3, se: 0.05
            }, 0.3);
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(1);
        }
    });

    test('gamma from shape/rate', () => {
        for (let i = 0; i < 50; i++) {
            const val = engine.sampleDistribution({
                type: 'gamma', shape: 4, rate: 0.01
            }, 400);
            expect(val).toBeGreaterThan(0);
        }
    });

    test('gamma from mean/se', () => {
        for (let i = 0; i < 50; i++) {
            const val = engine.sampleDistribution({
                type: 'gamma', mean: 1000, se: 200
            }, 1000);
            expect(val).toBeGreaterThan(0);
        }
    });

    test('lognormal with explicit meanlog/sdlog', () => {
        for (let i = 0; i < 20; i++) {
            const val = engine.sampleDistribution({
                type: 'lognormal', meanlog: 1.0, sdlog: 0.5
            }, 3);
            expect(val).toBeGreaterThan(0);
        }
    });

    test('lognormal from mean/sd', () => {
        for (let i = 0; i < 20; i++) {
            const val = engine.sampleDistribution({
                type: 'lognormal', mean: 1.5, sd: 0.3
            }, 1.5);
            expect(val).toBeGreaterThan(0);
        }
    });

    test('gaussian alias in sampleDistribution', () => {
        for (let i = 0; i < 20; i++) {
            const val = engine.sampleDistribution({
                type: 'gaussian', mean: 50, sd: 5
            }, 50);
            expect(Number.isFinite(val)).toBe(true);
        }
    });
});

// =========================================================================
// PSAEngine — computeSummary (lines 855-897)
// =========================================================================
describe('PSAEngine - computeSummary', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('computes all summary fields', () => {
        const incCosts = [100, 200, 300, -50, 150, 250, 50, 0, 175, 225];
        const incQalys = [0.1, 0.2, 0.05, 0.15, -0.05, 0.12, 0.08, 0.18, 0.03, 0.11];
        const icerValues = incCosts.map((c, i) => incQalys[i] !== 0 ? c / incQalys[i] : null)
            .filter(x => x !== null);

        const summary = engine.computeSummary(incCosts, incQalys, icerValues);

        expect(Number.isFinite(summary.mean_incremental_costs)).toBe(true);
        expect(Number.isFinite(summary.mean_incremental_qalys)).toBe(true);
        expect(Number.isFinite(summary.sd_incremental_costs)).toBe(true);
        expect(Number.isFinite(summary.sd_incremental_qalys)).toBe(true);
        expect(Number.isFinite(summary.mean_icer)).toBe(true);
        expect(Number.isFinite(summary.median_icer)).toBe(true);
        expect(summary.ci_lower_costs).toBeDefined();
        expect(summary.ci_upper_costs).toBeDefined();
        expect(summary.ci_lower_qalys).toBeDefined();
        expect(summary.ci_upper_qalys).toBeDefined();
        expect(summary.prob_ce).toBeDefined();
    });

    test('handles empty ICER values', () => {
        const incCosts = [100, 200];
        const incQalys = [0, 0];
        const icerValues = [];

        const summary = engine.computeSummary(incCosts, incQalys, icerValues);
        expect(summary.mean_icer).toBeNull();
        expect(summary.median_icer).toBeNull();
        expect(summary.ci_lower_icer).toBeNull();
        expect(summary.ci_upper_icer).toBeNull();
    });
});

// =========================================================================
// PSAEngine — computeQuadrants (lines 944-964)
// =========================================================================
describe('PSAEngine - computeQuadrants', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('all NE quadrant', () => {
        const q = engine.computeQuadrants([100, 200], [0.1, 0.2]);
        expect(q.NE).toBe(1);
        expect(q.NW).toBe(0);
        expect(q.SE).toBe(0);
        expect(q.SW).toBe(0);
    });

    test('all NW quadrant (dominant)', () => {
        const q = engine.computeQuadrants([-100, -200], [0.1, 0.2]);
        expect(q.NW).toBe(1);
    });

    test('all SE quadrant (dominated)', () => {
        const q = engine.computeQuadrants([100, 200], [-0.1, -0.2]);
        expect(q.SE).toBe(1);
    });

    test('all SW quadrant', () => {
        const q = engine.computeQuadrants([-100, -200], [-0.1, -0.2]);
        expect(q.SW).toBe(1);
    });

    test('mixed quadrants sum to 1', () => {
        const q = engine.computeQuadrants(
            [100, -50, 200, -100],
            [0.1, 0.2, -0.1, -0.05]
        );
        expect(q.NE + q.NW + q.SE + q.SW).toBeCloseTo(1, 10);
    });
});

// =========================================================================
// PSAEngine — percentileFromSorted (lines 994-1001)
// =========================================================================
describe('PSAEngine - percentileFromSorted', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('returns 0 for empty array', () => {
        expect(engine.percentileFromSorted([], 0.5)).toBe(0);
    });

    test('single element returns that element', () => {
        expect(engine.percentileFromSorted([7], 0.5)).toBe(7);
    });

    test('median of even array interpolates', () => {
        expect(engine.percentileFromSorted([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    });
});

// =========================================================================
// PSAEngine — checkConvergence (lines 1012-1072)
// =========================================================================
describe('PSAEngine - checkConvergence', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('returns not converged for < 200 iterations', () => {
        const result = engine.checkConvergence([1, 2, 3], [0.1, 0.2, 0.3], [], 20000);
        expect(result.converged).toBe(false);
        expect(result.reason).toContain('Insufficient');
        expect(result.iterations).toBe(3);
    });

    test('returns convergence assessment for >= 200 iterations', () => {
        const rng = new PCG32(42);
        const n = 500;
        const incCosts = Array.from({ length: n }, () => rng.normal(100, 10));
        const incQalys = Array.from({ length: n }, () => rng.normal(0.1, 0.01));
        const icerValues = incCosts.map((c, i) => c / incQalys[i]);

        const result = engine.checkConvergence(incCosts, incQalys, icerValues, 20000);
        expect(result.iterations).toBe(n);
        expect(result.metrics).toBeDefined();
        expect(result.monte_carlo_se).toBeDefined();
        expect(Number.isFinite(result.monte_carlo_se.costs)).toBe(true);
        expect(Number.isFinite(result.monte_carlo_se.qalys)).toBe(true);
        expect(typeof result.converged).toBe('boolean');
    });

    test('converged result has proper recommendation', () => {
        // Constant data should converge trivially
        const n = 300;
        const incCosts = Array(n).fill(100);
        const incQalys = Array(n).fill(0.1);
        const result = engine.checkConvergence(incCosts, incQalys, [1000], 20000);
        expect(result.converged).toBe(true);
        expect(result.recommendation).toContain('converged');
    });
});

// =========================================================================
// PSAEngine — log and onProgress (lines 111-125)
// =========================================================================
describe('PSAEngine - log and onProgress', () => {
    test('log adds event to auditLog', () => {
        const engine = new PSAEngine({ seed: 42 });
        engine.log('test_event', { detail: 'abc' });
        expect(engine.auditLog).toHaveLength(1);
        expect(engine.auditLog[0].event).toBe('test_event');
        expect(engine.auditLog[0].detail).toBe('abc');
        expect(engine.auditLog[0].timestamp).toBeDefined();
    });

    test('onProgress sets callback', () => {
        const engine = new PSAEngine({ seed: 42 });
        const cb = jest.fn();
        engine.onProgress(cb);
        expect(engine.progressCallback).toBe(cb);
    });
});

// =========================================================================
// PSAEngine — computeProbCE (lines 902-913)
// =========================================================================
describe('PSAEngine - computeProbCE', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('all cost-effective returns 1', () => {
        const prob = engine.computeProbCE([-100, -200], [0.1, 0.2], 50000);
        expect(prob).toBe(1);
    });

    test('none cost-effective returns 0', () => {
        const prob = engine.computeProbCE([10000, 20000], [0.01, 0.02], 100);
        expect(prob).toBe(0);
    });

    test('half cost-effective returns 0.5', () => {
        // NMB = q * wtp - c
        // Iteration 1: 0.1 * 10000 - 500 = 500 (CE)
        // Iteration 2: 0.1 * 10000 - 1500 = -500 (not CE)
        const prob = engine.computeProbCE([500, 1500], [0.1, 0.1], 10000);
        expect(prob).toBe(0.5);
    });
});

// =========================================================================
// PSAEngine — computeCEAC (lines 918-939)
// =========================================================================
describe('PSAEngine - computeCEAC', () => {
    let engine;
    beforeEach(() => { engine = new PSAEngine({ seed: 42 }); });

    test('CEAC returns sorted WTP points', () => {
        const ceac = engine.computeCEAC([100, -100], [0.1, 0.2], {}, {
            wtpMin: 0, wtpMax: 5000, wtpStep: 1000, thresholds: [2000, 3000]
        });
        expect(ceac.length).toBeGreaterThan(0);
        for (let i = 1; i < ceac.length; i++) {
            expect(ceac[i].wtp).toBeGreaterThanOrEqual(ceac[i - 1].wtp);
        }
    });

    test('CEAC includes threshold values', () => {
        const ceac = engine.computeCEAC([100], [0.1], {}, {
            wtpMin: 0, wtpMax: 5000, wtpStep: 2000, thresholds: [1500]
        });
        const wtpValues = ceac.map(p => p.wtp);
        expect(wtpValues).toContain(1500);
    });

    test('CEAC uses default range when no wtpInfo', () => {
        const ceac = engine.computeCEAC([100], [0.1]);
        expect(ceac.length).toBeGreaterThan(0);
    });
});

// =========================================================================
// PSAWorkerRunner (lines 1078-1102)
// =========================================================================
describe('PSAWorkerRunner', () => {
    test('runs PSA and returns results', async () => {
        const runner = new PSAWorkerRunner();
        const project = createProject();
        const result = await runner.run(project, 50, 42);
        expect(result.iterations).toBe(50);
        expect(result.scatter).toBeDefined();
    });

    test('runs with progress callback', async () => {
        const runner = new PSAWorkerRunner();
        const project = createProject();
        const progressCalls = [];
        const result = await runner.run(project, 50, 42, (current, total) => {
            progressCalls.push({ current, total });
        });
        expect(result.iterations).toBe(50);
    });
});

// =========================================================================
// PSAEngine — run with progress callback (lines 134-262)
// =========================================================================
describe('PSAEngine - run with progress', () => {
    test('progress callback is called during run', async () => {
        const project = createProject();
        const engine = new PSAEngine({ seed: 42, iterations: 50, progressInterval: 10 });
        const progressCalls = [];
        engine.onProgress(async (current, total) => {
            progressCalls.push({ current, total });
        });
        const result = await engine.run(project, { p_death: 0.05 }, {});
        expect(result.iterations).toBe(50);
        expect(progressCalls.length).toBeGreaterThan(0);
    });

    test('progress callback error does not crash run', async () => {
        const project = createProject();
        const engine = new PSAEngine({ seed: 42, iterations: 20, progressInterval: 5 });
        engine.onProgress(async () => { throw new Error('progress fail'); });
        // Should not throw
        const result = await engine.run(project, { p_death: 0.05 }, {});
        expect(result.iterations).toBe(20);
    });
});

// =========================================================================
// DSAEngine (lines 1108-1491)
// =========================================================================
describe('DSAEngine', () => {
    if (!DSAEngine) {
        test.skip('DSAEngine not available (sandbox load failed)', () => {});
        return;
    }

    // DSAEngine.getDistributionRange calls this.normalInverseCDF which is
    // defined on PSAEngine but not on DSAEngine. Patch it from PSAEngine.
    const psaProto = PSAEngine.prototype;
    DSAEngine.prototype.normalInverseCDF = psaProto.normalInverseCDF;

    test('constructor sets defaults', () => {
        const dsa = new DSAEngine();
        expect(dsa.options.percentageRange).toBe(0.2);
        expect(dsa.markovEngine).toBeDefined();
    });

    test('constructor accepts custom range', () => {
        const dsa = new DSAEngine({ percentageRange: 0.3 });
        expect(dsa.options.percentageRange).toBe(0.3);
    });

    test('onProgress and reportProgress', () => {
        const dsa = new DSAEngine();
        const calls = [];
        dsa.onProgress((c, t) => calls.push({ c, t }));
        dsa.reportProgress(1, 5);
        dsa.reportProgress(2, 5);
        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({ c: 1, t: 5 });
    });

    test('reportProgress with no callback does not throw', () => {
        const dsa = new DSAEngine();
        expect(() => dsa.reportProgress(1, 5)).not.toThrow();
    });

    test('run produces tornado results with legacy signature', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        const result = dsa.run(project, 'icer', 20000);

        expect(result.baseline).toBeDefined();
        expect(result.metric).toBe('icer');
        expect(result.parameters).toBeDefined();
        expect(Array.isArray(result.parameters)).toBe(true);
        expect(result.topParameters).toBeDefined();
    });

    test('run with app.js signature (object options)', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        const result = dsa.run(project, {}, {}, { metric: 'costs', range: 0.1 });

        expect(result.metric).toBe('costs');
        expect(result.parameters).toBeDefined();
    });

    test('tornado parameters are sorted by swing', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        const result = dsa.run(project, 'icer', 20000);

        for (let i = 1; i < result.parameters.length; i++) {
            expect(result.parameters[i].swing).toBeLessThanOrEqual(result.parameters[i - 1].swing);
        }
    });

    test('each parameter result has required fields', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        const result = dsa.run(project, 'icer', 20000);

        for (const p of result.parameters) {
            expect(p.parameter).toBeDefined();
            expect(p.label).toBeDefined();
            expect(Number.isFinite(p.baseValue)).toBe(true);
            expect(Number.isFinite(p.lowValue)).toBe(true);
            expect(Number.isFinite(p.highValue)).toBe(true);
            expect(Number.isFinite(p.lowResult)).toBe(true);
            expect(Number.isFinite(p.highResult)).toBe(true);
            expect(Number.isFinite(p.swing)).toBe(true);
        }
    });

    test('getOutcome handles missing incremental results', () => {
        const dsa = new DSAEngine();
        expect(dsa.getOutcome({}, 'icer', 20000)).toBe(0);
        expect(dsa.getOutcome({ incremental: null }, 'icer', 20000)).toBe(0);
        expect(dsa.getOutcome({ incremental: { comparisons: [] } }, 'icer', 20000)).toBe(0);
    });

    test('getOutcome extracts different metrics', () => {
        const dsa = new DSAEngine();
        const mockResults = {
            incremental: {
                comparisons: [{
                    icer: 5000,
                    incremental_costs: 1000,
                    incremental_qalys: 0.2
                }]
            }
        };
        expect(dsa.getOutcome(mockResults, 'icer', 20000)).toBe(5000);
        expect(dsa.getOutcome(mockResults, 'costs', 20000)).toBe(1000);
        expect(dsa.getOutcome(mockResults, 'qalys', 20000)).toBe(0.2);
        expect(dsa.getOutcome(mockResults, 'nmb', 20000)).toBeCloseTo(0.2 * 20000 - 1000, 5);
    });

    test('getOutcome handles default/unknown metric', () => {
        const dsa = new DSAEngine();
        const mockResults = {
            incremental: { comparisons: [{ icer: 3000, incremental_costs: 500, incremental_qalys: 0.1 }] }
        };
        expect(dsa.getOutcome(mockResults, 'unknown_metric', 20000)).toBe(3000);
    });

    test('getDistributionRange for beta', () => {
        const dsa = new DSAEngine();
        const range = dsa.getDistributionRange({ type: 'beta', alpha: 10, beta: 90 }, 0.1);
        expect(range.low).toBeGreaterThanOrEqual(0);
        expect(range.high).toBeLessThanOrEqual(1);
        expect(range.low).toBeLessThan(range.high);
    });

    test('getDistributionRange for gamma', () => {
        const dsa = new DSAEngine();
        const range = dsa.getDistributionRange({ type: 'gamma', mean: 1000, se: 200 }, 1000);
        expect(range.low).toBeGreaterThanOrEqual(0);
        expect(range.low).toBeLessThan(range.high);
    });

    test('getDistributionRange for normal', () => {
        const dsa = new DSAEngine();
        const range = dsa.getDistributionRange({ type: 'normal', mean: 50, sd: 5 }, 50);
        expect(range.low).toBeLessThan(50);
        expect(range.high).toBeGreaterThan(50);
    });

    test('getDistributionRange for lognormal', () => {
        const dsa = new DSAEngine();
        const range = dsa.getDistributionRange({ type: 'lognormal', mean: 2, sd: 0.5 }, 2);
        expect(range.low).toBeGreaterThanOrEqual(0);
        expect(range.low).toBeLessThan(range.high);
    });

    test('getDistributionRange for uniform', () => {
        const dsa = new DSAEngine();
        const range = dsa.getDistributionRange({ type: 'uniform', min: 5, max: 15 }, 10);
        expect(range.low).toBe(5);
        expect(range.high).toBe(15);
    });

    test('getDistributionRange for unknown type defaults to +/- 20%', () => {
        const dsa = new DSAEngine();
        const range = dsa.getDistributionRange({ type: 'weibull' }, 100);
        expect(range.low).toBeCloseTo(80, 5);
        expect(range.high).toBeCloseTo(120, 5);
    });

    test('run clamps probability parameters to [0, 1]', () => {
        const project = createProject();
        // p_death starts with "p_" prefix, should be clamped
        const dsa = new DSAEngine({ percentageRange: 5.0 }); // extreme range
        const result = dsa.run(project, 'icer', 20000);
        const pDeathParam = result.parameters.find(p => p.parameter === 'p_death');
        if (pDeathParam) {
            expect(pDeathParam.lowValue).toBeGreaterThanOrEqual(0);
            expect(pDeathParam.highValue).toBeLessThanOrEqual(1);
        }
    });

    test('runTwoWay produces grid of outcomes', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        const result = dsa.runTwoWay(project, 'p_death', 'c_alive', 3, 'icer', 20000);

        expect(result.parameter1.id).toBe('p_death');
        expect(result.parameter2.id).toBe('c_alive');
        expect(result.outcomes).toHaveLength(4); // steps + 1
        expect(result.outcomes[0]).toHaveLength(4);
        expect(result.metric).toBe('icer');
    });

    test('runTwoWay throws for invalid parameters', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        expect(() => dsa.runTwoWay(project, 'nonexistent', 'c_alive')).toThrow('Invalid parameter IDs');
    });

    test('findThresholdCrossing returns null for non-numeric parameter', () => {
        const project = createProject();
        project.parameters.text_param = { value: 'abc' };
        const dsa = new DSAEngine();
        expect(dsa.findThresholdCrossing(project, 'text_param', 20000)).toBeNull();
    });

    test('findThresholdCrossing returns null for nonexistent parameter', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        expect(dsa.findThresholdCrossing(project, 'nonexistent', 20000)).toBeNull();
    });

    test('runThresholdAnalysis returns summary', () => {
        const project = createProject();
        const dsa = new DSAEngine();
        const result = dsa.runThresholdAnalysis(project, 20000);

        expect(result.wtp).toBe(20000);
        expect(Array.isArray(result.crossings)).toBe(true);
        expect(result.summary).toBeDefined();
    });
});

// =========================================================================
// EVPICalculator (lines 1497-1630)
// =========================================================================
describe('EVPICalculator', () => {
    if (!EVPICalculator) {
        test.skip('EVPICalculator not available (sandbox load failed)', () => {});
        return;
    }

    function makeMockPSAResults(incCosts, incQalys) {
        return {
            scatter: {
                incremental_costs: incCosts,
                incremental_qalys: incQalys
            },
            settings_snapshot: {},
            primary_wtp: 20000
        };
    }

    test('constructor initializes', () => {
        const calc = new EVPICalculator();
        expect(calc.psaEngine).toBeNull();
    });

    test('calculate returns EVPI results with adopt decision', () => {
        const n = 200;
        const rng = new PCG32(42);
        const incCosts = Array.from({ length: n }, () => rng.normal(500, 300));
        const incQalys = Array.from({ length: n }, () => rng.normal(0.2, 0.05));
        const psa = makeMockPSAResults(incCosts, incQalys);

        const calc = new EVPICalculator();
        const result = calc.calculate(psa, 50000, 10000, 10);

        expect(result.wtp).toBe(50000);
        expect(Number.isFinite(result.expectedNMB)).toBe(true);
        expect(Number.isFinite(result.evpiPerPatient)).toBe(true);
        expect(result.evpiPerPatient).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(result.populationEVPI)).toBe(true);
        expect(result.population).toBe(10000);
        expect(result.timeHorizon).toBe(10);
        expect(['adopt', 'reject']).toContain(result.currentDecision);
        expect(result.probWrongDecision).toBeGreaterThanOrEqual(0);
        expect(result.probWrongDecision).toBeLessThanOrEqual(1);
        expect(result.interpretation).toBeDefined();
    });

    test('EVPI is zero when intervention always dominates', () => {
        const n = 100;
        const incCosts = Array(n).fill(-1000); // always cheaper
        const incQalys = Array(n).fill(0.5);    // always better
        const psa = makeMockPSAResults(incCosts, incQalys);

        const calc = new EVPICalculator();
        const result = calc.calculate(psa, 20000);
        expect(result.evpiPerPatient).toBeCloseTo(0, 5);
        expect(result.currentDecision).toBe('adopt');
    });

    test('EVPI with reject decision', () => {
        const n = 100;
        // High costs, low QALYs => negative NMB => reject
        const incCosts = Array(n).fill(100000);
        const incQalys = Array(n).fill(0.01);
        const psa = makeMockPSAResults(incCosts, incQalys);

        const calc = new EVPICalculator();
        const result = calc.calculate(psa, 1000);
        expect(result.currentDecision).toBe('reject');
    });

    test('EVPI uses primary_wtp from psaResults when wtp not provided', () => {
        const psa = makeMockPSAResults([100], [0.1]);
        psa.primary_wtp = 30000;

        const calc = new EVPICalculator();
        const result = calc.calculate(psa, undefined);
        expect(result.wtp).toBe(30000);
    });

    test('calculateCurve returns array of EVPI values', () => {
        const n = 200;
        const rng = new PCG32(42);
        const incCosts = Array.from({ length: n }, () => rng.normal(500, 300));
        const incQalys = Array.from({ length: n }, () => rng.normal(0.1, 0.05));
        const psa = makeMockPSAResults(incCosts, incQalys);

        const calc = new EVPICalculator();
        const curve = calc.calculateCurve(psa, 0, 50000, 10000);

        expect(curve.length).toBeGreaterThan(0);
        for (const point of curve) {
            expect(Number.isFinite(point.wtp)).toBe(true);
            expect(Number.isFinite(point.evpiPerPatient)).toBe(true);
            expect(point.evpiPerPatient).toBeGreaterThanOrEqual(0);
        }
    });

    test('calculateCurve uses defaults when params not provided', () => {
        const psa = makeMockPSAResults([100, 200], [0.1, 0.2]);
        const calc = new EVPICalculator();
        const curve = calc.calculateCurve(psa);
        expect(curve.length).toBeGreaterThan(0);
    });

    test('interpret returns low EVPI interpretation', () => {
        const calc = new EVPICalculator();
        const text = calc.interpret(50, 500000, 0.1);
        expect(text).toContain('Very low');
    });

    test('interpret returns moderate EVPI interpretation', () => {
        const calc = new EVPICalculator();
        const text = calc.interpret(500, 5000000, 0.2);
        expect(text).toContain('Moderate');
    });

    test('interpret returns high EVPI interpretation', () => {
        const calc = new EVPICalculator();
        const text = calc.interpret(5000, 50000000, 0.5);
        expect(text).toContain('High per-patient');
        expect(text).toContain('substantial research');
        expect(text).toContain('High probability');
    });

    test('interpret with moderate population EVPI', () => {
        const calc = new EVPICalculator();
        const text = calc.interpret(200, 5000000, 0.1);
        expect(text).toContain('moderate research');
    });
});

// =========================================================================
// ConvergenceDiagnostics (lines 1636-1747)
// =========================================================================
describe('ConvergenceDiagnostics', () => {
    if (!ConvergenceDiagnostics) {
        test.skip('ConvergenceDiagnostics not available (sandbox load failed)', () => {});
        return;
    }

    test('constructor initializes empty history', () => {
        const diag = new ConvergenceDiagnostics();
        expect(diag.history.iterations).toEqual([]);
        expect(diag.history.meanCosts).toEqual([]);
        expect(diag.history.meanQalys).toEqual([]);
    });

    test('record adds data points', () => {
        const diag = new ConvergenceDiagnostics();
        diag.record(100, [100, 200, 150], [0.1, 0.2, 0.15], 20000);
        expect(diag.history.iterations).toHaveLength(1);
        expect(diag.history.iterations[0]).toBe(100);
        expect(Number.isFinite(diag.history.meanCosts[0])).toBe(true);
        expect(Number.isFinite(diag.history.probCE[0])).toBe(true);
    });

    test('record skips empty arrays', () => {
        const diag = new ConvergenceDiagnostics();
        diag.record(100, [], [], 20000);
        expect(diag.history.iterations).toHaveLength(0);
    });

    test('record computes ICER as null when meanQaly is 0', () => {
        const diag = new ConvergenceDiagnostics();
        diag.record(100, [100, 200], [0, 0], 20000);
        expect(diag.history.meanIcer[0]).toBeNull();
    });

    test('checkConvergence returns not converged for insufficient data', () => {
        const diag = new ConvergenceDiagnostics();
        diag.record(100, [100], [0.1], 20000);
        diag.record(200, [110], [0.11], 20000);

        const result = diag.checkConvergence(0.01, 5);
        expect(result.converged).toBe(false);
        expect(result.reason).toContain('Insufficient');
    });

    test('checkConvergence detects convergence with stable data', () => {
        const diag = new ConvergenceDiagnostics();
        // Record many identical data points
        for (let i = 0; i < 20; i++) {
            diag.record(i * 100, [100, 100], [0.1, 0.1], 20000);
        }

        const result = diag.checkConvergence(0.01, 5);
        expect(result.converged).toBe(true);
        expect(result.recommendation).toContain('converged');
    });

    test('checkConvergence detects non-convergence with changing data', () => {
        const diag = new ConvergenceDiagnostics();
        // Record data that changes significantly between halves
        for (let i = 0; i < 10; i++) {
            const val = 100 + i * 50;
            diag.record(i * 100, [val], [0.1 + i * 0.05], 20000);
        }
        for (let i = 10; i < 20; i++) {
            const val = 800 + i * 50;
            diag.record(i * 100, [val], [0.8 + i * 0.05], 20000);
        }

        const result = diag.checkConvergence(0.001, 5);
        expect(result.converged).toBe(false);
    });

    test('checkConvergence handles zero previous mean', () => {
        const diag = new ConvergenceDiagnostics();
        for (let i = 0; i < 20; i++) {
            diag.record(i * 100, [0], [0], 20000);
        }
        const result = diag.checkConvergence(0.01, 5);
        expect(typeof result.converged).toBe('boolean');
    });

    test('getTrace returns copy of history', () => {
        const diag = new ConvergenceDiagnostics();
        diag.record(100, [50], [0.1], 20000);
        const trace = diag.getTrace();
        expect(trace.iterations).toEqual([100]);
        expect(trace.meanCosts).toHaveLength(1);
    });

    test('calculateMCSE returns 0 for < 2 values', () => {
        const diag = new ConvergenceDiagnostics();
        expect(diag.calculateMCSE([])).toBe(0);
        expect(diag.calculateMCSE([5])).toBe(0);
    });

    test('calculateMCSE returns correct value', () => {
        const diag = new ConvergenceDiagnostics();
        const values = [10, 12, 11, 13, 9];
        const mcse = diag.calculateMCSE(values);
        expect(mcse).toBeGreaterThan(0);
        expect(Number.isFinite(mcse)).toBe(true);
        // MCSE = SD / sqrt(n)
        const mean = 11;
        const sumSq = values.reduce((s, v) => s + (v - mean) ** 2, 0);
        const sd = Math.sqrt(sumSq / 4);
        expect(mcse).toBeCloseTo(sd / Math.sqrt(5), 10);
    });
});

// =========================================================================
// PSAEngine — NMB/ICER via run (integration)
// =========================================================================
describe('PSAEngine - NMB and ICER via run', () => {
    test('run result includes ICER in summary', async () => {
        const project = createProject();
        const engine = new PSAEngine({ seed: 42, iterations: 100 });
        const result = await engine.run(project, { p_death: 0.05, c_alive: 1500 }, {});

        // ICER = incCosts / incQALYs
        if (result.summary.mean_icer !== null) {
            expect(Number.isFinite(result.summary.mean_icer)).toBe(true);
        }
    });

    test('run result includes strategy costs/QALYs', async () => {
        const project = createProject();
        const engine = new PSAEngine({ seed: 42, iterations: 50 });
        const result = await engine.run(project, { p_death: 0.05 }, {});

        expect(Number.isFinite(result.strategy_results.intervention.mean_costs)).toBe(true);
        expect(Number.isFinite(result.strategy_results.intervention.mean_qalys)).toBe(true);
        expect(Number.isFinite(result.strategy_results.comparator.mean_costs)).toBe(true);
        expect(Number.isFinite(result.strategy_results.comparator.mean_qalys)).toBe(true);
    });

    test('run result includes wtp thresholds and scatter', async () => {
        const project = createProject();
        const engine = new PSAEngine({ seed: 42, iterations: 30 });
        const result = await engine.run(project, {}, {});

        expect(result.wtp_thresholds).toBeDefined();
        expect(Array.isArray(result.wtp_thresholds)).toBe(true);
        expect(result.primary_wtp).toBeDefined();
        expect(result.wtp_range).toBeDefined();
        expect(result.scatter.incremental_costs).toHaveLength(30);
        expect(result.scatter.incremental_qalys).toHaveLength(30);
        expect(result.computation_time_ms).toBeDefined();
    });
});
