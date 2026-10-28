import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from '../nma-inconsistency-render-harness.mjs';

// Constructed inputs test verdict wording, not numerical R parity.
const triangle = 'A,B,0,0.1,S1\nB,C,0,0.1,S2\nA,C,1,0.1,S3';

test('plant CI-262: significant node splits retain the P16 inconsistent verdict', () => {
  const h = harness(), state = h.load(triangle);
  assert.equal(state.nodeSplit.length, 3);
  assert.ok(state.nodeSplit.every(s => s.p < 0.05));
  // P16 Methods specifies this label; pinned replay and live.js also require it.
  assert.deepEqual(h.table().map(row => row[6]), Array(3).fill('inconsistent'));
  assert.match(h.elements['ns-body'].innerHTML, /class="chip incon"/);
});

test('control CI-262: non-significant node splits retain the P0-31 cautious verdict', () => {
  const h = harness(), state = h.load(triangle.replace('A,C,1,', 'A,C,0.3,'));
  assert.equal(state.nodeSplit.length, 3);
  assert.ok(state.nodeSplit.every(s => s.p >= 0.05));
  assert.deepEqual(h.table().map(row => row[6]), Array(3).fill('no evidence of inconsistency'));
  assert.match(h.elements['ns-body'].innerHTML, /class="chip cons"/);
});

test('control CI-262: a network without an indirect path has no node-split verdict', () => {
  const h = harness(), state = h.load('A,B,0,0.1,S1\nB,C,0,0.1,S2\nC,D,1,0.1,S3');
  assert.equal(state.nodeSplit.length, 0);
  assert.deepEqual(h.table(), []);
  assert.match(h.elements.dbt.innerHTML, /inconsistency is not testable/);
});
