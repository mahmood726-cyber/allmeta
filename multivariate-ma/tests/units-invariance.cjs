'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { run, population, factors } = require('../validate/diagnostic/units.cjs');
test('diagnostic verdict does not depend on outcome units: verdict(y*c, S*c^2) == verdict(y, S)', () => {
  assert.deepEqual(factors, [0.01, 0.1, 10, 100]);
  const sets = population().reduce((n, f) => ({ ...n, [f.set]: (n[f.set] || 0) + 1 }), {});
  assert.deepEqual(sets, { hard: 69, control: 30, fixture: 2, probe: 16 });
  const r = run();
  assert.equal(r.fits, 117);
  assert.deepEqual(r.failures, []);
  assert.equal(r.invariant, r.fits);
});
