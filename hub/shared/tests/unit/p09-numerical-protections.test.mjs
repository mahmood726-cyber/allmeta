import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nma = require('../../../../shared/nma-multiarm-v1.js');
const reml = require('../../../../shared/multilevel-reml.js');
const close = (got, want, tolerance = 1e-6) =>
  assert.ok(Number.isFinite(got) && Math.abs(got - want) <= tolerance, `${got} vs ${want} (tolerance ${tolerance})`);
const rows = [
  { study: 'Three', t1: 'A', t2: 'B', est: 0.3, se: 0.2 },
  { study: 'Three', t1: 'A', t2: 'C', est: 0.5, se: 0.2 },
  { study: 'Three', t1: 'B', t2: 'C', est: 0.2006, se: 0.2 }
];

test('P09 NMA regression: a rounded non-baseline edge contributes to the fitted effects', () => {
  const result = nma.fit(rows);
  assert.equal(result.ok, true, result.error);
  // Equal variances: the all-edge least-squares solution divides the cycle discrepancy by three.
  close(result.d[result.nonref.indexOf('B')], 0.3 - 0.0006 / 3, 1e-12);
  close(result.d[result.nonref.indexOf('C')], 0.5 + 0.0006 / 3, 1e-12);
});

test('P09 NMA regression: relabeling the internal baseline preserves rounded-edge estimates', () => {
  const rename = { A: 'Z', B: 'B', C: 'C' };
  const renamed = rows.map(r => ({ ...r, t1: rename[r.t1], t2: rename[r.t2] }));
  const a = nma.analyse(rows), b = nma.analyse(renamed);
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  for (const t1 of ['A', 'B', 'C']) for (const t2 of ['A', 'B', 'C']) {
    close(a.common.TE[a.treatments.indexOf(t1)][a.treatments.indexOf(t2)],
      b.common.TE[b.treatments.indexOf(rename[t1])][b.treatments.indexOf(rename[t2])], 1e-12);
  }
});

test('P09 NMA regression: random effects retain rounded-edge information when the baseline changes', () => {
  const network = rows.concat([
    { study: 'Two1', t1: 'A', t2: 'B', est: -0.5, se: 0.15 },
    { study: 'Two2', t1: 'A', t2: 'B', est: 1.1, se: 0.19 }
  ]);
  const rename = { A: 'Z', B: 'B', C: 'C' };
  const a = nma.analyse(network);
  const b = nma.analyse(network.map(r => ({ ...r, t1: rename[r.t1], t2: rename[r.t2] })));
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.ok(a.tau2 > 0, 'the control network must exercise random-effect reweighting');
  for (const t1 of ['A', 'B', 'C']) for (const t2 of ['A', 'B', 'C']) {
    close(a.random.TE[a.treatments.indexOf(t1)][a.treatments.indexOf(t2)],
      b.random.TE[b.treatments.indexOf(rename[t1])][b.treatments.indexOf(rename[t2])], 1e-12);
  }
  close(a.Q, b.Q, 1e-12);
  close(a.tau2, b.tau2, 1e-12);
});

test('P09 NMA control: consistent effects preserve supplied effects and standard errors', () => {
  const consistent = rows.map((r, i) => ({ ...r, est: i === 2 ? 0.2 : r.est }));
  const before = JSON.stringify(consistent), a = nma.analyse(consistent);
  assert.equal(a.ok, true);
  for (const r of consistent) {
    const i = a.treatments.indexOf(r.t2), j = a.treatments.indexOf(r.t1);
    close(a.common.TE[i][j], r.est, 1e-12);
    close(a.common.seTE[i][j], r.se, 1e-12);
  }
  assert.equal(JSON.stringify(consistent), before);
});

test('P09 NMA control: inconsistent effects are still refused', () => {
  const bad = rows.map((r, i) => ({ ...r, est: i === 2 ? 0.3 : r.est }));
  assert.match(nma.fit(bad).error, /inconsistent treatment effects/);
});

const multilevel = Array.from({ length: 18 }, (_, i) => ({
  cluster: Math.floor(i / 3), y: (Math.floor(i / 3) - 2) / 2 + (i % 3 - 1) / 4,
  v: (i % 3 + 1) / 64
}));
for (const offset of [2 ** 20, -(2 ** 20)]) {
  test(`P09 REML regression: translation by ${offset} preserves dispersion and likelihood`, () => {
    const a = reml.fit(multilevel), b = reml.fit(multilevel.map(r => ({ ...r, y: r.y + offset })));
    for (const key of ['se', 'sigma2Between', 'sigma2Within', 'logLik']) close(b[key], a[key]);
    for (const key of ['mu', 'ciLo', 'ciHi']) close(b[key] - offset, a[key]);
  });
}

test('P09 REML control: unshifted fit is finite and leaves inputs intact', () => {
  const before = JSON.stringify(multilevel), result = reml.fit(multilevel);
  for (const key of ['mu', 'se', 'sigma2Between', 'sigma2Within', 'logLik', 'ciLo', 'ciHi'])
    assert.ok(Number.isFinite(result[key]), key);
  assert.equal(result.k, 18); assert.equal(result.nClusters, 6);
  assert.equal(JSON.stringify(multilevel), before);
});
