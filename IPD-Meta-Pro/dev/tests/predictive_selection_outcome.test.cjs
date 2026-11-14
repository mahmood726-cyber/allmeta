'use strict';
// More > Predictive Patient Selection must estimate the treatment effect on the scale runAnalysis pools, for the
// configured outcome type.
// Root cause (e17f9f6f, and still after #555 for binary / time-to-event): calculateGroupEffect estimated each
// subgroup effect from ALL patients of the subgroup pooled together, ignoring study, as a difference of proportions
// of rows with outcome === 1 -- for a time-to-event outcome a crude difference in event proportions that ignores
// follow-up time and censoring, for a binary outcome an unstratified risk difference. The subgroup (and validation)
// effects now come from the per-study estimates runAnalysis uses (ipdConfiguredStudyEstimates -> ipdStudyEstimate:
// Cox log HR, log OR, mean difference), pooled across studies with a fixed-effect inverse-variance model.
// Reference: predictive_selection_outcome_reference.R (R 4.6.0, metafor rma(method = "FE"), survival coxph Efron):
// medians, subgroup effects and SEs, interactions, the page's scoring rule and the validation effects.
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
const cases = { continuous: { y: 'hamd_change', measure: /mean difference/i }, binary: { y: 'remission', measure: /odds ratio/i }, survival: { y: 'event', time: 'time_months', measure: /hazard ratio/i, tol: 1e-7 } };
// Cox fits are iterative in both R (coxph eps 1e-9) and the page: 1e-7 relative for time-to-event (federated_outcome uses
// 1e-6), 1e-10 for the closed-form log OR and mean difference.
for (const type of Object.keys(cases)) {
  const R = ref[type].ref, c = cases[type], tol = c.tol || 1e-10;
  sandbox.__rows = ref[type].rows; sandbox.__y = c.y; sandbox.__type = type; sandbox.__t = c.time || '';
  run(`APP.data = __rows; APP.currentData = __rows; __pp = null; __notes.length = 0;
    document.getElementById('varStudy').value = 'study_id'; document.getElementById('varTreatment').value = 'treatment';
    document.getElementById('varEvent').value = __y; document.getElementById('outcomeType').value = __type;
    if (document.getElementById('varTime')) document.getElementById('varTime').value = __t;
    runPredictivePatientSelection();`);
  const pp = run('__pp');
  if (!pp) { check(type + ': predictive selection ran', false, run('__notes.join(" | ")')); continue; }
  check(type + ': covariates age, bmi, hamd_baseline, ordered by |interaction| as in R', JSON.stringify(pp.sortedCovs) === JSON.stringify(R.order), JSON.stringify(pp.sortedCovs) + ' vs ' + JSON.stringify(R.order));
  for (const v of R.order) {
    const p = pp.cateByCovariate[v] || {}, r = R.cate[v];
    check(type + ' / ' + v + ': median = R (' + r.median + ')', p.median === r.median, p.median);
    check(type + ' / ' + v + ': low/high subgroup effects and SEs = R (' + r.low.toFixed(4) + ', ' + r.high.toFixed(4) + ')',
      near(p.lowEffect && p.lowEffect.effect, r.low, tol) && near(p.highEffect && p.highEffect.effect, r.high, tol) &&
      near(p.lowEffect && p.lowEffect.se, r.lowSE, tol) && near(p.highEffect && p.highEffect.se, r.highSE, tol),
      JSON.stringify([p.lowEffect, p.highEffect]));
    check(type + ' / ' + v + ': interaction and its SE = R (' + r.interaction.toFixed(4) + ')', near(p.interaction, r.interaction, tol) && near(p.interactionSE, r.interactionSE, tol), p.interaction + ' / ' + p.interactionSE);
  }
  const V = pp.validation, RV = R.validation;
  check(type + ': predicted-benefit split sizes = R (' + RV.nBenefiters + ' / ' + RV.nNonBenefiters + ')', V.nBenefiters === RV.nBenefiters && V.nNonBenefiters === RV.nNonBenefiters, JSON.stringify(V));
  check(type + ': validation effects = R (' + RV.effectInBenefiters.toFixed(4) + ', ' + RV.effectInNonBenefiters.toFixed(4) + ')', near(V.effectInBenefiters, RV.effectInBenefiters, tol) && near(V.effectInNonBenefiters, RV.effectInNonBenefiters, tol), JSON.stringify(V));
  check(type + ': validation SEs = R (' + RV.seInBenefiters.toFixed(4) + ', ' + RV.seInNonBenefiters.toFixed(4) + ')', near(V.seInBenefiters, RV.seInBenefiters, tol) && near(V.seInNonBenefiters, RV.seInNonBenefiters, tol), JSON.stringify(V));
  check(type + ': the result names its effect measure and the pooling', c.measure.test(String(pp.effectMeasure || '')) && /per study/i.test(String(pp.effectMeasure || '')) && /fixed-effect/i.test(String(pp.effectMeasure || '')), 'measure ' + pp.effectMeasure);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
