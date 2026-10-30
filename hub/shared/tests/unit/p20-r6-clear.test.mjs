import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('effect-size-converter/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const core = scripts.find(s => s.includes('// --- math helpers ---'));
const adapter = scripts.find(s => s.includes('window.__almSnapshot = function'));
const [headers, firstRow] = read('effect-size-converter/tests/fixtures/esc-tiny.csv').trim().split(/\r?\n/);
const csvRow = Object.fromEntries(headers.split(',').map((key, i) => [key, firstRow.split(',')[i]]));
const plain = value => JSON.parse(JSON.stringify(value));

// A small DOM double, with real app conversion/render/CSV adapters and the real
// reset-undo module. No browser, copied restore implementation, or numerical oracle.
class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.value = '';
    this.children = [];
    this.listeners = new Map();
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
    this.innerHTML = '';
  }
  set innerHTML(value) { this.markup = value; this.children = []; }
  get innerHTML() { return this.markup; }
  appendChild(child) { this.children.push(child); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener(); }
  click() { if (!this.disabled) this.dispatch('click'); }
  showModal() { this.open = true; }
  close(value) { this.returnValue = value; this.open = false; this.dispatch('close'); }
}

function harness() {
  const elements = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const el = new Element(match[1]);
    el.value = /\bvalue="([^"]*)"/.exec(match[2])?.[1] || '';
    el.hidden = /\bhidden\b/.test(match[2]);
    if (el.tagName === 'SELECT') {
      const content = html.slice(match.index + match[0].length).split('</select>')[0];
      el.options = [...content.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map(m => ({ value: m[1] }));
      el.value = el.options[0].value;
    }
    elements.set(match[3], el);
  }
  const get = id => {
    assert.ok(elements.has(id), `Known DOM element: ${id}`);
    return elements.get(id);
  };
  const undo = new Element('button'), clear = new Element('button'), dialog = new Element('dialog');
  get('alm-undo-mount').querySelector = selector => {
    const result = { 'button[data-action="undo"]': undo, 'button[data-action="clear"]': clear, dialog }[selector];
    assert.ok(result, `Known reset control: ${selector}`);
    return result;
  };
  const document = {
    readyState: 'complete', head: new Element('head'), body: new Element('body'),
    getElementById: get,
    createElement: tag => new Element(tag),
    querySelector(selector) {
      if (selector === '#alm-axis-mount [data-edge="log"]') return null;
      assert.equal(selector, '#alm-undo-mount');
      return get('alm-undo-mount');
    },
  };
  let csvOptions;
  const context = vm.createContext({
    document, console, location: { hash: '' },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    alm: {
      csvUpload(options) { csvOptions = options; },
      axisControls() {}, resultsExport() {}, tooltips() {},
    },
  });
  context.window = context;
  for (const path of ['shared/effect-size-accuracy.js', 'hub/shared/url-state.js', 'hub/shared/reset-undo.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(core, context, { filename: 'effect-size-converter/core' });
  vm.runInContext(adapter, context, { filename: 'effect-size-converter/adapter' });
  return {
    context, get, undo,
    importCSV() { csvOptions.onParse({ rows: [csvRow] }); },
    clear(answer = 'confirm') { clear.click(); assert.equal(dialog.open, true); dialog.close(answer); },
    snapshot() { return plain(context.__almSnapshot()); },
    results() { return plain(context.__almResults()); },
  };
}

function populated() {
  const h = harness();
  h.importCSV();
  const extra = { 'ctx-p0': '0.2', 'der-t': '2.1', 'der-f': '4.41', 'der-f-sign': '-1',
    'der-p': '0.05', 'der-lo': '0.1', 'der-hi': '1.2', 'der-scale': 'raw' };
  for (const [id, value] of Object.entries(extra)) h.get(id).value = value;
  h.context.runConvert();
  assert.equal(h.get('in-type').value, 'SMD');
  assert.equal(h.get('in-smd-kind').value, 'g');
  assert.ok(Number(h.get('in-est').value) > 0);
  assert.ok(Number(h.get('in-se').value) > 0);
  assert.ok(h.get('results-body').children.length > 0);
  assert.ok(h.get('forest-points').innerHTML.includes('<rect'));
  return h;
}

test('P20-R6 plant: confirmed Clear all empties estimate, SE, context and derivation inputs', () => {
  const h = populated();
  h.clear();
  for (const id of ['in-est', 'in-se', 'ctx-p0', 'ctx-sd', 'der-t', 'der-n1',
    'der-f', 'der-f-sign', 'der-n2', 'der-p', 'der-lo', 'der-hi']) {
    assert.equal(h.get(id).value, '', `${id} must be empty`);
  }
});

test('P20-R6 plant: empty restore resets selectors to their valid defaults', () => {
  const h = populated();
  h.context.__almRestore({});
  assert.equal(h.get('in-type').value, 'OR');
  assert.equal(h.get('in-smd-kind').value, 'd');
  assert.equal(h.get('der-scale').value, 'log');
  assert.equal(h.get('smd-kind-field').hidden, true);
});

test('P20-R6 plant: Clear all removes live and exported results and plotted estimates', () => {
  const h = populated();
  h.clear();
  // Inspect live output before the export accessor can recalculate it.
  assert.deepEqual(plain(h.context.__almResultRows), []);
  assert.equal(h.get('results-body').children.length, 0);
  assert.equal(h.get('forest-points').innerHTML, '');
  assert.equal(h.get('forest-labels').innerHTML, '');
  assert.match(h.get('warn-slot').innerHTML, /Enter a point estimate/);
  const output = h.results();
  assert.deepEqual(output.rows, []);
  for (const key of ['input_estimate', 'input_se', 'baseline_risk', 'pooled_sd']) {
    assert.equal(output[key], null, key);
  }
});

test('P20-R6 control: Clear Undo restores every pre-clear field and CSV Undo restores the prior study', () => {
  const h = harness();
  const original = h.snapshot(), originalResults = h.results();
  h.importCSV();
  const imported = h.snapshot(), importedResults = h.results();
  assert.notDeepEqual(imported, original);
  assert.ok(importedResults.rows.length > 0);
  assert.equal(h.context.alm.resetUndo.size(), 1);
  h.clear();
  assert.equal(h.context.alm.resetUndo.size(), 2);
  assert.equal(h.undo.disabled, false);
  h.undo.click();
  assert.deepEqual(h.snapshot(), imported);
  assert.deepEqual(h.results(), importedResults);
  assert.equal(h.context.alm.resetUndo.size(), 1);
  h.undo.click();
  assert.deepEqual(h.snapshot(), original);
  assert.deepEqual(h.results(), originalResults);
  assert.equal(h.context.alm.resetUndo.size(), 0);
  assert.equal(h.undo.disabled, true);
});

test('P20-R6 control: cancelling Clear all preserves the form, output and Undo stack', () => {
  const h = populated();
  const before = h.snapshot(), output = h.results(), size = h.context.alm.resetUndo.size();
  h.clear('cancel');
  assert.deepEqual(h.snapshot(), before);
  assert.deepEqual(h.results(), output);
  assert.equal(h.context.alm.resetUndo.size(), size);
});

test('P20-R6 control: a nonempty partial restore preserves unspecified form fields', () => {
  const h = populated();
  const before = h.snapshot();
  h.context.__almRestore({ 'in-est': '0.5' });
  assert.deepEqual(h.snapshot(), { ...before, 'in-est': '0.5' });
  assert.equal(h.results().input_estimate, 0.5);
  assert.ok(h.get('results-body').children.length > 0);
});
