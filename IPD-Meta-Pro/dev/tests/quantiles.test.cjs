'use strict';
// Normal, chi-square and (Stats.) Student t quantiles in the shipped page (ipd-meta-pro.html), run in
// Node with the page's own scripts:   node dev/tests/quantiles.test.cjs [path/to/ipd-meta-pro.html]
// The page never loads the real jStat, so jStat.normal.inv is the fallback's own approximation and
// jStat.chisquare.inv is MathUtils.chi2Quantile. Stats.tQuantile is the separate copy on the P60 path;
// I2ConfidenceIntervals, ContourEnhancedFunnel, EnhancedPredictionInterval and FailSafeN carry their own
// normQuantile (and I2ConfidenceIntervals its own chi2Quantile).
// Reference values: quantiles_reference.R (R 4.6.0 qnorm / qchisq) -> quantiles_reference.json, and for
// qt the grid of student_t_beta_reference.R (with the 40-digit mpmath roots next to the median).
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const rd = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'),
  (k, v) => v === 'Inf' ? Infinity : (v === '-Inf' ? -Infinity : v));   // jsonlite writes Inf as "Inf"
const REF = rd('quantiles_reference.json');
const QT = rd('student_t_beta_reference.json').qt;
const MP = rd('student_t_beta_reference_mp.json').qt_near_median;
const { run } = loadPage(pageFile);
let failed = 0, passed = 0;
const fails = [];
function check(name, ok, detail) { if (ok) passed++; else { failed++; fails.push(name + (detail ? '  [' + detail + ']' : '')); } }
const lit = v => v === Infinity ? 'Infinity' : (v === -Infinity ? '-Infinity' : String(v));
const val = e => { try { return run(e); } catch (err) { return 'THROW ' + err.message; } };   // an exception is never a number
// relative tolerance only (so a tail cannot pass by being returned as 0); infinities and 0 exactly
const closeRel = tol => (a, b) => (b === Infinity || b === -Infinity || b === 0) ? a === b :
  Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);
const groups = [
  // AS 241 is R's own algorithm: agreement to a few ulp
  ['MathUtils.normQuantile', REF.qnorm, g => 'MathUtils.normQuantile(' + lit(g.p) + ')', closeRel(1e-14)],
  ['jStat.normal.inv', REF.qnorm, g => 'jStat.normal.inv(' + lit(g.p) + ', 0, 1)', closeRel(1e-14)],
  ['jStat.normal.inv (mean, sd)', REF.qnorm_ms, g => 'jStat.normal.inv(' + lit(g.p) + ',' + g.mean + ',' + g.sd + ')', closeRel(1e-14)],
  // R qgamma iterates to ~1e-15 relative; the page solves on the AlmTail regularized gamma (max measured 5.9e-14)
  ['MathUtils.chi2Quantile', REF.qchisq, g => 'MathUtils.chi2Quantile(' + lit(g.p) + ',' + lit(g.df) + ')', closeRel(1e-12)],
  ['jStat.chisquare.inv', REF.qchisq, g => 'jStat.chisquare.inv(' + lit(g.p) + ',' + lit(g.df) + ')', closeRel(1e-12)],
  ['MathUtils.chi2Quantile, df 1e4 .. 1e5', REF.qchisq_large, g => 'MathUtils.chi2Quantile(' + lit(g.p) + ',' + lit(g.df) + ')', closeRel(1e-12)],
  // the page's other copies of the same two functions (same defect before the fix)
  ...['I2ConfidenceIntervals', 'ContourEnhancedFunnel', 'EnhancedPredictionInterval', 'FailSafeN'].map(o =>
    [o + '.normQuantile', REF.qnorm, g => o + '.normQuantile(' + lit(g.p) + ')', closeRel(1e-14)]),
  ['I2ConfidenceIntervals.chi2Quantile', REF.qchisq, g => 'I2ConfidenceIntervals.chi2Quantile(' + lit(g.p) + ',' + lit(g.df) + ')', closeRel(1e-12)]
];
for (const [label, grid, expr, ok] of groups) {
  const f0 = failed;
  for (const g of grid) { const e = expr(g); const a = val(e); check(e, ok(a, g.q), 'page ' + a + ' R ' + g.q); }
  console.log((failed === f0 ? 'PASS ' : 'FAIL ') + label + ': ' + (grid.length - (failed - f0)) + '/' + grid.length + ' grid points');
}
// Stats.tQuantile against the qt grid, same rules as student_t_beta.test.cjs: 1e-10 relative (+1e-13
// where |R| >= 1e-3), df = 1e6 at 1e-8 relative, mpmath roots next to the median, exact median 0.
{
  const mpq = g => { const h = MP.find(r => r.p === g.p && r.df === g.df); return h ? h.q : undefined; };
  const want = g => g.p === 0.5 ? 0 : (mpq(g) !== undefined ? mpq(g) : g.q);
  const close = (a, b) => (b === Infinity || b === -Infinity) ? a === b :
    Number.isFinite(a) && Math.abs(a - b) <= (Math.abs(b) >= 1e-3 ? 1e-13 : 0) + 1e-10 * Math.abs(b);
  const f0 = failed;
  for (const g of QT) {
    const e = 'Stats.tQuantile(' + lit(g.p) + ',' + lit(g.df) + ')'; const a = val(e); const w = want(g);
    check(e, g.df === 1e6 ? Number.isFinite(a) && Math.abs(a - w) <= 1e-8 * Math.abs(w) : close(a, w), 'page ' + a + ' R ' + w);
  }
  console.log((failed === f0 ? 'PASS ' : 'FAIL ') + 'Stats.tQuantile: ' + (QT.length - (failed - f0)) + '/' + QT.length + ' grid points');
}
// round trip through the page's own upper tail (consistency only: the same regularized gamma is used to solve): P(X > chi2Quantile(p)) = 1 - p where 0 < q < Infinity
{
  const f0 = failed; let n = 0;
  for (const g of REF.qchisq) {
    if (!(g.q > 0 && g.q < Infinity) || g.p > 0.999) continue;   // 1 - p itself is inexact above 0.999
    n++;
    const e = 'AlmTail.pchisqUpper(MathUtils.chi2Quantile(' + lit(g.p) + ',' + lit(g.df) + '),' + lit(g.df) + ')';
    const a = val(e); check(e, Math.abs(a - (1 - g.p)) <= 1e-12 * Math.max(g.p, 1 - g.p), 'got ' + a);
  }
  console.log((failed === f0 ? 'PASS ' : 'FAIL ') + 'round trip pchisqUpper(chi2Quantile(p)) = 1 - p: ' + (n - (failed - f0)) + '/' + n);
}
const isNaNv = v => typeof v === 'number' && Number.isNaN(v);
const edges = [
  ['MathUtils.chi2Quantile(0.5, 0) === 0 (R qchisq)', val('MathUtils.chi2Quantile(0.5, 0)') === 0],
  ['MathUtils.chi2Quantile(0.5, -1) is NaN (R qchisq)', isNaNv(val('MathUtils.chi2Quantile(0.5, -1)'))],
  ['MathUtils.chi2Quantile(0, -1) === 0 and (1, -1) === Infinity (R qchisq: p boundaries first)', val('MathUtils.chi2Quantile(0, -1)') === 0 && val('MathUtils.chi2Quantile(1, -1)') === Infinity],
  ['MathUtils.chi2Quantile fails closed (NaN) above df = 1e5, where the regularized gamma does not converge: df 1.5e5, 1e6, 1e308',
    isNaNv(val('MathUtils.chi2Quantile(0.5, 1.5e5)')) && isNaNv(val('MathUtils.chi2Quantile(0.49, 1e6)')) && isNaNv(val('MathUtils.chi2Quantile(0.5, 1e308)'))],
  ['MathUtils.chi2Quantile(0.5, Number.MIN_VALUE) is not a finite-looking wrong number', !(val('MathUtils.chi2Quantile(0.5, Number.MIN_VALUE)') > 0)],
  ['MathUtils.chi2Quantile(0.5, Infinity) === Infinity (R qchisq)', val('MathUtils.chi2Quantile(0.5, Infinity)') === Infinity],
  ['MathUtils.chi2Quantile(1.5, 3) and (NaN, 3) are NaN', isNaNv(val('MathUtils.chi2Quantile(1.5, 3)')) && isNaNv(val('MathUtils.chi2Quantile(NaN, 3)'))],
  ['MathUtils.normQuantile(NaN), (-0.1), (1.1) are NaN', isNaNv(val('MathUtils.normQuantile(NaN)')) && isNaNv(val('MathUtils.normQuantile(-0.1)')) && isNaNv(val('MathUtils.normQuantile(1.1)'))],
  ['jStat.normal.inv(NaN) is NaN', isNaNv(val('jStat.normal.inv(NaN, 0, 1)'))],
  ['Stats.tQuantile(0.975, 0) is NaN', isNaNv(val('Stats.tQuantile(0.975, 0)'))],
  ['chi-square interval for tau2 is ordered: chi2Quantile(0.975, 4) > chi2Quantile(0.025, 4)', val('MathUtils.chi2Quantile(0.975, 4)') > val('MathUtils.chi2Quantile(0.025, 4)')],
  // I2ConfidenceIntervals.qProfile took its tau2 lower bound at the alpha/2 chi-square quantile; with the old reversed
  // chi2Quantile that came out ordered. The lower bound must solve Q(tau2) = chi2_{1 - alpha/2} and lie below the upper one.
  ['I2ConfidenceIntervals.qProfile is ordered (tau2 and I2 lower <= upper, lower > 0 when Q is large)', (() => {
    // (the Q-profile needs the study effects: the generalized Q is a function of them; IPD-More passes them here,
    //  Q = 69.64, metafor confint tau2 0.2200 .. 6.119 -- values checked in heterogeneity_sw_normal.test.cjs)
    const r = val('I2ConfidenceIntervals.qProfile(69.63723, 4, 0.7068, [0.04, 0.05, 0.1, 0.02, 0.08], 0.05, [0.9, -0.5, 0.3, 1.2, -0.8])');
    return r && r.tau2_lower > 0 && r.tau2_lower < r.tau2_upper && r.lower < r.upper; })()],
  ["page self-test 'normQuantile(0.975) ~ 1.96' holds", Math.abs(val('MathUtils.normQuantile(0.975)') - 1.96) < 0.001],
  ["page self-test 'normQuantile(0.5) = 0' holds", Math.abs(val('MathUtils.normQuantile(0.5)')) < 1e-10]
];
for (const [n, ok] of edges) { check(n, ok); console.log((ok ? 'PASS ' : 'FAIL ') + n); }
if (fails.length) { console.log('first failures:'); fails.slice(0, 15).forEach(s => console.log('  ' + s)); }
console.log((failed ? 'FAILED ' : 'ALL PASSED ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
