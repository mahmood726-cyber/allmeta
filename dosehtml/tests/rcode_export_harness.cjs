// Runs the inline engine of dose-response-pro.html in a Node vm sandbox and prints, for the built-in sample
// (quadratic and linear; DL = page default, and REML), the page's own estimates together with the R script that the
// page exports for that analysis (generateRCode). tests/test_rcode_export.py runs each exported script in R and
// compares what R prints with the page.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dose-response-pro.html'), 'utf8');
const elements = {};
const noop = () => {};
const el = () => ({ textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, checked: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null });
const sandbox = {
  console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date, Error,
  TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, Promise, Symbol, Float64Array, Uint32Array,
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
  document: { getElementById: id => (elements[id] = elements[id] || el()), querySelector: () => null, querySelectorAll: () => [], createElement: el,
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
const points = (() => { const r = vm.runInContext('parseCSV', ctx)(sample); return Array.isArray(r) ? r : (r.points || r.data); })();
ctx.__points = points;
const out = {};
for (const method of ['DL', 'REML']) {
  for (const model of ['quadratic', 'linear']) {
    const r = vm.runInContext(`useREML = ${method === 'REML'}; currentTau2 = null;
      analysisResults = { points: __points, modelType: '${model}', results: fitModelByType(__points, null, '${model}') };
      generateRCode(); analysisResults.results`, ctx);
    out[method + '_' + model] = { page: { beta: Array.from(r.beta), se: Array.from(r.se), tau2: r.tau2, Q: r.Q, df: r.df },
      code: elements.rCodeOutput.textContent };
    elements.rCodeOutput.textContent = '';
  }
}
process.stdout.write(JSON.stringify(out));
