'use strict';
// More > Predictive Patient Selection must not use columns derived from the outcome as patient covariates.
// Root cause (5f0e6ae9): the covariates are the first 6 numeric columns other than the mapped study / treatment /
// outcome / time columns. On the Depression CBT example (outcome hamd_change) they included hamd_endpoint
// (= hamd_baseline - hamd_change), remission (hamd_endpoint <= 7) and response_50pct (hamd_change / hamd_baseline
// >= 0.5): "predictors" computed from each patient's own outcome. They are now left out with a notice:
// (1) the example declares the columns computed from its endpoint (valid only while that exact data is loaded);
// (2) for any data, a column that is an exact linear function of the outcome, or a 0/1 column that a threshold of the
// outcome separates perfectly (at least 5 patients per group), is left out -- and, for a 0/1 outcome, a column one
// of whose thresholds separates the outcome perfectly (agy #561: remission = hamd_endpoint <= 7). Real characteristics stay.
//   node dev/tests/predictive_selection_derived.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };

run(`window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {};
  window.__pp = null; displayPredictiveResults = function (r) { __pp = r; };
  setTimeout = function (f) { f(); return 0; };`);
const go = (y, type) => {
  sandbox.__y = y; sandbox.__type = type;
  run(`__pp = null; __notes.length = 0;
    document.getElementById('varStudy').value = 'study_id'; document.getElementById('varTreatment').value = 'treatment';
    document.getElementById('varEvent').value = __y; document.getElementById('outcomeType').value = __type;
    if (document.getElementById('varTime')) document.getElementById('varTime').value = '';
    runPredictivePatientSelection();`);
  return { pp: run('__pp'), notes: run('__notes.join(" | ")') };
};

// 1. the shipped Depression CBT example
run(`loadExampleData('continuous');`);
const cols = Object.keys(run('APP.data[0]'));
check('example loaded with its derived columns', ['hamd_endpoint', 'remission', 'response_50pct', 'hamd_change', 'hamd_baseline', 'age'].every(c => cols.includes(c)), cols.join(','));
for (const [y, type, derived] of [['hamd_change', 'continuous', ['hamd_endpoint', 'remission', 'response_50pct']], ['remission', 'binary', ['hamd_endpoint', 'hamd_change', 'response_50pct']]]) {
  const { pp, notes } = go(y, type);
  if (!pp) { check('CBT / ' + y + ': ran', false, notes); continue; }
  check('CBT / ' + y + ': no outcome-derived covariate (' + derived.join(', ') + ')', !pp.covariates.some(c => derived.includes(c)), pp.covariates.join(','));
  check('CBT / ' + y + ': baseline characteristics are kept (hamd_baseline, age)', pp.covariates.includes('hamd_baseline') && pp.covariates.includes('age'), pp.covariates.join(','));
  check('CBT / ' + y + ': the excluded columns are reported (result and notice)', derived.every(c => (pp.excludedCovariates || []).some(x => x.name === c)) && derived.every(c => notes.includes(c)), JSON.stringify(pp.excludedCovariates) + ' | ' + notes);
}

// 2. user data (no declaration): derived columns are recognised from the data
{
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rows = [];
  for (let i = 0; i < 240; i++) {
    const age = 30 + Math.round(rnd() * 40), base = 18 + Math.round(rnd() * 12), trt = (i >> 2) % 2, sex = rnd() < 0.5 ? 1 : 0;
    const y = Math.round((5 + 2 * trt + 0.05 * (age - 50) + (rnd() - 0.5) * 10) * 10) / 10;
    rows.push({ study_id: 'U' + (i % 4), treatment: trt, age: age, score_base: base, sex: sex, rare_flag: i < 3 ? 1 : 0,
      y_pct: y * 100 / 20, y_good: y >= 6 ? 1 : 0, y: y });
  }
  sandbox.__rows = rows;
  run(`APP.data = __rows; APP.currentData = __rows; APP.declaredOutcome = null;`);
  const { pp, notes } = go('y', 'continuous');
  if (!pp) check('user data: ran', false, notes);
  else {
    check('user data: exact linear function of the outcome (y_pct) left out', !pp.covariates.includes('y_pct') && (pp.excludedCovariates || []).some(x => x.name === 'y_pct' && /linear/.test(x.reason)), JSON.stringify(pp.excludedCovariates));
    check('user data: 0/1 threshold of the outcome (y_good) left out', !pp.covariates.includes('y_good') && (pp.excludedCovariates || []).some(x => x.name === 'y_good' && /threshold/.test(x.reason)), JSON.stringify(pp.excludedCovariates));
    check('user data: real characteristics kept (age, score_base, sex, rare_flag)', ['age', 'score_base', 'sex', 'rare_flag'].every(c => pp.covariates.includes(c)), pp.covariates.join(','));
    check('user data: the notice names the excluded columns', /y_pct/.test(notes) && /y_good/.test(notes), notes);
  }
}

// 3. a declaration does not outlive its data: change one value and the example's names are no longer taken on trust
{
  run(`loadExampleData('continuous'); APP.data[0].age = APP.data[0].age + 1;`);
  const { pp, notes } = go('hamd_change', 'continuous');
  check('changed data: the example declaration is not applied', pp && !(pp.excludedCovariates || []).some(x => /in this example/.test(x.reason)), pp ? JSON.stringify(pp.excludedCovariates) : notes);
}
// 4. (agy #561) the symmetric case without the declaration: a 0/1 OUTCOME derived by thresholding a covariate
// (remission = hamd_endpoint <= 7) -- the covariate is the measurement the outcome came from, and must be left out
{
  run(`loadExampleData('continuous'); APP.data[0].age = APP.data[0].age + 1;`);
  const { pp, notes } = go('remission', 'binary');
  check('changed data, outcome remission: hamd_endpoint (remission = hamd_endpoint <= 7) left out by the data check',
    pp && !pp.covariates.includes('hamd_endpoint') && (pp.excludedCovariates || []).some(x => x.name === 'hamd_endpoint' && /threshold/.test(x.reason)) && /hamd_endpoint/.test(notes),
    pp ? pp.covariates.join(',') + ' | ' + JSON.stringify(pp.excludedCovariates) : notes);
  check('changed data, outcome remission: baseline characteristics kept (hamd_baseline, age)', pp && pp.covariates.includes('hamd_baseline') && pp.covariates.includes('age'), pp ? pp.covariates.join(',') : notes);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
