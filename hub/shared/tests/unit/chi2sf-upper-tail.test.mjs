import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Benford = require('../../../../shared/benford-v1.js');
const QMA = require('../../../../shared/quantile-ma-v1.js');

const rel = (a, b) => Math.abs(a - b) / b;
// R 4.6.0: pchisq(q, df, lower.tail = FALSE), %.17g
const R = [[81, 1, 2.2571768119076811e-19], [100, 3, 1.5541594313896051e-21], [30, 2, 3.0590232050182579e-07],
  [200, 8, 6.3898877022382182e-39], [15, 8, 0.059145459832683982], [2, 3, 0.57240670447087916]];

for (const [name, M] of [['benford-v1.js', Benford], ['quantile-ma-v1.js', QMA]]) {
  test(`chi2sf ${name}: upper tail keeps relative precision (no 1 - CDF cancellation)`, () => {
    for (const [q, df, ref] of R) {
      const p = M._chi2sf(q, df);
      assert.ok(p > 0, `${name} _chi2sf(${q}, ${df}) underflowed to ${p}`);
      assert.ok(rel(p, ref) < 1e-9, `${name} _chi2sf(${q}, ${df}) = ${p}, R ${ref}`);
    }
    assert.equal(M._chi2sf(0, 4), 1);
  });
}
