import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read } from './p05-qprofile-harness.mjs';

// Isolate the strict comparison from quantile rounding: Q(0) is exactly 2
// for these two studies. Only the quantile dependency is stubbed; the actual
// Q calculation, endpoint solver and confidence-set classification run unchanged.
function atLowerQuantile(lower) {
  const source = read('shared/heterogeneity-ci.js');
  const anchor = 'var api = { qProfileCI:';
  assert.equal(source.split(anchor).length, 2);
  const context = vm.createContext({});
  vm.runInContext(source.replace(anchor,
    `chiSqQuantile = function(p) { return p < 0.5 ? ${lower} : 8; };\n  ${anchor}`), context);
  return context.AlmHetCI.qProfileCI([{ est: -1, v: 1 }, { est: 1, v: 1 }], 0.05);
}

test('P05 equality control: Q(0) equal to the lower quantile is nonempty', () => {
  const result = atLowerQuantile(2);
  assert.equal(result.empty, false);
  for (const key of ['tau2Lo', 'tau2Hi', 'I2Lo', 'I2Hi']) assert.equal(result[key], 0);
});
test('P05 equality control: Q(0) below the lower quantile is empty', () => {
  const result = atLowerQuantile(3);
  assert.equal(result.empty, true);
  assert.equal(result.tau2Lo, 0);
  assert.equal(result.tau2Hi, 0);
});
test('P05 equality control: Q(0) above the lower quantile has positive width', () => {
  const result = atLowerQuantile(1);
  assert.equal(result.empty, false);
  assert.equal(result.tau2Lo, 0);
  assert.ok(result.tau2Hi > 0);
});
