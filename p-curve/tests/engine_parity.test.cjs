'use strict';
// R-parity regression for the p-curve page engine (no dependencies):
//   node p-curve/tests/engine_parity.test.cjs
// Runs the page's inline scripts verbatim on a minimal DOM stub, enters each fixture's text, clicks Analyze and
// compares the export object with R (fixtures/pcurve-r-reference.json: base R p-curve app 4.x formulas and
// puniform 0.2.8 with its bisection tolerance set to 1e-12). Tolerance |page - R| / max(1, |R|) <= 1e-9.
// Also checks strict number reading (no prefix parsing) and that a refusal clears earlier results.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pcurve-r-reference.json'), 'utf8'));

function makeEl(id) {
  const listeners = {};
  return { id, value: '', innerHTML: '', textContent: '', style: {}, children: [],
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    click() { (listeners.click || []).forEach(f => f({ type: 'click' })); },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, querySelector() { return null }, querySelectorAll() { return []; } };
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
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
for (const code of inline) vm.runInContext(code, ctx);

function runPage(text, family, df) {
  const $ = id => document.getElementById(id);
  $('src').value = text; $('test').value = family; $('df').value = String(df == null ? 100 : df);
  $('btn-run').click();
  return ctx._almLastPcurve();
}

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('FAIL ' + msg); } };
const near = (a, b) => (b === null ? (a === null || a === undefined || Number.isNaN(a)) : (typeof a === 'number' && Math.abs(a - b) / Math.max(1, Math.abs(b)) <= 1e-9));

for (const c of fixture.cases) {
  const r = runPage(c.text, c.family, c.df);
  if (c.refused) { check(r === null, `${c.id}: expected refusal`); continue; }
  check(r !== null, `${c.id}: no result`);
  if (!r) continue;
  for (const [k, v] of Object.entries(c)) {
    if (['id', 'family', 'df', 'text', 'refused'].includes(k)) continue;
    if (Array.isArray(v)) v.forEach((x, i) => check(r[k] && near(r[k][i], x), `${c.id}: ${k}[${i}] page=${r[k] && r[k][i]} R=${x}`));
    else check(near(r[k], v), `${c.id}: ${k} page=${r[k]} R=${v}`);
  }
}
// strict reading: '0.02abc' and '0.03,0.04' are not numbers
const m = runPage('0.01 0.02abc 0.03,0.04 .02 0.004', 'z', null);
check(m && m.k === 3 && m.n_invalid === 2, `malformed tokens: k=${m && m.k} n_invalid=${m && m.n_invalid} (want 3, 2)`);
// a refusal must not leave the previous p-uniform table on screen
runPage('0.001 0.002 0.003', 'z', null);
runPage('0.01', 'z', null);
check(!/\d\.\d{3}/.test(els['pu-body'].innerHTML), 'refusal left stale p-uniform results on screen');

console.log(`p-curve engine parity: ${pass}/${pass + fail} checks pass`);
process.exit(fail ? 1 : 0);
