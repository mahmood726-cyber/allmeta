'use strict';
// Regression tests for the shipped page (ipd-meta-pro.html), run in Node with the page's own scripts:
//   node dev/tests/p60_shipped_page_regressions.test.cjs [path/to/ipd-meta-pro.html]
// Reference values are from R 4.6.0 (stats, survival 3.8-6, metafor 5.2-1).
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const page = loadPage(pageFile);
const { run, sandbox } = page;
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
const close = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
function setField(id, v) { sandbox.document.getElementById(id).value = v; }
function analyse(rows, outcome, method, hksj, approach) {
  sandbox.__rows = rows;
  run('APP.data = __rows; APP.results = null; APP.analysisRunning = false;');
  setField('varStudy', 'study'); setField('varTreatment', 'treatment'); setField('varTime', outcome === 'survival' ? 'time' : '');
  setField('varEvent', outcome === 'continuous' ? 'outcome' : 'event'); setField('outcomeType', outcome);
  setField('analysisApproach', approach || 'two-stage'); setField('effectMeasure', outcome === 'binary' ? 'OR' : 'MD');
  setField('reMethod', method); setField('confLevel', '0.95'); sandbox.document.getElementById('useHKSJ').checked = !!hksj;
  try { run('runAnalysis()'); } catch (e) { /* display code may throw after APP.results is set */ }
  return run('APP.results');
}
// deterministic pseudo-random numbers (LCG) for synthetic data
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const gauss = () => { let u = 0; for (let i = 0; i < 12; i++) u += rnd(); return u - 6; };

// 1. two-stage binary: 0.5 is added only to a study with a zero cell (metafor escalc default)
{
  const rows = [];
  const add = (s, t, ev, n) => { for (let i = 0; i < n; i++) rows.push({ study: s, treatment: t, event: i < ev ? 1 : 0 }); };
  add('A', 1, 12, 40); add('A', 0, 20, 40); add('B', 1, 0, 30); add('B', 0, 4, 30); add('C', 1, 9, 35); add('C', 0, 15, 36);
  const r = analyse(rows, 'binary', 'DL', false);
  const sA = r.studies.find(s => s.study === 'A'), sB = r.studies.find(s => s.study === 'B');
  check('binary log-OR without zero cells is uncorrected', close(sA.effect, Math.log(12 * 20 / (28 * 20)), 1e-12) && close(sA.variance, 1 / 12 + 1 / 28 + 1 / 20 + 1 / 20, 1e-12), 'A: ' + sA.effect);
  check('binary log-OR with a zero cell gets +0.5 in all four cells', close(sB.effect, Math.log(0.5 * 26.5 / (30.5 * 4.5)), 1e-12), 'B: ' + sB.effect);
}
// 2-3. distribution functions
check('Stats.normalCDF(1.96)', close(run('Stats.normalCDF(1.96)'), 0.97500210485177963, 1e-14), String(run('Stats.normalCDF(1.96)')));
check('Stats.normalCDF(-3.3)', Math.abs(run('Stats.normalCDF(-3.3)') - 0.00048342414238377744) < 1e-15, String(run('Stats.normalCDF(-3.3)')));
check('Stats.tQuantile(0.975, 4)', close(run('Stats.tQuantile(0.975, 4)'), 2.7764451051977934, 1e-12), String(run('Stats.tQuantile(0.975, 4)')));
check('Stats.tQuantile(0.975, 1)', close(run('Stats.tQuantile(0.975, 1)'), 12.706204736174694, 1e-12), String(run('Stats.tQuantile(0.975, 1)')));
check('Stats.tQuantile(0.975, 5)', close(run('Stats.tQuantile(0.975, 5)'), 2.5705818356363137, 1e-12), String(run('Stats.tQuantile(0.975, 5)')));
check('Stats.logGamma(2.5)', close(run('Stats.logGamma(2.5)'), 0.28468287047291918, 1e-14), String(run('Stats.logGamma(2.5)')));
check('Stats.tQuantile(0.005, 7)', close(run('Stats.tQuantile(0.005, 7)'), -3.4994832973504932, 1e-12), String(run('Stats.tQuantile(0.005, 7)')));
// 4. prediction interval uses t with k - 1 degrees of freedom (Cochrane Handbook v6.5)
{
  const pi = run('MetaAnalysis.predictionInterval({ pooled: 0, variance: 1, tau2: 0, df: 2 }, 0.95)');
  check('prediction interval t_{k-1} (k = 3)', close(pi.upper, 4.3026527297494619, 1e-12), String(pi.upper));
  const pi2 = run('MetaAnalysis.predictionInterval({ pooled: 0, variance: 1, tau2: 0, df: 1 }, 0.95)');
  check('prediction interval defined for k = 2', close(pi2.upper, 12.706204736174694, 1e-12), String(pi2.upper));
}
// 5. Cox model with tied event times: Efron (R coxph default)
{
  sandbox.__t = [1, 1, 2, 2, 2, 3, 4, 4, 5, 6, 6, 7]; sandbox.__e = [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0];
  sandbox.__x = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0].map(v => [v]);
  const f = run('SurvivalAnalysis.coxPH(__t, __e, __x)');
  check('Cox Efron estimate with ties', close(f.beta[0], -0.0055266753716807305, 1e-9), String(f.beta[0]));
  check('Cox Efron variance with ties', close(f.se[0] * f.se[0], 0.46436365808859392, 1e-9), String(f.se[0] * f.se[0]));
}
// 6-7. pooling
{
  sandbox.__y = [0.10, 0.30, 0.35, 0.65, 0.45, 0.15]; sandbox.__v = [0.03, 0.02, 0.05, 0.01, 0.04, 0.02];
  check('REML tau2 converged', close(run('MetaAnalysis.randomEffectsREML(__y, __v).tau2'), 0.031482345693696262, 1e-9), String(run('MetaAnalysis.randomEffectsREML(__y, __v).tau2')));
  check('ML tau2 converged', close(run('MetaAnalysis.randomEffectsML(__y, __v).tau2'), 0.024295329625756399, 1e-9), String(run('MetaAnalysis.randomEffectsML(__y, __v).tau2')));
  // common-effect fit of these data has Q > k - 1, so the HKSJ factor exceeds 1
  const h = run('(function(){ var r = MetaAnalysis.fixedEffect(__y, __v); return MetaAnalysis.applyHKSJ(r, __y, __v); })()');
  check('HKSJ result reports the adjusted SE', h.se === h.seHKSJ && h.seHKSJ > h.seUnadjusted, 'se ' + h.se + ' seHKSJ ' + h.seHKSJ);
}
// 8-9. one-stage binary (PQL): boundary tau2 = 0 converges; no treatment PI/I2 from the intercept variance
{
  const rows = [];
  for (let s = 0; s < 5; s++) for (let i = 0; i < 100; i++) { rows.push({ study: 'S' + s, treatment: 1, event: i < 20 ? 1 : 0 }); rows.push({ study: 'S' + s, treatment: 0, event: i < 30 ? 1 : 0 }); }
  sandbox.__rows = rows;
  const g = run('OneStageGLMM.fitBinary(__rows, "event", "treatment", "study", [], {})');
  check('GLMM converges at the tau2 = 0 boundary', g.convergence.converged === true && g.tau2 < 1e-12 && close(g.treatment.logOR, Math.log(20 * 70 / (80 * 30)), 1e-9),
    'converged ' + g.convergence.converged + ' tau2 ' + g.tau2 + ' logOR ' + g.treatment.logOR);
  const piOk = !(Array.isArray(g.treatment.predictionInterval_logScale) && g.treatment.predictionInterval_logScale.every(Number.isFinite));
  check('GLMM reports no treatment PI / I2 from the random-intercept variance', piOk && !Number.isFinite(g.I2), 'I2 ' + g.I2);
}
// 10-11. one-stage continuous: PI with t_{K-1}; no Q made from I2
{
  const rows = [];
  for (let s = 0; s < 6; s++) { const b0 = 2 * gauss(), b1 = 0.8 * gauss(); for (let i = 0; i < 80; i++) { const t = i % 2; rows.push({ study: 'S' + s, treatment: t, outcome: 10 + b0 + (-1 + b1) * t + 2 * gauss() }); } }
  sandbox.__rows = rows;
  const r = run('runOneStageIPD(__rows, "outcome", "treatment", "study", [])');
  const tau1 = r.randomEffects ? r.randomEffects.tau1_sq : r.tau2;
  const mult = (r.prediction_interval.upper - r.pooled_effect) / Math.sqrt(r.SE * r.SE + tau1);
  check('one-stage continuous PI uses t_{K-1}', close(mult, 2.5705818356363137, 1e-9), String(mult));
  check('one-stage continuous reports no Q derived from I2', !Number.isFinite(r.Q) && !Number.isFinite(r.Q_pvalue), 'Q ' + r.Q);
}
// 12. choosing the one-stage approach in the main form does not silently return the two-stage result
{
  const rows = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < 40; i++) { const t = i % 2; rows.push({ study: 'S' + s, treatment: t, outcome: 5 - t + gauss() }); }
  const a = analyse(rows, 'continuous', 'REML', false, 'two-stage');
  const est2 = a && a.pooled ? a.pooled.pooled : null;
  const b = analyse(rows, 'continuous', 'REML', false, 'one-stage');
  const same = !!(b && b.pooled && b.pooled.pooled === est2 && !/one-stage/i.test(String(b.pooled.method || b.approach || '')));
  check('one-stage selection does not silently return the two-stage result', !same);
}
// 13. one-stage continuous: singular ML fit (no slope heterogeneity) reaches the lme4 ML estimate
{
  let sd = 777; const r2 = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const g2 = () => { let u = 0; for (let i = 0; i < 12; i++) u += r2(); return u - 6; };
  const rows = [];
  for (let s = 0; s < 5; s++) { const b0 = 2 * g2(); for (let i = 0; i < 60; i++) { const t = i % 2; rows.push({ study: 'S' + s, treatment: t, outcome: Math.round((20 + b0 - 1.5 * t + 3 * g2()) * 1e4) / 1e4 }); } }
  sandbox.__rows = rows;
  const r = run('runOneStageIPD(__rows, "outcome", "treatment", "study", [])');
  const re = r.randomEffects || {};
  // R: lmer(outcome ~ treatment + (1 + treatment | study), REML = FALSE), bobyqa rhoend 1e-12 (singular fit)
  const ok = close(r.pooled_effect, -1.6547919999999965, 1e-5) && close(r.SE, 0.35330929517570947, 1e-5) &&
    close(re.tau1_sq, 0.010916309415941159, 1e-5) && close(re.tau0_sq, 0.26483239983491003, 1e-5) && close(re.sigma_sq, 9.198314713077627, 1e-5);
  check('one-stage continuous singular fit matches lme4 ML', ok, 'est ' + r.pooled_effect + ' se ' + r.SE + ' tau1 ' + re.tau1_sq + ' tau0 ' + re.tau0_sq + ' s2 ' + re.sigma_sq);
}
console.log(failed ? 'FAILED ' + failed : 'ALL PASS');
process.exit(failed ? 1 : 0);
