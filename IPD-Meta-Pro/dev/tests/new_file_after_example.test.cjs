'use strict';
// A user who first runs an example and then uploads their own IPD file (Data > drop zone), picks its columns in the
// Study / Treatment / Event drop-downs and presses Run Analysis must get an analysis of THEIR file.
// runAnalysis() counted studies for its "at least 2 studies" check with `APP.config.studyVar || #varStudy.value`.
// APP.config.studyVar still held the PREVIOUS analysis's column (the example's "study_id"), and the config is only
// refreshed from the drop-downs further down, so a file without a "study_id" column counted as 1 study and was refused
// ("At least 2 studies required for meta-analysis {k: 1}") although it has 5. Seen on the live page, 17 Nov 2026
// (lane pa10 user path: example "SGLT2 CVD", then a 5-study binary CSV). A fresh page (empty config) worked.
//   node dev/tests/new_file_after_example.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
function setField(id, v) { sandbox.document.getElementById(id).value = v; }
function rowsFor(studyCol, eventCol, spec) {
  const rows = [];
  for (const [s, n1, e1, n0, e0] of spec) for (const [arm, n, e] of [[1, n1, e1], [0, n0, e0]])
    for (let i = 0; i < n; i++) rows.push({ [studyCol]: s, treatment: arm, [eventCol]: i < e ? 1 : 0 });
  return rows;
}
function analyse(rows, studyCol, eventCol) {
  sandbox.__rows = rows;
  run('APP.data = __rows; APP.results = null; APP.analysisRunning = false;');
  setField('varStudy', studyCol); setField('varTreatment', 'treatment'); setField('varTime', '');
  setField('varEvent', eventCol); setField('outcomeType', 'binary'); setField('analysisApproach', 'two-stage');
  setField('effectMeasure', 'OR'); setField('reMethod', 'REML'); setField('confLevel', '0.95');
  sandbox.document.getElementById('useHKSJ').checked = false;
  run('var __notes = []; showNotification = function (m, t) { __notes.push(String(m)); };');
  try { run('runAnalysis()'); } catch (e) { /* display code may throw after APP.results is set */ }
  return { res: run('APP.results'), notes: run('__notes'), cfg: run('({ s: APP.config.studyVar, e: APP.config.eventVar })') };
}
// 1. the "example": 8 studies in column study_id, events in mace_event
const ex = analyse(rowsFor('study_id', 'mace_event', [['E1', 60, 9, 60, 12], ['E2', 70, 8, 70, 14], ['E3', 50, 6, 52, 9], ['E4', 80, 11, 80, 15],
  ['E5', 40, 5, 41, 8], ['E6', 90, 12, 88, 18], ['E7', 55, 7, 55, 10], ['E8', 65, 9, 66, 13]]), 'study_id', 'mace_event');
check('precondition: the example analysis runs (k = 8)', !!(ex.res && ex.res.studies && ex.res.studies.length === 8), 'k ' + (ex.res && ex.res.studies && ex.res.studies.length));
// 2. the user's own file: 5 studies in column "study", events in "death" (the live user-path CSV)
const mine = analyse(rowsFor('study', 'death', [['Trial-A', 80, 10, 80, 17], ['Trial-B', 120, 15, 118, 24], ['Trial-C', 60, 9, 62, 8],
  ['Trial-D', 150, 20, 150, 33], ['Trial-E', 95, 7, 97, 15]]), 'study', 'death');
const k = mine.res && mine.res.studies ? mine.res.studies.length : null;
check('after an example, an uploaded file with other column names is analysed with the columns chosen (k = 5)', k === 5,
  'k ' + k + '; notes: ' + mine.notes.join(' | ').slice(0, 200));
check('no "at least 2 studies" refusal for a 5-study file', !mine.notes.some(m => /At least 2 studies/i.test(m)), mine.notes.join(' | ').slice(0, 200));
check('the analysis config follows the drop-downs', mine.cfg.s === 'study' && mine.cfg.e === 'death', JSON.stringify(mine.cfg));
// 3. a genuine 1-study file is still refused (the check itself must keep working)
const one = analyse(rowsFor('study', 'death', [['Only', 80, 10, 80, 17]]), 'study', 'death');
check('a 1-study file is still refused', !(one.res && one.res.pooled) && one.notes.some(m => /At least 2 studies/i.test(m)), one.notes.join(' | ').slice(0, 200));
console.log(failed ? failed + ' FAILED' : 'ALL PASS');
process.exitCode = failed ? 1 : 0;
