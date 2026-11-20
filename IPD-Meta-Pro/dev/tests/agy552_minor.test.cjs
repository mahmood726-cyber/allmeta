'use strict';
// Adjudication by execution of the agy review of PR #552 (MINOR findings 1-3; finding 4, test coverage, is answered
// in more_menu_contracts.test.cjs).
// 1. Power Monitor / Federated Analysis, continuous outcome, a study with one patient in an arm: ipdStudyEstimate
//    returns runAnalysis' run-continuity placeholder (effect 0, variance 1e6) and the per-study loop counted it as a
//    study, so k, df, Q, I2, tau2 and the power approximation included a study with no estimate. Such a study is now
//    left out of those two surfaces (runAnalysis, and so the P60 numbers, is unchanged).
// 2. ipdFormAnalysisConfig: an explicitly empty form selection (e.g. no time variable) fell back to the stale
//    APP.config value from an earlier Run Analysis. A form control that exists is now authoritative for variables.
// 3. MIMA / TSA / OIS / VOI displays concatenated the unit outside the "not estimable" text ("not estimable%",
//    "$not estimable"). The unit is now part of the formatted number.
//   node dev/tests/agy552_minor.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 300) + ']')); };

{ // 1
  const rows = [];
  const add = (s, t, ys) => ys.forEach(y => rows.push({ study_id: s, treatment: t, y: y }));
  add('A', 1, [5, 6, 7, 8]); add('A', 0, [4, 5, 5, 6]);
  add('B', 1, [9, 7, 8, 10]); add('B', 0, [5, 6, 4, 7]);
  add('C', 1, [6]); add('C', 0, [3, 4, 5, 6, 7, 5, 4, 6, 5, 4]); // one treated patient: no variance
  sandbox.__rows = rows; sandbox.__cfg = { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'y', outcomeType: 'continuous' };
  const pm = run('PowerMonitor.calculateCurrentPower(__rows, __cfg)');
  check('1 Power Monitor: a continuous study with one patient in an arm is not counted (k = 2)', pm.currentStudies === 2, JSON.stringify({ k: pm.currentStudies, I2: pm.I2 }));
  const fed = run('FederatedMetaAnalysis.runFederatedAnalysis(__rows, __cfg)');
  check('1 Federated: that study is not a site (2 sites)', fed.siteContributions.length === 2 && !fed.siteContributions.some(s => s.siteId === 'C'), JSON.stringify(fed.siteContributions.map(s => [s.siteId, s.effect, s.se])));
}
{ // 2
  run(`APP.config.timeVar = 'time_months'; APP.config.eventVar = 'event'; document.getElementById('varTime').value = ''; document.getElementById('varEvent').value = 'y';`);
  const c = run('ipdFormAnalysisConfig()');
  check('2 an empty time-variable selection on the form is not replaced by a stale APP.config.timeVar', !c.timeVar, JSON.stringify(c.timeVar));
  check('2 a selected variable is still read from the form', c.eventVar === 'y', JSON.stringify(c.eventVar));
}
{ // 3
  run(`window.__m = []; document.body.appendChild = function (m) { __m.push(String(m.innerHTML)); return m; }; showNotification = function () {};
    APP.results = { studies: [{ study: 'A', effect: 0.1, se: 0.2, n: 50 }, { study: 'B', effect: 0.2, se: 0.3, n: 60 }], pooled: { pooled: 0.13, se: 0.17, tau2: 0, pValue: 0.4 } };
    runMultipleImputationMA = function () { return { pooledEstimate: 0.1, varianceComponents: { within: 0.01, between: 0, total: 0.01 }, fractionMissingInfo: NaN, nImputations: 5 }; };
    runSequentialMetaAnalysis = function () { return { requiredInformationSize: 0, currentInformation: 10, informationFraction: Infinity, currentZScore: 1, monitoringBoundary: 2, boundaries: [] }; };
    calculateOptimalInformationSize = function () { return { ris: 0, accrued: 110 }; };
    calculateValueOfInformation = function () { return { EVPI: NaN, EVSI: undefined, ENBS: Infinity, recommendFurtherResearch: false }; };`);
  for (const f of ['runMIMA', 'runTSA', 'runOIS', 'runVOI']) {
    run('__m.length = 0'); let err = null;
    try { run(f + '()'); } catch (e) { err = String(e); }
    const html = run('__m.join("")');
    check('3 ' + f + ': no unit glued to "not estimable"', !err && html.length > 0 && !/not estimable%|\$not estimable/.test(html) && /not estimable/.test(html), err || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
  }
}
{ // 4b, found while adding finding 4's success-path tests: the page's jStat fallback had no normal.sample, so
  // Multiple Imputation MA with a missing estimate (and four other callers) threw "jStat.normal.sample is not a function"
  const r = run(`(function () { var n = 20000, s = 0, s2 = 0, x; for (var i = 0; i < n; i++) { x = jStat.normal.sample(2, 3); s += x; s2 += x * x; } var m = s / n; return { m: m, sd: Math.sqrt(s2 / n - m * m), finite: Number.isFinite(m) }; })()`);
  // 3-sigma bounds: SE(mean) = 3 / sqrt(n) = 0.0212; SE(sd) ~ 3 / sqrt(2n) = 0.015
  check('4b jStat.normal.sample(2, 3): mean and SD within 3 SE of 2 and 3 (20000 draws)', r.finite && Math.abs(r.m - 2) < 3 * 0.0212 && Math.abs(r.sd - 3) < 3 * 0.015, JSON.stringify(r));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
