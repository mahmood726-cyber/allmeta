'use strict';
// Found by the modal sweep: More > Random Forest Heterogeneity on the NMA: Antidep example (all studies) showed
// "Treatment effects range from NaN% to NaN%" and "top quartile ... NaN% effect vs NaN%".
// Root cause: runRandomForestHeterogeneity read APP.config.treatmentVar / eventVar with fallbacks 'treatment' /
// 'event'. APP.config holds those only after a completed Run Analysis; before that (or when the run was refused)
// the outcome fell back to 'event', a column the continuous / network examples do not have, so every leaf CATE was
// a mean of undefined = NaN. It also used the mapped outcome itself as a covariate when it was not literally named
// "event" (remission, hamd_change). It now reads the form configuration (ipdFormAnalysisConfig, as runAnalysis
// does), excludes the mapped outcome, time and study columns from the covariates, and refuses when the outcome is
// not a numeric column. runPredictivePatientSelection had the same lines and gets the same fix.
//   node dev/tests/random_forest_config.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 300) + ']')); };
const rows = [];
for (let i = 0; i < 320; i++) { const t = i % 2, age = 30 + (i * 13) % 40, base = 20 + (i * 7) % 9; rows.push({ study_id: 'S' + (i % 4), patient_id: i, treatment: t, hamd_baseline: base, age: age, bmi: 22 + (i * 3) % 10, remission: ((i * 37 + t * 11) % 10) < (3 + 2 * t) ? 1 : 0 }); }
sandbox.__rows = rows;
run(`APP.data = __rows; APP.currentData = __rows; APP.config.treatmentVar = null; APP.config.eventVar = null;
  document.getElementById('varStudy').value = 'study_id'; document.getElementById('varTreatment').value = 'treatment';
  document.getElementById('varEvent').value = 'remission'; document.getElementById('outcomeType').value = 'binary';
  window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {};
  window.__rf = null; displayRandomForestResults = function (r) { __rf = r; };
  setTimeout = function (f) { f(); return 0; };
  runRandomForestHeterogeneity();`);
const rf = run('__rf');
const cates = rf ? rf.predictions.map(p => p.cate) : [];
check('Random forest ran (before Run Analysis) and every CATE is finite', rf && cates.length === rows.length && cates.every(Number.isFinite), rf ? cates.filter(c => !Number.isFinite(c)).length + ' non-finite of ' + cates.length : JSON.stringify(run('__notes')));
check('the mapped outcome is not used as a covariate', rf && !rf.covariates.includes('remission') && rf.covariates.includes('age'), rf && rf.covariates);
run(`document.getElementById('varEvent').value = 'nonexistent'; __rf = null; __notes.length = 0; runRandomForestHeterogeneity();`);
check('an outcome column that is not in the data is refused, not fitted', run('__rf') === null && /outcome/i.test(run('__notes.join(" ")')), run('__notes.join(" | ")'));
run(`__notes.length = 0; var __pps = 0; displayPredictiveResults = function () { __pps++; }; runPredictivePatientSelection();`);
check('predictive patient selection (same code pattern) also refuses a missing outcome column', /outcome/i.test(run('__notes.join(" ")')), run('__notes.join(" | ")'));
{
  // a 0/1 covariate whose median is 1: "> median" leaves the high group empty, the interaction was NaN and, summed
  // into every patient's score, made the whole predicted-benefit split NaN ("Predicted Benefiters ... NaN%")
  const rows2 = rows.map((r, i) => Object.assign({}, r, { employed: (i % 5) === 0 ? 0 : 1 }));
  sandbox.__rows2 = rows2;
  run(`APP.data = __rows2; APP.currentData = __rows2; document.getElementById('varEvent').value = 'remission'; __notes.length = 0;
    window.__pp = null; displayPredictiveResults = function (r) { __pp = r; };
    (function () { const o = displayPredictiveResults; })();`);
  let threw = null; try { run('runPredictivePatientSelection()'); } catch (e) { threw = String(e); }
  const pp = run('__pp');
  const keys = pp && pp.cateByCovariate ? Object.keys(pp.cateByCovariate) : [];
  const finite = pp && keys.every(k => Number.isFinite(pp.cateByCovariate[k].interaction)) && pp.validation && Number.isFinite(pp.validation.effectInBenefiters) && Number.isFinite(pp.validation.effectInNonBenefiters);
  check('predictive selection: a covariate whose median split leaves an arm empty is left out, and the benefit split stays finite', !threw && pp && !keys.includes('employed') && finite, threw || (pp ? JSON.stringify({ keys, v: pp.validation }) : 'no result; notes ' + run('__notes.join(" | ")')));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
