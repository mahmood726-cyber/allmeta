/**
 * Tests for src/engine/correlatedPSA.js — CorrelatedPSAEngine
 */

'use strict';

const { PCG32 } = require('../../src/utils/pcg32');

// Set up globals required by the engine
global.PCG32 = PCG32;

const { CorrelatedPSAEngine } = require('../../src/engine/correlatedPSA');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function matMul(A, B) {
    var n = A.length, m = B[0].length, p = B.length;
    var C = [];
    for (var i = 0; i < n; i++) {
        C[i] = new Array(m).fill(0);
        for (var j = 0; j < m; j++) {
            for (var k = 0; k < p; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return C;
}

function transpose(A) {
    var n = A.length, m = A[0].length;
    var T = [];
    for (var j = 0; j < m; j++) {
        T[j] = new Array(n);
        for (var i = 0; i < n; i++) {
            T[j][i] = A[i][j];
        }
    }
    return T;
}

function extractColumn(samples, key) {
    return samples.map(s => s[key]);
}

function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pearsonCorr(x, y) {
    var n = x.length;
    var mx = mean(x), my = mean(y);
    var num = 0, dx = 0, dy = 0;
    for (var i = 0; i < n; i++) {
        var xi = x[i] - mx, yi = y[i] - my;
        num += xi * yi;
        dx += xi * xi;
        dy += yi * yi;
    }
    return num / Math.sqrt(dx * dy);
}

// ---------------------------------------------------------------------------
describe('CorrelatedPSAEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new CorrelatedPSAEngine({ seed: 12345, nIterations: 1000 });
    });

    // -----------------------------------------------------------------------
    // 1. Cholesky: 2x2 identity → identity
    // -----------------------------------------------------------------------
    test('1. Cholesky of identity matrix', () => {
        var L = engine.cholesky([[1, 0], [0, 1]]);
        expect(L[0][0]).toBeCloseTo(1, 10);
        expect(L[0][1]).toBeCloseTo(0, 10);
        expect(L[1][0]).toBeCloseTo(0, 10);
        expect(L[1][1]).toBeCloseTo(1, 10);
    });

    // -----------------------------------------------------------------------
    // 2. Cholesky: [[1,0.5],[0.5,1]] → verify L*L^T = original
    // -----------------------------------------------------------------------
    test('2. Cholesky L*L^T reconstructs original', () => {
        var A = [[1, 0.5], [0.5, 1]];
        var L = engine.cholesky(A);

        // L * L^T should equal A
        var LLt = matMul(L, transpose(L));
        for (var i = 0; i < 2; i++) {
            for (var j = 0; j < 2; j++) {
                expect(LLt[i][j]).toBeCloseTo(A[i][j], 10);
            }
        }
    });

    // -----------------------------------------------------------------------
    // 3. Cholesky: 3x3 matrix
    // -----------------------------------------------------------------------
    test('3. Cholesky 3x3 matrix', () => {
        var A = [[1, 0.3, 0.2], [0.3, 1, 0.4], [0.2, 0.4, 1]];
        var L = engine.cholesky(A);
        var LLt = matMul(L, transpose(L));
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                expect(LLt[i][j]).toBeCloseTo(A[i][j], 8);
            }
        }
        // L should be lower triangular
        expect(L[0][1]).toBeCloseTo(0, 10);
        expect(L[0][2]).toBeCloseTo(0, 10);
        expect(L[1][2]).toBeCloseTo(0, 10);
    });

    // -----------------------------------------------------------------------
    // 4. Cholesky: non-PD throws error
    // -----------------------------------------------------------------------
    test('4. Cholesky throws on non-PD matrix', () => {
        var bad = [[1, 2], [2, 1]]; // eigenvalues: 3 and -1
        expect(() => engine.cholesky(bad)).toThrow('not positive definite');
    });

    // -----------------------------------------------------------------------
    // 5. nearestPD: slightly non-PD → closest PD matrix
    // -----------------------------------------------------------------------
    test('5. nearestPD fixes slightly non-PD matrix', () => {
        var bad = [[1, 0.9, 0.9], [0.9, 1, 0.9], [0.9, 0.9, 1]];
        // Make it slightly non-PD by increasing off-diagonals
        var reallyBad = [[1, 1.01, 0.5], [1.01, 1, 0.5], [0.5, 0.5, 1]];
        var fixed = engine.nearestPD(reallyBad);
        // Should not throw on Cholesky
        expect(() => engine.cholesky(fixed)).not.toThrow();
        // Diagonal should be 1
        for (var i = 0; i < 3; i++) {
            expect(fixed[i][i]).toBeCloseTo(1, 3);
        }
    });

    // -----------------------------------------------------------------------
    // 6. nearestPD: already PD → returns same
    // -----------------------------------------------------------------------
    test('6. nearestPD on already-PD returns equivalent', () => {
        var good = [[1, 0.3], [0.3, 1]];
        var result = engine.nearestPD(good);
        for (var i = 0; i < 2; i++) {
            for (var j = 0; j < 2; j++) {
                expect(result[i][j]).toBeCloseTo(good[i][j], 6);
            }
        }
    });

    // -----------------------------------------------------------------------
    // 7. correlatedNormal: 2 params, rho=0.8 → empirical ≈ 0.8
    // -----------------------------------------------------------------------
    test('7. correlatedNormal preserves correlation rho=0.8', () => {
        engine = new CorrelatedPSAEngine({ seed: 42 });
        engine._rng = new PCG32(42);
        var samples = engine.correlatedNormal([0, 0], [1, 1], [[1, 0.8], [0.8, 1]], 5000);
        var x = extractColumn(samples, 'param0');
        var y = extractColumn(samples, 'param1');
        var r = pearsonCorr(x, y);
        expect(r).toBeCloseTo(0.8, 1); // within 0.05
    });

    // -----------------------------------------------------------------------
    // 8. correlatedNormal: rho=0 → empirical ≈ 0
    // -----------------------------------------------------------------------
    test('8. correlatedNormal rho=0 gives near-zero correlation', () => {
        engine._rng = new PCG32(99);
        var samples = engine.correlatedNormal([0, 0], [1, 1], [[1, 0], [0, 1]], 5000);
        var x = extractColumn(samples, 'param0');
        var y = extractColumn(samples, 'param1');
        var r = pearsonCorr(x, y);
        expect(Math.abs(r)).toBeLessThan(0.05);
    });

    // -----------------------------------------------------------------------
    // 9. correlatedNormal: rho=-0.5 → negative correlation
    // -----------------------------------------------------------------------
    test('9. correlatedNormal rho=-0.5 gives negative correlation', () => {
        engine._rng = new PCG32(77);
        var samples = engine.correlatedNormal([0, 0], [1, 1], [[1, -0.5], [-0.5, 1]], 5000);
        var x = extractColumn(samples, 'param0');
        var y = extractColumn(samples, 'param1');
        var r = pearsonCorr(x, y);
        expect(r).toBeLessThan(-0.3);
        expect(r).toBeCloseTo(-0.5, 1);
    });

    // -----------------------------------------------------------------------
    // 10. correlatedNormal: means and SDs respected
    // -----------------------------------------------------------------------
    test('10. correlatedNormal respects means and SDs', () => {
        engine._rng = new PCG32(123);
        var samples = engine.correlatedNormal([10, -5], [2, 3], [[1, 0.3], [0.3, 1]], 5000);
        var x = extractColumn(samples, 'param0');
        var y = extractColumn(samples, 'param1');
        expect(mean(x)).toBeCloseTo(10, 0);
        expect(mean(y)).toBeCloseTo(-5, 0);
        // SD check
        var sdX = Math.sqrt(x.reduce((s, v) => s + (v - mean(x)) ** 2, 0) / (x.length - 1));
        var sdY = Math.sqrt(y.reduce((s, v) => s + (v - mean(y)) ** 2, 0) / (y.length - 1));
        expect(sdX).toBeCloseTo(2, 0);
        expect(sdY).toBeCloseTo(3, 0);
    });

    // -----------------------------------------------------------------------
    // 11. gaussianCopula: beta marginals stay in [0,1]
    // -----------------------------------------------------------------------
    test('11. gaussianCopula beta marginals in [0,1]', () => {
        engine._rng = new PCG32(55);
        var marginals = [
            { name: 'u1', dist: { type: 'beta', alpha: 20, beta: 5 } },
            { name: 'u2', dist: { type: 'beta', alpha: 5, beta: 20 } }
        ];
        var samples = engine.gaussianCopula(marginals, [[1, 0.3], [0.3, 1]], 1000);
        for (var i = 0; i < samples.length; i++) {
            expect(samples[i].u1).toBeGreaterThanOrEqual(0);
            expect(samples[i].u1).toBeLessThanOrEqual(1);
            expect(samples[i].u2).toBeGreaterThanOrEqual(0);
            expect(samples[i].u2).toBeLessThanOrEqual(1);
        }
    });

    // -----------------------------------------------------------------------
    // 12. gaussianCopula: gamma marginals positive
    // -----------------------------------------------------------------------
    test('12. gaussianCopula gamma marginals are positive', () => {
        engine._rng = new PCG32(66);
        var marginals = [
            { name: 'cost', dist: { type: 'gamma', shape: 10, scale: 500 } }
        ];
        var samples = engine.gaussianCopula(marginals, [[1]], 1000);
        for (var i = 0; i < samples.length; i++) {
            expect(samples[i].cost).toBeGreaterThan(0);
        }
    });

    // -----------------------------------------------------------------------
    // 13. gaussianCopula: correlation structure preserved
    // -----------------------------------------------------------------------
    test('13. gaussianCopula preserves correlation structure', () => {
        engine._rng = new PCG32(77);
        var marginals = [
            { name: 'a', dist: { type: 'normal', mean: 0, sd: 1 } },
            { name: 'b', dist: { type: 'normal', mean: 0, sd: 1 } }
        ];
        var rho = 0.7;
        var samples = engine.gaussianCopula(marginals, [[1, rho], [rho, 1]], 5000);
        var x = extractColumn(samples, 'a');
        var y = extractColumn(samples, 'b');
        var r = pearsonCorr(x, y);
        expect(r).toBeCloseTo(rho, 1);
    });

    // -----------------------------------------------------------------------
    // 14. gaussianCopula: marginal distributions match specs
    // -----------------------------------------------------------------------
    test('14. gaussianCopula marginal distribution means', () => {
        engine._rng = new PCG32(88);
        var marginals = [
            { name: 'cost', dist: { type: 'gamma', shape: 10, scale: 500 } },
            { name: 'util', dist: { type: 'beta', alpha: 20, beta: 5 } }
        ];
        var samples = engine.gaussianCopula(marginals, [[1, -0.3], [-0.3, 1]], 5000);
        var costs = extractColumn(samples, 'cost');
        var utils = extractColumn(samples, 'util');
        // Gamma(10, 500) mean = 10*500 = 5000
        expect(mean(costs)).toBeCloseTo(5000, -2); // within 100
        // Beta(20, 5) mean = 20/25 = 0.8
        expect(mean(utils)).toBeCloseTo(0.8, 1);
    });

    // -----------------------------------------------------------------------
    // 15. normalCDF: Phi(0) = 0.5, Phi(-8) → 0, Phi(8) → 1
    // -----------------------------------------------------------------------
    test('15. normalCDF standard values', () => {
        var normalCDF = CorrelatedPSAEngine.normalCDF;
        expect(normalCDF(0)).toBeCloseTo(0.5, 8);
        expect(normalCDF(-8)).toBeCloseTo(0, 6);
        expect(normalCDF(8)).toBeCloseTo(1, 6);
    });

    // -----------------------------------------------------------------------
    // 16. normalCDF: Phi(1.96) ≈ 0.975
    // -----------------------------------------------------------------------
    test('16. normalCDF(1.96) ≈ 0.975', () => {
        var normalCDF = CorrelatedPSAEngine.normalCDF;
        expect(normalCDF(1.96)).toBeCloseTo(0.975, 3);
    });

    // -----------------------------------------------------------------------
    // 17. normalQuantile: Phi^{-1}(0.5) = 0, Phi^{-1}(0.975) ≈ 1.96
    // -----------------------------------------------------------------------
    test('17. normalQuantile standard values', () => {
        var normalQuantile = CorrelatedPSAEngine.normalQuantile;
        expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
        expect(normalQuantile(0.975)).toBeCloseTo(1.96, 2);
    });

    // -----------------------------------------------------------------------
    // 18. normalQuantile round-trip
    // -----------------------------------------------------------------------
    test('18. normalQuantile round-trip', () => {
        var normalCDF = CorrelatedPSAEngine.normalCDF;
        var normalQuantile = CorrelatedPSAEngine.normalQuantile;
        var testValues = [-2, -1, 0, 0.5, 1, 2, 2.5];
        for (var x of testValues) {
            var rt = normalQuantile(normalCDF(x));
            expect(rt).toBeCloseTo(x, 3);
        }
    });

    // -----------------------------------------------------------------------
    // 19. empiricalCorrelation: known data → known correlation
    // -----------------------------------------------------------------------
    test('19. empiricalCorrelation on known data', () => {
        var x = [1, 2, 3, 4, 5];
        var y = [2, 4, 6, 8, 10]; // y = 2x, perfect correlation
        var corr = engine.empiricalCorrelation([x, y]);
        expect(corr[0][0]).toBeCloseTo(1, 8);
        expect(corr[1][1]).toBeCloseTo(1, 8);
        expect(corr[0][1]).toBeCloseTo(1, 8);
        expect(corr[1][0]).toBeCloseTo(1, 8);
    });

    // -----------------------------------------------------------------------
    // 20. empiricalCorrelation: identical values → correlation 1 or NaN
    // -----------------------------------------------------------------------
    test('20. empiricalCorrelation: constant values', () => {
        var x = [5, 5, 5, 5];
        var y = [1, 2, 3, 4];
        var corr = engine.empiricalCorrelation([x, y]);
        expect(corr[1][1]).toBeCloseTo(1, 8);
        // x is constant, so corr(x,y) should be NaN
        expect(isNaN(corr[0][1])).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 21. runCorrelatedPSA: basic model run completes
    // -----------------------------------------------------------------------
    test('21. runCorrelatedPSA completes', () => {
        var modelFn = function(params) {
            return { costs: params.cost * 10, qalys: params.util * 5 };
        };
        var paramDefs = [
            { name: 'cost', dist: { type: 'gamma', shape: 10, scale: 100 } },
            { name: 'util', dist: { type: 'beta', alpha: 20, beta: 5 } }
        ];
        var corrMatrix = [[1, -0.3], [-0.3, 1]];
        var result = engine.runCorrelatedPSA(modelFn, paramDefs, corrMatrix, 200);
        expect(result.iterations.length).toBe(200);
        expect(result.summary.meanCost).toBeGreaterThan(0);
        expect(result.summary.meanQaly).toBeGreaterThan(0);
        expect(result.summary.ceac.length).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 22. runCorrelatedPSA: correlationCheck empirical ≈ specified
    // -----------------------------------------------------------------------
    test('22. runCorrelatedPSA correlation check', () => {
        var modelFn = function(params) {
            return { costs: params.a, qalys: params.b };
        };
        var paramDefs = [
            { name: 'a', dist: { type: 'normal', mean: 100, sd: 10 } },
            { name: 'b', dist: { type: 'normal', mean: 50, sd: 5 } }
        ];
        var corrMatrix = [[1, 0.6], [0.6, 1]];
        var result = engine.runCorrelatedPSA(modelFn, paramDefs, corrMatrix, 3000);
        var empCorr = result.correlationCheck.empirical;
        expect(empCorr[0][1]).toBeCloseTo(0.6, 1);
    });

    // -----------------------------------------------------------------------
    // 23. CEAC: probability cost-effective increases with WTP
    // -----------------------------------------------------------------------
    test('23. CEAC probability increases with WTP', () => {
        var modelFn = function(params) {
            return { costs: params.cost, qalys: params.util };
        };
        var paramDefs = [
            { name: 'cost', dist: { type: 'gamma', shape: 100, scale: 50 } },
            { name: 'util', dist: { type: 'beta', alpha: 80, beta: 20 } }
        ];
        var result = engine.runCorrelatedPSA(modelFn, paramDefs, [[1, 0], [0, 1]], 500);
        var ceac = result.summary.ceac;
        // At WTP=0, prob should be low (costs > 0, WTP * qaly = 0)
        expect(ceac[0].prob).toBeLessThan(0.5);
        // At high WTP, prob should be high
        var lastCeac = ceac[ceac.length - 1];
        expect(lastCeac.prob).toBeGreaterThan(ceac[0].prob);
    });

    // -----------------------------------------------------------------------
    // 24. Determinism: same seed → same PSA results
    // -----------------------------------------------------------------------
    test('24. Determinism: same seed gives same results', () => {
        var modelFn = function(params) {
            return { costs: params.cost * 2, qalys: params.util };
        };
        var paramDefs = [
            { name: 'cost', dist: { type: 'gamma', shape: 10, scale: 100 } },
            { name: 'util', dist: { type: 'beta', alpha: 20, beta: 5 } }
        ];
        var corrMatrix = [[1, -0.2], [-0.2, 1]];

        var e1 = new CorrelatedPSAEngine({ seed: 999 });
        var r1 = e1.runCorrelatedPSA(modelFn, paramDefs, corrMatrix, 100);
        var e2 = new CorrelatedPSAEngine({ seed: 999 });
        var r2 = e2.runCorrelatedPSA(modelFn, paramDefs, corrMatrix, 100);

        expect(r1.summary.meanCost).toBe(r2.summary.meanCost);
        expect(r1.summary.meanQaly).toBe(r2.summary.meanQaly);
        for (var i = 0; i < 100; i++) {
            expect(r1.iterations[i].costs).toBe(r2.iterations[i].costs);
        }
    });

    // -----------------------------------------------------------------------
    // 25. Edge: single parameter (no correlation needed)
    // -----------------------------------------------------------------------
    test('25. Single parameter PSA', () => {
        var modelFn = function(params) {
            return { costs: params.cost, qalys: 1 };
        };
        var paramDefs = [
            { name: 'cost', dist: { type: 'gamma', shape: 10, scale: 100 } }
        ];
        var corrMatrix = [[1]];
        var result = engine.runCorrelatedPSA(modelFn, paramDefs, corrMatrix, 100);
        expect(result.iterations.length).toBe(100);
        expect(result.summary.meanCost).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Extra: Cholesky values for [[1,0.5],[0.5,1]]
    // -----------------------------------------------------------------------
    test('26. Cholesky specific values', () => {
        var L = engine.cholesky([[1, 0.5], [0.5, 1]]);
        expect(L[0][0]).toBeCloseTo(1, 10);
        expect(L[1][0]).toBeCloseTo(0.5, 10);
        expect(L[1][1]).toBeCloseTo(Math.sqrt(0.75), 8);
    });

    // -----------------------------------------------------------------------
    // Extra: Gaussian copula with uniform marginal
    // -----------------------------------------------------------------------
    test('27. gaussianCopula with uniform marginal', () => {
        engine._rng = new PCG32(123);
        var marginals = [
            { name: 'x', dist: { type: 'uniform', min: 0, max: 10 } }
        ];
        var samples = engine.gaussianCopula(marginals, [[1]], 2000);
        var vals = extractColumn(samples, 'x');
        for (var v of vals) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(10);
        }
        expect(mean(vals)).toBeCloseTo(5, 0);
    });

    // -----------------------------------------------------------------------
    // Extra: Gaussian copula with exponential marginal
    // -----------------------------------------------------------------------
    test('28. gaussianCopula with exponential marginal', () => {
        engine._rng = new PCG32(456);
        var marginals = [
            { name: 'x', dist: { type: 'exponential', rate: 0.5 } }
        ];
        var samples = engine.gaussianCopula(marginals, [[1]], 2000);
        var vals = extractColumn(samples, 'x');
        for (var v of vals) {
            expect(v).toBeGreaterThan(0);
        }
        // Exponential(0.5) mean = 2
        expect(mean(vals)).toBeCloseTo(2, 0);
    });

    // -----------------------------------------------------------------------
    // Extra: Lognormal marginal in copula
    // -----------------------------------------------------------------------
    test('29. gaussianCopula with lognormal marginal', () => {
        engine._rng = new PCG32(789);
        var marginals = [
            { name: 'x', dist: { type: 'lognormal', meanlog: 0, sdlog: 0.5 } }
        ];
        var samples = engine.gaussianCopula(marginals, [[1]], 2000);
        var vals = extractColumn(samples, 'x');
        for (var v of vals) {
            expect(v).toBeGreaterThan(0);
        }
        // Lognormal(0, 0.5) mean = exp(0 + 0.5^2/2) = exp(0.125) ≈ 1.133
        expect(mean(vals)).toBeCloseTo(1.133, 0);
    });

    // -----------------------------------------------------------------------
    // Extra: unsupported marginal type throws
    // -----------------------------------------------------------------------
    test('30. gaussianCopula unsupported marginal throws', () => {
        engine._rng = new PCG32(111);
        var marginals = [
            { name: 'x', dist: { type: 'poisson', lambda: 3 } }
        ];
        expect(() => {
            engine.gaussianCopula(marginals, [[1]], 10);
        }).toThrow('Unsupported marginal distribution');
    });
});
