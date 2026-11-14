'use strict';
// More > Random Forest Heterogeneity: no outcome-derived covariates, effects in the outcome's own units, and the
// out-of-bag R-squared stated plainly.
// Root cause (a46d1da2, rrev60 F2): (1) runRandomForestHeterogeneity built its covariates from every numeric column
// other than the mapped ones and never called ipdOutcomeDerivedColumns (predictive selection does), so on Depression
// CBT (outcome hamd_change) hamd_endpoint -- the outcome's own counterpart -- had the top importance. (2) Each leaf's
// CATE is mean(outcome | treated) - mean(outcome | control): a mean difference in outcome units for a continuous
// outcome, a difference in proportions for a 0/1 outcome; displayRandomForestResults multiplied every CATE by 100
// and appended "%" ("41.1% to 445.6%"). (3) The out-of-bag R-squared (of each patient's outcome on the predicted CATE)
// was shown as "Out-of-bag R-squared: -635.5%"; a negative R-squared means the predictions do worse than the mean,
// and is now said in those words with the number on its own scale. The headline no longer says "Heterogeneity
// Detected" whatever the result.
//   node dev/tests/random_forest_derived_units.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 500) + ']')); };
run(`window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {}; setTimeout = function (f) { f(); return 0; };
  window.__m = []; document.body.appendChild = function (m) { __m.push(String(m.innerHTML)); return m; };
  window.__rf = null; var __disp = displayRandomForestResults; displayRandomForestResults = function (r) { __rf = r; return __disp(r); };`);
const upload = (type, seed) => {
  sandbox.__type = type; sandbox.__seed = seed;
  run(`SeededRNG.patchMathRandom(__seed); try { loadExampleData(__type); } finally { SeededRNG.restoreMathRandom(); }
    (function () { const rows = APP.data, keys = Object.keys(rows[0]);
      const txt = [keys.join(',')].concat(rows.map(r => keys.map(k => r[k] == null ? '' : String(r[k])).join(','))).join('\\n');
      APP.data = parseDelimited(txt).data; APP.currentData = APP.data; APP.declaredOutcome = null; })();`);
};
const go = (y, type) => {
  sandbox.__y = y; sandbox.__t = type;
  run(`__rf = null; __m.length = 0; __notes.length = 0;
    document.getElementById('varStudy').value = 'study_id'; document.getElementById('varTreatment').value = 'treatment';
    document.getElementById('varEvent').value = __y; document.getElementById('outcomeType').value = __t; document.getElementById('varTime').value = '';
    SeededRNG.patchMathRandom(3); try { runRandomForestHeterogeneity(); } finally { SeededRNG.restoreMathRandom(); }`);
  const html = run('__m.join("")');
  return { rf: run('__rf && { covariates: __rf.covariates, excluded: __rf.excludedCovariates, oob: __rf.oobScore, cates: __rf.predictions.map(p => p.cate) }'), text: html.replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' '), notes: run('__notes.join(" | ")') };
};
const fam = ['hamd_endpoint', 'hamd_change', 'remission', 'response_50pct'];
for (const [loader, y, type] of [['example', 'hamd_change', 'continuous'], ['upload', 'hamd_change', 'continuous'], ['upload', 'remission', 'binary']]) {
  if (loader === 'example') run(`SeededRNG.patchMathRandom(21); try { loadExampleData('continuous'); } finally { SeededRNG.restoreMathRandom(); }`);
  else upload('continuous', 21);
  const { rf, text, notes } = go(y, type);
  const tag = loader + ' / ' + y;
  if (!rf) { check(tag + ': ran', false, notes); continue; }
  const derived = fam.filter(c => c !== y);
  check(tag + ': no outcome-derived covariate (' + derived.join(', ') + ')', !rf.covariates.some(c => derived.includes(c)), rf.covariates.join(','));
  check(tag + ': baseline characteristics kept (hamd_baseline, age)', rf.covariates.includes('hamd_baseline') && rf.covariates.includes('age'), rf.covariates.join(','));
  check(tag + ': the excluded columns are reported (result and notice)', derived.every(c => (rf.excluded || []).some(x => x.name === c) && notes.includes(c)), JSON.stringify(rf.excluded) + ' | ' + notes);
  const lo = Math.min(...rf.cates), hi = Math.max(...rf.cates);
  if (type === 'continuous') {
    check(tag + ': CATE range shown in outcome units (mean difference), not as a percentage', text.includes(lo.toFixed(2) + ' to ' + hi.toFixed(2)) && /mean difference/i.test(text) && !/\d%\s*to\s*-?\d/.test(text) && !/percentage points/.test(text), text.slice(0, 600));
    check(tag + ': quartile interpretation in outcome units', !/% effect vs/.test(text), (text.match(/Patients in the top quartile[^.]*\./) || [''])[0]);
  } else {
    check(tag + ': CATE range shown as a difference in proportions, in percentage points', text.includes((lo * 100).toFixed(1) + ' to ' + (hi * 100).toFixed(1) + ' percentage points') && /proportion/.test(text), text.slice(0, 600));
  }
  check(tag + ': no unconditional "Heterogeneity Detected" headline', !/Heterogeneity Detected/.test(text), text.slice(0, 200));
  if (typeof rf.oob === 'number') {
    const shown = /Out-of-bag R-squared:?\s*(-?\d+\.\d+)(%?)/.exec(text);
    check(tag + ': OOB R-squared shown as a number on its own scale (not %): ' + rf.oob.toFixed(3), shown && shown[2] === '' && Math.abs(Number(shown[1]) - rf.oob) < 0.0051, shown ? shown[0] : text.slice(0, 400));
    if (rf.oob <= 0) check(tag + ': a non-positive OOB R-squared is said plainly (no better than the mean)', /worse than|no better than/.test(text), text.slice(0, 600));
  }
}
// agy #569 finding 3: an uploaded 0/1 outcome with empty cells (parseDelimited reads them as '') is still a 0/1
// outcome: its CATEs are differences in proportions, in percentage points
{
  upload('continuous', 21);
  run(`[3, 40, 77].forEach(i => { APP.data[i].remission = ''; });`);
  const { rf, text, notes } = go('remission', 'binary');
  if (!rf) check('upload / remission with empty cells: ran', false, notes);
  else {
    const lo = Math.min(...rf.cates), hi = Math.max(...rf.cates);
    check('upload / remission with empty cells: CATE range in percentage points (still a 0/1 outcome)', text.includes((lo * 100).toFixed(1) + ' to ' + (hi * 100).toFixed(1) + ' percentage points') && /proportion/.test(text), text.slice(0, 600));
  }
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
