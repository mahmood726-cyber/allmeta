'use strict';
// More > Power Monitor must analyse the outcome the page is configured for, on the scale runAnalysis uses.
// Root cause (ea3ef058): PowerMonitor.calculateCurrentPower took the arithmetic mean of the mapped outcome column in
// each arm and pooled the difference, whatever the outcome type. On time-to-event data the mapped column is the 0/1
// event indicator, so "Current Effect" was a difference in crude event proportions (not a log hazard ratio), and on
// binary data a risk difference (runAnalysis pools log odds ratios). The per-study estimates now come from the same
// code runAnalysis uses (ipdStudyEstimate: Cox log HR with Efron ties, log OR with 0.5 only for a zero cell, mean
// difference), and an outcome type it does not support is refused with a message instead of a number.
// Reference: power_monitor_outcome_reference.R (R 4.6.0, metafor 5.2-1, survival 3.8-6): per-study estimates,
// fixed-effect pool and SE, Q-based I2, DerSimonian-Laird tau2, and the page's power approximation in R.
//   node dev/tests/power_monitor_outcome.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const ref = require('./power_monitor_outcome_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const cfgs = {
  survival: { studyVar: 'study_id', treatmentVar: 'treatment', timeVar: 'time_months', eventVar: 'event', outcomeType: 'survival', measure: /log hazard ratio/i, tol: 1e-6 },
  binary: { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'mace_event', outcomeType: 'binary', measure: /log odds ratio/i, tol: 1e-10 },
  continuous: { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'hamd_change', outcomeType: 'continuous', measure: /mean difference/i, tol: 1e-10 }
};
for (const type of Object.keys(cfgs)) {
  const c = cfgs[type], R = ref[type].ref;
  sandbox.__rows = ref[type].rows; sandbox.__cfg = Object.assign({}, c, { measure: undefined, tol: undefined });
  let s;
  try { s = run('PowerMonitor.calculateCurrentPower(__rows, __cfg)'); } catch (e) { s = { error: String(e) }; }
  const show = JSON.stringify(s);
  check(type + ': 4 studies', s.currentStudies === 4, show);
  check(type + ': pooled estimate on the runAnalysis scale = R fixed-effect pool (' + R.estimate.toFixed(6) + ')', near(s.pooledEffect, R.estimate, c.tol), 'page ' + s.pooledEffect);
  check(type + ': pooled SE = R (' + R.se.toFixed(6) + ')', near(s.pooledSE, R.se, c.tol), 'page ' + s.pooledSE);
  check(type + ': Q-based I2 = R (' + R.I2.toFixed(4) + ')', near(s.I2, R.I2, 1e-6), 'page ' + s.I2);
  check(type + ': DL tau2 = R (' + R.tau2.toFixed(6) + ')', near(s.tau2, R.tau2, 1e-6), 'page ' + s.tau2);
  check(type + ': power approximation = R (' + R.power.toFixed(6) + ')', near(s.currentPower, R.power, 1e-6), 'page ' + s.currentPower);
  check(type + ': the effect is labelled with its measure', c.measure.test(String(s.effectMeasure || '')), 'label ' + s.effectMeasure);
}
{
  sandbox.__rows = ref.continuous.rows;
  sandbox.__cfg = { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'hamd_change', outcomeType: 'ordinal' };
  const s = run('PowerMonitor.calculateCurrentPower(__rows, __cfg)');
  check('an outcome type the monitor does not support is refused with a message, not a number', s.refused === true && /ordinal/.test(String(s.message)) && s.pooledEffect === undefined, JSON.stringify(s));
  sandbox.__rows = ref.survival.rows;
  sandbox.__cfg = { studyVar: 'study_id', treatmentVar: 'treatment', timeVar: '', eventVar: 'event', outcomeType: 'survival' };
  const s2 = run('PowerMonitor.calculateCurrentPower(__rows, __cfg)');
  check('time-to-event with no time variable mapped is refused (it used to pool the 0/1 event column)', s2.refused === true && /time/i.test(String(s2.message)), JSON.stringify(s2));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
