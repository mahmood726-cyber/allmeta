// Runs the inline engine script of dose-response-pro.html in a Node vm sandbox (after shared/upper-tail.js,
// as the page loads it) and prints the heterogeneity results of the built-in sample data as JSON.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dose-response-pro.html'), 'utf8');
const noop = () => {};
const el = () => ({ textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, checked: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null });
const sandbox = {
  console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date, Error,
  TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, Promise, Symbol, Float64Array, Uint32Array,
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
  document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: el,
    body: el(), documentElement: el(), addEventListener: noop, readyState: 'loading' },
  navigator: { userAgent: 'Node.js', clipboard: {} }, location: { hash: '', search: '', href: '' },
  history: { pushState: noop, replaceState: noop },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, sessionStorage: { getItem: () => null, setItem: noop },
  addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }), Blob: function () {}, URL: { createObjectURL: () => '' },
  URLSearchParams, Intl: globalThis.Intl, TextEncoder, TextDecoder
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
const tail = path.join(root, '..', 'shared', 'upper-tail.js');
vm.runInContext(fs.readFileSync(tail, 'utf8'), ctx, { filename: tail });
// the engine script: the inline <script> (no src attribute) that defines solveGLS
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('function solveGLS('));
if (scripts.length !== 1) throw new Error('engine script not found: ' + scripts.length);
vm.runInContext(scripts[0], ctx, { filename: 'dose-response-pro.html' });
const sample = /document\.getElementById\('dataInput'\)\.value = `(id,author[\s\S]*?)`;/.exec(html)[1];
// Same data with every standard error divided by 4 (Q x ~16: heterogeneity is then decisive).
const tight = sample.split(/\r?\n/).map((l, i) => {
  if (i === 0) return l;
  const f = l.split(',');
  if (f[7] !== 'NA') f[7] = String(+f[7] / 4);
  return f.join(',');
}).join('\n');
const pts = text => { const r = vm.runInContext('parseCSV', ctx)(text); return Array.isArray(r) ? r : (r.points || r.data); };
const out = {};
for (const [label, text] of [['sample', sample], ['tight', tight]]) {
  for (const name of ['solveGLS', 'fitLinearModel']) {
    const r = vm.runInContext(name, ctx)(pts(text));
    out[label + '_' + name] = { Q: r.Q, df: r.df, Qp: r.Qp };
    const f = vm.runInContext(name, ctx)(pts(text), 0);   // tau2 fixed at 0 (common-effect)
    out[label + '_' + name + '_tau0'] = { Q: f.Q, df: f.df, Qp: f.Qp };
  }
}
process.stdout.write(JSON.stringify(out));
