// Diagnose the existing strict DOM failures on both original and fixed sources.
// Never alter a contract, assertion, corpus, or application file.
import './p16-test-deps.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { harness, root } = require('../nma-inconsistency-dom.cjs');
const json = value => JSON.parse(JSON.stringify(value));
const originalFiles = new Map(['index.html', 'plus-core.js', 'plus-ui.js', 'validate/live.js']
  .map(file => [resolve(root, 'nma-inconsistency', file), join(tmpdir(), 'p16-r3-old-' + file.split('/').at(-1))]));
function makeHarness(original, options = {}) {
  if (!original) return harness(options);
  const read = fs.readFileSync;
  try {
    // Script loading is synchronous. Other dependencies remain exactly as shipped.
    fs.readFileSync = function (file, ...args) {
      const old = typeof file === 'string' && originalFiles.get(resolve(file));
      return read.call(this, old || file, ...args);
    };
    return harness(options);
  } finally { fs.readFileSync = read; }
}
function differences(actual, expected, path = '', out = []) {
  if (out.length >= 6 || JSON.stringify(actual) === JSON.stringify(expected)) return out;
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    for (const key of new Set([...Object.keys(actual), ...Object.keys(expected)])) {
      differences(actual[key], expected[key], path + '.' + key, out);
      if (out.length >= 6) break;
    }
  } else out.push({ path, actual, expected });
  return out;
}
const reports = {};
for (const original of [true, false]) {
  const name = original ? 'original' : 'fixed';
  const { c, document } = makeHarness(original);
  const a = c.AlmIncoValidationAdapter, before = JSON.stringify(a.snapshot());
  const loaded = Object.fromEntries(a.contract.files.map(f => [f.path,
    fs.readFileSync(join(root, 'nma-inconsistency', f.path))]));
  const replay = json(await a.corpus.run(loaded));
  assert.equal(replay.checks, 4627);
  assert.equal(JSON.stringify(a.snapshot()), before, name + ' state restoration');
  const groups = {}, examples = {};
  for (const f of replay.failed) {
    groups[f.quantity] = (groups[f.quantity] || 0) + 1;
    if (!examples[f.quantity]) examples[f.quantity] = { id: f.id, differences: differences(f.app, f.ref) };
  }
  const display = json(a.live.currentState().values.filter(v => v.key.startsWith('display.')));
  const disabled = [...document.querySelectorAll('main button,#alm-export-mount button')]
    .filter(b => b.disabled || b.closest('fieldset[disabled],[inert]'))
    .map(b => ({ id: b.id, text: b.textContent }));
  // Also inspect the existing harness's live timer mode without modifying any
  // assertions in the original suites. This distinguishes startup from steady state.
  const active = makeHarness(original, { live: true });
  await active.advance(2000);
  assert.equal(active.c.AlmIncoPlus.state().busy, false, name + ' settled LOO');
  const settledDisplay = json(active.c.AlmIncoValidationAdapter.live.currentState().values
    .filter(v => v.key.startsWith('display.')));
  reports[name] = { checks: replay.checks, passed: replay.passed, groups, examples,
    display, disabled, settledDisplay, failed: replay.failed };
  console.log('P16_DOM_DIAGNOSE ' + name + ' ' + JSON.stringify({
    checks: replay.checks, passed: replay.passed, groups, examples, display, disabled, settledDisplay,
  }));
}
fs.writeFileSync(join(tmpdir(), 'p16-r3-dom-diagnosis.json'), JSON.stringify(reports, null, 2));
assert.deepEqual(reports.fixed.failed, reports.original.failed,
  'the fixed sources must introduce no new pinned DOM discrepancies');
assert.deepEqual(reports.fixed.display, reports.original.display,
  'original and fixed live display checks must agree');
assert.deepEqual(reports.fixed.settledDisplay, reports.original.settledDisplay,
  'original and fixed settled live display checks must agree');
console.log('P16_DOM_DIAGNOSE original/fixed failure details agree; this is not a green DOM gate');
