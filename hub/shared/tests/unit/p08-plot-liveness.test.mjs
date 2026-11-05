import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archive, archivePlotState, cases, loadPage, mutationEvidence, render } from './p08-plot-harness.mjs';

for (const item of cases) test(item.name, () => item.check(loadPage()));

test('P08 planted-defect evidence: each old loop exceeds the bound only in its own regression cases', () => {
  mutationEvidence();
});

test('P08 harness control: loop guards preserve ordinary SVG bytes on current and old loops', () => {
  for (const defects of [{}, { ticks: true }, { curve: true }, { ticks: true, curve: true }]) {
    const guarded = loadPage(defects), original = loadPage(defects, { instrument: false });
    for (const record of archive.result) {
      for (const fitted of [true, false]) {
        assert.equal(render(guarded, record.studies, fitted), render(original, record.studies, fitted));
      }
    }
  }
});

test('P08 replay plant: archived title preserves layout; omitted title is rejected', () => {
  const layout = svg => {
    const frame = svg.match(/<rect\b[^>]*\bfill="#fbfaf6"[^>]*>/);
    assert.ok(frame, 'plot frame exists');
    const bounds = ['x', 'y', 'width', 'height'].map(name => {
      const value = frame[0].match(new RegExp('\\b' + name + '="([^"]+)"'));
      assert.ok(value, name + ': frame coordinate exists');
      assert.ok(Number.isFinite(Number(value[1])));
      return Number(value[1]);
    });
    const bubbles = [...svg.matchAll(/<circle\b[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\br="([^"]+)"/g)]
      .map(match => match.slice(1).map(Number));
    return { bounds, bubbles };
  };
  for (const record of archive.result) {
    const expected = layout(record.svg);
    assert.equal(expected.bubbles.length, record.studies.length);
    for (const defects of [{}, { ticks: true, curve: true }]) {
      const run = loadPage(defects);
      const check = svg => assert.deepEqual(layout(svg), expected);
      // Control: neither progress mechanism changes the frame or study marks.
      check(render(run, record.studies, true, archivePlotState(record)));
      // Plant the pass-2 replay's omitted state, independently of the loop fix.
      assert.throws(() => check(render(run, record.studies)), { code: 'ERR_ASSERTION' });
    }
  }
});
