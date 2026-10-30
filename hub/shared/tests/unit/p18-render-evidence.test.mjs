import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssertions } from '../../../../multivariate-ma/tests/render-state-replay.mjs';

const plants = [
  'P18-R3 plant: variance 1e-204 renders joint ticks and replaces the previous analysis',
  'P18-R3 plant: variance 1e-204 renders sensitivity ticks',
  'P18-R3 plant: unexpected plot error clears reports and exports, then recovers'
];
const defects = ['joint precision', 'sweep precision', 'stale render state'];

test('P18 review control: all six unchanged assertions pass on the shipped sources', () => {
  assert.deepEqual(runAssertions().filter(result => !result.passed), []);
});

for (const [index, defect] of defects.entries()) {
  test(`P18 review plant: ${defect} is independently detected by the original assertions`, t => {
    const results = runAssertions({ defects: [defect] });
    const failed = results.filter(result => !result.passed);
    assert.deepEqual(failed.map(result => result.name), [plants[index]]);
    assert.equal(failed[0].code, 'ERR_ASSERTION');
    if (defect === 'joint precision') {
      assert.equal(failed[0].cause.name, 'TypeError');
      assert.match(failed[0].cause.message, /Cannot read properties of null \(reading 'k'\)/);
      assert.match(failed[0].cause.stack, /assertCurrentFit/);
    }
    t.diagnostic(`${failed[0].name}: observed assertion FAIL: ${failed[0].message}`);
    assert.equal(results.filter(result => result.passed).length, 5);
  });
}

test('P18 review plant: all three reconstructed defects fail while all three controls pass', t => {
  const results = runAssertions({ defects });
  const failed = results.filter(result => !result.passed);
  assert.deepEqual(failed.map(result => result.name), plants);
  for (const result of failed) {
    assert.equal(result.code, 'ERR_ASSERTION');
    t.diagnostic(`${result.name}: observed assertion FAIL: ${result.message}`);
  }
  assert.equal(results.filter(result => result.passed && result.name.includes('control:')).length, 3);
});

test('P18 review control: a source-loading failure is not recorded as a detected defect', () => {
  assert.throws(() => runAssertions({ sourceRoot: new URL('./missing-p18-source/', import.meta.url) }),
    { code: 'ENOENT' });
});
