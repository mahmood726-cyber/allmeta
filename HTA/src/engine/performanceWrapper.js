/**
 * HTA Artifact Standard - Performance Wrapper
 * Wraps existing frontierMeta.js classes with high-performance implementations
 *
 * Usage:
 *   const { accelerate } = require('./performanceWrapper');
 *   const FastIPDMetaAnalysis = accelerate(IPDMetaAnalysis);
 *   const analysis = new FastIPDMetaAnalysis();
 */

'use strict';

// Environment-aware module loading
let PerformanceEngine, SIMDVectorizer, ComputationCache, MemoryPool, Environment;

if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    const perfEngine = require('./performanceEngine');
    PerformanceEngine = perfEngine.PerformanceEngine;
    SIMDVectorizer = perfEngine.SIMDVectorizer;
    ComputationCache = perfEngine.ComputationCache;
    MemoryPool = perfEngine.MemoryPool;
    Environment = perfEngine.Environment;
} else if (typeof window !== 'undefined') {
    // Browser environment - assumes performanceEngine.js is loaded via script tag
    PerformanceEngine = window.PerformanceEngine || self.PerformanceEngine;
    SIMDVectorizer = window.SIMDVectorizer || self.SIMDVectorizer;
    ComputationCache = window.ComputationCache || self.ComputationCache;
    MemoryPool = window.MemoryPool || self.MemoryPool;
    Environment = window.Environment || self.Environment;
}

// Fallback Environment if not available
if (!Environment) {
    Environment = {
        isBrowser: typeof window !== 'undefined',
        isNode: typeof process !== 'undefined' && process.versions != null,
        get hardwareConcurrency() {
            if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
                return navigator.hardwareConcurrency;
            }
            return 4;
        }
    };
}

// Global performance engine instance
let engine = null;
const simd = SIMDVectorizer ? new SIMDVectorizer() : null;
const cache = ComputationCache ? new ComputationCache({ maxSize: 500, ttl: 600000 }) : null;
const memoryPool = MemoryPool ? new MemoryPool() : null;

async function getEngine() {
    if (!engine) {
        if (!PerformanceEngine) {
            return null;
        }
        engine = new PerformanceEngine();
        await engine.initialize();
    }
    return engine;
}

// ============================================================================
// FAST MATH UTILITIES
// ============================================================================

const FastMath = {
    // Fast normal CDF (Hastings approximation)
    normCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    },

    // Fast normal quantile (Beasley-Springer-Moro)
    normQuantile(p) {
        const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00];
        const d = [0, 7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00];

        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[1] * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6]) /
                   ((((d[1] * q + d[2]) * q + d[3]) * q + d[4]) * q + 1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[1] * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * r + a[6]) * q /
                   (((((b[1] * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5]) * r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[1] * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6]) /
                    ((((d[1] * q + d[2]) * q + d[3]) * q + d[4]) * q + 1);
        }
    },

    // Fast log-gamma (Stirling approximation for large values)
    lgamma(x) {
        if (x < 0.5) {
            return Math.log(Math.PI / Math.sin(Math.PI * x)) - this.lgamma(1 - x);
        }
        x -= 1;
        const g = 7;
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        let sum = c[0];
        for (let i = 1; i < g + 2; i++) sum += c[i] / (x + i);
        const t = x + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
    },

    // Fast beta function
    lbeta(a, b) {
        return this.lgamma(a) + this.lgamma(b) - this.lgamma(a + b);
    },

    // Chi-squared CDF
    chiSquaredCDF(x, df) {
        if (x <= 0) return 0;
        return this._gammainc(df / 2, x / 2);
    },

    _gammainc(a, x) {
        // Regularized incomplete gamma function (lower)
        if (x < 0 || a <= 0) return 0;
        if (x === 0) return 0;

        if (x < a + 1) {
            // Series representation
            let sum = 1 / a, term = 1 / a;
            for (let n = 1; n < 100; n++) {
                term *= x / (a + n);
                sum += term;
                if (Math.abs(term) < 1e-12) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this.lgamma(a));
        } else {
            // Continued fraction
            let f = 1 + x - a, c = f, d = 0;
            for (let i = 1; i < 100; i++) {
                const an = i * (a - i);
                const bn = (2 * i + 1) + x - a;
                d = bn + an * d;
                if (Math.abs(d) < 1e-30) d = 1e-30;
                c = bn + an / c;
                if (Math.abs(c) < 1e-30) c = 1e-30;
                d = 1 / d;
                const delta = c * d;
                f *= delta;
                if (Math.abs(delta - 1) < 1e-12) break;
            }
            return 1 - Math.exp(-x + a * Math.log(x) - this.lgamma(a)) / f;
        }
    },

    // t-distribution quantile function (for HKSJ adjustment)
    tQuantile(p, df) {
        // Hill's algorithm for t-quantile
        if (df > 100) {
            return this.normQuantile(p);
        }

        const x = this.normQuantile(p);
        const g1 = (x * x * x + x) / 4;
        const g2 = (5 * Math.pow(x, 5) + 16 * x * x * x + 3 * x) / 96;
        const g3 = (3 * Math.pow(x, 7) + 19 * Math.pow(x, 5) + 17 * x * x * x - 15 * x) / 384;

        return x + g1 / df + g2 / (df * df) + g3 / (df * df * df);
    },

    // t-distribution CDF
    tCDF(x, df) {
        const t2 = x * x;
        return 1 - 0.5 * this._betaInc(df / 2, 0.5, df / (df + t2));
    },

    // Incomplete beta function for t-distribution
    _betaInc(a, b, x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        const lbeta = this.lgamma(a) + this.lgamma(b) - this.lgamma(a + b);
        const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;

        let f = 1, c = 1, d = 0;
        for (let m = 0; m <= 100; m++) {
            const m2 = 2 * m;

            let an = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
            d = 1 + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            f *= c * d;

            an = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
            d = 1 + an * d;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = 1 + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const delta = c * d;
            f *= delta;

            if (Math.abs(delta - 1) < 1e-10) break;
        }

        return front * f;
    }
};

// ============================================================================
// OPTIMIZED CORE ALGORITHMS
// ============================================================================

const OptimizedAlgorithms = {
    // Optimized DerSimonian-Laird with HKSJ adjustment and prediction intervals
    derSimonianLaird(effects, variances, options = {}) {
        const n = effects.length;
        const useHKSJ = options.hksj !== false; // Default to HKSJ

        if (n === 0) return { effect: 0, se: 0, tau2: 0, tau: 0, I2: 0, H2: 1, Q: 0, df: 0, pQ: 1, ci: [0, 0], predictionInterval: { lower: null, upper: null } };
        if (n === 1) return { effect: effects[0], se: Math.sqrt(variances[0] || 1), tau2: 0, tau: 0, I2: 0, H2: 1, Q: 0, df: 0, pQ: 1, ci: [effects[0], effects[0]], predictionInterval: { lower: null, upper: null } };

        // Use typed arrays for performance (fallback if memoryPool not available)
        const w = memoryPool ? memoryPool.acquire(Float64Array, n) : new Float64Array(n);

        let sumW = 0, sumWY = 0, sumW2 = 0;

        // Vectorized weight calculation with protection against zero variance
        for (let i = 0; i < n; i++) {
            const v = variances[i] > 0 ? variances[i] : 1e-10;
            w[i] = 1 / v;
            sumW += w[i];
            sumWY += w[i] * effects[i];
            sumW2 += w[i] * w[i];
        }

        // Protect against sumW = 0 (shouldn't happen after above fix)
        if (sumW <= 0) sumW = 1e-10;

        const muFE = sumWY / sumW;

        // Calculate Q statistic
        let Q = 0;
        for (let i = 0; i < n; i++) {
            Q += w[i] * (effects[i] - muFE) ** 2;
        }

        const C = sumW - sumW2 / sumW;
        const tau2 = C > 0 ? Math.max(0, (Q - (n - 1)) / C) : 0;

        // Random-effects estimate
        const wRE = memoryPool ? memoryPool.acquire(Float64Array, n) : new Float64Array(n);
        let sumWRE = 0, sumWREY = 0;
        for (let i = 0; i < n; i++) {
            const denom = variances[i] + tau2;
            wRE[i] = denom > 0 ? 1 / denom : 1e10;
            sumWRE += wRE[i];
            sumWREY += wRE[i] * effects[i];
        }

        // Protect against division by zero
        if (sumWRE <= 0) sumWRE = 1e-10;

        const theta = sumWREY / sumWRE;
        const varTheta = 1 / sumWRE;
        let se = Math.sqrt(varTheta);

        // HKSJ adjustment (Hartung-Knapp-Sidik-Jonkman)
        let qHKSJ = 1;
        if (useHKSJ && n > 1) {
            let qSum = 0;
            for (let i = 0; i < n; i++) {
                qSum += wRE[i] * (effects[i] - theta) ** 2;
            }
            qHKSJ = qSum / (n - 1);
            qHKSJ = Math.max(1, qHKSJ); // Never make CI narrower
        }

        const varHKSJ = varTheta * qHKSJ;
        const seHKSJ = Math.sqrt(varHKSJ);

        // Use t-distribution with HKSJ
        const zCrit = FastMath.normQuantile(0.975);
        const tCrit = useHKSJ ? FastMath.tQuantile(0.975, n - 1) : zCrit;
        const finalSE = useHKSJ ? seHKSJ : se;

        if (memoryPool) {
            memoryPool.release(w);
            memoryPool.release(wRE);
        }

        const I2 = Q > n - 1 ? ((Q - (n - 1)) / Q) * 100 : 0;
        const H2 = n > 1 ? Q / (n - 1) : 1;

        // I² confidence interval (Q-profile method)
        const I2CI = this._calculateI2CI(Q, n);

        // Prediction interval (Riley et al., 2011)
        const predictionInterval = this._calculatePredictionInterval(theta, tau2, finalSE, n);

        return {
            effect: theta,
            se: finalSE,
            seStandard: se,
            tau2,
            tau: Math.sqrt(tau2),
            I2,
            I2CI,
            H2,
            Q,
            df: n - 1,
            pQ: 1 - FastMath.chiSquaredCDF(Q, n - 1),
            ci: [theta - tCrit * finalSE, theta + tCrit * finalSE],
            ciStandard: [theta - zCrit * se, theta + zCrit * se],
            predictionInterval,
            hksjFactor: qHKSJ,
            k: n,
            method: 'DL',
            adjustment: useHKSJ ? 'HKSJ' : 'none'
        };
    },

    // Calculate I² confidence interval using Q-profile method
    _calculateI2CI(Q, k, alpha = 0.05) {
        if (k < 2) return { lower: 0, upper: 0 };
        const df = k - 1;

        let lower = 0, upper = 0;
        if (Q > df) {
            const B = 0.5 * Math.log(Q / df);
            const seB = Math.sqrt(0.5 / df);
            const zCritI2 = FastMath.normQuantile(1 - alpha / 2);
            const BLower = B - zCritI2 * seB;
            const BUpper = B + zCritI2 * seB;
            lower = Math.max(0, (1 - Math.exp(-2 * BLower)) * 100);
            upper = Math.min(100, (1 - Math.exp(-2 * BUpper)) * 100);
        }
        return { lower, upper, method: 'Q-profile' };
    },

    // Calculate prediction interval
    _calculatePredictionInterval(theta, tau2, se, k) {
        if (k < 3) return { lower: null, upper: null, message: 'Requires ≥3 studies' };
        const tCrit = FastMath.tQuantile(0.975, k - 2);
        const predSE = Math.sqrt(se * se + tau2);
        return {
            lower: theta - tCrit * predSE,
            upper: theta + tCrit * predSE,
            se: predSE,
            df: k - 2
        };
    },

    // Optimized REML with HKSJ adjustment and prediction intervals
    reml(effects, variances, options = {}) {
        const maxIter = options.maxIter || 100;
        const tol = options.tol || 1e-8;
        const useHKSJ = options.hksj !== false; // Default to HKSJ

        const n = effects.length;
        if (n === 0) return { effect: 0, se: 0, tau2: 0, tau: 0, ci: [0, 0], predictionInterval: { lower: null, upper: null } };
        if (n === 1) return { effect: effects[0], se: Math.sqrt(variances[0] || 1), tau2: 0, tau: 0, ci: [effects[0], effects[0]], predictionInterval: { lower: null, upper: null } };

        // Initial estimate using DL
        let tau2 = this.derSimonianLaird(effects, variances, { hksj: false }).tau2;

        for (let iter = 0; iter < maxIter; iter++) {
            let sumW = 0, sumWY = 0, sumW2 = 0, sumW3 = 0;

            for (let i = 0; i < n; i++) {
                const denom = (variances[i] > 0 ? variances[i] : 1e-10) + tau2;
                const w = denom > 0 ? 1 / denom : 1e10;
                sumW += w;
                sumWY += w * effects[i];
                sumW2 += w * w;
                sumW3 += w * w * w;
            }

            // Protect against sumW = 0
            if (sumW <= 0) sumW = 1e-10;

            const mu = sumWY / sumW;

            // Score and Fisher info
            let score = -0.5 * sumW2 / sumW;
            const fisher = 0.5 * (sumW3 / sumW - (sumW2 / sumW) ** 2);

            for (let i = 0; i < n; i++) {
                const denom = (variances[i] > 0 ? variances[i] : 1e-10) + tau2;
                const w = denom > 0 ? 1 / denom : 1e10;
                score += 0.5 * w * w * (effects[i] - mu) ** 2;
            }

            // Protect against fisher = 0
            const delta = Math.abs(fisher) > 1e-15 ? score / fisher : 0;
            const tau2New = Math.max(0, tau2 + delta);

            if (Math.abs(tau2New - tau2) < tol) break;
            tau2 = tau2New;
        }

        // Final estimates with weights
        const wRE = new Float64Array(n);
        let sumW = 0, sumWY = 0;
        for (let i = 0; i < n; i++) {
            const denom = (variances[i] > 0 ? variances[i] : 1e-10) + tau2;
            wRE[i] = denom > 0 ? 1 / denom : 1e10;
            sumW += wRE[i];
            sumWY += wRE[i] * effects[i];
        }

        // Protect against sumW = 0
        if (sumW <= 0) sumW = 1e-10;

        const theta = sumWY / sumW;
        const varTheta = 1 / sumW;
        let se = Math.sqrt(varTheta);

        // HKSJ adjustment
        let qHKSJ = 1;
        if (useHKSJ && n > 1) {
            let qSum = 0;
            for (let i = 0; i < n; i++) {
                qSum += wRE[i] * (effects[i] - theta) ** 2;
            }
            qHKSJ = qSum / (n - 1);
            qHKSJ = Math.max(1, qHKSJ);
        }

        const varHKSJ = varTheta * qHKSJ;
        const seHKSJ = Math.sqrt(varHKSJ);

        const zCritREML = FastMath.normQuantile(0.975);
        const tCrit = useHKSJ ? FastMath.tQuantile(0.975, n - 1) : zCritREML;
        const finalSE = useHKSJ ? seHKSJ : se;

        // Calculate Q for I²
        const wFE = variances.map(v => 1 / (v > 0 ? v : 1e-10));
        const sumWFE = wFE.reduce((a, b) => a + b, 0);
        const muFE = effects.reduce((s, e, i) => s + wFE[i] * e, 0) / sumWFE;
        const Q = effects.reduce((s, e, i) => s + wFE[i] * (e - muFE) ** 2, 0);

        const I2 = Q > n - 1 ? ((Q - (n - 1)) / Q) * 100 : 0;
        const I2CI = this._calculateI2CI(Q, n);
        const predictionInterval = this._calculatePredictionInterval(theta, tau2, finalSE, n);

        return {
            effect: theta,
            se: finalSE,
            seStandard: se,
            tau2,
            tau: Math.sqrt(tau2),
            I2,
            I2CI,
            Q,
            df: n - 1,
            pQ: 1 - FastMath.chiSquaredCDF(Q, n - 1),
            ci: [theta - tCrit * finalSE, theta + tCrit * finalSE],
            ciStandard: [theta - zCritREML * se, theta + zCritREML * se],
            predictionInterval,
            hksjFactor: qHKSJ,
            k: n,
            method: 'REML',
            adjustment: useHKSJ ? 'HKSJ' : 'none'
        };
    },

    // Optimized Kaplan-Meier
    kaplanMeier(times, events) {
        const n = times.length;

        // Sort indices by time
        const indices = new Uint32Array(n);
        for (let i = 0; i < n; i++) indices[i] = i;
        indices.sort((a, b) => times[a] - times[b]);

        const result = {
            times: [],
            survival: [],
            se: [],
            ciLower: [],
            ciUpper: [],
            nRisk: [],
            nEvent: [],
            nCensor: []
        };

        let atRisk = n;
        let survProb = 1;
        let varSum = 0; // For Greenwood variance

        let i = 0;
        while (i < n) {
            const t = times[indices[i]];
            let d = 0, c = 0;

            // Count events and censors at this time
            while (i < n && times[indices[i]] === t) {
                if (events[indices[i]]) d++;
                else c++;
                i++;
            }

            if (d > 0 && atRisk > 0) {
                survProb *= (1 - d / atRisk);
                // Greenwood variance - avoid division by zero
                const denom = atRisk * (atRisk - d);
                if (denom > 0) {
                    varSum += d / denom;
                }
                const se = survProb * Math.sqrt(varSum);

                // Log-log confidence interval (more stable) - avoid division by zero when survProb = 1
                const logSurv = Math.log(survProb);
                const zCritKM = FastMath.normQuantile(0.975);
                let ciLower, ciUpper;
                if (Math.abs(logSurv) > 1e-10) {
                    const logLogSE = Math.sqrt(varSum) / Math.abs(logSurv);
                    ciLower = Math.pow(survProb, Math.exp(zCritKM * logLogSE));
                    ciUpper = Math.pow(survProb, Math.exp(-zCritKM * logLogSE));
                } else {
                    // Fallback to Wald CI when survProb is very close to 1
                    ciLower = Math.max(0, survProb - zCritKM * se);
                    ciUpper = Math.min(1, survProb + zCritKM * se);
                }

                result.times.push(t);
                result.survival.push(survProb);
                result.se.push(se);
                result.ciLower.push(Math.max(0, ciLower));
                result.ciUpper.push(Math.min(1, ciUpper));
                result.nRisk.push(atRisk);
                result.nEvent.push(d);
                result.nCensor.push(c);
            }

            atRisk -= (d + c);
            if (atRisk < 0) atRisk = 0;
        }

        return result;
    },

    // Optimized Cholesky decomposition
    cholesky(A, n) {
        const L = memoryPool ? memoryPool.acquire(Float64Array, n * n) : new Float64Array(n * n);

        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += L[i * n + k] * L[j * n + k];
                }

                if (i === j) {
                    const diag = A[i * n + i] - sum;
                    L[i * n + j] = diag > 0 ? Math.sqrt(diag) : 0;
                } else {
                    const ljj = L[j * n + j];
                    L[i * n + j] = ljj > 0 ? (A[i * n + j] - sum) / ljj : 0;
                }
            }
        }

        return L;
    },

    // Optimized matrix inversion via Cholesky
    choleskyInverse(L, n) {
        const Linv = memoryPool ? memoryPool.acquire(Float64Array, n * n) : new Float64Array(n * n);

        // Forward substitution for L^-1
        for (let i = 0; i < n; i++) {
            const lii = L[i * n + i];
            Linv[i * n + i] = lii > 0 ? 1 / lii : 0;
            for (let j = 0; j < i; j++) {
                let sum = 0;
                for (let k = j; k < i; k++) {
                    sum += L[i * n + k] * Linv[k * n + j];
                }
                Linv[i * n + j] = lii > 0 ? -sum / lii : 0;
            }
        }

        // A^-1 = L^-T * L^-1
        const Ainv = memoryPool ? memoryPool.acquire(Float64Array, n * n) : new Float64Array(n * n);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = i; k < n; k++) {
                    sum += Linv[k * n + i] * Linv[k * n + j];
                }
                Ainv[i * n + j] = sum;
                Ainv[j * n + i] = sum;
            }
        }

        if (memoryPool) memoryPool.release(Linv);
        return Ainv;
    }
};

// ============================================================================
// ACCELERATED CLASS WRAPPER
// ============================================================================

function accelerate(BaseClass) {
    return class AcceleratedClass extends BaseClass {
        constructor(...args) {
            super(...args);
            this._cache = cache || null;
            this._simd = simd || null;
            this._memoryPool = memoryPool || null;
        }

        async _getEngine() {
            return getEngine();
        }

        _safeCache(key, value) {
            if (this._cache && value !== undefined) {
                this._cache.set(key, value);
            }
        }

        _getFromCache(key) {
            return this._cache ? this._cache.get(key) : null;
        }

        // Override computationally intensive methods
        async pooledEffect(data, options = {}) {
            if (!data || data.length === 0) {
                return { effect: 0, se: 0, tau2: 0, ci: [0, 0] };
            }

            const cacheKey = JSON.stringify({ method: 'pooledEffect', data: data.slice(0, 5), options });
            const cached = this._getFromCache(cacheKey);
            if (cached) return cached;

            const effects = new Float64Array(data.map(d => d.effect ?? d.yi ?? 0));
            const variances = new Float64Array(data.map(d => d.variance || d.vi || 1));

            let result;
            try {
                if (effects.length > 50) {
                    const engine = await this._getEngine();
                    if (engine) {
                        result = await engine.metaAnalysis(effects, variances, options.method || 'reml');
                    } else {
                        result = options.method === 'dl' ?
                            OptimizedAlgorithms.derSimonianLaird(effects, variances) :
                            OptimizedAlgorithms.reml(effects, variances);
                    }
                } else {
                    result = options.method === 'dl' ?
                        OptimizedAlgorithms.derSimonianLaird(effects, variances) :
                        OptimizedAlgorithms.reml(effects, variances);
                }
            } catch (e) {
                console.warn('pooledEffect error, using fallback:', e);
                result = OptimizedAlgorithms.derSimonianLaird(effects, variances);
            }

            this._safeCache(cacheKey, result);
            return result;
        }

        async runPSA(params, nSim = 10000, options = {}) {
            const engine = await this._getEngine();
            if (engine) {
                return engine.psa(params, nSim, options.seed);
            }
            // Fallback PSA
            return null;
        }

        async matrixMultiply(A, B, m, n, p) {
            const engine = await this._getEngine();
            if (engine) {
                return engine.matrixMultiply(A, B, m, n, p);
            }
            // Fallback matrix multiply
            const C = new Float64Array(m * p);
            for (let i = 0; i < m; i++) {
                for (let j = 0; j < p; j++) {
                    let sum = 0;
                    for (let k = 0; k < n; k++) {
                        sum += A[i * n + k] * B[k * p + j];
                    }
                    C[i * p + j] = sum;
                }
            }
            return C;
        }

        kaplanMeier(times, events) {
            return OptimizedAlgorithms.kaplanMeier(times, events);
        }

        derSimonianLaird(effects, variances) {
            return OptimizedAlgorithms.derSimonianLaird(effects, variances);
        }

        reml(effects, variances) {
            return OptimizedAlgorithms.reml(effects, variances);
        }

        cholesky(A, n) {
            return OptimizedAlgorithms.cholesky(A, n);
        }

        // Vectorized operations with fallbacks
        vectorSum(a) {
            if (this._simd) return this._simd.vectorSum(a);
            let sum = 0;
            for (let i = 0; i < a.length; i++) sum += a[i];
            return sum;
        }

        vectorMean(a) {
            if (this._simd) return this._simd.vectorMean(a);
            return a.length > 0 ? this.vectorSum(a) / a.length : 0;
        }

        vectorVariance(a, mean) {
            if (this._simd) return this._simd.vectorVariance(a, mean);
            if (!a || a.length === 0) return 0;
            if (a.length === 1) return 0; // Single element has no variance
            const m = mean !== undefined ? mean : this.vectorMean(a);
            let sum = 0;
            for (let i = 0; i < a.length; i++) sum += (a[i] - m) ** 2;
            return sum / (a.length - 1); // Sample variance with Bessel's correction
        }

        vectorAdd(a, b) {
            if (this._simd) return this._simd.vectorAdd(a, b);
            const n = Math.min(a.length, b.length);
            const result = new Float64Array(n);
            for (let i = 0; i < n; i++) result[i] = a[i] + b[i];
            return result;
        }

        vectorMul(a, b) {
            if (this._simd) return this._simd.vectorMul(a, b);
            const n = Math.min(a.length, b.length);
            const result = new Float64Array(n);
            for (let i = 0; i < n; i++) result[i] = a[i] * b[i];
            return result;
        }

        vectorDot(a, b) {
            if (this._simd) return this._simd.vectorDot(a, b);
            let sum = 0;
            const n = Math.min(a.length, b.length);
            for (let i = 0; i < n; i++) sum += a[i] * b[i];
            return sum;
        }

        // Memory management with fallbacks
        acquireArray(type, length) {
            if (this._memoryPool) return this._memoryPool.acquire(type, length);
            return new type(length);
        }

        releaseArray(array) {
            if (this._memoryPool) this._memoryPool.release(array);
        }

        clearCache() {
            if (this._cache) this._cache.clear();
        }
    };
}

// ============================================================================
// BATCH PROCESSING UTILITIES
// ============================================================================

class BatchProcessor {
    constructor(options = {}) {
        this.batchSize = options.batchSize || 1000;
        this.concurrency = options.concurrency || Environment.hardwareConcurrency;
    }

    async processBatches(items, processor, options = {}) {
        const results = [];
        const batches = [];

        for (let i = 0; i < items.length; i += this.batchSize) {
            batches.push(items.slice(i, i + this.batchSize));
        }

        // Process batches with concurrency control
        for (let i = 0; i < batches.length; i += this.concurrency) {
            const batchPromises = batches
                .slice(i, i + this.concurrency)
                .map((batch, idx) => processor(batch, i + idx));

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            if (options.onProgress) {
                options.onProgress(Math.min(i + this.concurrency, batches.length) / batches.length);
            }
        }

        return results;
    }

    async mapReduce(items, mapper, reducer, initial) {
        const batchResults = await this.processBatches(items, async (batch) => {
            return batch.map(mapper);
        });

        return batchResults.flat().reduce(reducer, initial);
    }
}

// ============================================================================
// LAZY EVALUATION
// ============================================================================

class LazyComputation {
    constructor(computation) {
        this._computation = computation;
        this._result = null;
        this._computed = false;
    }

    get value() {
        if (!this._computed) {
            this._result = this._computation();
            this._computed = true;
        }
        return this._result;
    }

    static defer(computation) {
        return new LazyComputation(computation);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        accelerate,
        getEngine,
        FastMath,
        OptimizedAlgorithms,
        BatchProcessor,
        LazyComputation,
        Environment,
        cache,
        memoryPool,
        simd
    };
}
