'use strict';
// Found by the modal sweep: Beyond R > "14. P-Curve Robust" on the SGLT2 CVD example (all 8 studies) showed
// Results { "error": "Cannot read properties of undefined (reading 'cdf')" }.
// Root cause: BeyondR40.pCurveRobust computes the right-skew test as 1 - jStat.binomial.cdf(nLow - 1, nSig, 0.5),
// but the page's jStat shim (var jStat = {...}) has normal, studentt and chisquare only, no binomial; so the method
// threw whenever it got past its k >= 5 and >= 3-significant guards. The binomial upper tail P(X >= nLow) is now
// summed exactly (ipdBinomUpper). Reference: pcurve_binomial_reference.R (R pbinom).
//   node dev/tests/pcurve_binomial.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const ref = require('./pcurve_binomial_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 300) + ']')); };
{
  let worst = 0, err = null;
  try { for (const g of ref.grid) worst = Math.max(worst, Math.abs(run('ipdBinomUpper(' + g.x + ', ' + g.n + ', 0.5)') - g.upper)); } catch (e) { err = String(e); }
  check('P(X >= x), X ~ Bin(n, 0.5) = R 1 - pbinom(x - 1, n, 0.5) on ' + ref.grid.length + ' points (|diff| < 1e-12)', err === null && worst < 1e-12, err || worst);
}
{
  sandbox.__st = ref.studies;
  let r; try { r = run('BeyondR40.pCurveRobust(__st)'); } catch (e) { r = { error: 'THREW ' + e }; }
  check('pCurveRobust runs (no error) on 8 studies, 7 significant', !r.error && r.nSignificant === ref.nSig, JSON.stringify(r).slice(0, 200));
  check('right-skew p = R (' + ref.rightSkewP + ')', r.tests && Math.abs(r.tests.rightSkew.pValue - ref.rightSkewP) < 1e-12, r.tests && r.tests.rightSkew.pValue);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
