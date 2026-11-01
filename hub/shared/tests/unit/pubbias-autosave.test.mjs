import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const html = fs.readFileSync(path.join(root, 'pubbias-tests/index.html'), 'utf8');
const setup = [...html.matchAll(new RegExp('<script>([\\s\\S]*?)</script>', 'g'))].map(m => m[1]).find(s => s.includes('AlmAutosave.install'));
const autosave = fs.readFileSync(path.join(root, 'shared/autosave.js'), 'utf8');

// Exercise the real app configuration and autosave module with representative
// legacy and dynamically mounted controls. Only DOM selection/events are faked.
function exercise(source, additions = true) {
  const fields = [], listeners = {}, storage = new Map();
  function field(tagName, type, id, area = '', value = 'draft') {
    const e = { tagName, type, id, area, value, checked: false, dataset: {},
      matches(sel) {
        const base = sel.split(':not(')[0];
        const matches = base === tagName.toLowerCase() || base === 'input[type=' + type + ']';
        return matches && ![...sel.matchAll(/:not\(#([\w-]+) \*\)/g)].some(m => m[1] === area);
      } };
    fields.push(e); return e;
  }
  const src = field('TEXTAREA', '', 'src');
  field('SELECT', '', 'format', '', 'te-se');
  field('INPUT', 'number', '', '', '0.1');
  field('INPUT', 'checkbox', '', '', '');
  let feature, extra;
  if (additions) {
    feature = field('TEXTAREA', '', 'entry-paste', 'alm-features', 'unconfirmed extraction');
    field('SELECT', '', '', 'alm-features', 'point');
    field('INPUT', 'number', '', 'alm-features', '99');
    extra = field('INPUT', 'checkbox', 'plus-only-flagged', 'alm-plus');
  }
  const document = { readyState: 'complete',
    querySelectorAll: sel => fields.filter(e => e.matches(sel)),
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn) };
  const sandbox = { document, localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  }, setTimeout: fn => { fn(); return 1; }, clearTimeout() {} };
  sandbox.window = sandbox;
  vm.runInNewContext(autosave, sandbox);
  vm.runInNewContext(source, sandbox);
  const emit = target => (listeners.input || []).forEach(fn => fn({ target }));
  const values = () => JSON.parse(storage.get('alm-autosave:pubbias-tests') || '{"values":{}}').values;
  emit(src);
  const saved = values();
  storage.clear();
  if (feature) emit(feature);
  if (extra) emit(extra);
  return { saved, addonOnly: values() };
}

test('control: original inputs and positional keys remain saved', () => {
  assert.deepEqual(exercise(setup, false).saved, { src: 'draft', format: 'te-se', 'idx:2': '0.1', 'idx:3': false });
});
test('feature and plus controls neither enter nor trigger the legacy draft', () => {
  const baseline = exercise(setup, false);
  const mounted = exercise(setup);
  assert.deepEqual(mounted.saved, baseline.saved);
  assert.deepEqual(mounted.addonOnly, {});
});
test('PLANTED: including feature controls detects added fields and shifted keys', () => {
  const planted = setup.replaceAll(':not(#alm-features *)', '');
  const result = exercise(planted);
  assert.notDeepEqual(result.saved, exercise(setup, false).saved);
  assert.equal(result.saved['entry-paste'], 'unconfirmed extraction');
  assert.ok(Object.keys(result.addonOnly).length > 0);
});
