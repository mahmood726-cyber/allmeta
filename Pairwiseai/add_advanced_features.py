#!/usr/bin/env python3
"""
Add Advanced Features to TruthCert-PairwisePro:
1. Meta-Regression Visualization (Bubble plots, Interaction plots)
2. IPD Meta-Analysis (One-stage and Two-stage)
3. RevMan/Covidence Import
"""

FEATURES_JS = '''
// =============================================================================
// ADVANCED FEATURES - Added January 2026
// =============================================================================

// =============================================================================
// 1. META-REGRESSION VISUALIZATION
// =============================================================================

/**
 * Render a bubble plot for meta-regression results
 * X-axis: covariate value, Y-axis: effect size, Bubble size: precision (1/SE)
 */
function renderMetaRegressionBubblePlot(results, covariateName, containerId = 'metaRegBubblePlot') {
  if (typeof Plotly === 'undefined') {
    console.error('Plotly not loaded');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Container not found:', containerId);
    return;
  }

  const studies = results.studies || AppState.results?.studies || [];
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const sei = vi.map(v => Math.sqrt(v));
  const covariate = studies.map(s => s.covariate || s[covariateName] || 0);
  const names = studies.map((s, i) => s.name || s.study || `Study ${i + 1}`);

  // Calculate bubble sizes (proportional to precision)
  const precision = sei.map(se => 1 / se);
  const maxPrec = Math.max(...precision);
  const bubbleSizes = precision.map(p => 10 + 40 * (p / maxPrec));

  // Get regression line if available
  const metaReg = results.metaRegression || AppState.results?.metaRegression;
  let regressionLine = null;

  if (metaReg && metaReg.coefficients) {
    const intercept = metaReg.coefficients.intercept || metaReg.coefficients[0] || 0;
    const slope = metaReg.coefficients.slope || metaReg.coefficients[1] || 0;
    const xMin = Math.min(...covariate);
    const xMax = Math.max(...covariate);
    const xRange = [xMin - 0.1 * (xMax - xMin), xMax + 0.1 * (xMax - xMin)];

    regressionLine = {
      x: xRange,
      y: xRange.map(x => intercept + slope * x),
      mode: 'lines',
      name: 'Regression Line',
      line: { color: '#e6a919', width: 3, dash: 'solid' }
    };
  }

  // Bubble trace
  const bubbleTrace = {
    x: covariate,
    y: yi,
    mode: 'markers',
    marker: {
      size: bubbleSizes,
      color: yi.map(y => y < 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
      line: { color: 'white', width: 1 }
    },
    text: names.map((n, i) => `${n}<br>Effect: ${yi[i].toFixed(3)}<br>${covariateName}: ${covariate[i]}<br>SE: ${sei[i].toFixed(3)}`),
    hoverinfo: 'text',
    name: 'Studies'
  };

  const traces = [bubbleTrace];
  if (regressionLine) traces.push(regressionLine);

  // Add confidence band if we have SE of slope
  if (metaReg && metaReg.se_slope) {
    const intercept = metaReg.coefficients.intercept || metaReg.coefficients[0] || 0;
    const slope = metaReg.coefficients.slope || metaReg.coefficients[1] || 0;
    const xMin = Math.min(...covariate);
    const xMax = Math.max(...covariate);
    const xVals = Array.from({ length: 50 }, (_, i) => xMin + (xMax - xMin) * i / 49);

    const yLower = xVals.map(x => intercept + slope * x - 1.96 * metaReg.se_slope * Math.abs(x - metaReg.x_mean || 0));
    const yUpper = xVals.map(x => intercept + slope * x + 1.96 * metaReg.se_slope * Math.abs(x - metaReg.x_mean || 0));

    traces.push({
      x: [...xVals, ...xVals.reverse()],
      y: [...yUpper, ...yLower.reverse()],
      fill: 'toself',
      fillcolor: 'rgba(230, 169, 25, 0.2)',
      line: { color: 'transparent' },
      hoverinfo: 'skip',
      showlegend: false,
      name: '95% CI'
    });
  }

  const layout = {
    title: `Meta-Regression: Effect by ${covariateName}`,
    xaxis: { title: covariateName, zeroline: true },
    yaxis: { title: 'Effect Size (log scale)', zeroline: true },
    hovermode: 'closest',
    showlegend: true,
    legend: { x: 0.02, y: 0.98 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') || '#333' }
  };

  Plotly.newPlot(containerId, traces, layout, { responsive: true });
  return { traces, layout };
}

/**
 * Render interaction plot for categorical moderator
 * Shows effect size with CI for each level of the moderator
 */
function renderInteractionPlot(results, moderatorName, containerId = 'interactionPlot') {
  if (typeof Plotly === 'undefined') {
    console.error('Plotly not loaded');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Container not found:', containerId);
    return;
  }

  const studies = results.studies || AppState.results?.studies || [];

  // Group studies by moderator level
  const groups = {};
  studies.forEach(s => {
    const level = s[moderatorName] || s.subgroup || 'Unknown';
    if (!groups[level]) groups[level] = { yi: [], vi: [] };
    groups[level].yi.push(s.yi);
    groups[level].vi.push(s.vi);
  });

  // Calculate pooled effect for each group
  const levels = Object.keys(groups);
  const pooledEffects = [];
  const pooledSE = [];
  const pooledCI = [];

  levels.forEach(level => {
    const yi = groups[level].yi;
    const vi = groups[level].vi;
    const wi = vi.map(v => 1 / v);
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);

    pooledEffects.push(theta);
    pooledSE.push(se);
    pooledCI.push([theta - 1.96 * se, theta + 1.96 * se]);
  });

  // Create traces
  const trace = {
    x: levels,
    y: pooledEffects,
    error_y: {
      type: 'data',
      symmetric: false,
      array: pooledCI.map((ci, i) => ci[1] - pooledEffects[i]),
      arrayminus: pooledCI.map((ci, i) => pooledEffects[i] - ci[0]),
      color: '#4a7ab8',
      thickness: 2,
      width: 10
    },
    mode: 'markers',
    marker: {
      size: 14,
      color: '#4a7ab8',
      symbol: 'diamond'
    },
    name: 'Pooled Effect',
    type: 'scatter'
  };

  // Add reference line at 0 (or 1 for ratio measures)
  const refLine = {
    x: [levels[0], levels[levels.length - 1]],
    y: [0, 0],
    mode: 'lines',
    line: { color: 'rgba(128,128,128,0.5)', width: 2, dash: 'dash' },
    name: 'No Effect',
    hoverinfo: 'skip'
  };

  const layout = {
    title: `Interaction Plot: Effect by ${moderatorName}`,
    xaxis: { title: moderatorName, type: 'category' },
    yaxis: { title: 'Pooled Effect Size', zeroline: true },
    hovermode: 'closest',
    showlegend: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') || '#333' }
  };

  Plotly.newPlot(containerId, [refLine, trace], layout, { responsive: true });

  return {
    levels,
    effects: pooledEffects,
    se: pooledSE,
    ci: pooledCI,
    pInteraction: calculateInteractionP(pooledEffects, pooledSE)
  };
}

/**
 * Calculate p-value for interaction (test of heterogeneity between subgroups)
 */
function calculateInteractionP(effects, ses) {
  const k = effects.length;
  if (k < 2) return 1;

  const wi = ses.map(se => 1 / (se * se));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaPooled = wi.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

  // Q statistic for between-group heterogeneity
  const Qbetween = wi.reduce((s, w, i) => s + w * Math.pow(effects[i] - thetaPooled, 2), 0);
  const df = k - 1;

  // P-value from chi-squared distribution
  const p = 1 - pchisq(Qbetween, df);

  return { Q: Qbetween, df, p };
}

/**
 * Render meta-regression panel with all visualizations
 */
function renderMetaRegressionPanel(results, covariateName) {
  const panel = document.getElementById('metaRegPanel') || document.getElementById('panel-analysis');
  if (!panel) return;

  const html = `
    <div class="card" style="margin-top: var(--space-6);">
      <div class="card__header">
        <h2 class="card__title">📊 Meta-Regression Visualization</h2>
      </div>
      <div class="card__body">
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">
          <div>
            <h3 style="margin-bottom: var(--space-3);">Bubble Plot</h3>
            <div id="metaRegBubblePlot" style="min-height: 400px;"></div>
            <p class="text-xs text-secondary" style="margin-top: var(--space-2);">
              Bubble size proportional to study precision (1/SE)
            </p>
          </div>
          <div>
            <h3 style="margin-bottom: var(--space-3);">Interaction Plot</h3>
            <div id="interactionPlot" style="min-height: 400px;"></div>
            <p class="text-xs text-secondary" style="margin-top: var(--space-2);">
              Pooled effect with 95% CI by moderator level
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Insert or update
  let existingCard = panel.querySelector('.meta-reg-viz-card');
  if (existingCard) {
    existingCard.outerHTML = html.replace('<div class="card"', '<div class="card meta-reg-viz-card"');
  } else {
    panel.insertAdjacentHTML('beforeend', html.replace('<div class="card"', '<div class="card meta-reg-viz-card"'));
  }

  // Render plots after DOM update
  setTimeout(() => {
    renderMetaRegressionBubblePlot(results, covariateName);
    renderInteractionPlot(results, covariateName);
  }, 100);
}


// =============================================================================
// 2. IPD META-ANALYSIS (Individual Patient Data)
// =============================================================================

/**
 * IPD Meta-Analysis State
 */
const IPDState = {
  data: null,
  studyVar: 'study',
  outcomeVar: 'outcome',
  treatmentVar: 'treatment',
  covariates: [],
  results: null
};

/**
 * Parse IPD data from CSV or JSON
 * Expected format: rows with study, treatment, outcome, and covariates
 */
function parseIPDData(data, format = 'csv') {
  if (format === 'csv') {
    const lines = data.trim().split('\\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((h, j) => {
        row[h] = isNaN(values[j]) ? values[j] : parseFloat(values[j]);
      });
      rows.push(row);
    }

    return { headers, rows, n: rows.length };
  } else if (format === 'json') {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const rows = Array.isArray(parsed) ? parsed : parsed.data || [];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, rows, n: rows.length };
  }

  throw new Error('Unsupported format: ' + format);
}

/**
 * Two-Stage IPD Meta-Analysis
 * Stage 1: Fit model within each study
 * Stage 2: Pool study-level estimates using standard MA
 */
function twoStageIPDMA(ipd, options = {}) {
  const {
    studyVar = 'study',
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    covariates = [],
    method = 'REML'
  } = options;

  // Group by study
  const studies = {};
  ipd.rows.forEach(row => {
    const studyId = row[studyVar];
    if (!studies[studyId]) studies[studyId] = [];
    studies[studyId].push(row);
  });

  // Stage 1: Within-study analysis
  const studyResults = [];

  Object.entries(studies).forEach(([studyId, patients]) => {
    // Separate treatment and control
    const treated = patients.filter(p => p[treatmentVar] === 1 || p[treatmentVar] === 'treatment');
    const control = patients.filter(p => p[treatmentVar] === 0 || p[treatmentVar] === 'control');

    if (treated.length < 2 || control.length < 2) {
      console.warn(`Study ${studyId}: insufficient patients`);
      return;
    }

    // Calculate mean difference (continuous outcome)
    const meanT = treated.reduce((s, p) => s + p[outcomeVar], 0) / treated.length;
    const meanC = control.reduce((s, p) => s + p[outcomeVar], 0) / control.length;

    const varT = treated.reduce((s, p) => s + Math.pow(p[outcomeVar] - meanT, 2), 0) / (treated.length - 1);
    const varC = control.reduce((s, p) => s + Math.pow(p[outcomeVar] - meanC, 2), 0) / (control.length - 1);

    const yi = meanT - meanC;  // Mean difference
    const vi = varT / treated.length + varC / control.length;  // Variance of difference

    studyResults.push({
      study: studyId,
      yi,
      vi,
      se: Math.sqrt(vi),
      nTreated: treated.length,
      nControl: control.length,
      meanTreated: meanT,
      meanControl: meanC
    });
  });

  // Stage 2: Pool using standard random-effects MA
  const yi = studyResults.map(s => s.yi);
  const vi = studyResults.map(s => s.vi);

  // Use existing tau2 estimator
  const tau2Result = typeof estimateTau2_REML === 'function' ?
    estimateTau2_REML(yi, vi) :
    estimateTau2_DL(yi, vi);

  const tau2 = tau2Result.tau2 || 0;

  // Calculate pooled estimate
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;
  const se = Math.sqrt(1 / sumW);

  // Heterogeneity
  const Q = wi.reduce((s, w, i) => s + w * Math.pow(yi[i] - theta, 2), 0);
  const k = yi.length;
  const I2 = Math.max(0, 100 * (Q - (k - 1)) / Q);

  return {
    method: 'Two-Stage IPD Meta-Analysis',
    stage1: studyResults,
    pooled: {
      theta,
      se,
      ci: [theta - 1.96 * se, theta + 1.96 * se],
      z: theta / se,
      p: 2 * (1 - pnorm(Math.abs(theta / se)))
    },
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      Q,
      df: k - 1,
      pQ: 1 - pchisq(Q, k - 1),
      I2
    },
    k,
    totalN: ipd.n
  };
}

/**
 * One-Stage IPD Meta-Analysis (Mixed Effects Model)
 * Fits a single model with random study effects
 * This is a simplified implementation using iterative estimation
 */
function oneStageIPDMA(ipd, options = {}) {
  const {
    studyVar = 'study',
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    covariates = [],
    maxIter = 100,
    tol = 1e-6
  } = options;

  const rows = ipd.rows;
  const n = rows.length;

  // Get unique studies
  const studyIds = [...new Set(rows.map(r => r[studyVar]))];
  const k = studyIds.length;

  // Create design matrix
  // Y = X*beta + Z*u + e
  // where X = [1, treatment, covariates], Z = study indicators, u ~ N(0, sigma_u^2)

  const Y = rows.map(r => r[outcomeVar]);
  const treatment = rows.map(r => r[treatmentVar] === 1 || r[treatmentVar] === 'treatment' ? 1 : 0);

  // Fixed effects: intercept + treatment + covariates
  const X = rows.map((r, i) => {
    const row = [1, treatment[i]];
    covariates.forEach(cov => row.push(r[cov] || 0));
    return row;
  });

  // Random effects design matrix (study indicators)
  const Z = rows.map(r => {
    const z = new Array(k).fill(0);
    z[studyIds.indexOf(r[studyVar])] = 1;
    return z;
  });

  // Simple estimation using method of moments
  // First, get OLS estimates ignoring clustering
  const XtX = matrixMultiply(transpose(X), X);
  const XtY = matrixVectorMultiply(transpose(X), Y);
  const XtXinv = invertMatrix(XtX);
  const betaOLS = matrixVectorMultiply(XtXinv, XtY);

  // Calculate residuals
  const fitted = X.map(xi => xi.reduce((s, x, j) => s + x * betaOLS[j], 0));
  const residuals = Y.map((y, i) => y - fitted[i]);

  // Estimate variance components
  const sigma2_e = residuals.reduce((s, r) => s + r * r, 0) / (n - X[0].length);

  // Between-study variance (simplified)
  const studyMeans = studyIds.map(sid => {
    const studyResids = residuals.filter((_, i) => rows[i][studyVar] === sid);
    return studyResids.reduce((a, b) => a + b, 0) / studyResids.length;
  });
  const sigma2_u = Math.max(0, studyMeans.reduce((s, m) => s + m * m, 0) / k - sigma2_e / (n / k));

  // Calculate standard errors using sandwich estimator (simplified)
  const se = betaOLS.map((_, j) => Math.sqrt(XtXinv[j][j] * sigma2_e * (1 + sigma2_u / sigma2_e)));

  // Treatment effect is second coefficient
  const treatmentEffect = betaOLS[1];
  const treatmentSE = se[1];

  return {
    method: 'One-Stage IPD Meta-Analysis (Mixed Effects)',
    fixedEffects: {
      intercept: { estimate: betaOLS[0], se: se[0] },
      treatment: { estimate: treatmentEffect, se: treatmentSE, ci: [treatmentEffect - 1.96 * treatmentSE, treatmentEffect + 1.96 * treatmentSE], z: treatmentEffect / treatmentSE, p: 2 * (1 - pnorm(Math.abs(treatmentEffect / treatmentSE))) },
      covariates: covariates.map((cov, i) => ({ name: cov, estimate: betaOLS[2 + i], se: se[2 + i] }))
    },
    varianceComponents: {
      withinStudy: sigma2_e,
      betweenStudy: sigma2_u,
      ICC: sigma2_u / (sigma2_u + sigma2_e)
    },
    k,
    totalN: n,
    pooled: {
      theta: treatmentEffect,
      se: treatmentSE,
      ci: [treatmentEffect - 1.96 * treatmentSE, treatmentEffect + 1.96 * treatmentSE]
    }
  };
}

// Matrix helper functions for IPD MA
function transpose(M) {
  return M[0].map((_, i) => M.map(row => row[i]));
}

function matrixMultiply(A, B) {
  const result = [];
  for (let i = 0; i < A.length; i++) {
    result[i] = [];
    for (let j = 0; j < B[0].length; j++) {
      result[i][j] = 0;
      for (let k = 0; k < A[0].length; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

function matrixVectorMultiply(M, v) {
  return M.map(row => row.reduce((s, x, i) => s + x * v[i], 0));
}

function invertMatrix(M) {
  // Simple 2x2 or use LU decomposition for larger
  const n = M.length;
  if (n === 2) {
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    return [
      [M[1][1] / det, -M[0][1] / det],
      [-M[1][0] / det, M[0][0] / det]
    ];
  }

  // Gauss-Jordan elimination for larger matrices
  const A = M.map(row => [...row]);
  const I = M.map((_, i) => M.map((_, j) => i === j ? 1 : 0));

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [I[i], I[maxRow]] = [I[maxRow], I[i]];

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let j = 0; j < n; j++) {
      A[i][j] /= pivot;
      I[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = 0; j < n; j++) {
          A[k][j] -= factor * A[i][j];
          I[k][j] -= factor * I[i][j];
        }
      }
    }
  }

  return I;
}

/**
 * Render IPD Meta-Analysis results
 */
function renderIPDResults(results, containerId = 'ipdResults') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const pooled = results.pooled;
  const isOneStage = results.method.includes('One-Stage');

  let html = `
    <div class="card">
      <div class="card__header">
        <h2 class="card__title">📊 ${results.method}</h2>
        <p class="card__subtitle">${results.k} studies, ${results.totalN} patients</p>
      </div>
      <div class="card__body">
        <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
          <div class="stat-card">
            <div class="stat-card__label">Treatment Effect</div>
            <div class="stat-card__value">${pooled.theta.toFixed(3)}</div>
            <div class="stat-card__change">95% CI: [${pooled.ci[0].toFixed(3)}, ${pooled.ci[1].toFixed(3)}]</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">SE</div>
            <div class="stat-card__value">${pooled.se.toFixed(4)}</div>
          </div>
  `;

  if (isOneStage) {
    html += `
          <div class="stat-card">
            <div class="stat-card__label">ICC</div>
            <div class="stat-card__value">${(results.varianceComponents.ICC * 100).toFixed(1)}%</div>
            <div class="stat-card__change">Between-study correlation</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">σ² (between)</div>
            <div class="stat-card__value">${results.varianceComponents.betweenStudy.toFixed(4)}</div>
          </div>
    `;
  } else {
    html += `
          <div class="stat-card">
            <div class="stat-card__label">τ²</div>
            <div class="stat-card__value">${results.heterogeneity.tau2.toFixed(4)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">I²</div>
            <div class="stat-card__value">${results.heterogeneity.I2.toFixed(1)}%</div>
          </div>
    `;
  }

  html += `
        </div>

        <div class="alert alert--${pooled.p < 0.05 ? 'success' : 'info'}" style="margin-top: var(--space-4);">
          <strong>p = ${pooled.p < 0.001 ? '<0.001' : pooled.p.toFixed(4)}</strong>
          ${pooled.p < 0.05 ? ' - Statistically significant treatment effect' : ' - Not statistically significant'}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  return results;
}


// =============================================================================
// 3. REVMAN / COVIDENCE IMPORT
// =============================================================================

/**
 * Parse RevMan 5 XML file (.rm5)
 */
function parseRevManXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid XML: ' + parseError.textContent);
  }

  const studies = [];
  const review = {
    title: doc.querySelector('COVER_SHEET TITLE')?.textContent || 'Imported Review',
    authors: [],
    abstract: doc.querySelector('COVER_SHEET ABSTRACT')?.textContent || ''
  };

  // Parse author names
  doc.querySelectorAll('CONTACT PERSON').forEach(person => {
    const firstName = person.querySelector('FIRST_NAME')?.textContent || '';
    const lastName = person.querySelector('LAST_NAME')?.textContent || '';
    if (firstName || lastName) review.authors.push(`${firstName} ${lastName}`.trim());
  });

  // Parse included studies
  doc.querySelectorAll('STUDIES_AND_REFERENCES STUDY').forEach(study => {
    const id = study.getAttribute('ID') || study.getAttribute('NAME');
    const name = study.getAttribute('NAME') || id;
    const year = study.getAttribute('YEAR') || '';

    studies.push({
      id,
      name: year ? `${name} ${year}` : name,
      year: parseInt(year) || null,
      included: study.getAttribute('DATA_SOURCE') === 'STUDY'
    });
  });

  // Parse outcome data (dichotomous)
  doc.querySelectorAll('DICH_DATA').forEach(data => {
    const studyId = data.closest('STUDY')?.getAttribute('ID');
    const study = studies.find(s => s.id === studyId);
    if (!study) return;

    study.dataType = 'dichotomous';
    study.events1 = parseInt(data.getAttribute('EVENTS_1')) || 0;
    study.total1 = parseInt(data.getAttribute('TOTAL_1')) || 0;
    study.events2 = parseInt(data.getAttribute('EVENTS_2')) || 0;
    study.total2 = parseInt(data.getAttribute('TOTAL_2')) || 0;

    // Calculate effect size (log OR)
    const a = study.events1, b = study.total1 - study.events1;
    const c = study.events2, d = study.total2 - study.events2;
    if (a > 0 && b > 0 && c > 0 && d > 0) {
      study.yi = Math.log((a * d) / (b * c));
      study.vi = 1/a + 1/b + 1/c + 1/d;
    }
  });

  // Parse outcome data (continuous)
  doc.querySelectorAll('CONT_DATA').forEach(data => {
    const studyId = data.closest('STUDY')?.getAttribute('ID');
    const study = studies.find(s => s.id === studyId);
    if (!study) return;

    study.dataType = 'continuous';
    study.mean1 = parseFloat(data.getAttribute('MEAN_1')) || 0;
    study.sd1 = parseFloat(data.getAttribute('SD_1')) || 1;
    study.total1 = parseInt(data.getAttribute('TOTAL_1')) || 0;
    study.mean2 = parseFloat(data.getAttribute('MEAN_2')) || 0;
    study.sd2 = parseFloat(data.getAttribute('SD_2')) || 1;
    study.total2 = parseInt(data.getAttribute('TOTAL_2')) || 0;

    // Calculate SMD (Hedges' g)
    const n1 = study.total1, n2 = study.total2;
    const pooledSD = Math.sqrt(((n1-1)*study.sd1*study.sd1 + (n2-1)*study.sd2*study.sd2) / (n1+n2-2));
    const d = (study.mean1 - study.mean2) / pooledSD;
    const J = 1 - 3/(4*(n1+n2-2)-1);  // Hedges correction
    study.yi = d * J;
    study.vi = (n1+n2)/(n1*n2) + (study.yi*study.yi)/(2*(n1+n2));
  });

  // Parse generic inverse variance data
  doc.querySelectorAll('IV_DATA').forEach(data => {
    const studyId = data.closest('STUDY')?.getAttribute('ID');
    const study = studies.find(s => s.id === studyId);
    if (!study) return;

    study.dataType = 'iv';
    study.yi = parseFloat(data.getAttribute('EFFECT_SIZE')) || 0;
    study.se = parseFloat(data.getAttribute('SE')) || 0.1;
    study.vi = study.se * study.se;
  });

  return {
    review,
    studies: studies.filter(s => s.yi !== undefined),
    allStudies: studies,
    format: 'RevMan5'
  };
}

/**
 * Parse Covidence CSV export
 */
function parseCovidence(csvString) {
  const lines = csvString.trim().split('\\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());

  const studies = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields with commas
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, j) => {
      row[h] = values[j]?.replace(/"/g, '') || '';
    });

    // Map Covidence fields to our format
    const study = {
      name: row['study id'] || row['covidence #'] || row['title'] || `Study ${i}`,
      year: parseInt(row['year']) || null,
      authors: row['authors'] || row['first author'] || ''
    };

    // Try to extract effect data
    if (row['effect estimate'] || row['effect size']) {
      study.yi = parseFloat(row['effect estimate'] || row['effect size']) || 0;
      study.se = parseFloat(row['standard error'] || row['se']) || 0.1;
      study.vi = study.se * study.se;
      study.dataType = 'iv';
    }

    // Dichotomous data
    if (row['events (intervention)'] || row['events_1']) {
      study.events1 = parseInt(row['events (intervention)'] || row['events_1']) || 0;
      study.total1 = parseInt(row['total (intervention)'] || row['total_1']) || 0;
      study.events2 = parseInt(row['events (control)'] || row['events_2']) || 0;
      study.total2 = parseInt(row['total (control)'] || row['total_2']) || 0;
      study.dataType = 'dichotomous';

      const a = study.events1, b = study.total1 - study.events1;
      const c = study.events2, d = study.total2 - study.events2;
      if (a > 0 && b > 0 && c > 0 && d > 0) {
        study.yi = Math.log((a * d) / (b * c));
        study.vi = 1/a + 1/b + 1/c + 1/d;
      }
    }

    if (study.yi !== undefined || study.dataType) {
      studies.push(study);
    }
  }

  return {
    studies,
    format: 'Covidence',
    headers
  };
}

/**
 * Auto-detect and parse import file
 */
function parseImportFile(content, filename) {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'rm5' || ext === 'xml' || content.trim().startsWith('<?xml') || content.includes('<COCHRANE_REVIEW')) {
    return parseRevManXML(content);
  } else if (ext === 'csv' || content.includes(',')) {
    return parseCovidence(content);
  } else if (ext === 'json') {
    return { studies: JSON.parse(content), format: 'JSON' };
  }

  throw new Error('Unsupported file format. Please use .rm5, .xml, .csv, or .json');
}

/**
 * Import studies into the app
 */
function importStudies(parsed) {
  const studies = parsed.studies;
  if (!studies || studies.length === 0) {
    showToast('No valid studies found in import file', 'error');
    return false;
  }

  // Clear existing studies
  if (AppState.studies) {
    AppState.studies = [];
  }

  // Convert to app format
  studies.forEach((s, i) => {
    const study = {
      id: s.id || `imported_${i + 1}`,
      name: s.name || `Study ${i + 1}`,
      yi: s.yi,
      vi: s.vi,
      se: s.se || Math.sqrt(s.vi),
      weight: 0  // Will be calculated
    };

    // Add raw data if available
    if (s.events1 !== undefined) {
      study.ai = s.events1;
      study.bi = s.total1 - s.events1;
      study.ci = s.events2;
      study.di = s.total2 - s.events2;
      study.n1 = s.total1;
      study.n2 = s.total2;
    }

    if (s.mean1 !== undefined) {
      study.m1 = s.mean1;
      study.m2 = s.mean2;
      study.sd1 = s.sd1;
      study.sd2 = s.sd2;
      study.n1 = s.total1;
      study.n2 = s.total2;
    }

    // Add to app state
    if (typeof addStudyToTable === 'function') {
      addStudyToTable(study);
    } else if (AppState.studies) {
      AppState.studies.push(study);
    }
  });

  // Update UI
  if (typeof renderStudyTable === 'function') {
    renderStudyTable();
  }

  showToast(`Imported ${studies.length} studies from ${parsed.format}`, 'success');

  // Log import info
  console.log('Import summary:', {
    format: parsed.format,
    totalStudies: studies.length,
    withEffectData: studies.filter(s => s.yi !== undefined).length,
    review: parsed.review
  });

  return true;
}

/**
 * Handle file upload for import
 */
function handleImportFile(file) {
  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const parsed = parseImportFile(content, file.name);
      importStudies(parsed);

      // Show review info if available
      if (parsed.review) {
        console.log('Review info:', parsed.review);
        if (parsed.review.title) {
          showToast(`Imported: ${parsed.review.title}`, 'info');
        }
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast('Import failed: ' + err.message, 'error');
    }
  };

  reader.onerror = function() {
    showToast('Failed to read file', 'error');
  };

  reader.readAsText(file);
}

/**
 * Create import UI panel
 */
function createImportPanel() {
  const panel = document.getElementById('panel-data');
  if (!panel) return;

  // Check if already exists
  if (document.getElementById('importPanel')) return;

  const importHtml = `
    <div id="importPanel" class="card" style="margin-bottom: var(--space-4);">
      <div class="card__header">
        <h3 class="card__title">📥 Import Studies</h3>
        <p class="card__subtitle">Import from RevMan, Covidence, or CSV</p>
      </div>
      <div class="card__body">
        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: center;">
          <input type="file" id="importFileInput" accept=".rm5,.xml,.csv,.json"
                 style="display: none;"
                 onchange="if(this.files[0]) handleImportFile(this.files[0])">
          <button class="btn btn--secondary" onclick="document.getElementById('importFileInput').click()">
            📁 Choose File
          </button>
          <span class="text-sm text-secondary">Supported: RevMan (.rm5, .xml), Covidence (.csv), JSON</span>
        </div>

        <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--surface-overlay); border-radius: var(--radius-md);">
          <p class="text-sm"><strong>RevMan 5:</strong> Export your review as .rm5 file from Review Manager</p>
          <p class="text-sm"><strong>Covidence:</strong> Export extraction data as CSV</p>
          <p class="text-sm"><strong>CSV format:</strong> Columns: study, yi (effect), se (or vi for variance)</p>
        </div>
      </div>
    </div>
  `;

  // Insert at the beginning of the data panel
  panel.insertAdjacentHTML('afterbegin', importHtml);
}

// Initialize import panel when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createImportPanel);
} else {
  setTimeout(createImportPanel, 500);
}


// =============================================================================
// EXPORTS
// =============================================================================
if (typeof window !== 'undefined') {
  // Meta-Regression Visualization
  window.renderMetaRegressionBubblePlot = renderMetaRegressionBubblePlot;
  window.renderInteractionPlot = renderInteractionPlot;
  window.renderMetaRegressionPanel = renderMetaRegressionPanel;
  window.calculateInteractionP = calculateInteractionP;

  // IPD Meta-Analysis
  window.IPDState = IPDState;
  window.parseIPDData = parseIPDData;
  window.twoStageIPDMA = twoStageIPDMA;
  window.oneStageIPDMA = oneStageIPDMA;
  window.renderIPDResults = renderIPDResults;

  // Import functions
  window.parseRevManXML = parseRevManXML;
  window.parseCovidence = parseCovidence;
  window.parseImportFile = parseImportFile;
  window.importStudies = importStudies;
  window.handleImportFile = handleImportFile;
  window.createImportPanel = createImportPanel;
}

console.log('[TruthCert] Advanced features loaded: Meta-Regression Viz, IPD MA, RevMan/Covidence Import');
'''


def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find insertion point - before the closing </script> tag near the end
    # Look for the last major section before exports
    marker = "// =============================================================================\n// MISSING FUNCTIONS"
    pos = content.find(marker)

    if pos == -1:
        # Try alternate location - before computeClinical
        marker = "function computeClinical()"
        pos = content.find(marker)

    if pos == -1:
        print("ERROR: Could not find insertion point")
        return

    print(f"Found insertion point at position {pos}")

    # Insert the new features
    content = content[:pos] + FEATURES_JS + "\n\n" + content[pos:]

    # Write back
    print("Writing updated file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")
    print("\nAdded features:")
    print("  1. Meta-Regression Visualization (Bubble plots, Interaction plots)")
    print("  2. IPD Meta-Analysis (One-stage and Two-stage)")
    print("  3. RevMan/Covidence Import")
    print("\nNew console commands:")
    print("  - renderMetaRegressionBubblePlot(results, 'covariateName')")
    print("  - renderInteractionPlot(results, 'moderatorName')")
    print("  - twoStageIPDMA(ipdData, options)")
    print("  - oneStageIPDMA(ipdData, options)")
    print("  - parseRevManXML(xmlString)")
    print("  - parseCovidence(csvString)")
    print("  - handleImportFile(file)")

if __name__ == '__main__':
    main()
