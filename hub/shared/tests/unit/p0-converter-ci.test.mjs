import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = fs.readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const Z95 = 1.959963984540054;
const COX = Math.sqrt(3) / Math.PI;

// Execute the actual app, including rendering, click handlers and export adapter.
function harness(values = {}) {
  const elements = new Map();
  function element(value = '') {
    const listeners = {};
    return {
      value, innerHTML: '', children: [],
      setAttribute() {}, appendChild(child) { this.children.push(child); },
      addEventListener(event, fn) { (listeners[event] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
    };
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], element(match[0].match(/\bvalue="([^"]*)"/)?.[1] || ''));
  }
  for (const [id, value] of Object.entries({
    'in-type': 'OR', 'in-smd-kind': 'd', 'der-scale': 'log', ...values,
  })) elements.get(id).value = String(value);
  const document = {
    getElementById: id => elements.get(id), createElement: () => element(),
    querySelector: () => null, readyState: 'complete',
  };
  const noop = () => {};
  const context = vm.createContext({ document, console });
  context.window = context;
  context.alm = {
    csvUpload: noop, axisControls: noop, resultsExport: noop, tooltips: noop,
    resetUndo: Object.assign(noop, { snapshot: noop }),
    urlState: Object.assign(noop, { read: () => ({}), write: noop }),
  };
  vm.runInContext(fs.readFileSync(new URL('shared/effect-size-accuracy.js', root), 'utf8'), context);
  vm.runInContext(scripts.find(s => s.includes('function convert(')), context);
  context.LocalLLM = { attachPanel(_host, options) { context.importAI = options.onResult; } };
  vm.runInContext(scripts.find(s => s.includes('LocalLLM.attachPanel')), context);
  vm.runInContext(scripts.find(s => s.includes('window.__almSnapshot =')), context);
  return {
    context, el: id => elements.get(id),
    set(next) { for (const [id, value] of Object.entries(next)) elements.get(id).value = String(value); },
    convert() { elements.get('btn-convert').click(); return context.__almResultRows; },
    export() { return context.__almResults(); },
  };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

test('P0-52: crossing RR CI suppresses OR/SMD uncertainty in table, plot and export', () => {
  const h = harness({ 'in-type': 'RR', 'in-est': 3, 'in-se': 0.12, 'ctx-p0': 0.312 });
  const rows = h.convert();
  assert.ok(rows.find(r => r.scale === 'RR').hi > 1 / 0.312);
  for (const scale of ['OR', 'SMD (Cox via OR)']) {
    const r = rows.find(r => r.scale === scale);
    assert.ok(Number.isFinite(r.point));
    assert.ok(!Number.isFinite(r.se), `${scale} must not report a delta SE across the ceiling`);
    assert.ok(!Number.isFinite(r.lo) && !Number.isFinite(r.hi));
    assert.match(r.note, /risk ceiling/i);
    const out = h.export().rows.find(r => r.scale === scale);
    assert.equal(out.se, null);
    assert.equal(out.ci_lower, null);
    assert.equal(out.ci_upper, null);
  }
  assert.match(h.el('warn-slot').innerHTML, /risk ceiling/i);
  assert.doesNotMatch(h.el('forest-points').innerHTML, /<line/);
});

test('P0-52 control: admissible RR interval keeps delta conversions', () => {
  const h = harness({ 'in-type': 'RR', 'in-est': 1.5, 'in-se': 0.12, 'ctx-p0': 0.2 });
  const rows = h.convert();
  const or = rows.find(r => r.scale === 'OR');
  close(or.point, 12 / 7);
  close(or.se, 0.12 / 0.7);
  close(or.lo, or.point * Math.exp(-Z95 * or.se));
  close(rows.find(r => r.scale === 'SMD (Cox via OR)').se, COX * or.se);
  assert.doesNotMatch(h.el('warn-slot').innerHTML, /risk ceiling/i);
});

test('P0-52: exact ceiling and overflowed RR upper CI fail closed', () => {
  for (const se of [Math.log(2) / Z95, 1000]) {
    const h = harness({ 'in-type': 'RR', 'in-est': 1, 'in-se': se, 'ctx-p0': 0.5 });
    assert.ok(!Number.isFinite(h.convert().find(r => r.scale === 'OR').se));
  }
});

test('P0-55: Convert uses supplied asymmetric ratio bounds instead of the demo SE', () => {
  const h = harness({ 'in-est': 0.62, 'der-lo': 0.45, 'der-hi': 0.85 });
  const rows = h.convert();
  const expected = Math.log(0.85 / 0.45) / (2 * Z95);
  close(Number(h.el('in-se').value), expected);
  const or = rows.find(r => r.scale === 'OR');
  close(or.se, expected);
  assert.equal(or.lo, 0.45);
  assert.equal(or.hi, 0.85);
  close(rows.find(r => r.scale === 'ln(OR)').lo, Math.log(0.45));
  close(rows.find(r => r.scale === 'SMD (Cox)').se, expected * COX);
  assert.match(h.el('warn-slot').innerHTML, /supplied.*CI/i);
  const out = h.export();
  close(out.input_se, expected);
  assert.equal(out.rows[0].ci_lower, 0.45);
  assert.equal(out.rows[0].ci_upper, 0.85);
});

test('P0-55 control: empty CI fields retain the entered SE', () => {
  const h = harness({ 'in-est': 0.62, 'in-se': 0.2 });
  const or = h.convert().find(r => r.scale === 'OR');
  assert.equal(or.se, 0.2);
  close(or.lo, 0.62 * Math.exp(-Z95 * 0.2));
  close(or.hi, 0.62 * Math.exp(Z95 * 0.2));
});

test('P0-55: raw CI is respected including asymmetric zero-crossing bounds', () => {
  const h = harness({ 'in-type': 'MD', 'in-est': 1, 'der-scale': 'raw',
    'der-lo': -2, 'der-hi': 3, 'ctx-sd': 2 });
  const rows = h.convert();
  close(rows[0].se, 5 / (2 * Z95));
  assert.equal(rows[0].lo, -2);
  assert.equal(rows[0].hi, 3);
  assert.equal(h.context.toSmdView(rows[0]).lo, -1);
  assert.equal(h.context.toSmdView(rows[0]).hi, 1.5);
});

test('P0-55: partial, reversed, invalid-scale and nonpositive ratio CIs clear prior results', () => {
  for (const bounds of [
    { 'der-lo': 0.45 }, { 'der-hi': 0.85 },
    { 'der-lo': 0.85, 'der-hi': 0.45 },
    { 'der-lo': 0, 'der-hi': 0.85 },
    { 'der-lo': 0.45, 'der-hi': 0.85, 'der-scale': 'raw' },
    { 'der-lo': 0.7, 'der-hi': 0.85 },
    { 'der-lo': 'Infinity', 'der-hi': 'Infinity' },
  ]) {
    const h = harness({ 'in-est': 0.62 });
    assert.ok(h.convert().length > 0);
    h.set(bounds);
    assert.equal(h.convert().length, 0, JSON.stringify(bounds));
    assert.equal(h.export().rows.length, 0);
    assert.match(h.el('warn-slot').innerHTML, /Error/);
  }
});

test('P0-52/55: supplied RR upper bound controls ceiling even if the Wald reconstruction fits', () => {
  const h = harness({ 'in-type': 'RR', 'in-est': 2, 'ctx-p0': 0.25,
    'der-lo': 1.9, 'der-hi': 4.1 });
  const se = Math.log(4.1 / 1.9) / (2 * Z95);
  assert.ok(2 * Math.exp(Z95 * se) < 4);
  const rows = h.convert();
  assert.equal(rows[0].hi, 4.1);
  assert.ok(!Number.isFinite(rows.find(r => r.scale === 'OR').se));
  assert.match(h.el('warn-slot').innerHTML, /risk ceiling/i);
});

test('P0-55 control: Derive and Convert agree and clearing bounds restores direct SE input', () => {
  const h = harness({ 'in-est': 0.62, 'der-lo': 0.45, 'der-hi': 0.85 });
  h.el('btn-derive').click();
  const derived = h.export();
  h.convert();
  assert.deepEqual(h.export(), derived);
  h.set({ 'der-lo': '', 'der-hi': '', 'in-se': 0.2 });
  assert.equal(h.convert()[0].se, 0.2);
});

test('P0-55: new AI input cannot reuse a previous estimate\'s CI', () => {
  const h = harness({ 'in-est': 0.62, 'der-lo': 0.45, 'der-hi': 0.85 });
  h.context.importAI({ type: 'OR', estimate: 0.7, se: 0.3 });
  assert.equal(h.el('der-lo').value, '');
  assert.equal(h.el('der-hi').value, '');
  assert.equal(h.export().rows[0].se, 0.3);
});

test('P0-55: imported CI bounds take precedence over a supplied SE too', () => {
  const h = harness();
  h.context.importAI({ type: 'OR', estimate: 0.62, se: 0.12,
    ci_lower: 0.45, ci_upper: 0.85, ci_scale: 'log' });
  assert.equal(h.export().rows[0].ci_lower, 0.45);
  assert.equal(h.export().rows[0].ci_upper, 0.85);
});

test('P0-55 import control: an SE-only AI result without prior CI keeps its SE', () => {
  const h = harness();
  h.context.importAI({ type: 'OR', estimate: 0.7, se: 0.3 });
  assert.equal(h.export().rows[0].se, 0.3);
});
