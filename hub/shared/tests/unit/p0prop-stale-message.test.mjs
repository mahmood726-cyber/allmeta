import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pageHarness} from '../fixtures/p0prop/page-harness.mjs';
import {valid, withBadRow} from '../fixtures/p0prop/cases.mjs';

test('plant: stale notice tells users how to refresh edited proportion results', () => {
  const html = fs.readFileSync(new URL('../../../../proportion-ma/index.html', import.meta.url), 'utf8');
  const notice = html.match(/<div id="analysis-stale"[^>]*>([^<]*)<\/div>/);
  assert.ok(notice, 'page contains the stale-results status');
  assert.equal(notice[1], 'Results out of date — press Run analysis');
});

test('control: refused input retains its specific error and disabled exports until a valid run', () => {
  const page = pageHarness();
  const before = page.run(valid);
  page.run(withBadRow('12.5,150,Bad study'));
  assert.equal(page.el('analysis-stale').hidden, false);
  assert.equal(page.el('parse-warn').hidden, false);
  assert.ok(page.el('parse-warn').textContent.length > 0);
  assert.equal(page.context._almLastPropMA(), null);
  assert.ok(page.buttons.every(button => button.disabled));
  assert.deepEqual(page.run(valid), before);
  assert.equal(page.el('analysis-stale').hidden, true);
  assert.equal(page.el('parse-warn').hidden, true);
  assert.ok(page.buttons.every(button => !button.disabled));
});
