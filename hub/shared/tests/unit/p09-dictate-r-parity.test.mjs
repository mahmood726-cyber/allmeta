import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../helpers/p09-proportion-harness.mjs';

// Verified against the successful Rscript output in the pass-1 feedback. The adjacent R
// script records package versions and uses native predict() for FE evidence.
const reference = JSON.parse(readFileSync(
  new URL('../fixtures/p09-dictate-reference.json', import.meta.url), 'utf8'));
const datasets = ['heterogeneous', 'homogeneous'];
const transforms = ['logit', 'ft', 'raw'];
const methods = ['FE', 'DL', 'PM'];
const fields = ['mu_re', 'seRE', 'tau2', 'lo', 'hi', 'poolP', 'poolLo', 'poolHi',
  'piLo', 'piHi', 'poolPiLo', 'poolPiHi'];
const exportedFields = ['mu_re', 'seRE', 'tau2', 'poolP', 'poolLo', 'poolHi',
  'poolPiLo', 'poolPiHi'];
assert.deepEqual(Object.keys(reference.cases).sort(), datasets.flatMap(dataset =>
  transforms.flatMap(trans => methods.map(method => `${dataset}|${trans}|${method}`))).sort());

function compare(actual, expected, tolerance, label) {
  if (expected === null) {
    assert.equal(actual, null, label);
    return;
  }
  assert.ok(Number.isFinite(expected), label + ' has a finite R reference');
  assert.ok(Number.isFinite(actual), label + ' is finite');
  const difference = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
  assert.ok(difference <= tolerance,
    `${label}: app=${actual}, R=${expected}, difference=${difference}, tolerance=${tolerance}`);
}

for (const dataset of datasets) for (const trans of transforms) for (const method of methods) {
  test(`P09-D4 R parity: ${dataset} ${trans} ${method}`, () => {
    const d = reference.datasets[dataset];
    const src = d.x.map((x, i) => `${x},${d.n[i]}`).join('\n');
    const expected = reference.cases[`${dataset}|${trans}|${method}`];
    const result = createApp().run(trans, method, src);
    // Keep the existing primary contract's metric and tolerances unchanged.
    const tolerance = method === 'PM' ? 1e-6 : 1e-9;
    for (const field of fields) {
      compare(result.snapshot.values[field], expected[field], tolerance, 'snapshot ' + field);
    }
    for (const field of exportedFields) {
      compare(result.exported[field], expected[field], tolerance, 'export ' + field);
    }
    if (method === 'FE') {
      assert.equal(expected.nativePiLo, null, 'native metafor FE lower PI is absent');
      assert.equal(expected.nativePiHi, null, 'native metafor FE upper PI is absent');
      assert.doesNotMatch(result.heterogeneity, /prediction interval/i);
    } else {
      // Native predict() uses z; compare app PIs against the R t_(k-1) fields.
      assert.ok(Number.isFinite(expected.nativePiLo));
      assert.ok(Number.isFinite(expected.nativePiHi));
      assert.match(result.heterogeneity, /95% prediction interval/);
    }
  });
}
