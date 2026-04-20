/**
 * Correlated Probabilistic Sensitivity Analysis Engine
 * Uses Cholesky decomposition and Gaussian copulas for correlated parameter sampling.
 *
 * Reference: RFC-005 Determinism Contract
 *
 * Features:
 * - Cholesky decomposition of correlation matrices
 * - Higham's alternating projections for nearest positive-definite matrix
 * - Correlated normal sampling
 * - Gaussian copula for non-normal marginals
 * - Full PSA run with correlated parameters
 * - Empirical correlation validation
 */

'use strict';

// ---------- Dependency resolution ----------

var PCG32Ref = (function() {
    if (typeof globalThis !== 'undefined' && globalThis.PCG32) return globalThis.PCG32;
    if (typeof require === 'function') { try { return require('../utils/pcg32').PCG32; } catch(e) {} }
    return null;
})();

// ---------- Math helpers ----------

/**
 * Standard normal CDF (Abramowitz & Stegun 26.2.17).
 * @param {number} x
 * @returns {number} Phi(x)
 */
function normalCDF(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    // Abramowitz & Stegun 7.1.26 approximation for erf(x)
    // erf(x) ≈ 1 - (a1*t + a2*t^2 + ... + a5*t^5) * exp(-x^2)
    // Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    var sign = 1;
    if (x < 0) { sign = -1; x = -x; }
    var xErf = x / Math.sqrt(2);
    var t = 1.0 / (1.0 + p * xErf);
    var erfApprox = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-xErf * xErf);
    return 0.5 * (1.0 + sign * erfApprox);
}

/**
 * Standard normal quantile (inverse CDF).
 * Rational approximation by Peter Acklam (accurate to ~1.15e-9).
 * @param {number} p - Probability in (0, 1)
 * @returns {number} z such that Phi(z) = p
 */
function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    // Coefficients for rational approximation
    var a = [
        -3.969683028665376e+01,
         2.209460984245205e+02,
        -2.759285104469687e+02,
         1.383577518672690e+02,
        -3.066479806614716e+01,
         2.506628277459239e+00
    ];
    var b = [
        -5.447609879822406e+01,
         1.615858368580409e+02,
        -1.556989798598866e+02,
         6.680131188771972e+01,
        -1.328068155288572e+01
    ];
    var c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e+00,
        -2.549732539343734e+00,
         4.374664141464968e+00,
         2.938163982698783e+00
    ];
    var d = [
         7.784695709041462e-03,
         3.224671290700398e-01,
         2.445134137142996e+00,
         3.754408661907416e+00
    ];

    var pLow = 0.02425;
    var pHigh = 1 - pLow;
    var q, r;

    if (p < pLow) {
        // Rational approximation for lower region
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
        // Rational approximation for central region
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
        // Rational approximation for upper region
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
}

/**
 * Gamma function via Lanczos approximation.
 */
function gammaFunction(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gammaFunction(1 - z));
    }
    z -= 1;
    var g = 7;
    var coeff = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];
    var x = coeff[0];
    for (var i = 1; i < g + 2; i++) {
        x += coeff[i] / (z + i);
    }
    var t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Log-gamma function.
 */
function logGamma(z) {
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    z -= 1;
    var g = 7;
    var coeff = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];
    var x = coeff[0];
    for (var i = 1; i < g + 2; i++) {
        x += coeff[i] / (z + i);
    }
    var t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Lower regularized incomplete gamma function P(a, x).
 * Uses series expansion (converges well for all x when enough terms are used).
 */
function gammaCDF(a, x) {
    if (x < 0) return 0;
    if (x === 0) return 0;

    // Series expansion: P(a,x) = exp(-x + a*ln(x) - lnGamma(a)) * sum_{n=0}^{inf} x^n / (a*(a+1)*...*(a+n))
    var sum = 0;
    var term = 1.0 / a;
    sum = term;
    for (var n = 1; n < 1000; n++) {
        term *= x / (a + n);
        sum += term;
        if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
    }
    var result = sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    return Math.min(Math.max(result, 0), 1);
}

/**
 * Inverse gamma CDF via bisection + Newton hybrid.
 * Find x such that P(shape, x) = p, then multiply by scale.
 */
function gammaQuantile(shape, scale, p) {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;

    var a = shape;

    // Initial guess using Wilson-Hilferty approximation
    var z = normalQuantile(p);
    var x;

    if (a >= 1) {
        var wh = 1 - 2 / (9 * a) + z * Math.sqrt(2 / (9 * a));
        x = a * Math.pow(Math.max(wh, 0.001), 3);
    } else {
        x = Math.pow(p * gammaFunction(a + 1), 1 / a);
        if (x < 0.01) x = 0.01;
    }

    // Establish bisection bounds
    var lo = 0, hi = Math.max(x * 4, a * 4);
    // Widen hi until gammaCDF(a, hi) > p
    for (var w = 0; w < 60; w++) {
        if (gammaCDF(a, hi) >= p) break;
        hi *= 2;
    }

    // Bisection with Newton acceleration
    for (var iter = 0; iter < 80; iter++) {
        var cdf = gammaCDF(a, x);
        var err = cdf - p;
        if (Math.abs(err) < 1e-12) break;

        // Update bisection bounds
        if (err < 0) {
            lo = x;
        } else {
            hi = x;
        }

        // Try Newton step
        var logPdf = (a - 1) * Math.log(Math.max(x, 1e-300)) - x - logGamma(a);
        var pdf = Math.exp(logPdf);
        var xNew;

        if (pdf > 1e-30) {
            var delta = err / pdf;
            xNew = x - delta;
        } else {
            xNew = -1; // Force bisection
        }

        // If Newton step is out of bounds, use bisection
        if (xNew <= lo || xNew >= hi || !isFinite(xNew)) {
            xNew = (lo + hi) / 2;
        }

        if (Math.abs(xNew - x) < 1e-12 * Math.max(x, 1e-10)) break;
        x = xNew;
    }

    return x * scale;
}

/**
 * Beta CDF via regularized incomplete beta function.
 * Uses continued fraction expansion.
 */
function betaCDF(alpha, beta, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    var logBeta = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);

    if (x > (alpha + 1) / (alpha + beta + 2)) {
        return 1 - betaCDF(beta, alpha, 1 - x);
    }

    var front = Math.exp(alpha * Math.log(x) + beta * Math.log(1 - x) - logBeta) / alpha;

    // Lentz continued fraction
    var f = 1, c = 1, d = 0;
    for (var i = 0; i <= 200; i++) {
        var m = Math.floor(i / 2);
        var numerator;
        if (i === 0) {
            numerator = 1;
        } else if (i % 2 === 0) {
            numerator = m * (beta - m) * x / ((alpha + 2 * m - 1) * (alpha + 2 * m));
        } else {
            numerator = -((alpha + m) * (alpha + beta + m) * x) / ((alpha + 2 * m) * (alpha + 2 * m + 1));
        }
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        d = 1 / d;
        c = 1 + numerator / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        f *= c * d;
        if (Math.abs(c * d - 1) < 1e-12) break;
    }

    return front * (f - 1);
}

/**
 * Inverse beta CDF via Newton's method.
 */
function betaQuantile(alpha, beta, p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;

    // Initial guess
    var x = 0.5;

    // Better initial guess using normal approximation for large alpha+beta
    var mu = alpha / (alpha + beta);
    var variance = (alpha * beta) / ((alpha + beta) * (alpha + beta) * (alpha + beta + 1));
    var sd = Math.sqrt(variance);
    var z = normalQuantile(p);
    x = Math.min(Math.max(mu + z * sd, 0.001), 0.999);

    var logBetaAB = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);

    for (var iter = 0; iter < 80; iter++) {
        var cdf = betaCDF(alpha, beta, x);
        var logPdf = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logBetaAB;
        var pdf = Math.exp(logPdf);
        if (pdf < 1e-30) {
            // nudge toward the correct direction
            if (cdf < p) x = x + (1 - x) * 0.1;
            else x = x * 0.9;
            continue;
        }
        var delta = (cdf - p) / pdf;
        x = x - delta;
        x = Math.min(Math.max(x, 1e-10), 1 - 1e-10);
        if (Math.abs(delta) < 1e-12) break;
    }

    return x;
}

// ---------- CorrelatedPSAEngine ----------

class CorrelatedPSAEngine {
    /**
     * @param {Object} options
     * @param {number} [options.seed=12345]
     * @param {number} [options.nIterations=1000]
     */
    constructor(options) {
        options = options || {};
        this.seed = options.seed != null ? options.seed : 12345;
        this.nIterations = options.nIterations != null ? options.nIterations : 1000;
        this._rng = null; // Lazy init — deferred until stochastic methods need it
    }

    /**
     * Lazy RNG accessor. Creates PCG32 on first use so the constructor
     * does not crash when PCG32Ref is null (P0-9).
     * @returns {Object} PCG32 instance
     */
    _getRng() {
        if (!this._rng) {
            if (!PCG32Ref) throw new Error('PCG32 dependency required for stochastic methods');
            this._rng = new PCG32Ref(this.seed);
        }
        return this._rng;
    }

    /**
     * Cholesky decomposition of a symmetric positive-definite matrix.
     * Returns lower-triangular L such that L * L^T = A.
     * @param {number[][]} matrix - Symmetric positive-definite matrix
     * @returns {number[][]} Lower triangular matrix L
     */
    cholesky(matrix) {
        var n = matrix.length;
        var L = [];
        for (var i = 0; i < n; i++) {
            L[i] = new Array(n).fill(0);
        }

        for (var i = 0; i < n; i++) {
            for (var j = 0; j <= i; j++) {
                var sum = 0;
                for (var k = 0; k < j; k++) {
                    sum += L[i][k] * L[j][k];
                }

                if (i === j) {
                    var diag = matrix[i][i] - sum;
                    if (diag <= 0) {
                        throw new Error('Matrix is not positive definite (diagonal element ' + i + ' = ' + diag + ')');
                    }
                    L[i][j] = Math.sqrt(diag);
                } else {
                    L[i][j] = (matrix[i][j] - sum) / L[j][j];
                }
            }
        }

        return L;
    }

    /**
     * Nearest positive-definite matrix using Higham's alternating projections.
     * @param {number[][]} matrix - Input symmetric matrix (may not be PD)
     * @returns {number[][]} Nearest positive-definite matrix
     */
    nearestPD(matrix) {
        var n = matrix.length;

        // Check if already PD
        try {
            this.cholesky(matrix);
            // Deep copy to avoid aliasing
            var copy = [];
            for (var i = 0; i < n; i++) {
                copy[i] = matrix[i].slice();
            }
            return copy;
        } catch (e) {
            // Not PD, proceed with Higham's algorithm
        }

        // Symmetrize
        var B = [];
        for (var i = 0; i < n; i++) {
            B[i] = new Array(n);
            for (var j = 0; j < n; j++) {
                B[i][j] = (matrix[i][j] + matrix[j][i]) / 2;
            }
        }

        // Simple iterative approach: eigenvalue clipping
        // For small matrices, use power iteration / Jacobi eigenvalue algorithm
        // Simplified: repeatedly clip negative eigenvalues
        for (var iter = 0; iter < 100; iter++) {
            // Compute eigenvalues via Jacobi for symmetric matrix
            var eig = this._jacobiEigen(B);
            var eigenvalues = eig.eigenvalues;
            var eigenvectors = eig.eigenvectors;

            // Clip eigenvalues to be positive
            var minEig = 1e-10;
            var anyNegative = false;
            for (var i = 0; i < n; i++) {
                if (eigenvalues[i] < minEig) {
                    eigenvalues[i] = minEig;
                    anyNegative = true;
                }
            }

            // Reconstruct: B = V * diag(clippedEigs) * V^T
            var newB = [];
            for (var i = 0; i < n; i++) {
                newB[i] = new Array(n).fill(0);
                for (var j = 0; j < n; j++) {
                    var val = 0;
                    for (var k = 0; k < n; k++) {
                        val += eigenvectors[i][k] * eigenvalues[k] * eigenvectors[j][k];
                    }
                    newB[i][j] = val;
                }
            }

            // Force unit diagonal (correlation matrix)
            for (var i = 0; i < n; i++) {
                var dii = Math.sqrt(newB[i][i]);
                for (var j = 0; j < n; j++) {
                    var djj = Math.sqrt(newB[j][j]);
                    newB[i][j] = newB[i][j] / (dii * djj);
                }
            }

            B = newB;

            if (!anyNegative) break;

            // Check PD
            try {
                this.cholesky(B);
                break;
            } catch (e) {
                // continue iteration
            }
        }

        return B;
    }

    /**
     * Jacobi eigenvalue algorithm for symmetric matrices.
     * @param {number[][]} A - Symmetric matrix
     * @returns {{eigenvalues: number[], eigenvectors: number[][]}}
     */
    _jacobiEigen(A) {
        var n = A.length;
        var S = [];
        for (var i = 0; i < n; i++) {
            S[i] = A[i].slice();
        }
        // V = identity
        var V = [];
        for (var i = 0; i < n; i++) {
            V[i] = new Array(n).fill(0);
            V[i][i] = 1;
        }

        for (var sweep = 0; sweep < 100; sweep++) {
            // Find largest off-diagonal element
            var maxVal = 0, p = 0, q = 1;
            for (var i = 0; i < n; i++) {
                for (var j = i + 1; j < n; j++) {
                    if (Math.abs(S[i][j]) > maxVal) {
                        maxVal = Math.abs(S[i][j]);
                        p = i;
                        q = j;
                    }
                }
            }
            if (maxVal < 1e-15) break;

            // Compute rotation
            var theta;
            if (Math.abs(S[p][p] - S[q][q]) < 1e-30) {
                theta = Math.PI / 4;
            } else {
                theta = 0.5 * Math.atan2(2 * S[p][q], S[p][p] - S[q][q]);
            }
            var cosT = Math.cos(theta);
            var sinT = Math.sin(theta);

            // Apply Givens rotation
            var newS = [];
            for (var i = 0; i < n; i++) {
                newS[i] = S[i].slice();
            }

            for (var i = 0; i < n; i++) {
                if (i !== p && i !== q) {
                    newS[i][p] = cosT * S[i][p] + sinT * S[i][q];
                    newS[p][i] = newS[i][p];
                    newS[i][q] = -sinT * S[i][p] + cosT * S[i][q];
                    newS[q][i] = newS[i][q];
                }
            }
            newS[p][p] = cosT * cosT * S[p][p] + 2 * sinT * cosT * S[p][q] + sinT * sinT * S[q][q];
            newS[q][q] = sinT * sinT * S[p][p] - 2 * sinT * cosT * S[p][q] + cosT * cosT * S[q][q];
            newS[p][q] = 0;
            newS[q][p] = 0;

            S = newS;

            // Update eigenvectors
            for (var i = 0; i < n; i++) {
                var vip = V[i][p];
                var viq = V[i][q];
                V[i][p] = cosT * vip + sinT * viq;
                V[i][q] = -sinT * vip + cosT * viq;
            }
        }

        var eigenvalues = [];
        for (var i = 0; i < n; i++) {
            eigenvalues[i] = S[i][i];
        }

        return { eigenvalues: eigenvalues, eigenvectors: V };
    }

    /**
     * Generate n correlated normal samples.
     * @param {number[]} means - Array of means
     * @param {number[]} sds - Array of standard deviations
     * @param {number[][]} corrMatrix - Correlation matrix
     * @param {number} n - Number of samples
     * @param {string[]} [names] - Optional parameter names (P2-6: use instead of generic param0/param1)
     * @returns {Object[]} Array of n objects with parameter values
     */
    correlatedNormal(means, sds, corrMatrix, n, names) {
        var k = means.length;
        var L = this.cholesky(corrMatrix);
        var samples = [];
        var rng = this._getRng();

        for (var iter = 0; iter < n; iter++) {
            // Generate k independent standard normals
            var z = [];
            for (var j = 0; j < k; j++) {
                z[j] = rng.normal(0, 1);
            }

            // Multiply by L to get correlated normals
            var correlated = new Array(k).fill(0);
            for (var i = 0; i < k; i++) {
                var sum = 0;
                for (var j = 0; j <= i; j++) {
                    sum += L[i][j] * z[j];
                }
                correlated[i] = sum;
            }

            // Scale by means and sds
            // P2-6: Use provided names if available, fallback to param0/param1
            var sample = {};
            for (var i = 0; i < k; i++) {
                var key = (names && names[i]) ? names[i] : ('param' + i);
                sample[key] = means[i] + sds[i] * correlated[i];
            }
            samples.push(sample);
        }

        return samples;
    }

    /**
     * Gaussian copula for non-normal marginals.
     * @param {Object[]} marginals - [{name, dist: {type, ...params}}]
     * @param {number[][]} corrMatrix - Correlation matrix on Gaussian scale
     * @param {number} n - Number of samples
     * @returns {Object[]} Array of n objects with named parameter values
     */
    gaussianCopula(marginals, corrMatrix, n) {
        var k = marginals.length;
        var means = new Array(k).fill(0);
        var sds = new Array(k).fill(1);
        var L = this.cholesky(corrMatrix);
        var samples = [];
        var rng = this._getRng();

        for (var iter = 0; iter < n; iter++) {
            // Generate k independent standard normals
            var z = [];
            for (var j = 0; j < k; j++) {
                z[j] = rng.normal(0, 1);
            }

            // Correlated standard normals
            var correlated = new Array(k).fill(0);
            for (var i = 0; i < k; i++) {
                var sum = 0;
                for (var j = 0; j <= i; j++) {
                    sum += L[i][j] * z[j];
                }
                correlated[i] = sum;
            }

            // Transform through standard normal CDF to get uniform [0,1]
            var uniforms = [];
            for (var i = 0; i < k; i++) {
                uniforms[i] = normalCDF(correlated[i]);
                // Clamp to avoid exact 0 or 1
                uniforms[i] = Math.min(Math.max(uniforms[i], 1e-10), 1 - 1e-10);
            }

            // Apply inverse CDF of each marginal distribution
            var sample = {};
            for (var i = 0; i < k; i++) {
                var marg = marginals[i];
                var u = uniforms[i];
                sample[marg.name] = this._inverseCDF(marg.dist, u);
            }

            samples.push(sample);
        }

        return samples;
    }

    /**
     * Inverse CDF for supported distributions.
     */
    _inverseCDF(dist, u) {
        switch (dist.type) {
            case 'normal':
                return dist.mean + dist.sd * normalQuantile(u);

            case 'lognormal': {
                var z = normalQuantile(u);
                return Math.exp(dist.meanlog + dist.sdlog * z);
            }

            case 'gamma':
                return gammaQuantile(dist.shape, dist.scale, u);

            case 'beta':
                return betaQuantile(dist.alpha, dist.beta, u);

            case 'uniform':
                return dist.min + (dist.max - dist.min) * u;

            case 'exponential':
                return -Math.log(1 - u) / dist.rate;

            default:
                throw new Error('Unsupported marginal distribution for copula: ' + dist.type);
        }
    }

    /**
     * Run full correlated PSA.
     * @param {Function} model - Function(params) => {costs, qalys}
     * @param {Object[]} paramDefs - [{name, dist: {type, ...}}]
     * @param {number[][]} corrMatrix - Correlation matrix
     * @param {number} [n] - Number of iterations
     * @returns {Object} PSA results
     */
    runCorrelatedPSA(model, paramDefs, corrMatrix, n) {
        n = (n !== undefined && n !== null) ? n : this.nIterations;

        // Reset RNG for reproducibility
        if (!PCG32Ref) throw new Error('PCG32 dependency required for stochastic methods');
        this._rng = new PCG32Ref(this.seed);

        // Generate correlated samples via Gaussian copula
        var samples = this.gaussianCopula(paramDefs, corrMatrix, n);

        var iterations = [];
        var allCosts = [];
        var allQalys = [];

        for (var i = 0; i < n; i++) {
            var result = model(samples[i]);
            var costs = result.costs;
            var qalys = result.qalys;
            var icer = qalys !== 0 ? costs / qalys : Infinity;

            iterations.push({
                params: samples[i],
                costs: costs,
                qalys: qalys,
                icer: icer
            });
            allCosts.push(costs);
            allQalys.push(qalys);
        }

        // Summary statistics
        var meanCost = allCosts.reduce(function(a, b) { return a + b; }, 0) / n;
        var meanQaly = allQalys.reduce(function(a, b) { return a + b; }, 0) / n;
        var meanICER = meanQaly !== 0 ? meanCost / meanQaly : Infinity;

        // CEAC: for each WTP threshold, count iterations where ICER < WTP
        var wtpValues = [];
        for (var wtp = 0; wtp <= 100000; wtp += 5000) {
            wtpValues.push(wtp);
        }
        var ceac = [];
        for (var w = 0; w < wtpValues.length; w++) {
            var wtp = wtpValues[w];
            var count = 0;
            for (var i = 0; i < n; i++) {
                // Net monetary benefit: NMB = QALYs * WTP - Costs
                // Cost-effective if NMB > 0, i.e. Costs < QALYs * WTP
                var nmb = iterations[i].qalys * wtp - iterations[i].costs;
                if (nmb >= 0) count++;
            }
            ceac.push({ wtp: wtp, prob: count / n });
        }

        // Empirical correlation check
        var paramNames = paramDefs.map(function(pd) { return pd.name; });
        var sampleArrays = [];
        for (var j = 0; j < paramDefs.length; j++) {
            var arr = [];
            for (var i = 0; i < n; i++) {
                arr.push(samples[i][paramNames[j]]);
            }
            sampleArrays.push(arr);
        }
        var empirical = this.empiricalCorrelation(sampleArrays);

        return {
            iterations: iterations,
            summary: {
                meanCost: meanCost,
                meanQaly: meanQaly,
                meanICER: meanICER,
                ceac: ceac
            },
            correlationCheck: {
                specified: corrMatrix,
                empirical: empirical
            }
        };
    }

    /**
     * Compute empirical Pearson correlation matrix from arrays of samples.
     * @param {number[][]} sampleArrays - Array of k arrays, each of length n
     * @returns {number[][]} k x k correlation matrix
     */
    empiricalCorrelation(sampleArrays) {
        var k = sampleArrays.length;
        if (k === 0) return [];
        var n = sampleArrays[0].length;

        // Compute means
        var means = [];
        for (var i = 0; i < k; i++) {
            var sum = 0;
            for (var j = 0; j < n; j++) {
                sum += sampleArrays[i][j];
            }
            means[i] = sum / n;
        }

        // Compute covariance matrix
        var cov = [];
        for (var i = 0; i < k; i++) {
            cov[i] = new Array(k).fill(0);
        }

        for (var i = 0; i < k; i++) {
            for (var j = i; j < k; j++) {
                var sum = 0;
                for (var s = 0; s < n; s++) {
                    sum += (sampleArrays[i][s] - means[i]) * (sampleArrays[j][s] - means[j]);
                }
                cov[i][j] = sum / (n - 1);
                cov[j][i] = cov[i][j];
            }
        }

        // Convert to correlation
        var corr = [];
        for (var i = 0; i < k; i++) {
            corr[i] = new Array(k);
            for (var j = 0; j < k; j++) {
                var denom = Math.sqrt(cov[i][i] * cov[j][j]);
                if (denom < 1e-30) {
                    corr[i][j] = (i === j) ? 1 : NaN;
                } else {
                    corr[i][j] = cov[i][j] / denom;
                }
            }
        }

        return corr;
    }

    /**
     * Compute multi-comparator CEAC: for each WTP, the probability
     * that each strategy has the highest net monetary benefit (NMB).
     *
     * NOTE: The single-strategy runCorrelatedPSA CEAC only checks NMB >= 0
     * for a 2-strategy comparison. This static method handles k >= 2
     * strategies by comparing pre-computed iteration results.
     *
     * @param {Object[]} strategyResults - [{name, iterations: [{costs, qalys}, ...]}, ...]
     * @param {number[]} wtpRange - array of WTP thresholds, e.g. [0, 5000, 10000, ...]
     * @returns {Object[]} [{wtp, probabilities: {strategyName: prob, ...}}, ...]
     */
    static computeCEAC(strategyResults, wtpRange) {
        if (!Array.isArray(strategyResults) || strategyResults.length === 0) {
            throw new Error('strategyResults must be a non-empty array');
        }
        if (!Array.isArray(wtpRange) || wtpRange.length === 0) {
            throw new Error('wtpRange must be a non-empty array');
        }

        var nIter = strategyResults[0].iterations.length;
        for (var s = 1; s < strategyResults.length; s++) {
            if (strategyResults[s].iterations.length !== nIter) {
                throw new Error('All strategies must have the same number of iterations');
            }
        }

        var ceac = [];
        for (var w = 0; w < wtpRange.length; w++) {
            var wtp = wtpRange[w];
            var counts = {};
            for (var s = 0; s < strategyResults.length; s++) {
                counts[strategyResults[s].name] = 0;
            }

            for (var i = 0; i < nIter; i++) {
                var bestNMB = -Infinity;
                var bestName = null;
                for (var s = 0; s < strategyResults.length; s++) {
                    var iter = strategyResults[s].iterations[i];
                    var nmb = iter.qalys * wtp - iter.costs;
                    if (nmb > bestNMB) {
                        bestNMB = nmb;
                        bestName = strategyResults[s].name;
                    }
                }
                if (bestName !== null) {
                    counts[bestName]++;
                }
            }

            var probabilities = {};
            for (var s = 0; s < strategyResults.length; s++) {
                probabilities[strategyResults[s].name] = counts[strategyResults[s].name] / nIter;
            }
            ceac.push({ wtp: wtp, probabilities: probabilities });
        }

        return ceac;
    }
}

// Expose helper functions as static methods for testing
CorrelatedPSAEngine.normalCDF = normalCDF;
CorrelatedPSAEngine.normalQuantile = normalQuantile;

// ---------- Export ----------

if (typeof window !== 'undefined') {
    window.CorrelatedPSAEngine = CorrelatedPSAEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CorrelatedPSAEngine };
}
