// Runs the inline engine script of dose-response-pro.html in a Node vm sandbox (after shared/upper-tail.js, as the
// page loads it) and prints, for 4 datasets x 2 models, the page's heterogeneity statistics together with the model
// inputs (y, dose, within-study covariance blocks V) so that tests/q_standard_reference.R can recompute the standard
// Cochran Q (Q_E: GLS residual quadratic form at tau2 = 0, df = n - p) independently in R (metafor rma.mv QE).
// Datasets: the built-in sample; the sample with every SE divided by 4 ("tight"); coffee_mort and milk_mort
// (dosresmeta 2.2.0 data, as shipped in dosehtml/*_full_shifted.csv).
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
const out = {};
for (const [label, text] of Object.entries(datasets)) {
  const p = pts(text);
  const pr = prep(p);
  const blocks = pr.blocks.map(b => ({ id: String(b.studyId), dose: b.modelPoints.map(q => q.dose), y: b.modelPoints.map(q => q.logRR),
    V: Array.from(b.V), n: b.modelPoints.length }));
  const res = {};
  for (const model of ['quadratic', 'linear', 'spline', 'exponential']) {
    const r = fit(p, null, model);            // page default: DL tau2
    const r0 = fit(p, 0, model);              // tau2 fixed at 0 (common-effect)
    res[model] = { tau2: r.tau2, Q: r.Q, df: r.df, Qp: r.Qp, I2: r.I2, QRE: r.QRE,
      tau0: { Q: r0.Q, df: r0.df, Qp: r0.Qp, I2: r0.I2 } };
  }
  out[label] = { blocks, res };
}
process.stdout.write(JSON.stringify(out));
