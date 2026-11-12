// Runs the inline engine script of TruthCert-PairwisePro-v1.0-bundle.html in a Node vm sandbox (after shared/upper-tail.js,
// as the page loads it) and prints the pooled-estimate, HKSJ and heterogeneity p-values of a fixed data set as JSON.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.PAGE || path.join(root, 'TruthCert-PairwisePro-v1.0-bundle.html'), 'utf8');
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
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('function calculatePooledEstimate('));
if (scripts.length !== 1) throw new Error('engine script not found: ' + scripts.length);
vm.runInContext(scripts[0], ctx, { filename: 'TruthCert-PairwisePro-v1.0-bundle.html' });
const get = name => vm.runInContext(name, ctx);
// k = 4 studies with a large common effect (z ~ 9.5) and some heterogeneity.
const yi = [0.52, 0.61, 0.48, 0.70], vi = [0.004, 0.006, 0.005, 0.008];
const fe = get('calculatePooledEstimate')(yi, vi, 0);
const re = get('calculatePooledEstimate')(yi, vi, 0.002);
const hk = get('calculateHKSJ')(yi, vi, re.theta, 0.002);
const het = get('calculateHeterogeneity')(yi, vi, 0.002);
const small = get('calculatePooledEstimate')([0.1, 0.25, 0.05], [0.02, 0.03, 0.025], 0);
process.stdout.write(JSON.stringify({ fe: { z: fe.z, p: fe.p_value }, small: { z: small.z, p: small.p_value },
  hksj: { t: hk.t_stat, df: hk.df, p: hk.p_value }, het: { Q: het.Q, df: yi.length - 1, p: het.p_Q } }));
