import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('effect-size-converter/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const core = scripts.find(s => s.includes('function runConvert()'));
const adapter = scripts.find(s => s.includes('window.__almResults = function'));
assert.ok(core && adapter, 'Load the real conversion and adapter script blocks');

// Minimal DOM/download boundary only: conversion, validation, table/forest
// rendering, the app adapter, and every export click handler run unmodified.
function harness() {
  const downloads = [];
  const blobs = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tag = tag;
      this.value = '';
      this.children = [];
      this.listeners = new Map();
      this.actions = new Map();
      this.innerHTML = '';
    }
    set innerHTML(value) {
      this.markup = value;
      this.children = [];
      this.actions.clear();
      for (const [, action] of value.matchAll(/data-action="([^"]+)"/g)) {
        this.actions.set(action, new Element('button'));
      }
    }
    get innerHTML() { return this.markup; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    setAttribute(key, value) { this[key] = value; }
    querySelector(selector) {
      const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      return this.actions.get(action) || null;
    }
    addEventListener(event, listener) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(listener);
    }
    async click() {
      if (this.tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
      for (const listener of this.listeners.get('click') || []) await listener();
    }
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, new Element()]));
  const el = id => {
    assert.ok(elements.has(id), `Known element: ${id}`);
    return elements.get(id);
  };
  for (const [tag, id] of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    el(id).value = tag.match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  for (const [, id, options] of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    el(id).value = options.match(/<option\b[^>]*\bvalue="([^"]*)"/)?.[1] || '';
  }
  const document = {
    title: 'Effect size converter', readyState: 'complete',
    head: new Element('head'), body: new Element('body'),
    getElementById: el,
    createElement: tag => new Element(tag),
    querySelector: selector => elements.get(selector.replace(/^#/, '')) || null,
  };
  const noop = () => {};
  const urlState = Object.assign(noop, { read: () => null, write: noop });
  const context = vm.createContext({
    document, console, Blob, setTimeout: noop,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL: noop,
    },
    alm: { csvUpload: noop, axisControls: noop, urlState, resetUndo: noop, tooltips: noop },
  });
  context.window = context;
  vm.runInContext(read('shared/effect-size-accuracy.js'), context);
  vm.runInContext(read('hub/shared/results-export.js'), context);
  vm.runInContext(core, context);
  vm.runInContext(adapter, context);
  return {
    el,
    set(values) { for (const [id, value] of Object.entries(values)) el(id).value = String(value); },
    click: id => el(id).click(),
    results: () => JSON.parse(JSON.stringify(context.__almResults())),
    rows: () => JSON.parse(JSON.stringify(context.__almResultRows)),
    display: () => ({
      table: el('results-body').children.map(row => row.innerHTML),
      warning: el('warn-slot').innerHTML,
      forest: ['forest-points', 'forest-labels', 'forest-axis'].map(id => el(id).innerHTML),
    }),
    async export(action) {
      const before = downloads.length;
      const button = el('alm-export-mount').querySelector(`[data-action="${action}"]`);
      assert.ok(button, `Export button ${action} is wired`);
      await button.click();
      assert.equal(downloads.length, before + 1, 'Exactly one download per click');
      const download = downloads.at(-1);
      assert.ok(download.blob instanceof Blob);
      return { name: download.name, text: await download.blob.text() };
    },
  };
}

const formats = [
  ['json', '.json'], ['csv', '.csv'], ['md', '.md'],
  ['report-md', '-report.md'], ['report-txt', '-report.txt'],
];

function field(download, action, key) {
  if (action === 'json') return JSON.parse(download.text)[key];
  let value;
  if (action === 'csv') {
    value = download.text.match(new RegExp(`^${key},(.*)$`, 'm'))?.[1].trim();
    if (value?.startsWith('"')) value = value.slice(1, -1).replace(/""/g, '"');
  } else if (action === 'report-txt') {
    value = download.text.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1];
  } else {
    value = download.text.match(new RegExp(`^\\| ${key}\\s*\\| (.*?)\\s*\\|$`, 'm'))?.[1];
  }
  assert.notEqual(value, undefined, `${action} contains ${key}`);
  return key === 'rows' ? JSON.parse(value) : value;
}

const rejected = [
  ['incomplete CI', { 'der-lo': '0.5' }, /Enter both CI bounds/],
  ['t on OR', { 'der-t': '2.1', 'der-n1': '30', 'der-n2': '30' }, /derives SMD only/],
];

for (const [reason, input, error] of rejected) {
  for (const [action, suffix] of formats) {
    test(`P20-R4 plant: ${action} preserves rejected Derive (${reason})`, async () => {
      const h = harness();
      assert.equal(h.rows().length, 3, 'A valid conversion exists before the rejection');
      assert.equal(h.rows()[0].point, 0.75);
      assert.equal(h.rows()[0].se, 0.12);
      h.set(input);
      await h.click('btn-derive');
      assert.deepEqual(h.rows(), [], 'Derive clears the result cache');
      const rejectedDisplay = h.display();
      assert.deepEqual(rejectedDisplay.table, [], 'Derive clears the displayed table');
      assert.match(rejectedDisplay.warning, /Error/);
      assert.match(rejectedDisplay.warning, error);
      assert.equal(h.el('in-est').value, '0.75', 'Valid inputs remain after rejection');
      assert.equal(h.el('in-se').value, '0.12');
      for (let attempt = 0; attempt < 2; attempt++) {
        const download = await h.export(action);
        assert.equal(download.name, 'effect-size-converter-results' + suffix);
        assert.deepEqual(field(download, action, 'rows'), [], 'Export must not resurrect rejected rows');
        assert.deepEqual(h.rows(), []);
        assert.deepEqual(h.display(), rejectedDisplay, 'Export must preserve the empty table, plot, and error');
      }
    });
  }
}

test('P20-R4 plant: direct results getter preserves rejected Derive', async () => {
  const h = harness();
  h.set({ 'der-lo': '0.5' });
  await h.click('btn-derive');
  assert.deepEqual(h.rows(), []);
  const display = h.display();
  assert.match(display.warning, /Error/);
  assert.deepEqual(h.results().rows, []);
  assert.deepEqual(h.display(), display);
});

for (const [action, suffix] of formats) {
  test(`P20-R4 control: ${action} exports a completed conversion`, async () => {
    const h = harness();
    h.set({ 'in-est': '1.5', 'in-se': '0.2', 'ctx-p0': '0.25' });
    await h.click('btn-convert');
    const display = h.display();
    assert.equal(display.table.length, 5);
    const expected = h.rows().map(r => ({
      scale: r.scale, point: r.point, se: r.se,
      ci_lower: r.lo ?? null, ci_upper: r.hi ?? null, note: r.note,
    }));
    assert.equal(expected[0].scale, 'OR');
    assert.equal(expected[0].point, 1.5);
    assert.equal(expected[0].se, 0.2);
    const download = await h.export(action);
    assert.equal(download.name, 'effect-size-converter-results' + suffix);
    assert.equal(field(download, action, 'type'), 'OR');
    assert.equal(String(field(download, action, 'input_estimate')), '1.5');
    assert.equal(String(field(download, action, 'input_se')), '0.2');
    assert.equal(String(field(download, action, 'baseline_risk')), '0.25');
    assert.deepEqual(field(download, action, 'rows'), expected);
    assert.deepEqual(h.display(), display);
  });
}

test('P20-R4 control: successful Derive and explicit Convert recover after rejection', async () => {
  const h = harness();
  h.set({ 'der-lo': '0.5' });
  await h.click('btn-derive');
  assert.deepEqual(h.rows(), []);
  h.set({ 'der-hi': '1' });
  await h.click('btn-derive');
  assert.equal(h.rows().length, 3);
  assert.doesNotMatch(h.display().warning, /Error/);
  const derivedSE = Number(h.el('in-se').value);
  assert.ok(Number.isFinite(derivedSE) && derivedSE > 0);
  assert.notEqual(derivedSE, 0.12, 'The successful Derive updated the SE');
  const derived = field(await h.export('json'), 'json', 'rows');
  assert.equal(derived[0].se, derivedSE);
  assert.equal(derived[0].point, 0.75);
  h.set({ 'der-hi': '' });
  await h.click('btn-derive');
  assert.deepEqual(h.rows(), []);
  h.set({ 'der-lo': '', 'in-est': '1.25', 'in-se': '0.3' });
  await h.click('btn-convert');
  assert.doesNotMatch(h.display().warning, /Error/);
  const converted = field(await h.export('json'), 'json', 'rows');
  assert.equal(converted.length, 3);
  assert.equal(converted[0].point, 1.25);
  assert.equal(converted[0].se, 0.3);
});
