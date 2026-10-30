import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import M from '../../../../shared/multivariate-ma.js';
import baseline from '../../../../multivariate-ma/validate/diagnostic/baseline-engine.cjs';
import mutations from '../../../../multivariate-ma/validate/diagnostic/mutation-controls.cjs';

const zero = [[0, 0], [0, 0]];
const studies = (a, b, d = a) => Array.from({ length: 3 }, () => ({ y: [0, 0], S: [[a, b], [b, d]] }));

test('plant P18-R5 review: representable PD margin survives rounded square roots', () => {
  const s = studies(1 + Number.EPSILON, 1);
  assert.equal(Math.sqrt(s[0].S[0][0]), 1, 'exercise the square-root rounding defect');
  const expected = baseline._obj2(s, 0, 0, 0);
  assert.ok(Number.isFinite(expected));
  assert.ok(Number.isFinite(M._objG(s, zero)), 'generic profile accepts this PD covariance');
  assert.equal(M._obj2(s, 0, 0, 0), expected);
});

for (const exponent of [-700, 700]) {
  test(`plant P18-R5 review: scaled PD margin survives at binary exponent ${exponent}`, () => {
    const scale = 2 ** exponent;
    const s = studies((1 + Number.EPSILON) * scale, scale);
    // Binary rescaling preserves the one-ulp margin. Retain the original
    // finite unit-scale arithmetic, including its near-singular rounding.
    const expected = baseline._obj2(studies(1 + Number.EPSILON, 1), 0, 0, 0) + 2 * Math.log(scale);
    const actual = M._obj2(s, 0, 0, 0);
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(actual - expected) <= 1e-11, `${actual} versus ${expected}`);
  });

  test(`control: scaled singular covariance stays rejected at binary exponent ${exponent}`, () => {
    assert.equal(M._obj2(studies(2 ** exponent, 2 ** exponent), 0, 0, 0), Infinity);
  });
}

test('control: well-conditioned and singular covariance classifications are retained', () => {
  for (const engine of [baseline, M]) {
    assert.ok(Number.isFinite(engine._obj2(studies(2, 0.5, 3), 0, 0, 0)));
    assert.equal(engine._obj2(studies(1, 1), 0, 0, 0), Infinity);
    assert.equal(engine._objG(studies(1, 1), zero), Infinity);
  }
});

const berkey = JSON.parse(readFileSync(new URL('./p18-r5-reference.json', import.meta.url), 'utf8')).berkey;
for (const [name, s] of [
  ['Berkey', berkey.studies],
  ['weak identification', mutations.controls.find(c => c.id === 'mutation-control:k6:E1e-5').studies]
]) test(`plant P18-R5 review: ${name} preserves every pre-diagnostic fit field exactly`, () => {
  const { diagnostic, ...fit } = M.fit(s);
  assert.deepEqual(fit, baseline.fit(s));
  assert.ok(diagnostic);
  if (name === 'weak identification') assert.equal(diagnostic.verdict, 'multiple near-equal optima');
});

test('control: exact two-study and univariate fits preserve pre-diagnostic fields', () => {
  for (const s of [studies(1, 0).slice(0, 2), [-2, -1, 0, 1, 2].map(y => ({ y: [y], S: [[0.2]] }))]) {
    const { diagnostic, ...fit } = M.fit(s);
    assert.deepEqual(fit, baseline.fit(s));
    assert.ok(diagnostic);
  }
});
