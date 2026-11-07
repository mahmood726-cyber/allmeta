import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, readReference, compare, pooledPairs } from './p05-heterogeneity-engine.mjs';

test('P05 harness regression: numerical engine loads without UI lifecycle initialization', () => {
  // The original harness reached window.alm.analysisLifecycle and threw before
  // any parity comparison. No alm/UI implementation is supplied by loadEngine.
  const compute = loadEngine();
  const single = readReference().cases.find(data => data.id === 'single_study');
  const actual = compute(single, 'pm');
  assert.equal(actual.k, 1);
  assert.equal(actual.notPooled, true);
  assert.equal(actual.sum, undefined);
});

test('P05 harness control: extracted engine still computes the native R scale control', () => {
  const compute = loadEngine();
  const data = readReference().cases.find(data => data.id === 'scale_control');
  compare(pooledPairs(compute(data, 'pm'), data.fits.pm));
});
