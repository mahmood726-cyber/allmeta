import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('limit-ma/index.html');
const primary = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('var _lastResults = null;'));
const initial = '0.1,0.1,A\n0.2,0.15,B\n0.3,0.2,C';
const shifted = '1.1,0.1,A\n1.2,0.15,B\n1.3,0.2,C';
const panels = ['plus-body', 'plus-details', 'plus-forest', 'plus-funnel', 'plus-interpretation'];

// Small DOM/event boundary for node:test: execute the unmodified primary script,
// lifecycle wrapper, sensitivity engines and UI. No estimator or runner is mocked.
class Element {
  constructor(tag = 'div', id = '') {
    Object.assign(this, { tag, id, value: '', checked: false, disabled: false,
      dataset: {}, attributes: {}, children: [], listeners: new Map(), content: '' });
  }
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return this.content + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { this.content = String(value); this.children = []; }
  get innerHTML() { return this.content; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.content = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this }); }
  click() { this.dispatch('click'); }
  matches(selector) { return selector === '#' + this.id; }
}

function harness() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element('div', match[1])]));
  const el = id => {
    assert.ok(elements.has(id), 'Known page element: ' + id);
    return elements.get(id);
  };
  const documentEvents = new Element();
  const document = {
    getElementById: el,
    createElement: tag => new Element(tag),
    createElementNS: (namespaceURI, tag) => Object.assign(new Element(tag), { namespaceURI }),
    createTextNode: text => ({ textContent: text }),
    querySelectorAll: selector => selector === '#src' ? [el('src')] : [],
    addEventListener: (type, listener) => documentEvents.addEventListener(type, listener),
  };
  el('alm-plus').querySelectorAll = selector => {
    assert.equal(selector, 'input[type=checkbox]');
    return ['limit', 'fill', 'reg', 'contour'].map(name => el('plus-' + name + '-toggle'));
  };
  for (const name of ['limit', 'fill', 'reg']) el('plus-' + name + '-toggle').checked = true;
  el('src').value = initial;
  el('plus-alpha').value = '0.10';
  const noop = () => {};
  const alm = {
    csvUpload: noop, plotExport: noop, axisControls: noop, resultsExport: noop,
    resetUndo: noop, tooltips: noop, urlState: Object.assign(noop, { read: () => ({}) }),
  };
  const context = vm.createContext({ document, alm, structuredClone });
  context.window = context;
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context);
  assert.ok(primary, 'Primary page script is present');
  vm.runInContext(primary, context, { filename: 'limit-ma/index.html' });
  for (const path of ['shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
    'limit-ma/plus-opt.js', 'limit-ma/plus-selmodel.js', 'limit-ma/plus.js', 'limit-ma/plus-ui.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  return {
    el, app: context,
    edit(text, type) {
      el('src').value = text;
      for (const listener of documentEvents.listeners.get(type) || []) listener({ target: el('src') });
      el('src').dispatch(type);
    },
  };
}

function completed(h) {
  assert.match(h.el('plus-status').textContent, /Sensitivity calculations complete/);
  const state = h.app.AlmLimitPlusUI.snapshot();
  assert.ok(state);
  assert.equal(state.results.RE.status, 'ok');
  assert.equal(state.results.RE.values.mu, h.app._almLastLimit().re_est);
  for (const id of panels) assert.ok(h.el(id).children.length > 0, id + ' rendered');
  return state;
}

function cleared(h) {
  assert.equal(h.app.AlmLimitPlusUI.snapshot(), null, 'Stale sensitivity snapshot must be discarded');
  assert.doesNotMatch(h.el('plus-status').textContent, /complete/i);
  assert.match(h.el('plus-status').textContent, /current input/);
  for (const id of panels) assert.equal(h.el(id).children.length, 0, id + ' cleared');
  // A layer toggle must not resurrect the old plotted data.
  h.el('plus-contour-toggle').checked = true;
  h.el('plus-contour-toggle').dispatch('change');
  for (const id of panels) assert.equal(h.el(id).children.length, 0, id + ' stays cleared');
}

test('P12-R1 plant: successful primary rerun clears completed sensitivity results', t => {
  const h = harness();
  h.el('plus-run').click();
  const old = completed(h);
  // Programmatic replacement deliberately emits no input event: the run itself
  // must invalidate, including when inputs arrive from another page control.
  h.el('src').value = shifted;
  h.el('btn-run').click();
  const current = h.app._almLastLimit().re_est;
  assert.notEqual(current, old.results.RE.values.mu);
  t.diagnostic(JSON.stringify({ primaryRE: current, previousSensitivityRE: old.results.RE.values.mu,
    sensitivityStatus: h.el('plus-status').textContent }));
  cleared(h);
});

test('P12-R1 plant: CSV load invalidates sensitivity through the primary runner', () => {
  const h = harness();
  h.el('plus-run').click();
  const old = completed(h);
  h.app.__almLimitLoad([{ yi: 1.1, sei: .1 }, { yi: 1.2, sei: .15 }, { yi: 1.3, sei: .2 }]);
  assert.notEqual(h.app._almLastLimit().re_est, old.results.RE.values.mu);
  cleared(h);
});

for (const type of ['input', 'change']) {
  test('P12-R1 plant: source ' + type + ' clears sensitivity before a primary rerun', () => {
    const h = harness();
    h.el('plus-run').click();
    completed(h);
    const primaryBefore = h.app._almLastLimit();
    h.edit(shifted, type);
    assert.equal(h.app._almLastLimit(), primaryBefore, 'No primary computation was requested');
    cleared(h);
  });
}

test('P12-R1 control: explicit sensitivity rerun refreshes the primary and comparison results', () => {
  const h = harness();
  h.el('plus-run').click();
  const old = completed(h);
  h.el('src').value = shifted;
  h.el('plus-run').click();
  const fresh = completed(h);
  assert.notEqual(fresh.results.RE.values.mu, old.results.RE.values.mu);
  assert.deepEqual(Array.from(fresh.c.te), [1.1, 1.2, 1.3]);
});

test('P12-R1 control: alpha changes still rerun completed sensitivity comparisons', () => {
  const h = harness();
  h.el('plus-run').click();
  const old = completed(h);
  h.el('plus-alpha').value = '0.05';
  h.el('plus-alpha').dispatch('change');
  const fresh = completed(h);
  assert.notEqual(fresh, old);
  assert.equal(fresh.results.RE.values.mu, old.results.RE.values.mu);
});

test('P12-R1 control: primary validation snapshot/restore preserves sensitivity results and status', () => {
  const h = harness();
  h.el('plus-run').click();
  const state = completed(h), status = h.el('plus-status').textContent;
  const snap = h.app.__almLimitValidationSnapshot();
  h.app.__almLimitValidationRun(shifted, true);
  assert.notEqual(h.app._almLastLimit().re_est, state.results.RE.values.mu);
  assert.equal(h.app.AlmLimitPlusUI.snapshot(), state, 'Temporary validation run preserves the user panel');
  h.app.__almLimitValidationRestore(snap);
  assert.deepEqual(h.app.__almLimitValidationSnapshot(), snap);
  assert.equal(completed(h), state);
  assert.equal(h.el('plus-status').textContent, status);
});

test('P12-R1 control: sensitivity validation restores its saved comparison snapshot', () => {
  const h = harness();
  h.el('plus-run').click();
  const state = completed(h), status = h.el('plus-status').textContent;
  const snap = h.app.__almLimitValidationSnapshot();
  // Follow the snapshot/render/restore sequence used by validate/plus-adapter.js.
  h.app.__almLimitValidationRun(shifted, true);
  const rows = h.app.__almLimitParse(shifted);
  const c = { te: rows.map(row => row.te), se: rows.map(row => row.se) };
  const limit = h.app._almLastLimit();
  h.app.AlmLimitPlusUI.render(h.app.AlmLimitPlus.compute(c, limit, .1), c, limit);
  assert.notEqual(h.app.AlmLimitPlusUI.snapshot().results.RE.values.mu, state.results.RE.values.mu);
  h.app.__almLimitValidationRestore(snap);
  h.app.AlmLimitPlusUI.restore(state);
  h.el('plus-status').textContent = status;
  assert.deepEqual(completed(h), state);
  assert.deepEqual(h.app.__almLimitValidationSnapshot(), snap);
});

test('P12-R1 control: a refused primary rerun clears completed sensitivity results', () => {
  const h = harness();
  h.el('plus-run').click();
  completed(h);
  h.el('src').value = 'bad,0.1\n0.2,0.15\n0.3,0.2';
  h.el('btn-run').click();
  assert.equal(h.app._almLastLimit(), null);
  assert.match(h.el('limit-error').textContent, /complete number/);
  cleared(h);
});
