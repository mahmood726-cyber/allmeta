'use strict';
// More > Federated Analysis must analyse the outcome the page is configured for, on the scale runAnalysis uses.
// Root cause (e17f9f6f): FederatedMetaAnalysis.computeLocalStatistics took the arithmetic mean of the mapped outcome
// column in each arm and pooled the difference, whatever the outcome type (the defect PR #552 fixed in the Power
// Monitor). On time-to-event data the mapped column is the 0/1 event indicator, so "Pooled Result" was a difference
// in crude event proportions (Lung Cancer (IO) example: -0.089, where runAnalysis' log HR is -0.226), and on binary
// data a risk difference (SGLT2 CVD: -0.034, log OR -0.295). Each site's estimate now comes from the code runAnalysis
// uses (ipdConfiguredStudyEstimates -> ipdStudyEstimate: Cox log HR with Efron ties, log OR with 0.5 only for a zero
// cell, mean difference), the result carries its measure, and an unsupported outcome type is refused.
// Reference: federated_outcome_reference.R (R 4.6.0, metafor 5.2-1, survival 3.8-6) on the seeded rows of
// power_monitor_outcome_reference.json: per-site yi/sei, FE and DerSimonian-Laird pools (estimate, SE, CI, p), Q, tau2.
//   node dev/tests/federated_outcome.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const rows = require('./power_monitor_outcome_reference.json');
const ref = require('./federated_outcome_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const cfgs = {
  survival: { cfg: { studyVar: 'study_id', treatmentVar: 'treatment', timeVar: 'time_months', eventVar: 'event', outcomeType: 'survival' }, measure: /log hazard ratio/i, tol: 1e-6 },
  binary: { cfg: { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'mace_event', outcomeType: 'binary' }, measure: /log odds ratio/i, tol: 1e-10 },
  continuous: { cfg: { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'hamd_change', outcomeType: 'continuous' }, measure: /mean difference/i, tol: 1e-10 }
};
for (const type of Object.keys(cfgs)) {
  const c = cfgs[type], R = ref[type];
  sandbox.__rows = rows[type].rows; sandbox.__cfg = c.cfg;
  let r;
  try { r = run('FederatedMetaAnalysis.runFederatedAnalysis(__rows, __cfg)'); } catch (e) { r = { error: String(e) }; }
  const sites = r.siteContributions || [], agg = r.aggregatedResult || {}, fe = agg.fixedEffect || {}, re = agg.randomEffect || {}, het = agg.heterogeneity || {};
  check(type + ': 4 sites', sites.length === 4, JSON.stringify(r).slice(0, 300));
  check(type + ': site estimates on the runAnalysis scale = R yi', sites.length === 4 && sites.every((s, i) => near(s.effect, R.yi[i], c.tol)), JSON.stringify(sites.map(s => s.effect)) + ' vs ' + JSON.stringify(R.yi));
  check(type + ': site SEs = R sei', sites.length === 4 && sites.every((s, i) => near(s.se, R.sei[i], c.tol)), JSON.stringify(sites.map(s => s.se)) + ' vs ' + JSON.stringify(R.sei));
  check(type + ': fixed-effect pool = R (' + R.fe.estimate.toFixed(6) + ', SE ' + R.fe.se.toFixed(6) + ')', near(fe.effect, R.fe.estimate, c.tol) && near(fe.se, R.fe.se, c.tol), fe.effect + ' / ' + fe.se);
  check(type + ': DL random-effects pool = R (' + R.re.estimate.toFixed(6) + ', SE ' + R.re.se.toFixed(6) + ')', near(re.effect, R.re.estimate, c.tol) && near(re.se, R.re.se, c.tol), re.effect + ' / ' + re.se);
  check(type + ': random-effects 95% CI and p = R', near(re.ci_lower, R.re.ci_lb, c.tol) && near(re.ci_upper, R.re.ci_ub, c.tol) && near(re.pValue, R.re.pval, 1e-6), [re.ci_lower, re.ci_upper, re.pValue].join(' '));
  check(type + ': Q and DL tau2 = R', near(het.Q, R.Q, 1e-6) && near(het.tau2, R.tau2, 1e-6), het.Q + ' / ' + het.tau2);
  check(type + ': the result is labelled with its measure', c.measure.test(String(r.effectMeasure || '')) && r.outcomeType === type, 'label ' + r.effectMeasure);
}
{
  sandbox.__rows = rows.continuous.rows;
  sandbox.__cfg = { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'hamd_change', outcomeType: 'ordinal' };
  let msg = null; try { run('FederatedMetaAnalysis.runFederatedAnalysis(__rows, __cfg)'); } catch (e) { msg = String(e && e.message || e); }
  check('an outcome type Federated Analysis does not support is refused with a message, not a number', msg !== null && /ordinal/.test(msg), String(msg));
  sandbox.__rows = rows.survival.rows;
  sandbox.__cfg = { studyVar: 'study_id', treatmentVar: 'treatment', timeVar: '', eventVar: 'event', outcomeType: 'survival' };
  let msg2 = null; try { run('FederatedMetaAnalysis.runFederatedAnalysis(__rows, __cfg)'); } catch (e) { msg2 = String(e && e.message || e); }
  check('time-to-event with no time variable mapped is refused (it used to pool the 0/1 event column)', msg2 !== null && /time/i.test(msg2), String(msg2));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
