'use strict';
// An explicitly EMPTY variable control (Data tab: Study / Treatment / Outcome set to "none") is authoritative: the
// surfaces outside runAnalysis must refuse, not fall back to a column that happens to be called outcome / y / effect /
// study / treatment / event.
// Root cause (a46d1da2, rrev60 F4): ipdFormAnalysisConfig returns null for an empty control (as #552 intended, "a
// control that exists on the page is authoritative, also when it is explicitly empty"), but ipdArmOutcomes then used
// `config.eventVar || ('outcome' in r0 ? 'outcome' : ('y' in r0 ? 'y' : 'effect'))` (and the same for study and
// treatment), so with the outcome control empty the Power Monitor / Federated Analysis analysed a column named y;
// Predictive Patient Selection and Random Forest fell back to 'event'.
//   node dev/tests/empty_control_authoritative.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };
run(`window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {}; setTimeout = function (f) { f(); return 0; };
  window.__pp = null; displayPredictiveResults = function (r) { __pp = r; }; window.__rf = null; displayRandomForestResults = function (r) { __rf = r; };`);
// data with decoy columns named y, event, study, treatment next to the real ones
const rows = [];
for (let i = 0; i < 400; i++) {
  const trt = (i >> 1) % 2;
  rows.push({ study_id: 'S' + (i % 5), study: 'X' + (i % 2), arm: trt, treatment: (i >> 3) % 2, score: 10 + trt + (i % 7), y: 30 + (i % 11), event: i % 3 === 0 ? 1 : 0, age: 30 + (i % 40), bmi: 20 + (i % 13) });
}
sandbox.__rows = rows;
const setForm = (s, t, e, type) => run(`APP.data = __rows; APP.currentData = __rows; APP.config.eventVar = null; APP.config.studyVar = null; APP.config.treatmentVar = null;
  document.getElementById('varStudy').value = '${s}'; document.getElementById('varTreatment').value = '${t}';
  document.getElementById('varEvent').value = '${e}'; document.getElementById('outcomeType').value = '${type}'; document.getElementById('varTime').value = '';
  __notes.length = 0; __pp = null; __rf = null;`);

for (const [role, s, t, e] of [['outcome', 'study_id', 'arm', ''], ['study', '', 'arm', 'score'], ['treatment', 'study_id', '', 'score']]) {
  setForm(s, t, e, 'continuous');
  const arms = run('ipdArmOutcomes(APP.data, ipdFormAnalysisConfig())');
  check(`empty ${role} control: ipdArmOutcomes refuses (no fallback column)`, !!arms.error && arms.studies.length === 0, JSON.stringify({ error: arms.error, sv: arms.studyVar, tv: arms.treatmentVar, ov: arms.outcomeVar }));
  const ce = run(`ipdConfiguredStudyEstimates(APP.data, ipdFormAnalysisConfig(), 'Power Monitor')`);
  check(`empty ${role} control: configured estimates (Power Monitor / Federated) refused with a message naming the ${role}`, ce.refused && new RegExp(role, 'i').test(ce.message), JSON.stringify(ce).slice(0, 300));
  const pm = run(`(function(){ const s = PowerMonitor.calculateCurrentPower(APP.data, ipdFormAnalysisConfig()); return { refused: s.refused, k: s.currentStudies, pooled: s.pooledEffect }; })()`);
  check(`empty ${role} control: Power Monitor refuses`, pm.refused === true, JSON.stringify(pm));
}
// the outcome control empty: predictive selection and random forest refuse instead of analysing 'event'
setForm('study_id', 'arm', '', 'binary');
run('runPredictivePatientSelection()');
check('empty outcome control: Predictive Patient Selection refuses (no fallback to the column "event")', run('__pp') === null && /outcome/i.test(run('__notes.join(" ")')), run('__notes.join(" | ")') + ' | pp ' + JSON.stringify(run('__pp && __pp.covariates')));
setForm('study_id', 'arm', '', 'binary');
run('runRandomForestHeterogeneity()');
check('empty outcome control: Random Forest refuses (no fallback to the column "event")', run('__rf') === null && /outcome/i.test(run('__notes.join(" ")')), run('__notes.join(" | ")'));
// mapped controls still work, and a page without the controls (APP.config only) keeps the old fallbacks
setForm('study_id', 'arm', 'score', 'continuous');
const ok = run('ipdArmOutcomes(APP.data, ipdFormAnalysisConfig())');
check('mapped controls: arm outcomes of the mapped columns', !ok.error && ok.outcomeVar === 'score' && ok.studyVar === 'study_id' && ok.treatmentVar === 'arm' && ok.studies.length === 5, JSON.stringify({ e: ok.error, ov: ok.outcomeVar, sv: ok.studyVar, tv: ok.treatmentVar }));
const legacy = run(`ipdArmOutcomes(APP.data, { treatmentVar: 'arm' })`);
check('no controls in the configuration (legacy caller): the old fallbacks still apply', !legacy.error && legacy.outcomeVar === 'y' && legacy.studyVar === 'study', JSON.stringify({ e: legacy.error, ov: legacy.outcomeVar, sv: legacy.studyVar }));
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
