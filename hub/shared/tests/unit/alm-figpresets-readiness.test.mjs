import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the browser-side readiness helper itself without a browser subprocess.
function readiness(document) {
  const source = readFileSync(new URL('../features-figpresets.spec.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function waitForPlotEntrance() {');
  assert.notEqual(start, -1, 'Geometry snapshots need an entrance-animation readiness barrier');
  const end = source.indexOf('\n}', start) + 2;
  return vm.runInNewContext('(' + source.slice(start, end) + ')', { document });
}

test('geometry readiness waits for plot ancestors, including delayed entrance animations', async () => {
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const animation = { playState: 'running', effect: { getComputedTiming: () => ({ endTime: 360 }) }, finished };
  const parent = { parentElement: null, getAnimations: () => [animation] };
  const svg = { parentElement: parent, getAnimations: () => [] };
  const document = { querySelectorAll: () => [svg] };
  let y = 6;
  // Plant: taking a snapshot without the barrier captures the temporary transform.
  const early = y;
  let settled = false;
  const waiting = readiness(document)().then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  y = 0; finish(); await waiting;
  assert.equal(settled, true);
  assert.notEqual(early, y);
  // Control: the baseline is taken after the animation ends, with exact equality.
  const baseline = y;
  await readiness(document)();
  assert.equal(y, baseline);
  y += 1; // A real layout regression is still rejected, however small.
  assert.notEqual(y, baseline);
});

test('geometry readiness handles cancelled entrances and ignores infinite animations', async () => {
  const cancelled = { playState: 'running', effect: { getComputedTiming: () => ({ endTime: 300 }) },
    finished: Promise.reject(new Error('Animation cancelled')) };
  const infinite = { playState: 'running', effect: { getComputedTiming: () => ({ endTime: Infinity }) },
    get finished() { throw new Error('Must not wait for an infinite decorative animation'); } };
  const svg = { parentElement: null, getAnimations: () => [cancelled, infinite] };
  await readiness({ querySelectorAll: () => [svg] })();
  await readiness({ querySelectorAll: () => [] })();
});
