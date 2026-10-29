import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import core from '../../../../shared/ma-core.js';
import plus from '../../../../correlation-ma/plus-core.js';
import { page } from './p17-range-harness.mjs';

const methods = ['FE', 'DL', 'PM', 'REML'];
const rangeError = { name: 'RangeError', message: /inverse-variance weight.*supported numerical range/i };
const near = (actual, expected, tol, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
  `${label}: ${actual} versus ${expected}; tolerance ${tol}`);
const identical = n => ['A', 'B'].map(label => ({ label, r: .2, n }));
const textOf = rows => rows.map(s => `${s.label}, ${s.r}, ${s.n}`).join('\n');

for (const method of methods) {
  for (const [name, ys, vs] of [
    ['total-weight overflow n=1e308', [Math.atanh(.2), Math.atanh(.2)], [1e-308, 1e-308]],
    ['squared-weight overflow n=1e155', [-.2, .2], [1e-155, 1e-155]],
    ['sum-square overflow with individually finite squares', [0, 0], [1e-154, 1e-154]],
    ['total squared weight overflow with finite sum of squares', [0, 0, 0], [2e-154, 2e-154, 2e-154]],
    ['one huge study among ordinary studies', [Math.atanh(.2), Math.atanh(.2)], [1e-308, 1 / 97]]
  ]) {
    test(`plant P17-R1: ${method} refuses ${name} before returning pooled r, Q or I2`, () => {
      assert.throws(() => core.pool(ys, vs, { method, pi: true }), rangeError);
    });
  }
  test(`plant P17-R1: ${method} tau2 override cannot bypass FE Q/I2 range validation`, () => {
    assert.throws(() => core.pool([.1, .3], [1e-308, 1e-308], { method, tau2: 1 }), rangeError);
  });
  test(`control: ${method} ordinary identical effects retain pooled r, Q, I2 and SE`, () => {
    const out = core.pool([Math.atanh(.2), Math.atanh(.2)], [1 / 97, 1 / 97], { method, pi: true });
    near(Math.tanh(out.mu), .2, 1e-15, 'pooled r');
    near(out.Q, 0, 1e-28, 'Q'); assert.equal(out.I2, 0); assert.equal(out.tau2, 0);
    near(out.se, Math.sqrt(1 / 194), 1e-15, 'SE');
    assert.ok(out.ciLo < out.mu && out.mu < out.ciHi);
  });
  test(`control: ${method} representable large weights are still supported`, () => {
    const out = core.pool([0, 0], [1e-153, 1e-153], { method });
    assert.equal(out.mu, 0); assert.equal(out.Q, 0); assert.equal(out.I2, 0); assert.equal(out.tau2, 0);
    assert.ok(Number.isFinite(out.se) && out.se > 0);
    near(out.se / Math.sqrt(1e-153 / 2), 1, 1e-15, 'relative SE');
  });
  test(`plant P17-R1: ${method} page visibly refuses huge n and clears results and exports`, () => {
    const p = page();
    assert.ok(p.window._almLastCorrMA()); assert.ok(p.window._almCorrPlus());
    p.node('alm-plus-loo-btn').dispatchEvent({ type: 'click' });
    assert.notEqual(p.node('alm-plus-loo').innerHTML, '');
    assert.doesNotThrow(() => p.run(textOf(identical(1e308)), method));
    assert.equal(p.window._almLastCorrMA(), null);
    assert.equal(p.window._almCorrPlus(), null);
    assert.match(p.node('headline').textContent, /cannot pool.*inverse-variance weight.*supported numerical range/i);
    assert.equal(p.node('res-body').innerHTML, ''); assert.equal(p.node('forest-host').innerHTML, '');
    assert.equal(JSON.stringify(p.exports.get('correlation-ma-results')()), '{}');
    assert.equal(JSON.stringify(p.exports.get('correlation-ma-sensitivity')()), '{}');
    assert.ok(!p.node('alm-plus-loo').innerHTML.includes('<table'));
    const recovered = p.run(textOf(identical(100)), method);
    near(recovered.r, .2, 1e-15, 'recovered pooled r');
    assert.ok(p.window._almCorrPlus());
  });
  test(`control: ${method} ordinary page rendering and export remain available`, () => {
    const p = page(), out = p.run(textOf(identical(100)), method);
    near(out.r, .2, 1e-15, 'page r');
    assert.match(p.node('headline').innerHTML, /pooled r/);
    assert.match(p.node('res-body').innerHTML, /50\.0%/);
    assert.match(p.node('forest-host').innerHTML, /<svg/);
    assert.equal(p.exports.get('correlation-ma-results')().k, 2);
  });
}

test('plant P17-R1: sensitivity and leave-one-out cannot publish overflowed Q or I2', () => {
  assert.throws(() => plus.sensitivity(identical(1e308)), rangeError);
  assert.throws(() => plus.leaveOneOut([...identical(1e308), { label: 'C', r: .2, n: 100 }], 'DL', 'z'), rangeError);
});

test('plant P17-R1: leave-one-out independently refuses huge n', () => {
  assert.throws(() => plus.leaveOneOut([...identical(1e308), { label: 'C', r: .2, n: 100 }], 'DL', 'z'), rangeError);
});

test('control: ordinary sensitivity and leave-one-out retain finite Q and I2', () => {
  const studies = [...identical(100), { label: 'C', r: .2, n: 100 }];
  const sens = plus.sensitivity(studies);
  assert.equal(sens.refused, false);
  for (const cell of sens.cells.filter(c => c.applicable)) {
    near(cell.r, .2, 1e-15, 'sensitivity r'); near(cell.Q, 0, 1e-28, 'sensitivity Q');
    assert.equal(cell.I2, 0);
  }
  const loo = plus.leaveOneOut(studies, 'DL', 'z');
  assert.equal(loo.refused, false); assert.equal(loo.rows.length, 3);
  for (const cell of [loo.full, ...loo.rows]) {
    near(cell.r, .2, 1e-15, 'leave-one-out r'); near(cell.Q, 0, 1e-28, 'leave-one-out Q');
    assert.equal(cell.I2, 0);
  }
});

test('control: fresh metafor oracle records R/package versions and matching example inputs', () => {
  const ref = JSON.parse(readFileSync(new URL('p17-range-reference.json', import.meta.url), 'utf8'));
  assert.ok(ref.provenance.R); assert.ok(ref.provenance.metafor);
  assert.deepEqual(ref.cases.example.r, [.45, .30, .55, .20, .38, .62, .28, .50]);
  assert.deepEqual(ref.cases.example.n, [40, 55, 30, 80, 65, 25, 90, 45]);
  for (const [name, c] of Object.entries(ref.cases)) for (const method of methods) {
    const a = core.pool(c.r.map(Math.atanh), c.n.map(n => 1 / (n - 3)), { method, pi: true });
    for (const field of ['mu', 'se', 'ciLo', 'ciHi', 'Q', 'tau2', 'I2']) {
      const tol = field === 'I2' ? 1e-7 : field === 'tau2' && ['PM', 'REML'].includes(method) ? 1e-6 : 1e-9;
      near(a[field], c.fits[method][field], tol, `${name} ${method} ${field}`);
    }
  }
});
