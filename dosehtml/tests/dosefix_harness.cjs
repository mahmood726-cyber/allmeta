// dosefix harness: runs the inline engine of dose-response-pro.html in a Node vm sandbox (as rcode_export_harness.cjs)
// and prints, for the built-in sample, the page quantities that tests/test_dosefix.py checks against R:
// exported R script, report payload (contrast CI / trend p / coefficients), logLik, subgroup CIs, spline basis.
//
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
const run = s => vm.runInContext(s, ctx);
const out = { cases: {} };
const cases = [];
for (const method of ['DL', 'REML']) for (const model of ['linear', 'quadratic']) for (const hk of [false, true])
  cases.push({ method, model, hk, ci: 95, excl: false });
for (const model of ['linear', 'quadratic']) for (const hk of [false, true]) cases.push({ method: 'DL', model, hk, ci: 95, excl: true });
cases.push({ method: 'REML', model: 'quadratic', hk: true, ci: 90, excl: false });
for (const c of cases) {
  const key = `${c.method}_${c.model}${c.hk ? '_HK' : ''}${c.ci !== 95 ? '_CI' + c.ci : ''}${c.excl ? '_EXCL' : ''}`;
  const r = run(`useREML = ${c.method === 'REML'}; currentTau2 = null; useHKSJ = ${c.hk}; currentCI = ${c.ci}; currentMainModel = '${c.model}';
    excludedStudies = new Set(${c.excl ? '[__points[0].id]' : '[]'});
    var __act = __points.filter(p => !excludedStudies.has(p.id));
    var __r = fitModelByType(__act, null, '${c.model}'); __r.modelType = '${c.model}';
    analysisResults = { points: __points, modelType: '${c.model}', results: __r };
    updateCoefficientsTable(__r); updateInterpretation(__r);
    var __pay = buildAnalysisReportPayload(); generateRCode();
    var __b = prepareStudyBlocksForModel(__act).blocks.map(b => ({ dose: b.modelPoints.map(q => q.dose), y: b.modelPoints.map(q => q.logRR), V: Array.from(b.V), n: b.modelPoints.length }));
    ({ r: __r, pay: __pay, blocks: __b, excludedId: ${c.excl ? 'String(__points[0].id)' : 'null'} })`);
  out.cases[key] = { case: c, excludedId: r.excludedId, beta: Array.from(r.r.beta), se: Array.from(r.r.se), tau2: r.r.tau2, Q: r.r.Q, df: r.r.df,
    QRE: r.r.QRE, nStudies: r.r.nStudies, logLik: r.r.logLik, blocks: r.blocks,
    pay: { rr: r.pay.rr, ciLower: r.pay.ciLower, ciUpper: r.pay.ciUpper, pTrend: r.pay.pTrend, method: r.pay.inferenceMethod,
      coef: r.pay.coefficients.map(z => ({ beta: z.beta, se: z.se, ciLower: z.ciLower, ciUpper: z.ciUpper, p: z.p })) },
    interp: elements.interpretation.innerHTML, coefHTML: elements.coefficientsTable.innerHTML, code: elements.rCodeOutput.textContent };
  elements.rCodeOutput.textContent = '';
}
// subgroup CIs (variable 'type' is absent in the sample, so split by author initial parity is not available: use a synthetic
// two-group split of the sample studies)
const ids = [...new Set(points.map(p => p.id))];
ctx.__sgPoints = points.map(p => ({ ...p, grp: ids.indexOf(p.id) % 2 ? 'B' : 'A' }));
out.subgroup = {};
for (const hk of [false, true]) for (const ci of [95, 90]) {
  const res = run(`useREML = false; currentTau2 = null; useHKSJ = ${hk}; currentCI = ${ci};
    analysisResults = { points: __sgPoints, modelType: 'linear', results: fitModelByType(__sgPoints, null, 'linear') };
    var __sg = performSubgroupAnalysis('grp', 'linear');
    __sg.subgroups.map(s => { var f = fitLinearModel(s.points, null); var c = computeDoseContrast(f, 'linear', s.contrastDose, 0);
      return { rrCI: s.rrCI, logRR: c.logRR, se: c.seLogRR, QRE: f.QRE, df: f.df }; })`);
  out.subgroup[`${hk ? 'HK' : 'Wald'}_${ci}`] = res;
}
// Harrell restricted cubic spline basis at fixed knots, and the fitted spline of the sample beyond its last knot
const knots = [0, 10, 20, 40];
const grid = [-5, 0, 3, 7, 10, 15, 20, 30, 40, 45, 60, 80, 120];
out.spline = { knots, grid, rows: grid.map(d => Array.from(run('rcsTerms')(d, knots))) };
const sp = run('fitSplineModel')(points, null, 4);
const tK = sp.knots[sp.knots.length - 1];
out.splineTail = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => run('computeDoseContrast')(sp, 'spline', tK + i * tK / 4, 0).logRR);
process.stdout.write(JSON.stringify(out));
