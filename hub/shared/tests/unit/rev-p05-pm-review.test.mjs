import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import C from '../../../../shared/ma-core.js';

const cases = {
  imprecise_outlier: { kind: 'plant', yi: [-2, 0, 2, 1e40], vi: [1, 1, 1, 1e100], tau2: 5 / 3 },
  extreme_imprecise_outlier: { kind: 'plant', yi: [-2, 0, 2, 1e150], vi: [1, 1, 1, 1e308], tau2: 8 / (3 - 1e-8) - 1 },
  translated: { kind: 'plant', yi: [1e12 - 2, 1e12, 1e12 + 2], vi: [1, 1, 1], tau2: 3 },
  centered: { kind: 'control', yi: [-2, 0, 2], vi: [1, 1, 1], tau2: 3 },
  small_root: { kind: 'control', yi: [-1, 0, 1], vi: [0.5, 0.5, 0.5], tau2: 0.5 },
};
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) &&
  Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
  `${label}: ${actual} versus ${expected}`);

// Independent check in the original effect/variance units. Centering before
// averaging makes the residual test sensitive to errors in translated fits.
function q(yi, vi, tau2) {
  const y = yi.map(value => value - yi[0]);
  const w = vi.map(value => 1 / (value + tau2));
  const sw = w.reduce((a, b) => a + b, 0);
  const mu = y.reduce((sum, value, i) => sum + w[i] * value, 0) / sw;
  return y.reduce((sum, value, i) => sum + w[i] * (value - mu) * (value - mu), 0);
}

for (const [name, d] of Object.entries(cases)) {
  for (const method of ['PM', 'EB']) {
    test(`P05-R2 ${d.kind}: ${method} resolves ${name} in original units`, () => {
      const fit = C.pool(d.yi, d.vi, { method });
      near(fit.tau2, d.tau2, 'tau2');
      near(q(d.yi, d.vi, fit.tau2), d.yi.length - 1, 'Q(root)');
      near(fit.se, Math.sqrt(1 / d.vi.reduce((sum, v) => sum + 1 / (v + d.tau2), 0)), 'se');
      near(C.tau2PM(d.yi, d.vi), d.tau2, 'direct PM');
      near(C.tau2PM([...d.yi].reverse(), [...d.vi].reverse()), d.tau2, 'reordered PM');
    });
  }
}

test('P05-R2 control: centering preserves frozen caller inputs and the zero boundary', () => {
  const yi = Object.freeze([1e12 - 1, 1e12, 1e12 + 1]);
  const vi = Object.freeze([1, 1, 1]);
  assert.equal(C.tau2PM(yi, vi), 0);
  assert.deepEqual(yi, [1e12 - 1, 1e12, 1e12 + 1]);
  assert.deepEqual(vi, [1, 1, 1]);
});

test('P05-R2 plant: a tiny finite root converges relative to its own variance units', () => {
  // Equal variances: sample variance([-2a, 0, 2a]) - a^2 = 3a^2.
  const yi = [-2e-150, 0, 2e-150], vi = [1e-300, 1e-300, 1e-300];
  const actual = C.tau2PM(yi, vi), expected = 3e-300;
  assert.ok(Math.abs(actual / expected - 1) <= 1e-10, `tiny root: ${actual}`);
  near(q(yi, vi, actual), 2, 'tiny Q(root)');
});

test('P05-R2 control: tiny variances preserve the zero boundary', () => {
  assert.equal(C.tau2PM([-1e-150, 0, 1e-150], [2e-300, 2e-300, 2e-300]), 0);
});

test('P05-R2 control: native R reference records inputs, versions and converged roots', () => {
  const ref = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/rev-p05-r2-reference.json', import.meta.url), 'utf8'));
  assert.ok(ref.provenance.R);
  assert.ok(ref.provenance.metafor);
  assert.equal(ref.provenance.serialization, 'base R; 17 significant digits');
  for (const [name, d] of Object.entries(cases)) {
    const r = ref.cases[name];
    assert.deepEqual(r.yi, d.yi);
    assert.deepEqual(r.vi, d.vi);
    near(r.tau2, d.tau2, `${name} R oracle`);
    near(r.q_minus_df, 0, `${name} R residual`);
  }
});
