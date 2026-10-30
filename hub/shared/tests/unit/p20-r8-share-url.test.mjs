import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const encode = state => Buffer.from(JSON.stringify({ v: 1, ...state }), 'utf8').toString('base64');

// Execute the actual inline scripts, calculation library and URL codec. Only
// unrelated widget mounts are stubbed; conversion/listener/restore code is intact.
function harness(hash = '', modules = true) {
  function element(value = '') {
    const listeners = new Map();
    return {
      value, hidden: false, children: [], style: {},
      get innerHTML() { return this.html || ''; },
      set innerHTML(value) { this.html = value; this.children = []; },
      setAttribute(name, value) { this[name] = value; },
      appendChild(child) { this.children.push(child); },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatch(type) {
        for (const fn of listeners.get(type) || []) fn({ type, target: this });
      },
      click() { this.dispatch('click'); },
    };
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, element()]));
  for (const [tag, id] of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    elements.get(id).value = tag.match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  for (const [, id, options] of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    elements.get(id).value = options.match(/<option\b[^>]*\bvalue="([^"]*)"/)?.[1] || '';
  }
  const hooks = {};
  const context = vm.createContext({
    console,
    location: { hash },
    document: {
      readyState: 'complete', body: element(),
      getElementById: id => elements.get(id) || null,
      createElement: () => element(),
      querySelector: () => null,
    },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    LocalLLM: { attachPanel(_host, options) { hooks.ai = options; } },
  });
  context.window = context;
  vm.runInContext(readFileSync(new URL('shared/effect-size-accuracy.js', root), 'utf8'), context);
  if (modules) {
    vm.runInContext(readFileSync(new URL('hub/shared/url-state.js', root), 'utf8'), context);
    Object.assign(context.alm, {
      csvUpload(options) { hooks.csv = options; },
      axisControls() {},
      resultsExport(options) { hooks.export = options; },
      resetUndo: Object.assign(options => { hooks.undo = options; }, { snapshot() {} }),
      tooltips() {},
    });
  }
  for (const [tag, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/^<script\b[^>]*\bsrc=/.test(tag)) vm.runInContext(script, context);
  }
  return {
    context, hooks,
    get hash() { return context.location.hash; },
    get rows() { return plain(context.__almResultRows); },
    set(values) { for (const [id, value] of Object.entries(values)) elements.get(id).value = String(value); },
    value: id => elements.get(id).value,
    click: id => elements.get(id).click(),
    change: id => elements.get(id).dispatch('change'),
    snapshot: () => plain(context.__almSnapshot()),
    state: () => plain(context.alm.urlState.read()),
  };
}

function assertSharedConversion(h) {
  assert.ok(h.rows.length > 0, 'a conversion was rendered');
  assert.deepEqual(h.state(), h.snapshot(), 'decoded URL must contain all committed inputs, including estimate and SE');
  const reopened = harness(h.hash);
  assert.deepEqual(reopened.snapshot(), h.snapshot(), 'opening the share URL restores all inputs');
  assert.deepEqual(reopened.rows, h.rows, 'opening the share URL reproduces the displayed conversion');
}

test('control: initial conversion is immediately shareable', () => {
  const h = harness();
  assert.equal(h.state()['in-est'], '0.75');
  assert.equal(h.state()['in-se'], '0.12');
  assertSharedConversion(h);
});

test('control: Convert updates the share URL and reproduces the conversion', () => {
  const h = harness();
  h.set({ 'in-est': '2', 'in-se': '0.3', 'ctx-p0': '0.2' });
  h.click('btn-convert');
  assert.equal(h.rows[0].point, 2);
  assert.equal(h.rows[0].se, 0.3);
  assertSharedConversion(h);
});

for (const [name, values] of [
  ['CI', { 'in-est': '2', 'der-lo': '1.5', 'der-hi': '3' }],
  ['Wald p', { 'in-est': '2', 'der-p': '0.05' }],
  ['t', { 'in-type': 'SMD', 'der-t': '2.3', 'der-n1': '25', 'der-n2': '30' }],
  ['F', { 'in-type': 'SMD', 'der-f': '5.29', 'der-f-sign': '-1', 'der-n1': '25', 'der-n2': '30' }],
]) {
  test(`plant P20-R8: ${name} Derive shares the new estimate and derived SE`, () => {
    const h = harness();
    h.set(values);
    h.click('btn-derive');
    assert.ok(Number(h.value('in-se')) > 0);
    assert.notEqual(h.value('in-se'), '0.12', 'Derive changed the SE');
    assert.equal(h.rows[0].point, Number(h.value('in-est')));
    assert.equal(h.rows[0].se, Number(h.value('in-se')));
    if (name === 't' || name === 'F') assert.equal(h.value('in-smd-kind'), 'g');
    else assert.equal(h.rows[0].point, 2);
    assertSharedConversion(h);
  });
}

test('plant P20-R8: snapshot restore replaces the previous conversion URL', () => {
  const h = harness();
  const saved = h.snapshot();
  h.set({ 'in-est': '3', 'in-se': '0.4' });
  h.click('btn-convert');
  assert.equal(h.state()['in-est'], '3');
  h.hooks.undo.restore(saved);
  assert.equal(h.rows[0].point, 0.75);
  assertSharedConversion(h);
});

test('plant P20-R8: initial partial URL restore shares the complete rendered snapshot', () => {
  const h = harness(encode({ 'in-type': 'MD', 'in-est': '2', 'in-se': '0.3' }));
  assert.equal(h.rows[0].point, 2);
  assert.equal(h.rows[0].se, 0.3);
  assertSharedConversion(h);
});

test('control: initial complete URL restore reproduces the shared conversion', () => {
  const original = harness();
  original.set({ 'in-type': 'MD', 'in-est': '2', 'in-se': '0.3' });
  original.click('btn-convert');
  assertSharedConversion(harness(original.hash));
});

for (const [name, values, field] of [
  ['effect type', { 'in-type': 'RR' }, 'in-type'],
  ['SMD estimator', { 'in-type': 'SMD', 'in-smd-kind': 'g' }, 'in-smd-kind'],
]) {
  test(`plant P20-R8: changing ${name} shares the committed conversion`, () => {
    const h = harness();
    h.set(values);
    h.change(field);
    assertSharedConversion(h);
  });
}

test('control: CSV import shares its converted inputs', () => {
  const h = harness();
  h.hooks.csv.onParse({ rows: [{ m1: 5, sd1: 2, n1: 25, m2: 4, sd2: 2.5, n2: 30 }] });
  assert.equal(h.value('in-type'), 'SMD');
  assert.equal(h.value('in-smd-kind'), 'g');
  assertSharedConversion(h);
});

test('plant P20-R8: accepted AI inputs share the committed conversion', () => {
  const h = harness();
  h.hooks.ai.onResult({ type: 'OR', estimate: 2, se: 0.3 });
  assert.equal(h.rows[0].point, 2);
  assertSharedConversion(h);
});

test('plant P20-R8: export-triggered conversion shares the committed inputs', () => {
  const h = harness();
  h.set({ 'in-est': '2', 'in-se': '0.3' });
  const exported = h.hooks.export.getResults();
  assert.equal(exported.input_estimate, 2);
  assert.equal(exported.input_se, 0.3);
  assertSharedConversion(h);
});

test('plant P20-R8: invalid Convert does not replace the last committed share URL', () => {
  const h = harness();
  const committed = h.hash;
  h.set({ 'in-est': '-2' });
  h.click('btn-convert');
  assert.deepEqual(h.rows, []);
  assert.equal(h.hash, committed);
});

test('control: invalid Derive does not commit a new share URL', () => {
  const h = harness();
  const committed = h.hash;
  h.set({ 'in-est': '2', 'der-lo': '3', 'der-hi': '1' });
  h.click('btn-derive');
  assert.deepEqual(h.rows, []);
  assert.equal(h.hash, committed);
});

test('control: conversion and Derive still work without optional UX modules', () => {
  const h = harness('', false);
  h.set({ 'in-est': '2', 'der-lo': '1.5', 'der-hi': '3' });
  h.click('btn-derive');
  assert.equal(h.rows[0].point, 2);
  assert.ok(h.rows[0].se > 0);
  assert.equal(h.hash, '');
});
