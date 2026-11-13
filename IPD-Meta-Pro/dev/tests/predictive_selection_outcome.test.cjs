'use strict';
// More > Predictive Patient Selection must estimate the treatment effect on the configured outcome type.
// Root cause (e17f9f6f): calculateGroupEffect, and the "Model Validation" effects, counted rows with outcome === 1 in
// each arm and took the difference of those proportions whatever the outcome type. On a continuous outcome
// (Depression CBT example, hamd_change) almost no value equals 1, so every subgroup effect, interaction and
// validation effect was 0.0% (or the proportion of patients whose change happened to be exactly 1). A continuous
// outcome now gets the mean difference (treated - control) with SE sqrt(var1/n1 + var0/n0), shown in outcome units;
// a binary outcome keeps the risk difference (numbers unchanged); the measure is reported with the result.
// Reference: predictive_selection_outcome_reference.R (R 4.6.0): medians, subgroup effects, interactions, the
// page's scoring rule and the validation effects, computed independently in R.
//   node dev/tests/predictive_selection_outcome.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const ref = require('./predictive_selection_outcome_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

run(`window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {};
  window.__pp = null; displayPredictiveResults = function (r) { __pp = r; };
  setTimeout = function (f) { f(); return 0; };`);
const cases = { continuous: { y: 'hamd_change', measure: /mean difference/i }, binary: { y: 'remission', measure: /risk difference/i } };
for (const type of Object.keys(cases)) {
  const R = ref[type].ref, c = cases[type];
  sandbox.__rows = ref[type].rows; sandbox.__y = c.y; sandbox.__type = type;
  run(`APP.data = __rows; APP.currentData = __rows; __pp = null; __notes.length = 0;
    document.getElementById('varStudy').value = 'study_id'; document.getElementById('varTreatment').value = 'treatment';
    document.getElementById('varEvent').value = __y; document.getElementById('outcomeType').value = __type;
    runPredictivePatientSelection();`);
  const pp = run('__pp');
  if (!pp) { check(type + ': predictive selection ran', false, run('__notes.join(" | ")')); continue; }
  check(type + ': covariates age, bmi, hamd_baseline, ordered by |interaction| as in R', JSON.stringify(pp.sortedCovs) === JSON.stringify(R.order), JSON.stringify(pp.sortedCovs) + ' vs ' + JSON.stringify(R.order));
  for (const v of R.order) {
    const p = pp.cateByCovariate[v] || {}, r = R.cate[v];
    check(type + ' / ' + v + ': median = R (' + r.median + ')', p.median === r.median, p.median);
    check(type + ' / ' + v + ': low/high subgroup effects and SEs = R (' + r.low.toFixed(4) + ', ' + r.high.toFixed(4) + ')',
      near(p.lowEffect && p.lowEffect.effect, r.low, 1e-10) && near(p.highEffect && p.highEffect.effect, r.high, 1e-10) &&
      near(p.lowEffect && p.lowEffect.se, r.lowSE, 1e-10) && near(p.highEffect && p.highEffect.se, r.highSE, 1e-10),
      JSON.stringify([p.lowEffect, p.highEffect]));
    check(type + ' / ' + v + ': interaction and its SE = R (' + r.interaction.toFixed(4) + ')', near(p.interaction, r.interaction, 1e-10) && near(p.interactionSE, r.interactionSE, 1e-10), p.interaction + ' / ' + p.interactionSE);
  }
  const V = pp.validation, RV = R.validation;
  check(type + ': predicted-benefit split sizes = R (' + RV.nBenefiters + ' / ' + RV.nNonBenefiters + ')', V.nBenefiters === RV.nBenefiters && V.nNonBenefiters === RV.nNonBenefiters, JSON.stringify(V));
  check(type + ': validation effects = R (' + RV.effectInBenefiters.toFixed(4) + ', ' + RV.effectInNonBenefiters.toFixed(4) + ')', near(V.effectInBenefiters, RV.effectInBenefiters, 1e-10) && near(V.effectInNonBenefiters, RV.effectInNonBenefiters, 1e-10), JSON.stringify(V));
  check(type + ': the result names its effect measure', c.measure.test(String(pp.effectMeasure || '')), 'measure ' + pp.effectMeasure);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
