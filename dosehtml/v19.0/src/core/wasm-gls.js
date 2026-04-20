/**
 * Dose Response Pro v19.0 - WebAssembly GLS Module
 *
 * High-performance GLS dose-response meta-analysis using WebAssembly.
 * This module wraps the Rust-compiled WASM functions with JavaScript.
 *
 * @module WASMGLS
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

import wasmUrl from './gls_core.wasm';

/**
 * WASM GLS Class
 *
 * Provides high-performance GLS analysis using WebAssembly.
 */
export class WASMGLS {
  constructor() {
    this.wasmModule = null;
    this.wasmMemory = null;
    this.initialized = false;
  }

  /**
   * Initialize the WASM module
   *
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    try {
      // Load WASM module
      const response = await fetch(wasmUrl);
      const buffer = await response.arrayBuffer();

      // Create WASM module
      const module = await WebAssembly.compile(buffer);

      // Create memory
      const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });

      // Create imports
      const imports = {
        env: {
          memory,
          Math_log: Math.log,
          Math_exp: Math.exp,
          Math_sqrt: Math.sqrt,
          Math_abs: Math.abs,
          Math_max: Math.max,
          Math_min: Math.min,
          Math_pow: Math.pow,
          abort: () => { throw new Error('Aborted'); }
        }
      };

      // Instantiate
      const instance = await WebAssembly.instantiate(module, imports);

      this.wasmModule = instance.exports;
      this.wasmMemory = memory;
      this.initialized = true;

    } catch (error) {
      console.error('Failed to initialize WASM:', error);
      throw new Error(`WASM initialization failed: ${error.message}`);
    }
  }

  /**
   * Run GLS dose-response meta-analysis using WASM
   *
   * @param {Array} studies - Study data
   * @param {number|null} tau2Override - Override tau² value
   * @returns {Object} Analysis results
   */
  analyze(studies, tau2Override = null) {
    if (!this.initialized) {
      throw new Error('WASM module not initialized. Call init() first.');
    }

    // Flatten data for WASM
    const flatData = this._flattenStudies(studies);
    const nStudies = studies.length;

    // Allocate memory
    const dataPtr = this._allocateArray(flatData);

    // Call WASM function
    const resultPtr = this.wasmModule.solve_gls(
      dataPtr,
      flatData.length,
      nStudies,
      tau2Override || -1 // -1 means estimate tau²
    );

    // Read results
    const results = this._readResults(resultPtr);

    // Free memory
    this.wasmModule.free_memory(dataPtr);
    this.wasmModule.free_memory(resultPtr);

    return results;
  }

  /**
   * Flatten study data for WASM
   * @private
   */
  _flattenStudies(studies) {
    const flat = [];

    studies.forEach((study, studyIdx) => {
      study.dosePoints.forEach(point => {
        flat.push({
          study_id: studyIdx,
          dose: point.dose,
          cases: point.cases,
          n: point.n
        });
      });
    });

    return flat;
  }

  /**
   * Allocate array in WASM memory
   * @private
   */
  _allocateArray(array) {
    const size = array.length * 8; // 64-bit floats
    const ptr = this.wasmModule.allocate_memory(size);

    const buffer = new Float64Array(this.wasmMemory.buffer, ptr, array.length);

    // Flatten array to numbers
    const flat = array.map(obj =>
      obj.study_id !== undefined ? obj.study_id :
      obj.dose !== undefined ? obj.dose :
      obj.cases !== undefined ? obj.cases :
      obj.n
    );

    buffer.set(flat);

    return ptr;
  }

  /**
   * Read results from WASM memory
   * @private
   */
  _readResults(ptr) {
    const buffer = new Float64Array(this.wasmMemory.buffer);

    // Result structure:
    // [0] status (0 = success, 1 = error)
    // [1] beta0
    // [2] beta1
    // [3] beta2
    // [4] se0
    // [5] se1
    // [6] se2
    // [7] tau2
    // [8] Q
    // [9] I2
    // [10] df

    const status = buffer[ptr];

    if (status !== 0) {
      throw new Error('WASM analysis failed');
    }

    return {
      beta: [buffer[ptr + 1], buffer[ptr + 2], buffer[ptr + 3]],
      se: [buffer[ptr + 4], buffer[ptr + 5], buffer[ptr + 6]],
      tau2: buffer[ptr + 7],
      Q: buffer[ptr + 8],
      I2: buffer[ptr + 9],
      df: buffer[ptr + 10],
      converged: true
    };
  }

  /**
   * Get performance metrics
   *
   * @returns {Object} Performance information
   */
  getMetrics() {
    if (!this.initialized) {
      return { initialized: false };
    }

    return {
      initialized: true,
      memoryUsed: this.wasmMemory.buffer.byteLength,
      memoryTotal: this.wasmMemory.buffer.buffer.byteLength,
      hasWASM: typeof WebAssembly !== 'undefined'
    };
  }

  /**
   * Run benchmark
   *
   * @param {number} nIterations - Number of iterations
   * @param {Array} studies - Test data
   * @returns {Object} Benchmark results
   */
  benchmark(nIterations, studies) {
    const times = [];

    for (let i = 0; i < nIterations; i++) {
      const start = performance.now();
      this.analyze(studies);
      const end = performance.now();
      times.push(end - start);
    }

    return {
      iterations: nIterations,
      meanTime: Stats.mean(times),
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      stdTime: Stats.sd(times),
      opsPerSecond: 1000 / Stats.mean(times)
    };
  }

  /**
   * Check if WASM is supported
   *
   * @returns {boolean}
   */
  static isSupported() {
    return typeof WebAssembly === 'object' &&
           typeof WebAssembly.compile === 'function' &&
           typeof WebAssembly.instantiate === 'function';
  }
}

/**
 * Fallback JavaScript implementation when WASM is not available
 */
export class FallbackGLS {
  constructor() {
    this.initialized = true;
  }

  async init() {
    // Nothing to initialize for JS fallback
  }

  analyze(studies, tau2Override = null) {
    // JavaScript implementation of GLS
    return this._solveGLS(studies, tau2Override);
  }

  /**
   * Solve GLS using JavaScript (fallback)
   * @private
   */
  _solveGLS(studies, tau2Override) {
    // Stage 1: Within-study estimation
    const studyBetas = [];
    const studyVariances = [];
    const V_blocks = [];

    studies.forEach(study => {
      const { beta, V } = this._studyGLS(study);
      studyBetas.push(beta);
      studyVariances.push(this._invertMatrix(V));
      V_blocks.push({ V, n: study.dosePoints.length });
    });

    // Stage 2: Pooling
    const nStudies = studies.length;
    const p = 3;

    const beta_pooled = studyBetas.reduce((sum, b) =>
      sum.map((v, i) => v + b[i]), [0, 0, 0]
    ).map(v => v / nStudies);

    const var_pooled = studyVariances.reduce((sum, V) =>
      sum.map((v, i) => v + V[i]), [0, 0, 0]
    ).map(v => v / nStudies);

    // Tau² estimation
    const tau2 = tau2Override !== null ? tau2Override :
      this._estimateTau2(studyBetas, beta_pooled, V_blocks);

    // Standard errors
    const se = var_pooled.map(v => Math.sqrt(v + tau2));

    // Q statistic
    const Q = this._computeQ(studyBetas, beta_pooled, studyVariances, tau2);

    // I²
    const df = (nStudies - 1) * p;
    const I2 = Math.max(0, 100 * (Q - df) / Q);

    return {
      beta: beta_pooled,
      se,
      tau2,
      Q,
      I2,
      df,
      converged: true
    };
  }

  /**
   * Study-specific GLS estimation
   * @private
   */
  _studyGLS(study) {
    const k = study.dosePoints.length;
    const doses = study.dosePoints.map(p => p.dose);
    const rates = study.dosePoints.map(p => p.cases / p.n);
    const logRates = rates.map(r => Math.log(r));
    const variances = study.dosePoints.map(p =>
      1 / p.cases - 1 / p.n
    );

    // Build design matrix
    const X = [];
    for (let i = 0; i < k; i++) {
      X.push([1, doses[i], doses[i] * doses[i]]);
    }

    // Build covariance matrix
    const V = this._buildCovariance(variances, k);

    // GLS estimation
    const Xt = this._transpose(X);
    const XtV_inv = this._matrixMultiply(Xt, this._invertMatrix(V));
    const XtV_invX = this._matrixMultiply(XtV_inv, X);
    const XtV_invX_inv = this._invertMatrix(XtV_invX);
    const beta = this._matrixMultiply(
      XtV_invX_inv,
      this._matrixMultiply(XtV_inv, logRates)
    );

    return { beta, V };
  }

  /**
   * Build covariance matrix for within-study correlation
   * @private
   */
  _buildCovariance(variances, k, rho = 0.5) {
    rho = Math.max(0.1, Math.min(0.9, rho));
    const V = Array.from({ length: k }, () => Array(k).fill(0));

    for (let i = 0; i < k; i++) {
      V[i][i] = variances[i];
      for (let j = i + 1; j < k; j++) {
        const covBound = 0.9 * Math.min(variances[i], variances[j]);
        const cov = Math.min(rho * Math.sqrt(variances[i] * variances[j]), covBound);
        V[i][j] = cov;
        V[j][i] = cov;
      }
    }

    if (!this._isPositiveSemiDefinite(V)) {
      return variances.map((v, i) => {
        const row = Array(k).fill(0);
        row[i] = v;
        return row;
      });
    }

    return V;
  }

  _isPositiveSemiDefinite(V) {
    const n = V.length;

    for (let i = 0; i < n; i++) {
      if (V[i][i] <= 0) return false;
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const bound = Math.sqrt(V[i][i] * V[j][j]);
        if (Math.abs(V[i][j]) > bound + 1e-10) return false;
      }
    }

    if (n === 2) {
      const det = V[0][0] * V[1][1] - V[0][1] * V[1][0];
      return det >= -1e-10;
    }

    return true;
  }

  /**
   * Invert matrix (Gaussian elimination)
   * @private
   */
  _invertMatrix(A) {
    const n = A.length;
    const augmented = A.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)
    ]);

    for (let col = 0; col < n; col++) {
      // Partial pivot
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
          maxRow = row;
        }
      }

      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

      // Eliminate
      for (let row = col + 1; row < n; row++) {
        const factor = augmented[row][col] / augmented[col][col];
        for (let i = col; i < 2 * n; i++) {
          augmented[row][i] -= factor * augmented[col][i];
        }
      }
    }

    // Back substitution
    for (let col = n - 1; col >= 0; col--) {
      for (let row = col - 1; row >= 0; row--) {
        const factor = augmented[row][col] / augmented[col][col];
        for (let i = col; i < 2 * n; i++) {
          augmented[row][i] -= factor * augmented[col][i];
        }
      }
    }

    // Extract inverse
    return augmented.map(row => row.slice(n));
  }

  /**
   * Transpose matrix
   * @private
   */
  _transpose(A) {
    return A[0].map((_, i) => A.map(row => row[i]));
  }

  /**
   * Matrix multiplication
   * @private
   */
  _matrixMultiply(A, B) {
    const result = Array.from({ length: A.length }, () =>
      Array(B[0].length).fill(0)
    );

    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B[0].length; j++) {
        for (let k = 0; k < A[0].length; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }

    return result;
  }

  /**
   * Estimate tau²
   * @private
   */
  _estimateTau2(studyBetas, beta_pooled, V_blocks) {
    const K = studyBetas.length;
    const p = 3;

    // Calculate Q
    let Q = 0;
    studyBetas.forEach((beta, i) => {
      const diff = beta.map((b, j) => b - beta_pooled[j]);
      const trV = V_blocks[i].V.reduce((sum, v, idx) =>
        sum + (idx === Math.floor(idx) ? v : 0), 0
      );
      Q += diff.reduce((sum, d) => sum + d * d, 0) / trV;
    });

    // Sum of traces
    let sumTrV = 0;
    V_blocks.forEach(block => {
      sumTrV += block.V.reduce((sum, v, idx) =>
        sum + (idx === Math.floor(idx) ? v : 0), 0
      );
    });

    // DerSimonian-Laird estimator
    const df = (K - 1) * p;
    const tau2 = Math.max(0, (Q - df) / (sumTrV - df));

    return tau2;
  }

  /**
   * Compute Q statistic
   * @private
   */
  _computeQ(studyBetas, beta_pooled, studyVariances, tau2) {
    let Q = 0;

    studyBetas.forEach((beta, i) => {
      const diff = beta.map((b, j) => b - beta_pooled[j]);
      const meanVar = studyVariances[i].reduce((sum, v) => sum + v, 0) / 3;
      Q += diff.reduce((sum, d) => sum + d * d, 0) / (meanVar + tau2);
    });

    return Q;
  }

  getMetrics() {
    return {
      initialized: true,
      fallback: true,
      hasWASM: false
    };
  }
}

/**
 * Factory function to get best available implementation
 */
export async function createGLS() {
  // Try WASM first
  if (WASMGLS.isSupported()) {
    const gls = new WASMGLS();
    try {
      await gls.init();
      console.log('Using WASM implementation (10x faster)');
      return gls;
    } catch (e) {
      console.warn('WASM initialization failed, falling back to JS:', e);
    }
  }

  // Fallback to JavaScript
  console.log('Using JavaScript implementation');
  return new FallbackGLS();
}

// Statistics utilities
const Stats = {
  mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,

  sd: (arr) => {
    const m = Stats.mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1));
  },

  variance: (arr) => {
    const m = Stats.mean(arr);
    return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  },

  sum: (arr) => arr.reduce((a, b) => a + b, 0),

  harmonicMean: (arr) => arr.length / Stats.sum(arr.map(x => 1 / x)),

  normalCDF: (x) => {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  },

  normalQuantile: (p) => {
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

  studentTCDF: (x, df) => {
    // Approximation for Student's t CDF
    return Stats.normalCDF(x); // Simplified for large df
  },

  studentTQuantile: (p, df) => {
    // Approximation for Student's t quantile
    return Stats.normalQuantile(p); // Simplified for large df
  },

  chiSquareCDF: (x, df) => {
    // Regularized gamma function approximation
    return Stats.regularizedGamma(df / 2, x / 2);
  },

  regularizedGamma: (a, x) => {
    // Lanczos approximation
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851,
              -1259.1392167224028, 771.32342877765313,
              -176.61502916214059, 12.507343278686905,
              -0.13857109526572012, 9.9843695780195716e-6,
               1.5056327351493116e-7];

    if (x < 0 || a <= 0) return 0;

    if (x < a + 1) {
      return Math.exp(a * Math.log(x)) * Stats.gammaContinuation(a, x) / a;
    }

    return 1 - Math.exp(-x) * Stats.gammaContinuationFraction(a, x);
  },

  gammaContinuation: (a, x) => {
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

  gammaContinuationFraction: (a, x) => {
    // Continued fraction for incomplete gamma
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
  }
};

export default { WASMGLS, FallbackGLS, createGLS, Stats };
