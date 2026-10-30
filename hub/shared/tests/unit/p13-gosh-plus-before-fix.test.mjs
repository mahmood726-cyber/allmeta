import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {harness, formats, copy} = require('../../../../gosh/tests/plus-input-harness.cjs');
const beforeFix = require('../../../../gosh/tests/p13-before-fix.cjs');
const expectedTE = [.1, -.4, .8], expectedSE = [.2, .3, .4];

for (const model of ['FE', 'DL']) {
  test(`P13 pre-fix replay ${model}: exact source retains the plain-input control`, () => {
    const h = harness(beforeFix()), a = h.current(formats.plain, model);
    assert.deepEqual(a.te, expectedTE);
    assert.deepEqual(a.se, expectedSE);
    assert.equal(a.points.length, 7);
    assert.doesNotMatch(h.live.buildScript(a), /NaN|undefined|Infinity/);
  });
  test(`P13 pre-fix replay ${model}: canonical studies assertion detects dropped studies`, () => {
    const h = harness(beforeFix()), main = copy(h.run(formats.crlf).studies);
    const a = h.capture(formats.crlf, model);
    assert.equal(a.studies, undefined);
    assert.throws(() => assert.deepEqual(a.studies, main), assert.AssertionError);
  });
  for (const format of ['header', 'blank', 'crlf']) {
    test(`P13 pre-fix replay ${model}: live vectors assertion detects ${format}`, () => {
      const h = harness(beforeFix()), a = h.current(formats[format], model);
      assert.equal(a.k, 3);
      assert.ok(a.te.length > a.k);
      assert.throws(() => assert.deepEqual(a.te, expectedTE), assert.AssertionError);
      assert.throws(() => assert.deepEqual(a.se, expectedSE), assert.AssertionError);
      assert.match(h.live.buildScript(h.live.currentState()), /NaN/);
    });
  }
}

for (const [name, text] of [
  ['malformed row', 'bad'], ['nonpositive SE', '1, 1\n2, 0\n3, 1'],
  ['101 studies', Array(101).fill('.1,.2').join('\n')]
]) test(`P13 pre-fix replay: refusal assertion detects ${name}`, () => {
  for (const model of ['FE', 'DL']) {
    const h = harness(beforeFix());
    h.current(formats.plain, model);
    const before = h.snapshot();
    assert.throws(() => h.capture(text, model), /^Error: Need 3 through 100 valid studies$/);
    assert.throws(() => assert.throws(() => h.capture(text, model), /valid effect rows/), assert.AssertionError);
    assert.deepEqual(h.snapshot(), before);
  }
});

test('P13 pre-fix replay control: empty sampled-group refusal stays intact', () => {
  const h = harness(beforeFix());
  const sampled = Array.from({length: 16}, (_, i) => `${i / 10}, .2`).join('\n');
  assert.throws(() => h.capture(sampled, 'DL', 1), /empty with\/without/);
});
