// Group 2 of lane nmapro5 (exports / secondary modules). Runs nma-pro-v8.0.html's main inline script in a Node vm
// sandbox and prints what tests/test_nmapro5b_modules.py compares with tests/nmapro5b_r460.json
// (tests/nmapro5b_reference.R):
//   export  RScriptBuilder scripts for 8 analyses (the text, and the page's own numbers for the same analysis);
//           `node nmapro5b_harness.cjs --write-scripts` (re)writes them to fixtures/nmapro5-export/<case>.R, which
//           nmapro5b_reference.R runs in R
//   hk      HKSJ / KR / SJ intervals on the two-arm Senn 2013 network (REML) and on a triangle with df.Q = 1
//   qp      Q-profile CI of tau2 (pauleMandel_CI) on a 7-study star network with y, SE x 1, 10, 100
//   robust  RobustTailedNMA (nu = 4 and nu -> infinity) and CBMBaselineDualNMA.fitBaselineModel per estimator, x 1 / x 1e-4
//   ms      ModelSelection on the two-arm Senn network and the full (multi-arm) Senn network, REML and ML
//   worker  whether the inlined Web Worker engine still exists
// Usage: node nmapro5b_harness.cjs   (PAGE=<path> runs another copy of the page)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.PAGE || path.join(root, 'nma-pro-v8.0.html'), 'utf8');
const noop = () => {};
const el = () => ({ textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, checked: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null });
function sandbox() {
  const s = {
    console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date,
    Error, TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, Promise, Symbol,
    Float64Array, Uint32Array, Int32Array, BigUint64Array, BigInt, setTimeout: noop, setInterval: noop,
    clearTimeout: noop, clearInterval: noop,
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: el,
      body: el(), documentElement: el(), addEventListener: noop, readyState: 'loading', currentScript: null },
    navigator: { userAgent: 'Node.js', clipboard: {} }, location: { hash: '', search: '', href: '' },
    history: { pushState: noop, replaceState: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, CustomEvent: function () {},
    matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }), Blob: function () {}, URL: { createObjectURL: () => '' },
    URLSearchParams, Intl: globalThis.Intl, TextEncoder, TextDecoder, performance: { now: () => 0 }
  };
  s.window = s; s.self = s; s.globalThis = s;
  return vm.createContext(s);
}
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
const main = blocks.find(m => m[1].includes('const Stats='));
if (!main) throw new Error('main inline script with const Stats= not found');
const ctx = sandbox();
for (const m of html.slice(0, main.index).matchAll(/<script src="\.\.\/shared\/([\w.-]+\.js)"[^>]*><\/script>/g)) {
  const f = path.join(root, '..', 'shared', m[1]);
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
vm.runInContext(main[1] + '\n;globalThis.__X = {FrequentistNMA, RobustTailedNMA, CBMBaselineDualNMA, ModelSelection, ExternalBenchmark,' +
  ' RScriptBuilder: typeof RScriptBuilder !== "undefined" ? RScriptBuilder : null, Stats,' +
  ' WORKER_CODE: typeof WORKER_CODE !== "undefined" ? WORKER_CODE : null};', ctx, { filename: 'nma-pro-v8.0.html' });
const X = vm.runInContext('__X', ctx);

const readCsv = f => {
  const [head, ...rows] = fs.readFileSync(path.join(__dirname, f), 'utf8').trim().split(/\r?\n/);
  const h = head.split(',').map(x => x.replace(/"/g, ''));
  return rows.map(l => Object.fromEntries(l.split(',').map((v, i) => [h[i], v.replace(/"/g, '')])));
};
const contrasts = (rows, sc) => rows.map(r => ({ name: r.study, treatment1: r.treat1, treatment2: r.treat2,
  yi: +r.yi * sc, se: +r.sei * sc, vi: (+r.sei * sc) ** 2 }));
const binary = rows => rows.map(r => ({ name: r.study, treatment1: r.treat1, treatment2: r.treat2,
  events1: +r.e1, n1: +r.n1, events2: +r.e2, n2: +r.n2 }));
const safe = f => { try { return f(); } catch (e) { return { error: String(e && e.message || e), name: e && e.name } } };
const vs = (r, t) => Object.fromEntries(r.treatments.map(x => [x, r.effects.effects[x][t]]));
const out = {};
const senn = contrasts(readCsv('fixtures/nmapro3-senn2013-full.csv'), 1);
const senn2 = contrasts(readCsv('fixtures/nmapro2-senn2013-2arm.csv'), 1);
const smoke = binary(readCsv('fixtures/nmapro3-smoking.csv'));
const sz = binary(readCsv('fixtures/nmapro4-smoking-zero.csv'));

// ---------------------------------------------------------------- export scripts
const cases = {
  senn_REML: [senn, { reference: 'plac', effectMeasure: 'MD', estimator: 'REML', smallStudyCorrection: 'hksj' }],
  senn_FE: [senn, { reference: 'plac', effectMeasure: 'MD', estimator: 'FE', smallStudyCorrection: 'none' }],
  senn_PM: [senn, { reference: 'plac', effectMeasure: 'MD', estimator: 'PM', smallStudyCorrection: 'none' }],
  smoke_OR_DL: [smoke, { reference: 'A', effectMeasure: 'OR', estimator: 'DL', smallStudyCorrection: 'none' }],
  smoke_OR_REML: [smoke, { reference: 'A', effectMeasure: 'OR', estimator: 'REML', smallStudyCorrection: 'hksj' }],
  zero_RR_REML: [sz, { reference: 'A', effectMeasure: 'RR', estimator: 'REML', smallStudyCorrection: 'none' }],
  zero_RD_DL: [sz, { reference: 'A', effectMeasure: 'RD', estimator: 'DL', smallStudyCorrection: 'none' }],
  zero_OR_ML: [sz, { reference: 'A', effectMeasure: 'OR', estimator: 'ML', smallStudyCorrection: 'none' }]
};
out.export = {};
const writeDir = process.argv.includes('--write-scripts') ? path.join(__dirname, 'fixtures', 'nmapro5-export') : null;
if (writeDir) fs.mkdirSync(writeDir, { recursive: true });
for (const [nm, [st, o]] of Object.entries(cases)) {
  out.export[nm] = safe(() => {
    const r = X.FrequentistNMA.analyze(st, { ...o, smallStudyCorrection: 'none', predictionIntervals: false });
    const page = { tau2: r.tau2, Q: r.heterogeneity.Q, TE: vs(r, 'estimate'), se: vs(r, 'se') };
    const opt = { ...o, zeroCellCorrection: 'haldane', confLevel: 0.95, direction: 'lower', tau2: r.tau2 };
    const exp = X.RScriptBuilder.build(st, opt);
    const bench = X.ExternalBenchmark.makeRScript(st, opt);
    if (writeDir) {
      fs.writeFileSync(path.join(writeDir, nm + '.R'), exp.code);
      fs.writeFileSync(path.join(writeDir, nm + '.bench.R'), bench);
    }
    return { page, script: exp.code, bench, notes: exp.notes, reproducible: exp.reproducible, kind: exp.kind };
  });
}

// ---------------------------------------------------------------- HKSJ / KR / SJ
out.hk = {};
for (const corr of ['none', 'hksj', 'kr', 'mkh']) {
  out.hk[corr] = safe(() => { const r = X.FrequentistNMA.analyze(senn2, { reference: 'plac', effectMeasure: 'MD', estimator: 'REML',
    smallStudyCorrection: corr, predictionIntervals: false });
    return { cf: r.effects.correctionFactor, df: r.effects.df, tDf: r.effects.tDf ?? null, tau2: r.tau2,
      est: vs(r, 'estimate'), se: vs(r, 'se'), lo: vs(r, 'ci_lower'), hi: vs(r, 'ci_upper'), p: vs(r, 'pValue') }; });
}
{ const tri = [['S1', 'B', 'A', -0.3, 0.2], ['S2', 'C', 'A', 0.4, 0.2], ['S3', 'C', 'B', 0.1, 0.25]]
    .map(([n, t1, t2, y, se]) => ({ name: n, treatment1: t1, treatment2: t2, yi: y, se, vi: se * se }));
  out.hk.sj_df1 = safe(() => { const r = X.FrequentistNMA.analyze(tri, { reference: 'A', effectMeasure: 'MD', estimator: 'DL',
    smallStudyCorrection: 'sj' }); return { ran: true, se: r.effects.effects.B.se }; }); }

// ---------------------------------------------------------------- Q-profile CI
{ const star = [['S1', 'B', 'A', -0.3, 0.2], ['S2', 'B', 'A', -0.1, 0.25], ['S3', 'C', 'A', 0.2, 0.2], ['S4', 'C', 'A', 0.5, 0.3],
    ['S5', 'D', 'A', -0.4, 0.2], ['S6', 'D', 'A', 0.1, 0.22], ['S7', 'D', 'B', 0.0, 0.3]];
  const het = [['H1', 'B', 'A', -0.9, 0.2], ['H2', 'B', 'A', 0.4, 0.25], ['H3', 'C', 'A', 0.2, 0.2], ['H4', 'C', 'A', 1.3, 0.3],
    ['H5', 'D', 'A', -0.8, 0.2], ['H6', 'D', 'A', 0.6, 0.22], ['H7', 'D', 'B', 0.0, 0.3]];
  const mk = (d, sc) => d.map(([n, t1, t2, y, se]) => ({ name: n, treatment1: t1, treatment2: t2, yi: y * sc, se: se * sc, vi: (se * sc) ** 2 }));
  out.qp = {};
  for (const [nm, d] of [['star', star], ['het', het]]) for (const sc of [1, 10, 100]) out.qp[nm + '_' + sc] = safe(() => {
    const r = X.FrequentistNMA.analyze(mk(d, sc), { reference: 'A', effectMeasure: 'MD', estimator: 'PM', smallStudyCorrection: 'none' });
    return { sc, tau2: r.tau2, lower: r.pmCI.lower, upper: r.pmCI.upper, upperReached: r.pmCI.upperReached ?? null }; });
  out.qp.data = { star, het }; }

// ---------------------------------------------------------------- robust / baseline model
out.robust = {};
for (const est of ['DL', 'REML', 'PM']) for (const sc of [1, 1e-4]) {
  const st = contrasts(readCsv('fixtures/nmapro3-senn2013-full.csv'), sc);
  const o = { reference: 'plac', effectMeasure: 'MD', estimator: est, smallStudyCorrection: 'none', seed: 1 };
  out.robust[est + '_' + sc] = safe(() => {
    const core = X.FrequentistNMA.analyze(st, o), inf = X.RobustTailedNMA.analyze(st, { ...o, nu: 1e12 }),
      r4 = X.RobustTailedNMA.analyze(st, { ...o, nu: 4 });
    return { sc, core: core.tau2, nuInf: inf.tau2Robust, nuInfTE: inf.effects.effects.acar.estimate, coreTE: core.effects.effects.acar.estimate,
      nu4: r4.tau2Robust, nu4TE: r4.effects.effects.acar.estimate, converged: r4.converged ?? null };
  });
}
{ const two = smoke.filter(s => smoke.filter(x => x.name === s.name).length === 1);
  out.cbm = {};
  for (const est of ['DL', 'REML', 'PM', 'ML']) out.cbm[est] = safe(() => {
    const b = X.CBMBaselineDualNMA.fitBaselineModel(two, { reference: 'A', effectMeasure: 'OR', estimator: est, smallStudyCorrection: 'none' });
    return { tau2: b.tau2, slope: b.baselineSlope, slopeSE: b.baselineSlopeSE, TE: Object.fromEntries(Object.entries(b.effects.effects).map(([t, e]) => [t, e.estimate])) };
  });
  out.cbm.studies = two.map(s => s.name); }

// ---------------------------------------------------------------- model selection
out.ms = {};
for (const [nm, st] of [['senn2', senn2], ['senn', senn]]) for (const est of ['REML', 'ML']) out.ms[nm + '_' + est] = safe(() => {
  const r = X.FrequentistNMA.analyze(st, { reference: 'plac', effectMeasure: 'MD', estimator: est, smallStudyCorrection: 'none' });
  const m = r.modelSelection;
  return { re: m.randomEffects, fe: m.fixedEffect, lrt: m.LRT, likelihood: m.likelihood ?? null, tau2: r.tau2 };
});

out.worker = { WORKER_CODE: X.WORKER_CODE !== null, initWorker: /\binitWorker\(/.test(main[1]), workerCall: /\bworkerCall\(/.test(main[1]) };
process.stdout.write(JSON.stringify(out));
