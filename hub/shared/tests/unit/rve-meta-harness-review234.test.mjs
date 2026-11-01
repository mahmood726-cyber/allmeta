import test from 'node:test';
import assert from 'node:assert/strict';
import { load, report, script } from '../fixtures/features/rve-meta/review-harness.mjs';

test('RVE review harness exercises the intended small example and records fit inputs', () => {
  for (const interceptOnly of [false, true]) {
    const c = load(interceptOnly);
    const state = c.AlmLiveAdapters['rve-meta'].currentState();
    assert.equal(state.result.fit.k_total, 13);
    assert.equal(state.result.fit.m_clusters, 5);
    assert.equal(state.result.fit.p, interceptOnly ? 1 : 3);
    assert.equal(report(c).audit.ok, true);
    assert.match(script(c), /plot\(tab\$b.r/);
  }
});
test('RVE review harness control: changed inputs still withhold stale report text', () => {
  const c = load();
  assert.ok(c.AlmRVEFeatures.text.results());
  c.document.getElementById('f-rho').value = '0.2';
  assert.equal(c.AlmRVEFeatures.text.results(), null);
});
