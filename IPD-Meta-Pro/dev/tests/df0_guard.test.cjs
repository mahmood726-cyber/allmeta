'use strict';
// Heterogeneity p-value on zero degrees of freedom: AlmTail.pchisqUpper follows R (pchisq(x, 0, lower.tail =
// FALSE) = 0 for any x > 0), but at k = 1 the Q statistic is rounding noise (e.g. 1.75e-32), so an unguarded
// call reports p = 0 -- decisive heterogeneity -- where metafor reports QEp = 1 (it sets QEp = 1 when QEdf = 0).
//   node dev/tests/df0_guard.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + '  [' + detail + ']'); };
for (const Q of [1.75e-32, 0]) {
  const r = run('calculateI2WithCI(' + Q + ', 1)');
  check('calculateI2WithCI(Q = ' + Q + ', k = 1): p = 1 on 0 df', r.df === 0 && r.pValue === 1, 'p ' + r.pValue);
}
// df > 0 unchanged: Q = 25 on 7 df, R pchisq(25, 7, lower.tail = FALSE) = 0.00075880025565825
{
  const r = run('calculateI2WithCI(25, 8)');
  check('calculateI2WithCI(Q = 25, k = 8) still the upper tail', Math.abs(r.pValue - run('AlmTail.pchisqUpper(25, 7)')) === 0 && r.pValue > 7.5e-4 && r.pValue < 7.6e-4, 'p ' + r.pValue);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
