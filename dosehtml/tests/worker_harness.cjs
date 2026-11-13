// Loads dosehtml/dose-response-worker.js in a vm sandbox as a Web Worker would run it (self.onmessage, postMessage,
// importScripts of ../shared/upper-tail.js) and, separately, the inline engine of dose-response-pro.html; posts
// runGLS messages (DL and REML) for 4 datasets to the worker and prints the worker's results next to the page's
// solveGLS() results, plus the source text of every top-level function the worker shares with the page.
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
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('function solveGLS('));
if (scripts.length !== 1) throw new Error('engine script not found: ' + scripts.length);
vm.runInContext(scripts[0], ctx, { filename: 'dose-response-pro.html' });
const sample = /document\.getElementById\('dataInput'\)\.value = `(id,author[\s\S]*?)`;/.exec(html)[1];
const tight = sample.split(/\r?\n/).map((l, i) => {
  if (i === 0) return l;
  const f = l.split(',');
  if (f[7] !== 'NA') f[7] = String(+f[7] / 4);
  return f.join(',');
}).join('\n');
const datasets = {
  sample, tight,
  coffee: fs.readFileSync(path.join(root, 'coffee_mort_full_shifted.csv'), 'utf8'),
  milk: fs.readFileSync(path.join(root, 'milk_mort_full_shifted.csv'), 'utf8')
};
const pts = text => { const r = vm.runInContext('parseCSV', ctx)(text); return Array.isArray(r) ? r : (r.points || r.data); };
// the worker, in its own context
const wsrc = fs.readFileSync(path.join(root, 'dose-response-worker.js'), 'utf8');
const messages = [];
const wctx = vm.createContext({ console: sandbox.console, Math, Number, Array, Object, JSON, Date, Error, TypeError, RangeError,
  Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, Symbol, Float64Array,
  postMessage: m => messages.push(m),
  importScripts: (...urls) => { for (const u of urls) { const f = path.resolve(root, u); vm.runInContext(fs.readFileSync(f, 'utf8'), wctx, { filename: f }); } } });
wctx.self = wctx; wctx.globalThis = wctx;
vm.runInContext(wsrc, wctx, { filename: 'dose-response-worker.js' });
const fnSources = (src) => { const out = {}, lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) { const m = /^function ([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
    if (m) { let j = i; while (j < lines.length && lines[j].replace(/\r$/, '') !== '}') j++; out[m[1]] = lines.slice(i, j + 1).join('\n').replace(/\r/g, ''); } }
  return out; };
const out = { cases: {}, shared: {} };
for (const [label, text] of Object.entries(datasets)) {
  const p = pts(text);
  for (const reml of [false, true]) {
    vm.runInContext(`useREML = ${reml};`, ctx);
    let page; try { page = vm.runInContext('solveGLS', ctx)(JSON.parse(JSON.stringify(p)), null); } finally { vm.runInContext('useREML = false;', ctx); }
    messages.length = 0;
    wctx.self.onmessage({ data: { action: 'runGLS', data: JSON.parse(JSON.stringify(p)), tau2: null, useREML: reml } });
    const m = messages[0] || {};
    const pick = r => r && { beta: Array.from(r.beta || []), se: Array.from(r.se || []), tau2: r.tau2, Q: r.Q, df: r.df, I2: r.I2, Qp: r.Qp, nPoints: r.nPoints, nStudies: r.nStudies };
    out.cases[label + (reml ? '_REML' : '_DL')] = { page: pick(page), worker: m.type === 'result' ? pick(m.result) : { error: m.error || 'no message' } };
  }
}
const pageFns = fnSources(scripts[0]), workerFns = fnSources(wsrc);
for (const name of Object.keys(workerFns)) if (pageFns[name]) out.shared[name] = workerFns[name] === pageFns[name];
out.workerFunctions = Object.keys(workerFns);
process.stdout.write(JSON.stringify(out));
