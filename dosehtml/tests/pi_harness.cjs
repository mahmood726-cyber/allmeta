// Runs the inline engine of dose-response-pro.html in a Node vm sandbox and prints, for 3 datasets x 2 models x
// DL/REML, the 95% prediction interval the page reports for the dose 1 vs 0 relative risk -- from all three places
// that compute it (updateInterpretation, updateInterpretationLegacy, buildAnalysisReportPayload) -- together with its
// inputs (contrast logRR and SE, tau2, number of studies), so that tests/pi_reference.R can recompute it in R.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dose-response-pro.html'), 'utf8');
const noop = () => {};
const elements = {};
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
const piFromHtml = h => {
  const m = /95% prediction interval for the true effect in a new study is \[([^,\]]+), ([^\]]+)\]/.exec(h);
  return m ? [m[1], m[2]] : null;
};
const prep = vm.runInContext('prepareStudyBlocksForModel', ctx);
const out = { cases: {} };
for (const label of ['sample', 'coffee', 'milk']) {
  ctx.__points = pts(datasets[label]);
  out[label] = { blocks: prep(ctx.__points).blocks.map(b => ({ id: String(b.studyId), dose: b.modelPoints.map(q => q.dose),
    y: b.modelPoints.map(q => q.logRR), V: Array.from(b.V), n: b.modelPoints.length })) };
  for (const method of ['DL', 'REML']) {
    for (const model of ['quadratic', 'linear']) {
      const v = vm.runInContext(`useREML = ${method === 'REML'}; useHKSJ = false; currentTau2 = null; currentCI = 95;
        currentMainModel = '${model}'; excludedStudies = new Set();
        var __r = fitModelByType(__points, null, '${model}'); __r.modelType = '${model}';
        analysisResults = { points: __points, modelType: '${model}', results: __r };
        var __inf = getContrastInference(__r, '${model}', 1, 0, 95);
        updateInterpretation(__r); var __h1 = document.getElementById('interpretation').innerHTML;
        updateInterpretationLegacy(__r); var __h2 = document.getElementById('interpretation').innerHTML;
        var __p = buildAnalysisReportPayload();
        ({ logRR: __inf.contrast.logRR, se: __inf.se, tau2: __r.tau2, nStudies: __r.nStudies, beta1: __r.beta[1], se1: __r.se[1],
           h1: __h1, h2: __h2, payload: { piLower: __p.piLower, piUpper: __p.piUpper } })`, ctx);
      out.cases[`${label}_${method}_${model}`] = { dataset: label, model, logRR: v.logRR, se: v.se, tau2: v.tau2, nStudies: v.nStudies, beta1: v.beta1,
        se1: v.se1, interp: piFromHtml(v.h1), legacy: piFromHtml(v.h2), payload: v.payload };
    }
  }
}
// the helper at the edges: k = 1 (undefined), k = 2 (t on 1 df), missing k
out.helper = vm.runInContext(`({ k1: predictionIntervalLog(0.1, 0.2, 0.05, 1), k2: predictionIntervalLog(0.1, 0.2, 0.05, 2),
  kNaN: predictionIntervalLog(0.1, 0.2, 0.05, undefined), k5tau0: predictionIntervalLog(0.1, 0.2, 0, 5) })`, ctx);
process.stdout.write(JSON.stringify(out));
