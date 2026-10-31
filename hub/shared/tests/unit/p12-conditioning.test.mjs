import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import harness from '../../../../limit-ma/tests/input-harness.cjs';

const app = new URL('../../../../limit-ma/', import.meta.url);
const inputs = JSON.parse(readFileSync(new URL('tests/fixtures/p12-conditioning-input.json', app), 'utf8'));
const page = fileURLToPath(new URL('index.html', app));
const load = () => harness.load(page, fileURLToPath(new URL('plus-ui.js', app)));
const rows = c => c.te.map((te, i) => ({te, se: c.se[i]}));
const text = c => c.te.map((te, i) => `${te}, ${c.se[i]}`).join('\n');
const oracle = () => {
  const fixture = new URL('tests/fixtures/p12-conditioning-reference.json', app);
  return JSON.parse(readFileSync(fixture, 'utf8'));
};
// Exercise the estimator itself as well as both public callers. No copied formulas.
const html = readFileSync(page, 'utf8');
const functions = html.slice(html.indexOf('    function pool('), html.indexOf('    function refuse('));
const estimator = vm.runInNewContext(`(function () { ${functions}; return limitMA; })()`);
const near = (got, expected, name) => assert.ok(Number.isFinite(got) &&
  Math.abs(got - expected) / Math.max(1, Math.abs(expected)) <= 1e-9,
  `${name}: ${got} vs ${expected} (normalized tolerance 1e-9)`);

test('control: fresh R fixture records inputs, versions and native rank', () => {
  const r = oracle();
  for (const key of ['R', 'meta', 'metasens', 'metafor', 'jsonlite']) assert.ok(r.provenance[key]);
  for (const [name, input] of Object.entries(inputs)) assert.deepEqual(r.cases[name].input, input);
  assert.equal(r.cases.cancellation_zero.diagnostic.rank, 1);
  assert.equal(r.cases.cancellation_zero.native.status, 'refused');
});

for (const name of ['ordinary', 'tau_zero', 'heterogeneous']) {
  test(`control: ${name} native R estimate, SE and CI parity`, () => {
    const h = load(), result = h.run(text(inputs[name])), ref = oracle().cases[name];
    assert.ok(result, h.nodes['limit-error'].textContent);
    assert.equal(ref.native.status, 'ok');
    near(result.limit_est, ref.native.limit_est, 'estimate');
    near(result.limit_se, ref.native.limit_se, 'SE');
    near(result.limit_ci_lo, ref.native.ci_lo, 'lower CI');
    near(result.limit_ci_hi, ref.native.ci_hi, 'upper CI');
    assert.ok(result.limit_se > 0);
    assert.ok(result.limit_ci_lo < result.limit_ci_hi);
    assert.ok(result.limit_se ** 2 >= result.tau2_dl / result.k);
  });
}

for (const name of ['cancellation_zero', 'nearly_equal', 'heterogeneous_x1000']) {
  test(`plant P12-R5: ${name} is refused at the estimator`, () => {
    assert.throws(() => estimator(rows(inputs[name])), /numerically|rank|variation/i);
  });
  test(`plant P12-R5: ${name} is refused by the public engine`, () => {
    assert.throws(() => load().window.AlmLimitEngine.fit(rows(inputs[name])), /numerically|rank|variation/i);
  });
  test(`plant P12-R5: ${name} clears page, exports and sensitivity, then recovers`, () => {
    const h = load();
    assert.ok(h.run(text(inputs.ordinary)));
    h.window.AlmLimitPlusUI.run();
    assert.ok(h.window.AlmLimitPlusUI.snapshot());
    assert.equal(h.run(text(inputs[name])), null);
    assert.match(h.nodes['limit-error'].textContent, /numerically|rank|variation/i);
    assert.equal(h.window.alm.exportOptions.getResults(), null);
    assert.equal(h.window.alm.plotOptions.getReceiptInput(), null);
    assert.equal(h.window.__almLimitValidationSnapshot().result, null);
    assert.equal(h.window.AlmLimitPlusUI.snapshot(), null);
    for (const id of ['body', 'plot', 'plus-body', 'plus-forest', 'plus-funnel']) assert.equal(h.nodes[id].innerHTML, '', id);
    assert.ok(h.run(text(inputs.ordinary)));
    assert.equal(h.nodes['limit-error'].textContent, '');
  });
}

test('plant P12-R5: identifiable heterogeneous_x10 has centered R diagnostic variance', () => {
  const result = load().run(text(inputs.heterogeneous_x10));
  const ref = oracle().cases.heterogeneous_x10;
  assert.equal(ref.diagnostic.rank, 2);
  assert.ok(result);
  near(result.limit_se, ref.diagnostic.centered_se, 'centered diagnostic SE (not native parity)');
});

test('plant P12-R5: heterogeneous_x10 retains native R estimate, SE and CI parity at 1e-9', () => {
  const result = load().run(text(inputs.heterogeneous_x10));
  const ref = oracle().cases.heterogeneous_x10.native;
  assert.equal(ref.status, 'ok');
  assert.ok(result);
  near(result.limit_est, ref.limit_est, 'native estimate');
  near(result.limit_se, ref.limit_se, 'native SE');
  near(result.limit_ci_lo, ref.ci_lo, 'native lower CI');
  near(result.limit_ci_hi, ref.ci_hi, 'native upper CI');
});

test('plant P12-R5: identifiable heterogeneous_x100 has centered R diagnostic variance', () => {
  const result = load().run(text(inputs.heterogeneous_x100));
  const ref = oracle().cases.heterogeneous_x100;
  assert.equal(ref.diagnostic.rank, 2);
  assert.ok(result);
  near(result.limit_se, ref.diagnostic.centered_se, 'centered diagnostic SE (not native parity)');
  assert.ok(result.limit_se ** 2 >= result.tau2_dl / result.k);
});

test('plant P12-R5: nonfinite variance is refused by the estimator before returning a fit', () => {
  // Distinct finite precisions with rank ratio above 1e-7, but 1/Sxx overflows.
  const input = [{te: .1, se: 1e154}, {te: .2, se: 1.000001e154}, {te: .3, se: 1.000002e154}];
  assert.throws(() => estimator(input), /numerically invalid uncertainty/i);
});
