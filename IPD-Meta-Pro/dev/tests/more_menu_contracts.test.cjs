'use strict';
// Found by the modal sweep (lane ipdmodal: every onclick handler and every control it opens, four shipped examples,
// k = 1, 2 and all studies, shown text searched for NaN / undefined / Infinity / [object Object]).
// 1. Contract drift: eight More-menu buttons read result fields their engine never returns, so each died with
//    "Cannot read properties of undefined (reading 'toFixed')" (or 'length' / 'toLocaleString'), shown as the error:
//      G-Estimation (ci_lower/ci_upper; engine: CI[2], SE)      IV Meta-Analysis (ivEstimate, fStatistic; engine: IVW{..})
//      Component NMA (components; engine: nComponents)          Design-by-Treatment (chiSquared, df, pValue; engine: globalTest)
//      Multiple Imputation MA (pooledEffect...; engine: {message} or pooledEstimate, varianceComponents)
//      Optimal Info Size (ris, accrued; engine: metaAnalysisOIS) Trial Sequential (ris, accruedInfo, boundaryReached;
//      engine: requiredInformationSize, currentInformation, informationFraction, decision)   Value of Information (evpi,
//      evsi, optimalN; engine: EVPI, EVSI, ENBS). The IV engine needs Mendelian-randomization inputs (betaX, betaY,
//      seBetaY) that two-stage study results do not have: it is now refused instead of returning NaN.
//    These checks are of the DISPLAY CONTRACT (what is shown equals what the engine returned); the engines themselves
//    are not validated against R here.
// 2. networkResolveTreatmentVar wrote APP.config.treatmentVar = 'treatment_name' whenever treatment_name has 3+
//    values; runAnalysis calls it after the run, so on SGLT2 CVD every later two-arm surface split arms on drug names
//    (entropy balancing "Max weight: -Infinity", predictive patient selection NaN%, Power Monitor error).
// 3. PH Assumption screen with no time variable mapped (binary / continuous examples) printed "Correlation with
//    Time: NaN, P-value: NaN": it now refuses.
//   node dev/tests/more_menu_contracts.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const ref = require('./power_monitor_outcome_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };
const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]|Cannot read properties/;

// time-to-event IPD (4 studies) with a 3-level treatment_name, as the shipped examples carry
const rows = ref.survival.rows.map((r, i) => Object.assign({}, r, { treatment_name: r.treatment === 1 ? ['DrugA', 'DrugB'][i % 2] : 'Placebo', age: 50 + (i * 7) % 30, sex: i % 2 }));
sandbox.__rows = rows;
run(`APP.data = __rows; APP.currentData = __rows;
  document.getElementById('varStudy').value = 'study_id'; document.getElementById('varTreatment').value = 'treatment';
  document.getElementById('varTime').value = 'time_months'; document.getElementById('varEvent').value = 'event';
  document.getElementById('outcomeType').value = 'survival'; document.getElementById('analysisApproach').value = 'two-stage';
  window.__shown = []; showNotification = function (m, t) { __shown.push('NOTE ' + t + ': ' + m); };
  document.body.appendChild = function (m) { __shown.push('MODAL ' + String(m && m.innerHTML)); return m; };
  runAnalysis();`);
const k = run('APP.results && APP.results.studies ? APP.results.studies.length : 0');
check('setup: runAnalysis pooled 4 survival studies', k === 4, k);
check('runAnalysis does not leave APP.config.treatmentVar rewritten to the network column', run('APP.config.treatmentVar') === 'treatment', run('APP.config.treatmentVar'));
check('networkResolveTreatmentVar still returns the network column', run('networkResolveTreatmentVar()') === 'treatment_name' && run('APP.config.treatmentVar') === 'treatment', run('APP.config.treatmentVar'));

const fire = (code) => { run('__shown.length = 0'); try { run(code); } catch (e) { return ['THREW ' + e]; } return run('__shown.slice()'); };
const ok = (out) => out.length > 0 && !out.some(s => BAD.test(s));
const has = (out, s) => out.some(x => x.includes(s));
{
  const r = run(`runGEstimation(APP.data, APP.config.eventVar, APP.config.treatmentVar, ['age', 'sex'])`);
  const out = fire('runGEstimationAnalysis()');
  // its SE is a bootstrap (Math.random), so only the point estimate is compared; the CI must be two finite numbers
  check('G-Estimation shows the engine estimate and a finite CI', ok(out) && has(out, '(ψ):</strong> ' + r.psi.toFixed(4)) && out.some(x => /95% CI:<\/strong> -?\d+\.\d{4} to -?\d+\.\d{4} \(SE \d+\.\d{4}\)/.test(x)), out);
}
{
  const out = fire('runIVMAAnalysis()');
  check('IV meta-analysis on two-stage results (no betaX/betaY) is refused with a reason', ok(out) && has(out, 'betaX') && !has(out, 'MODAL'), out);
}
{
  const out = fire('runComponentNMAAnalysis()');
  const n = run('runComponentNMA(APP.data).nComponents');
  check('Component NMA reports the engine component count (' + n + ') or says none were found', ok(out) && (n ? has(out, n + ' components') : has(out, 'no treatment components')), out);
}
{
  const g = run('runDesignByTreatmentInteraction(APP.data).globalTest');
  const out = fire('runDesignByTreatment()');
  check('Design-by-treatment shows the engine global test', ok(out) && has(out, g.df > 0 ? g.Q.toFixed(2) : 'not estimable'), out + ' | ' + JSON.stringify(g));
}
{
  const out = fire('runMIMA()');
  check('Multiple imputation MA with nothing missing says so', ok(out) && has(out, 'No missing data detected'), out);
}
{
  const r = run('calculateOptimalInformationSize(0.05, 0.20, 0.3, APP.results.pooled.tau2 ?? 0.1, APP.results.studies.length)');
  const out = fire('runOIS()');
  check('Optimal information size shows the engine OIS and the accrued participants', ok(out) && has(out, r.metaAnalysisOIS.toFixed(0) + ' participants') && has(out, rows.length + ' participants'), out);
}
{
  const r = run('runSequentialMetaAnalysis(APP.results.studies, 0.05, 0.20, 0.3)');
  const out = fire('runTSA()');
  check('Trial sequential analysis shows the engine RIS, information and decision', ok(out) && has(out, r.requiredInformationSize.toFixed(0)) && has(out, r.decision), out);
}
{
  const r = run('calculateValueOfInformation(APP.results, 0.5, 1000000, 10)');
  const out = fire('runVOI()');
  check('Value of information shows the engine EVPI and EVSI', ok(out) && has(out, r.EVPI.toLocaleString()) && has(out, r.EVSI.toLocaleString()), out);
}
{
  // binary data, no time variable: the PH screen must refuse
  const bin = ref.binary.rows.map(r => Object.assign({ age: 60, bmi: 28 }, r));
  sandbox.__bin = bin;
  run(`APP.data = __bin; APP.config.timeVar = ''; APP.config.eventVar = 'mace_event'; APP.config.outcomeType = 'binary';`);
  const out = fire('runPHAssumptionTest()');
  check('PH screen with no time variable refuses instead of printing NaN', ok(out) && !has(out, 'MODAL') && /time/i.test(out.join(' ')), out);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
