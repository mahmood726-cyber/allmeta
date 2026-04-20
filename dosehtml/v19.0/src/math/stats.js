/**
 * Dose Response Pro v19.0 - Statistics Module
 *
 * Core statistical functions for meta-analysis
 *
 * @module Stats
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

/**
 * Statistical functions
 */
export const Stats = {
  /**
   * Mean of array
   */
  mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  /**
   * Median of array
   */
  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ?
      sorted[mid] :
      (sorted[mid - 1] + sorted[mid]) / 2;
  },

  /**
   * Variance (sample)
   */
  variance(arr) {
    const m = this.mean(arr);
    return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  },

  /**
   * Standard deviation
   */
  sd(arr) {
    return Math.sqrt(this.variance(arr));
  },

  /**
   * Sum of array
   */
  sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  },

  /**
   * Harmonic mean
   */
  harmonicMean(arr) {
    return arr.length / this.sum(arr.map(x => 1 / x));
  },

  /**
   * Geometric mean
   */
  geometricMean(arr) {
    return Math.exp(this.mean(arr.map(x => Math.log(x))));
  },

  /**
   * Minimum value
   */
  min(arr) {
    return Math.min(...arr);
  },

  /**
   * Maximum value
   */
  max(arr) {
    return Math.max(...arr);
  },

  /**
   * Quantiles
   */
  quantile(arr, probs) {
    const sorted = [...arr].sort((a, b) => a - b);
    return probs.map(p => {
      const idx = (sorted.length - 1) * p;
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      const weight = idx - lower;
      return sorted[lower] * (1 - weight) + (sorted[upper] || sorted[lower]) * weight;
    });
  },

  /**
   * Rank values (average ranks for ties)
   */
  rank(arr) {
    const sorted = arr.map((val, idx) => ({ val, idx }))
      .sort((a, b) => a.val - b.val);

    const ranks = Array(arr.length).fill(0);
    let i = 0;

    while (i < sorted.length) {
      const j = i;
      while (j < sorted.length && sorted[j].val === sorted[i].val) {
        j++;
      }

      // Average rank for ties
      const avgRank = (i + j + 1) / 2;
      for (let k = i; k < j; k++) {
        ranks[sorted[k].idx] = avgRank;
      }

      i = j;
    }

    return ranks;
  },

  /**
   * Pooled mean (inverse variance weighting)
   */
  pooledMean(estimates, variances) {
    const weights = variances.map(v => 1 / v);
    const sumWeights = this.sum(weights);

    return {
      mean: this.sum(estimates.map((e, i) => e * weights[i])) / sumWeights,
      se: Math.sqrt(1 / sumWeights),
      weights
    };
  },

  /**
   * Standard normal CDF
   */
  normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t *
             Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  },

  /**
   * Standard normal quantile (inverse CDF)
   */
  normalQuantile(p) {
    if (p <= 0 || p >= 1) {
      throw new Error('p must be between 0 and 1');
    }

    const a = [-3.969683028665376e+01, 2.209460984245205e+02,
               -2.759285104469687e+02, 1.383577518672690e+02,
               -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02,
               -1.556989798598866e+02, 6.680131188771972e+01,
               -1.328068155288572e+00];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01,
               -2.400758277161838e+00, -2.549732539343734e+00,
                4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01,
               2.445134137142996e+00, 3.754408661907416e+00];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }

    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  },

  /**
   * Student's t CDF
   */
  studentTCDF(x, df) {
    // Approximation for Student's t
    if (df === Infinity) return this.normalCDF(x);

    // Regularized incomplete beta function approximation
    const xt = df / (x * x + df);
    return 1 - 0.5 * this.regularizedBeta(df / 2, 0.5, xt);
  },

  /**
   * Student's t quantile
   */
  studentTQuantile(p, df) {
    // Approximation using Wilson-Hilferty transformation
    if (df === Infinity) return this.normalQuantile(p);

    const x = this.normalQuantile(p);
    return Math.sqrt(df) * (x ** 3 / 3 + x) / Math.sqrt(1 + x * x / df);
  },

  /**
   * Chi-square CDF
   */
  chiSquareCDF(x, df) {
    return this.regularizedGamma(df / 2, x / 2);
  },

  /**
   * Chi-square quantile
   */
  chiSquareQuantile(p, df) {
    // Wilson-Hilferty approximation
    const x = this.normalQuantile(p);
    return df * Math.pow(1 - 2 / (9 * df) + x * Math.sqrt(2 / (9 * df)), 3);
  },

  /**
   * F distribution CDF
   */
  fCDF(x, df1, df2) {
    // Regularized incomplete beta function
    const val = df1 * x / (df1 * x + df2);
    return this.regularizedBeta(df1 / 2, df2 / 2, val);
  },

  /**
   * Regularized gamma function
   */
  regularizedGamma(a, x) {
    if (x < 0 || a <= 0) return 0;
    if (x === 0) return 0;

    if (x < a + 1) {
      return Math.pow(x, a) * this.gammaContinuation(a, x) / a;
    }

    return 1 - Math.exp(-x) * this.gammaContinuationFraction(a, x);
  },

  /**
   * Incomplete gamma continuation
   */
  gammaContinuation(a, x) {
    const c = [0.99999999999999999, 5.7115689702748719,
               19.312710795816696, 41.718882020153397,
               56.691718173544984, 50.178604412382887,
               27.515526246822329, 9.4240916083670376,
               1.9484260454623135, 0.17048466576868072];

    let sum = c[c.length - 1];
    for (let i = c.length - 2; i >= 0; i--) {
      sum = sum / (a + c.length - 1 - i) + c[i];
    }

    return Math.exp(-x) * Math.pow(x, a) * sum;
  },

  /**
   * Gamma continued fraction
   */
  gammaContinuationFraction(a, x) {
    const maxIter = 100;
    const tiny = 1e-30;
    let f = 1 / tiny;
    let C = f;
    let D = 0;

    for (let i = maxIter - 1; i >= 0; i--) {
      const aCoeff = (i * 2) + 1 - a;
      D = aCoeff + x * D;
      if (Math.abs(D) < tiny) D = tiny;
      C = aCoeff + x / C;
      if (Math.abs(C) < tiny) C = tiny;
      D = 1 / D;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-7) break;
    }

    return f;
  },

  /**
   * Regularized incomplete beta function
   */
  regularizedBeta(a, b, x) {
    if (x < 0 || x > 1) return NaN;
    if (x === 0) return 0;
    if (x === 1) return 1;

    // Use continued fraction expansion
    const maxIter = 100;
    const eps = 1e-10;

    let f = 1.0;
    let C = 1.0;
    let D = 0.0;

    for (let i = 0; i < maxIter; i++) {
      const m = i / 2;
      let numerator, denominator;

      if (i === 0) {
        numerator = 1.0;
        denominator = 1.0;
      } else if (i % 2 === 0) {
        numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
        denominator = 1.0;
      } else {
        numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
        denominator = 1.0 - numerator * D;
      }

      D = denominator;
      if (Math.abs(D) < eps) D = eps;
      C = 1.0 / (denominator + numerator * C);
      if (Math.abs(C) < eps) C = eps;

      const delta = C * D;
      f *= delta;

      if (Math.abs(delta - 1.0) < eps) break;
    }

    return Math.pow(x, a) * Math.pow(1 - x, b) / (a * this.betaFunction(a, b)) * f;
  },

  /**
   * Beta function
   */
  betaFunction(a, b) {
    return Math.exp(this.logBeta(a, b));
  },

  /**
   * Log beta function
   */
  logBeta(a, b) {
    return this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b);
  },

  /**
   * Log gamma function (Lanczos approximation)
   */
  logGamma(z) {
    const c = [76.18009172947146,
               -86.50532032941677,
               24.01409824083091,
               -1.231739572450155,
               0.1208650973866176e-2,
               -0.5395239384953e-5];

    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);
    }

    z -= 1;
    let x = c[0];
    for (let i = 1; i < c.length; i++) {
      x += c[i] / (z + i);
    }

    const t = z + c.length - 1.5;
    return Math.log(2.5066282746310005 * (z + 5.5)) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  },

  /**
   * Binomial coefficient
   */
  binomialCoeff(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;

    let result = 1;
    for (let i = 1; i <= k; i++) {
      result = result * (n - i + 1) / i;
    }

    return result;
  },

  /**
   * Poisson probability
   */
  poissonPMF(k, lambda) {
    if (k < 0 || lambda <= 0) return 0;
    return Math.exp(-lambda + k * Math.log(lambda) - this.logGamma(k + 1));
  },

  /**
   * Poisson CDF
   */
  poissonCDF(k, lambda) {
    if (k < 0 || lambda <= 0) return 0;

    let sum = 0;
    for (let i = 0; i <= Math.floor(k); i++) {
      sum += this.poissonPMF(i, lambda);
    }
    return sum;
  },

  /**
   * Exponential CDF
   */
  expCDF(x, rate = 1) {
    if (x < 0) return 0;
    return 1 - Math.exp(-rate * x);
  },

  /**
   * Logit function
   */
  logit(p) {
    if (p <= 0 || p >= 1) {
      throw new Error('p must be between 0 and 1');
    }
    return Math.log(p / (1 - p));
  },

  /**
   * Inverse logit (sigmoid)
   */
  expit(x) {
    return 1 / (1 + Math.exp(-x));
  },

  /**
   * Fisher's z transformation
   */
  fisherZ(r) {
    return 0.5 * Math.log((1 + r) / (1 - r));
  },

  /**
   * Inverse Fisher's z
   */
  inverseFisherZ(z) {
    return (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);
  },

  /**
   * Confidence interval for correlation
   */
  corCI(r, n, level = 0.95) {
    const z = this.fisherZ(r);
    const se = 1 / Math.sqrt(n - 3);
    const zCrit = this.normalQuantile((1 + level) / 2);

    const zLower = z - zCrit * se;
    const zUpper = z + zCrit * se;

    return [
      this.inverseFisherZ(zLower),
      this.inverseFisherZ(zUpper)
    ];
  },

  /**
   * Pooled correlation (Fisher's z)
   */
  pooledCor(correlations, sampleSizes) {
    const zValues = correlations.map(r => this.fisherZ(r));
    const weights = sampleSizes.map(n => n - 3);
    const sumWeights = this.sum(weights);

    const pooledZ = this.sum(zValues.map((z, i) => z * weights[i])) / sumWeights;
    const seZ = Math.sqrt(1 / sumWeights);

    const zCrit = this.normalQuantile(0.975);
    const zLower = pooledZ - zCrit * seZ;
    const zUpper = pooledZ + zCrit * seZ;

    return {
      r: this.inverseFisherZ(pooledZ),
      ciLower: this.inverseFisherZ(zLower),
      ciUpper: this.inverseFisherZ(zUpper),
      z: pooledZ,
      p: 2 * (1 - this.normalCDF(Math.abs(pooledZ / seZ)))
    };
  }
};

export default Stats;
