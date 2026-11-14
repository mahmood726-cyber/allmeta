// Runs nma-pro-v8.0.html's main inline script (after the ../shared/*.js it loads first) in a Node vm sandbox, plus the
// Web Worker's own engine (WORKER_CODE), and prints what tests/test_secondary_modules.py compares with
// tests/secondary_r460.json (tests/secondary_reference.R):
//   pi      FrequentistNMA.analyze prediction intervals (no small-sample correction) on the Senn 2013 two-arm studies,
//           nma-tiny (y and SE x 0.01) and a 3-study triangle (df.Q = 1)
//   rd      calcEffects(RD) per study (main engine, worker engine, registry effectStatsFromCounts) and the DL network
//   metareg CBMBaselineDualNMA.fitBaselineModel, estimator FE, on very large binary trials (variances 3e-5 to 1.3e-4)
//   cluster ClusterRobustNMA.analyze (REML, no correction) on nma-tiny, SE x 1 and x 0.01
//   cnma    EnhancedCNMA.analyze additive component estimates, SE x 1 and x 0.01
//   robust  RobustTailedNMA.analyze on nma-tiny with y and SE x 1 and x 0.01 (no R analogue: scale equivariance)
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
vm.runInContext(main[1] + '\n;globalThis.__X = {FrequentistNMA, CBMBaselineDualNMA, ClusterRobustNMA, EnhancedCNMA,' +
  ' RobustTailedNMA, WORKER_CODE, reg: RapidReview};',
  ctx, { filename: 'nma-pro-v8.0.html' });
const X = vm.runInContext('__X', ctx);

// the worker's engine runs in its own context, as in the browser
const wctx = sandbox();
wctx.postMessage = noop;
vm.runInContext(X.WORKER_CODE + '\n;globalThis.__WNMA = NMA;', wctx, { filename: 'WORKER_CODE' });
const WNMA = vm.runInContext('__WNMA', wctx);

const readCsv = f => {
  const [head, ...rows] = fs.readFileSync(path.join(__dirname, f), 'utf8').trim().split(/\r?\n/);
  const h = head.split(',').map(x => x.replace(/"/g, ''));
  return rows.map(l => Object.fromEntries(l.split(',').map((v, i) => [h[i], v.replace(/"/g, '')])));
};
const contrasts = (rows, sc, scY) => rows.map(r => ({ name: r.study, study: r.study, treatment1: r.treat1,
  treatment2: r.treat2, yi: +r.yi * scY, se: +r.sei * sc, vi: (+r.sei * sc) ** 2 }));
const binary = rows => rows.map(r => ({ name: r.study, study: r.study, treatment1: r.treat1, treatment2: r.treat2,
  events1: +r.e1, n1: +r.n1, events2: +r.e2, n2: +r.n2 }));
const out = { pi: {}, rd: {}, metareg: {}, cluster: {}, cnma: {}, robust: {} };

// ---- prediction intervals ----
const senn = readCsv('fixtures/nmapro2-senn2013-2arm.csv'), tiny = readCsv('nma-tiny.csv'),
  tri = readCsv('fixtures/nmapro2-triangle.csv');
for (const [key, rows, sc, ref, est] of [['senn_REML', senn, 1, 'plac', 'REML'], ['senn_DL', senn, 1, 'plac', 'DL'],
  ['tiny_s0.01_REML', tiny, 0.01, 'A', 'REML'], ['tiny_s1_DL', tiny, 1, 'A', 'DL'], ['triangle_DL', tri, 1, 'A', 'DL']]) {
  const r = X.FrequentistNMA.analyze(contrasts(rows, sc, sc), { reference: ref, effectMeasure: 'MD', estimator: est,
    smallStudyCorrection: 'none' });
  const e = r.effects.effects, tr = r.treatments.filter(t => t !== ref);
  out.pi[key] = { tau2: r.tau2, df: tr.length ? e[tr[0]].pi_df : null,
    TE: Object.fromEntries(tr.map(t => [t, e[t].estimate])), seTE: Object.fromEntries(tr.map(t => [t, e[t].se])),
    lower: Object.fromEntries(tr.map(t => [t, e[t].pi_lower === undefined ? 'undefined' : e[t].pi_lower])),
    upper: Object.fromEntries(tr.map(t => [t, e[t].pi_upper === undefined ? 'undefined' : e[t].pi_upper])) };
}

// ---- risk difference ----
const rd = binary(readCsv('fixtures/nmapro2-rd.csv'));
const pm = X.FrequentistNMA.calcEffects(rd, 'RD'), pw = WNMA.calcEffects(rd, 'RD');
out.rd.main = pm.map(s => ({ yi: s.yi, vi: s.vi }));
out.rd.worker = pw.map(s => ({ yi: s.yi, vi: s.vi }));
out.rd.registry = X.reg && typeof X.reg.effectStatsFromCounts === 'function'
  ? rd.map(s => { const st = X.reg.effectStatsFromCounts('RD', s.events1, s.n1, s.events2, s.n2); return st && { yi: st.yi ?? st.logEffect ?? st.estimate, se: st.se, vi: st.vi }; })
  : null;
const rdn = X.FrequentistNMA.analyze(rd, { reference: 'A', effectMeasure: 'RD', estimator: 'DL', smallStudyCorrection: 'none' });
out.rd.nma = { tau2: rdn.tau2, TE: { B: rdn.effects.effects.B.estimate, C: rdn.effects.effects.C.estimate },
  seTE: { B: rdn.effects.effects.B.se, C: rdn.effects.effects.C.se } };

// ---- baseline-risk meta-regression, common effect ----
const bt = binary(readCsv('fixtures/nmapro2-bigtrial.csv'));
const mr = X.CBMBaselineDualNMA.fitBaselineModel(bt, { reference: 'A', effectMeasure: 'OR', estimator: 'FE',
  smallStudyCorrection: 'none' });
out.metareg = { applicable: mr.applicable, tau2: mr.tau2,
  yi: X.FrequentistNMA.calcEffects(bt, 'OR').map(s => s.yi), vi: X.FrequentistNMA.calcEffects(bt, 'OR').map(s => s.vi),
  beta: { B: mr.effects.effects.B.estimate, C: mr.effects.effects.C.estimate, D: mr.effects.effects.D.estimate, slope: mr.baselineSlope },
  se: { B: mr.effects.effects.B.se, C: mr.effects.effects.C.se, D: mr.effects.effects.D.se, slope: mr.baselineSlopeSE } };

// ---- cluster-robust ----
for (const sc of [1, 0.01]) {
  const r = X.ClusterRobustNMA.analyze(contrasts(tiny, sc, 1), { reference: 'A', effectMeasure: 'MD', estimator: 'REML',
    smallStudyCorrection: 'none', seed: 1 });
  out.cluster['s' + sc] = { applicable: r.applicable, tau2: r.tau2,
    beta: Object.fromEntries(['B', 'C', 'D'].map(t => [t, r.effects.effects[t].estimate])),
    se: Object.fromEntries(['B', 'C', 'D'].map(t => [t, r.effects.effects[t].se])),
    rows: r.rows.map(x => ({ treatment: x.treatment, seNaive: x.seNaive, seCR: x.seCR })) };
}

// ---- component NMA ----
const cn = readCsv('fixtures/nmapro2-cnma.csv');
for (const sc of [1, 0.01]) {
  const r = X.EnhancedCNMA.analyze(contrasts(cn, sc, 1), { reference: 'P', effectMeasure: 'MD', interactionSelection: 'none' });
  out.cnma['s' + sc] = { applicable: r.applicable,
    est: Object.fromEntries(r.componentEffects.map(c => [c.component, c.estimate])),
    se: Object.fromEntries(r.componentEffects.map(c => [c.component, c.se])) };
}

// ---- robust t: y and SE scaled together ----
for (const sc of [1, 0.01]) {
  const r = X.RobustTailedNMA.analyze(contrasts(tiny, sc, sc), { reference: 'A', effectMeasure: 'MD', estimator: 'REML',
    smallStudyCorrection: 'none', seed: 1 });
  out.robust['s' + sc] = { applicable: r.applicable, tau2: r.tau2Robust,
    beta: Object.fromEntries(['B', 'C', 'D'].map(t => [t, r.effects.effects[t].estimate])),
    se: Object.fromEntries(['B', 'C', 'D'].map(t => [t, r.effects.effects[t].se])),
    weights: r.diagnostics.map(d => [d.studyName, d.weight]).sort() };
}
process.stdout.write(JSON.stringify(out));
