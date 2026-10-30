import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../../../shared/ma-core.js');
const yi = [-100, 0, 100];
function close(actual, expected) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12 * Math.abs(expected),
    `expected ${expected}, got ${actual}`);
}

for (const method of ['PM', 'EB']) {
  test(`control P02-R2: ${method} equal-variance analytic root and pooling`, () => {
    const fit = core.pool(yi, [0.01, 0.01, 0.01], { method });
    close(fit.tau2, 10000 - 0.01);
    assert.equal(fit.mu, 0);
    close(fit.se, Math.sqrt(10000 / 3));
  });
  test(`plant P02-R2: ${method} preserves a representable root when initial weighted effects overflow`, () => {
    // Each initial weight is finite, but w * y overflows with opposite signs.
    // For three symmetric effects and equal variances, tau2 = 100^2 - v.
    const fit = core.pool(yi, [1e-307, 1e-307, 1e-307], { method });
    close(fit.tau2, 10000);
    assert.equal(fit.mu, 0);
    close(fit.se, Math.sqrt(10000 / 3));
    close(20000 / (1e-307 + fit.tau2), 2);
  });
}

test('plant P02-R2: PM brackets through overflow of the initial weight sum', () => {
  close(core.tau2PM([-1, 0, 1], [1e-308, 1e-308, 1e-308]), 1);
});

test('plant P02-R2: PM preserves a zero root when weighted products overflow', () => {
  assert.equal(core.tau2PM([100, 100, 100], [1e-307, 1e-307, 1e-307]), 0);
});

test('plant P02-R2: PM evaluates an overflowing upper-endpoint variance sum', () => {
  const effect = 1.34e154, variance = 1e307;
  // The analytic root fits in double precision; variance + the search's
  // Number.MAX_VALUE endpoint does not. This must still bracket the root.
  close(core.tau2PM([-effect, 0, effect], [variance, variance, variance]), effect * effect - variance);
});

test('control P02-R2: PM still refuses a root beyond the floating-point range', () => {
  assert.throws(() => core.tau2PM([-1e308, 0, 1e308], [1, 1, 1]),
    { name: 'RangeError', message: /PM.*bracket/ });
});
