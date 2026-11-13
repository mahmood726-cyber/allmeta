// Runs the inline engine of dose-response-pro.html in a Node vm sandbox and prints, for 4 datasets x 2 models x
// 2 tau2 settings (the page's DL tau2, and tau2 fixed at 1, where the Knapp-Hartung scale falls below 1 and its ad hoc
// floor binds), the page's Knapp-Hartung (HK/SJ) inference: coefficient SEs and df (withHKSJ) and the dose 1 vs 0
// contrast SE and critical value (getContrastInference with HK/SJ on and off), plus the model inputs, so that
// tests/hksj_reference.R can recompute them with metafor rma.mv(test = "adhoc"). Also prints t and z quantiles.
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
const prep = vm.runInContext('prepareStudyBlocksForModel', ctx);
const fit = vm.runInContext('fitModelByType', ctx);
const out = { cases: {}, quantiles: {} };
for (const [label, text] of Object.entries(datasets)) {
  const p = pts(text);
  const blocks = prep(p).blocks.map(b => ({ id: String(b.studyId), dose: b.modelPoints.map(q => q.dose), y: b.modelPoints.map(q => q.logRR),
    V: Array.from(b.V), n: b.modelPoints.length }));
  for (const model of ['quadratic', 'linear']) {
    for (const [tlab, t2] of [['DL', null], ['tau1', 1]]) {
      const r = fit(p, t2, model);
      const w = vm.runInContext('withHKSJ', ctx)(Object.assign({}, r, { seHKSJ: undefined, dfHKSJ: undefined }));
      ctx.__r = r;
      const hk = vm.runInContext(`useHKSJ = true; var __a = getContrastInference(__r, '${model}', 1, 0, 95); useHKSJ = false;
        var __b = getContrastInference(__r, '${model}', 1, 0, 95); ({ hk: { se: __a.se, crit: __a.crit, method: __a.method },
        wald: { se: __b.se, crit: __b.crit, method: __b.method } })`, ctx);
      out.cases[label + '_' + model + '_' + tlab] = { dataset: label, model, tau2: r.tau2, beta: Array.from(r.beta),
        se: Array.from(r.se), df: r.df, QRE: r.QRE, nStudies: r.nStudies, seHKSJ: Array.from(w.seHKSJ), dfHKSJ: w.dfHKSJ,
        qHKSJ: w.qHKSJ, contrast: hk };
    }
  }
  out[label] = { blocks };
}
for (const df of [1, 2, 3, 4, 10, 11, 39, 40, 76, 77, 100, 101, 1000]) out.quantiles['t' + df] = vm.runInContext(`tCriticalValue(${df}, 0.975)`, ctx);
out.quantiles.z975 = vm.runInContext('normCDFinv(0.975)', ctx);
out.quantiles.z995 = vm.runInContext('normCDFinv(0.995)', ctx);
out.quantiles.z90 = vm.runInContext('normCDFinv(0.90)', ctx);
out.quantiles.z01 = vm.runInContext('normCDFinv(0.01)', ctx);
process.stdout.write(JSON.stringify(out));
