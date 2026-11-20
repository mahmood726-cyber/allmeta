'use strict';
// Requirement: the main Run Analysis button fits ONE model -- the two-stage pipeline, with a log odds
// ratio for binary outcomes, a mean difference for continuous outcomes and a Cox log hazard ratio for
// time-to-event outcomes. Any other form choice must be REFUSED, never run as something else under
// the chosen label.
// Limitation sweep LIM-P60 L01/L02, reproduced in headless Chrome on main cfce892d (binary example):
//   approach "Both approaches"  -> the two-stage fit only, no one-stage model, no message;
//   effect "RR"                 -> exp(pooled log OR) = 0.66 shown as "Pooled RR";
//   effect "RD"                 -> pooled log OR -0.41 shown as "Pooled RD";
//   continuous effect "SMD"     -> the mean difference 1.87 shown as "Pooled SMD".
//   node dev/tests/run_analysis_controls.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
function setField(id, v) { sandbox.document.getElementById(id).value = v; }
run('var __notes = []; showNotification = function (m, t) { __notes.push([String(m), t]); };');
function analyse(rows, outcome, measure, approach) {
  sandbox.__rows = rows;
  run('APP.data = __rows; APP.results = null; APP.analysisRunning = false; __notes = [];');
  setField('varStudy', 'study'); setField('varTreatment', 'treatment'); setField('varTime', outcome === 'survival' ? 'time' : '');
  setField('varEvent', outcome === 'continuous' ? 'outcome' : 'event'); setField('outcomeType', outcome);
  setField('analysisApproach', approach); setField('effectMeasure', measure);
  setField('reMethod', 'REML'); setField('confLevel', '0.95'); sandbox.document.getElementById('useHKSJ').checked = false;
  try { run('runAnalysis()'); } catch (e) { /* display code may throw after APP.results is set */ }
  return { results: run('APP.results'), notes: run('__notes'), running: run('APP.analysisRunning') };
}
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bin = [], cont = [];
['A', 'B', 'C', 'D'].forEach((s, j) => {
  for (let i = 0; i < 40; i++) { bin.push({ study: s, treatment: i % 2, event: rnd() < (i % 2 ? 0.25 : 0.4) ? 1 : 0 });
    cont.push({ study: s, treatment: i % 2, outcome: 10 + j + (i % 2 ? 1.5 : 0) + 3 * (rnd() - 0.5) }); }
});
const refused = (o, re) => !o.results && o.running === false && o.notes.some(n => re.test(n[0]) && /warning|error/.test(n[1]));

// controls: the supported choices are fitted
check('control: two-stage binary OR is fitted', !!(analyse(bin, 'binary', 'OR', 'two-stage').results || {}).pooled);
check('control: two-stage continuous MD is fitted', !!(analyse(cont, 'continuous', 'MD', 'two-stage').results || {}).pooled);

// L01
{ const o = analyse(bin, 'binary', 'OR', 'both');
  check('L01: "Both approaches" is refused with a message, not run as two-stage only', refused(o, /two-stage/i), JSON.stringify(o.notes) + ' results=' + !!o.results); }

if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
