'use strict';
// p-curve input handling (P25 limitations F02, F06, F11, F12), run on the page's inline scripts verbatim with
// the same minimal DOM stub as engine_parity.test.cjs:   node --test p-curve/tests/lim2_inputs.test.cjs
// Requirements:
//  F06  the common df is used exactly as typed or the analysis is refused: a non-integer df (30.9) or a blank df
//       with "t-test" selected must not silently become df=30 or the z family; "1e2" is the number 100, not 1.
//  F11  a p-value too small for p/2 to be represented (p/2 underflows to 0, so z = Inf) must be refused, not
//       analysed with an infinite z; the smallest archived probe (1e-320, E13) is still analysed.
//  F12  a large input must not throw from spread arguments (RangeError) before producing results.
//  F02  when more unreadable entries exist than are listed, the note must say how many are shown.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function makeEl(id) {
  const listeners = {};
  return { id, value: '', innerHTML: '', textContent: '', style: {}, children: [],
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    click() { (listeners.click || []).forEach(f => f({ type: 'click' })); },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
}
const els = {};
const document = {
  readyState: 'complete',
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener() {}, createElement: () => makeEl(''), body: makeEl('body'), head: makeEl('head'),
};
const ctx = vm.createContext({ document, console, Math, JSON, Number, String, Array, Object, isFinite, parseFloat, parseInt });
vm.runInContext('var window = this;', ctx);
document.getElementById('test').value = 'z';
document.getElementById('df').value = '100';
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const $ = id => document.getElementById(id);
function run(text, family, df) { $('src').value = text; $('test').value = family; $('df').value = df; $('btn-run').click(); return ctx._almLastPcurve(); }
const P = '0.001 0.003 0.002 0.008 0.012 0.004';

test('F06: t with df 30.9 is refused, not analysed as df=30', () => {
  assert.strictEqual(run(P, 't', '30.9'), null);
  assert.match($('tests-body').innerHTML, /whole number/);
});
test('F06: t with a blank df is refused, not silently analysed as z', () => {
  assert.strictEqual(run(P, 't', ''), null);
});
test('F06: df typed as 1e2 is 100', () => {
  const r = run(P, 't', '1e2');
  assert.ok(r); assert.strictEqual(r.flat_family, 'non-central t, df=100');
});
test('F06 control: t with df 30 and z (df ignored) are analysed', () => {
  assert.strictEqual(run(P, 't', '30').flat_family, 'non-central t, df=30');
  assert.strictEqual(run(P, 'z', '').flat_family, 'two-sided z');
});
test('F11: p whose half underflows to 0 is refused', () => {
  assert.strictEqual(run('5e-324 0.01 0.02', 'z', '100'), null);
  assert.match($('tests-body').innerHTML, /too small/);
});
test('F11 control: the archived subnormal probe 1e-320 is still analysed', () => {
  const r = run('1e-320 0.01 0.02', 'z', '100');
  assert.ok(r && r.k === 3 && Number.isFinite(r.pu_L0), JSON.stringify(r && r.pu_L0));
});
test('F12: 200000 p-values do not throw', () => {
  const big = Array.from({ length: 200000 }, (_, i) => (0.0001 + (i % 400) * 0.0001).toPrecision(6)).join(' ');
  let r; assert.doesNotThrow(() => { r = run(big, 'z', '100'); });
  assert.ok(r && r.k === 200000);
});
test('F02: more than five unreadable entries -> the note says how many are listed', () => {
  run('0.001 0.002 0.003 a b c d e f g', 'z', '100');
  assert.match($('input-note').innerHTML, /7 not read as numbers/);
  assert.match($('input-note').innerHTML, /first 5 shown/);
});
