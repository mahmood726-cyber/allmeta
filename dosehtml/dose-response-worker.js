/**
 * Dose Response Pro Web Worker (prototype; not loaded by dose-response-pro.html).
 *
 * Runs the page's GLS dose-response engine off the main thread. Everything between the ENGINE markers is a VERBATIM
 * copy of the same-named top-level functions in dose-response-pro.html (tests/test_worker.py checks this line for line
 * and checks that runGLS returns exactly the page's solveGLS() result). Do not edit them here: change the page, then
 * re-copy. The model: quadratic GLS y ~ N(X b, V + tau2 I) on the non-reference dose contrasts, Greenland-Longnecker
 * style covariance, tau2 by exact DL moment or exact REML, Cochran Q_E at tau2 = 0 (df = n - p), I2 from Q_E.
 *
 * Usage:
 *   const worker = new Worker('dose-response-worker.js');
 *   worker.postMessage({ action: 'runGLS', data: points, tau2: null, useREML: false });
 *   worker.onmessage = (e) => { console.log('Result:', e.data); };
 */

/* global importScripts, postMessage, self, AlmTail */
if (typeof importScripts === 'function') importScripts('../shared/upper-tail.js');   // AlmTail.pchisqUpper

// ===== ENGINE (verbatim from dose-response-pro.html) =====
let useREML = false;  // Use DL for tau2 estimation (simpler, more stable)
const DETERMINANT_THRESHOLD = 1e-10;  // Matrix singularity threshold
const RIDGE_PENALTY = 1e-10;  // Small ridge penalty for numerical stability
const NUMERICAL_TOLERANCE = 1e-10;  // Prevents division by zero in matrix operations

function detectStudyReferencePoint(studyPoints) {
  // Treat only deterministic anchors (logRR=0 with non-positive/unknown SE)
  // as removable reference rows. Valid dose-0 rows with positive SE are kept.
  const fixedAnchor = studyPoints.find(p =>
    Number.isFinite(p.logRR) &&
    p.logRR === 0 &&
    (!Number.isFinite(p.se) || p.se <= 0)
  );

  return fixedAnchor || null;
}

function isPositiveSemiDefinite(V, n) {
  if (!Array.isArray(V) || n <= 0 || V.length !== n * n) return false;

  const tol = 1e-10;
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const a = Number(V[i * n + j]);
      const b = Number(V[j * n + i]);
      return 0.5 * ((Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0));
    })
  );

  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  const D = new Array(n).fill(0);

  for (let j = 0; j < n; j++) {
    let diag = A[j][j];
    if (!Number.isFinite(diag)) return false;

    for (let k = 0; k < j; k++) {
      diag -= L[j][k] * L[j][k] * D[k];
    }

    if (diag < -tol) return false;
    D[j] = Math.abs(diag) <= tol ? 0 : diag;
    L[j][j] = 1;

    for (let i = j + 1; i < n; i++) {
      let value = A[i][j];
      if (!Number.isFinite(value)) return false;

      for (let k = 0; k < j; k++) {
        value -= L[i][k] * L[j][k] * D[k];
      }

      if (D[j] > tol) {
        L[i][j] = value / D[j];
      } else if (Math.abs(value) > tol) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Build GLS covariance matrix for dose-response meta-analysis
 *
 * Reference: Greenland S, Longnecker MP. Methods for trend estimation from
 * summarized dose-response data. Am J Epidemiol. 1992;135(11):1301-1309.
 *
 * Also: Orsini N, et al. Meta-analysis for linear and nonlinear dose-response
 * relations. Am J Epidemiol. 2012;175(1):66-73.
 *
 * IMPLEMENTATION NOTE: The full Greenland-Longnecker covariance formula
 * requires raw case counts from the reference category:
 *
 *   Cov(log RR_i, log RR_j) = 1/n_0 + 1/N_0
 *
 * where n_0 = cases in reference, N_0 = total in reference.
 *
 * When reference case counts are available (dose = 0), we use the
 * Greenland-Longnecker shared-reference covariance (Cov(i,j) = 1/n0).
 * When only SEs are available, we use a Hamling-style correlation
 * approximation with rho (default 0.5) and fall back to diagonal if
 * the matrix is not positive semi-definite.
 *
 * @param {Array} studyPoints - Array of non-reference study data points with se property
 * @param {number} rho - Correlation fallback when shared-reference counts are unavailable
 * @param {Object|null} referencePoint - Optional reference-category row used for shared-reference covariance
 * @returns {Array} - Covariance matrix as flat array (n x n)
 */
function buildGLSCovariance(studyPoints, rho = 0.5, referencePoint = null) {
  const n = studyPoints.length;
  if (n === 0) return [];

  rho = Math.max(0.1, Math.min(0.9, rho));
  const V = new Array(n * n).fill(0);

  const validSEs = studyPoints.filter(p => typeof p.se === 'number' && p.se > 0).map(p => p.se);
  const medianSE = validSEs.length > 0
    ? validSEs.sort((a, b) => a - b)[Math.floor(validSEs.length / 2)]
    : 0.1;

  const seValues = studyPoints.map((pt, i) => {
    if (typeof pt.se !== 'number' || pt.se <= 0) {
      console.warn(`Invalid SE for point ${i}, using median SE=${medianSE.toFixed(4)}`);
      return medianSE;
    }
    return pt.se;
  });

  const baselineIndex = studyPoints.findIndex(p => p.dose === 0);
  const baselinePointInBlock = baselineIndex >= 0 ? studyPoints[baselineIndex] : null;
  const effectiveReference = referencePoint || baselinePointInBlock;
  const hasExactCounts = Number.isFinite(effectiveReference?.cases) && effectiveReference.cases > 0;

  if (hasExactCounts) {
    const n0 = effectiveReference.cases;
    const refCov = 1 / Math.max(n0, 1);
    const variances = seValues.map(se => se * se);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          V[i * n + j] = variances[i];
        } else {
          if (i === baselineIndex || j === baselineIndex) {
            // The reference category is a fixed contrast (logRR=0); do not
            // induce correlation between reference and non-reference rows.
            V[i * n + j] = 0;
            continue;
          }
          const covBound = Math.sqrt(variances[i] * variances[j]) * 0.9;
          V[i * n + j] = Math.min(refCov, covBound);
        }
      }
    }

    if (!isPositiveSemiDefinite(V, n)) {
      console.warn('Covariance matrix not positive semi-definite, using diagonal');
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          V[i * n + j] = (i === j) ? variances[i] : 0;
        }
      }
    }
  } else {
    const variances = seValues.map(se => se * se);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          V[i * n + j] = variances[i];
        } else {
          const covBound = Math.min(variances[i], variances[j]);
          V[i * n + j] = Math.min(rho * seValues[i] * seValues[j], covBound * 0.9);
        }
      }
    }

    if (!isPositiveSemiDefinite(V, n)) {
      console.warn('Covariance matrix not positive semi-definite, using diagonal');
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          V[i * n + j] = (i === j) ? variances[i] : 0;
        }
      }
    }
  }

  return V;
}

function prepareStudyBlocksForModel(points) {
  const studyMap = new Map();
  for (const pt of points) {
    if (!studyMap.has(pt.id)) studyMap.set(pt.id, []);
    studyMap.get(pt.id).push(pt);
  }

  const blocks = [];
  const covarianceSummary = {
    sharedReference: 0,
    approximate: 0,
    totalBlocks: 0,
    referenceRowsExcluded: 0,
    droppedStudies: 0
  };

  for (const [studyId, studyPoints] of studyMap.entries()) {
    const referencePoint = detectStudyReferencePoint(studyPoints);
    const modelPoints = referencePoint
      ? studyPoints.filter(pt => pt !== referencePoint)
      : studyPoints.slice();

    if (referencePoint) {
      covarianceSummary.referenceRowsExcluded += 1;
    }

    if (modelPoints.length === 0) {
      covarianceSummary.droppedStudies += 1;
      continue;
    }

    const hasSharedReference = (Number.isFinite(referencePoint?.cases) && referencePoint.cases > 0) ||
      modelPoints.some(pt => pt.dose === 0 && Number.isFinite(pt.cases) && pt.cases > 0);
    if (hasSharedReference) {
      covarianceSummary.sharedReference += 1;
    } else {
      covarianceSummary.approximate += 1;
    }

    const V = buildGLSCovariance(modelPoints, 0.5, referencePoint);
    blocks.push({
      studyId,
      modelPoints,
      originalPoints: studyPoints.slice(),
      referencePoint,
      V
    });
  }

  covarianceSummary.totalBlocks = blocks.length;
  return { blocks, covarianceSummary };
}

function tau2BlockPieces(X, y, V_blocks, tau2) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const B2 = Array.from({ length: p }, () => new Array(p).fill(0));
  const B3 = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  const parts = [];
  let logdet = 0, trW = 0, trW2 = 0, row = 0;
  for (const block of V_blocks) {
    const n = block.n;
    // Cholesky of S = V + tau2 I, then W = S^-1 by solving against the identity.
    const L = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = block.V[i * n + j] + (i === j ? tau2 : 0);
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) { if (!(s > 0)) return null; L[i * n + i] = Math.sqrt(s); }
        else L[i * n + j] = s / L[j * n + j];
      }
      logdet += 2 * Math.log(L[i * n + i]);
    }
    const W = new Array(n * n).fill(0);
    for (let c = 0; c < n; c++) {
      const z = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let s = i === c ? 1 : 0; for (let k = 0; k < i; k++) s -= L[i * n + k] * z[k]; z[i] = s / L[i * n + i]; }
      for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * W[k * n + c]; W[i * n + c] = s / L[i * n + i]; }
    }
    const Xi = X.slice(row, row + n), yi = y.slice(row, row + n);
    const W2 = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += W[i * n + k] * W[k * n + j]; W2[i * n + j] = s; }
    const W3 = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += W2[i * n + k] * W[k * n + j]; W3[i * n + j] = s; }
    for (let i = 0; i < n; i++) { trW += W[i * n + i]; trW2 += W2[i * n + i]; }
    for (let a = 0; a < p; a++) {
      for (let c = 0; c < p; c++) {
        let s1 = 0, s2 = 0, s3 = 0;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const xx = Xi[i][a] * Xi[j][c];
          s1 += xx * W[i * n + j]; s2 += xx * W2[i * n + j]; s3 += xx * W3[i * n + j];
        }
        A[a][c] += s1; B2[a][c] += s2; B3[a][c] += s3;
      }
      let sb = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sb += Xi[i][a] * W[i * n + j] * yi[j];
      b[a] += sb;
    }
    parts.push({ n, W, Xi, yi });
    row += n;
  }
  // A^-1 by Gauss-Jordan with partial pivoting; log|A| from the pivots.
  const M = A.map((r, i) => r.concat(Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))));
  let logdetA = 0;
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (!(Math.abs(M[piv][c]) > 0)) return null;
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t; }
    const d = M[c][c]; logdetA += Math.log(Math.abs(d));
    for (let j = 0; j < 2 * p; j++) M[c][j] /= d;
    for (let r = 0; r < p; r++) if (r !== c) { const f = M[r][c]; if (f !== 0) for (let j = 0; j < 2 * p; j++) M[r][j] -= f * M[c][j]; }
  }
  const Ai = M.map(r => r.slice(p));
  const beta = Ai.map(r => r.reduce((s, v, j) => s + v * b[j], 0));
  let rWr = 0, uu = 0;
  for (const pt of parts) {
    const n = pt.n, r = pt.yi.map((v, i) => v - pt.Xi[i].reduce((s, x, j) => s + x * beta[j], 0));
    for (let i = 0; i < n; i++) { let u = 0; for (let j = 0; j < n; j++) u += pt.W[i * n + j] * r[j]; uu += u * u; rWr += r[i] * u; }
  }
  const AiB2 = Ai.map(r => B2[0].map((_, j) => r.reduce((s, v, k) => s + v * B2[k][j], 0)));
  let trAiB2 = 0, trAiB3 = 0, trSq = 0;
  for (let a = 0; a < p; a++) {
    trAiB2 += AiB2[a][a];
    for (let k = 0; k < p; k++) { trAiB3 += Ai[a][k] * B3[k][a]; trSq += AiB2[a][k] * AiB2[k][a]; }
  }
  const trP = trW - trAiB2;
  return { beta, Q: rWr, trP, trPP: trW2 - 2 * trAiB3 + trSq, score: 0.5 * (uu - trP), rll: -0.5 * (logdet + logdetA + rWr) };
}

/**
 * REML tau² for y ~ N(X beta, V + tau² I) with block-diagonal V (Harville 1977; the metafor
 * rma.uni REML criterion when every block is 1x1). The estimate is the maximiser of the exact
 * restricted log-likelihood over tau² >= 0: roots of the exact score are located by a sign scan
 * on a log grid scaled to the data, bisected to floating-point resolution (a relative rule that is
 * invariant to rescaling y and V), and compared with the boundary tau² = 0 by restricted
 * log-likelihood. Replaces a Fisher-scoring loop whose score omitted the REML correction term (it
 * converged to the ML estimate) and which stopped on an absolute change in the log-likelihood.
 */
function estimateTau2REML(X, y, V_blocks) {
  const p = X[0].length, nObs = y.length;
  if (V_blocks.length <= 1 || nObs <= p) return { tau2: 0, converged: true, iterations: 0, logLik: null };
  const at = t => tau2BlockPieces(X, y, V_blocks, t);
  let scale = 0, cnt = 0;
  for (const block of V_blocks) for (let i = 0; i < block.n; i++) { const v = block.V[i * block.n + i]; if (v > 0 && Number.isFinite(v)) { scale += v; cnt++; } }
  scale = cnt ? scale / cnt : 1;
  const base = at(0);
  if (!base) return { tau2: 0, converged: false, iterations: 0, logLik: null };
  let best = { t: 0, rll: base.rll }, evals = 1;
  // Grid 1e-10 .. 1e10 times the mean sampling variance, 8 points per decade; extended upward
  // while the score is still positive at the top.
  let prevT = 0, prev = base, hiEnd = scale * 1e10;
  for (let e = -80; ; e++) {
    const t = scale * Math.pow(10, e / 8);
    if (t > hiEnd) { if (prev.score > 0 && hiEnd < scale * 1e100) hiEnd *= 1e10; else break; }
    const cur = at(t); evals++;
    if (!cur) break;
    if (prev.score > 0 && cur.score <= 0) {
      let lo = prevT, hi = t;
      for (let i = 0; i < 2300; i++) {
        const m = 0.5 * (lo + hi);
        if (m <= lo || m >= hi) break;
        const pm = at(m); evals++;
        if (!pm) break;
        if (pm.score > 0) lo = m; else hi = m;
      }
      const r = 0.5 * (lo + hi), pr = at(r);
      if (pr && pr.rll > best.rll) best = { t: r, rll: pr.rll };
    }
    prevT = t; prev = cur;
  }
  return { tau2: best.t, converged: true, iterations: evals, logLik: best.rll - 0.5 * (nObs - p) * Math.log(2 * Math.PI) };
}

/**
 * Estimate between-study variance (tau²) using DerSimonian-Laird method
 * CORRECTED for multivariate meta-analysis with proper degrees of freedom
 *
 * @param {Array} X - Design matrix
 * @param {Array} y - Outcome vector
 * @param {Array} V_blocks - Array of covariance blocks {V, n, studyId}
 * @returns {number} - Estimated tau²
 */
function estimateTau2DL(X, y, V_blocks) {
  // Method-of-moments (DerSimonian-Laird) tau² for y ~ N(X beta, V + tau² I): (Q_E - (n - p)) / tr(P),
  // with Q_E and P = W - WX(X'WX)^-1 X'W evaluated at tau² = 0 (metafor rma.uni method="DL" for 1x1
  // blocks; the same moment equation with correlated within-study blocks). Replaces an approximate denominator
  // tr(V^-1) - df, which was used whenever the design had more than one column (every dose model).
  const p = X[0].length, nObs = y.length;
  if (V_blocks.length <= 1 || nObs <= p) return 0;
  const f = tau2BlockPieces(X, y, V_blocks, 0);
  if (!f || !Number.isFinite(f.Q) || !(f.trP > 0)) return 0;
  return Math.max(0, (f.Q - (nObs - p)) / f.trP);
}

/**
 * Wrapper function that uses the globally selected tau2 estimation method
 * @returns {Object} - tau2 estimate with method info
 */
function estimateTau2(X, y, V_blocks) {
  if (useREML) {
    const remlResult = estimateTau2REML(X, y, V_blocks);
    return {
      tau2: remlResult.tau2,
      method: 'REML',
      converged: remlResult.converged,
      iterations: remlResult.iterations,
      logLik: remlResult.logLik
    };
  } else {
    return {
      tau2: estimateTau2DL(X, y, V_blocks),
      method: 'DL',
      converged: true,
      iterations: 1,
      logLik: null
    };
  }
}

/**
 * Invert a symmetric matrix using Gaussian elimination with partial pivoting
 * This properly handles the full covariance matrix, not just diagonal
 * @param {Array} V - Covariance matrix as flat array (n x n)
 * @param {number} n - Dimension of matrix
 * @returns {Array} - Inverse matrix as flat array
 */
function invertMatrix(V, n) {
  // Create augmented matrix [V|I]
  const aug = new Array(n * 2 * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * 2 * n + j] = V[i * n + j];
    }
    aug[i * 2 * n + n + i] = 1;  // Identity matrix on right
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col * 2 * n + col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row * 2 * n + col]) > maxVal) {
        maxVal = Math.abs(aug[row * 2 * n + col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      for (let j = 0; j < 2 * n; j++) {
        [aug[col * 2 * n + j], aug[maxRow * 2 * n + j]] =
          [aug[maxRow * 2 * n + j], aug[col * 2 * n + j]];
      }
    }

    // Check for singular matrix
    if (Math.abs(aug[col * 2 * n + col]) < DETERMINANT_THRESHOLD) {
      console.warn('Matrix is near-singular, adding ridge penalty');
      aug[col * 2 * n + col] += RIDGE_PENALTY;
    }

    // Scale pivot row
    const pivot = aug[col * 2 * n + col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col * 2 * n + j] /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row * 2 * n + col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row * 2 * n + j] -= factor * aug[col * 2 * n + j];
        }
      }
    }
  }

  // Extract inverse (right half of augmented matrix)
  const inv = new Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * 2 * n + n + j];
    }
  }

  return inv;
}

/**
 * Solve GLS with tau2 using PROPER block-diagonal matrix inversion
 * This CORRECTLY accounts for within-study correlation
 * Reference: Greenland & Longnecker (1992); Orsini et al. (2006)
 *
 * @param {Array} X - Design matrix
 * @param {Array} y - Outcome vector
 * @param {Array} V_blocks - Array of covariance blocks {V, n, studyId}
 * @param {number} tau2 - Between-study variance
 * @returns {Object} - Results: beta, se, WRSS, detV, var
 */
function solveGLSWithTau2(X, y, V_blocks, tau2) {
  const n = y.length;
  const p = X[0].length;

  // Invert each block of the covariance matrix (WITHIN-STUDY CORRELATION)
  const V_inv_blocks = V_blocks.map(block => {
    const blockSize = block.n;
    const V = new Array(blockSize * blockSize);
    const V_with_tau2 = new Array(blockSize * blockSize);

    // Build covariance matrix with tau2 added to diagonal
    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    // Properly invert the FULL covariance matrix (not just diagonal!)
    const V_inv = invertMatrix(V_with_tau2, blockSize);

    return { V_inv, n: blockSize };
  });

  // Compute X'V^(-1)X and X'V^(-1)y using block-diagonal structure
  const XtVinvX = new Array(p * p).fill(0);
  const XtVinvY = new Array(p).fill(0);

  let row = 0;
  for (const blockInv of V_inv_blocks) {
    const blockSize = blockInv.n;
    const V_inv = blockInv.V_inv;

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        const w_ij = V_inv[i * blockSize + j];  // Full matrix, not just diagonal!

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

  // Add small ridge for numerical stability
  for (let i = 0; i < p; i++) {
    XtVinvX[i * p + i] += RIDGE_PENALTY;
  }

  // Solve for beta using generic inversion (supports any p)
  const XtVinvX_inv = invertMatrix(XtVinvX, p);
  const beta = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      beta[i] += XtVinvX_inv[i * p + j] * XtVinvY[j];
    }
  }

  // Compute variance-covariance of beta
  const varMatrix = XtVinvX_inv;  // Full variance-covariance matrix
  const se = [];
  for (let i = 0; i < p; i++) {
    se.push(Math.sqrt(Math.max(varMatrix[i * p + i], 0)));
  }

  // Compute weighted residual sum of squares
  let WRSS = 0;
  row = 0;
  for (const blockInv of V_inv_blocks) {
    const blockSize = blockInv.n;
    const V_inv = blockInv.V_inv;

    // Pre-compute all residuals for this block
    const residuals = [];
    for (let i = 0; i < blockSize; i++) {
      let pred_i = 0;
      for (let k = 0; k < p; k++) {
        pred_i += beta[k] * X[row + i][k];
      }
      residuals.push(y[row + i] - pred_i);
    }

    // Compute quadratic form using full V_inv
    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        WRSS += residuals[i] * V_inv[i * blockSize + j] * residuals[j];
      }
    }
    row += blockSize;
  }

  // Compute log determinant of V
  let detV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      detV += Math.log(Math.max(block.V[i * blockSize + i] + tau2, NUMERICAL_TOLERANCE));
    }
  }

  return { beta, se, WRSS, detV, varMatrix };
}

/**
 * Compute Cochran's Q statistic for heterogeneity
 *
 * Reference: Cochran, W. G. (1954). The combination of estimates from
 * different experiments. Biometrics, 10(1), 101-129.
 *
 * @param {Array} y - Outcome vector
 * @param {Array} X - Design matrix
 * @param {Array} beta - Coefficient estimates
 * @param {Array} V_blocks - Array of covariance blocks
 * @param {number} tau2 - Between-study variance
 * @returns {number} - Q statistic
 */
function computeQStat(y, X, beta, V_blocks, tau2) {
  const n = y.length;
  const p = X[0].length;
  let Q = 0;
  let row = 0;

  for (const block of V_blocks) {
    const blockSize = block.n;
    const V = new Array(blockSize * blockSize);

    // Build covariance matrix with tau2
    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    // Invert covariance matrix
    const V_inv = invertMatrix(V, blockSize);

    // Pre-compute all residuals for this block
    const residuals = [];
    for (let i = 0; i < blockSize; i++) {
      let pred_i = 0;
      for (let k = 0; k < p; k++) {
        pred_i += beta[k] * X[row + i][k];
      }
      residuals.push(y[row + i] - pred_i);
    }

    // Compute quadratic form: (y - Xb)' V^(-1) (y - Xb)
    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        Q += residuals[i] * V_inv[i * blockSize + j] * residuals[j];
      }
    }
    row += blockSize;
  }

  // Q statistic should be non-negative; negative values indicate numerical issues
  return Math.max(0, Q);
}

function solveGLS(points, tau2Override = null) {
  const prepared = prepareStudyBlocksForModel(points);
  const studyBlocks = prepared.blocks;
  const covarianceSummary = prepared.covarianceSummary;

  if (studyBlocks.length < 1) {
    throw new Error('Need at least 1 study with non-reference dose contrasts');
  }

  const X = [];
  const y = [];
  const V_blocks = [];

  for (const block of studyBlocks) {
    for (const pt of block.modelPoints) {
      X.push([1, pt.dose, pt.dose * pt.dose]);
      y.push(pt.logRR);
    }
    V_blocks.push({ studyId: block.studyId, V: block.V, n: block.modelPoints.length });
  }

  const p = 3;
  const nStudies = V_blocks.length;
  const nPoints = y.length;

  if (nPoints <= p) {
    throw new Error('Insufficient non-reference points for quadratic model estimation');
  }

  let tau2 = tau2Override;
  if (tau2 === null) {
    const tauResult = estimateTau2(X, y, V_blocks);
    tau2 = tauResult.tau2;
  }

  const result = solveGLSWithTau2(X, y, V_blocks, tau2);

  // Cochran Q test: Q_E at tau2 = 0 (fixed-effect GLS weights), df = n - p; QRE (residual at the fitted tau2) feeds HK/SJ.
  const QRE = computeQStat(y, X, result.beta, V_blocks, tau2);
  const Q = tau2 === 0 ? QRE
    : computeQStat(y, X, solveGLSWithTau2(X, y, V_blocks, 0).beta, V_blocks, 0);
  const df = Math.max(nPoints - p, 0);
  const I2 = (df > 0 && Q > 0) ? Math.max(0, 100 * (Q - df) / Q) : 0;
  const Qp = df > 0 ? AlmTail.pchisqUpper(Q, df) : NaN;

  const logLik = -0.5 * (nPoints * Math.log(2 * Math.PI) + result.WRSS + result.detV);
  const AIC = 2 * p - 2 * logLik;
  const BIC = Math.log(Math.max(nPoints, 1)) * p - 2 * logLik;

  return {
    ...result,
    tau2,
    Q,
    QRE,
    df,
    I2,
    Qp,
    nStudies,
    nPoints,
    AIC,
    BIC,
    covarianceSummary
  };
}
// ===== END ENGINE =====

// ================================================================
// WORKER ENTRY POINTS
// ================================================================

function solveGLSWorker(points, tau2Override, useREMLFlag) {
  const prev = useREML;
  useREML = !!useREMLFlag;
  try {
    const result = solveGLS(points, tau2Override === undefined ? null : tau2Override);
    return { ...result, tau2Method: tau2Override === null || tau2Override === undefined ? (useREML ? 'REML' : 'DL') : 'fixed' };
  } finally {
    useREML = prev;
  }
}

// ================================================================
// BOOTSTRAP (Worker version)
// ================================================================

function bootstrapWorker(points, nBootstrap, ciLevel, modelType) {
  const originalResult = solveGLSWorker(points, null, false);
  const bootstrapEstimates = [];
  const studyPointMap = new Map();
  for (const point of points) {
    const studyId = point?.id;
    if (studyId === undefined || studyId === null || studyId === '') continue;
    if (!studyPointMap.has(studyId)) studyPointMap.set(studyId, []);
    studyPointMap.get(studyId).push(point);
  }
  const studyIds = Array.from(studyPointMap.keys());
  if (studyIds.length === 0) {
    throw new Error('No valid study ids available for bootstrap resampling');
  }

  for (let iter = 0; iter < nBootstrap; iter++) {
    const bootStudyIds = [];
    for (let i = 0; i < studyIds.length; i++) {
      bootStudyIds.push(studyIds[Math.floor(Math.random() * studyIds.length)]);
    }

    const bootPoints = [];
    for (const studyId of bootStudyIds) {
      const sampledStudy = studyPointMap.get(studyId);
      if (sampledStudy && sampledStudy.length > 0) {
        bootPoints.push(...sampledStudy);
      }
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
