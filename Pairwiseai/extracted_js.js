
// Advanced Feature UI Wiring

function runMLOutlierDetection() {
  if (!AppState.results || !AppState.results.studies) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const studies = AppState.results.studies;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi || s.sei * s.sei);
  const names = studies.map(s => s.name);

  const results = mlOutlierDetection(yi, vi, names);
  renderOutlierDetection(results, 'outlierResults');
  showToast(`Found ${results.nOutliers} outlier(s)`, results.nOutliers > 0 ? 'warning' : 'success');
}

function initSensitivityControls() {
  if (!AppState.results) {
    showToast('Run analysis first', 'warning');
    return;
  }
  SensitivityEngine.init(AppState.results);
  renderSensitivityControls('sensitivityControls');
  showToast('Sensitivity controls initialized', 'success');
}

function addToLivingMA() {
  if (!AppState.results) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const change = LivingMA.addAnalysis(AppState.results, AppState.results.k);
  renderLivingMADashboard('livingMADashboard');
  showToast(change.meaningful ? 'Meaningful change detected!' : 'Analysis added to history',
            change.meaningful ? 'warning' : 'success');
}

function runIPDSimulation() {
  if (!AppState.results || !AppState.results.studies) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const studies = AppState.results.studies;
  const ipd = simulateIPD(studies);
  const analysis = analyzeIPD(ipd);

  AppState.simulatedIPD = ipd;

  document.getElementById('ipdResults').innerHTML = `
    <div style="background: var(--bg-secondary); padding: var(--space-3); border-radius: var(--radius-md);">
      <p><strong>Simulated ${ipd.length} patients</strong> from ${analysis.nStudies} studies</p>
      <p>One-stage effect: <strong>${analysis.oneStage.effect.toFixed(3)}</strong>
         (95% CI: ${analysis.oneStage.ci_lower.toFixed(3)} to ${analysis.oneStage.ci_upper.toFixed(3)})</p>
      <p style="color: var(--text-secondary); font-size: 0.85em;">
        Compare to aggregate: ${AppState.results.pooled.theta.toFixed(3)}
      </p>
    </div>
  `;
  showToast(`Simulated ${ipd.length} patients`, 'success');
}

function downloadIPD() {
  if (!AppState.simulatedIPD) {
    showToast('Run IPD simulation first', 'warning');
    return;
  }
  const csv = 'patientId,studyId,studyName,treatment,outcome\n' +
    AppState.simulatedIPD.map(p =>
      `${p.patientId},${p.studyId},${p.studyName},${p.treatment},${p.outcome.toFixed(4)}`
    ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'simulated_ipd.csv';
  a.click();
  showToast('IPD downloaded', 'success');
}

function runMultiverseAnalysis() {
  if (!AppState.results || !AppState.results.studies) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const studies = AppState.results.studies;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi || s.sei * s.sei);

  const results = multiverseMetaAnalysis(yi, vi);

  document.getElementById('multiverseResults').innerHTML = `
    <div style="background: var(--bg-secondary); padding: var(--space-3); border-radius: var(--radius-md);">
      <p><strong>${results.n_specifications} specifications tested</strong></p>
      <p>Effect range: <strong>${results.summary.min.toFixed(3)}</strong> to <strong>${results.summary.max.toFixed(3)}</strong></p>
      <p>Median: <strong>${results.summary.median.toFixed(3)}</strong></p>
      <p>Significant in: <strong>${(results.summary.significantProportion * 100).toFixed(0)}%</strong> of specifications</p>
      <p style="color: ${results.robust ? 'var(--color-success-500)' : 'var(--color-warning-500)'}; font-weight: bold;">
        ${results.interpretation}
      </p>
    </div>
  `;

  // Plot specification curve
  const traces = [{
    type: 'scatter',
    mode: 'markers',
    x: results.results.map((_, i) => i + 1),
    y: results.results.map(r => r.theta),
    marker: {
      color: results.results.map(r => r.significant ? '#22c55e' : '#ef4444'),
      size: 6
    },
    hovertemplate: '%{text}<extra></extra>',
    text: results.results.map(r => `${r.model} + ${r.tau2Method} + ${r.ciMethod}<br>θ=${r.theta.toFixed(3)}, p=${r.p.toFixed(4)}`)
  }];

  Plotly.newPlot('multiversePlot', traces, {
    title: 'Specification Curve',
    xaxis: { title: 'Specification #' },
    yaxis: { title: 'Effect Size' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    shapes: [{ type: 'line', x0: 0, x1: results.n_specifications + 1, y0: 0, y1: 0, line: { color: '#888', dash: 'dash' } }]
  }, { responsive: true });

  showToast('Multiverse analysis complete', 'success');
}

function runSimplifiedMA() {
  if (!AppState.results || !AppState.results.studies) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const studies = AppState.results.studies;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi || s.sei * s.sei);

  const results = robustBayesianMA(yi, vi);

  if (!results || !results.ok) {
    document.getElementById('modelavgResults').innerHTML = '<p class="text-warning">Model averaging failed. Try running analysis first.</p>';
    showToast('ModelAvg failed', 'warning');
    return;
  }
  document.getElementById('modelavgResults').innerHTML = `
    <div style="background: var(--bg-secondary); padding: var(--space-3); border-radius: var(--radius-md);">
      <p><strong>Model-Averaged Effect:</strong> ${results.theta.toFixed(3)} (95% CI: ${results.ciLower.toFixed(3)} to ${results.ciUpper.toFixed(3)})</p>
      <p><strong>P(Effect ≠ 0):</strong> ${(results.pEffect * 100).toFixed(1)}%</p>
      <p><strong>P(Publication Bias):</strong> ${(results.pBias * 100).toFixed(1)}%</p>
      <h5 style="margin-top: var(--space-2);">Model Weights:</h5>
      <ul style="font-size: 0.85em; margin: 0; padding-left: var(--space-4);">
        ${results.models.map(m => `<li>${m.name}: θ=${m.theta.toFixed(3)} (weight=${(m.weight*100).toFixed(0)}%)</li>`).join('')}
      </ul>
      <p style="color: ${results.pEffect > 0.9 ? 'var(--color-success-500)' : 'var(--color-warning-500)'}; font-weight: bold; margin-top: var(--space-2);">
        ${results.interpretation}
      </p>
    </div>
  `;
  showToast('ModelAvg complete', 'success');
}

function runFragilityAnalysis() {
  if (!AppState.results || !AppState.results.studies) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const studies = AppState.results.studies;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi || s.sei * s.sei);

  const results = fragilityIndexMA(yi, vi, AppState.results.pooled.theta);

  document.getElementById('fragilityResults').innerHTML = `
    <div style="background: var(--bg-secondary); padding: var(--space-3); border-radius: var(--radius-md);">
      <p><strong>Fragility Index:</strong> <span style="font-size: 1.5em; color: ${results.fragilityIndex <= 2 ? 'var(--color-danger-500)' : 'var(--color-success-500)'};">${results.fragilityIndex}</span></p>
      <p><strong>Fragility Quotient:</strong> ${(results.fragilityQuotient * 100).toFixed(1)}% (${results.fragilityIndex}/${AppState.results.k} studies)</p>
      <p style="font-weight: bold; color: ${results.robustness === 'High' ? 'var(--color-success-500)' : results.robustness === 'Moderate' ? 'var(--color-warning-500)' : 'var(--color-danger-500)'};">
        ${results.interpretation}
      </p>
    </div>
  `;
  showToast(`Fragility Index = ${results.fragilityIndex}`, results.fragilityIndex <= 2 ? 'warning' : 'success');
}

function runClinicalTranslation() {
  if (!AppState.results) {
    showToast('Run analysis first', 'warning');
    return;
  }
  const cer = parseFloat(document.getElementById('clinicalCER').value) || 0.20;
  const results = clinicalTranslation(AppState.results.pooled.theta, AppState.results.pooled.se, cer);

  document.getElementById('clinicalResults').innerHTML = `
    <div style="background: var(--bg-secondary); padding: var(--space-3); border-radius: var(--radius-md);">
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2);">
        <div><strong>SMD:</strong> ${results.smd.toFixed(3)} (${results.interpretation.magnitude})</div>
        <div><strong>Odds Ratio:</strong> ${results.oddsRatio.toFixed(2)}</div>
        <div><strong>Risk Ratio:</strong> ${results.riskRatio.toFixed(2)}</div>
        <div><strong>NNT:</strong> ${results.nnt === Infinity ? '∞' : results.nnt}</div>
        <div><strong>ARR:</strong> ${(results.absoluteRiskReduction * 100).toFixed(1)}%</div>
        <div><strong>Prob Superiority:</strong> ${(results.probSuperiority * 100).toFixed(1)}%</div>
        <div><strong>U3:</strong> ${(results.u3 * 100).toFixed(1)}%</div>
        <div><strong>Overlap:</strong> ${(results.overlap * 100).toFixed(1)}%</div>
      </div>
      <p style="margin-top: var(--space-2); font-weight: bold;">
        ${results.interpretation.clinical}
      </p>
      <p style="color: var(--text-secondary); font-size: 0.85em;">
        ${results.interpretation.superiority}
      </p>
    </div>
  `;
  showToast('Clinical translation complete', 'success');
}

function generateSearchStrategyUI() {
  const topic = document.getElementById('searchTopic').value || '';
  const studies = AppState.results?.studiesWithEffects || [];

  const strategy = generateSearchStrategy(studies, topic);
  renderSearchStrategy(strategy, 'searchStrategyPanel');
  showToast('Search strategy generated', 'success');
}

function runComprehensiveAnalysis() {
  if (!AppState.results) {
    showToast('Run basic analysis first', 'warning');
    return;
  }

  showToast('Running comprehensive analysis...', 'info');

  setTimeout(() => {
    try {
      // Run all analyses
      runSimplifiedMA();
      runMultiverseAnalysis();
      runFragilityAnalysis();
      runClinicalTranslation();
      runMLOutlierDetection();

      // Summary
      document.getElementById('comprehensiveResults').innerHTML = `
        <div style="background: linear-gradient(135deg, var(--color-success-500), var(--color-primary-500)); color: white; padding: var(--space-3); border-radius: var(--radius-md); text-align: center;">
          <h4 style="margin: 0;">✅ Complete Analysis Finished</h4>
          <p style="margin: var(--space-2) 0 0 0; opacity: 0.9;">All advanced methods executed. Review results above.</p>
        </div>
      `;

      showToast('Complete analysis finished!', 'success');
    } catch (e) {
      showToast('Error in comprehensive analysis: ' + e.message, 'error');
    }
  }, 100);
}
