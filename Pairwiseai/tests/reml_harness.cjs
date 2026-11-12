'use strict';
// usage: node harness.cjs <engine file (.js or .html)> <ref json> ; prints JSON per dataset
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = process.argv[2], ref = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const shared = process.env.SHARED;
const noop = () => {};
const el = () => ({ textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, checked: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null });
const sb = { console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date, Error,
  TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, WeakMap, Promise, Symbol, Float64Array, Uint32Array, Uint8Array,
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
  document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), head: el(),
    documentElement: el(), addEventListener: noop, readyState: 'loading' },
  navigator: { userAgent: 'Node.js', clipboard: {} }, location: { hash: '', search: '', href: '' },
  history: { pushState: noop, replaceState: noop }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop }, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  requestAnimationFrame: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }), Blob: function () {}, URL: { createObjectURL: () => '' },
  URLSearchParams, Intl: globalThis.Intl, TextEncoder, TextDecoder, MutationObserver: function(){ return {observe:noop, disconnect:noop}; } };
sb.window = sb; sb.self = sb; sb.globalThis = sb;
const ctx = vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(shared, 'upper-tail.js'), 'utf8'), ctx);
let src = fs.readFileSync(file, 'utf8');
if (file.endsWith('.html')) {
  const s = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('function estimateTau2_REML('));
  if (s.length !== 1) throw new Error('engine script count ' + s.length);
  src = s[0];
}
vm.runInContext(src, ctx, { filename: path.basename(file) });
const g = n => vm.runInContext(n, ctx);
const out = {};
for (const [nm, d] of Object.entries(ref.sets)) {
  const r = g('estimateTau2_REML')(d.yi, d.vi);
  const disp = g('estimateTau2')(d.yi, d.vi, 'REML');
  const pe = g('calculatePooledEstimate')(d.yi, d.vi, r.tau2);
  out[nm] = { tau2: r.tau2, converged: r.converged, method: r.method, note: r.note || r.warning || null, iterations: r.iterations,
    dispatch_tau2: disp.tau2, mu: pe.theta, se: pe.se, ci_lb: pe.ci_lower, ci_ub: pe.ci_upper, p: pe.p_value };
}
process.stdout.write(JSON.stringify(out));
