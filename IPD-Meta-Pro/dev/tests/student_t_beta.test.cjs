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
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'student_t_beta_reference.json'), 'utf8'));
const { run } = loadPage(pageFile);
let failed = 0, passed = 0;
const fails = [];
function check(name, ok, detail) { if (ok) passed++; else { failed++; fails.push(name + (detail ? '  [' + detail + ']' : '')); } }
// absolute 1e-13 plus relative 1e-10: keeps relative accuracy for small probabilities and quantiles
const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-13 + 1e-10 * Math.abs(b);
const show = (a, b) => 'page ' + a + ' R ' + b;
const val = e => { try { return run(e); } catch (err) { return NaN; } };

const groups = [
  ['MathUtils.betaInc', REF.pbeta, g => 'MathUtils.betaInc(' + g.x + ',' + g.a + ',' + g.b + ')', g => g.p],
  ['EnhancedPredictionInterval.betaInc', REF.pbeta, g => 'EnhancedPredictionInterval.betaInc(' + g.x + ',' + g.a + ',' + g.b + ')', g => g.p],
  ['jStat.studentt.cdf', REF.pt, g => 'jStat.studentt.cdf(' + g.t + ',' + g.df + ')', g => g.p],
  ['MathUtils.tCDF', REF.pt, g => 'MathUtils.tCDF(' + g.t + ',' + g.df + ')', g => g.p],
  ['EnhancedPredictionInterval.tCDF', REF.pt, g => 'EnhancedPredictionInterval.tCDF(' + g.t + ',' + g.df + ')', g => g.p],
  ['jStat.studentt.inv', REF.qt, g => 'jStat.studentt.inv(' + g.p + ',' + g.df + ')', g => g.q],
  ['MathUtils.tQuantile', REF.qt, g => 'MathUtils.tQuantile(' + g.p + ',' + g.df + ')', g => g.q],
  ['EnhancedPredictionInterval.tQuantile', REF.qt, g => 'EnhancedPredictionInterval.tQuantile(' + g.p + ',' + g.df + ')', g => g.q],
  ['Stats.tQuantile (P60-validated copy, control)', REF.qt, g => 'Stats.tQuantile(' + g.p + ',' + g.df + ')', g => g.q],
  ['AlmTail.pfUpper', REF.pf, g => 'AlmTail.pfUpper(' + g.f + ',' + g.df1 + ',' + g.df2 + ')', g => g.pu]
];
for (const [label, grid, expr, want] of groups) {
  const f0 = failed;
  for (const g of grid) { const e = expr(g); const a = val(e); check(e, close(a, want(g)), show(a, want(g))); }
  console.log((failed === f0 ? 'PASS ' : 'FAIL ') + label + ': ' + (grid.length - (failed - f0)) + '/' + grid.length + ' grid points within 1e-13 + 1e-10 x |R|');
}
// the tQuantile(p) -> tCDF round trip must hold where the quantile is finite
{
  const f0 = failed;
  for (const g of REF.qt) { const e = 'MathUtils.tCDF(MathUtils.tQuantile(' + g.p + ',' + g.df + '),' + g.df + ')'; const a = val(e); check(e, Math.abs(a - g.p) <= 1e-12 + 1e-9 * g.p, 'got ' + a); }
  console.log((failed === f0 ? 'PASS ' : 'FAIL ') + 'round trip tCDF(tQuantile(p)) = p: ' + (REF.qt.length - (failed - f0)) + '/' + REF.qt.length);
}
// edge values
const edges = [
  ['jStat.studentt.inv(0.5, 5) === 0', val('jStat.studentt.inv(0.5, 5)') === 0],
  ['jStat.studentt.inv(0, 5) === -Infinity', val('jStat.studentt.inv(0, 5)') === -Infinity],
  ['jStat.studentt.inv(1, 5) === Infinity', val('jStat.studentt.inv(1, 5)') === Infinity],
  ['jStat.studentt.inv(0.975, 0) is NaN', Number.isNaN(val('jStat.studentt.inv(0.975, 0)'))],
  ['jStat.studentt.cdf(0, 3) === 0.5', val('jStat.studentt.cdf(0, 3)') === 0.5],
  ['jStat.studentt.cdf(Infinity, 3) === 1', val('jStat.studentt.cdf(Infinity, 3)') === 1],
  ['jStat.studentt.cdf(-Infinity, 3) === 0', val('jStat.studentt.cdf(-Infinity, 3)') === 0],
  ['MathUtils.betaInc(0, 2, 3) === 0 and (1, 2, 3) === 1', val('MathUtils.betaInc(0, 2, 3)') === 0 && val('MathUtils.betaInc(1, 2, 3)') === 1],
  ["page self-test 'tQuantile(0.975, 12) ~ 2.179' holds", Math.abs(val('MathUtils.tQuantile(0.975, 12)') - 2.179) < 0.01]
];
for (const [n, ok] of edges) { check(n, ok); console.log((ok ? 'PASS ' : 'FAIL ') + n); }
if (fails.length) { console.log('first failures:'); fails.slice(0, 12).forEach(s => console.log('  ' + s)); }
console.log((failed ? 'FAILED ' : 'ALL PASSED ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
