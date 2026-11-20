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

// Review #583 (XREV-1): one practically unweighted study (sei 1e8) must not loosen the stop rule for the precise
// ones. Independent oracle: with a = 1 + tau2 the four precise studies give profile -0.5*(4 log a + 16/a)
// (ML: a = 4, tau2 = 3) and, for REML, -0.5*(2 log a + 16/a) (a = 8, tau2 = 7); slope SE = sqrt(a / 4).
for (const [method, expectedTau] of [['REML', 7], ['ML', 3]]) {
  for (const c of [1e-8, 1, 1e8]) {
    test(`${method}: an imprecise study cannot trigger false convergence, scale ${c}`, () => {
      const rows = [[-1, -2, 1], [-1, 2, 1], [1, -2, 1], [1, 2, 1], [0, 0, 1e8]]
        .map(([covariate, yi, sei], i) => ({ studyId: 'S' + i, trtA: 'A', trtB: 'B', covariate, yi: yi * c, sei: sei * c }));
      const result = R.fit(rows, ['A', 'B'], { method });
      assert.equal(result.converged, true);
      assert.ok(Math.abs(result.tau2 / (c * c) - expectedTau) < 1e-10,
        `tau2=${result.tau2 / (c * c)}; expected ${expectedTau}`);
      assert.ok(Math.abs(result.gamma.B.se / c - Math.sqrt((1 + expectedTau) / 4)) < 1e-10);
    });
  }
}

// Review #583 (AGY A2/A3): the baseline fits must themselves converge, and covariate rescaling over the same
// 1e-8..1e8 range as effects must leave every reported quantity (estimates, SEs, tau2 incl. an exact 0,
// convergence) equivariant.
for (const method of ['FE', 'REML', 'ML']) {
  const b0 = R.fit(base, T, { method });
  test(`${method}: the baseline fit converges`, () => assert.equal(b0.converged, true));
  for (const c of [1e-8, 1e-6, 1e6, 1e8]) {
    test(`${method}: covariate x ${c}, all outputs`, () => {
      const o = R.fit(base.map(q => ({ ...q, covariate: q.covariate * c })), T, { method });
      assert.equal(o.converged, true);
      for (const t of ['B', 'C']) {
        assert.ok(rel(o.gamma[t].estimate * c, b0.gamma[t].estimate) < 1e-7, 'gamma ' + t);
        assert.ok(rel(o.gamma[t].se * c, b0.gamma[t].se) < 1e-7, 'gamma se ' + t);
        assert.ok(rel(o.beta_at_mean[t].estimate, b0.beta_at_mean[t].estimate) < 1e-7, 'beta ' + t);
        assert.ok(rel(o.beta_at_mean[t].se, b0.beta_at_mean[t].se) < 1e-7, 'beta se ' + t);
      }
      if (b0.tau2 > 0) assert.ok(rel(o.tau2, b0.tau2) < 1e-6, 'tau2');
      else assert.equal(o.tau2, 0);
    });
  }
}
// A homogeneous REML/ML fit (exact tau2 = 0 boundary) stays at 0 under effect scaling.
{
  const flatY = base.map(q => ({ ...q, yi: (q.trtB === 'B' ? 0.3 : 0.6) - (q.trtA === 'B' ? 0.3 : 0) }));
  for (const method of ['REML', 'ML']) for (const c of [1e-8, 1, 1e8]) {
    test(`${method}: homogeneous data keep tau2 = 0 at scale ${c}`, () => {
      const o = R.fit(flatY.map(q => ({ ...q, yi: q.yi * c, sei: q.sei * c })), T, { method });
      assert.equal(o.tau2, 0); assert.equal(o.converged, true);
    });
  }
}
// Review #583 (AGY A4): equilibration must not promote rounding noise to a column. A covariate that is constant
// up to 1 ulp (0.1 + 0.2 vs 0.3) centres to +-5e-17; scaled to unit norm it passed the rank check and the page
// fitted slopes of ~3e14 (SE ~3e15) where main refused. Refusal is the requirement; a covariate whose relative
// variation is real (1e-9 of a value of 1e8) must still be fitted.
test('a covariate constant up to rounding is refused, not fitted', () => {
  const rows = base.map((q, i) => ({ ...q, covariate: i % 2 ? 0.1 + 0.2 : 0.3 }));
  assert.throws(() => R.fit(rows, T, { method: 'REML' }), /not identifiable/);
});
test('control: a large covariate with small but real variation is still fitted', () => {
  const o = R.fit(base.map(q => ({ ...q, covariate: 1e8 + (q.covariate - 2000) * 1e-1 })), T, { method: 'FE' });
  const b0 = R.fit(base, T, { method: 'FE' });
  for (const t of ['B', 'C']) assert.ok(rel(o.gamma[t].estimate * 1e-1, b0.gamma[t].estimate) < 1e-6, 'gamma ' + t);
});
