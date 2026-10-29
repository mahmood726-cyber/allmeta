import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const html = read('effect-size-converter/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const core = scripts.find(s => s.includes('function runConvert()'));
const adapter = scripts.find(s => s.includes('window.__almSnapshot ='));
assert.ok(core && adapter, 'exercise the actual page scripts');

// Small DOM for the actual page, reset/undo dialog, and URL-state modules.
// Only unrelated mount widgets are stubbed; calculations and rendering are real.
function element(tag = 'div', attrs = '') {
  const listeners = new Map();
  let markup = '', text = '';
  const node = {
    tagName: tag.toUpperCase(), type: /\btype="([^"]*)"/.exec(attrs)?.[1] || '',
    value: /\bvalue="([^"]*)"/.exec(attrs)?.[1] || '',
    checked: /\bchecked\b/.test(attrs), hidden: /\bhidden\b/.test(attrs),
    disabled: /\bdisabled\b/.test(attrs), children: [], attributes: {},
    get innerHTML() { return markup + text + this.children.map(n => `<${n.tagName}>${n.innerHTML}</${n.tagName}>`).join(''); },
    set innerHTML(value) { markup = String(value); text = ''; this.children = []; this.queries = new Map(); },
    get textContent() { return text || this.innerHTML.replace(/<[^>]*>/g, ''); },
    set textContent(value) { text = String(value); markup = ''; this.children = []; },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
    click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); },
    showModal() { this.open = true; },
    close(value) { this.returnValue = value; this.open = false; this.dispatchEvent({ type: 'close' }); },
    queries: new Map(),
    querySelector(selector) {
      if (this.queries.has(selector)) return this.queries.get(selector);
      const [, name, attr, value] = /^(\w+)(?:\[([^=]+)="([^"]+)"\])?$/.exec(selector) || [];
      const match = [...markup.matchAll(/<(\w+)\b([^>]*)>/g)]
        .find(m => m[1] === name && (!attr || m[2].includes(`${attr}="${value}"`)));
      const found = match ? element(match[1], match[2]) : null;
      this.queries.set(selector, found);
      return found;
    },
  };
  return node;
}

function page(hash = '') {
  const nodes = new Map([...html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)]
    .map(m => [m[3], element(m[1], m[2])]));
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    nodes.get(m[1]).value = /<option\b[^>]*value="([^"]*)"/.exec(m[2])[1];
  }
  const el = id => nodes.get(id) || null;
  const context = vm.createContext({
    document: {
      readyState: 'complete', head: element('head'), body: element('body'),
      getElementById: el, createElement: element,
      querySelector: selector => /^#[\w-]+$/.test(selector) ? el(selector.slice(1)) : null,
    },
    console, location: { hash },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    alm: { csvUpload() {}, axisControls() {}, resultsExport() {}, tooltips() {} },
  });
  context.window = context;
  for (const file of ['shared/effect-size-accuracy.js', 'shared/evalue.js',
    'hub/shared/reset-undo.js', 'hub/shared/url-state.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  vm.runInContext(core, context, { filename: 'effect-size-converter/core' });
  vm.runInContext(adapter, context, { filename: 'effect-size-converter/adapter' });
  const mount = el('alm-undo-mount');
  return {
    context, el,
    clear(answer = 'confirm') {
      mount.querySelector('button[data-action="clear"]').click();
      const dialog = mount.querySelector('dialog');
      assert.equal(dialog.open, true, 'Clear all opens confirmation');
      dialog.close(answer);
    },
    undo() { mount.querySelector('button[data-action="undo"]').click(); },
  };
}

const numericIds = ['in-est', 'in-se', 'ctx-p0', 'ctx-sd', 'der-t', 'der-n1',
  'der-f', 'der-n2', 'der-p', 'der-lo', 'der-hi', 'ev-point', 'ev-lo', 'ev-hi'];
const selectIds = ['in-type', 'in-smd-kind', 'der-f-sign', 'der-scale', 'ev-measure'];
const plain = value => JSON.parse(JSON.stringify(value));
function form(p) {
  return Object.fromEntries([...numericIds, ...selectIds].map(id => [id, p.el(id).value])
    .concat([['ev-rare', p.el('ev-rare').checked]]));
}
function populated() {
  const p = page();
  p.context.__almLoadCSV([{ m1: 52.5, sd1: 8.2, n1: 30, m2: 47.1, sd2: 7.9, n2: 30 }]);
  for (const [id, value] of Object.entries({
    'ctx-p0': '0.2', 'der-t': '2.1', 'der-f': '4.41', 'der-f-sign': '-1',
    'der-p': '0.031', 'der-lo': '0.1', 'der-hi': '1.2', 'der-scale': 'raw',
    'ev-measure': 'OR', 'ev-point': '2.4', 'ev-lo': '1.4', 'ev-hi': '3.2',
  })) p.el(id).value = value;
  p.el('ev-rare').checked = true;
  p.el('ev-point').dispatchEvent({ type: 'input' });
  p.el('btn-convert').click();
  assert.ok(p.context.__almResultRows.length > 0, 'control: CSV import produced conversion rows');
  assert.ok(p.el('forest-points').innerHTML.includes('<rect'), 'control: populated forest');
  assert.ok(p.context.__almLastEValue().point > 1, 'control: computed E-value');
  return p;
}
function assertNoConversions(p) {
  assert.equal(p.context.__almResultRows.length, 0, 'no cached conversion results');
  assert.equal(p.el('results-body').children.length, 0, 'no rendered conversion rows');
  assert.equal(p.el('forest-points').innerHTML, '', 'no plotted estimates or CIs');
  assert.equal(p.el('forest-labels').innerHTML, '', 'no labels for old estimates');
  const exported = p.context.__almResults();
  assert.equal(exported.rows.length, 0, 'export cannot resurrect old results');
  for (const key of ['input_estimate', 'input_se', 'baseline_risk', 'pooled_sd'])
    assert.equal(exported[key], null, `export ${key} is empty`);
}

test('plant P20-R6: confirmed Clear all empties every calculation input', () => {
  const p = populated();
  p.clear();
  for (const id of numericIds) assert.equal(p.el(id).value, '', `${id} must be empty`);
  assert.equal(p.el('der-f-sign').value, '');
  assert.equal(p.el('ev-rare').checked, false);
});

test('plant P20-R6: confirmed Clear all removes computed rows, plot marks and exports', () => {
  const p = populated();
  p.clear();
  assertNoConversions(p);
});

test('plant P20-R6: confirmed Clear all removes the independent E-value result', () => {
  const p = populated();
  p.clear();
  assert.equal(p.context.__almLastEValue(), null);
  assert.doesNotMatch(p.el('ev-out').innerHTML, /E-value \(point\)|<strong>/);
});

test('plant P20-R6: reloading the cleared share link keeps inputs and results empty', () => {
  const p = populated();
  p.clear();
  const restored = page(p.context.location.hash);
  for (const id of numericIds) assert.equal(restored.el(id).value, '', `${id} remains empty after reload`);
  assertNoConversions(restored);
  assert.equal(restored.context.__almLastEValue(), null);
});

test('control P20-R6: Cancel preserves all fields, computed results and Undo history', () => {
  const p = populated(), before = form(p), rows = plain(p.context.__almResults());
  const ev = plain(p.context.__almLastEValue()), size = p.context.alm.resetUndo.size();
  const hash = p.context.location.hash;
  p.clear('cancel');
  assert.deepEqual(form(p), before);
  assert.deepEqual(plain(p.context.__almResults()), rows);
  assert.deepEqual(plain(p.context.__almLastEValue()), ev);
  assert.equal(p.context.alm.resetUndo.size(), size);
  assert.equal(p.context.location.hash, hash);
});

test('control P20-R6: Undo after confirmed Clear restores all inputs and both computations', () => {
  const p = populated(), before = form(p), rows = plain(p.context.__almResults());
  const ev = plain(p.context.__almLastEValue()), size = p.context.alm.resetUndo.size();
  p.clear();
  assert.equal(p.context.alm.resetUndo.size(), size + 1);
  p.undo();
  assert.equal(p.context.alm.resetUndo.size(), size);
  assert.deepEqual(form(p), before);
  assert.deepEqual(plain(p.context.__almResults()), rows);
  assert.deepEqual(plain(p.context.__almLastEValue()), ev);
  assert.ok(p.el('forest-points').innerHTML.includes('<rect'));
});

test('plant P20-R6: Undo restores E-value inputs even after editing the cleared form', () => {
  const p = populated(), before = form(p), ev = plain(p.context.__almLastEValue());
  p.clear();
  p.el('ev-point').value = '4';
  p.el('ev-rare').checked = false;
  p.el('ev-point').dispatchEvent({ type: 'input' });
  p.undo();
  assert.deepEqual(form(p), before);
  assert.deepEqual(plain(p.context.__almLastEValue()), ev);
  const restored = page(p.context.location.hash);
  assert.deepEqual(form(restored), before, 'Undo updates the share link too');
});

test('control P20-R6: fresh inputs after Clear still convert normally', () => {
  const p = populated();
  p.clear();
  for (const [id, value] of Object.entries({
    'in-type': 'OR', 'in-est': '1.5', 'in-se': '0.2', 'ctx-p0': '0.1',
  })) p.el(id).value = value;
  p.el('btn-convert').click();
  const row = p.context.__almResultRows.find(r => r.scale === 'OR');
  assert.equal(row.point, 1.5);
  assert.equal(row.se, 0.2);
  assert.ok(row.lo < row.point && row.hi > row.point);
});

test('control P20-R6: legacy snapshots without E-value fields still restore conversions', () => {
  const p = page(), ev = plain(p.context.__almLastEValue());
  p.context.__almRestore({ 'in-type': 'OR', 'in-est': '1.5', 'in-se': '0.2' });
  assert.equal(p.context.__almResultRows.find(r => r.scale === 'OR').point, 1.5);
  assert.deepEqual(plain(p.context.__almLastEValue()), ev);
});
