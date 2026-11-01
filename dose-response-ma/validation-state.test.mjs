import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the shipped UI, engine and adapter; only browser DOM plumbing is stubbed.
function load() {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const nodes = new Map(), events = [];
  const document = {
    readyState: 'loading', addEventListener() {},
    getElementById(id) { return nodes.get(id); },
    querySelectorAll() { return [...nodes.values()].filter(n => n.id.startsWith('f-')); }
  };
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const listeners = {};
    nodes.set(id, { id, value: '', checked: false, innerHTML: '', textContent: '',
      options: [], addEventListener(type, fn) { listeners[type] = fn; },
      dispatchEvent(event) { events.push(event.type); listeners[event.type]?.(event); },
      click() { listeners.click?.(); }
    });
  }
  for (const [, id, body] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const node = nodes.get(id);
    node.options = [...body.matchAll(/<option value="([^"]+)"([^>]*)>/g)].map(m => ({ value: m[1], selected: m[2].includes('selected') }));
    node.value = (node.options.find(o => o.selected) || node.options[0]).value;
  }
  const context = vm.createContext({ document, Event: class { constructor(type) { this.type = type; } }, console });
  context.window = context; context.alm = { plotExport() {} };
  for (const path of ['../shared/ma-core.js', '../shared/dose-response.js', '../hub/shared/analysis-lifecycle.js'])
    vm.runInContext(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), context);
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
  vm.runInContext(fs.readFileSync(new URL('./validate/adapter.js', import.meta.url), 'utf8'), context);
  assert.ok(context._almLastDoseResponse(), nodes.get('msgs').innerHTML);
  return { context, nodes, events, live: context.AlmDoseValidate.live };
}

test('PLANTED regression: reading validation state emits no edits and retains the displayed fit', () => {
  const { context, events, live } = load();
  const fit = context._almLastDoseResponse();
  const first = live.currentState(), second = live.currentState();
  assert.deepEqual(second, first);
  assert.deepEqual(events, []);
  assert.equal(context._almLastDoseResponse(), fit);
  assert.equal(first.rows.length, 25);
  assert.ok(live.appValues(first).length > 15);
});

test('PLANTED regression: silent edits to every fit control refuse stale data; restoration is a control', () => {
  const { nodes, live } = load();
  const initial = live.currentState();
  for (const [id, node] of nodes) {
    if (!id.startsWith('f-')) continue;
    const field = id === 'f-mod' ? 'checked' : 'value', before = node[field];
    node[field] = field === 'checked' ? !before : before + ' changed';
    assert.throws(() => live.currentState(), /does not match the current inputs/, id);
    node[field] = before;
    assert.deepEqual(live.currentState(), initial, id + ' restored');
  }
});

test('CONTROL: an explicit valid refit supplies new rows; a refused refit cannot be validated', () => {
  const { context, nodes, live } = load();
  const before = live.currentState();
  nodes.get('f-data').value = nodes.get('f-data').value.replace('-0.223144', '-0.323144');
  nodes.get('btn-run').click();
  const after = live.currentState();
  assert.notDeepEqual(after, before);
  assert.equal(after.rows[1].logrr, -0.323144);
  assert.equal(after.result.slope, context._almLastDoseResponse().slope);
  nodes.get('f-data').value = 'invalid'; nodes.get('btn-run').click();
  assert.throws(() => live.currentState(), /before validating/);
});
