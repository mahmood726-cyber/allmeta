import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('influence/index.html');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('const LS_KEY = "influence-v1"'));
assert.ok(main, 'load the actual influence analysis and validation hooks');
const ORIGINAL = '0.1, 0.10, A\n0.3, 0.12, B\n0.4, 0.15, C';
const EDITED = '10, 0.10, A\n20, 0.12, B\n30, 0.15, C';
const REPLAY = '-1, 0.10, X\n-2, 0.12, Y\n-3, 0.15, Z';

function setup() {
  // Minimal DOM for status/input events and rendered markup storage. The page's
  // actual analysis, numerical helpers, lifecycle and restore hooks run unchanged.
  // Descendant table controls/layout are outside this node-only regression test.
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    id, value: '', hidden: true, disabled: false, innerHTML: '', textContent: '',
    listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this[name] = value; },
    matches(selector) { return selector === '#' + id; }
  }]));
  const events = {};
  const document = {
    getElementById: id => elements.get(id),
    querySelectorAll: selector => selector === '#src' ? [elements.get('src')] : [],
    querySelector: () => null,
    addEventListener(type, fn, capture) { assert.equal(capture, true); events[type] = fn; }
  };
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const window = {};
  const context = vm.createContext({ window, document, localStorage, structuredClone });
  const src = elements.get('src');
  src.value = ORIGINAL;
  for (const path of ['shared/ma-core.js', 'shared/diagnostic-plots.js',
    'influence/influence-extra.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(main, context, { filename: 'influence/index.html' });
  return {
    window, src, elements,
    event(type = 'input') { events[type]({ target: src }); },
    edit(value) { src.value = value; this.event(); },
    run(value) { window.__almRestore({ data: value }); },
    snapshot() { return window.__almInfluenceValidationSnapshot(); },
    restore(snapshot) { window.__almInfluenceValidationRestore(snapshot); },
    status() { return { updatedHidden: elements.get('analysis-status').hidden,
      staleHidden: elements.get('analysis-stale').hidden }; }
  };
}

const CURRENT = { updatedHidden: false, staleHidden: true };
const STALE = { updatedHidden: true, staleHidden: false };
const REFUSED = { updatedHidden: true, staleHidden: true };

for (const [kind, edit] of [['valid', EDITED], ['invalid', 'not yet valid']]) {
  test(`P11-R4: pending ${kind} edit stays stale after validation restoration`, () => {
    const h = setup();
    h.edit(edit);
    assert.deepEqual(h.status(), STALE);
    const before = h.snapshot();
    h.run(REPLAY);
    assert.notEqual(h.window._almLastInfluence().mu, before.full.mu);
    assert.deepEqual(h.status(), CURRENT);
    h.restore(before);
    assert.equal(h.src.value, edit);
    assert.deepEqual(structuredClone(h.window._almLastInfluence()), before.full);
    assert.equal(h.elements.get('body').innerHTML, before.html.body);
    assert.deepEqual(h.status(), STALE, 'unsubmitted input must not be labelled Analysis updated');
    h.event('change');
    assert.deepEqual(h.status(), STALE);
    assert.deepEqual(h.snapshot(), before);
  });
}

test('P11-R4 control: current analysis stays current immediately after restore', () => {
  const h = setup(), before = h.snapshot();
  h.run(REPLAY);
  h.restore(before);
  assert.equal(h.src.value, ORIGINAL);
  assert.deepEqual(structuredClone(h.window._almLastInfluence()), before.full);
  assert.deepEqual(h.status(), CURRENT);
  assert.deepEqual(h.snapshot(), before);
});

test('P11-R4: change event for restored completed input does not mark it stale', () => {
  const h = setup(), before = h.snapshot();
  h.run(REPLAY);
  h.restore(before);
  h.event('change');
  assert.deepEqual(h.status(), CURRENT, 'restore must recover the last completed input');
});

test('P11-R4: editing to a replay input still marks the restored analysis stale', () => {
  const h = setup(), before = h.snapshot();
  h.run(REPLAY);
  h.restore(before);
  h.edit(REPLAY);
  assert.deepEqual(h.status(), STALE, 'validation inputs must not remain completed or attempted');
});

test('P11-R4: refused input restores its error and hidden analysis notices', () => {
  const h = setup();
  h.run('bad input');
  assert.deepEqual(h.status(), REFUSED);
  const before = h.snapshot();
  h.run(REPLAY);
  h.restore(before);
  assert.equal(h.window._almLastInfluence(), null);
  assert.equal(h.elements.get('input-error').hidden, false);
  assert.deepEqual(h.status(), REFUSED);
  assert.deepEqual(h.snapshot(), before);
});

test('P11-R4: change event for restored refused input preserves its attempted state', () => {
  const h = setup();
  h.run('bad input');
  const before = h.snapshot();
  // Both runs hide both notices, isolating attempted-state restoration from visibility.
  h.run('different bad input');
  h.restore(before);
  assert.deepEqual(h.status(), REFUSED);
  h.event('change');
  assert.deepEqual(h.status(), REFUSED, 'unchanged refused input has already been attempted');
});

test('P11-R4 control: explicit Run after restoration updates the edited analysis', () => {
  const h = setup();
  h.edit(EDITED);
  const before = h.snapshot();
  h.run(REPLAY);
  h.restore(before);
  h.run(h.src.value);
  assert.notEqual(h.window._almLastInfluence().mu, before.full.mu);
  assert.deepEqual(h.status(), CURRENT);
  h.event('change');
  assert.deepEqual(h.status(), CURRENT);
});
