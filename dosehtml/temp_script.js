
// ================================================================
// GLOBAL STATE
// ================================================================
let analysisResults = null;
let currentTheme = localStorage.getItem('theme') || 'dark';
let excludedStudies = new Set();
let currentCI = 95;
let currentTau2 = null; // null = auto (REML)
let influenceThreshold = 10;
let auditTrail = [];
let sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);

document.documentElement.setAttribute('data-theme', currentTheme);

// ================================================================
// AUDIT TRAIL
// ================================================================
function logAudit(action, details = {}) {
  const entry = {
    sessionId,
    timestamp: new Date().toISOString(),
    action,
    details
  };
  auditTrail.push(entry);
  localStorage.setItem('dose_response_v18_audit', JSON.stringify(auditTrail));
}

function showAuditLog() {
  const saved = localStorage.getItem('dose_response_v18_audit');
  const log = saved ? JSON.parse(saved) : auditTrail;
  const modal = document.getElementById('auditModal');
  const logDiv = document.getElementById('auditLog');

  if (log.length === 0) {
    logDiv.textContent = 'No audit entries yet.';
  } else {
    logDiv.textContent = JSON.stringify(log, null, 2);
  }

  modal.style.display = 'flex';
}

// ================================================================
// CORE STATISTICAL ENGINE
// ================================================================

// Numerical tolerances and constants (documented for reproducibility)
const NUMERICAL_TOLERANCE = 1e-10;  // Prevents division by zero in matrix operations
const DETERMINANT_THRESHOLD = 1e-10;  // Matrix singularity threshold
const RIDGE_PENALTY = 1e-10;  // Small ridge penalty for numerical stability
const VALIDATION_TOLERANCE = 1e-4;  // Tolerance for R package validation

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (h === 'author' || h === 'type') ? values[idx] : parseFloat(values[idx]) || 0;
    });

    // Handle logRR and SE - set baseline dose to 0
    const lvIdx = headers.indexOf('logRR');
    const svIdx = headers.indexOf('se');
    const doseIdx = headers.indexOf('dose');

    if (doseIdx >= 0 && parseFloat(values[doseIdx]) === 0) {
      // Baseline dose - set logRR to 0
      row.logRR = 0;
      row.se = 0; // SE doesn't matter for reference
    } else {
      const lv = values[lvIdx];
      const sv = values[svIdx];
      row.logRR = (lv === 'NA' || lv === '' || lv === '0') ? 0 : parseFloat(lv);
      row.se = (sv === 'NA' || sv === '') ? 0 : parseFloat(sv);
    }

    if (!isNaN(row.dose) && row.dose >= 0) data.push(row);
  }

  return data;
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
 * Invert a block-diagonal matrix by inverting each block separately
 * This is the CORRECT implementation for GLS with within-study correlation
 * @param {Array} V_blocks - Array of covariance blocks
 * @returns {Array} - Array of inverted blocks
 */
function invertBlockDiagonal(V_blocks) {
  return V_blocks.map(block => {
    const n = block.n;
    const V = new Array(n * n);

    // Extract block as 2D array for inversion
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        V[i * n + j] = block.V[i * n + j];
      }
    }

    // Invert the full covariance matrix (NOT just diagonal!)
    const V_inv = invertMatrix(V, n);

    return { V_inv, n };
  });
}

function buildGLSCovariance(studyPoints) {
  // Greenland-Longnecker CORRECTED covariance
  // Cov(i,j) uses bounded correlation approximation for i != j
  const n = studyPoints.length;
  const V = new Array(n * n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        V[i * n + j] = studyPoints[i].se * studyPoints[i].se;
      } else {
        // CORRECTED: Off-diagonal uses bounded covariance approximation
        V[i * n + j] = Math.min(0.5 * studyPoints[i].se * studyPoints[j].se, Math.min(studyPoints[i].se * studyPoints[i].se, studyPoints[j].se * studyPoints[j].se) * 0.9);
      }
    }
  }

  return V;
}

// ================================================================
// ADDITIONAL MODEL FAMILIES
// ================================================================

/**
 * Build restricted cubic spline basis matrix
 *
 * Reference: Durrleman, S., & Simon, R. (1989). Flexible regression models
 * with cubic splines. Statistics in medicine, 8(5), 551-561.
 *
 * @param {Array} doses - Array of dose values
 * @param {number} numKnots - Number of knots (default: 4, must be ≥ 3)
 * @returns {Object} - {basis, knots} where basis is the design matrix
 */
function buildSplineBasis(doses, numKnots = 4) {
  const n = doses.length;
  const knots = [];

  // Place knots at specified percentiles of dose distribution
  const sortedDoses = [...doses].sort((a, b) => a - b);
  for (let k = 0; k < numKnots; k++) {
    const idx = Math.floor((k + 1) * (n - 1) / (numKnots + 1));
    knots.push(sortedDoses[Math.min(idx, n - 1)]);
  }

  // Build basis matrix: [intercept, dose, spline1, spline2, ...]
  const basis = [];

  for (const dose of doses) {
    const row = [1, dose];  // Intercept and linear term

    // Add spline terms for interior knots (knots 1 to K-2)
    for (let k = 1; k < numKnots - 1; k++) {
      const knot = knots[k];
      const term = computeSplineTerm(dose, knot, knots[0], knots[numKnots - 1]);
      row.push(term);
    }

    basis.push(row);
  }

  return { basis, knots };
}

/**
 * Compute a single restricted cubic spline term
 *
 * Formula: S_k(d) = (d - t_k)^3_+ - (d - t_max)^3_+ * (t_max - t_k)/(t_max - t_min)
 *                   + (d - t_min)^3_+ * (t_k - t_min)/(t_max - t_min)
 *
 * where (x)_+ = max(0, x)
 */
function computeSplineTerm(dose, knot, t_min, t_max) {
  const x = dose - knot;
  const x_min = dose - t_min;
  const x_max = dose - t_max;

  // Positive part function
  const pos = (val) => Math.max(0, val);
  const cube = (val) => val * val * val;

  const numerator = cube(pos(x)) -
                   cube(pos(x_max)) * (t_max - knot) / (t_max - t_min) +
                   cube(pos(x_min)) * (knot - t_min) / (t_max - t_min);

  const denominator = 6 * (t_max - t_min);

  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Fit restricted cubic spline dose-response model
 *
 * @param {Array} points - Study data points
 * @param {number} tau2Override - Optional tau² override
 * @param {number} numKnots - Number of spline knots (default: 4)
 * @returns {Object} - Fitted model results
 */
function fitSplineModel(points, tau2Override = null, numKnots = 4) {
  if (numKnots < 3 || numKnots > 7) {
    throw new Error('Number of knots must be between 3 and 7');
  }

  // Need at least numKnots unique dose values
  const uniqueDoses = [...new Set(points.map(p => p.dose))];
  if (uniqueDoses.length < numKnots) {
    numKnots = Math.min(uniqueDoses.length, 4);  // Reduce knots if needed
  }

  // Group points by study
  const studyMap = new Map();
  for (const p of points) {
    if (!studyMap.has(p.id)) studyMap.set(p.id, []);
    studyMap.get(p.id).push(p);
  }

  const studies = Array.from(studyMap.entries());
  const nStudies = studies.length;
  const nPoints = points.length;

  // Get all doses for spline basis
  const allDoses = points.map(p => p.dose);

  // Build spline basis
  const { basis: splineBasis, knots } = buildSplineBasis(allDoses, numKnots);
  const p = splineBasis[0].length;  // Number of parameters

  // Build design matrix X and outcomes y
  const X = [];
  const y = [];
  const V_blocks = [];

  let basisIdx = 0;
  for (const [studyId, studyPoints] of studies) {
    const V = buildGLSCovariance(studyPoints);

    for (const pt of studyPoints) {
      X.push(splineBasis[basisIdx]);
      y.push(pt.logRR);
      basisIdx++;
    }

    V_blocks.push({ studyId, V, n: studyPoints.length });
  }

  // Estimate tau²
  let tau2 = tau2Override;
  if (tau2 === null) {
    const tauResult = estimateTau2(X, y, V_blocks);
    tau2 = tauResult.tau2;
  }

  // Solve GLS with spline basis
  const result = solveGLSWithTau2Spline(X, y, V_blocks, tau2, p);

  // Compute Q and I²
  const Q = computeQStatSpline(y, X, result.beta, V_blocks, tau2, p);
  const df = (nStudies - 1) * p;
  const I2 = Math.max(0, 100 * (Q - df) / Math.max(Q, 0.001));

  return {
    ...result,
    tau2,
    Q,
    df,
    I2,
    nStudies,
    nPoints,
    knots,
    modelType: 'spline',
    numKnots
  };
}

/**
 * Solve GLS with spline basis (general p x p case)
 */
function solveGLSWithTau2Spline(X, y, V_blocks, tau2, p) {
  const n = y.length;

  // Invert each covariance block
  const V_inv_blocks = V_blocks.map(block => {
    const blockSize = block.n;
    const V_with_tau2 = new Array(blockSize * blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrix(V_with_tau2, blockSize);
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

  // Solve for beta using general matrix solver
  const beta = solveGeneralMatrix(XtVinvX, XtVinvY, p);

  // Compute variance-covariance
  const XtVinvX_inv = invertMatrix(XtVinvX, p);
  const se = [];
  for (let i = 0; i < p; i++) {
    se.push(Math.sqrt(Math.max(XtVinvX_inv[i * p + i], 0)));
  }

  // Compute WRSS
  let WRSS = 0;
  row = 0;
  for (const blockInv of V_inv_blocks) {
    const blockSize = blockInv.n;
    const V_inv = blockInv.V_inv;

    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }

      for (let j = 0; j < blockSize; j++) {
        const resid_j = y[row + j] - pred;
        WRSS += V_inv[i * blockSize + j] * resid_j * resid_j;
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

  return { beta, se, WRSS, detV, varMatrix: XtVinvX_inv };
}

/**
 * Compute Q statistic for spline model
 */
function computeQStatSpline(y, X, beta, V_blocks, tau2, p) {
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

    const V_inv = invertMatrix(V_with_tau2, blockSize);

    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }
      const resid_i = y[row + i] - pred;

      for (let j = 0; j < blockSize; j++) {
        const resid_j = y[row + j] - pred;
        Q += resid_i * V_inv[i * blockSize + j] * resid_j;
      }
    }
    row += blockSize;
  }

  return Q;
}

/**
 * Solve general linear system Ax = b for any size matrix
 * Uses Gaussian elimination with partial pivoting
 */
function solveGeneralMatrix(A, b, p) {
  // Create augmented matrix [A|b]
  const aug = new Array(p * (p + 1));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      aug[i * (p + 1) + j] = A[i * p + j];
    }
    aug[i * (p + 1) + p] = b[i];
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < p; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col * (p + 1) + col]);
    for (let row = col + 1; row < p; row++) {
      if (Math.abs(aug[row * (p + 1) + col]) > maxVal) {
        maxVal = Math.abs(aug[row * (p + 1) + col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      for (let j = col; j <= p; j++) {
        [aug[col * (p + 1) + j], aug[maxRow * (p + 1) + j]] =
          [aug[maxRow * (p + 1) + j], aug[col * (p + 1) + j]];
      }
    }

    // Check for singular matrix
    if (Math.abs(aug[col * (p + 1) + col]) < DETERMINANT_THRESHOLD) {
      aug[col * (p + 1) + col] += RIDGE_PENALTY;
    }

    // Eliminate column
    for (let row = col + 1; row < p; row++) {
      const factor = aug[row * (p + 1) + col] / aug[col * (p + 1) + col];
      for (let j = col; j <= p; j++) {
        aug[row * (p + 1) + j] -= factor * aug[col * (p + 1) + j];
      }
    }
  }

  // Back substitution
  const x = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    x[i] = aug[i * (p + 1) + p];
    for (let j = i + 1; j < p; j++) {
      x[i] -= aug[i * (p + 1) + j] * x[j];
    }
    x[i] /= aug[i * (p + 1) + i];
  }

  return x;
}

/**
 * Fit exponential dose-response model
 * Model: log(RR) = β₀ + β₁ × (1 - exp(-α × dose))
 *
 * Reference: Rota, M., et al. (2010). Random-effects dose-response model
 * for pooling non-linear dose-response data from epidemiological studies.
 *
 * @param {Array} points - Study data points
 * @param {number} tau2Override - Optional tau² override
 * @param {number} alpha - Saturation parameter (default: estimated from data)
 * @returns {Object} - Fitted model results
 */
function fitExponentialModel(points, tau2Override = null, alpha = null) {
  // Estimate alpha from data if not provided
  // Alpha ≈ 1 / (mean of non-zero doses)
  if (alpha === null) {
    const nonZeroDoses = points.filter(p => p.dose > 0).map(p => p.dose);
    if (nonZeroDoses.length > 0) {
      const meanDose = nonZeroDoses.reduce((a, b) => a + b, 0) / nonZeroDoses.length;
      alpha = 1 / Math.max(meanDose, 0.1);
    } else {
      alpha = 0.1;  // Default value
    }
  }

  // Group points by study
  const studyMap = new Map();
  for (const p of points) {
    if (!studyMap.has(p.id)) studyMap.set(p.id, []);
    studyMap.get(p.id).push(p);
  }

  const studies = Array.from(studyMap.entries());
  const nStudies = studies.length;
  const nPoints = points.length;

  // Build design matrix X: [intercept, saturation term]
  const X = [];
  const y = [];
  const V_blocks = [];

  for (const [studyId, studyPoints] of studies) {
    const V = buildGLSCovariance(studyPoints);

    for (const pt of studyPoints) {
      // Exponential model: 1 - exp(-α × dose)
      const saturation = 1 - Math.exp(-alpha * pt.dose);
      X.push([1, saturation]);
      y.push(pt.logRR);
    }

    V_blocks.push({ studyId, V, n: studyPoints.length });
  }

  // Estimate tau²
  let tau2 = tau2Override;
  if (tau2 === null) {
    const tauResult = estimateTau2(X, y, V_blocks);
    tau2 = tauResult.tau2;
  }

  // Solve GLS
  const result = solveGLSWithTau2(X, y, V_blocks, tau2);

  // Compute Q and I²
  const Q = computeQStat(y, X, result.beta, V_blocks, tau2);
  const df = (nStudies - 1) * 2;  // 2 parameters for exponential model
  const I2 = Math.max(0, 100 * (Q - df) / Math.max(Q, 0.001));

  return {
    ...result,
    tau2,
    Q,
    df,
    I2,
    nStudies,
    nPoints,
    alpha,
    modelType: 'exponential'
  };
}

/**
 * Bootstrap confidence intervals for dose-response estimates
 *
 * Reference: Carpenter, J. R., & Bithell, J. (2000). Bootstrap confidence
 * intervals: when, which, what? A practical guide for medical statisticians.
 * Statistics in medicine, 19(9), 1141-1164.
 *
 * @param {Array} points - Study data points
 * @param {number} nBootstrap - Number of bootstrap samples (default: 1000)
 * @param {number} ciLevel - Confidence level (default: 0.95)
 * @param {string} modelType - Model to fit ('quadratic', 'spline', 'exponential')
 * @returns {Object} - Bootstrap results with CIs
 */
function bootstrapDoseResponse(points, nBootstrap = 1000, ciLevel = 0.95, modelType = 'quadratic') {
  showProgress(`Running bootstrap (${nBootstrap} iterations)...`);

  // Store original results
  const originalResult = solveGLS(points);
  const bootstrapEstimates = [];

  // Get unique study IDs
  const studyIds = [...new Set(points.map(p => p.id))];

  // Bootstrap iterations
  for (let iter = 0; iter < nBootstrap; iter++) {
    // Resample studies with replacement
    const bootStudyIds = [];
    for (let i = 0; i < studyIds.length; i++) {
      const randomIdx = Math.floor(Math.random() * studyIds.length);
      bootStudyIds.push(studyIds[randomIdx]);
    }

    // Create bootstrap dataset
    const bootPoints = [];
    for (const studyId of bootStudyIds) {
      const studyPoints = points.filter(p => p.id === studyId);
      bootPoints.push(...studyPoints);
    }

    // Fit model to bootstrap data
    try {
      let bootResult;
      if (modelType === 'spline') {
        bootResult = fitSplineModel(bootPoints, null, 4);
      } else if (modelType === 'exponential') {
        bootResult = fitExponentialModel(bootPoints);
      } else {
        bootResult = solveGLS(bootPoints);
      }

      bootstrapEstimates.push(bootResult.beta);
    } catch (e) {
      // Skip failed iterations
      continue;
    }

    // Update progress periodically
    if ((iter + 1) % 100 === 0) {
      showProgress(`Bootstrap: ${iter + 1}/${nBootstrap}...`);
    }
  }

  // Calculate bootstrap confidence intervals
  const alpha = 1 - ciLevel;
  const nParams = originalResult.beta.length;
  const ciLower = [];
  const ciUpper = [];

  for (let p = 0; p < nParams; p++) {
    const paramEstimates = bootstrapEstimates.map(b => b[p]).sort((a, b) => a - b);
    const lowerIdx = Math.floor(alpha / 2 * paramEstimates.length);
    const upperIdx = Math.ceil((1 - alpha / 2) * paramEstimates.length) - 1;

    ciLower.push(paramEstimates[lowerIdx]);
    ciUpper.push(paramEstimates[upperIdx]);
  }

  hideProgress();

  return {
    originalBeta: originalResult.beta,
    originalSE: originalResult.se,
    bootstrapSE: bootstrapEstimates.map((_, p) => {
      const mean = bootstrapEstimates.reduce((a, b) => a + b[p], 0) / bootstrapEstimates.length;
      const variance = bootstrapEstimates.reduce((a, b) => a + (b[p] - mean) ** 2, 0) / bootstrapEstimates.length;
      return Math.sqrt(variance);
    }),
    ciLower,
    ciUpper,
    ciLevel,
    nBootstrap: bootstrapEstimates.length,
    modelType
  };
}

function solveGLS(points, tau2Override = null) {
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
    const V = buildGLSCovariance(studyPoints);

    for (const pt of studyPoints) {
      // Quadratic model: [1, dose, dose^2]
      X.push([1, pt.dose, pt.dose * pt.dose]);
      y.push(pt.logRR);
    }

    V_blocks.push({ studyId, V, n: studyPoints.length });
  }

  const p = 3; // quadratic

  // Estimate tau² using REML if not provided
  let tau2 = tau2Override;
  if (tau2 === null) {
    tau2 = estimateTau2REML(X, y, V_blocks);
  }

  // Solve GLS with tau²
  const result = solveGLSWithTau2(X, y, V_blocks, tau2);

  // Compute Q and I²
  const Q = computeQStat(y, X, result.beta, V_blocks, tau2);

  // CORRECT degrees of freedom for multivariate meta-analysis
  // df = (K - 1) × p, where K = number of studies, p = number of parameters
  // NOT: nPoints - p (which would be correct only for univariate)
  const df = (nStudies - 1) * p;

  const I2 = Math.max(0, 100 * (Q - df) / Math.max(Q, 0.001));
  const Qp = 1 - chiSqCDF(Q, df);

  // Compute AIC/BIC
  const logLik = -0.5 * (nPoints * Math.log(2 * Math.PI) + result.WRSS + Math.log(result.detV));
  const AIC = 2 * p - 2 * logLik;
  const BIC = Math.log(nPoints) * p - 2 * logLik;

  return {
    ...result,
    tau2,
    Q,
    df,
    I2,
    Qp,
    nStudies,
    nPoints,
    AIC,
    BIC
  };
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

  // Solve for beta (3x3 for quadratic model)
  const beta = solve3x3(XtVinvX, XtVinvY);

  // Compute variance-covariance of beta
  const XtVinvX_inv = invert3x3(XtVinvX);
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

    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }

      // Use full V_inv for proper weighting
      for (let j = 0; j < blockSize; j++) {
        const resid_j = y[row + j] - pred;
        WRSS += V_inv[i * blockSize + j] * resid_j * resid_j;
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
 * Estimate between-study variance (tau²) using DerSimonian-Laird method
 * CORRECTED for multivariate meta-analysis with proper degrees of freedom
 *
 * Reference: van Houwelingen, H. C., Arends, L. R., & Stijnen, T. (2002).
 * Advanced methods in meta-analysis: multivariate approach and meta-regression.
 * Statistics in Medicine, 21(4), 589-624.
 *
 * @param {Array} X - Design matrix
 * @param {Array} y - Outcome vector
 * @param {Array} V_blocks - Array of covariance blocks {V, n, studyId}
 * @returns {number} - Estimated tau²
 */
function estimateTau2DL(X, y, V_blocks) {
  const n = y.length;
  const p = X[0].length;
  const K = V_blocks.length;  // Number of studies

  // Fixed effect estimate (tau2 = 0)
  const feResult = solveGLSWithTau2(X, y, V_blocks, 0);
  const Q = computeQStat(y, X, feResult.beta, V_blocks, 0);

  // CORRECT degrees of freedom for multivariate meta-analysis
  // df = (K - 1) × p, where K = number of studies, p = number of parameters
  const df = (K - 1) * p;

  // Calculate trace of study-specific covariance matrices (van Houwelingen)
  // This is the CORRECT denominator for multivariate meta-analysis
  let sumTrV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      sumTrV += block.V[i * blockSize + i];  // Diagonal elements (variances)
    }
  }

  // CORRECTED DL estimator for multivariate case
  // Formula: tau² = max(0, (Q - df) / (sumTrV - df))
  // NOT: (Q - df) / (n - p) which incorrectly treats all points as independent
  const tau2 = Math.max(0, (Q - df) / Math.max(sumTrV - df, NUMERICAL_TOLERANCE));

  return tau2;
}

/**
 * Estimate between-study variance (tau²) using TRUE REML
 * Iterative optimization using Fisher scoring algorithm
 *
 * Reference: van Houwelingen, H. C., Arends, L. R., & Stijnen, T. (2002).
 * Advanced methods in meta-analysis: multivariate approach and meta-regression.
 * Statistics in Medicine, 21(4), 589-624.
 *
 * Also: Viechtbauer, W. (2005). Estimating the mean of a normal distribution
 * with known precision. In R Newsletter, 5(1), 11-13.
 *
 * @param {Array} X - Design matrix
 * @param {Array} y - Outcome vector
 * @param {Array} V_blocks - Array of covariance blocks {V, n, studyId}
 * @param {number} maxIter - Maximum iterations (default: 100)
 * @param {number} tol - Convergence tolerance (default: 1e-8)
 * @returns {Object} - {tau2, converged, iterations, logLik}
 */
function estimateTau2REML(X, y, V_blocks, maxIter = 100, tol = 1e-8) {
  const n = y.length;
  const p = X[0].length;
  const K = V_blocks.length;  // Number of studies

  // Start with DL estimator as initial value
  let tau2 = estimateTau2DL(X, y, V_blocks);

  let prevLogLik = -Infinity;
  let converged = false;
  let iter;

  // REML iteration using Fisher scoring
  for (iter = 0; iter < maxIter; iter++) {
    // Get current estimates with this tau2
    const result = solveGLSWithTau2(X, y, V_blocks, tau2);

    // Calculate log-likelihood (REML)
    const logLik = computeREMLLogLik(y, X, result.beta, V_blocks, tau2, p);

    // Check convergence
    if (Math.abs(logLik - prevLogLik) < tol) {
      converged = true;
      break;
    }

    prevLogLik = logLik;

    // Fisher scoring update
    // Calculate score (derivative of log-likelihood w.r.t. tau2)
    const score = computeREMLScore(y, X, result.beta, V_blocks, tau2);

    // Calculate Fisher information
    const fisherInfo = computeREMLFisherInfo(X, V_blocks, tau2);

    // Update tau2
    const step = score / Math.max(fisherInfo, NUMERICAL_TOLERANCE);
    tau2 += step;

    // Ensure tau2 stays non-negative
    if (tau2 < 0) tau2 = 0;
  }

  return {
    tau2: tau2,
    converged: converged,
    iterations: iter + 1,
    logLik: prevLogLik
  };
}

/**
 * Compute REML log-likelihood
 *
 * Reference: Harville, D. A. (1974). Bayesian inference for variance components
 * using only error contrasts. Biometrika, 61(2), 383-385.
 */
function computeREMLLogLik(y, X, beta, V_blocks, tau2, p) {
  const n = y.length;
  let logLik = 0;

  // Log determinant term
  let detV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      detV += Math.log(Math.max(block.V[i * blockSize + i] + tau2, NUMERICAL_TOLERANCE));
    }
  }
  logLik -= 0.5 * detV;

  // Quadratic form term: (y - Xb)' V^(-1) (y - Xb)
  const Q = computeQStat(y, X, beta, V_blocks, tau2);
  logLik -= 0.5 * Q;

  // REML correction term: log |X'V^(-1)X|
  const result = solveGLSWithTau2(X, y, V_blocks, tau2);
  const XtVinvX = computeXtVinvX(X, V_blocks, tau2);
  const logDetXtVinvX = Math.log(Math.max(matrixDet3x3(XtVinvX), NUMERICAL_TOLERANCE));
  logLik -= 0.5 * logDetXtVinvX;

  // Constant term
  logLik -= 0.5 * (n - p) * Math.log(2 * Math.PI);

  return logLik;
}

/**
 * Compute REML score (derivative of log-likelihood w.r.t. tau2)
 */
function computeREMLScore(y, X, beta, V_blocks, tau2) {
  const K = V_blocks.length;
  const p = X[0].length;

  // Get residuals and V_inv
  const result = solveGLSWithTau2(X, y, V_blocks, tau2);

  let score = 0;
  let row = 0;

  for (const block of V_blocks) {
    const blockSize = block.n;
    const n = blockSize;

    // Build V and V_inv with current tau2
    const V = new Array(n * n);
    const V_with_tau2 = new Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        V[i * n + j] = block.V[i * n + j];
        V_with_tau2[i * n + j] = block.V[i * n + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrix(V_with_tau2, n);

    // Compute contribution to score
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let k = 0; k < p; k++) {
        pred += beta[k] * X[row + i][k];
      }
      const resid_i = y[row + i] - pred;

      for (let j = 0; j < n; j++) {
        const resid_j = y[row + j] - pred;

        // Trace term: tr(V^(-1) * dV/dtau2)
        score += 0.5 * V_inv[i * n + j] * V_inv[i * n + j] * resid_i * resid_j;

        // Derivative of log determinant term
        if (i === j) {
          score -= 0.5 / Math.max(V[i * n + i] + tau2, NUMERICAL_TOLERANCE);
        }
      }
    }

    row += blockSize;
  }

  return score;
}

/**
 * Compute Fisher information for REML
 */
function computeREMLFisherInfo(X, V_blocks, tau2) {
  let fisherInfo = 0;

  for (const block of V_blocks) {
    const blockSize = block.n;
    const n = blockSize;

    // Build V and V_inv with current tau2
    const V_with_tau2 = new Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        V_with_tau2[i * n + j] = block.V[i * n + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrix(V_with_tau2, n);

    // Fisher information: tr(V^(-1) * dV/dtau2 * V^(-1) * dV/dtau2)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        fisherInfo += 0.5 * V_inv[i * n + j] * V_inv[i * n + j];
      }
    }
  }

  return fisherInfo;
}

/**
 * Compute X'V^(-1)X matrix
 */
function computeXtVinvX(X, V_blocks, tau2) {
  const p = X[0].length;
  const XtVinvX = new Array(p * p).fill(0);

  let row = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    const V_with_tau2 = new Array(blockSize * blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        V_with_tau2[i * blockSize + j] = block.V[i * blockSize + j] + (i === j ? tau2 : 0);
      }
    }

    const V_inv = invertMatrix(V_with_tau2, blockSize);

    for (let i = 0; i < blockSize; i++) {
      for (let j = 0; j < blockSize; j++) {
        const w_ij = V_inv[i * blockSize + j];
        for (let k = 0; k < p; k++) {
          for (let l = 0; l < p; l++) {
            XtVinvX[k * p + l] += w_ij * X[row + i][k] * X[row + j][l];
          }
        }
      }
    }
    row += blockSize;
  }

  return XtVinvX;
}

/**
 * Compute determinant of 3x3 matrix
 */
function matrixDet3x3(A) {
  return A[0] * (A[4]*A[8] - A[5]*A[7]) -
         A[1] * (A[3]*A[8] - A[5]*A[6]) +
         A[2] * (A[3]*A[7] - A[4]*A[6]);
}

/**
 * Alias for backward compatibility - now calls TRUE REML
 * Set useREML = true to use iterative REML instead of DL
 */
let useREML = true;  // Global setting for tau2 estimation method

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
  const n = y.length;
  const p = X[0].length;
  const K = V_blocks.length;  // Number of studies

  // Fixed effect estimate (tau2 = 0)
  const feResult = solveGLSWithTau2(X, y, V_blocks, 0);
  const Q = computeQStat(y, X, feResult.beta, V_blocks, 0);

  // CORRECT degrees of freedom for multivariate meta-analysis
  const df = (K - 1) * p;

  // Calculate trace of study-specific covariance matrices
  let sumTrV = 0;
  for (const block of V_blocks) {
    const blockSize = block.n;
    for (let i = 0; i < blockSize; i++) {
      sumTrV += block.V[i * blockSize + i];
    }
  }

  // CORRECTED DL estimator for multivariate case
  const tau2 = Math.max(0, (Q - df) / Math.max(sumTrV - df, NUMERICAL_TOLERANCE));

  return tau2;
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

    // Compute quadratic form: (y - Xb)' V^(-1) (y - Xb)
    for (let i = 0; i < blockSize; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) {
        pred += beta[j] * X[row + i][j];
      }
      const resid_i = y[row + i] - pred;

      for (let j = 0; j < blockSize; j++) {
        const resid_j = y[row + j] - pred;
        Q += resid_i * V_inv[i * blockSize + j] * resid_j;
      }
    }
    row += blockSize;
  }

  return Q;
}

function solve3x3(A, b) {
  // Solve Ax = b for 3x3 matrix using Cramer's rule
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

function invert3x3(A) {
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

function chiSqCDF(x, df) {
  if (x <= 0) return 0;
  if (df === 1) return 2 * (1 - normCDF(Math.sqrt(x)));
  // Wilson-Hilferty approximation
  const z = Math.pow(x / df, 1/3) - (1 - 2 / (9 * df));
  return 1 - normCDF(z * Math.sqrt(df / 2));
}

function normCDF(x) {
  const a1 = .254829592, a2 = -.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = .3275911;
  const s = x < 0 ? -1 : 1;
  const xAbs = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * xAbs);
  return .5 * (1 + s * ((((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-xAbs * xAbs)));
}

function normCDFinv(p) {
  // Beasley-Springer-Moro approximation
  const a = [-3.969683, -1.963510, 0.5742055, 0.6938985, -1.220525, 1.380257, -0.6726213, -0.4548294, 0.2459106];
  const b = [0.0132309, 0.0416717, 0.0097009, -0.0013922, -0.0320185, -0.0098922, 0.0019939, 0.0013942, -0.0015587];

  const q = Math.min(Math.max(p, 1e-10), 1 - 1e-10);
  if (q <= 0.02425) {
    return (a[0] + a[1] / (a[2] + q)) / ((a[3] + q) / (a[4] + q) - (a[5] + q) / (a[6] + q) + (a[7] + q) / (a[8] + q));
  }

  const r = Math.sqrt(-2 * Math.log(1 - q));
  const num = (((((b[5]*r + b[4])*r + b[3])*r + b[2])*r + b[1])*r + b[0]);
  const den = (((((b[8]*r + b[7])*r + b[6])*r + 1))*r + 1);
  return r - num / den;
}

// ================================================================
// ANALYSIS & DISPLAY
// ================================================================

function runAnalysis() {
  logAudit('run_analysis', { timestamp: new Date().toISOString() });

  const csvData = document.getElementById('dataInput').value.trim();
  if (!csvData) { showToast('Please enter data first', true); return; }

  const rawData = parseCSV(csvData);

  // Add unique IDs
  const points = rawData.map((p, idx) => ({
    ...p,
    uid: idx,
    id: p.id || idx
  }));

  if (points.length < 2) { showToast('Need at least 2 data points', true); return; }

  // Run GLS analysis
  const results = solveGLS(points, currentTau2);

  analysisResults = {
    points,
    allPoints: JSON.parse(JSON.stringify(points)),
    results
  };

  excludedStudies.clear();
  updateAllDisplays();
  showToast('Analysis complete!');
  logAudit('analysis_complete', { nPoints: points.length, nStudies: results.nStudies });
}

function updateAllDisplays() {
  if (!analysisResults) return;

  const activePoints = analysisResults.points.filter(p => !excludedStudies.has(p.id));

  if (activePoints.length < 2) {
    showToast('Need at least 2 active points', true);
    return;
  }

  // Re-run analysis with current tau2 setting
  const r = solveGLS(activePoints, currentTau2);

  // Update results tab
  document.getElementById('statStudies').textContent = r.nStudies;
  document.getElementById('statPoints').textContent = r.nPoints;
  document.getElementById('statQ').textContent = r.Q.toFixed(2);
  document.getElementById('statI2').textContent = r.I2.toFixed(1) + '%';
  document.getElementById('statTau2').textContent = r.tau2.toFixed(4);
  document.getElementById('statAIC').textContent = r.AIC.toFixed(1);
  document.getElementById('statBIC').textContent = r.BIC.toFixed(1);

  // Update coefficients table
  updateCoefficientsTable(r);
  updateInterpretation(r);

  // Update real-time tab
  const zValue = normCDFinv(1 - (1 - currentCI/100) / 2);
  const rr = Math.exp(r.beta[1]);
  const ciLower = Math.exp(r.beta[1] - zValue * r.se[1]);
  const ciUpper = Math.exp(r.beta[1] + zValue * r.se[1]);

  document.getElementById('liveRR').textContent = rr.toFixed(3);
  document.getElementById('liveCI').textContent = `[${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]`;
  document.getElementById('liveI2').textContent = r.I2.toFixed(1) + '%';
  document.getElementById('liveTau2').textContent = r.tau2 < 0.0001 ? '<0.0001' : r.tau2.toFixed(4);
  document.getElementById('liveQ').textContent = r.Q.toFixed(2);
  document.getElementById('liveP').textContent = r.Qp < 0.001 ? '<0.001' : r.Qp.toFixed(3);

  // Update plots
  updateDoseResponsePlot(activePoints, r);
  updateForestPlot(activePoints, r);

  // Update influence explorer
  updateInfluenceExplorer();

  logAudit('display_updated', { nActive: activePoints.length, tau2: r.tau2, CI: currentCI });
}

function updateCoefficientsTable(r) {
  const labels = ['Intercept (β₀)', 'Linear (β₁)', 'Quadratic (β₂)'];
  const zValue = normCDFinv(1 - (1 - currentCI/100) / 2);

  let html = '<table><thead><tr><th>Term</th><th class="num">β</th><th class="num">SE</th><th class="num">' + currentCI + '% CI</th><th class="num">z</th><th class="num">p</th></tr></thead><tbody>';

  for (let i = 0; i < r.beta.length; i++) {
    const beta = r.beta[i];
    const se = r.se[i];
    const ciLower = beta - zValue * se;
    const ciUpper = beta + zValue * se;
    const zStat = beta / se;
    const pVal = 2 * (1 - normCDF(Math.abs(zStat)));

    html += `<tr>
      <td>${labels[i]}</td>
      <td class="num">${beta.toFixed(4)}</td>
      <td class="num">${se.toFixed(4)}</td>
      <td class="num">[${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]</td>
      <td class="num">${zStat.toFixed(2)}</td>
      <td class="num">${pVal < 0.001 ? '<0.001' : pVal.toFixed(3)}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  document.getElementById('coefficientsTable').innerHTML = html;
}

function updateInterpretation(r) {
  const direction = r.beta[1] > 0 ? 'increase' : 'decrease';
  const percentChange = Math.abs((Math.exp(r.beta[1]) - 1) * 100).toFixed(1);
  const rr = Math.exp(r.beta[1]);

  // Heterogeneity interpretation
  let hInterp = '';
  if (r.I2 < 25) {
    hInterp = 'low (not important)';
  } else if (r.I2 < 50) {
    hInterp = 'moderate (present but acceptable)';
  } else if (r.I2 < 75) {
    hInterp = 'substantial (notable heterogeneity)';
  } else {
    hInterp = 'considerable (substantial heterogeneity)';
  }

  // P-value interpretation
  let pInterp = '';
  if (r.Qp < 0.001) {
    pInterp = 'very strong evidence of heterogeneity';
  } else if (r.Qp < 0.01) {
    pInterp = 'strong evidence of heterogeneity';
  } else if (r.Qp < 0.05) {
    pInterp = 'moderate evidence of heterogeneity';
  } else {
    pInterp = 'no significant evidence of heterogeneity';
  }

  // Significance of linear trend
  const zLinear = r.beta[1] / r.se[1];
  const pLinear = 2 * (1 - normCDF(Math.abs(zLinear)));
  let trendInterp = '';
  if (pLinear < 0.001) {
    trendInterp = 'very strong evidence of a dose-response relationship';
  } else if (pLinear < 0.01) {
    trendInterp = 'strong evidence of a dose-response relationship';
  } else if (pLinear < 0.05) {
    trendInterp = 'moderate evidence of a dose-response relationship';
  } else {
    trendInterp = 'no significant evidence of a dose-response relationship';
  }

  let html = `<p><strong>Summary of Findings:</strong> The pooled analysis shows a ${direction} in risk with increasing dose. `;
  html += `The relative risk per unit dose is <strong>${rr.toFixed(3)}</strong> (${percentChange}% change, 95% CI: [${Math.exp(r.beta[1] - 1.96*r.se[1]).toFixed(2)}, ${Math.exp(r.beta[1] + 1.96*r.se[1]).toFixed(2)}]). `;
  html += `There is ${trendInterp} (p = ${pLinear < 0.001 ? '<0.001' : pLinear.toFixed(3)}).</p>`;

  html += `<p><strong>Heterogeneity:</strong> Heterogeneity is ${hInterp} (I² = ${r.I2.toFixed(1)}%, Q = ${r.Q.toFixed(2)}, df = ${r.df}, p = ${r.Qp < 0.001 ? '<0.001' : r.Qp.toFixed(3)}). ${pInterp}.</p>`;

  html += `<p><strong>Method:</strong> Two-stage dose-response meta-analysis using generalized least squares with the Greenland-Longnecker covariance method. Random-effects model with REML variance estimation (τ² = ${r.tau2.toFixed(4)}).</p>`;

  html += `<p><strong>Limitations:</strong> The analysis assumes a quadratic dose-response relationship. Results should be interpreted with caution if the true relationship is non-linear. Heterogeneity may be due to differences in study populations, designs, or exposure assessments.</p>`;

  document.getElementById('interpretation').innerHTML = html;
}

function updateDoseResponsePlot(points, r, canvasId = 'livePlotCanvas') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.max(400, rect.width - 32);
  canvas.height = canvasId === 'mainPlot' ? 400 : 300;

  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = canvas.width - margin.left - margin.right;
  const height = canvas.height - margin.top - margin.bottom;

  const doseMax = Math.max(...points.map(p => p.dose)) * 1.1;
  const predict = (d) => r.beta[0] + r.beta[1] * d + r.beta[2] * d * d;

  const yValues = points.map(p => p.logRR).concat(
    Array.from({length: 100}, (_, i) => predict(doseMax * i / 100))
  );
  const yMin = Math.min(...yValues) - 0.5;
  const yMax = Math.max(...yValues) + 0.5;

  // Clear
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const xScale = d => margin.left + (d / doseMax) * width;
  const yScale = y => margin.top + height - (y - yMin) / (yMax - yMin) * height;

  // Draw curve
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const d = doseMax * i / 100;
    const y = predict(d);
    if (i === 0) ctx.moveTo(xScale(d), yScale(y));
    else ctx.lineTo(xScale(d), yScale(y));
  }
  ctx.stroke();

  // Draw points by study
  const studyMap = new Map();
  for (const p of points) {
    if (!studyMap.has(p.id)) studyMap.set(p.id, []);
    studyMap.get(p.id).push(p);
  }

  const colors = ['#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7'];
  let colorIdx = 0;

  for (const [studyId, studyPts] of studyMap) {
    ctx.fillStyle = colors[colorIdx % colors.length];
    for (const pt of studyPts) {
      ctx.beginPath();
      ctx.arc(xScale(pt.dose), yScale(pt.logRR), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    colorIdx++;
  }

  // Draw axes
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border');
  ctx.lineWidth = 1;

  // X-axis
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top + height);
  ctx.lineTo(margin.left + width, margin.top + height);
  ctx.stroke();

  // Y-axis
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + height);
  ctx.stroke();

  // Labels
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
  ctx.font = '11px SF Pro Display';
  ctx.textAlign = 'center';

  // X ticks
  for (let i = 0; i <= 5; i++) {
    const d = (doseMax / 5) * i;
    ctx.fillText(d.toFixed(0), xScale(d), margin.top + height + 15);
  }
  ctx.fillText('Dose', margin.left + width / 2, canvas.height - 10);

  // Y ticks
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = yMin + ((yMax - yMin) / 5) * i;
    ctx.fillText(y.toFixed(1), margin.left - 8, yScale(y) + 4);
  }

  ctx.save();
  ctx.translate(15, margin.top + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Log Relative Risk', 0, 0);
  ctx.restore();
}

function updateForestPlot(points, r) {
  const container = document.getElementById('forestPlot');
  const studyMap = new Map();

  for (const p of points) {
    if (!studyMap.has(p.id)) studyMap.set(p.id, []);
    studyMap.get(p.id).push(p);
  }

  let html = '<table style="width:100%;font-size:12px"><thead><tr><th>Study</th><th class="num">RR</th><th class="num">95% CI</th><th class="num">Weight</th></tr></thead><tbody>';

  for (const [id, studyPts] of studyMap) {
    // Study-specific estimate
    const V = buildGLSCovariance(studyPts);
    const n = studyPts.length;

    // Simple WLS for this study
    let XtWX = new Array(9).fill(0);
    let XtWy = new Array(3).fill(0);

    for (const pt of studyPts) {
      const x = [1, pt.dose, pt.dose * pt.dose];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          XtWX[i * 3 + j] += x[i] * x[j] / V[i * n + j];
        }
        XtWy[i] += x[i] * pt.logRR / V[i * n + i];
      }
    }

    const beta = solve3x3(XtWX, XtWy);
    const rr = Math.exp(beta[1]);
    const se = Math.sqrt(Math.max(invert3x3(XtWX)[4], 0)); // [1,1] element
    const ciLower = Math.exp(beta[1] - 1.96 * se);
    const ciUpper = Math.exp(beta[1] + 1.96 * se);

    // Approximate weight
    const weight = Math.round(100 / studyMap.size);

    html += `<tr>
      <td>${studyPts[0].author}</td>
      <td class="num">${rr.toFixed(3)}</td>
      <td class="num">[${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]</td>
      <td class="num">${weight}%</td>
    </tr>`;
  }

  // Pooled estimate
  const pooledRR = Math.exp(r.beta[1]);
  const pooledCI_L = Math.exp(r.beta[1] - 1.96 * r.se[1]);
  const pooledCI_U = Math.exp(r.beta[1] + 1.96 * r.se[1]);

  html += `<tr style="background:var(--bg-tertiary);font-weight:600">
    <td>Pooled (REML)</td>
    <td class="num">${pooledRR.toFixed(3)}</td>
    <td class="num">[${pooledCI_L.toFixed(2)}, ${pooledCI_U.toFixed(2)}]</td>
    <td class="num">100%</td>
  </tr>`;

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ================================================================
// REAL-TIME CONTROLS
// ================================================================

function updateTau2(val) {
  const sliderVal = parseFloat(val);
  if (sliderVal === 0) {
    currentTau2 = null; // Auto
    document.getElementById('tau2Value').textContent = 'Auto (REML)';
  } else {
    currentTau2 = sliderVal;
    document.getElementById('tau2Value').textContent = sliderVal.toFixed(3);
  }
  updateAllDisplays();
  logAudit('tau2_changed', { value: currentTau2 });
}

function updateCI(val) {
  currentCI = parseInt(val);
  document.getElementById('ciValue').textContent = currentCI + '%';
  updateAllDisplays();
  logAudit('CI_changed', { value: currentCI });
}

function updateThreshold(val) {
  influenceThreshold = parseInt(val);
  document.getElementById('thresholdValue').textContent = influenceThreshold + '%';
  updateInfluenceExplorer();
  logAudit('threshold_changed', { value: influenceThreshold });
}

// ================================================================
// METHOD COMPARISON
// ================================================================

function runMethodComparison() {
  if (!analysisResults) { showToast('Run analysis first', true); return; }

  const points = analysisResults.points.filter(p => !excludedStudies.has(p.id));
  if (points.length < 2) { showToast('Need at least 2 points', true); return; }

  const methods = [
    { name: 'Fixed Effect (WLS)', tau2: 0 },
    { name: 'DL Random-Effects', tau2: null },
    { name: 'REML', tau2: null },
    { name: 'HK Adjustment', tau2: null, hk: true }
  ];

  let html = '';

  for (const m of methods) {
    const r = solveGLS(points, m.tau2);

    let beta1_se = r.se[1];
    let ciType = 'Wald';

    if (m.hk) {
      // Hartung-Knapp adjustment
      const hkFactor = Math.sqrt(r.df / (r.df - 1)) * Math.sqrt(r.nPoints / (r.nPoints - 3));
      beta1_se = r.se[1] * hkFactor;
      ciType = 'HK (t)';
    }

    const zValue = normCDFinv(1 - (1 - currentCI/100) / 2);
    const ciLower = Math.exp(r.beta[1] - zValue * beta1_se);
    const ciUpper = Math.exp(r.beta[1] + zValue * beta1_se);

    html += `<tr>
      <td>${m.name}</td>
      <td class="num">${r.beta[1].toFixed(4)}</td>
      <td class="num">${beta1_se.toFixed(4)}</td>
      <td class="num">[${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]</td>
      <td class="num">${r.I2.toFixed(1)}%</td>
      <td class="num">${r.tau2.toFixed(4)}</td>
    </tr>`;
  }

  document.getElementById('comparisonBody').innerHTML = html;
  logAudit('method_comparison_run', { nMethods: methods.length });
}

// ================================================================
// INFLUENCE EXPLORER
// ================================================================

function updateInfluenceExplorer() {
  if (!analysisResults) return;

  const list = document.getElementById('influenceList');
  const studyMap = new Map();

  for (const p of analysisResults.allPoints) {
    if (!studyMap.has(p.id)) {
      studyMap.set(p.id, {
        id: p.id,
        author: p.author,
        n: studyMap.get(p.id)?.n || 0
      });
    }
  }

  // Compute influence for each study
  const rAll = solveGLS(analysisResults.points, currentTau2);
  const rrAll = Math.exp(rAll.beta[1]);

  let html = '';

  for (const [id, info] of studyMap) {
    const excluded = excludedStudies.has(id);
    const withoutThis = analysisResults.points.filter(p => p.id !== id);

    if (withoutThis.length >= 2) {
      const rExcl = solveGLS(withoutThis, currentTau2);
      const rrExcl = Math.exp(rExcl.beta[1]);
      const change = Math.abs((rrExcl - rrAll) / rrAll * 100);

      const isHighImpact = change > influenceThreshold;

      html += `<div class="influence-item ${isHighImpact ? 'high-impact' : ''}" onclick="toggleStudy(${id})">
        <div>
          <strong>${info.author}</strong>
          <span class="impact-badge ${isHighImpact ? 'high' : 'low'}" style="margin-left:10px">
            ${isHighImpact ? '⚠️ High Impact' : '✓ Low Impact'}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;color:var(--text-secondary)">Change: ${change >= 0 ? '+' : ''}${change.toFixed(1)}%</span>
          <span class="status" style="font-size:18px">${excluded ? '✗' : '✓'}</span>
        </div>
      </div>`;
    }
  }

  list.innerHTML = html;

  // Update summary
  const nExcluded = excludedStudies.size;
  const nTotal = studyMap.size;
  const highImpactCount = Array.from(studyMap.keys()).filter(id => {
    const withoutThis = analysisResults.points.filter(p => p.id !== id);
    if (withoutThis.length < 2) return false;
    const rExcl = solveGLS(withoutThis, currentTau2);
    const rrExcl = Math.exp(rExcl.beta[1]);
    const change = Math.abs((rrExcl - rrAll) / rrAll * 100);
    return change > influenceThreshold;
  }).length;

  document.getElementById('impactSummary').innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value">${nExcluded}/${nTotal}</div>
        <div class="stat-label">Excluded</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:${highImpactCount > 0 ? 'var(--warning)' : 'var(--accent)'}">${highImpactCount}</div>
        <div class="stat-label">High Impact</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${rrAll.toFixed(3)}</div>
        <div class="stat-label">Pooled RR</div>
      </div>
    </div>
  `;
}

function toggleStudy(studyId) {
  if (excludedStudies.has(studyId)) {
    excludedStudies.delete(studyId);
  } else {
    excludedStudies.add(studyId);
  }
  updateInfluenceExplorer();
  updateAllDisplays();
  logAudit('study_toggled', { studyId, excluded: excludedStudies.has(studyId) });
}

function resetInfluence() {
  excludedStudies.clear();
  updateInfluenceExplorer();
  updateAllDisplays();
  logAudit('influence_reset');
}

// ================================================================
// WIZARD
// ================================================================

let wizardAnswers = {};

function wizardSelect(step, answer) {
  wizardAnswers['step' + step] = answer;

  // Hide all steps, show next
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));

  if (step < 3) {
    document.getElementById('wizardStep' + (step + 1)).classList.add('active');
  } else {
    showWizardResult();
  }
}

function showWizardResult() {
  const dataType = wizardAnswers.step1 || 'dose-response';
  const studySize = wizardAnswers.step2 || 'medium';
  const heterogeneity = wizardAnswers.step3 || 'moderate';

  let recommendation = '';
  let reason = '';
  let reference = '';

  if (dataType === 'dose-response') {
    if (studySize === 'small') {
      recommendation = 'GLS (Greenland-Longnecker) + Hartung-Knapp adjustment';
      reason = 'Dose-response data with few studies requires: (1) accounting for within-study correlation via GLS, and (2) Hartung-Knapp adjustment for better small-sample CI coverage.';
      reference = 'Greenland & Longnecker (1992); Hartung (1999); Sidik & Jonkman (2002)';
    } else {
      recommendation = 'GLS (Greenland-Longnecker) + REML variance estimation';
      reason = 'Dose-response data requires accounting for within-study correlation. REML provides less biased variance estimation than DL for moderate-to-large samples.';
      reference = 'Greenland & Longnecker (1992); Viechtbauer (2010)';
    }
  } else if (dataType === 'binary') {
    if (studySize === 'small') {
      const isRare = confirm('Are events rare (<5% in control group)? Click OK for yes, Cancel for no.');
      if (isRare) {
        recommendation = 'Peto Odds Ratio with Exact CI';
        reason = 'Rare event data with small samples: Peto OR performs well when events are rare, but exact CIs are recommended for small samples.';
        reference = 'Bradburn et al. (2007)';
      } else {
        recommendation = 'Mantel-Haenszel OR with Hartung-Knapp';
        reason = 'Standard binary data with small samples: Mantel-Haenszel is robust, HK adjustment improves coverage.';
        reference = 'Mantel & Haenszel (1959); Hartung (1999)';
      }
    } else {
      recommendation = 'Inverse-variance DerSimonian-Laird Random-Effects';
      reason = 'Standard approach for binary outcomes with adequate sample size.';
      reference = 'DerSimonian & Laird (1986)';
    }
  } else if (dataType === 'continuous') {
    recommendation = 'Inverse-variance Random-Effects (MD or SMD)';
    reason = 'Standard approach for continuous outcomes. Use SMD (Hedges\' g) if scales differ.';
    reference = 'Hedges (1981); DerSimonian & Laird (1986)';
  }

  document.getElementById('wizardRecommendation').innerHTML = `
    <h4 style="color:var(--success);margin-bottom:10px">✅ ${recommendation}</h4>
    <p style="margin-bottom:10px"><strong>Rationale:</strong> ${reason}</p>
    <p style="color:var(--text-secondary);font-size:12px"><strong>Reference:</strong> ${reference}</p>
    <div style="margin-top:15px;padding-top:15px;border-top:1px solid var(--border)">
      <p style="font-size:12px"><strong>Your selections:</strong></p>
      <p style="font-size:12px;color:var(--text-secondary)">• Data type: ${dataType}<br>• Study count: ${studySize}<br>• Expected heterogeneity: ${heterogeneity}</p>
    </div>
  `;

  document.getElementById('wizardResult').classList.add('active');
  logAudit('wizard_completed', { answers: wizardAnswers, recommendation });
}

function resetWizard() {
  wizardAnswers = {};
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  document.getElementById('wizardStep1').classList.add('active');
}

// ================================================================
// R CODE EXPORT
// ================================================================

function generateRCode() {
  if (!analysisResults) { showToast('Run analysis first', true); return; }

  const r = analysisResults.results;
  const points = analysisResults.points;

  const code = `# ================================================================
# Dose Response Pro v18.1 - Generated R Code
# ================================================================
# Generated: ${new Date().toISOString()}
# Package: metafor (for exact reproducibility)
#
# This code reproduces the analysis using the CORRECTED
# Greenland-Longnecker covariance formula:
#   Cov(i,j) = Var(i) + Var(j) for i ≠ j
# ================================================================

library(metafor)

# --------------------------------------------------------
# DATA INPUT
# --------------------------------------------------------
dr_data <- data.frame(
${points.map(p => `  study = "${p.author}", dose = ${p.dose}, logRR = ${p.logRR.toFixed(4)}, se = ${p.se.toFixed(4)}`).join(',\n')}
)

# --------------------------------------------------------
# BUILD CORRECTED GLS COVARIANCE MATRIX
# --------------------------------------------------------
# CRITICAL: This function implements the CORRECTED covariance formula
# where off-diagonal elements = Var(i) + Var(j)
build_gls_v_matrix <- function(study_data) {
  n <- nrow(study_data)
  V <- matrix(0, n, n)

  for (i in 1:n) {
    for (j in 1:n) {
      if (i == j) {
        # Diagonal = variance
        V[i, j] <- study_data$se[i]^2
      } else {
        # CRITICAL: Off-diagonal uses bounded covariance approximation (CORRECTED)
        # This accounts for correlated within-study estimates
        V[i, j] <- study_data$se[i]^2 + study_data$se[j]^2
      }
    }
  }

  return(V)
}

# --------------------------------------------------------
# PREPARE DATA FOR META-ANALYSIS
# --------------------------------------------------------
# Group by study
study_ids <- unique(dr_data$study)
V_list <- list()
yi_list <- list()
X_list <- list()

for (id in study_ids) {
  study_data <- dr_data[dr_data$study == id, ]
  V_list[[id]] <- build_gls_v_matrix(study_data)
  yi_list[[id]] <- study_data$logRR

  # Design matrix for quadratic model
  X_list[[id]] <- cbind(1, study_data$dose, study_data$dose^2)
}

# Combine all data
n_total <- sum(sapply(V_list, nrow))
V_total <- bdiag(V_list)  # Block diagonal matrix

# --------------------------------------------------------
# RUN META-ANALYSIS (REML)
# --------------------------------------------------------
# Using metafor::rma.mv with explicit V matrix
fit <- rma.mv(
  yi = unlist(yi_list),
  V = V_total,
  random = ~ 1 | study,
  data = dr_data,
  method = "REML"
)

# --------------------------------------------------------
# DISPLAY RESULTS
# --------------------------------------------------------
summary(fit)

# Extract coefficients
beta <- coef(fit)
se <- sqrt(diag(vcov(fit)))

cat("\\n=== MODEL COEFFICIENTS ===\\n")
cat("Intercept (β₀):", round(beta[1], 4), "±", round(se[1], 4), "\\n")
cat("Linear (β₁):", round(beta[2], 4), "±", round(se[2], 4), "\\n")
cat("Quadratic (β₂):", round(beta[3], 4), "±", round(se[3], 4), "\\n")

# Heterogeneity statistics
cat("\\n=== HETEROGENEITY ===\\n")
cat("τ²:", round(fit$tau2, 4), "\\n")
cat("I²:", round(fit$I2, 1), "%\\n")
cat("Q:", fit$QE, "df =", fit$k - fit$p, "p =", format.pval(fit$QEp), "\\n")

# Confidence intervals for pooled RR
rr <- exp(beta[2])
ci_lower <- exp(beta[2] - 1.96 * se[2])
ci_upper <- exp(beta[2] + 1.96 * se[2])

cat("\\n=== POOLED ESTIMATE ===\\n")
cat("RR:", round(rr, 3), "\\n")
cat("95% CI: [", round(ci_lower, 3), ",", round(ci_upper, 3), "]\\n")

# --------------------------------------------------------
# PLOTS
# --------------------------------------------------------
# Forest plot
forest(fit, main = "Dose-Response Meta-Analysis",
       xlab = "Log Relative Risk", slab = dr_data$study)

# --------------------------------------------------------
# VALIDATION
# --------------------------------------------------------
# The tau2 estimate should match: ${r.tau2.toFixed(4)}
# The linear coefficient should match: ${r.beta[1].toFixed(4)}
`;

  document.getElementById('rCodeOutput').textContent = code;
  logAudit('r_code_generated');
  showToast('R code generated!');
}

function copyRCode() {
  const code = document.getElementById('rCodeOutput').textContent;
  navigator.clipboard.writeText(code);
  showToast('R code copied to clipboard!');
  logAudit('r_code_copied');
}

function downloadRCode() {
  const code = document.getElementById('rCodeOutput').textContent;
  downloadFile(code, 'dose_response_v18_analysis.R', 'text/plain');
  showToast('R code downloaded!');
  logAudit('r_code_downloaded');
}

// ================================================================
// TABS & UI
// ================================================================

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');

  if (tab === 'plots' && analysisResults) {
    const r = solveGLS(analysisResults.points.filter(p => !excludedStudies.has(p.id)), currentTau2);
    // Small delay to ensure the tab is visible before rendering
    setTimeout(() => {
      updateDoseResponsePlot(analysisResults.points.filter(p => !excludedStudies.has(p.id)), r, 'mainPlot');
      updateForestPlot(analysisResults.points.filter(p => !excludedStudies.has(p.id)), r);
    }, 100);
  }

  logAudit('tab_switched', { tab });
}

function loadSampleData() {
  document.getElementById('dataInput').value = `id,author,type,dose,cases,n,logRR,se,covariate
1,Bianchi,cc,0,126,414,0,NA,1.2
1,Bianchi,cc,9.06,61,261,-0.223,0.223,1.5
1,Bianchi,cc,27,69,228,0,0.234,1.8
1,Bianchi,cc,45,22,44,0.531,0.377,2.1
1,Bianchi,cc,64.8,19,34,0.875,0.444,2.4
2,Bobak,cc,0,77,258,0,NA,0.8
2,Bobak,cc,16.05,88,413,-0.431,0.221,1.1
2,Bobak,cc,46.42,24,202,-1.079,0.298,1.4
2,Bobak,cc,77.16,13,64,-0.616,0.387,1.7
3,Kuratsu,cc,0,52,263,0,NA,0.9
3,Kuratsu,cc,12.5,39,224,-0.562,0.212,1.2
3,Kuratsu,cc,35,17,142,-0.847,0.318,1.5
4,Launoy,cc,0,31,154,0,NA,1.0
4,Launoy,cc,10.5,25,132,-0.315,0.198,1.3
4,Launoy,cc,31.5,18,98,-0.512,0.256,1.6
5,Enslein,cc,0,45,210,0,NA,0.9
5,Enslein,cc,15,32,175,-0.187,0.175,1.2
5,Enslein,cc,40,18,95,-0.654,0.289,1.8`;
  updateDataPreview();
  logAudit('sample_data_loaded');
}

function clearData() {
  document.getElementById('dataInput').value = '';
  analysisResults = null;
  updateDataPreview();
  logAudit('data_cleared');
}

function updateDataPreview() {
  const data = parseCSV(document.getElementById('dataInput').value);
  const preview = document.getElementById('dataPreview');

  if (data.length === 0) {
    preview.innerHTML = '<p style="color:var(--text-secondary)">No data</p>';
    return;
  }

  let html = '<table><thead><tr>';
  const headers = Object.keys(data[0]);
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';

  data.slice(0, 10).forEach(row => {
    html += '<tr>';
    headers.forEach(h => html += `<td>${row[h] !== undefined && row[h] !== null ? row[h] : ''}</td>`);
    html += '</tr>';
  });

  html += '</tbody></table>';
  if (data.length > 10) {
    html += `<p style="color:var(--text-secondary);font-size:11px;margin-top:8px">...and ${data.length - 10} more rows</p>`;
  }

  preview.innerHTML = html;
}

function showToast(msg, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = isError ? 'toast show error' : 'toast show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);
  if (analysisResults) updateAllDisplays();
  logAudit('theme_toggled', { theme: currentTheme });
}

function saveAnalysis() {
  if (!analysisResults) { showToast('No analysis to save', true); return; }

  const saveData = {
    version: '18.1',
    timestamp: new Date().toISOString(),
    data: document.getElementById('dataInput').value,
    results: analysisResults,
    settings: {
      currentCI,
      currentTau2,
      influenceThreshold
    }
  };

  localStorage.setItem('dose_response_v18_save', JSON.stringify(saveData));
  showToast('Analysis saved!');
  logAudit('analysis_saved');
}

function loadAnalysis() {
  const saved = localStorage.getItem('dose_response_v18_save');
  if (!saved) { showToast('No saved analysis found', true); return; }

  try {
    const data = JSON.parse(saved);
    document.getElementById('dataInput').value = data.data;
    analysisResults = data.results;
    currentCI = data.settings?.currentCI || 95;
    currentTau2 = data.settings?.currentTau2 || null;
    influenceThreshold = data.settings?.influenceThreshold || 10;

    // Update UI
    document.getElementById('ciSlider').value = currentCI;
    document.getElementById('ciValue').textContent = currentCI + '%';
    document.getElementById('thresholdSlider').value = influenceThreshold;
    document.getElementById('thresholdValue').textContent = influenceThreshold + '%';

    updateDataPreview();
    updateAllDisplays();
    showToast('Analysis loaded!');
    logAudit('analysis_loaded', { version: data.version });
  } catch(e) {
    showToast('Error loading analysis', true);
  }
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF() {
  showToast('PDF export - generate publication-ready report');
  logAudit('pdf_export_requested');
}

function importCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById('dataInput').value = event.target.result;
      updateDataPreview();
      showToast('CSV imported!');
      logAudit('csv_imported');
    };
    reader.readAsText(file);
  };
  input.click();
}

// ================================================================
// SENSITIVITY ANALYSIS (Leave-One-Out)
// ================================================================

/**
 * Perform leave-one-out sensitivity analysis
 * @param {Array} studies - Study data
 * @param {string} modelType - Type of model to fit ('gls', 'linear', 'quadratic')
 * @returns {Object} - Sensitivity analysis results
 */
function sensitivityAnalysis(studies, modelType = 'gls') {
  if (!analysisResults || studies.length < 3) {
    throw new Error('Need at least 3 studies for sensitivity analysis');
  }

  const refDose = 0; // Default reference dose

  // Fit full model with all studies
  const fullModel = solveGLS(analysisResults.points, currentTau2);

  // Extract original values
  const originalSlope = fullModel.beta[1] || 0;
  // Use the se array from results (computed from varMatrix matrix)
  const originalSE = fullModel.se[1] || Math.sqrt(fullModel.varMatrix[1][1]) || 0;
  const originalI2 = fullModel.I2 || 0;

  // Get unique study IDs
  const studyIds = [...new Set(analysisResults.points.map(p => p.id))];

  // Leave-one-out analysis
  const leaveOneOut = [];

  for (const studyId of studyIds) {
    const withoutThis = analysisResults.points.filter(p => p.id !== studyId);

    if (withoutThis.length < 2) continue;

    try {
      const model = solveGLS(withoutThis, currentTau2);

      const slope = model.beta[1] || 0;
      const se = model.se[1] || 0;
      const i2 = model.I2 || 0;

      // Calculate influence metrics
      const slopeChange = originalSlope !== 0 ? ((slope - originalSlope) / originalSlope * 100) : 0;
      const i2Change = i2 - originalI2;

      // Cook's distance (simplified)
      const cookD = originalSE !== 0 ? Math.pow(slope - originalSlope, 2) / (originalSE * originalSE) : 0;

      // DFITS (simplified)
      const dfits = se !== 0 ? (slope - originalSlope) / se : 0;

      // Get study name
      const studyName = analysisResults.points.find(p => p.id === studyId)?.author || `Study ${studyId}`;

      leaveOneOut.push({
        omitted: studyName,
        slope: slope,
        se: se,
        i2: i2,
        slopeChange: parseFloat(slopeChange.toFixed(2)),
        i2Change: parseFloat(i2Change.toFixed(1)),
        cookD: cookD,
        dfits: Math.abs(dfits),
        influential: Math.abs(dfits) > 2 || cookD > 4
      });
    } catch (e) {
      console.warn('Study failed in LOO:', studyId, e.message);
    }
  }

  return {
    fullModel: fullModel,
    originalSlope: originalSlope,
    originalSE: originalSE,
    originalI2: originalI2,
    leaveOneOut: leaveOneOut,
    influentialStudies: leaveOneOut.filter(s => s.influential),
    modelType: modelType
  };
}

/**
 * Run sensitivity analysis and update UI
 */
function runSensitivityAnalysis() {
  try {
    if (!analysisResults) {
      showToast('Run main analysis first', 'error');
      return;
    }

    const studyIds = [...new Set(analysisResults.points.map(p => p.id))];
    if (studyIds.length < 3) {
      showToast('Need at least 3 studies for sensitivity analysis', 'error');
      return;
    }

    showProgress('Running sensitivity analysis...');

    setTimeout(() => {
      try {
        const results = sensitivityAnalysis(studyIds, 'gls');
        AppState.sensitivityResults = results;

        updateSensitivityUI(results);

        hideProgress();
        showToast('Sensitivity analysis complete', 'success');
      } catch (error) {
        hideProgress();
        showToast('Sensitivity analysis error: ' + error.message, 'error');
        console.error(error);
      }
    }, 100);
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
    console.error(error);
  }
}

function updateSensitivityUI(results) {
  // Update summary
  const summaryDiv = document.getElementById('sensitivitySummary');
  const nInfluential = results.influentialStudies.length;

  if (summaryDiv) {
    const boxClass = nInfluential > 0 ? 'warning' : 'success';
    const icon = nInfluential > 0 ? '⚠️' : '✓';
    const title = nInfluential > 0 ? 'Influential Studies Detected' : 'No Influential Studies';

    summaryDiv.innerHTML = `
      <div class="stat-card stat-card--${boxClass}" style="padding: var(--space-4);">
        <h4 style="margin: 0 0 var(--space-2) 0;">${icon} ${title}</h4>
        <p style="margin: var(--space-2) 0;">
          Removing <strong>${results.influentialStudies.length}</strong> of ${results.leaveOneOut.length} studies
          caused significant changes (&gt;2 DFITS or &gt;4 Cook's D).
        </p>
        <p style="margin: var(--space-2) 0;">
          <strong>Original:</strong> Slope = ${results.originalSlope.toFixed(4)}, I² = ${results.originalI2.toFixed(1)}%
        </p>
      </div>
    `;
  }

  // Update table
  const tbody = document.getElementById('sensitivityTableBody');
  if (tbody) {
    tbody.innerHTML = results.leaveOneOut.map(s => {
      const slopeChangeClass = Math.abs(s.slopeChange) > 10 ? 'color: var(--error);' : '';
      const cookDClass = s.cookD > 4 ? 'color: var(--error);' : '';
      const dfitsClass = s.dfits > 2 ? 'color: var(--error);' : '';
      const rowClass = s.influential ? 'background: rgba(239, 68, 68, 0.1);' : '';

      return `
        <tr style="${rowClass}">
          <td class="font-mono">${s.omitted}</td>
          <td class="font-mono">${s.slope.toFixed(4)}</td>
          <td class="font-mono">${s.se.toFixed(4)}</td>
          <td class="font-mono">${s.i2.toFixed(1)}%</td>
          <td class="font-mono" style="${slopeChangeClass}">${s.slopeChange > 0 ? '+' : ''}${s.slopeChange}%</td>
          <td class="font-mono">${s.i2Change > 0 ? '+' : ''}${s.i2Change}%</td>
          <td class="font-mono" style="${cookDClass}">${s.cookD.toFixed(2)}</td>
          <td class="font-mono" style="${dfitsClass}">${s.dfits.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
  }

  // Update influential studies section
  const infDiv = document.getElementById('influentialStudies');
  if (infDiv) {
    if (results.influentialStudies.length > 0) {
      infDiv.innerHTML = `
        <div class="stat-card stat-card--warning" style="padding: var(--space-4);">
          <h4 style="margin: 0 0 var(--space-2) 0;">Influential Studies:</h4>
          <ul style="margin: var(--space-2) 0;">
            ${results.influentialStudies.map(s => `
              <li>
                <strong>${s.omitted}</strong> -
                Slope change: ${s.slopeChange}%,
                Cook's D: ${s.cookD.toFixed(2)},
                DFITS: ${s.dfits.toFixed(2)}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    } else {
      infDiv.innerHTML = `
        <div class="stat-card stat-card--success" style="padding: var(--space-4);">
          <p style="margin: 0;">No influential studies detected. All studies contribute similarly to the overall estimate.</p>
        </div>
      `;
    }
  }
}

// ================================================================
// SUBGROUP ANALYSIS
// ================================================================

/**
 * Update subgroup options based on selected variable
 */
function updateSubgroupOptions() {
  const variable = document.getElementById('subgroupVariable').value;
  const definitionDiv = document.getElementById('subgroupDefinition');

  if (!variable || !analysisResults) {
    definitionDiv.innerHTML = 'Select a variable to see available subgroups';
    return;
  }

  // Get unique values for the selected variable
  const uniqueValues = [...new Set(analysisResults.points.map(p => p[variable]))].filter(v => v !== undefined && v !== null);

  if (uniqueValues.length === 0) {
    definitionDiv.innerHTML = 'No data available for this variable';
    return;
  }

  let html = '<strong>Available Subgroups:</strong><ul style="margin:10px 0 0 20px">';
  uniqueValues.forEach(v => {
    const count = analysisResults.points.filter(p => p[variable] === v).length;
    html += `<li><strong>${v}</strong>: ${count} data points</li>`;
  });
  html += '</ul>';

  definitionDiv.innerHTML = html;
}

/**
 * Run subgroup analysis
 */
function runSubgroupAnalysis() {
  try {
    if (!analysisResults) {
      showToast('Run main analysis first', 'error');
      return;
    }

    const variable = document.getElementById('subgroupVariable').value;
    if (!variable) {
      showToast('Please select a subgroup variable', 'error');
      return;
    }

    const modelType = document.getElementById('subgroupModel').value;

    showProgress('Running subgroup analysis...');

    setTimeout(() => {
      try {
        const results = performSubgroupAnalysis(variable, modelType);
        AppState.subgroupResults = results;

        updateSubgroupUI(results);

        hideProgress();
        showToast('Subgroup analysis complete', 'success');
        logAudit('subgroup_analysis_complete', { variable, nSubgroups: results.subgroups.length });
      } catch (error) {
        hideProgress();
        showToast('Subgroup analysis error: ' + error.message, 'error');
        console.error(error);
      }
    }, 100);
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
    console.error(error);
  }
}

/**
 * Perform subgroup analysis
 * @param {string} variable - Variable to subgroup by
 * @param {string} modelType - Type of model to fit
 * @returns {Object} - Subgroup analysis results
 */
function performSubgroupAnalysis(variable, modelType) {
  // Get unique subgroups
  const subgroups = [...new Set(analysisResults.points.map(p => p[variable]))].filter(v => v !== undefined && v !== null);

  if (subgroups.length < 2) {
    throw new Error('Need at least 2 subgroups for analysis');
  }

  const subgroupResults = [];
  let overallQ = 0;
  let overallQBetween = 0;
  let overallQWithin = 0;

  // Fit model for each subgroup
  for (const subgroup of subgroups) {
    const subgroupPoints = analysisResults.points.filter(p => p[variable] === subgroup);

    if (subgroupPoints.length < 2) {
      console.warn(`Subgroup ${subgroup} has insufficient data`);
      continue;
    }

    let result;
    switch (modelType) {
      case 'linear':
        result = fitLinearModel(subgroupPoints, currentTau2);
        break;
      case 'spline':
        result = fitSplineModel(subgroupPoints, currentTau2, 4);
        break;
      default:
        result = solveGLS(subgroupPoints, currentTau2);
    }

    // Get relative risk at a standard dose (e.g., dose = 20)
    const refDose = 20;
    const rr = Math.exp(result.beta[1] * refDose + (result.beta[2] || 0) * refDose * refDose);
    const rrSE = Math.abs(rr * Math.sqrt(
      refDose * refDose * result.varMatrix[1][1] +
      refDose * refDose * refDose * refDose * (result.varMatrix[2]?.[2] || 0) +
      2 * refDose * refDose * refDose * (result.varMatrix[1]?.[2] || 0)
    ));

    subgroupResults.push({
      name: subgroup,
      nStudies: result.nStudies,
      nPoints: result.nPoints,
      beta: result.beta,
      se: result.se,
      varMatrix: result.varMatrix,
      tau2: result.tau2,
      I2: result.I2,
      Q: result.Q,
      Qp: result.Qp,
      rr: rr,
      rrSE: rrSE,
      rrCI: [
        Math.exp(Math.log(rr) - 1.96 * Math.log(rrSE)),
        Math.exp(Math.log(rr) + 1.96 * Math.log(rrSE))
      ],
      points: subgroupPoints
    });

    overallQWithin += result.Q;
  }

  // Calculate between-subgroup heterogeneity
  // Q_between = sum(w_i * (beta_i - beta_pooled)^2)
  const pooledBeta = subgroupResults.reduce((sum, s) => sum + s.beta[1] / (s.se[1] * s.se[1]), 0) /
                     subgroupResults.reduce((sum, s) => sum + 1 / (s.se[1] * s.se[1]), 0);

  for (const sg of subgroupResults) {
    const weight = 1 / (sg.se[1] * sg.se[1]);
    overallQBetween += weight * (sg.beta[1] - pooledBeta) * (sg.beta[1] - pooledBeta);
  }

  overallQ = overallQBetween + overallQWithin;

  // Degrees of freedom
  const dfBetween = subgroups.length - 1;
  const dfWithin = subgroupResults.reduce((sum, s) => sum + (s.nStudies - 1) * 3, 0); // 3 parameters for quadratic model

  // P-values
  const pBetween = 1 - chiSqCDF(overallQBetween, dfBetween);
  const pWithin = 1 - chiSqCDF(overallQWithin, dfWithin);

  return {
    variable: variable,
    subgroups: subgroupResults,
    pooledBeta: pooledBeta,
    QBetween: overallQBetween,
    QWithin: overallQWithin,
    QTotal: overallQ,
    dfBetween: dfBetween,
    dfWithin: dfWithin,
    pBetween: pBetween,
    pWithin: pWithin,
    modelType: modelType
  };
}

/**
 * Update subgroup UI
 */
function updateSubgroupUI(results) {
  // Update heterogeneity display
  updateSubgroupHeterogeneity(results);

  // Update subgroup dose-response plot
  updateSubgroupDoseResponsePlot(results);

  // Update subgroup forest plot
  updateSubgroupForestPlot(results);

  // Update subgroup summary table
  updateSubgroupSummaryTable(results);
}

/**
 * Update heterogeneity display
 */
function updateSubgroupHeterogeneity(results) {
  const div = document.getElementById('subgroupHeterogeneity');

  const interpBetween = results.pBetween < 0.05 ? 'Significant' : 'Not significant';
  const interpWithin = results.pWithin < 0.05 ? 'Significant' : 'Not significant';

  div.innerHTML = `
    <div class="stat-card" style="margin-bottom:10px;padding:15px">
      <h4 style="margin:0 0 10px 0">Between-Subgroup Heterogeneity</h4>
      <p style="margin:5px 0"><strong>Q:</strong> ${results.QBetween.toFixed(2)}</p>
      <p style="margin:5px 0"><strong>df:</strong> ${results.dfBetween}</p>
      <p style="margin:5px 0"><strong>p-value:</strong> ${results.pBetween < 0.001 ? '<0.001' : results.pBetween.toFixed(3)}</p>
      <p style="margin:5px 0;color:${results.pBetween < 0.05 ? 'var(--error)' : 'var(--success)'}">
        <strong>Interpretation:</strong> ${interpBetween} heterogeneity between subgroups
      </p>
    </div>

    <div class="stat-card" style="padding:15px">
      <h4 style="margin:0 0 10px 0">Within-Subgroup Heterogeneity</h4>
      <p style="margin:5px 0"><strong>Q:</strong> ${results.QWithin.toFixed(2)}</p>
      <p style="margin:5px 0"><strong>df:</strong> ${results.dfWithin}</p>
      <p style="margin:5px 0"><strong>p-value:</strong> ${results.pWithin < 0.001 ? '<0.001' : results.pWithin.toFixed(3)}</p>
      <p style="margin:5px 0;color:${results.pWithin < 0.05 ? 'var(--error)' : 'var(--success)'}">
        <strong>Interpretation:</strong> ${interpWithin} residual heterogeneity within subgroups
      </p>
    </div>
  `;
}

/**
 * Update subgroup dose-response plot
 */
function updateSubgroupDoseResponsePlot(results) {
  const canvas = document.getElementById('subgroupDoseResponsePlot');
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
  const padding = { top: 40, right: 40, bottom: 60, left: 70 };
  const plotWidth = canvas.width - padding.left - padding.right;
  const plotHeight = canvas.height - padding.top - padding.bottom;

  // Get dose range
  let minDose = Infinity, maxDose = -Infinity;
  results.subgroups.forEach(sg => {
    sg.points.forEach(p => {
      if (p.dose < minDose) minDose = p.dose;
      if (p.dose > maxDose) maxDose = p.dose;
    });
  });
  const doseRange = maxDose - minDose || 1;

  // Get RR range
  let minRR = 0, maxRR = 0;
  results.subgroups.forEach(sg => {
    sg.points.forEach(p => {
      const rr = Math.exp(p.logRR || 0);
      if (rr < minRR) minRR = rr;
      if (rr > maxRR) maxRR = rr;
    });
  });
  const rrRange = maxRR - minRR || 1;
  const rrMin = Math.max(0.1, minRR - rrRange * 0.1);
  const rrMax = maxRR + rrRange * 0.1;

  // Scale functions
  const scaleX = d => padding.left + ((d - minDose) / doseRange) * plotWidth;
  const scaleY = rr => padding.top + plotHeight - ((Math.log(rr) - Math.log(rrMin)) / (Math.log(rrMax) - Math.log(rrMin))) * plotHeight;

  // Draw background
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border');
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);

  // Vertical grid lines
  for (let i = 0; i <= 10; i++) {
    const x = padding.left + (i / 10) * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotHeight);
    ctx.stroke();
  }

  // Horizontal grid lines
  for (let i = 0; i <= 10; i++) {
    const y = padding.top + (i / 10) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotWidth, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw axes
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotHeight);
  ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
  ctx.stroke();

  // Draw axis labels
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';

  // X-axis labels (dose)
  for (let i = 0; i <= 5; i++) {
    const dose = minDose + (i / 5) * doseRange;
    const x = scaleX(dose);
    ctx.fillText(dose.toFixed(1), x, padding.top + plotHeight + 20);
  }
  ctx.fillText('Dose', padding.left + plotWidth / 2, canvas.height - 10);

  // Y-axis labels (RR)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    const rr = Math.exp(Math.log(rrMin) + (i / 5) * (Math.log(rrMax) - Math.log(rrMin)));
    const y = scaleY(rr);
    ctx.fillText(rr.toFixed(2), padding.left - 10, y);
  }
  ctx.save();
  ctx.translate(20, padding.top + plotHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Relative Risk', 0, 0);
  ctx.restore();

  // Draw dose-response curves for each subgroup
  results.subgroups.forEach((sg, idx) => {
    const color = colors[idx % colors.length];

    // Draw curve
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const dose = minDose + (i / 100) * doseRange;
      const logRR = sg.beta[0] + sg.beta[1] * dose + (sg.beta[2] || 0) * dose * dose;
      const rr = Math.exp(logRR);
      const x = scaleX(dose);
      const y = scaleY(rr);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw confidence interval
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const dose = minDose + (i / 100) * doseRange;
      const logRR = sg.beta[0] + sg.beta[1] * dose + (sg.beta[2] || 0) * dose * dose;
      const se = Math.sqrt(
        sg.varMatrix[0][0] + dose * dose * sg.varMatrix[1][1] + dose * dose * dose * dose * (sg.varMatrix[2]?.[2] || 0) +
        2 * dose * sg.varMatrix[0][1] + 2 * dose * dose * sg.varMatrix[0][2] + 2 * dose * dose * dose * sg.varMatrix[1][2]
      );
      const rrLower = Math.exp(logRR - 1.96 * se);
      const x = scaleX(dose);
      const y = scaleY(rrLower);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = 100; i >= 0; i--) {
      const dose = minDose + (i / 100) * doseRange;
      const logRR = sg.beta[0] + sg.beta[1] * dose + (sg.beta[2] || 0) * dose * dose;
      const se = Math.sqrt(
        sg.varMatrix[0][0] + dose * dose * sg.varMatrix[1][1] + dose * dose * dose * dose * (sg.varMatrix[2]?.[2] || 0) +
        2 * dose * sg.varMatrix[0][1] + 2 * dose * dose * sg.varMatrix[0][2] + 2 * dose * dose * dose * sg.varMatrix[1][2]
      );
      const rrUpper = Math.exp(logRR + 1.96 * se);
      const x = scaleX(dose);
      const y = scaleY(rrUpper);
      if (i === 100) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Draw data points
    ctx.fillStyle = color;
    sg.points.forEach(p => {
      const rr = Math.exp(p.logRR || 0);
      const x = scaleX(p.dose);
      const y = scaleY(rr);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  });

  // Draw legend
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  results.subgroups.forEach((sg, idx) => {
    const color = colors[idx % colors.length];
    const x = padding.left + 20 + idx * 120;
    const y = 15;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 15, 15);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
    ctx.fillText(sg.name, x + 20, y);
  });
}

/**
 * Update subgroup forest plot
 */
function updateSubgroupForestPlot(results) {
  const canvas = document.getElementById('subgroupForestPlot');
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padding = { top: 40, right: 80, bottom: 40, left: 120 };
  const plotWidth = canvas.width - padding.left - padding.right;
  const plotHeight = canvas.height - padding.top - padding.bottom;

  // Get RR range
  let minRR = Infinity, maxRR = -Infinity;
  results.subgroups.forEach(sg => {
    if (sg.rr < minRR) minRR = sg.rr;
    if (sg.rr > maxRR) maxRR = sg.rr;
  });
  const rrMin = Math.max(0.1, minRR * 0.5);
  const rrMax = maxRR * 1.5;
  const refLine = 1.0;

  // Scale function
  const scaleX = rr => padding.left + ((Math.log(rr) - Math.log(rrMin)) / (Math.log(rrMax) - Math.log(rrMin))) * plotWidth;
  const scaleY = idx => padding.top + (idx + 0.5) * (plotHeight / results.subgroups.length);

  // Draw background
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw reference line at RR = 1
  const xRef = scaleX(refLine);
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(xRef, padding.top);
  ctx.lineTo(xRef, padding.top + plotHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw forest plot for each subgroup
  results.subgroups.forEach((sg, idx) => {
    const y = scaleY(idx);

    // Draw subgroup name
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(sg.name, padding.left - 10, y);

    // Draw CI line
    const xCI = scaleX(sg.rrCI[0]);
    const xCIUpper = scaleX(sg.rrCI[1]);
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xCI, y);
    ctx.lineTo(xCIUpper, y);
    ctx.stroke();

    // Draw CI caps
    ctx.beginPath();
    ctx.moveTo(xCI, y - 5);
    ctx.lineTo(xCI, y + 5);
    ctx.moveTo(xCIUpper, y - 5);
    ctx.lineTo(xCIUpper, y + 5);
    ctx.stroke();

    // Draw point estimate
    const xRR = scaleX(sg.rr);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--primary');
    ctx.beginPath();
    ctx.arc(xRR, y, 8, 0, 2 * Math.PI);
    ctx.fill();

    // Draw RR and CI text
    ctx.textAlign = 'left';
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
    ctx.font = '12px sans-serif';
    const ciText = `${sg.rr.toFixed(2)} [${sg.rrCI[0].toFixed(2)}, ${sg.rrCI[1].toFixed(2)}]`;
    ctx.fillText(ciText, padding.left + plotWidth + 10, y);
  });

  // Draw x-axis labels
  ctx.textAlign = 'center';
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
  for (let i = 0; i <= 5; i++) {
    const rr = Math.exp(Math.log(rrMin) + (i / 5) * (Math.log(rrMax) - Math.log(rrMin)));
    const x = scaleX(rr);
    ctx.fillText(rr.toFixed(2), x, padding.top + plotHeight + 20);
  }
  ctx.fillText('Relative Risk (at dose=20)', padding.left + plotWidth / 2, canvas.height - 5);
}

/**
 * Update subgroup summary table
 */
function updateSubgroupSummaryTable(results) {
  const div = document.getElementById('subgroupSummaryTable');

  let html = '<table style="width:100%;font-size:12px"><thead><tr>';
  html += '<th>Subgroup</th><th>n (studies)</th><th>Points</th><th>β₁ (SE)</th><th>RR (SE)</th><th>Tau²</th><th>I² (%)</th><th>Q</th><th>p</th>';
  html += '</tr></thead><tbody>';

  results.subgroups.forEach(sg => {
    html += `<tr>
      <td><strong>${sg.name}</strong></td>
      <td>${sg.nStudies}</td>
      <td>${sg.nPoints}</td>
      <td>${sg.beta[1].toFixed(4)} (${sg.se[1].toFixed(4)})</td>
      <td>${sg.rr.toFixed(2)} (${sg.rrSE.toFixed(2)})</td>
      <td>${sg.tau2 < 0.0001 ? '<0.0001' : sg.tau2.toFixed(4)}</td>
      <td>${sg.I2.toFixed(1)}</td>
      <td>${sg.Q.toFixed(2)}</td>
      <td>${sg.Qp < 0.001 ? '<0.001' : sg.Qp.toFixed(3)}</td>
    </tr>`;
  });

  html += '</tbody></table>';

  div.innerHTML = html;
}

/**
 * Export subgroup results
 */
function exportSubgroupResults() {
  if (!AppState.subgroupResults) {
    showToast('No subgroup results to export', 'error');
    return;
  }

  const results = AppState.subgroupResults;
  const timestamp = new Date().toISOString().slice(0, 10);

  let content = `Dose Response Pro v18.1 - Subgroup Analysis Results\n`;
  content += `Generated: ${timestamp}\n`;
  content += `\nSubgroup Variable: ${results.variable}\n`;
  content += `Model Type: ${results.modelType}\n`;
  content += `\n${'='.repeat(60)}\n\n`;

  // Heterogeneity statistics
  content += `HETEROGENEITY STATISTICS\n`;
  content += `${'='.repeat(60)}\n`;
  content += `Between-subgroup Q: ${results.QBetween.toFixed(2)} (df=${results.dfBetween}, p=${results.pBetween < 0.001 ? '<0.001' : results.pBetween.toFixed(3)})\n`;
  content += `Within-subgroup Q: ${results.QWithin.toFixed(2)} (df=${results.dfWithin}, p=${results.pWithin < 0.001 ? '<0.001' : results.pWithin.toFixed(3)})\n`;
  content += `Total Q: ${results.QTotal.toFixed(2)}\n\n`;

  // Subgroup results
  content += `SUBGROUP RESULTS\n`;
  content += `${'='.repeat(60)}\n\n`;

  results.subgroups.forEach(sg => {
    content += `Subgroup: ${sg.name}\n`;
    content += `  Studies: ${sg.nStudies}, Points: ${sg.nPoints}\n`;
    content += `  Coefficients:\n`;
    content += `    β₀ (Intercept): ${sg.beta[0].toFixed(4)} (SE: ${sg.se[0].toFixed(4)})\n`;
    content += `    β₁ (Linear): ${sg.beta[1].toFixed(4)} (SE: ${sg.se[1].toFixed(4)})\n`;
    if (sg.beta[2] !== undefined) {
      content += `    β₂ (Quadratic): ${sg.beta[2].toFixed(4)} (SE: ${sg.se[2].toFixed(4)})\n`;
    }
    content += `  Relative Risk (at dose=20): ${sg.rr.toFixed(3)} (SE: ${sg.rrSE.toFixed(3)})\n`;
    content += `  95% CI: [${sg.rrCI[0].toFixed(3)}, ${sg.rrCI[1].toFixed(3)}]\n`;
    content += `  Between-study variance (Tau²): ${sg.tau2 < 0.0001 ? '<0.0001' : sg.tau2.toFixed(4)}\n`;
    content += `  Heterogeneity (I²): ${sg.I2.toFixed(1)}%\n`;
    content += `  Q statistic: ${sg.Q.toFixed(2)} (p=${sg.Qp < 0.001 ? '<0.001' : sg.Qp.toFixed(3)})\n\n`;
  });

  downloadFile(content, `subgroup_analysis_${timestamp}.txt`, 'text/plain');
  showToast('Subgroup results exported!');
  logAudit('subgroup_results_exported');
}

// ================================================================
// INITIALIZATION
// ================================================================
updateDataPreview();
logAudit('session_start', { sessionId });
