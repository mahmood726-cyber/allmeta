'use strict';
// Every output of the page labelled "Q-profile" against metafor confint(rma(yi, vi, method = "REML"))$random:
//   1. I2ConfidenceIntervals.qProfile        (heterogeneity report, "Q-profile (Viechtbauer 2007)" I^2 row)
//   2. computeQProfile                       (the "Q-Profile Confidence Intervals for tau^2" panel), via its
//      numeric core qProfilePanelValues and the rendered table
//   3. BeyondR40._qProfileTau2CI / qProfileTau2   ("5. Q-Profile tau^2 CI", also the predictive-interval add-on)
//   node dev/tests/qprofile_all.test.cjs [path/to/ipd-meta-pro.html]
// Requirement (Viechtbauer 2007, as metafor): tau^2 bounds are the roots of the generalized Q statistic
//   Q(tau^2) = sum_i (y_i - mu(tau^2))^2 / (v_i + tau^2),  mu(tau^2) = sum y_i/(v_i+tau^2) / sum 1/(v_i+tau^2)
// at chi2_{1-alpha/2, k-1} (lower) and chi2_{alpha/2, k-1} (upper) on metafor's search range
// [0, max(100, 10 tau^2)] (0 where Q(0) is already below the quantile); I^2 = 100 tau^2 / (tau^2 + s^2) with
// metafor's s^2 = (k - 1) sum w / ((sum w)^2 - sum w^2), w = 1/v.
// Reference: qprofile_all_reference.R (R 4.6.0, metafor 5.2.1, uniroot tol 1e-12) -> qprofile_all_reference.json.
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'qprofile_all_reference.json'), 'utf8'));
const { run, document } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); };
const J = JSON.stringify;
// exact 0 in R must be exactly 0 on the page; otherwise 1e-9 relative (bisection to full precision vs uniroot 1e-12)
const close = (a, b) => b === 0 ? a === 0 : (typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= 1e-9 * Math.abs(b));
const val = e => { try { return JSON.parse(run('JSON.stringify(' + e + ')')); } catch (err) { return { THROW: err.message }; } };

for (const c of REF) {
  const want = [c.tau2_lb, c.tau2_ub, c.I2_lb, c.I2_ub];
  const show = g => 'page tau2 [' + g[0] + ', ' + g[1] + '] I2 [' + g[2] + ', ' + g[3] + ']  metafor tau2 [' + want[0] + ', ' + want[1] + '] I2 [' + want[2] + ', ' + want[3] + ']';

  // 1. heterogeneity report
  const a = val('I2ConfidenceIntervals.qProfile(' + c.Q + ',' + c.df + ',' + c.tau2 + ',' + J(c.vi) + ',0.05,' + J(c.yi) + ')') || {};
  const ga = [a.tau2_lower, a.tau2_upper, a.lower, a.upper];
  check('I2ConfidenceIntervals.qProfile ' + c.name, ga.every((g, i) => close(g, want[i])), show(ga));

  // 2. computeQProfile panel: numeric core, then the table it renders (4 dp tau^2, 1 dp I^2 as on the page)
  const b = val('qProfilePanelValues(' + J(c.yi) + ',' + J(c.vi) + ',' + c.tau2 + ',0.05)') || {};
  const gb = [b.tau2Lower, b.tau2Upper, b.i2Lower, b.i2Upper];
  check('computeQProfile (qProfilePanelValues) ' + c.name, gb.every((g, i) => close(g, want[i])), show(gb));
  check('computeQProfile I2 point and s^2 ' + c.name, close(b.i2Point, c.I2) && close(b.typicalVar, c.s2),
    'page I2 ' + b.i2Point + ' s2 ' + b.typicalVar + '  metafor I2 ' + c.I2 + ' s2 ' + c.s2);
  run('APP.results = { studies: ' + J(c.yi.map((y, i) => ({ effect: y, variance: c.vi[i] }))) + ', pooled: { tau2: ' + c.tau2 + ' } }; APP.config.confLevel = 0.95; computeQProfile();');
  const html = String(document.getElementById('qProfileContent').innerHTML || '');
  const cell = '[' + c.tau2_lb.toFixed(4) + ', ' + c.tau2_ub.toFixed(4) + ']';
  const cellI2 = '[' + c.I2_lb.toFixed(1) + '%, ' + c.I2_ub.toFixed(1) + '%]';
  check('computeQProfile rendered panel ' + c.name, html.includes(cell) && html.includes(cellI2) && html.includes(c.I2.toFixed(1) + '%'),
    'want ' + cell + ' ' + cellI2 + ' I2 ' + c.I2.toFixed(1) + '%; panel has ' + (html.match(/\[[^\]]*\]/g) || []).slice(0, 3).join(' '));

  // 3. Beyond-R feature 5 (search limit max(100, 10 tau^2) from the tau^2 it is given)
  const studies = J(c.yi.map((y, i) => ({ yi: y, vi: c.vi[i] })));
  const d = val('BeyondR40._qProfileTau2CI(' + studies + ',' + c.tau2 + ',0.05)') || {};
  check('BeyondR40._qProfileTau2CI ' + c.name, close(d.lower, c.tau2_lb) && close(d.upper, c.tau2_ub),
    'page [' + d.lower + ', ' + d.upper + ']  metafor [' + c.tau2_lb + ', ' + c.tau2_ub + ']');
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
