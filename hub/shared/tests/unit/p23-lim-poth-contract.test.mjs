// LIM-P23 F05 / F07: the shared POTH helpers must refuse malformed input instead of
// silently changing its size (F05) or computing SUCRAs from a non-probability matrix (F07).
import test from 'node:test';
import assert from 'node:assert/strict';
import P from '../../../../shared/poth.js';

for (const [name, v] of [
  ['non-finite entry is dropped (n changes)', [0.9, NaN, 0.1]],
  ['hole is dropped', [0.9, , 0.1]],
  ['string entry is dropped', [0.9, '0.5', 0.1]],
  ['value above 1 accepted', [1.4, 0.1, 0.2]],
  ['negative value accepted', [-0.2, 0.6, 0.9]],
  ['non-array throws', 'abc'],
]) {
  test(`LIM-P23 F05 plant: ${name} -> null`, () => { assert.equal(P.poth(v), null); });
}
test('LIM-P23 F05 control: valid vectors unchanged', () => {
  assert.ok(Math.abs(P.poth([0.9, 0.6, 0.3, 0.2]).poth - 0.54) < 1e-9);
  assert.ok(Math.abs(P.poth([0.92, 0.74, 0.55, 0.41, 0.23, 0.15]).poth - 0.6285714285714283) < 1e-12);
  assert.equal(P.poth([0.7]), null);
});

for (const [name, m] of [
  ['short row', [[0.5, 0.5], [0.5]]],
  ['non-square', [[0.5, 0.5, 0], [0.5, 0.5, 0]]],
  ['negative last-column entry', [[0.6, 0.6, -0.2], [0.2, 0.2, 0.6], [0.2, 0.2, 0.6]]],
  ['row not summing to 1', [[0.9, 0.3, 0], [0.1, 0.7, 0.2], [0, 0, 0.8]]],
  ['column not summing to 1', [[0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, 0, 0.5]]],
  ['non-finite entry', [[NaN, 1], [1, 0]]],
  ['singleton', [[1]]],
  ['empty', []],
]) {
  test(`LIM-P23 F07 plant: ${name} is refused`, () => {
    assert.throws(() => P.sucraFromRankProbs(m), RangeError);
  });
}
test('LIM-P23 F07 control: a valid rank-probability matrix keeps its SUCRAs', () => {
  assert.deepEqual(P.sucraFromRankProbs([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), [1, 0.5, 0]);
  const s = P.sucraFromRankProbs([[0.7, 0.2, 0.1], [0.2, 0.5, 0.3], [0.1, 0.3, 0.6]]);
  assert.ok(Math.abs(s[0] - 0.8) < 1e-12 && Math.abs(s[1] - 0.45) < 1e-12 && Math.abs(s[2] - 0.25) < 1e-12);
});
