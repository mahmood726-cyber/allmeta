import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { harness } from '../../../../nma-inconsistency/tests/numerics-harness.mjs';
const require = createRequire(import.meta.url);
const Tail = require('../../../../shared/upper-tail.js');

// R 4.6.0: pchisq(q, df, lower.tail = FALSE), printed with %.17g
const R = [[81, 1, 2.2571768119076811e-19], [100, 3, 1.5541594313896051e-21], [30, 2, 3.0590232050182579e-07]];
const rel = (a, b) => Math.abs(a - b) / b;

test('P16 tails: chi-square p-values are upper tails, not 1 - CDF (no cancellation to 0)', () => {
  const { c } = harness();
  for (const [q, df, ref] of R) {
    const p = c.chiSqSF(q, df);
    assert.ok(rel(p, ref) < 1e-12, `chiSqSF(${q}, ${df}) = ${p}, R ${ref}`);
  }
  // node-split z test: pz(9) = pchisq(81, 1, lower.tail = FALSE)
  assert.ok(rel(c.pz(9), R[0][2]) < 1e-12, `pz(9) = ${c.pz(9)}`);
});

test('P16 tails: a strongly inconsistent triangle exports a nonzero design-by-treatment p', () => {
  const { c } = harness();
  c.__almIncoLoad('A,B,0,0.1\nB,C,0,0.1\nA,C,5,0.1');
  const s = c._almLastInco();
  const g = s.dbt;
  assert.ok(g.Q > 500, `Q = ${g.Q}`);
  assert.ok(g.p > 0, `exported dbt p underflowed to ${g.p}`);
  assert.ok(rel(g.p, Tail.pchisqUpper(g.Q, g.df)) < 1e-12, `dbt p ${g.p} vs upper tail ${Tail.pchisqUpper(g.Q, g.df)}`);
  for (const r of s.nodeSplit) {
    assert.ok(r.p > 0, `node-split ${r.comparison} p underflowed to ${r.p}`);
    assert.ok(rel(r.p, Tail.pchisqUpper(r.z * r.z, 1)) < 1e-12, `node-split ${r.comparison} p ${r.p}`);
  }
});
