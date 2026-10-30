import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import EffectAccuracy from '../../../../shared/effect-size-accuracy.js';

const html = readFileSync(new URL('../../../../effect-size-converter/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function runConvert()'));
const adapters = scripts.find(s => s.includes('window.__almLoadCSV = function'));
assert.ok(engine && adapters, 'load the complete real engine and CSV adapter scripts');

// Only DOM and shared UX mounts are stand-ins. Calculations, validation,
// rendering, button handlers and the CSV onParse callback execute unchanged.
function page() {
  function element() {
    const listeners = {};
    let markup = '';
    return {
      value: '', hidden: false, children: [],
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = value; this.children = []; },
      appendChild(child) { this.children.push(child); },
      setAttribute() {},
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
    };
  }
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], element()]));
  const el = id => nodes.get(id);
  const set = values => {
    for (const [id, value] of Object.entries(values)) el(id).value = String(value);
  };
  set({ 'in-type': 'SMD', 'in-smd-kind': 'd', 'in-est': '0.5', 'in-se': '0.2',
    'der-n1': '30', 'der-n2': '30', 'der-scale': 'raw' });
  let csvOptions;
  const urlWrites = [];
  const urlState = Object.assign(() => {}, {
    read: () => null, write: state => urlWrites.push(state),
  });
  const window = {
    innerWidth: 600,
    alm: {
      csvUpload(options) { csvOptions = options; },
      axisControls() {}, resultsExport() {}, tooltips() {},
      resetUndo: Object.assign(() => {}, { snapshot() {} }), urlState,
    },
  };
  const context = vm.createContext({ window, AlmEffectAccuracy: EffectAccuracy,
    document: { getElementById: el, createElement: element, querySelector: () => null, readyState: 'complete' },
  });
  vm.runInContext(engine, context, { filename: 'effect-size-converter/index.html:engine' });
  vm.runInContext(adapters, context, { filename: 'effect-size-converter/index.html:adapters' });
  assert.ok(window.__almResultRows.length > 0, 'start with existing results to detect stale rows');
  return { el, set, window, urlWrites, run: () => context.runConvert(),
    derive: () => el('btn-derive').click(),
    import: rows => csvOptions.onParse({ rows }),
  };
}

const csvRow = { m1: 52.5, sd1: 8.2, n1: 30, m2: 47.1, sd2: 7.9, n2: 30 };
const contexts = [
  ['negative pooled SD', { 'ctx-sd': '-1' }, /Pooled SD must be strictly positive, or left blank\./],
  ['invalid baseline risk', { 'ctx-p0': '1.2' }, /Baseline risk must be strictly between 0 and 1, or left blank\./],
];
const derivations = [
  ['t', { 'der-t': '2.597' }],
  ['F', { 'der-f': '4.41', 'der-f-sign': '-1' }],
];

function assertRefusal(p, message) {
  // Do not call __almResults(): exporting reruns conversion and could hide the bug.
  assert.equal(p.window.__almResultRows.length, 0);
  assert.equal(p.el('results-body').children.length, 0);
  assert.match(p.el('warn-slot').innerHTML, message);
  assert.doesNotMatch(p.el('warn-slot').innerHTML, /Derived Hedges|Imported metafor-compatible/);
}

function assertSuccess(p, message) {
  assert.match(p.el('warn-slot').innerHTML, message);
  assert.ok(p.window.__almResultRows.length > 0);
  assert.equal(p.el('results-body').children.length, p.window.__almResultRows.length);
  const g = p.window.__almResultRows.find(r => r.scale === "SMD (Hedges' g)");
  assert.ok(g && Number.isFinite(g.point) && g.se > 0);
  assert.equal(g.point, Number(p.el('in-est').value));
  assert.equal(g.se, Number(p.el('in-se').value));
}

for (const [method, fields] of derivations) {
  for (const [label, invalid, message] of contexts) {
    test(`plant P20-R7: ${method} derivation preserves ${label} refusal`, () => {
      const p = page();
      p.set({ ...fields, ...invalid });
      p.derive();
      assert.equal(p.el('in-smd-kind').value, 'g', 'derivation itself succeeded');
      assertRefusal(p, message);
      p.set({ 'ctx-sd': '', 'ctx-p0': '' });
      p.derive();
      assertSuccess(p, /Derived Hedges&#39; g/);
    });
  }
  test(`control P20-R7: valid ${method} derivation retains its success message and rows`, () => {
    for (const context of [{}, { 'ctx-p0': '0.2', 'ctx-sd': '2' }]) {
      const p = page();
      p.set({ ...fields, ...context });
      p.derive();
      assertSuccess(p, /Derived Hedges&#39; g/);
    }
  });
}

test('plant P20-R7: CSV import preserves invalid baseline risk refusal', () => {
  for (const risk of ['0', '1', '1.2']) {
    const p = page();
    p.set({ 'ctx-p0': risk });
    p.import([csvRow]);
    assert.equal(p.el('in-smd-kind').value, 'g', 'CSV summary itself succeeded');
    assertRefusal(p, contexts[1][2]);
    p.set({ 'ctx-p0': '0.2' });
    p.import([csvRow]);
    assertSuccess(p, /Imported metafor-compatible Hedges g/);
  }
});

test('control P20-R7: valid CSV imports retain success, first-row notice and URL state', () => {
  for (const rows of [[csvRow], [csvRow, { ...csvRow, m1: 61 }]]) {
    const p = page();
    const before = p.urlWrites.length;
    p.import(rows);
    assertSuccess(p, /Imported metafor-compatible Hedges g/);
    assert.equal(p.urlWrites.length, before + 1);
    assert.equal(p.urlWrites.at(-1)['in-est'], p.el('in-est').value);
    if (rows.length > 1) assert.match(p.el('warn-slot').innerHTML, /only the first of 2 rows/);
    else assert.doesNotMatch(p.el('warn-slot').innerHTML, /only the first/);
  }
});

for (const [label, invalid, message] of contexts) {
  test(`control P20-R7: direct Convert retains ${label} refusal`, () => {
    const p = page();
    p.set(invalid);
    p.el('btn-convert').click();
    assertRefusal(p, message);
  });
}

for (const [method, fields] of [
  ['CI', { 'der-lo': '0.1', 'der-hi': '0.9' }],
  ['Wald p', { 'der-p': '0.05' }],
]) {
  test(`control P20-R7: ${method} derivation retains context refusal`, () => {
    const p = page();
    p.set({ ...fields, 'ctx-sd': '-1' });
    p.derive();
    assertRefusal(p, contexts[0][2]);
  });
}

for (const [label, invalid, message] of [
  ['missing estimate', { 'in-est': '' }, /Enter a point estimate\./],
  ['nonpositive ratio', { 'in-type': 'OR', 'in-est': '0' }, /must be greater than 0\./],
  ['nonpositive SE', { 'in-se': '0' }, /strictly positive standard error/],
  ['out-of-range RD', { 'in-type': 'RD', 'in-est': '1.1' }, /Risk difference must be between -1 and \+1\./],
  ...contexts,
]) {
  test(`contract P20-R7: runConvert returns false for ${label}`, () => {
    const p = page();
    p.set(invalid);
    const result = p.run();
    assertRefusal(p, message);
    assert.equal(result, false);
  });
}

test('contract P20-R7: runConvert returns true after successful rendering', () => {
  const p = page();
  assert.equal(p.run(), true);
  assert.ok(p.window.__almResultRows.length > 0);
  assert.equal(p.el('results-body').children.length, p.window.__almResultRows.length);
});
