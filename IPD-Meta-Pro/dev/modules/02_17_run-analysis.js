function ipdNormalizeArmToken(value) {

 if (value == null) return '';

 if (typeof value === 'number' && Number.isFinite(value)) return String(value);

 if (typeof value === 'boolean') return value ? 'true' : 'false';

 return String(value).trim().toLowerCase();

}



function ipdResolveBinaryArmMapping(rows, treatmentVar) {

 const seen = new Map();

 rows.forEach(row => {

 const token = ipdNormalizeArmToken(row && row[treatmentVar]);

 if (!token) return;

 if (!seen.has(token)) {

 seen.set(token, row[treatmentVar]);

 }

 });

 const tokens = [...seen.keys()];

 if (tokens.length !== 2) {

 return {

 error: 'Binary analyses require exactly 2 treatment groups in `' + treatmentVar + '`, found ' + tokens.length + '.'

 };

 }

 const controlHints = new Set([

 '0', 'false', 'control', 'placebo', 'comparator', 'reference', 'standard care',

 'standard', 'usual care', 'uc', 'soc', 'sham', 'vehicle', 'none', 'no'

 ]);

 const treatmentHints = new Set([

 '1', 'true', 'treatment', 'intervention', 'active', 'experimental', 'exposed',

 'yes', 'drug', 'therapy'

 ]);

 const scores = tokens.map(token => ({

 token,

 raw: seen.get(token),

 control: controlHints.has(token) ? 2 : 0,

 treatment: treatmentHints.has(token) ? 2 : 0

 }));

 if (tokens.includes('0') && tokens.includes('1')) {

 scores.find(item => item.token === '0').control += 4;

 scores.find(item => item.token === '1').treatment += 4;

 }

 if (tokens.includes('false') && tokens.includes('true')) {

 scores.find(item => item.token === 'false').control += 4;

 scores.find(item => item.token === 'true').treatment += 4;

 }

 scores.forEach(item => {

 if (!Number.isNaN(Number(item.token))) {

 item.numeric = Number(item.token);

 }

 });

 const ranked = scores.slice().sort((a, b) => {

 const delta = (b.control - b.treatment) - (a.control - a.treatment);

 if (delta !== 0) return delta;

 if (Number.isFinite(a.numeric) && Number.isFinite(b.numeric)) return a.numeric - b.numeric;

 return a.token.localeCompare(b.token);

 });

 const control = ranked[0];

 const treatment = ranked[1];

 const ambiguous =

 ((control.control - control.treatment) === 0 && (treatment.treatment - treatment.control) === 0) &&

 !(tokens.includes('0') && tokens.includes('1')) &&

 !(tokens.includes('false') && tokens.includes('true'));

 if (ambiguous) {

 return {

 error: 'Treatment coding in `' + treatmentVar + '` is ambiguous (`' + tokens.join('`, `') + '`). Map arms to recognizable treatment/control labels before running analysis.'

 };

 }

 return {

 controlToken: control.token,

 controlValue: control.raw,

 controlLabel: String(control.raw),

 treatmentToken: treatment.token,

 treatmentValue: treatment.raw,

 treatmentLabel: String(treatment.raw)

 };

}



function ipdSplitBinaryArms(rows, treatmentVar, armMapping) {

 const treat1 = [];

 const treat0 = [];

 rows.forEach(row => {

 const token = ipdNormalizeArmToken(row && row[treatmentVar]);

 if (token === armMapping.treatmentToken) {

 treat1.push(row);

 } else if (token === armMapping.controlToken) {

 treat0.push(row);

 }

 });

 return { treat1, treat0 };

}



function runAnalysis() {

 // Prevent concurrent analysis requests

 if (APP.analysisRunning) {

 showNotification('Analysis already in progress, please wait...', 'info');

 return;

 }

 APP.analysisRunning = true;



 if (!APP.data || APP.data.length === 0) {

 APP.analysisRunning = false;

 showNotification('Please load data first', 'warning');

 return;

 }



 // Enable deterministic Math.random for reproducible results (seed = 42)

 if (typeof SeededRNG !== 'undefined') SeededRNG.patchMathRandom(42);

 const analysisDataFingerprint = computeCurrentDataFingerprint();



 // Automated form validation

 if (typeof FormValidator !== 'undefined') {

 const validation = FormValidator.validateAll();

 if (!validation.valid) {

 if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();

 APP.analysisRunning = false;

 FormValidator.showValidationSummary(validation);

 return;

 }

 }



 // Get study variable for validation

 const studyVarForValidation = APP.config.studyVar || document.getElementById('varStudy').value;



 // Edge case validation

 const studiesForValidation = [...new Set(APP.data.map(d => d[studyVarForValidation]))];

 const k = studiesForValidation.length;



 // Check minimum studies (k < 3 warning)

 if (k < 2) {

 if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();

 APP.analysisRunning = false;

 ErrorHandler.analysisError('At least 2 studies required for meta-analysis', { k });

 showNotification('Error: At least 2 studies required for meta-analysis', 'error');

 return;

 }



 if (k < 3) {

 const proceed = confirm(

 '⚠️ Warning: Only ' + k + ' studies detected.\n\n' +

 'Meta-analysis with k < 3 has important limitations:\n' +

 '• Heterogeneity estimates (I², τ²) are unreliable\n' +

 '• Confidence intervals may be too narrow\n' +

 '• Publication bias tests have very low power\n\n' +

 'Results should be interpreted with extreme caution.\n\n' +

 'Do you want to proceed anyway?'

 );

 if (!proceed) {

  if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();

  APP.analysisRunning = false;

  return;

 }

 }



 // Wrap analysis body in try/finally to ensure Math.random is restored even on exception

 try {



 // Save config values

 APP.config.studyVar = document.getElementById('varStudy').value;

 APP.config.treatmentVar = document.getElementById('varTreatment').value;

 APP.config.timeVar = document.getElementById('varTime').value;

 APP.config.eventVar = document.getElementById('varEvent').value;

 APP.config.outcomeType = document.getElementById('outcomeType').value;

 APP.config.analysisApproach = document.getElementById('analysisApproach').value;

 APP.config.effectMeasure = document.getElementById('effectMeasure').value;

 APP.config.reMethod = document.getElementById('reMethod').value;

 APP.config.confLevel = parseFloat(document.getElementById('confLevel').value) || 0.95;

 APP.config.useHKSJ = document.getElementById('useHKSJ').checked;



 // Validate confLevel is in valid range

 if (APP.config.confLevel <= 0 || APP.config.confLevel >= 1) {

 showNotification('Confidence level must be between 0 and 1 (e.g., 0.95)', 'warning');

 APP.config.confLevel = 0.95;

 }

 if (APP.config && APP.config.strictQCGateEnabled && typeof runStrictPreAnalysisQCGate === 'function') {
 const qcReport = runStrictPreAnalysisQCGate({ silent: true, mode: 'runAnalysis' });
 APP.lastStrictQCReport = qcReport;
 if (!qcReport.pass) {
 showNotification('Strict QC gate failed. Resolve blockers before running analysis.', 'error');
 if (typeof showStrictQCGateModal === 'function') showStrictQCGateModal(qcReport);
 return;
 }
 }

 if (APP.config && APP.config.sopLockEnabled && typeof window !== 'undefined' && window.SOPGovernance && typeof window.SOPGovernance.complianceCheck === 'function') {
 const sopReport = window.SOPGovernance.complianceCheck({ silent: true, mode: 'runAnalysis' });
 APP.lastSOPComplianceReport = sopReport;
 if (!sopReport.pass) {
 showNotification('SOP governance lock blocked this run. Resolve blockers or unlock protocol.', 'error');
 if (typeof window.SOPGovernance.showPanel === 'function') window.SOPGovernance.showPanel(sopReport);
 return;
 }
 }

  const armMapping = ipdResolveBinaryArmMapping(APP.data, APP.config.treatmentVar);

  if (armMapping.error) {

  showNotification(armMapping.error, 'warning');

  return;

  }



 const studies = [...new Set(APP.data.map(d => d[APP.config.studyVar]))];

 const studyResults = [];



 studies.forEach(studyId => {

 const studyData = APP.data.filter(d => d[APP.config.studyVar] === studyId);

 const armGroups = ipdSplitBinaryArms(studyData, APP.config.treatmentVar, armMapping);

 const treat1 = armGroups.treat1;

 const treat0 = armGroups.treat0;



 let effect, variance, se;



 if (APP.config.outcomeType === 'survival') {



 const times = studyData.map(d => d[APP.config.timeVar]);

 const events = studyData.map(d => d[APP.config.eventVar]);

 const treatment = studyData.map(d => [ipdNormalizeArmToken(d[APP.config.treatmentVar]) === armMapping.treatmentToken ? 1 : 0]);



 try {

 const cox = SurvivalAnalysis.coxPH(times, events, treatment);

 effect = cox.beta[0];

 se = cox.se[0];

 variance = se * se;

 } catch (e) {



 const lr = SurvivalAnalysis.logRankTest(

 treat1.map(d => d[APP.config.timeVar]),

 treat1.map(d => d[APP.config.eventVar]),

 treat0.map(d => d[APP.config.timeVar]),

 treat0.map(d => d[APP.config.eventVar])

 );

 effect = (lr.O1 - lr.E1) / lr.V;

 variance = 1 / lr.V;

 se = Math.sqrt(variance);

 }

 } else if (APP.config.outcomeType === 'binary') {

 const a = treat1.filter(d => d[APP.config.eventVar] === 1).length;

 const b = treat1.length - a;

 const c = treat0.filter(d => d[APP.config.eventVar] === 1).length;

 const d = treat0.length - c;



 effect = Math.log((a + 0.5) * (d + 0.5) / ((b + 0.5) * (c + 0.5)));

 variance = 1 / (a + 0.5) + 1 / (b + 0.5) + 1 / (c + 0.5) + 1 / (d + 0.5);

 se = Math.sqrt(variance);

 } else {



 const outcomes1 = treat1
 .map(d => (d[APP.config.eventVar] ?? d.outcome))
 .filter(v => v != null && Number.isFinite(v));

 const outcomes0 = treat0
 .map(d => (d[APP.config.eventVar] ?? d.outcome))
 .filter(v => v != null && Number.isFinite(v));

 if (outcomes1.length < 2 || outcomes0.length < 2) {
 // Preserve run continuity for sparse arm splits by giving near-zero weight.
 effect = 0;
 variance = 1e6;
 } else {
 const mean1 = Stats.mean(outcomes1);
 const mean0 = Stats.mean(outcomes0);
 const sd1 = Stats.sd(outcomes1, 1);
 const sd0 = Stats.sd(outcomes0, 1);
 effect = mean1 - mean0;
 variance = sd1 * sd1 / outcomes1.length + sd0 * sd0 / outcomes0.length;
 }

 se = Math.sqrt(variance);

 }



 const ci = MetaAnalysis.confidenceInterval(effect, se, APP.config.confLevel);

 const events = studyData.filter(d => d[APP.config.eventVar] === 1).length;



 studyResults.push({

 study: studyId,

 n: studyData.length,

 events: events,

 effect: effect,

 se: se,

 variance: variance,

 lower: ci.lower,

 upper: ci.upper,

 p: 2 * (1 - Stats.normalCDF(Math.abs(effect / se)))

 });

 });



 const effects = studyResults.map(s => s.effect);

 const variances = studyResults.map(s => s.variance);



 // Edge case: Check for separation (all effects in same direction)

 const validEffects = effects.filter(e => e != null && !isNaN(e) && isFinite(e));

 if (validEffects.length > 1) {

 const allPositive = validEffects.every(e => e >= 0);

 const allNegative = validEffects.every(e => e <= 0);

 if (allPositive || allNegative) {

 showNotification('⚠️ Separation detected: all effects are in the same direction. Heterogeneity estimates may be unreliable.', 'warning');

 ErrorHandler.dataError('Separation detected in effect sizes', { allPositive, allNegative, effects: validEffects });

 }

 }



 // Edge case: Check for extreme/invalid variances with explicit study reporting

 const invalidStudies = studyResults.filter(s => s.variance == null || isNaN(s.variance) || s.variance <= 0 || !isFinite(s.variance));

 if (invalidStudies.length > 0) {

 const studyNames = invalidStudies.map(s => s.study).slice(0, 5).join(', ') + (invalidStudies.length > 5 ? '...' : '');

 ErrorHandler.dataError('Studies with invalid variances', {

  count: invalidStudies.length,

  studies: invalidStudies.map(s => s.study),

  details: invalidStudies.map(s => ({ study: s.study, variance: s.variance, n: s.n }))

 });

 showNotification('⚠️ ' + invalidStudies.length + ' studies have invalid/zero variance (' + studyNames + ') and will use fallback estimation', 'warning');

 }



 let result;
 const selectedMethod = APP.config.reMethod || 'REML';

 if (selectedMethod === 'FE') {
 result = MetaAnalysis.fixedEffect(effects, variances);
 } else if (selectedMethod === 'DL') {
 result = MetaAnalysis.randomEffectsDL(effects, variances);
 } else if (selectedMethod === 'PM') {
 result = MetaAnalysis.randomEffectsPM(effects, variances);
 } else if (selectedMethod === 'SJ') {
 result = MetaAnalysis.randomEffectsSJ(effects, variances);
 } else if (selectedMethod === 'HE') {
 result = MetaAnalysis.randomEffectsHE(effects, variances);
 } else if (selectedMethod === 'ML') {
 result = MetaAnalysis.randomEffectsML(effects, variances);
 } else {
 result = MetaAnalysis.randomEffectsREML(effects, variances);
 }



 if (APP.config.useHKSJ) {

 result = MetaAnalysis.applyHKSJ(result, effects, variances);

 }



 const totalWeight = result.weights.reduce((a, b) => a + b, 0);

 if (totalWeight > 0) {

 studyResults.forEach((s, i) => {

  s.weight = result.weights[i] / totalWeight;

 });

 } else {

 // Assign equal weights if total is zero

 studyResults.forEach((s) => { s.weight = 1 / studyResults.length; });

 }



 APP.results = normalizeResultsSchema({

 studies: studyResults,

 pooled: result,

 pi: MetaAnalysis.predictionInterval(result, APP.config.confLevel)

 });
 APP.lastResults = APP.results;
 APP.analysisSettings = { ...APP.config };

 APP.lastAnalysisDataFingerprint = analysisDataFingerprint;
 APP.lastAnalysisAt = new Date().toISOString();



 updateResults();



 try {

 const treatments = [...new Set(APP.data.map(d => d.treatment_name || d[APP.config.treatmentVar]))];

 if (treatments.length > 2) {

 buildNetworkFromData();

 runNetworkMetaAnalysis();

 }

 } catch (e) { console.log('Network analysis skipped:', e); }



 document.querySelector('[data-panel="results"]').click();



 } finally {

 // Restore non-deterministic Math.random for UI/animation code (even on exception)

 if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();

 // Release analysis lock

 APP.analysisRunning = false;

 if (typeof refreshBeyondR40MethodStatesIfOpen === 'function') {

 setTimeout(refreshBeyondR40MethodStatesIfOpen, 50);

 }

 }

 }



// =============================================================================

// Q-PROFILE CONFIDENCE INTERVAL VISUALIZATION

// =============================================================================

function computeQProfile() {

 if (!APP.results || !APP.results.studies) {

 showNotification('Run analysis first', 'warning');

 return;

 }



 const studies = APP.results.studies;

 const k = studies.length;

 const effects = studies.map(s => s.effect);

 const variances = studies.map(s => s.variance);

 const alpha = 1 - (APP.config.confLevel || 0.95);



 // Q-profile method: find tau^2 values where Q(tau^2) equals chi-squared quantiles

 function computeQ(tau2) {

 const weights = variances.map(v => 1 / (v + tau2));

 const sumW = weights.reduce((a, b) => a + b, 0);

 const muHat = effects.reduce((s, e, i) => s + weights[i] * e, 0) / sumW;

 return weights.reduce((s, w, i) => s + w * Math.pow(effects[i] - muHat, 2), 0);

 }



 // Chi-squared quantiles

 const df = k - 1;

 const chiLower = MathUtils.chi2Quantile(1 - alpha/2, df);

 const chiUpper = MathUtils.chi2Quantile(alpha/2, df);



 // Find tau^2 bounds using bisection

 function findTau2(targetQ, lower = 0, upper = 10, tol = 1e-8, maxIter = 100) {

 for (let i = 0; i < maxIter; i++) {

 const mid = (lower + upper) / 2;

 const qMid = computeQ(mid);

 if (Math.abs(qMid - targetQ) < tol) return mid;

 if (qMid > targetQ) lower = mid;

 else upper = mid;

 }

 return (lower + upper) / 2;

 }



 // Compute CI for tau^2

 const tau2Lower = computeQ(0) > chiLower ? findTau2(chiLower) : 0;

 const tau2Upper = findTau2(chiUpper, 0, 100);

 const tau2Point = APP.results.pooled.tau2 ?? 0;



 // Compute I^2 from tau^2 (I^2 = tau^2 / (tau^2 + typical variance))

 const typicalVar = (k - 1) / (variances.reduce((a, b) => a + 1/b, 0) -

   Math.pow(variances.reduce((a, b) => a + 1/b, 0), 2) / variances.reduce((a, b) => a + 1/(b*b), 0));

 const i2Point = 100 * tau2Point / (tau2Point + typicalVar);

 const i2Lower = 100 * tau2Lower / (tau2Lower + typicalVar);

 const i2Upper = 100 * tau2Upper / (tau2Upper + typicalVar);



 // Generate profile likelihood curve data

 const tau2Range = [];

 const qValues = [];

 const nPoints = 100;

 const maxTau2 = Math.max(tau2Upper * 2, 0.5);



 for (let i = 0; i <= nPoints; i++) {

 const t2 = (i / nPoints) * maxTau2;

 tau2Range.push(t2);

 qValues.push(computeQ(t2));

 }



 // Display results

 const contentDiv = document.getElementById('qProfileContent');

 contentDiv.innerHTML = `

 <div class="grid grid-2" style="margin-bottom:1rem;">

 <div>

 <h4 style="margin-bottom:0.75rem;">τ² Confidence Interval (Q-Profile)</h4>

 <table class="results-table" style="font-size:0.85rem;">

   <tr><th>Parameter</th><th>Point Est.</th><th>${((1-alpha)*100).toFixed(0)}% CI</th></tr>

   <tr>

     <td>τ² (Between-study variance)</td>

     <td>${tau2Point.toFixed(4)}</td>

     <td>[${tau2Lower.toFixed(4)}, ${tau2Upper.toFixed(4)}]</td>

   </tr>

   <tr>

     <td>τ (Between-study SD)</td>

     <td>${Math.sqrt(tau2Point).toFixed(4)}</td>

     <td>[${Math.sqrt(tau2Lower).toFixed(4)}, ${Math.sqrt(tau2Upper).toFixed(4)}]</td>

   </tr>

   <tr>

     <td>I² (% variability due to heterogeneity)</td>

     <td>${Math.max(0, i2Point).toFixed(1)}%</td>

     <td>[${Math.max(0, i2Lower).toFixed(1)}%, ${Math.min(100, i2Upper).toFixed(1)}%]</td>

   </tr>

 </table>

 </div>

 <div>

 <h4 style="margin-bottom:0.75rem;">Q-Profile Plot</h4>

 <div class="plot-container" style="min-height:200px;">

   <canvas id="qProfilePlot" style="width:100%;height:180px;"></canvas>

 </div>

 </div>

 </div>

 <div class="alert alert-info" style="font-size:0.85rem;">

 <strong>Interpretation:</strong> The Q-profile method provides valid confidence intervals for τ²

 regardless of the number of studies. CI computed by inverting the Q-test at the ${((1-alpha)*100).toFixed(0)}% level.

 ${k < 5 ? '<br><strong>Note:</strong> With k=' + k + ' studies, CI may be wide and unstable.' : ''}

 </div>

 `;



 // Draw Q-profile plot

 setTimeout(() => {

 const canvas = document.getElementById('qProfilePlot');

 if (!canvas) return;

 const ctx = canvas.getContext('2d');

 const rect = canvas.getBoundingClientRect();

 canvas.width = rect.width * 2;

 canvas.height = rect.height * 2;

 ctx.scale(2, 2);



 const w = rect.width, h = rect.height;

 const margin = PlotDefaults.compact();

 const plotW = w - margin.left - margin.right;

 const plotH = h - margin.top - margin.bottom;



 // Background

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary') || '#1a1a25';

 ctx.fillRect(0, 0, w, h);



 // Scales

 const xScale = x => margin.left + (x / maxTau2) * plotW;

 const maxQ = Math.max(...qValues, chiLower) * 1.1;

 const yScale = y => margin.top + plotH - (y / maxQ) * plotH;



 // Grid lines

 ctx.strokeStyle = 'rgba(150,150,150,0.2)';

 ctx.lineWidth = 0.5;

 for (let i = 0; i <= 4; i++) {

 const y = margin.top + (i/4) * plotH;

 ctx.beginPath();

 ctx.moveTo(margin.left, y);

 ctx.lineTo(w - margin.right, y);

 ctx.stroke();

 }



 // Q-profile curve

 ctx.strokeStyle = '#6366f1';

 ctx.lineWidth = 2;

 ctx.beginPath();

 tau2Range.forEach((t2, i) => {

 const x = xScale(t2);

 const y = yScale(qValues[i]);

 if (i === 0) ctx.moveTo(x, y);

 else ctx.lineTo(x, y);

 });

 ctx.stroke();



 // Chi-squared threshold lines

 ctx.setLineDash([5, 5]);

 ctx.strokeStyle = '#ef4444';

 ctx.lineWidth = 1.5;

 ctx.beginPath();

 ctx.moveTo(margin.left, yScale(chiLower));

 ctx.lineTo(w - margin.right, yScale(chiLower));

 ctx.stroke();



 ctx.strokeStyle = '#10b981';

 ctx.beginPath();

 ctx.moveTo(margin.left, yScale(chiUpper));

 ctx.lineTo(w - margin.right, yScale(chiUpper));

 ctx.stroke();

 ctx.setLineDash([]);



 // CI bounds vertical lines

 ctx.strokeStyle = '#f59e0b';

 ctx.lineWidth = 1.5;

 ctx.setLineDash([3, 3]);

 [tau2Lower, tau2Upper].forEach(t2 => {

 if (t2 > 0 && t2 < maxTau2) {

   ctx.beginPath();

   ctx.moveTo(xScale(t2), margin.top);

   ctx.lineTo(xScale(t2), margin.top + plotH);

   ctx.stroke();

 }

 });



 // Point estimate

 ctx.setLineDash([]);

 ctx.fillStyle = '#6366f1';

 ctx.beginPath();

 ctx.arc(xScale(tau2Point), yScale(computeQ(tau2Point)), 5, 0, Math.PI * 2);

 ctx.fill();



 // Axes labels

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#a0a0b0';

 ctx.font = '11px system-ui';

 ctx.textAlign = 'center';

 ctx.fillText('τ²', w/2, h - 5);



 ctx.save();

 ctx.translate(12, h/2);

 ctx.rotate(-Math.PI/2);

 ctx.fillText('Q statistic', 0, 0);

 ctx.restore();



 // Legend

 ctx.font = '9px system-ui';

 ctx.fillStyle = '#ef4444';

 ctx.fillText('Upper χ²', w - margin.right - 30, margin.top + 10);

 ctx.fillStyle = '#10b981';

 ctx.fillText('Lower χ²', w - margin.right - 30, margin.top + 22);

 }, 100);



 showNotification('Q-Profile CI computed', 'success');

}



// =============================================================================
// ANALYSIS SUMMARY CARD — compact headline after each analysis run
// =============================================================================

function renderAnalysisSummaryCard(r) {
 if (!r || !r.pooled) return;
 const pooled = r.pooled;
 const isLogScale = APP.config.outcomeType === 'survival' ||
  (APP.config.outcomeType === 'binary' && APP.config.effectMeasure !== 'RD');

 const z = (typeof getConfZ === 'function') ? getConfZ() : 1.96;
 const confPct = Math.round((APP.config.confLevel || 0.95) * 100);

 const displayEffect = isLogScale ? Math.exp(pooled.pooled) : pooled.pooled;
 const displayLower = isLogScale ? Math.exp(pooled.pooled - z * pooled.se) : (pooled.pooled - z * pooled.se);
 const displayUpper = isLogScale ? Math.exp(pooled.pooled + z * pooled.se) : (pooled.pooled + z * pooled.se);

 const kStudies = r.studies ? r.studies.length : 0;
 const totalN = r.studies ? r.studies.reduce(function(sum, s) { return sum + (s.n || 0); }, 0) : 0;
 const tau2 = pooled.tau2;
 const I2 = pooled.I2;
 const pVal = APP.config.useHKSJ ? pooled.pHKSJ : pooled.p;
 const methodLabel = APP.config.reMethod || 'REML';
 const hksjLabel = APP.config.useHKSJ ? ' + HKSJ' : '';

 // Effect measure label
 var measureLabel = 'Effect';
 if (APP.config.outcomeType === 'survival') measureLabel = 'HR';
 else if (APP.config.outcomeType === 'binary') {
  if (APP.config.effectMeasure === 'OR') measureLabel = 'OR';
  else if (APP.config.effectMeasure === 'RR') measureLabel = 'RR';
  else if (APP.config.effectMeasure === 'RD') measureLabel = 'RD';
  else measureLabel = 'OR';
 } else measureLabel = 'MD';

 // Interpretation
 var interp = '';
 var interpColor = 'var(--text-secondary)';
 if (pVal < 0.05) {
  interpColor = 'var(--accent-success)';
  if (isLogScale) {
   if (displayEffect < 1) interp = 'Statistically significant reduction (favours treatment)';
   else interp = 'Statistically significant increase (favours control)';
  } else {
   if (displayEffect < 0) interp = 'Statistically significant reduction (favours treatment)';
   else interp = 'Statistically significant increase (favours treatment)';
  }
 } else {
  interpColor = 'var(--text-muted)';
  interp = 'No statistically significant difference (p = ' + pVal.toFixed(3) + ')';
 }

 // Heterogeneity descriptor
 var hetLabel = 'Low';
 var hetColor = 'var(--accent-success)';
 if (I2 >= 75) { hetLabel = 'High'; hetColor = 'var(--accent-danger)'; }
 else if (I2 >= 50) { hetLabel = 'Moderate'; hetColor = 'var(--accent-warning)'; }
 else if (I2 >= 25) { hetLabel = 'Low-Moderate'; hetColor = 'var(--accent-warning)'; }

 // Build card HTML
 var container = document.getElementById('analysisSummaryCard');
 if (!container) {
  container = document.createElement('div');
  container.id = 'analysisSummaryCard';
  // Insert before the stats-grid inside resultsContent
  var target = document.getElementById('resultsContent');
  if (target) {
   var firstChild = target.querySelector('.stats-grid');
   if (firstChild) {
    target.insertBefore(container, firstChild);
   } else {
    target.prepend(container);
   }
  }
 }

 container.innerHTML =
  '<div style="background:linear-gradient(135deg,rgba(99,102,241,0.08) 0%,rgba(139,92,246,0.08) 100%);border:1px solid var(--accent-primary);border-radius:12px;padding:1.25rem;margin-bottom:1rem;">' +
   '<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:0.75rem;margin-bottom:0.75rem;">' +
    '<span style="font-size:2rem;font-weight:700;color:var(--accent-primary);">' + displayEffect.toFixed(2) + '</span>' +
    '<span style="font-size:1rem;color:var(--text-secondary);">(' + confPct + '% CI: ' + displayLower.toFixed(2) + ' to ' + displayUpper.toFixed(2) + ')</span>' +
    '<span class="badge badge-info" style="font-size:0.7rem;">' + measureLabel + '</span>' +
   '</div>' +
   '<div style="font-size:0.85rem;color:' + interpColor + ';margin-bottom:0.75rem;font-weight:500;">' + interp + '</div>' +
   '<div style="display:flex;flex-wrap:wrap;gap:1rem;font-size:0.8rem;color:var(--text-secondary);">' +
    '<span title="Number of studies"><strong>k</strong> = ' + kStudies + '</span>' +
    '<span title="Total patients"><strong>N</strong> = ' + totalN.toLocaleString() + '</span>' +
    '<span title="Heterogeneity"><strong>I&sup2;</strong> = ' + I2.toFixed(1) + '% <span style="color:' + hetColor + ';">(' + hetLabel + ')</span></span>' +
    '<span title="Between-study variance"><strong>&tau;&sup2;</strong> = ' + (tau2 != null ? tau2.toFixed(4) : 'N/A') + '</span>' +
    '<span title="Estimation method"><strong>Method:</strong> ' + (typeof escapeHTML === 'function' ? escapeHTML(methodLabel) : methodLabel) + hksjLabel + '</span>' +
   '</div>' +
  '</div>';
}



function updateResults() {

 const r = APP.results;

 const pooled = r.pooled;



 const isLogScale = APP.config.outcomeType === 'survival' ||

 (APP.config.outcomeType === 'binary' && APP.config.effectMeasure !== 'RD');



 const displayEffect = isLogScale ? Math.exp(pooled.pooled) : pooled.pooled;

 const displayCI = isLogScale ?

 `${Math.exp(pooled.pooled - getConfZ() *pooled.se).toFixed(2)}-${Math.exp(pooled.pooled + getConfZ() *pooled.se).toFixed(2)}` :

 `${(pooled.pooled - getConfZ() *pooled.se).toFixed(2)}-${(pooled.pooled + getConfZ() *pooled.se).toFixed(2)}`;



 document.getElementById('pooledEffect').textContent = displayEffect.toFixed(2);

 document.getElementById('pooledCI').textContent = displayCI;

 document.getElementById('pooledP').textContent = (APP.config.useHKSJ ? pooled.pHKSJ : pooled.p).toFixed(4);

 document.getElementById('pooledI2').textContent = pooled.I2.toFixed(1) + '%';

 // Render analysis summary card
 renderAnalysisSummaryCard(r);

 const tbody = document.getElementById('studyResultsBody');

 tbody.innerHTML = r.studies.map(s => {

 const dispEffect = isLogScale ? Math.exp(s.effect) : s.effect;

 const dispLower = isLogScale ? Math.exp(s.lower) : s.lower;

 const dispUpper = isLogScale ? Math.exp(s.upper) : s.upper;

 const sigClass = s.p < 0.05 ? 'significant' : 'not-significant';



 return `<tr>

 <td>${escapeHTML(s.study)}</td>

 <td>${s.n}</td>

 <td>${s.events}</td>

 <td>${dispEffect.toFixed(2)}</td>

 <td>${dispLower.toFixed(2)} - ${dispUpper.toFixed(2)}</td>

 <td>${(s.weight * 100).toFixed(1)}%</td>

 <td class="${sigClass}">${s.p.toFixed(4)}</td>

 </tr>`;

 }).join('');



 const forestCanvas = document.getElementById('forestPlot');

 if (forestCanvas) {

 const forestStudies = r.studies.map(s => ({

 name: s.study,

 effect: isLogScale ? Math.exp(s.effect) : s.effect,

 lower: isLogScale ? Math.exp(s.lower) : s.lower,

 upper: isLogScale ? Math.exp(s.upper) : s.upper,

 weight: s.weight

 }));



 const forestPooled = {

 effect: displayEffect,

 lower: isLogScale ? Math.exp(pooled.pooled - getConfZ() *pooled.se) : pooled.pooled - getConfZ() *pooled.se,

 upper: isLogScale ? Math.exp(pooled.pooled + getConfZ() *pooled.se) : pooled.pooled + getConfZ() *pooled.se

 };



 setTimeout(() => {

 Plots.drawForest(forestCanvas, forestStudies, forestPooled, { nullValue: isLogScale ? 1 : 0 });

 }, 100);

 }



 const funnelCanvas = document.getElementById('funnelPlot');

 if (funnelCanvas) {

 const effects = r.studies.map(s => s.effect);

 const ses = r.studies.map(s => s.se);

 setTimeout(() => {

 Plots.drawFunnel(funnelCanvas, effects, ses, pooled.pooled, { showContour: true });

 }, 100);

 }



 if (APP.config.outcomeType === 'survival') {

 const survCanvas = document.getElementById('survivalPlot');

 if (survCanvas) {

 const armMapping = ipdResolveBinaryArmMapping(APP.data || [], APP.config.treatmentVar);

 if (armMapping.error) {

 showNotification(armMapping.error, 'warning');

 return;

 }

 const overallArms = ipdSplitBinaryArms(APP.data, APP.config.treatmentVar, armMapping);

 const treat1 = overallArms.treat1;

 const treat0 = overallArms.treat0;



 const km1 = SurvivalAnalysis.kaplanMeier(

 treat1.map(d => d[APP.config.timeVar]),

 treat1.map(d => d[APP.config.eventVar])

 );

 const km0 = SurvivalAnalysis.kaplanMeier(

 treat0.map(d => d[APP.config.timeVar]),

 treat0.map(d => d[APP.config.eventVar])

 );



 setTimeout(() => {

 Plots.drawSurvival(survCanvas, [

 { name: armMapping.treatmentLabel, data: km1 },

 { name: armMapping.controlLabel, data: km0 }

 ], { showCI: true });

 }, 100);

 }

 }



 document.getElementById('hetI2').textContent = pooled.I2.toFixed(1) + '%';

 document.getElementById('hetTau2').textContent = pooled.tau2.toFixed(4);

 document.getElementById('hetH2').textContent = pooled.H2.toFixed(2);

 document.getElementById('hetQ').textContent = `${pooled.Q.toFixed(2)} (p=${pooled.pQ.toFixed(3)})`;



 const egger = PublicationBias.eggerTest(r.studies.map(s => s.effect), r.studies.map(s => s.se));

 const begg = PublicationBias.beggTest(r.studies.map(s => s.effect), r.studies.map(s => s.variance));



 document.getElementById('eggerZ').textContent = egger.t.toFixed(2);

 document.getElementById('eggerP').textContent = egger.p.toFixed(3);

 document.getElementById('beggZ').textContent = begg.z.toFixed(2);

 document.getElementById('beggP').textContent = begg.p.toFixed(3);



 const tf = PublicationBias.trimAndFill(r.studies.map(s => s.effect), r.studies.map(s => s.variance));

 document.getElementById('imputedStudies').textContent = tf.k0;

 const adjEffect = isLogScale ? Math.exp(tf.adjusted.pooled) : tf.adjusted.pooled;

 const adjLower = isLogScale ? Math.exp(tf.adjusted.pooled - getConfZ() *tf.adjusted.se) : tf.adjusted.pooled - getConfZ() *tf.adjusted.se;

 const adjUpper = isLogScale ? Math.exp(tf.adjusted.pooled + getConfZ() *tf.adjusted.se) : tf.adjusted.pooled + getConfZ() *tf.adjusted.se;

 document.getElementById('adjustedEffect').textContent = `${adjEffect.toFixed(2)} (${adjLower.toFixed(2)}-${adjUpper.toFixed(2)})`;

 // Announce results to screen readers
 let announcer = document.getElementById('analysisAnnouncer');
 if (!announcer) {
  announcer = document.createElement('div');
  announcer.id = 'analysisAnnouncer';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  document.body.appendChild(announcer);
 }
 announcer.textContent = `Analysis complete: pooled effect ${displayEffect.toFixed(4)}, ${r.studies.length} studies, I-squared ${pooled.I2.toFixed(1)}%`;

 }



function runBayesian() {

 if (!APP.results) {

 alert('Please run frequentist analysis first');

 return;

 }



 const effects = APP.results.studies.map(s => s.effect);

 const variances = APP.results.studies.map(s => s.variance);



 const options = {

 iterations: parseInt(document.getElementById('mcmcIter').value) || 10000,

 burnin: parseInt(document.getElementById('mcmcBurnin').value) || 2000,

 chains: parseInt(document.getElementById('mcmcChains').value) || 4,

 priorMuMean: 0,

 priorMuSD: parseFloat(document.getElementById('priorSD').value) || 10,

 priorTauType: document.getElementById('priorTau').value,

 priorTauScale: 1

 };



 const btn = document.querySelector('[onclick="runBayesian()"]');

 btn.textContent = 'Running MCMC...';

 btn.disabled = true;



 setTimeout(() => {

 APP.bayesianResults = BayesianMCMC.runMCMC(effects, variances, options);



 const isLogScale = APP.config.outcomeType === 'survival' ||

 (APP.config.outcomeType === 'binary' && APP.config.effectMeasure !== 'RD');



 const displayMean = isLogScale ? Math.exp(APP.bayesianResults.mu.mean) : APP.bayesianResults.mu.mean;

 const displayMedian = isLogScale ? Math.exp(APP.bayesianResults.mu.median) : APP.bayesianResults.mu.median;

 const displayLower = isLogScale ? Math.exp(APP.bayesianResults.mu.lower) : APP.bayesianResults.mu.lower;

 const displayUpper = isLogScale ? Math.exp(APP.bayesianResults.mu.upper) : APP.bayesianResults.mu.upper;



 document.getElementById('bayesMean').textContent = displayMean.toFixed(2);

 document.getElementById('bayesMedian').textContent = displayMedian.toFixed(2);

 document.getElementById('bayesCrI').textContent = `${displayLower.toFixed(2)}-${displayUpper.toFixed(2)}`;

 document.getElementById('bayesProb').textContent = ((isLogScale ? APP.bayesianResults.probNegative : (1 - APP.bayesianResults.probNegative)) * 100).toFixed(1) + '%';

 document.getElementById('bayesRhat').textContent = APP.bayesianResults.rHat.toFixed(3);



 // Display new convergence diagnostics (ESS, Geweke, convergence status)

 document.getElementById('bayesESS').textContent = APP.bayesianResults.ess.toLocaleString();

 document.getElementById('bayesGeweke').textContent = APP.bayesianResults.geweke.meanZ.toFixed(2);



 const convergedStatus = APP.bayesianResults.converged;

 const convergedEl = document.getElementById('bayesConverged');

 convergedEl.textContent = convergedStatus ? 'PASS' : 'WARN';

 convergedEl.style.color = convergedStatus ? 'var(--accent-success)' : 'var(--accent-warning)';



 // Update convergence note with specific diagnostics

 const noteEl = document.getElementById('bayesConvergenceNote');

 const rhatOK = APP.bayesianResults.rHat < 1.1;

 const essOK = APP.bayesianResults.ess > 400;

 const gewekeOK = APP.bayesianResults.geweke.allPass;



 let noteClass = 'alert-success';

 let noteText = 'All convergence diagnostics passed. Posterior inference is reliable.';

 if (!convergedStatus) {

 noteClass = 'alert-warning';

 const issues = [];

 if (!rhatOK) issues.push('R-hat >= 1.1');

 if (!essOK) issues.push('ESS < 400');

 if (!gewekeOK) issues.push('Geweke |z| >= 2');

 noteText = 'Warning: ' + issues.join(', ') + '. Consider increasing iterations or burn-in.';

 }

 noteEl.className = 'alert ' + noteClass;

 noteEl.innerHTML = noteText;



 document.getElementById('bayesianResults').style.display = 'block';

 document.getElementById('bayesianPlots').style.display = 'grid';



 const traceCanvas = document.getElementById('tracePlot');

 const posteriorCanvas = document.getElementById('posteriorPlot');



 setTimeout(() => {

 Plots.drawTrace(traceCanvas, APP.bayesianResults.chains.map(c => c.muSamples));

 Plots.drawDensity(posteriorCanvas, APP.bayesianResults.chains.map(c => c.muSamples));

 }, 100);



 btn.textContent = 'Run MCMC';

 btn.disabled = false;

 }, 100);

 }



function runMetaRegression(moderatorArg) {

 if (!APP.results) {

 alert('Please run main analysis first');

 return;

 }



 let moderator = '';
 if (typeof moderatorArg === 'string' && moderatorArg.trim()) {
 moderator = moderatorArg.trim();
 } else {
 const selected = document.querySelectorAll('#moderatorVars .var-chip.selected');
 if (selected.length === 0) {
 alert('Please select at least one moderator variable');
 return;
 }
 moderator = String(selected[0].dataset.var || '').trim();
 }
 if (!moderator) {
 alert('Meta-regression moderator is missing');
 return;
 }



 const effects = APP.results.studies.map(s => s.effect);

 const variances = APP.results.studies.map(s => s.variance);



 const studies = APP.results.studies.map(s => s.study);

 const modValues = studies.map(studyId => {

 const studyData = APP.data.filter(d => d[APP.config.studyVar] === studyId);

 const values = studyData.map(d => Number(d[moderator])).filter(v => Number.isFinite(v));

 return values.length > 0 ? Stats.mean(values) : 0;

 });



 const weights = variances.map(v => 1 / v);

 const reg = Stats.linearRegression(modValues, effects, weights);



 const predicted = modValues.map(x => reg.intercept + reg.slope * x);

 const residuals = effects.map((e, i) => e - predicted[i]);

 const reResult = MetaAnalysis.randomEffectsDL(residuals, variances);



 const origResult = MetaAnalysis.randomEffectsDL(effects, variances);

 const denomTau2 = Number(origResult.tau2);
 const numerTau2 = Number(reResult.tau2);
 const R2 = (Number.isFinite(denomTau2) && denomTau2 > 1e-12 && Number.isFinite(numerTau2))
 ? Math.max(0, Math.min(100, 100 * (1 - numerTau2 / denomTau2)))
 : 0;



 document.getElementById('metaregR2').textContent = R2.toFixed(1) + '%';

 document.getElementById('metaregTau2').textContent = reResult.tau2.toFixed(4);



 const z = (Number.isFinite(Number(reg.seSlope)) && Math.abs(Number(reg.seSlope)) > 1e-12)
 ? (reg.slope / reg.seSlope)
 : NaN;

 const p = Number.isFinite(z) ? (2 * (1 - Stats.normalCDF(Math.abs(z)))) : 1;

 document.getElementById('metaregQM').textContent = `${(z * z).toFixed(2)} (p=${p.toFixed(3)})`;



 const coefBody = document.getElementById('metaregCoefBody');

 const safeModerator = escapeHTML(moderator);

 coefBody.innerHTML = `

 <tr>

 <td>Intercept</td>

 <td>${reg.intercept.toFixed(4)}</td>

 <td>${reg.seIntercept.toFixed(4)}</td>

 <td>${(reg.intercept - getConfZ() *reg.seIntercept).toFixed(4)} - ${(reg.intercept + getConfZ() *reg.seIntercept).toFixed(4)}</td>

 <td>${(reg.intercept / reg.seIntercept).toFixed(2)}</td>

 <td>${(2 * (1 - Stats.normalCDF(Math.abs(reg.intercept / reg.seIntercept)))).toFixed(4)}</td>

 </tr>

 <tr>

 <td>${safeModerator}</td>

 <td>${reg.slope.toFixed(4)}</td>

 <td>${reg.seSlope.toFixed(4)}</td>

 <td>${(reg.slope - getConfZ() *reg.seSlope).toFixed(4)} - ${(reg.slope + getConfZ() *reg.seSlope).toFixed(4)}</td>

 <td>${z.toFixed(2)}</td>

 <td class="${p < 0.05 ? 'significant' : ''}">${p.toFixed(4)}</td>

 </tr>

 `;



 document.getElementById('metaregResults').style.display = 'block';

 document.getElementById('metaregPlots').style.display = 'block';



 const bubbleCanvas = document.getElementById('bubblePlot');
 if (bubbleCanvas) {
 const ses = variances.map(v => Math.sqrt(Math.max(1e-12, Number(v) ?? 0)));
 const fallbackDraw = function() {
 const ctx = bubbleCanvas.getContext('2d');
 if (!ctx) return;
 const w = bubbleCanvas.width || 300;
 const h = bubbleCanvas.height || 150;
 const pad = 26;
 const xVals = modValues.map(v => Number(v)).filter(v => Number.isFinite(v));
 const yVals = effects.map(v => Number(v)).filter(v => Number.isFinite(v));
 if (!xVals.length || !yVals.length) return;
 let minX = Math.min(...xVals), maxX = Math.max(...xVals);
 let minY = Math.min(...yVals), maxY = Math.max(...yVals);
 if (Math.abs(maxX - minX) < 1e-9) { minX -= 0.5; maxX += 0.5; }
 if (Math.abs(maxY - minY) < 1e-9) { minY -= 0.5; maxY += 0.5; }
 const rx = maxX - minX;
 const ry = maxY - minY;
 ctx.clearRect(0, 0, w, h);
 ctx.fillStyle = '#ffffff';
 ctx.fillRect(0, 0, w, h);
 ctx.strokeStyle = '#cbd5e1';
 ctx.beginPath();
 ctx.moveTo(pad, h - pad);
 ctx.lineTo(w - pad, h - pad);
 ctx.moveTo(pad, pad);
 ctx.lineTo(pad, h - pad);
 ctx.stroke();
 const xMap = function(v) { return pad + ((v - minX) / rx) * (w - 2 * pad); };
 const yMap = function(v) { return h - pad - ((v - minY) / ry) * (h - 2 * pad); };
 ctx.strokeStyle = '#16a34a';
 ctx.lineWidth = 2;
 ctx.beginPath();
 const y1 = reg.intercept + reg.slope * minX;
 const y2 = reg.intercept + reg.slope * maxX;
 ctx.moveTo(xMap(minX), yMap(y1));
 ctx.lineTo(xMap(maxX), yMap(y2));
 ctx.stroke();
 for (let i = 0; i < modValues.length; i++) {
 const xi = Number(modValues[i]), yi = Number(effects[i]);
 if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
 const sei = Math.max(1e-4, Number(ses[i]) || 1);
 const r = Math.max(3, Math.min(12, 4 / sei));
 ctx.globalAlpha = 0.7;
 ctx.fillStyle = '#2563eb';
 ctx.beginPath();
 ctx.arc(xMap(xi), yMap(yi), r, 0, Math.PI * 2);
 ctx.fill();
 ctx.globalAlpha = 1;
 }
 };
 try {
 if (typeof drawBubblePlot === 'function') drawBubblePlot(bubbleCanvas, modValues, effects, ses, reg.slope, reg.intercept, moderator);
 else fallbackDraw();
 } catch (e) {
 fallbackDraw();
 console.warn('Bubble plot rendering failed, used fallback:', e);
 }
 }

 }



 document.querySelectorAll('.var-chip').forEach(chip => {

 chip.addEventListener('click', () => {

 chip.classList.toggle('selected');

 });

 });



 function showHelp() {

 document.getElementById('helpModal').classList.add('active');

 }



function closeHelp() {

 document.getElementById('helpModal').classList.remove('active');

 }



function exportAnalysis() {

 if (!APP.results) {

 showNotification('Please run analysis first', 'error');

 return;

 }



 const modal = document.createElement('div');

 modal.className = 'modal-overlay active';

 modal.innerHTML = `

 <div class="modal">

 <div class="modal-header">

 <div class="modal-title">Export Analysis</div>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div style="display:grid;gap:1rem;">

 <button class="btn btn-primary" onclick="exportHTML();this.closest('.modal-overlay').remove()">

 Export as HTML Report

 </button>

 <button class="btn btn-secondary" onclick="exportPDF();this.closest('.modal-overlay').remove()">

 Export as PDF

 </button>

 <button class="btn btn-secondary" onclick="exportResults('csv');this.closest('.modal-overlay').remove()">

 Export Results as CSV

 </button>

 <button class="btn btn-secondary" onclick="exportRCode();this.closest('.modal-overlay').remove()">

 Generate R Code

 </button>

 <button class="btn btn-secondary" onclick="exportStataCode();this.closest('.modal-overlay').remove()">

 Generate Stata Code

 </button>

 <button class="btn btn-secondary" onclick="exportComprehensiveReportingBundle();this.closest('.modal-overlay').remove()">

 Export Complete Reporting Bundle

 </button>

 </div>

 </div>

 `;

 document.body.appendChild(modal);

 }



function exportHTML() {

 const report = generateReport();

 const blob = new Blob([report], { type: 'text/html' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = 'ipd_meta_analysis_report.html';

 a.click();

 showNotification('HTML report exported', 'success');

 }



function exportPDF() {

 if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {

 showNotification('PDF library not loaded. Exporting as HTML instead.', 'warning');

 exportHTML();

 return;

 }



 const { jsPDF } = window.jspdf;

 const doc = new jsPDF();

 const r = APP.results || {};

 const pooled = r.pooled || {};

 const studies = Array.isArray(r.studies) ? r.studies : [];

 const cfg = APP.config || {};

 const isLogScale = cfg.outcomeType === 'survival' || (cfg.outcomeType === 'binary' && cfg.effectMeasure !== 'RD');

 const bundle = buildComprehensiveReportingBundle();

 const snapshot = bundle && bundle.reportingSnapshot ? bundle.reportingSnapshot : buildReportingCompletenessSnapshot();

 const strictQC = snapshot.strictQC || {};

 const sop = snapshot.sopCompliance || {};

 const ext = snapshot.externalRevalidation || null;

 const extAvail = ext && ext.benchmarkAvailability ? ext.benchmarkAvailability : {};

 const iv = snapshot.independentVerification || null;

 const ivSignoff = iv && iv.independentSignoff ? iv.independentSignoff : { requiredSignoffs: 0, signoffs: [] };

 const signoffs = Array.isArray(ivSignoff.signoffs) ? ivSignoff.signoffs : [];

 const requiredSignoffs = Number(ivSignoff.requiredSignoffs ?? 0);

 const forecast = snapshot.adoptionForecast12 || null;

 const prisma = snapshot.prismaChecklist || {};

 const prismaItems = Array.isArray(prisma.items) ? prisma.items : [];

 const prismaReported = Number.isFinite(Number(prisma.reportedCount))
 ? Number(prisma.reportedCount)
 : prismaItems.filter(function(item) { return !!item.reported; }).length;

 const prismaTotal = Number.isFinite(Number(prisma.totalItems))
 ? Number(prisma.totalItems)
 : prismaItems.length;

 const pageWidth = doc.internal.pageSize.getWidth();

 const pageHeight = doc.internal.pageSize.getHeight();

 const left = 14;

 const right = pageWidth - 14;

 const contentWidth = right - left;

 let y = 18;

 const ensureSpace = function(space) {
 if ((y + space) > (pageHeight - 14)) {
 doc.addPage();
 y = 18;
 }
 };

 const writeWrapped = function(text, options) {
 const opts = options || {};
 const indent = Number(opts.indent || 0);
 const fontSize = Number(opts.fontSize || 10);
 const color = opts.color || [0, 0, 0];
 const maxWidth = Number(opts.maxWidth || (contentWidth - indent));
 const lineGap = Number(opts.lineGap || 5);
 const weight = opts.bold ? 'bold' : 'normal';
 const lines = doc.splitTextToSize(String(text == null ? '' : text), maxWidth);
 doc.setFontSize(fontSize);
 doc.setTextColor(color[0], color[1], color[2]);
 doc.setFont(undefined, weight);
 ensureSpace(lines.length * lineGap + 1);
 doc.text(lines, left + indent, y);
 y += lines.length * lineGap;
 doc.setFont(undefined, 'normal');
 };

 const writeSection = function(title) {
 ensureSpace(12);
 y += 2;
 writeWrapped(title, { fontSize: 13, bold: true, color: [31, 41, 55], lineGap: 6 });
 doc.setDrawColor(229, 231, 235);
 doc.line(left, y - 1.5, right, y - 1.5);
 y += 2;
 };

 const fmtNum = function(v, d) {
 const n = Number(v);
 return Number.isFinite(n) ? n.toFixed(Number.isFinite(Number(d)) ? Number(d) : 3) : 'NA';
 };

 const statusText = function(ok) {
 return ok ? 'PASS' : 'PENDING';
 };

 doc.setFontSize(20);
 doc.setTextColor(79, 70, 229);
 doc.setFont(undefined, 'bold');
 doc.text('IPD Meta-Analysis Report', left, y);
 doc.setFont(undefined, 'normal');
 y += 8;
 writeWrapped('Generated: ' + new Date().toLocaleString(), { fontSize: 9, color: [107, 114, 128], lineGap: 4 });
 y += 1;

 writeSection('Summary');
 const displayEffect = Number.isFinite(Number(pooled.pooled))
 ? (isLogScale ? Math.exp(Number(pooled.pooled)) : Number(pooled.pooled))
 : null;
 writeWrapped('Studies: ' + studies.length, { fontSize: 10, lineGap: 5 });
 writeWrapped('Patients: ' + (Array.isArray(APP.data) ? APP.data.length : 0), { fontSize: 10, lineGap: 5 });
 writeWrapped('Pooled ' + String(cfg.effectMeasure || 'effect') + ': ' + (displayEffect === null ? 'NA' : displayEffect.toFixed(3)), { fontSize: 10, lineGap: 5 });
 writeWrapped('I-squared: ' + fmtNum(pooled.I2, 1) + '%', { fontSize: 10, lineGap: 5 });
 writeWrapped('Tau-squared: ' + fmtNum(pooled.tau2, 4), { fontSize: 10, lineGap: 5 });

 writeSection('Study Results');
 writeWrapped('Study | N | Effect [95% CI] | Weight', { fontSize: 9, bold: true, lineGap: 5 });
 studies.forEach(function(s) {
 const effect = Number(s && s.effect);
 const lower = Number(s && s.lower);
 const upper = Number(s && s.upper);
 const weight = Number(s && s.weight);
 const dispEff = Number.isFinite(effect) ? (isLogScale ? Math.exp(effect) : effect) : null;
 const dispLower = Number.isFinite(lower) ? (isLogScale ? Math.exp(lower) : lower) : null;
 const dispUpper = Number.isFinite(upper) ? (isLogScale ? Math.exp(upper) : upper) : null;
 const row = String((s && s.study) || 'NA').slice(0, 22) +
 ' | ' + (Number.isFinite(Number(s && s.n)) ? Number(s.n) : 'NA') +
 ' | ' + (dispEff === null ? 'NA' : dispEff.toFixed(2)) + ' [' + (dispLower === null ? 'NA' : dispLower.toFixed(2)) + ', ' + (dispUpper === null ? 'NA' : dispUpper.toFixed(2)) + ']' +
 ' | ' + (Number.isFinite(weight) ? ((weight * 100).toFixed(1) + '%') : 'NA');
 writeWrapped(row, { fontSize: 8, lineGap: 4.5 });
 });

 writeSection('Reporting Completeness and Governance');
 const completenessRows = [
 { label: 'Data loaded', ok: snapshot.hasData, detail: (snapshot.rows || 0) + ' rows' },
 { label: 'Pooled analysis result', ok: snapshot.hasResults, detail: studies.length + ' studies analyzed' },
 { label: 'Strict QC gate', ok: !!strictQC.pass, detail: 'Score ' + Number(strictQC.qualityScore || 0).toFixed(0) + '%' },
 { label: 'SOP governance compliance', ok: !!sop.pass, detail: sop ? ('Score ' + Number(sop.score || 0).toFixed(0) + '%') : 'Not evaluated' },
 { label: 'External revalidation bundle', ok: !!ext, detail: ext ? 'Ready' : 'Not built' },
 { label: 'Independent verification bundle', ok: !!iv, detail: iv ? 'Ready' : 'Not built' },
 { label: 'Independent signoffs', ok: requiredSignoffs > 0 ? (signoffs.length >= requiredSignoffs) : signoffs.length > 0, detail: signoffs.length + '/' + requiredSignoffs },
 { label: 'Publication package v1', ok: !!snapshot.publicationPackageV1, detail: snapshot.publicationPackageV1 ? 'Ready' : 'Not built' },
 { label: 'Publication package v2', ok: !!snapshot.publicationPackageV2, detail: snapshot.publicationPackageV2 ? 'Ready' : 'Not built' },
 { label: 'PRISMA-IPD checklist', ok: prismaTotal > 0 && prismaReported === prismaTotal, detail: prismaReported + '/' + prismaTotal + ' reported' },
 { label: 'Automation API', ok: !!snapshot.automationAvailable, detail: snapshot.automationAvailable ? 'Available' : 'Unavailable' },
 { label: 'Adoption forecast (12 personas)', ok: !!forecast, detail: forecast ? ((forecast.adoptCount || 0) + '/12 adopted') : 'Not built' }
 ];
 completenessRows.forEach(function(row) {
 writeWrapped('- ' + row.label + ': ' + statusText(row.ok) + ' (' + row.detail + ')', { fontSize: 9, lineGap: 4.8 });
 });

 writeSection('Benchmark Artifact Availability');
 writeWrapped('- Parity artifact: ' + statusText(!!extAvail.parity), { fontSize: 9, lineGap: 4.8 });
 writeWrapped('- Frontier artifact: ' + statusText(!!extAvail.frontier), { fontSize: 9, lineGap: 4.8 });
 writeWrapped('- Simulation artifact: ' + statusText(!!extAvail.simulation), { fontSize: 9, lineGap: 4.8 });
 writeWrapped('- Replication artifact: ' + statusText(!!extAvail.replication), { fontSize: 9, lineGap: 4.8 });

 writeSection('Independent Signoff Ledger');
 if (!signoffs.length) {
 writeWrapped('No independent signoffs recorded.', { fontSize: 9, lineGap: 4.8 });
 } else {
 signoffs.forEach(function(s, idx) {
 const hash = s && s.signoffHash ? String(s.signoffHash) : '';
 const shortHash = hash ? (hash.slice(0, 14) + '...' + hash.slice(-8)) : 'NA';
 const line = '#' + Number((s && s.sequence) || (idx + 1)) +
 ' | ' + String((s && s.reviewer) || 'NA') +
 ' | ' + String((s && s.reviewerEmail) || 'NA') +
 ' | ' + String((s && s.reviewerOrganization) || 'NA').slice(0, 22) +
 ' | ' + String((s && s.decision) || 'agree') +
 ' | ' + String((s && s.date) || 'NA') +
 ' | ' + shortHash;
 writeWrapped(line, { fontSize: 8, lineGap: 4.4 });
 });
 }

 writeSection('PRISMA-IPD Coverage');
 writeWrapped('Reported items: ' + prismaReported + '/' + prismaTotal + ' (' + (prismaTotal > 0 ? ((prismaReported / prismaTotal) * 100).toFixed(1) : '0.0') + '%)', { fontSize: 9, lineGap: 4.8 });
 const missingPrisma = prismaItems.filter(function(item) { return !item.reported; }).slice(0, 8);
 if (missingPrisma.length) {
 writeWrapped('Top missing items:', { fontSize: 9, bold: true, lineGap: 4.8 });
 missingPrisma.forEach(function(item, idx) {
 const id = item.item || item.num || String(idx + 1);
 const desc = String(item.description || item.item || 'NA');
 writeWrapped('- ' + id + ': ' + desc.slice(0, 70), { fontSize: 8.5, lineGap: 4.5, indent: 2 });
 });
 } else {
 writeWrapped('All available checklist items are marked reported.', { fontSize: 9, lineGap: 4.8 });
 }

 writeSection('Reproducibility Hashes');
 writeWrapped('Data hash: ' + String(((snapshot.hashes || {}).dataHash) || 'NA'), { fontSize: 8.5, lineGap: 4.4 });
 writeWrapped('Configuration hash: ' + String(((snapshot.hashes || {}).configHash) || 'NA'), { fontSize: 8.5, lineGap: 4.4 });
 writeWrapped('Results hash: ' + String(((snapshot.hashes || {}).resultsHash) || 'NA'), { fontSize: 8.5, lineGap: 4.4 });

 if ((snapshot.errors || []).length) {
 writeSection('Runtime Warnings');
 snapshot.errors.forEach(function(err) {
 writeWrapped('- ' + String(err), { fontSize: 8.5, lineGap: 4.5 });
 });
 }

 ensureSpace(10);
 y += 2;
 writeWrapped('Generated by IPD Meta-Analysis Pro', { fontSize: 9, color: [107, 114, 128], lineGap: 4.8 });



 doc.save('ipd_meta_analysis.pdf');

 showNotification('PDF exported', 'success');

 }



function exportRCode() {

 const r = APP.results;

 const code = `# IPD Meta-Analysis R Code

# Generated by IPD Meta-Analysis Pro



library(meta)

library(metafor)

library(survival)



# Study-level data

study_data <- data.frame(

 study = c(${r.studies.map(s => `"${s.study}"`).join(', ')}),

 n = c(${r.studies.map(s => s.n).join(', ')}),

 effect = c(${r.studies.map(s => s.effect.toFixed(4)).join(', ')}),

 se = c(${r.studies.map(s => s.se.toFixed(4)).join(', ')})

)



# Random-effects meta-analysis

res <- rma(yi = effect, sei = se, data = study_data, method = "${APP.config.reMethod}")

summary(res)



# Forest plot

forest(res, slab = study_data$study)



# Funnel plot

funnel(res)



# Publication bias tests

regtest(res) # Egger\'s test



# Heterogeneity

cat("I-squared:", res$I2, "%\\n")

cat("Tau-squared:", res$tau2, "\\n")

`;

 const blob = new Blob([code], { type: 'text/plain' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = 'ipd_meta_analysis.R';

 a.click();

 showNotification('R code exported', 'success');

 }



function exportStataCode() {

 const r = APP.results;

 const code = `* IPD Meta-Analysis Stata Code

* Generated by IPD Meta-Analysis Pro



* Create dataset

clear

input str20 study n effect se

${r.studies.map(s => `"${s.study}" ${s.n} ${s.effect.toFixed(4)} ${s.se.toFixed(4)}`).join('\n')}

end



* Generate variance

gen var = se^2



* Random-effects meta-analysis

metan effect se, random label(namevar=study) effect(${APP.config.effectMeasure})



* Forest plot

metan effect se, random forestplot label(namevar=study)



* Funnel plot

metafunnel effect se



* Egger\'s test

metabias effect se, egger



* Heterogeneity

di "I-squared: " r(I2) "%"

di "Tau-squared: " r(tau2)

`;

 const blob = new Blob([code], { type: 'text/plain' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = 'ipd_meta_analysis.do';

 a.click();

 showNotification('Stata code exported', 'success');

 }



function reportingEscapeText(value) {

 if (typeof escapeHTML === 'function') return escapeHTML(String(value == null ? '' : value));

 return String(value == null ? '' : value)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');

}



function reportingFormatNumber(value, digits) {

 var d = Number.isFinite(Number(digits)) ? Number(digits) : 3;

 var n = Number(value);

 return Number.isFinite(n) ? n.toFixed(d) : 'NA';

}



function reportingFormatPercent(value, digits) {

 var d = Number.isFinite(Number(digits)) ? Number(digits) : 1;

 var n = Number(value);

 return Number.isFinite(n) ? (n * 100).toFixed(d) + '%' : 'NA';

}



function buildReportingCompletenessSnapshot() {

 var hasData = Array.isArray(APP.data) && APP.data.length > 0;

 var hasResults = !!(APP.results && APP.results.pooled);

 var snapshot = {

 generatedAt: new Date().toISOString(),

 hasData: hasData,

 hasResults: hasResults,

 rows: hasData ? APP.data.length : 0,

 studies: 0,

 treatments: 0,

 strictQC: null,

 sopCompliance: null,

 externalRevalidation: null,

 independentVerification: null,

 publicationPackageV1: null,

 publicationPackageV2: null,

 adoptionForecast12: null,

 automationAvailable: typeof IPDAutomationAPI !== 'undefined' && !!IPDAutomationAPI,

 prismaChecklist: null,

 hashes: {},

 errors: []

 };



 var safeRun = function(label, fn) {

 try {

 return fn();

 } catch (e) {

 snapshot.errors.push(label + ': ' + String(e && e.message ? e.message : e));

 return null;

 }

 };



 var hashFn = (typeof sopGovHashSync === 'function') ? sopGovHashSync : function(value) {

 var str;

 try {

 str = JSON.stringify(value);

 } catch (e) {

 str = String(value);

 }

 var h = 0;

 for (var i = 0; i < str.length; i++) {

 h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;

 }

 return 'hash_' + (h >>> 0).toString(16).padStart(8, '0');

 };



 if (hasData) {

 var studyVar = (APP.config && APP.config.studyVar) ? APP.config.studyVar : 'study_id';

 var treatmentVar = (APP.config && APP.config.treatmentVar) ? APP.config.treatmentVar : 'treatment';

 snapshot.studies = safeRun('count_studies', function() {
 return new Set(APP.data.map(function(row) { return row[studyVar]; })).size;
 }) ?? 0;

 snapshot.treatments = safeRun('count_treatments', function() {
 return new Set(APP.data.map(function(row) { return row[treatmentVar]; })).size;
 }) ?? 0;

 }



 if (hasData && typeof runStrictPreAnalysisQCGate === 'function') {

 if (!APP.lastStrictQCReport) {

 APP.lastStrictQCReport = safeRun('strict_qc', function() {
 return runStrictPreAnalysisQCGate({ silent: true, mode: 'reporting_export' });
 });

 }

 snapshot.strictQC = APP.lastStrictQCReport || null;

 }



 if ((APP.config && APP.config.sopLockEnabled) || APP.sopLock) {

 if (!APP.lastSOPComplianceReport && typeof SOPGovernance !== 'undefined' && SOPGovernance && typeof SOPGovernance.complianceCheck === 'function') {

 APP.lastSOPComplianceReport = safeRun('sop_compliance', function() {
 return SOPGovernance.complianceCheck({ silent: true, mode: 'reporting_export' });
 });

 }

 snapshot.sopCompliance = APP.lastSOPComplianceReport || null;

 }



 if (hasData && typeof buildExternalRevalidationBundleV1 === 'function') {

 if (!APP.lastExternalRevalidationBundle) {

 APP.lastExternalRevalidationBundle = safeRun('external_revalidation_bundle', function() {
 return buildExternalRevalidationBundleV1();
 });

 }

 snapshot.externalRevalidation = APP.lastExternalRevalidationBundle || null;

 }



 if (hasData && typeof buildIndependentVerificationChallengeBundle === 'function') {

 if (!APP.lastIndependentVerificationBundle) {

 APP.lastIndependentVerificationBundle = safeRun('independent_verification_bundle', function() {
 return buildIndependentVerificationChallengeBundle();
 });

 }

 snapshot.independentVerification = APP.lastIndependentVerificationBundle || null;

 }



 if (hasData && typeof buildIPDPublicationPackage === 'function') {

 if (!APP.beyondR40PublicationPackage) {

 APP.beyondR40PublicationPackage = safeRun('publication_package_v1', function() {
 return buildIPDPublicationPackage();
 });

 }

 snapshot.publicationPackageV1 = APP.beyondR40PublicationPackage || null;

 }



 if (hasData && typeof buildIPDPublicationPackageV2 === 'function') {

 if (!APP.beyondR40PublicationPackageV2) {

 APP.beyondR40PublicationPackageV2 = safeRun('publication_package_v2', function() {
 return buildIPDPublicationPackageV2();
 });

 }

 snapshot.publicationPackageV2 = APP.beyondR40PublicationPackageV2 || null;

 }



 if (hasData && typeof buildPersonaAdoptionForecast12 === 'function') {

 if (!APP.lastPersonaAdoptionForecast12) {

 APP.lastPersonaAdoptionForecast12 = safeRun('adoption_forecast_12', function() {
 return buildPersonaAdoptionForecast12();
 });

 }

 snapshot.adoptionForecast12 = APP.lastPersonaAdoptionForecast12 || null;

 }



 if (typeof generatePRISMAChecklist === 'function') {

 snapshot.prismaChecklist = safeRun('prisma_checklist', function() {
 return generatePRISMAChecklist(APP.results || {}, APP.config || {});
 });

 }



 snapshot.hashes = {

 dataHash: hasData ? hashFn(APP.data) : null,

 configHash: hashFn(APP.config || {}),

 resultsHash: hasResults ? hashFn(APP.results) : null

 };



 return snapshot;

}



function buildComprehensiveReportingBundleMarkdown(bundle) {

 var b = bundle || {};

 var s = b.reportingSnapshot || {};

 var strictQC = s.strictQC || {};

 var sop = s.sopCompliance || {};

 var iv = s.independentVerification || {};

 var ivSignoff = iv.independentSignoff || {};

 var forecast = s.adoptionForecast12 || {};

 var prisma = s.prismaChecklist || {};

 var prismaItems = Array.isArray(prisma.items) ? prisma.items : [];

 var reported = Number(prisma.reportedCount);

 if (!Number.isFinite(reported)) {
 reported = prismaItems.filter(function(item) { return !!item.reported; }).length;
 }

 var total = Number(prisma.totalItems);

 if (!Number.isFinite(total)) {
 total = prismaItems.length;
 }

 var lines = [];

 lines.push('# IPD Comprehensive Reporting Bundle');
 lines.push('');
 lines.push('- Generated: `' + (b.generatedAt || 'NA') + '`');
 lines.push('- Has data: `' + (s.hasData ? 'Yes' : 'No') + '`');
 lines.push('- Has pooled results: `' + (s.hasResults ? 'Yes' : 'No') + '`');
 lines.push('- Rows: `' + (s.rows || 0) + '`');
 lines.push('- Studies: `' + (s.studies || 0) + '`');
 lines.push('- Treatments: `' + (s.treatments || 0) + '`');
 lines.push('');
 lines.push('## Validation and Governance');
 lines.push('');
 lines.push('- Strict QC pass: `' + (strictQC.pass ? 'Yes' : 'No') + '`');
 lines.push('- Strict QC score: `' + Number(strictQC.qualityScore || 0).toFixed(0) + '%`');
 lines.push('- SOP compliance pass: `' + (sop.pass ? 'Yes' : 'No') + '`');
 lines.push('- SOP compliance score: `' + Number(sop.score || 0).toFixed(0) + '%`');
 lines.push('- External revalidation bundle: `' + (s.externalRevalidation ? 'Ready' : 'Not ready') + '`');
 lines.push('- Independent verification bundle: `' + (s.independentVerification ? 'Ready' : 'Not ready') + '`');
 lines.push('- Signoffs: `' + ((ivSignoff.signoffs || []).length || 0) + '/' + (ivSignoff.requiredSignoffs || 0) + '`');
 lines.push('');
 lines.push('## Reporting Coverage');
 lines.push('');
 lines.push('- Publication package v1: `' + (s.publicationPackageV1 ? 'Ready' : 'Not ready') + '`');
 lines.push('- Publication package v2: `' + (s.publicationPackageV2 ? 'Ready' : 'Not ready') + '`');
 lines.push('- PRISMA-IPD checklist: `' + reported + '/' + total + ' (' + (total > 0 ? ((reported / total) * 100).toFixed(1) : '0.0') + '%)`');
 lines.push('- Adoption forecast: `' + (s.adoptionForecast12 ? ((forecast.adoptCount || 0) + '/12') : 'Not available') + '`');
 lines.push('- Automation API available: `' + (s.automationAvailable ? 'Yes' : 'No') + '`');
 lines.push('');
 lines.push('## Reproducibility Hashes');
 lines.push('');
 lines.push('- dataHash: `' + (((s.hashes || {}).dataHash) || 'NA') + '`');
 lines.push('- configHash: `' + (((s.hashes || {}).configHash) || 'NA') + '`');
 lines.push('- resultsHash: `' + (((s.hashes || {}).resultsHash) || 'NA') + '`');
 lines.push('');
 lines.push('## Notes');
 lines.push('');
 lines.push('- Use this bundle as a high-level audit/reporting index and pair it with publication package + revalidation bundle for submissions.');
 if ((s.errors || []).length) {
 lines.push('- Runtime warnings/errors:');
 (s.errors || []).forEach(function(err) { lines.push('  - ' + String(err)); });
 }
 return lines.join('\n') + '\n';

}



function buildComprehensiveReportingBundle() {

 var snapshot = buildReportingCompletenessSnapshot();

 var pooled = (APP.results && APP.results.pooled) ? APP.results.pooled : null;

 var bundle = {

 title: 'IPD Comprehensive Reporting Bundle',

 version: '1.0',

 generatedAt: new Date().toISOString(),

 application: 'IPD Meta-Analysis Pro',

 reportingSnapshot: snapshot,

 pooledSummary: pooled ? {
 pooled: pooled.pooled,
 lower: pooled.lower,
 upper: pooled.upper,
 se: pooled.se,
 pValue: pooled.pValue,
 I2: pooled.I2,
 tau2: pooled.tau2
 } : null

 };

 bundle.markdown = buildComprehensiveReportingBundleMarkdown(bundle);

 APP.lastComprehensiveReportingBundle = bundle;

 return bundle;

}



function exportComprehensiveReportingBundle() {

 if (!APP.results) {

 showNotification('Run analysis first to export complete reporting bundle', 'warning');

 return null;

 }

 var bundle = buildComprehensiveReportingBundle();

 if (!bundle) {

 showNotification('Could not build complete reporting bundle', 'error');

 return null;

 }

 var stamp = new Date().toISOString().replace(/[:.]/g, '-');

 var blobJson = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });

 var urlJson = URL.createObjectURL(blobJson);

 var aJson = document.createElement('a');

 aJson.href = urlJson;

 aJson.download = 'ipd_complete_reporting_bundle_' + stamp + '.json';

 aJson.click();

 URL.revokeObjectURL(urlJson);

 var blobMd = new Blob([bundle.markdown || buildComprehensiveReportingBundleMarkdown(bundle)], { type: 'text/markdown' });

 var urlMd = URL.createObjectURL(blobMd);

 var aMd = document.createElement('a');

 aMd.href = urlMd;

 aMd.download = 'ipd_complete_reporting_bundle_' + stamp + '.md';

 aMd.click();

 URL.revokeObjectURL(urlMd);

 showNotification('Complete reporting bundle exported (JSON + MD)', 'success');

 return bundle;

}



function generateReport() {

 const r = APP.results || {};

 const pooled = r.pooled || {};

 const studies = Array.isArray(r.studies) ? r.studies : [];

 const cfg = APP.config || {};

 const isLogScale = cfg.outcomeType === 'survival' ||

 (cfg.outcomeType === 'binary' && cfg.effectMeasure !== 'RD');

 const bundle = buildComprehensiveReportingBundle();

 const snapshot = bundle && bundle.reportingSnapshot ? bundle.reportingSnapshot : buildReportingCompletenessSnapshot();

 const esc = reportingEscapeText;

 const statusBadge = function(ok) {
 return ok ? '<span class="status-pass">PASS</span>' : '<span class="status-fail">PENDING</span>';
 };

 const displayPooled = Number.isFinite(Number(pooled.pooled))
 ? (isLogScale ? Math.exp(Number(pooled.pooled)) : Number(pooled.pooled))
 : null;

 const strictQC = snapshot.strictQC || {};

 const sop = snapshot.sopCompliance || {};

 const ext = snapshot.externalRevalidation || null;

 const extAvail = ext && ext.benchmarkAvailability ? ext.benchmarkAvailability : {};

 const iv = snapshot.independentVerification || null;

 const ivSignoff = iv && iv.independentSignoff ? iv.independentSignoff : { requiredSignoffs: 0, signoffs: [] };

 const signoffs = Array.isArray(ivSignoff.signoffs) ? ivSignoff.signoffs : [];

 const requiredSignoffs = Number(ivSignoff.requiredSignoffs ?? 0);

 const forecast = snapshot.adoptionForecast12 || null;

 const prisma = snapshot.prismaChecklist || {};

 const prismaItems = Array.isArray(prisma.items) ? prisma.items : [];

 const prismaReported = Number.isFinite(Number(prisma.reportedCount))
 ? Number(prisma.reportedCount)
 : prismaItems.filter(function(item) { return !!item.reported; }).length;

 const prismaTotal = Number.isFinite(Number(prisma.totalItems))
 ? Number(prisma.totalItems)
 : prismaItems.length;

 const completenessRows = [
 { label: 'Data loaded', ok: snapshot.hasData, detail: (snapshot.rows || 0) + ' rows' },
 { label: 'Pooled analysis result', ok: snapshot.hasResults, detail: studies.length + ' studies analyzed' },
 { label: 'Strict QC gate', ok: !!strictQC.pass, detail: 'Score ' + Number(strictQC.qualityScore || 0).toFixed(0) + '%' },
 { label: 'SOP governance compliance', ok: !!sop.pass, detail: sop ? ('Score ' + Number(sop.score || 0).toFixed(0) + '%') : 'Not evaluated' },
 { label: 'External revalidation bundle', ok: !!ext, detail: ext ? 'Ready' : 'Not built' },
 { label: 'Independent verification bundle', ok: !!iv, detail: iv ? 'Ready' : 'Not built' },
 { label: 'Independent signoffs', ok: requiredSignoffs > 0 ? (signoffs.length >= requiredSignoffs) : signoffs.length > 0, detail: signoffs.length + '/' + requiredSignoffs },
 { label: 'Publication package v1', ok: !!snapshot.publicationPackageV1, detail: snapshot.publicationPackageV1 ? 'Ready' : 'Not built' },
 { label: 'Publication package v2', ok: !!snapshot.publicationPackageV2, detail: snapshot.publicationPackageV2 ? 'Ready' : 'Not built' },
 { label: 'PRISMA-IPD checklist', ok: prismaTotal > 0 && prismaReported === prismaTotal, detail: prismaReported + '/' + prismaTotal + ' reported' },
 { label: 'Automation API', ok: !!snapshot.automationAvailable, detail: snapshot.automationAvailable ? 'Available' : 'Unavailable' },
 { label: 'Adoption forecast (12 personas)', ok: !!forecast, detail: forecast ? ((forecast.adoptCount || 0) + '/12 adopted') : 'Not built' }
 ];

 const completenessTableRows = completenessRows.map(function(row) {
 return '<tr><td>' + esc(row.label) + '</td><td>' + statusBadge(row.ok) + '</td><td>' + esc(row.detail) + '</td></tr>';
 }).join('');

 const signoffRows = signoffs.length ? signoffs.map(function(s, idx) {
 var hash = s && s.signoffHash ? String(s.signoffHash) : '';
 var shortHash = hash ? (hash.slice(0, 14) + '...' + hash.slice(-8)) : 'NA';
 return '<tr>' +
 '<td>' + esc(Number(s.sequence || (idx + 1))) + '</td>' +
 '<td>' + esc(s.reviewer || 'NA') + '</td>' +
 '<td>' + esc(s.reviewerEmail || 'NA') + '</td>' +
 '<td>' + esc(s.reviewerOrganization || 'NA') + '</td>' +
 '<td>' + esc(s.reviewerRole || 'NA') + '</td>' +
 '<td>' + esc(s.decision || 'agree') + '</td>' +
 '<td>' + esc(s.date || 'NA') + '</td>' +
 '<td><code>' + esc(shortHash) + '</code></td>' +
 '</tr>';
 }).join('') : '<tr><td colspan="8">No independent signoffs recorded.</td></tr>';

 const prismaRows = prismaItems.length ? prismaItems.slice(0, 20).map(function(item, idx) {
 var itemId = item.item || item.num || String(idx + 1);
 var status = item.reported ? '<span class="status-pass">REPORTED</span>' : '<span class="status-fail">MISSING</span>';
 return '<tr>' +
 '<td>' + esc(itemId) + '</td>' +
 '<td>' + esc(item.section || 'NA') + '</td>' +
 '<td>' + esc(item.description || item.item || 'NA') + '</td>' +
 '<td>' + status + '</td>' +
 '<td>' + esc(item.location || 'NA') + '</td>' +
 '</tr>';
 }).join('') : '<tr><td colspan="5">PRISMA checklist data not available.</td></tr>';

 const benchmarkRows = ext ? [
 { name: 'Parity artifact', ok: !!extAvail.parity },
 { name: 'Frontier artifact', ok: !!extAvail.frontier },
 { name: 'Simulation artifact', ok: !!extAvail.simulation },
 { name: 'Replication artifact', ok: !!extAvail.replication }
 ].map(function(item) {
 return '<tr><td>' + esc(item.name) + '</td><td>' + statusBadge(item.ok) + '</td></tr>';
 }).join('') : '<tr><td colspan="2">External revalidation bundle not available.</td></tr>';

 const runtimeWarning = (snapshot.errors || []).length
 ? '<div class="warn-box"><strong>Runtime warnings:</strong><ul>' +
 snapshot.errors.map(function(err) { return '<li>' + esc(err) + '</li>'; }).join('') +
 '</ul></div>'
 : '';

 return `<!DOCTYPE html>

<html>

<head>

 <title>IPD Meta-Analysis Report</title>

 <style>
 body{font-family:Arial,sans-serif;max-width:1100px;margin:0 auto;padding:2rem;line-height:1.5;color:#111827}
 h1{color:#4f46e5;margin-bottom:0.25rem}
 h2{color:#1f2937;margin-top:1.8rem;border-bottom:2px solid #e5e7eb;padding-bottom:0.35rem}
 h3{color:#374151;margin-top:1.2rem}
 table{width:100%;border-collapse:collapse;margin:0.75rem 0 1rem 0;font-size:0.9rem}
 th,td{padding:0.55rem;text-align:left;border:1px solid #e5e7eb;vertical-align:top}
 th{background:#f8fafc}
 .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.75rem;margin:1rem 0}
 .stat{border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem;background:#fafafa}
 .stat-value{font-size:1.35rem;font-weight:700;color:#4f46e5}
 .stat-label{font-size:0.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.35px}
 .status-pass{display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#dcfce7;color:#166534;font-size:0.75rem;font-weight:700}
 .status-fail{display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:0.75rem;font-weight:700}
 .warn-box{border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:0.75rem 0.9rem;font-size:0.86rem}
 code{font-size:0.78rem;background:#f3f4f6;padding:0.1rem 0.25rem;border-radius:4px}
 .muted{color:#6b7280;font-size:0.86rem}
 </style>

</head>

<body>

 <h1>IPD Meta-Analysis Report</h1>

 <p class="muted">Generated: ${new Date().toLocaleString()}</p>

 <h2>Summary</h2>
 <div class="stat-grid">
 <div class="stat"><div class="stat-value">${studies.length}</div><div class="stat-label">Studies</div></div>
 <div class="stat"><div class="stat-value">${Array.isArray(APP.data) ? APP.data.length : 0}</div><div class="stat-label">Patients</div></div>
 <div class="stat"><div class="stat-value">${displayPooled === null ? 'NA' : displayPooled.toFixed(2)}</div><div class="stat-label">Pooled ${esc(cfg.effectMeasure || 'effect')}</div></div>
 <div class="stat"><div class="stat-value">${reportingFormatNumber(pooled.I2, 1)}%</div><div class="stat-label">I-squared</div></div>
 </div>

 <h2>Study Results</h2>
 <table>
 <thead><tr><th>Study</th><th>N</th><th>Effect</th><th>95% CI</th><th>Weight</th></tr></thead>
 <tbody>
 ${studies.map(function(s) {
 var eff = Number(s.effect);
 var lower = Number(s.lower);
 var upper = Number(s.upper);
 var w = Number(s.weight);
 var dispEff = Number.isFinite(eff) ? (isLogScale ? Math.exp(eff) : eff) : null;
 var dispLow = Number.isFinite(lower) ? (isLogScale ? Math.exp(lower) : lower) : null;
 var dispUpp = Number.isFinite(upper) ? (isLogScale ? Math.exp(upper) : upper) : null;
 return '<tr>' +
 '<td>' + esc(s.study || 'NA') + '</td>' +
 '<td>' + esc(Number.isFinite(Number(s.n)) ? Number(s.n) : 'NA') + '</td>' +
 '<td>' + (dispEff === null ? 'NA' : dispEff.toFixed(2)) + '</td>' +
 '<td>' + (dispLow === null ? 'NA' : dispLow.toFixed(2)) + ' - ' + (dispUpp === null ? 'NA' : dispUpp.toFixed(2)) + '</td>' +
 '<td>' + (Number.isFinite(w) ? (w * 100).toFixed(1) + '%' : 'NA') + '</td>' +
 '</tr>';
 }).join('')}
 </tbody>
 </table>

 <h2>Heterogeneity</h2>
 <p>Q = ${reportingFormatNumber(pooled.Q, 2)}, df = ${Number.isFinite(Number(pooled.df)) ? Number(pooled.df) : 'NA'}, p = ${reportingFormatNumber(pooled.pQ, 4)}</p>
 <p>I² = ${reportingFormatNumber(pooled.I2, 1)}%, τ² = ${reportingFormatNumber(pooled.tau2, 4)}</p>

 <h2>Methods</h2>
 <p>Analysis type: ${esc(cfg.analysisApproach || 'NA')}</p>
 <p>Outcome type: ${esc(cfg.outcomeType || 'NA')}</p>
 <p>Effect measure: ${esc(cfg.effectMeasure || 'NA')}</p>
 <p>Heterogeneity estimator: ${esc(cfg.reMethod || 'NA')}</p>
 ${cfg.useHKSJ ? '<p>Hartung-Knapp-Sidik-Jonkman adjustment applied.</p>' : ''}

 <h2>Reporting Completeness and Governance</h2>
 <table>
 <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
 <tbody>${completenessTableRows}</tbody>
 </table>

 <h3>Benchmark Artifact Availability</h3>
 <table>
 <thead><tr><th>Artifact</th><th>Status</th></tr></thead>
 <tbody>${benchmarkRows}</tbody>
 </table>

 <h3>Independent Signoff Ledger</h3>
 <table>
 <thead><tr><th>#</th><th>Reviewer</th><th>Email</th><th>Organization</th><th>Role</th><th>Decision</th><th>Date</th><th>Hash</th></tr></thead>
 <tbody>${signoffRows}</tbody>
 </table>

 <h3>PRISMA-IPD Coverage (Top 20 Items)</h3>
 <p>Reported items: <strong>${prismaReported}/${prismaTotal}</strong> (${prismaTotal > 0 ? ((prismaReported / prismaTotal) * 100).toFixed(1) : '0.0'}%).</p>
 <table>
 <thead><tr><th>Item</th><th>Section</th><th>Description</th><th>Status</th><th>Location</th></tr></thead>
 <tbody>${prismaRows}</tbody>
 </table>

 <h3>Reproducibility Hashes</h3>
 <table>
 <thead><tr><th>Object</th><th>Hash</th></tr></thead>
 <tbody>
 <tr><td>Data</td><td><code>${esc((snapshot.hashes || {}).dataHash || 'NA')}</code></td></tr>
 <tr><td>Configuration</td><td><code>${esc((snapshot.hashes || {}).configHash || 'NA')}</code></td></tr>
 <tr><td>Results</td><td><code>${esc((snapshot.hashes || {}).resultsHash || 'NA')}</code></td></tr>
 </tbody>
 </table>

 ${runtimeWarning}

 <hr>
 <p><em>Generated by IPD Meta-Analysis Pro</em></p>

 <div id="methodologyDisclaimer" style="display:none; position:fixed; bottom:20px; right:20px; max-width:420px; background:#ffffff; border:1px solid #d1d5db; border-radius:12px; padding:16px; box-shadow:0 10px 25px rgba(0,0,0,0.12); z-index:1000;">
 <button onclick="this.parentElement.style.display='none'" style="position:absolute;top:8px;right:8px;background:none;border:none;color:#6b7280;cursor:pointer;font-size:1.2rem;">&times;</button>
 <h4 style="margin:0 0 8px 0;color:#374151;">Methodology Note</h4>
 <p style="font-size:0.85rem;color:#4b5563;margin:0;">
 This browser-based tool provides <strong>approximate</strong> implementations of statistical methods for educational and exploratory purposes.
 For publication-quality analyses, validate results against R (metafor, lme4, survival) or Stata reference implementations.
 </p>
 <p style="font-size:0.75rem;color:#6b7280;margin:8px 0 0 0;">
 <a href="#" onclick="showAllCitations();return false;" style="color:#2563eb;">View methodological references</a>
 </p>
 </div>

 <scr` + `ipt>
 if (!localStorage.getItem('disclaimerSeen')) {
 setTimeout(function() {
 var el = document.getElementById('methodologyDisclaimer');
 if (el) el.style.display = 'block';
 localStorage.setItem('disclaimerSeen', 'true');
 }, 2000);
 }
 </scr` + `ipt>

</body>

</html>`;

 }



/* moved to dev/modules/export_schema_module.js: function exportResults */

function downloadForest(format) {

 const canvas = document.getElementById('forestPlot');

 downloadCanvas(canvas, 'forest_plot', format);

 }



function downloadFunnel(format) {

 const canvas = document.getElementById('funnelPlot');

 downloadCanvas(canvas, 'funnel_plot', format);

 }



function downloadNetwork(format) {

 const canvas = document.getElementById('networkPlot');

 downloadCanvas(canvas, 'network_plot', format);

 }



function downloadSurvivalPlot(format) {

 const canvas = document.getElementById('survivalPlotLarge') || document.getElementById('survivalPlot');

 if (!canvas) {

 showNotification('Survival plot is not available to download.', 'warning');

 return;

 }

 downloadCanvas(canvas, 'survival_plot', format || 'png');

}



function downloadCanvas(canvas, name, format) {

 if (format === 'png') {

 const link = document.createElement('a');

 link.download = `${name}.png`;

 link.href = canvas.toDataURL('image/png');

 link.click();

 } else if (format === 'svg') {

 // Generate publication-quality SVG for forest plot

 const svg = generateForestPlotSVG(canvas, name);

 const blob = new Blob([svg], { type: 'image/svg+xml' });

 const url = URL.createObjectURL(blob);

 const link = document.createElement('a');

 link.download = `${name}.svg`;

 link.href = url;

 link.click();

 URL.revokeObjectURL(url);

 showNotification('SVG exported for publication', 'success');

 }

 }



// Generate publication-quality SVG from forest plot data

// Provides vector graphics for journal submission

function generateForestPlotSVG(canvas, name) {

 const width = canvas.width;

 const height = canvas.height;



 // Get results data for SVG generation

 const results = APP.results;

 if (!results || !results.studies) {

 // Fallback: convert canvas to embedded image in SVG

 return generateCanvasBackedSVG(canvas, width, height);

 }



 const studies = results.studies;

 const pooled = results.pooled;

 const isLogScale = APP.config.outcomeType === 'survival' ||

 (APP.config.outcomeType === 'binary' && APP.config.effectMeasure !== 'RD');



 const margin = PlotDefaults.largeLabel();

 const plotWidth = width - margin.left - margin.right;

 const plotHeight = height - margin.top - margin.bottom;



 // Calculate effect range

 let effects = studies.map(s => isLogScale ? Math.exp(s.effect) : s.effect);

 let lowers = studies.map(s => isLogScale ? Math.exp(s.effect - getConfZ() *s.se) : s.effect - getConfZ() *s.se);

 let uppers = studies.map(s => isLogScale ? Math.exp(s.effect + getConfZ() *s.se) : s.effect + getConfZ() *s.se);



 const minVal = Math.min(...lowers, isLogScale ? Math.exp(pooled.pooled - getConfZ() *pooled.se) : pooled.pooled - getConfZ() *pooled.se) * 0.9;

 const maxVal = Math.max(...uppers, isLogScale ? Math.exp(pooled.pooled + getConfZ() *pooled.se) : pooled.pooled + getConfZ() *pooled.se) * 1.1;



 const nullValue = isLogScale ? 1 : 0;

 const xScale = (val) => margin.left + ((val - minVal) / (maxVal - minVal)) * plotWidth;

 const rowHeight = plotHeight / (studies.length + 2);



 let svg = `<?xml version="1.0" encoding="UTF-8"?>

<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">

 <style>

 .study-label { font-family: Arial, sans-serif; font-size: 11px; fill: #333; }

 .effect-label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; text-anchor: end; }

 .pooled-label { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; fill: #333; }

 .axis-label { font-family: Arial, sans-serif; font-size: 12px; fill: #333; text-anchor: middle; }

 .title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #333; text-anchor: middle; }

 .tick-label { font-family: Arial, sans-serif; font-size: 10px; fill: #666; text-anchor: middle; }

 </style>



 <!-- Background -->

 <rect width="${width}" height="${height}" fill="white"/>



 <!-- Title -->

 <text x="${width/2}" y="30" class="title">Forest Plot - ${APP.config.effectMeasure || 'Effect Size'}</text>



 <!-- Null effect line -->

 <line x1="${xScale(nullValue)}" y1="${margin.top}" x2="${xScale(nullValue)}" y2="${height - margin.bottom + 20}" stroke="#999" stroke-dasharray="4,4" stroke-width="1"/>

`;



 // Add study rows

 studies.forEach((study, i) => {

 const y = margin.top + (i + 0.5) * rowHeight;

 const effect = isLogScale ? Math.exp(study.effect) : study.effect;

 const lower = isLogScale ? Math.exp(study.effect - getConfZ() *study.se) : study.effect - getConfZ() *study.se;

 const upper = isLogScale ? Math.exp(study.effect + getConfZ() *study.se) : study.effect + getConfZ() *study.se;

 const weight = study.weight || (1 / study.variance);

 const maxWeight = Math.max(...studies.map(s => s.weight || (1 / s.variance)));

 const squareSize = 4 + (weight / maxWeight) * 12;



 // Study label

 svg += ` <text x="${margin.left - 10}" y="${y + 4}" class="study-label" text-anchor="end">${escapeHTML(study.study)}</text>\n`;



 // Confidence interval line

 svg += ` <line x1="${xScale(lower)}" y1="${y}" x2="${xScale(upper)}" y2="${y}" stroke="#333" stroke-width="1.5"/>\n`;



 // CI whiskers

 svg += ` <line x1="${xScale(lower)}" y1="${y - 4}" x2="${xScale(lower)}" y2="${y + 4}" stroke="#333" stroke-width="1.5"/>\n`;

 svg += ` <line x1="${xScale(upper)}" y1="${y - 4}" x2="${xScale(upper)}" y2="${y + 4}" stroke="#333" stroke-width="1.5"/>\n`;



 // Effect size square (size proportional to weight)

 svg += ` <rect x="${xScale(effect) - squareSize/2}" y="${y - squareSize/2}" width="${squareSize}" height="${squareSize}" fill="#333"/>\n`;



 // Effect label on right

 svg += ` <text x="${width - 20}" y="${y + 4}" class="effect-label">${effect.toFixed(2)} [${lower.toFixed(2)}, ${upper.toFixed(2)}]</text>\n`;

 });



 // Pooled effect (diamond)

 const pooledY = margin.top + (studies.length + 0.5) * rowHeight;

 const pooledEffect = isLogScale ? Math.exp(pooled.pooled) : pooled.pooled;

 const pooledLower = isLogScale ? Math.exp(pooled.pooled - getConfZ() *pooled.se) : pooled.pooled - getConfZ() *pooled.se;

 const pooledUpper = isLogScale ? Math.exp(pooled.pooled + getConfZ() *pooled.se) : pooled.pooled + getConfZ() *pooled.se;



 // Horizontal line before pooled

 svg += ` <line x1="${margin.left}" y1="${pooledY - rowHeight/2}" x2="${width - margin.right}" y2="${pooledY - rowHeight/2}" stroke="#ccc" stroke-width="1"/>\n`;



 // Diamond for pooled effect

 const diamondHeight = 10;

 svg += ` <polygon points="${xScale(pooledLower)},${pooledY} ${xScale(pooledEffect)},${pooledY - diamondHeight} ${xScale(pooledUpper)},${pooledY} ${xScale(pooledEffect)},${pooledY + diamondHeight}" fill="#1a56db" stroke="#1a56db"/>\n`;



 // Pooled label

 svg += ` <text x="${margin.left - 10}" y="${pooledY + 4}" class="pooled-label" text-anchor="end">Overall (${pooled.I2.toFixed(0)}% I²)</text>\n`;

 svg += ` <text x="${width - 20}" y="${pooledY + 4}" class="effect-label" font-weight="bold">${pooledEffect.toFixed(2)} [${pooledLower.toFixed(2)}, ${pooledUpper.toFixed(2)}]</text>\n`;



 // X-axis with ticks

 const nTicks = 5;

 for (let i = 0; i <= nTicks; i++) {

 const val = minVal + (i / nTicks) * (maxVal - minVal);

 const x = xScale(val);

 svg += ` <line x1="${x}" y1="${height - margin.bottom + 20}" x2="${x}" y2="${height - margin.bottom + 25}" stroke="#333" stroke-width="1"/>\n`;

 svg += ` <text x="${x}" y="${height - margin.bottom + 40}" class="tick-label">${val.toFixed(2)}</text>\n`;

 }



 // X-axis label

 const axisLabel = isLogScale ? `${APP.config.effectMeasure} (favors treatment ←→ favors control)` : 'Effect Size';

 svg += ` <text x="${width/2}" y="${height - 15}" class="axis-label">${axisLabel}</text>\n`;



 // Metadata comment for reproducibility

 svg += `\n <!-- Generated by IPD Meta-Analysis Pro -->

 <!-- Date: ${new Date().toISOString()} -->

 <!-- Studies: ${studies.length} -->

 <!-- Pooled Effect: ${pooledEffect.toFixed(4)} -->

 <!-- 95% CI: [${pooledLower.toFixed(4)}, ${pooledUpper.toFixed(4)}] -->

 <!-- I²: ${pooled.I2.toFixed(1)}% -->

 <!-- τ²: ${pooled.tau2.toFixed(4)} -->

`;



 svg += `</svg>`;

 return svg;

}



// Fallback: embed canvas as image in SVG wrapper

function generateCanvasBackedSVG(canvas, width, height) {

 const dataUrl = canvas.toDataURL('image/png');

 return `<?xml version="1.0" encoding="UTF-8"?>

<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">

 <image xlink:href="${dataUrl}" width="${width}" height="${height}"/>

 <!-- Generated by IPD Meta-Analysis Pro - Canvas fallback -->

</svg>`;

}



function clearData() {

 APP.data = null;

 APP.currentData = null;

 window.currentData = null;

 APP.variables = [];

 APP.results = null;
 APP.lastResults = null;
 APP.analysisSettings = null;

 document.getElementById('dataPreviewCard').style.display = 'none';

 document.getElementById('analysisSettingsCard').style.display = 'none';

 }



function editData() {

 alert('Data editor coming soon. For now, edit your CSV and re-upload.');

 }



function toggleContour() {



 const canvas = document.getElementById('funnelPlot');

 if (APP.results) {

 const effects = APP.results.studies.map(s => s.effect);

 const ses = APP.results.studies.map(s => s.se);

 Plots.drawFunnel(canvas, effects, ses, APP.results.pooled.pooled, { showContour: true });

 }

 }



function runSelectionModel() {

 alert('Selection models (3PSM, Copas) coming soon.');

 }


function networkDistinctCount(field) {

 if (!field || !APP.data || !APP.data.length) return 0;

 return new Set(APP.data.map(function(d) { return d[field]; }).filter(function(v) {

 return v !== null && v !== undefined && v !== '';

 })).size;

}



function networkResolveTreatmentVar() {

 let treatmentVar = APP.config.treatmentVar || 'treatment_name';

 const configuredTreatments = networkDistinctCount(treatmentVar);

 const namedTreatments = networkDistinctCount('treatment_name');

 if (configuredTreatments < 3 && namedTreatments >= 3) {

 treatmentVar = 'treatment_name';

 APP.config.treatmentVar = 'treatment_name';

 }

 return treatmentVar;

}



function networkOutcomeConfig() {

 const outcomeType = APP.config.outcomeType || 'binary';

 const fallback = outcomeType === 'continuous' ? 'hamd_change' : (outcomeType === 'survival' ? 'event' : 'event');

 return {

 outcomeType: outcomeType,

 outcomeVar: APP.config.eventVar || APP.config.outcomeVar || fallback,

 beneficialHigher: outcomeType === 'continuous'

 };

}



function networkCanonicalPair(a, b) {

 return [String(a), String(b)].sort().join('|');

}



function networkPairKey(a, b) {

 return String(a) + '|' + String(b);

}



function networkArmSummary(rows, outcomeType, outcomeVar, treatmentLabel, studyLabel) {

 if (!rows || !rows.length) return null;

 if (outcomeType === 'continuous') {

 var outcomes = rows.map(function(d) { return Number(d[outcomeVar]); }).filter(Number.isFinite);

 if (outcomes.length < 2) return null;

 return {

 study: studyLabel,

 treatment: treatmentLabel,

 n: outcomes.length,

 mean: Stats.mean(outcomes),

 sd: Math.max(Stats.sd(outcomes, 1), 1e-6)

 };

 }

 var events = rows.filter(function(d) { return Number(d[outcomeVar]) === 1; }).length;

 return {

 study: studyLabel,

 treatment: treatmentLabel,

 n: rows.length,

 events: events

 };

}



function networkPairwiseComparison(armA, armB, outcomeType) {

 if (!armA || !armB) return null;

 if (outcomeType === 'continuous') {

 var variance = (armA.sd * armA.sd / armA.n) + (armB.sd * armB.sd / armB.n);

 if (!Number.isFinite(variance) || variance <= 0) return null;

 return {

 treatment1: armA.treatment,

 treatment2: armB.treatment,

 study: armA.study,

 effect: armA.mean - armB.mean,

 se: Math.sqrt(variance),

 variance: variance

 };

 }

 var e1 = armA.events;

 var n1 = armA.n;

 var e2 = armB.events;

 var n2 = armB.n;

 if (n1 <= 0 || n2 <= 0) return null;

 var logOR = Math.log(((e1 + 0.5) * (n2 - e2 + 0.5)) / ((e2 + 0.5) * (n1 - e1 + 0.5)));

 var varLogOR = 1 / (e1 + 0.5) + 1 / (n1 - e1 + 0.5) + 1 / (e2 + 0.5) + 1 / (n2 - e2 + 0.5);

 if (!Number.isFinite(varLogOR) || varLogOR <= 0) return null;

 return {

 treatment1: armA.treatment,

 treatment2: armB.treatment,

 study: armA.study,

 effect: -logOR,

 se: Math.sqrt(varLogOR),

 variance: varLogOR

 };

}



function networkCholesky(matrix) {

 if (!Array.isArray(matrix) || !matrix.length) return null;

 var n = matrix.length;

 var L = Array.from({ length: n }, function() { return new Array(n).fill(0); });

 for (var i = 0; i < n; i++) {

 for (var j = 0; j <= i; j++) {

 var sum = 0;

 for (var k = 0; k < j; k++) sum += L[i][k] * L[j][k];

 if (i === j) {

 var diag = Number(matrix[i][i]) - sum;

 if (diag <= 1e-12) diag = 1e-12;

 L[i][j] = Math.sqrt(diag);

 } else {

 L[i][j] = (Number(matrix[i][j]) - sum) / Math.max(L[j][j], 1e-12);

 }

 }

 }

 return L;

}



function networkStandardNormalSample() {

 var u1 = Math.max(Math.random(), 1e-12);

 var u2 = Math.max(Math.random(), 1e-12);

 return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

}



function networkSampleBasicEffects(means, vcov) {

 if (!Array.isArray(means) || !Array.isArray(vcov) || means.length !== vcov.length || !means.length) return means ? means.slice() : [];

 var chol = networkCholesky(vcov);

 if (!chol) return means.slice();

 var z = means.map(function() { return networkStandardNormalSample(); });

 var draw = new Array(means.length).fill(0);

 for (var i = 0; i < means.length; i++) {

 var acc = means[i];

 for (var j = 0; j <= i; j++) acc += chol[i][j] * z[j];

 draw[i] = acc;

 }

 return draw;

}



function fitReferenceNetworkModel(pairwiseRows, treatments, reference) {

 if (!Array.isArray(pairwiseRows) || !pairwiseRows.length || !Array.isArray(treatments) || treatments.length < 2) return null;

 var basicTreatments = treatments.filter(function(t) { return t !== reference; });

 if (!basicTreatments.length) return null;

 var index = {};

 basicTreatments.forEach(function(t, i) { index[t] = i; });

 var p = basicTreatments.length;

 var XtWX = Array.from({ length: p }, function() { return new Array(p).fill(0); });

 var XtWy = new Array(p).fill(0);

 var usable = 0;

 pairwiseRows.forEach(function(row) {

 if (!row || !Number.isFinite(row.effect) || !Number.isFinite(row.variance) || row.variance <= 0) return;

 var x = new Array(p).fill(0);

 if (row.treatment1 !== reference && index[row.treatment1] !== undefined) x[index[row.treatment1]] += 1;

 if (row.treatment2 !== reference && index[row.treatment2] !== undefined) x[index[row.treatment2]] -= 1;

 if (x.every(function(v) { return v === 0; })) return;

 var w = 1 / row.variance;

 usable++;

 for (var i = 0; i < p; i++) {

 XtWy[i] += w * x[i] * row.effect;

 for (var j = 0; j < p; j++) XtWX[i][j] += w * x[i] * x[j];

 }

 });

 if (!usable) return null;

 for (var d = 0; d < p; d++) XtWX[d][d] += 1e-8;

 var beta;

 var vcov;

 try {

 beta = solveLinearSystem(XtWX.map(function(row) { return row.slice(); }), XtWy.slice());

 vcov = MatrixUtils.inverse(XtWX.map(function(row) { return row.slice(); }));

 } catch (e) {

 return null;

 }

 var basicEffects = {};

 treatments.forEach(function(t) {

 basicEffects[t] = t === reference ? 0 : beta[index[t]];

 });

 var pairwiseEffects = {};

 var getCov = function(a, b) {

 if (a === reference || b === reference) return 0;

 return (vcov[index[a]] && Number.isFinite(vcov[index[a]][index[b]])) ? vcov[index[a]][index[b]] : 0;

 };

 for (var i = 0; i < treatments.length; i++) {

 for (var j = 0; j < treatments.length; j++) {

 if (i === j) continue;

 var a = treatments[i];

 var b = treatments[j];

 var effect = basicEffects[a] - basicEffects[b];

 var varAB = getCov(a, a) + getCov(b, b) - 2 * getCov(a, b);

 pairwiseEffects[networkPairKey(a, b)] = {

 effect: effect,

 se: Math.sqrt(Math.max(varAB, 1e-12)),

 variance: Math.max(varAB, 1e-12)

 };

 }

 }

 return {

 reference: reference,

 basicTreatments: basicTreatments,

 basicEffects: basicEffects,

 basicVcov: vcov,

 pairwiseEffects: pairwiseEffects

 };

}



function buildNetworkFromData() {

 if (!APP.data || APP.data.length === 0) return;

 let treatmentVar = networkResolveTreatmentVar();
 const studyVar = APP.config.studyVar || 'study_id';
 const outcomeConfig = networkOutcomeConfig();

 const treatments = [...new Set(APP.data.map(d => d[treatmentVar] || d.treatment_name))];
 const studies = [...new Set(APP.data.map(d => d[studyVar]))];

 const treatmentCounts = {};
 treatments.forEach(t => {
 treatmentCounts[t] = APP.data.filter(d => (d[treatmentVar] || d.treatment_name) === t).length;
 });

 const maxCount = Math.max(...Object.values(treatmentCounts));
 const nodes = treatments.map((t) => ({
 id: t,
 label: t.length > 15 ? t.substring(0, 12) + '...' : t,
 size: 20 + (treatmentCounts[t] / Math.max(maxCount, 1)) * 40
 }));

 const edgeMap = {};
 studies.forEach(study => {
 const studyData = APP.data.filter(d => d[studyVar] === study);
 const studyTreatments = [...new Set(studyData.map(d => d[treatmentVar] || d.treatment_name))];
 for (let i = 0; i < studyTreatments.length; i++) {
 for (let j = i + 1; j < studyTreatments.length; j++) {
 const t1 = studyTreatments[i];
 const t2 = studyTreatments[j];
 const key = [t1, t2].sort().join('|');
 if (!edgeMap[key]) edgeMap[key] = { from: t1, to: t2, weight: 0, studies: [] };
 edgeMap[key].weight++;
 edgeMap[key].studies.push(study);
 }
 }
 });

 const edges = Object.values(edgeMap).map(e => ({ ...e, label: String(e.weight) }));
 const canvas = document.getElementById('networkPlot');
 if (canvas) Plots.drawNetwork(canvas, nodes, edges);

 document.getElementById('networkNodes').textContent = nodes.length;
 document.getElementById('networkEdges').textContent = edges.length;
 document.getElementById('networkConnected').textContent = edges.length >= nodes.length - 1 ? 'Yes' : 'No';

 const netBody = document.getElementById('networkTableBody');
 if (netBody && edges.length > 0) {
 netBody.innerHTML = edges.map(e => {
 const fromData = APP.data.filter(d => (d[treatmentVar] || d.treatment_name) === e.from);
 const toData = APP.data.filter(d => (d[treatmentVar] || d.treatment_name) === e.to);
 const totalN = fromData.length + toData.length;
 let outcomeSummary = 'NA';
 if (outcomeConfig.outcomeType === 'continuous') {
 const fromVals = fromData.map(d => Number(d[outcomeConfig.outcomeVar])).filter(Number.isFinite);
 const toVals = toData.map(d => Number(d[outcomeConfig.outcomeVar])).filter(Number.isFinite);
 if (fromVals.length && toVals.length) outcomeSummary = (Stats.mean(fromVals) - Stats.mean(toVals)).toFixed(2);
 } else {
 outcomeSummary = String(fromData.filter(d => Number(d[outcomeConfig.outcomeVar]) === 1).length + toData.filter(d => Number(d[outcomeConfig.outcomeVar]) === 1).length);
 }
 return `<tr>
 <td>${escapeHTML(e.from)} vs ${escapeHTML(e.to)}</td>
 <td>${e.weight}</td>
 <td>${totalN}</td>
 <td>${outcomeSummary}</td>
 <td><span class="badge badge-success">Yes</span></td>
 </tr>`;
 }).join('');
 }

 return { nodes, edges, treatments, treatmentVar, studyVar, outcomeType: outcomeConfig.outcomeType, outcomeVar: outcomeConfig.outcomeVar };

}



