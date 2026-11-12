'use strict';
// Q-profile and test-based I^2 / tau^2 confidence intervals, Shapiro-Wilk, and the fallback jStat.normal
// with sd = 0, in the shipped page (ipd-meta-pro.html), run in Node with the page's own scripts:
//   node dev/tests/heterogeneity_sw_normal.test.cjs [path/to/ipd-meta-pro.html]
// Reference values: heterogeneity_sw_normal_reference.R (R 4.6.0; metafor 5.2.1 confint(rma(..., "REML"))
// with uniroot tol 1e-13; meta 8.5.0 meta:::isquared; stats shapiro.test, qnorm, pnorm)
//   -> heterogeneity_sw_normal_reference.json  (input data of the nine example sets: studies_examples.json).
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'heterogeneity_sw_normal_reference.json'), 'utf8'),
  (k, v) => v === 'Inf' ? Infinity : v === '-Inf' ? -Infinity : v === 'NaN' ? NaN : v === 'NA' ? null : v);
const { run } = loadPage(pageFile);
let failed = 0, passed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}
const J = v => JSON.stringify(v);
const val = e => { try { return JSON.parse(run('JSON.stringify((function(){ const r = ' + e + '; return r; })(), (k, v) => typeof v === "number" && !Number.isFinite(v) ? String(v) : v)'),
  (k, v) => v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v === 'NaN' ? NaN : v); }
  catch (err) { return { THROW: err.message }; } };
// relative tolerance; an exact 0 / infinity / NaN / null in R must be exactly that on the page
const close = (a, b, tol) => (b === null) ? a === null :
  Number.isNaN(b) ? Number.isNaN(a) :
  (b === 0 || !Number.isFinite(b)) ? a === b :
  typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);

// 1. Q-profile (metafor confint): tau^2 bounds and I^2 bounds. Bisection on the generalized Q to full
//    precision against R roots at tol 1e-13: 1e-9 relative.
for (const r of REF.qprofile) {
  const e = 'I2ConfidenceIntervals.qProfile(' + r.Q + ',' + (r.yi.length - 1) + ',' + r.tau2 + ',' + J(r.vi) + ',0.05,' + J(r.yi) + ')';
  const a = val(e) || {};
  for (const [pk, rk] of [['tau2_lower', 'tau2_lb'], ['tau2_upper', 'tau2_ub'], ['lower', 'I2_lb'], ['upper', 'I2_ub']])
    check('Q-profile ' + r.name + ' ' + pk, close(a[pk], r[rk], 1e-9), 'page ' + a[pk] + ' R ' + r[rk]);
}
// 2. Test-based I^2 CI (Higgins & Thompson 2002) as meta: calculateI2WithCI(Q, k) and
//    I2ConfidenceIntervals.testBased(Q, df), in percent; not defined (NA in meta) -> null.
for (const r of REF.ht) {
  const a = val('calculateI2WithCI(' + r.Q + ',' + r.k + ')') || {};
  check('calculateI2WithCI Q=' + r.Q + ' k=' + r.k,
    close(a.I2, r.I2, 1e-13) && close(a.I2Lower, r.lower, 1e-12) && close(a.I2Upper, r.upper, 1e-12),
    'page ' + [a.I2, a.I2Lower, a.I2Upper].join(', ') + ' R ' + [r.I2, r.lower, r.upper].join(', '));
  const b = val('I2ConfidenceIntervals.testBased(' + r.Q + ',' + (r.k - 1) + ')') || {};
  check('I2ConfidenceIntervals.testBased Q=' + r.Q + ' k=' + r.k,
    close(b.lower, r.lower, 1e-12) && close(b.upper, r.upper, 1e-12), 'page ' + b.lower + ', ' + b.upper + ' R ' + r.lower + ', ' + r.upper);
}
// 3. Shapiro-Wilk (AS R94, as R's swilk.c): W 1e-12 relative, p 1e-9 relative; input in any order.
for (const r of REF.shapiro) {
  const a = val('calculateShapiroWilk(' + J(r.x) + ')') || {};
  check('Shapiro-Wilk ' + r.name + ' (n=' + r.x.length + ')', close(a.W, r.W, 1e-12) && close(a.pValue, r.p, 1e-9),
    'page W ' + a.W + ' p ' + a.pValue + ' R W ' + r.W + ' p ' + r.p);
}
{ // all values identical: R refuses ("all 'x' values are identical"); the page returns no statistic
  const a = val('calculateShapiroWilk([2, 2, 2, 2])') || {};
  check('Shapiro-Wilk refuses identical values', a.W === null && a.pValue === null, 'page ' + J(a));
}
// 4. fallback jStat.normal with sd = 0 or sd < 0 (R: qnorm(p, m, 0) = m inside (0, 1); pnorm step at m; NaN for sd < 0)
for (const r of REF.qnorm_sd) {
  const a = val('jStat.normal.inv(' + r.p + ',' + r.mean + ',' + r.sd + ')');
  check('jStat.normal.inv(' + r.p + ', ' + r.mean + ', ' + r.sd + ')', close(a, r.q, 1e-15), 'page ' + a + ' R ' + r.q);
}
for (const r of REF.pnorm_sd) {
  const a = val('jStat.normal.cdf(' + r.x + ',' + r.mean + ',' + r.sd + ')');
  check('jStat.normal.cdf(' + r.x + ', ' + r.mean + ', ' + r.sd + ')', close(a, r.p, 1e-15), 'page ' + a + ' R ' + r.p);
}
{ // the defaults are still mean 0, sd 1
  const a = val('[jStat.normal.inv(0.975), jStat.normal.cdf(1.959963984540054)]');
  check('jStat.normal defaults mean 0, sd 1', Math.abs(a[0] - 1.959963984540054) < 1e-15 && Math.abs(a[1] - 0.975) < 1e-7, 'page ' + J(a));
}
console.log((failed ? 'FAILED ' : 'ALL PASSED ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
