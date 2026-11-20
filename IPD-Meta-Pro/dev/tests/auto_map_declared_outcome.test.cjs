'use strict';
// Loading an example must keep the outcome the example defines when the post-load auto-mapper runs.
// Root cause (e17f9f6f): loadExampleData sets outcomeType (Depression CBT and NMA: Antidep = continuous, outcome
// hamd_change) and then schedules the first-run booster, which calls ipd80AutoMapVariables. That function always
// re-INFERS the outcome type from column names (ipd80InferOutcomeType): with no time column, any 0/1 column named
// like an outcome makes it "binary", and both depression examples carry a derived 0/1 "remission" column. So ~260 ms
// after loading, the form was switched to binary / remission and the booster ran the analysis on remission.
// The example now declares its outcome type for the data it loaded (APP.declaredOutcome, tied to the data
// fingerprint); the auto-mapper uses a declaration that matches the current data and infers only otherwise.
//   node dev/tests/auto_map_declared_outcome.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 300) + ']')); };
const seed = 'Math.random = (function () { let a = 60; return function () { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();';
// outcome type and outcome column each example defines (loadExampleData's own mapping)
const declared = {
  survival: ['survival', 'event'], binary: ['binary', 'mace_event'], continuous: ['continuous', 'hamd_change'],
  ovarian_survival: ['survival', 'event'], breast_endocrine: ['survival', 'event'], network_antidepressants: ['continuous', 'hamd_change'],
  statin_cvd: ['binary', 'mace_event'], hiv_survival: ['survival', 'event'], covid_treatments: ['binary', 'mortality_28d']
};
const keys = run('Object.keys(EXAMPLE_DATASETS)');
check('every example dataset is covered by this test', keys.length === Object.keys(declared).length && keys.every(k => declared[k]), JSON.stringify(keys));
for (const k of keys) {
  if (!declared[k]) continue;
  sandbox.__k = k;
  const r = run(`(function () { ${seed} loadExampleData(__k); var rep = ipd80AutoMapVariables({ silent: true }); return { type: rep.outcomeType, event: rep.mapped.varEvent, pass: rep.pass }; })()`);
  check(k + ': auto-mapping after load keeps the example\'s outcome (' + declared[k].join(' / ') + ')', r.type === declared[k][0] && r.event === declared[k][1] && r.pass === true, JSON.stringify(r));
}
{
  // other data with the same outcome columns (e.g. the user's own file): the auto-mapper still infers, as before
  const r = run(`(function () { ${seed} loadExampleData('continuous'); var rows = APP.data.map(function (d) { return Object.assign({ site: 1 }, d); }); APP.data = rows; var rep = ipd80AutoMapVariables({ silent: true }); return { type: rep.outcomeType, event: rep.mapped.varEvent }; })()`);
  check('a declaration does not carry over to different data (other rows): inference is used, as before', r.type === 'binary' && r.event === 'remission', JSON.stringify(r));
  const r2 = run(`(function () { ${seed} loadExampleData('continuous'); APP.data = APP.data.slice(0, 50); var rep = ipd80AutoMapVariables({ silent: true }); return { type: rep.outcomeType }; })()`);
  check('a declaration does not carry over after the loaded data changes (subset)', r2.type === 'binary', JSON.stringify(r2));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
