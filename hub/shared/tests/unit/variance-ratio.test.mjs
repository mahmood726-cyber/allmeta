// node:test — shared/variance-ratio.js (extreme sampling-variance ratio warning, metafor's own condition).
//   R reference (R 4.6.0, metafor 5.2-1, rma(yi = c(0.1, 0.3, 0.2), vi, method = "REML"), run on baseimage 2026-10-31):
//     vi = c(1e-2, 1e5, 1)                 ratio exactly 1e7 -> metafor WARNS ("Ratio of largest to smallest ...")
//     vi = c(1e-2, 1e5 * (1 - 1e-12), 1)   ratio just below  -> no warning
//     vi = c(1e-12, 0.04, 0.05)            one SE = 1e-6     -> WARNS
//   - boundary: equality warns, one step below does not (matches R);
//   - PLANTED off-by-one: the same source with `>=` turned into `>` must fail the boundary check (the test can fail);
//   - PLANTED threshold drift (1e12, the value first guessed in the sweep notes) must fail too;
//   - zero / NaN / empty / single variance: no warning (as metafor: is.finite(Inf) is FALSE); never throws;
//   - checkSE squares SEs; the message is non-empty, starts with MESSAGE_START and quotes the ratio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const SRC = new URL('../../../../shared/variance-ratio.js', import.meta.url);
const V = require('../../../../shared/variance-ratio.js');

function load(source) {
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  runInNewContext(source, sandbox);
  return sandbox.module.exports;
}
// The boundary contract, applied to any implementation (the real one and the planted mutants).
function boundaryHolds(impl) {
  const at = impl.check([1e-2, 1e5, 1]);
  const below = impl.check([1e-2, 1e5 * (1 - 1e-12), 1]);
  return at !== null && below === null;
}

test('threshold is metafor rma.uni 1/evtol with evtol = 1e-7 (= rma.mv literal 1e7)', () => {
  assert.equal(V.EVTOL, 1e-7);
  assert.equal(V.THRESHOLD, 1 / 1e-7);
  assert.equal(V.THRESHOLD, 1e7);
});

test('boundary: ratio exactly 1e7 warns, just below does not (R: TRUE / FALSE)', () => {
  assert.equal(1e5 / 1e-2, 1e7);
  const w = V.check([1e-2, 1e5, 1]);
  assert.ok(w, 'ratio == 1e7 must warn');
  assert.equal(w.ratio, 1e7);
  assert.equal(w.min, 1e-2);
  assert.equal(w.max, 1e5);
  assert.equal(V.check([1e-2, 1e5 * (1 - 1e-12), 1]), null);
  assert.ok(boundaryHolds(V));
});

test('one SE of 1e-6 among ordinary studies warns (R: TRUE)', () => {
  const w = V.check([1e-12, 0.04, 0.05]);
  assert.ok(w);
  assert.ok(Math.abs(w.ratio - 5e10) / 5e10 < 1e-12);
  assert.ok(w.message.startsWith(V.MESSAGE_START));
  assert.match(w.message, /5\.0e10/);
  assert.match(w.message, /metafor/);
  const s = V.checkSE([1e-6, 0.2, Math.sqrt(0.05)]);
  assert.ok(s);
  assert.ok(Math.abs(s.ratio - w.ratio) / w.ratio < 1e-9);
});

test('ordinary data: no warning', () => {
  assert.equal(V.check([0.01, 0.04, 0.09, 0.2]), null);
  assert.equal(V.checkSE([0.1, 0.2, 0.3]), null);
});

test('degenerate inputs never throw and never warn (metafor: is.finite(Inf/NaN) is FALSE)', () => {
  for (const x of [null, undefined, [], [0.1], [0, 0.1], [NaN, 0.1, 1e-12], 'abc', {}, [0, 0]]) {
    assert.equal(V.check(x), null, JSON.stringify(x));
  }
  assert.equal(V.checkSE(null), null);
  assert.equal(V.checkSE([0, 1]), null);
});

test('PLANTED off-by-one (>= -> >) fails the boundary contract', () => {
  const src = readFileSync(SRC, 'utf8');
  assert.ok(src.includes('ratio >= THRESHOLD'));
  const mutant = load(src.replace('ratio >= THRESHOLD', 'ratio > THRESHOLD'));
  assert.equal(boundaryHolds(mutant), false, 'a strict > must be caught by the boundary test');
  assert.equal(boundaryHolds(load(src)), true, 'the unmutated source passes in the same harness');
});

test('PLANTED threshold drift (1e12) fails the SE = 1e-6 and boundary checks', () => {
  const src = readFileSync(SRC, 'utf8');
  const mutant = load(src.replace('var EVTOL = 1e-7;', 'var EVTOL = 1e-12;'));
  assert.equal(mutant.THRESHOLD === 1e7, false);
  assert.equal(boundaryHolds(mutant), false);
});
