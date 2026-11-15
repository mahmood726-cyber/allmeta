// Requirement: shared/nma-meta-regression.js is equivariant to the unit of the effect and of the covariate.
// Effects and SEs x c -> beta, gamma x c, tau2 x c^2; covariate x c -> gamma / c, tau2 unchanged.
// Before the fix: (1) the scoring stop rule had an ABSOLUTE floor (1e-14 * max(1, tau2)), so with effects
// in units of 1e-6 REML stopped at the coarse grid and reported converged with tau2 70% off; (2) the
// identifiability check compared X'X pivots to the largest diagonal across columns of different units, so a
// covariate x 1e-6 or x 1e6 made an identifiable interaction "not identifiable".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import R from '../../../../shared/nma-meta-regression.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const r = rng(7), base = [], pairs = [['A', 'B'], ['A', 'C'], ['B', 'C']];
for (let i = 0; i < 18; i++) {
  const [a, b] = pairs[i % 3], x = 1990 + (i * 7) % 25, se = 0.1 + 0.3 * r();
  const truth = (b === 'B' ? 0.3 : b === 'C' ? 0.6 : 0) - (a === 'B' ? 0.3 : 0) + 0.02 * (x - 2000) * (b === 'C' ? 1 : 0);
  base.push({ studyId: 'S' + i, trtA: a, trtB: b, covariate: x, yi: truth + (r() - 0.5) * 0.8, sei: se });
}
const T = ['A', 'B', 'C'];
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
for (const method of ['FE', 'REML', 'ML']) {
  const b0 = R.fit(base, T, { method });
  for (const c of [1e-8, 1e-6, 1e-4, 1e4, 1e8]) {
    test(`${method}: effects and SEs x ${c}`, () => {
      const o = R.fit(base.map(q => ({ ...q, yi: q.yi * c, sei: q.sei * c })), T, { method });
      for (const t of ['B', 'C']) {
        assert.ok(rel(o.beta_at_mean[t].estimate / c, b0.beta_at_mean[t].estimate) < 1e-8, 'beta ' + t);
        assert.ok(rel(o.gamma[t].estimate / c, b0.gamma[t].estimate) < 1e-8, 'gamma ' + t);
      }
      if (b0.tau2 > 0) assert.ok(rel(o.tau2 / (c * c), b0.tau2) < 1e-6, `tau2 ${o.tau2 / (c * c)} vs ${b0.tau2}`);
      else assert.equal(o.tau2, 0);
      assert.equal(o.converged, b0.converged);
    });
  }
  for (const c of [1e-6, 1e6]) {
    test(`${method}: covariate x ${c}`, () => {
      const o = R.fit(base.map(q => ({ ...q, covariate: q.covariate * c })), T, { method });
      for (const t of ['B', 'C']) assert.ok(rel(o.gamma[t].estimate * c, b0.gamma[t].estimate) < 1e-7, 'gamma ' + t);
      if (b0.tau2 > 0) assert.ok(rel(o.tau2, b0.tau2) < 1e-6, 'tau2');
    });
  }
}
test('an interaction that is not identifiable is still refused (covariate constant in every contrast with C)', () => {
  const flat = base.map(q => (q.trtB === 'C' ? { ...q, covariate: 2000 } : q));
  assert.throws(() => R.fit(flat, T, { method: 'REML' }), /not identifiable/);
});
