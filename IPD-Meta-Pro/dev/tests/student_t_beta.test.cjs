'use strict';
// Student t and regularized incomplete beta in the shipped page (ipd-meta-pro.html), run in Node with
// the page's own scripts:   node dev/tests/student_t_beta.test.cjs [path/to/ipd-meta-pro.html]
// The page never loads the real jStat; its fallback jStat.studentt.cdf / .inv are MathUtils.tCDF /
// MathUtils.tQuantile, built on MathUtils.betaInc. EnhancedPredictionInterval carried its own copy of
// the same three functions. Neither the fallback nor the page defines jStat.beta or jStat.centralF;
// the only F-distribution function in the page is AlmTail.pfUpper.
// Reference values: student_t_beta_reference.R (R 4.6.0) -> student_t_beta_reference.json.
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
// jsonlite writes R's Inf / -Inf as the strings "Inf" / "-Inf"
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'student_t_beta_reference.json'), 'utf8'),
  (k, v) => v === 'Inf' ? Infinity : (v === '-Inf' ? -Infinity : v));
const { run } = loadPage(pageFile);
let failed = 0, passed = 0;
const fails = [];
function check(name, ok, detail) { if (ok) passed++; else { failed++; fails.push(name + (detail ? '  [' + detail + ']' : '')); } }
// relative 1e-10; an absolute floor of 1e-13 only where |R| >= 1e-3, so a small tail probability
// cannot pass by being returned as 0. Infinite reference values must be matched exactly.
const close = (a, b) => (b === Infinity || b === -Infinity) ? a === b :
  Number.isFinite(a) && Math.abs(a - b) <= (Math.abs(b) >= 1e-3 ? 1e-13 : 0) + 1e-10 * Math.abs(b);
const show = (a, b) => 'page ' + a + ' R ' + b;
const lit = v => v === Infinity ? 'Infinity' : (v === -Infinity ? '-Infinity' : String(v));
const val = e => { try { return run(e); } catch (err) { return 'THROW ' + err.message; } };   // an exception is never a number

// R qt(0.5, 0.5) returns 2.6e-16 (rounding noise); the exact median is 0 and the page returns 0.
// Next to the median (p = 0.5 +- 1e-8) R qt is itself off by ~1e-9 relative; those points use the
// 40-digit mpmath roots in student_t_beta_reference_mp.json (see student_t_beta_reference_mp.py).
const MP = JSON.parse(fs.readFileSync(path.join(__dirname, 'student_t_beta_reference_mp.json'), 'utf8'),
  (k, v) => v === 'Inf' ? Infinity : v).qt_near_median;
const mpq = g => { const h = MP.find(r => r.p === g.p && r.df === g.df); return h ? h.q : undefined; };
const QT_WANT = g => g.p === 0.5 ? 0 : (mpq(g) !== undefined ? mpq(g) : g.q);
const groups = [
  ['MathUtils.betaInc', REF.pbeta, g => 'MathUtils.betaInc(' + lit(g.x) + ',' + lit(g.a) + ',' + lit(g.b) + ')', g => g.p],
  ['EnhancedPredictionInterval.betaInc', REF.pbeta, g => 'EnhancedPredictionInterval.betaInc(' + lit(g.x) + ',' + lit(g.a) + ',' + lit(g.b) + ')', g => g.p],
  ['jStat.studentt.cdf', REF.pt, g => 'jStat.studentt.cdf(' + lit(g.t) + ',' + lit(g.df) + ')', g => g.p],
  ['MathUtils.tCDF', REF.pt, g => 'MathUtils.tCDF(' + lit(g.t) + ',' + lit(g.df) + ')', g => g.p],
  ['EnhancedPredictionInterval.tCDF', REF.pt, g => 'EnhancedPredictionInterval.tCDF(' + lit(g.t) + ',' + lit(g.df) + ')', g => g.p],
  ['jStat.studentt.inv', REF.qt, g => 'jStat.studentt.inv(' + lit(g.p) + ',' + lit(g.df) + ')', QT_WANT],
  ['MathUtils.tQuantile', REF.qt, g => 'MathUtils.tQuantile(' + lit(g.p) + ',' + lit(g.df) + ')', QT_WANT],
  ['EnhancedPredictionInterval.tQuantile', REF.qt, g => 'EnhancedPredictionInterval.tQuantile(' + lit(g.p) + ',' + lit(g.df) + ')', QT_WANT],
  ['Stats.tQuantile (the separate P60-validated copy)', REF.qt, g => 'Stats.tQuantile(' + lit(g.p) + ',' + lit(g.df) + ')', QT_WANT, true],
  ['AlmTail.pfUpper', REF.pf, g => 'AlmTail.pfUpper(' + lit(g.f) + ',' + lit(g.df1) + ',' + lit(g.df2) + ')', g => g.pu]
];
// df = 1e6: log B(df/2, 1/2) is a difference of two log-gammas near 6e6, so double precision leaves
// ~1e-9 relative (the same in AlmTail.ptUpper, shared/upper-tail.js). Those points are checked at
// 1e-8 relative, separately and by name, instead of being dropped.
const LARGE_DF = g => g.df === 1e6;
const closeLarge = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-8 * Math.abs(b);
for (const [label, grid, expr, want, reportOnly] of groups) {
  const f0 = failed, p0 = passed;
  let large = 0, largeOk = 0;
  for (const g of grid) {
    const e = expr(g); const a = val(e); const w = want(g);
    if (LARGE_DF(g)) { large++; const ok = closeLarge(a, w); if (ok) largeOk++; check(e + ' [df 1e6, 1e-8 rel]', ok, show(a, w)); }
    else check(e, close(a, w), show(a, w));
  }
  const nFail = failed - f0;
  if (reportOnly) { failed = f0; passed = p0; fails.splice(fails.length - nFail, nFail); }
  console.log((nFail === 0 ? 'PASS ' : (reportOnly ? 'INFO ' : 'FAIL ')) + label + ': ' + (grid.length - nFail) + '/' + grid.length +
    ' grid points within 1e-10 x |R| (+1e-13 where |R| >= 1e-3)' + (large ? '; df = 1e6 at 1e-8: ' + largeOk + '/' + large : '') +
    (reportOnly ? '  (not the code under test; reported, not gated)' : ''));
}
{
  const d = REF.qt.filter(g => mpq(g) !== undefined).map(g => Math.abs(g.q - mpq(g)) / Math.abs(mpq(g)));
  console.log('INFO R qt vs mpmath next to the median: ' + d.length + ' points, max relative difference ' + Math.max(...d).toExponential(2));
}
// the tQuantile(p) -> tCDF round trip must hold where the quantile is finite
{
  const f0 = failed;
  for (const g of REF.qt) { const e = 'MathUtils.tCDF(MathUtils.tQuantile(' + lit(g.p) + ',' + lit(g.df) + '),' + lit(g.df) + ')'; const a = val(e); check(e, Math.abs(a - g.p) <= 1e-12 + (LARGE_DF(g) ? 1e-8 : 1e-9) * g.p, 'got ' + a); }   // df 1e6: see LARGE_DF
  console.log((failed === f0 ? 'PASS ' : 'FAIL ') + 'round trip tCDF(tQuantile(p)) = p: ' + (REF.qt.length - (failed - f0)) + '/' + REF.qt.length);
}
// edge values
const edges = [
  ['jStat.studentt.inv(0.5, 5) === 0', val('jStat.studentt.inv(0.5, 5)') === 0],
  ['jStat.studentt.inv(0, 5) === -Infinity', val('jStat.studentt.inv(0, 5)') === -Infinity],
  ['jStat.studentt.inv(1, 5) === Infinity', val('jStat.studentt.inv(1, 5)') === Infinity],
  ['jStat.studentt.inv(0.975, 0) is NaN', Object.is(NaN, val('jStat.studentt.inv(0.975, 0)'))],
  ['jStat.studentt.cdf(0, 3) === 0.5', val('jStat.studentt.cdf(0, 3)') === 0.5],
  ['jStat.studentt.cdf(Infinity, 3) === 1', val('jStat.studentt.cdf(Infinity, 3)') === 1],
  ['jStat.studentt.cdf(-Infinity, 3) === 0', val('jStat.studentt.cdf(-Infinity, 3)') === 0],
  ['MathUtils.betaInc(0, 2, 3) === 0 and (1, 2, 3) === 1', val('MathUtils.betaInc(0, 2, 3)') === 0 && val('MathUtils.betaInc(1, 2, 3)') === 1],
  ['betaInc(0.5, 1e12, 1e12) fails closed (NaN), not a wrong number', Object.is(NaN, val('MathUtils.betaInc(0.5, 1e12, 1e12)'))],
  ["page self-test 'tQuantile(0.975, 12) ~ 2.179' holds", Math.abs(val('MathUtils.tQuantile(0.975, 12)') - 2.179) < 0.01]
];
for (const [n, ok] of edges) { check(n, ok); console.log((ok ? 'PASS ' : 'FAIL ') + n); }
if (fails.length) { console.log('first failures:'); fails.slice(0, 12).forEach(s => console.log('  ' + s)); }
console.log((failed ? 'FAILED ' : 'ALL PASSED ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
