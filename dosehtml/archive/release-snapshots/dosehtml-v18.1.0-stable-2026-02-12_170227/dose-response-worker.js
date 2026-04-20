/**
 * Dose Response Pro Web Worker
 *
 * Performs intensive computations off the main thread to maintain UI responsiveness.
 * Supports GLS analysis, bootstrap, and model fitting for large datasets.
 *
 * Usage:
 *   const worker = new Worker('dose-response-worker.js');
 *   worker.postMessage({ action: 'runGLS', data: points, tau2: null });
 *   worker.onmessage = (e) => { console.log('Result:', e.data); };
 */

// Numerical constants (must match main thread)
const NUMERICAL_TOLERANCE = 1e-10;
const DETERMINANT_THRESHOLD = 1e-10;
const RIDGE_PENALTY = 1e-10;

// ================================================================
// MATRIX OPERATIONS (Worker versions)
// ================================================================

function invertMatrixWorker(V, n) {
  const aug = new Array(n * 2 * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * 2 * n + j] = V[i * n + j];
    }
    aug[i * 2 * n + n + i] = 1;
  }

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col * 2 * n + col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row * 2 * n + col]) > maxVal) {
        maxVal = Math.abs(aug[row * 2 * n + col]);
        maxRow = row;
      }
    }

    if (maxRow !== col) {
      for (let j = 0; j < 2 * n; j++) {
        [aug[col * 2 * n + j], aug[maxRow * 2 * n + j]] =
          [aug[maxRow * 2 * n + j], aug[col * 2 * n + j]];
      }
    }

    if (Math.abs(aug[col * 2 * n + col]) < DETERMINANT_THRESHOLD) {
      aug[col * 2 * n + col] += RIDGE_PENALTY;
    }

    const pivot = aug[col * 2 * n + col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col * 2 * n + j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row * 2 * n + col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row * 2 * n + j] -= factor * aug[col * 2 * n + j];
        }
      }
    }
  }

  const inv = new Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * 2 * n + n + j];
    }
  }

  return inv;
}

function solve3x3Worker(A, b) {
  const det = A[0] * (A[4]*A[8] - A[5]*A[7]) -
              A[1] * (A[3]*A[8] - A[5]*A[6]) +
              A[2] * (A[3]*A[7] - A[4]*A[6]);

  if (Math.abs(det) < DETERMINANT_THRESHOLD) return [0, 0, 0];

  const x0 = (b[0] * (A[4]*A[8] - A[5]*A[7]) -
             b[1] * (A[1]*A[8] - A[2]*A[7]) +
             b[2] * (A[1]*A[5] - A[2]*A[4])) / det;
  const x1 = (A[0] * (b[1]*A[8] - b[2]*A[7]) -
             A[1] * (b[0]*A[8] - b[2]*A[6]) +
             A[2] * (b[0]*A[7] - b[1]*A[6])) / det;
  const x2 = (A[0] * (A[4]*b[2] - A[5]*b[1]) -
             A[1] * (A[3]*b[2] - A[5]*b[0]) +
             A[2] * (A[3]*b[1] - A[4]*b[0])) / det;

  return [x0, x1, x2];
}

function invert3x3Worker(A) {
  const det = A[0] * (A[4]*A[8] - A[5]*A[7]) -
              A[1] * (A[3]*A[8] - A[5]*A[6]) +
              A[2] * (A[3]*A[7] - A[4]*A[6]);

  if (Math.abs(det) < DETERMINANT_THRESHOLD) return A.map(() => 0);

  const inv = new Array(9);
  inv[0] = (A[4]*A[8] - A[5]*A[7]) / det;
  inv[1] = (A[2]*A[7] - A[1]*A[8]) / det;
  inv[2] = (A[1]*A[5] - A[2]*A[4]) / det;
  inv[3] = (A[5]*A[6] - A[3]*A[8]) / det;
  inv[4] = (A[0]*A[8] - A[2]*A[6]) / det;
  inv[5] = (A[2]*A[4] - A[0]*A[5]) / det;
  inv[6] = (A[3]*A[7] - A[4]*A[6]) / det;
  inv[7] = (A[1]*A[6] - A[0]*A[7]) / det;
  inv[8] = (A[0]*A[4] - A[1]*A[3]) / det;

  return inv;
}

// ================================================================
// GLS COVARIANCE
// ================================================================

function buildGLSCovarianceWorker(studyPoints) {
  const n = studyPoints.length;
  const V = new Array(n * n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        V[i * n + j] = studyPoints[i].se * studyPoints[i].se;
      } else {
        V[i * n + j] = Math.min(0.5 * studyPoints[i].se * studyPoints[j].se, Math.min(studyPoints[i].se * studyPoints[i].se, studyPoints[j].se * studyPoints[j].se) * 0.9);
      }
    }
  }

  return V;
}

// ================================================================
// CORE ANALYSIS FUNCTIONS
// ================================================================

function solveGLSWorker(points, tau2Override, useREML) {
  // Group points by study
  const studyMap = new Map();
  for (const p of points) {
    if (!studyMap.has(p.id)) studyMap.set(p.id, []);
    studyMap.get(p.id).push(p);
  }

  const studies = Array.from(studyMap.entries());
  const nStudies = studies.length;
  const nPoints = points.length;

  // Build design matrix X
  const X = [];
  const y = [];
  const V_blocks = [];

  for (const [studyId, studyPoints] of studies) {
    const V = buildGLSCovarianceWorker(studyPoints);

    for (const pt of studyPoints) {
      X.push([1, pt.dose, pt.dose * pt.dose]);
      y.push(pt.logRR);
    }

    V_blocks.push({ studyId, V, n: studyPoints.length });
  }

  const p = 3;

  // Estimate tau²
  let tau2 = tau2Override;
  let tau2Method = 'DL';
  let remlInfo = null;

  if (tau2 === null) {
    if (useREML) {
      // Use iterative REML
      tau2 = estimateTau2REMLWorker(X, y, V_blocks);
      tau2Method = 'REML';
    } else {
      // Use DerSimonian-Laird
      tau2 = estimateTau2DLWorker(X, y, V_blocks);
      tau2Method = 'DL';
    }
  }

  // Solve GLS with tau²
  const result = solveGLSWithTau2Worker(X, y, V_blocks, tau2);

  // Compute Q and I²
  const Q = computeQStatWorker(y, X, result.beta, V_blocks, tau2);
  const df = (nStudies - 1) * p;
  const I2 = Math.max(0, 100 * (Q - df) / Math.max(Q, 0.001));

  return {
    ...result,
    tau2,
    tau2Method,
    Q,
    df,
    I2,
    nStudies,
    nPoints
  };
}

function solveGLSWithTau2Worker(X, y, V_blocks, tau2) {
  const n = y.length;
  const p = X[0].length;

  // Invert each block
  const V_inv_blocks = V_blocks.map(block => {
    const blockSize = block.n;
    const V_with_tau2 = new Array(blockSize * blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrixWorker(V_with_tau2, blockSize);
    return { V_inv, n: blockSize };
  });

  // Compute X'V^(-1)X and X'V^(-1)y
  const XtVinvX = new Array(p * p).fill(0);
  const XtVinvY = new Array(p).fill(0);

  let row = 0;
  for (const blockInv of V_inv_blocks) {
    const blockSize = blockInv.n;
    const V_inv = blockInv.V_inv;

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        const w_ij = V_inv[i * blockSize + j];

        for (let k = 0; k < p; k++) {
          XtVinvY[k] += w_ij * X[row + i][k] * y[row + j];
          for (let l = 0; l < p; l++) {
            XtVinvX[k * p + l] += w_ij * X[row + i][k] * X[row + j][l];
          }
        }
      }
    }
    row += blockSize;
  }

  // Add ridge penalty
  for (let i = 0; i < p; i++) {
    XtVinvX[i * p + i] += RIDGE_PENALTY;
  }

  // Solve for beta
  const beta = solve3x3Worker(XtVinvX, XtVinvY);

  // Compute variance-covariance
  const XtVinvX_inv = invert3x3Worker(XtVinvX);
  const varMatrix = XtVinvX_inv;
  const se = [];
  for (let i = 0; i < p; i++) {
    se.push(Math.sqrt(Math.max(varMatrix[i * p + i], 0)));
  }

  // Compute WRSS
  let WRSS = 0;
  row = 0;
  for (const blockInv of V_inv_blocks) {
    const blockSize = blockInv.n;
    const V_inv = blockInv.V_inv;
    const residuals = new Array(blockSize).fill(0);
    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }
      residuals[i] = y[row + i] - pred;
    }

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        WRSS += residuals[i] * V_inv[i * blockSize + j] * residuals[j];
      }
    }
    row += blockSize;
  }

  // Compute log determinant
  let detV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      detV += Math.log(Math.max(block.V[i * blockSize + i] + tau2, NUMERICAL_TOLERANCE));
    }
  }

  return { beta, se, WRSS, detV, var: varMatrix };
}

function estimateTau2DLWorker(X, y, V_blocks) {
  const K = V_blocks.length;
  const p = X[0].length;

  const feResult = solveGLSWithTau2Worker(X, y, V_blocks, 0);
  const Q = computeQStatWorker(y, X, feResult.beta, V_blocks, 0);

  const df = (K - 1) * p;

  let sumTrV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      sumTrV += block.V[i * blockSize + i];
    }
  }

  const tau2 = Math.max(0, (Q - df) / Math.max(sumTrV - df, NUMERICAL_TOLERANCE));
  return tau2;
}

function estimateTau2REMLWorker(X, y, V_blocks) {
  const K = V_blocks.length;
  const p = X[0].length;
  const maxIter = 100;
  const tol = 1e-8;

  let tau2 = estimateTau2DLWorker(X, y, V_blocks);
  let prevLogLik = -Infinity;
  let converged = false;
  let iter;

  for (iter = 0; iter < maxIter; iter++) {
    const result = solveGLSWithTau2Worker(X, y, V_blocks, tau2);
    const logLik = computeREMLLogLikWorker(y, X, result.beta, V_blocks, tau2, p);

    if (Math.abs(logLik - prevLogLik) < tol) {
      converged = true;
      break;
    }

    prevLogLik = logLik;

    const score = computeREMLScoreWorker(y, X, result.beta, V_blocks, tau2);
    const fisherInfo = computeREMLFisherInfoWorker(V_blocks, tau2);

    const step = score / Math.max(fisherInfo, NUMERICAL_TOLERANCE);
    tau2 += step;

    if (tau2 < 0) tau2 = 0;
  }

  return tau2;
}

function computeREMLLogLikWorker(y, X, beta, V_blocks, tau2, p) {
  const n = y.length;
  let logLik = 0;

  let detV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      detV += Math.log(Math.max(block.V[i * blockSize + i] + tau2, NUMERICAL_TOLERANCE));
    }
  }
  logLik -= 0.5 * detV;

  const Q = computeQStatWorker(y, X, beta, V_blocks, tau2);
  logLik -= 0.5 * Q;

  logLik -= 0.5 * (n - p) * Math.log(2 * Math.PI);

  return logLik;
}

function computeREMLScoreWorker(y, X, beta, V_blocks, tau2) {
  let score = 0;
  let row = 0;

  for (const block of V_blocks) {
    const blockSize = block.n;
    const V_with_tau2 = new Array(blockSize * blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrixWorker(V_with_tau2, blockSize);

    const p = X[0].length;
    const residuals = new Array(blockSize).fill(0);
    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }
      residuals[i] = y[row + i] - pred;
    }

    const V_inv_r = new Array(blockSize).fill(0);
    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_inv_r[i] += V_inv[i * blockSize + j] * residuals[j];
      }
    }

    let quad = 0;
    for (let i = 0; i < blockSize; i++) {
      quad += V_inv_r[i] * V_inv_r[i];
    }

    let trace = 0;
    for (let i = 0; i < blockSize; i++) {
      trace += V_inv[i * blockSize + i];
    }

    // score = 0.5 * (r'V^{-2}r - tr(V^{-1})), for dV/dtau2 = I
    score += 0.5 * (quad - trace);

    row += blockSize;
  }

  return score;
}

function computeREMLFisherInfoWorker(V_blocks, tau2) {
  let fisherInfo = 0;

  for (const block of V_blocks) {
    const blockSize = block.n;
    const V_with_tau2 = new Array(blockSize * blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrixWorker(V_with_tau2, blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        fisherInfo += 0.5 * V_inv[i * blockSize + j] * V_inv[i * blockSize + j];
      }
    }
  }

  return fisherInfo;
}

function computeQStatWorker(y, X, beta, V_blocks, tau2) {
  let Q = 0;
  let row = 0;

  for (const block of V_blocks) {
    const blockSize = block.n;
    const V_with_tau2 = new Array(blockSize * blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrixWorker(V_with_tau2, blockSize);

    const p = X[0].length;
    const residuals = new Array(blockSize).fill(0);
    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }
      residuals[i] = y[row + i] - pred;
    }

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        Q += residuals[i] * V_inv[i * blockSize + j] * residuals[j];
      }
    }
    row += blockSize;
  }

  return Q;
}

// ================================================================
// BOOTSTRAP (Worker version)
// ================================================================

function bootstrapWorker(points, nBootstrap, ciLevel, modelType) {
  const originalResult = solveGLSWorker(points, null, false);
  const bootstrapEstimates = [];
  const studyIds = [...new Set(points.map(p => p.id))];

  for (let iter = 0; iter < nBootstrap; iter++) {
    const bootStudyIds = [];
    for (let i = 0; i < studyIds.length; i++) {
      bootStudyIds.push(studyIds[Math.floor(Math.random() * studyIds.length)]);
    }

    const bootPoints = [];
    for (const studyId of bootStudyIds) {
      bootPoints.push(...points.filter(p => p.id === studyId));
    }

    try {
      const bootResult = solveGLSWorker(bootPoints, null, false);
      bootstrapEstimates.push(bootResult.beta);
    } catch (e) {
      continue;
    }

    if ((iter + 1) % 100 === 0) {
      postMessage({ type: 'progress', iter: iter + 1, total: nBootstrap });
    }
  }

  const alpha = 1 - ciLevel;
  const nParams = originalResult.beta.length;
  const ciLower = [];
  const ciUpper = [];

  for (let p = 0; p < nParams; p++) {
    const paramEstimates = bootstrapEstimates
      .map(b => b[p])
      .filter(v => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (paramEstimates.length === 0) {
      ciLower.push(NaN);
      ciUpper.push(NaN);
      continue;
    }
    const lowerIdx = Math.floor(alpha / 2 * paramEstimates.length);
    const upperIdx = Math.ceil((1 - alpha / 2) * paramEstimates.length) - 1;

    ciLower.push(paramEstimates[lowerIdx]);
    ciUpper.push(paramEstimates[upperIdx]);
  }

  const bootstrapSE = [];
  for (let p = 0; p < nParams; p++) {
    const paramEstimates = bootstrapEstimates
      .map(b => b[p])
      .filter(v => Number.isFinite(v));
    if (paramEstimates.length === 0) {
      bootstrapSE.push(NaN);
      continue;
    }
    const mean = paramEstimates.reduce((a, b) => a + b, 0) / paramEstimates.length;
    const variance = paramEstimates.reduce((a, b) => a + (b - mean) ** 2, 0) / paramEstimates.length;
    bootstrapSE.push(Math.sqrt(Math.max(variance, 0)));
  }

  return {
    originalBeta: originalResult.beta,
    originalSE: originalResult.se,
    bootstrapSE,
    ciLower,
    ciUpper,
    ciLevel,
    nBootstrap: bootstrapEstimates.length,
    modelType
  };
}

// ================================================================
// MESSAGE HANDLER
// ================================================================

self.onmessage = function(e) {
  const { action, data, ...params } = e.data;

  try {
    let result;

    switch (action) {
      case 'runGLS':
        result = solveGLSWorker(data, params.tau2, params.useREML || false);
        break;

      case 'bootstrap':
        result = bootstrapWorker(
          data,
          params.nBootstrap || 1000,
          params.ciLevel || 0.95,
          params.modelType || 'quadratic'
        );
        break;

      default:
        throw new Error('Unknown action: ' + action);
    }

    postMessage({ type: 'result', action, result });

  } catch (error) {
    postMessage({ type: 'error', action, error: error.message });
  }
};
