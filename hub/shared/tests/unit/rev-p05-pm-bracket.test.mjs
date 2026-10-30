import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import C from '../../../../shared/ma-core.js';
import { pageHarness } from '../../../../tests/rev-p05-page-harness.mjs';

const inputs = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/rev-p05-pm-input.json', import.meta.url), 'utf8'));
const fixture = new URL('../../../../tests/fixtures/rev-p05-pm-reference.json', import.meta.url);
// The first RED run reads fresh R output; subsequent runs use its retained copy.
const oracle = () => JSON.parse(readFileSync(existsSync(fixture) ? fixture : join(tmpdir(), 'rev-p05-pm-reference.json'), 'utf8'));
const near = (actual, expected, label, tol = 1e-10) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)),
  `${label}: ${actual} versus ${expected} (relative/absolute tolerance ${tol})`);
function q(yi, vi, t2) {
  const w = vi.map(v => 1 / (v + t2)), sw = w.reduce((a, b) => a + b, 0);
  const mu = yi.reduce((s, y, i) => s + w[i] * y, 0) / sw;
  return yi.reduce((s, y, i) => s + w[i] * (y - mu) * (y - mu), 0);
}

test('P05-R1 control: fresh R oracle records inputs, versions and solved PM roots', () => {
  const ref = oracle();
  for (const key of ['R', 'metafor', 'jsonlite']) assert.ok(ref.provenance[key]);
  assert.equal(ref.provenance.tol, 1e-13);
  for (const [name, d] of Object.entries(inputs)) {
    assert.deepEqual(ref.cases[name].yi, d.yi);
    assert.deepEqual(ref.cases[name].sei, d.sei);
    near(ref.cases[name].estimates.PM.q_minus_df, 0, name);
  }
});

for (const [name, d] of Object.entries(inputs)) {
  const kind = name.startsWith('large_') ? 'plant' : 'control';
  const vi = d.sei.map(s => s * s);
  for (const method of ['PM', 'EB']) {
    test(`P05-R1 ${kind}: ${method} solves the finite R variance (${name})`, () => {
      const ref = oracle().cases[name].estimates.PM;
      const fit = C.pool(d.yi, vi, { method });
      for (const key of ['tau2', 'mu', 'se']) near(fit[key], ref[key], `${method}.${key}`);
      near(q(d.yi, vi, fit.tau2), d.yi.length - 1, 'Q(root)');
      near(C.tau2PM(d.yi, vi), ref.tau2, 'direct PM');
    });
    test(`P05-R1 ${kind}: ${method} render and export use the fitted variance (${name})`, () => {
      const ref = oracle().cases[name].estimates.PM;
      const r = pageHarness(C).render(d.yi, d.sei, method);
      assert.equal(r.invalid, 'false', r.warning);
      assert.ok(r.info, r.warning);
      assert.equal(r.exported.k, d.yi.length);
      assert.equal(r.exported.tau2_estimator, method.toLowerCase());
      for (const key of ['tau2', 'mu', 'se']) near(r.exported[key], ref[key], `export.${key}`);
      assert.equal(r.exported.tau2, r.info.sum.tau2);
      assert.ok(r.stats.includes(`${r.exported.tau2.toFixed(4)} (${method})`), r.stats);
    });
  }
  if (kind === 'control') test(`P05-R1 control: all eight estimators retain R parity (${name})`, () => {
    for (const [method, ref] of Object.entries(oracle().cases[name].estimates)) {
      const fit = C.pool(d.yi, vi, { method });
      for (const key of ['tau2', 'mu', 'se']) near(fit[key], ref[key], `${method}.${key}`);
    }
  });
}

for (const a of [1e40, 1e150, 1.3e154]) {
  test(`P05-R1 plant: finite equal-variance root is independent of scale (${a})`, () => {
    // Equal variances imply tau2 = sample variance(y) - v = .99*a^2.
    const yi = [-a, 0, a], vi = Array(3).fill((a * 0.1) * (a * 0.1));
    const expected = (0.99 * a) * a;
    const actual = C.tau2PM(yi, vi);
    near(actual, expected, 'finite scaled root');
    near(q(yi, vi, actual), 2, 'Q(root)');
  });
}

test('P05-R1 plant: finite root survives an overflowing squared effect scale', () => {
  const a = 1.4e154, se = 0.8 * a;
  assert.equal(a * a, Infinity);
  near(C.tau2PM([-a, 0, a], [se * se, se * se, se * se]), (0.36 * a) * a, 'finite root');
});

test('P05-R1 plant: PM and EB explicitly refuse an unrepresentable variance', () => {
  const yi = [-2e154, 0, 2e154], vi = [1e306, 1e306, 1e306];
  assert.throws(() => C.tau2PM(yi, vi), { name: 'RangeError', message: /PM.*(range|represent)/i });
  for (const method of ['PM', 'EB']) {
    assert.throws(() => C.pool(yi, vi, { method }), { name: 'RangeError', message: /PM.*(range|represent)/i });
  }
});

test('P05-R1 control: PM zero boundary and fewer than two studies remain zero', () => {
  for (const [yi, vi] of [[[], []], [[2], [0.1]], [[1, 1, 1], [0.1, 1, 2]], [[-1, 0, 1], [1, 1, 1]]]) {
    assert.equal(C.tau2PM(yi, vi), 0);
  }
});

test('P05-R1 control: existing BCG fixture retains all-method estimates and CIs', () => {
  const bcg = JSON.parse(readFileSync(new URL('../_heterogeneity_parity_fixture.json', import.meta.url), 'utf8'));
  const yi = bcg.studies.map(s => s[1]), vi = bcg.studies.map(s => s[2] * s[2]);
  for (const [method, ref] of Object.entries(bcg.configs)) {
    const fit = C.pool(yi, vi, { method: method.toUpperCase() });
    for (const [actual, expected] of [['tau2', 'tau2'], ['mu', 'mu'], ['se', 'se'], ['ciLo', 'ci_lo'], ['ciHi', 'ci_hi']]) {
      near(fit[actual], ref[expected], `BCG ${method}.${actual}`, 1e-9);
    }
  }
});
