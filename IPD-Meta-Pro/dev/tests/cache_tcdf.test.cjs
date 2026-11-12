'use strict';
// MathUtils.chi2CDF / logGamma / normCDF must not depend on what was computed before (their caches keyed on
// x.toFixed(4) / z.toFixed(6), so a second argument that rounds to the same key returned the first one's value:
// chi2CDF(4e-5, 1) after chi2CDF(4.4e-5, 1) = 0.005292, R pchisq 0.005046; logGamma(2e-7) after logGamma(4e-7)
// = 14.73, R lgamma 15.42); Stats.tCDF must be P(T <= t) for both signs (tCDF(-2, 5) was 0.949, R pt 0.0510).
//   node dev/tests/cache_tcdf.test.cjs [path/to/ipd-meta-pro.html]
// Reference: cache_tcdf_reference.R (R 4.6.0) -> cache_tcdf_reference.json. Arguments are called in file order,
// so each colliding pair is evaluated after its partner, in one page.
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache_tcdf_reference.json'), 'utf8'));
const { run } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + '  [' + detail + ']'); };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

for (const r of REF.chi2) {
  const a = run('MathUtils.chi2CDF(' + r.x + ',' + r.df + ')');
  check('MathUtils.chi2CDF(' + r.x + ', ' + r.df + ')', rel(a, r.p) <= 1e-9, 'page ' + a + ' R ' + r.p);
}
for (const r of REF.lgamma) {
  const a = run('MathUtils.logGamma(' + r.z + ')');
  check('MathUtils.logGamma(' + r.z + ')', rel(a, r.v) <= 1e-9, 'page ' + a + ' R ' + r.v);
}
// normCDF is the Abramowitz-Stegun 7.1.26 approximation (absolute error < 1.5e-7, not R-exact); the requirement
// here is only that a value does not depend on the call before it.
{
  const pairs = [[1e-7, 4e-7], [-1.2345674, -1.2345671]];
  for (const [x, y] of pairs) {
    const fresh = loadPage(pageFile).run('MathUtils.normCDF(' + y + ')');
    const after = run('MathUtils.normCDF(' + x + '); MathUtils.normCDF(' + y + ')');
    check('MathUtils.normCDF(' + y + ') after normCDF(' + x + ') equals a fresh evaluation', after === fresh, 'after ' + after + ' fresh ' + fresh);
  }
}
for (const r of REF.pt) {
  const a = run('Stats.tCDF(' + r.t + ',' + r.df + ')');
  check('Stats.tCDF(' + r.t + ', ' + r.df + ')', rel(a, r.p) <= 1e-12, 'page ' + a + ' R ' + r.p);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
