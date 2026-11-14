// Runs nma-pro-v8.0.html's main inline script (after the ../shared/*.js it loads first) in a Node vm sandbox, plus the
// Web Worker's own engine (WORKER_CODE), and prints what tests/test_nmapro3_modules.py compares with
// tests/nmapro3_r460.json (tests/nmapro3_reference.R):
//   bayesfe   BayesianNMA common-effect posterior mean / sd on the full Senn data (4 x 11000 draws)
//   multiarm  FrequentistNMA.analyze on the full Senn 2013 data (a 3-arm study as its 3 TE/seTE contrasts) and on
//             smokingcessation (OR from counts, two 3-arm studies), DL and REML, plus Senn with y and SE x 0.01
//   worker    WORKER_CODE NMA.calcEffects OR / RR per study (smokingcessation contrasts, one with a zero cell)
//   registry  RapidReview.effectStatsFromCounts OR / RR SE on very large trials
//   coxyear   IPDCoxNMA.phDiagnostic slope SE on very large trials tagged with a year
//   mcid      MCIDProbabilityRanking on nma-tiny, y and SE x 0.01, thresholds -/+0.002
//   fp        FractionalPolynomialNMA (one time point: PH model) on nma-tiny, SE x 0.01
//   mlnmr     MLNMR population-adjusted (common-effect interaction) model, SE x 1 and x 0.01
//   composite CompositeLikelihoodNMA on the full Senn data, y and SE x 0.01
//   equi      modules with no R counterpart, run with y and SE x 1, x 0.01 and x 1e-4 (scale equivariance)
// Usage: node nmapro3_harness.cjs   (PAGE=<path> runs another copy of the page)
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
vm.runInContext(main[1] + '\n;globalThis.__X = {FrequentistNMA, MCIDProbabilityRanking, GFLSparsePooling,' +
  ' PredictivePScore, SMAANMARanking, CNMALOOContribution, IPDCoxNMA, NMAInfluenceDiagnostics, QDecompositionNMA,' +
  ' BayesianOutlierDownweightNMA, BayesianNMA, FractionalPolynomialNMA, MLNMR, CompositeLikelihoodNMA, WORKER_CODE,' +
  ' reg: RapidReview};', ctx, { filename: 'nma-pro-v8.0.html' });
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
const map = (ts, f) => Object.fromEntries(ts.map(t => [t, f(t)]));
const safe = f => { try { return f() } catch (e) { return 'ERROR ' + e.message } };
const out = { multiarm: {}, worker: {}, registry: {}, coxyear: {}, mcid: {}, fp: {}, mlnmr: {}, composite: {}, equi: {} };

// ---- multi-arm networks ----
const senn = readCsv('fixtures/nmapro3-senn2013-full.csv'), smoke = binary(readCsv('fixtures/nmapro3-smoking.csv')),
  tiny = readCsv('nma-tiny.csv');
const nmaOut = (r, ref) => {
  const e = r.effects.effects, tr = r.treatments.filter(t => t !== ref), h = r.heterogeneity;
  return { Q: h.Q, df: h.df, pQ: h.pQ, I2: h.I2, tau2: r.tau2, TE: map(tr, t => e[t].estimate),
    seTE: map(tr, t => e[t].se), lower: map(tr, t => e[t].pi_lower ?? null), upper: map(tr, t => e[t].pi_upper ?? null) };
};
for (const est of ['DL', 'REML']) {
  out.multiarm['senn_' + est] = nmaOut(X.FrequentistNMA.analyze(contrasts(senn, 1, 1), { reference: 'plac',
    effectMeasure: 'MD', estimator: est, smallStudyCorrection: 'none', predictionIntervals: true }), 'plac');
  out.multiarm['smoke_' + est] = nmaOut(X.FrequentistNMA.analyze(smoke, { reference: 'A', effectMeasure: 'OR',
    estimator: est, smallStudyCorrection: 'none', predictionIntervals: true }), 'A');
}
out.multiarm['senn_s0.01_DL'] = nmaOut(X.FrequentistNMA.analyze(contrasts(senn, 0.01, 0.01), { reference: 'plac',
  effectMeasure: 'MD', estimator: 'DL', smallStudyCorrection: 'none', predictionIntervals: true }), 'plac');

// Bayesian common-effect model on the full Senn data: with tau2 = 0 and a vague prior the beta draws are iid from
// N(GLS estimate, (X' V^-1 X)^-1), so the posterior mean / sd estimate netmeta's TE.common / seTE.common
const bfe = X.BayesianNMA.analyze(contrasts(senn, 1, 1), { reference: 'plac', effectMeasure: 'MD', modelType: 'fixed',
  nChains: 4, nIter: 12000, burnin: 1000, thin: 1, seed: 5, betaPriorSD: 1000, ppcReplicates: 100 });
out.bayesfe = { n: bfe.samples && bfe.samples.length, mean: map(Object.keys(bfe.summary.effects), t => bfe.summary.effects[t].mean),
  sd: map(Object.keys(bfe.summary.effects), t => bfe.summary.effects[t].sd) };

// ---- per-study OR / RR: worker engine vs main engine; registry import SE ----
const big = binary(readCsv('fixtures/nmapro2-bigtrial.csv'));
for (const em of ['OR', 'RR']) {
  out.worker[em] = { worker: WNMA.calcEffects(smoke, em).map(s => ({ yi: s.yi, vi: s.vi })),
    main: X.FrequentistNMA.calcEffects(smoke, em).map(s => ({ yi: s.yi, vi: s.vi })) };
  out.registry[em] = big.map(s => X.reg.effectStatsFromCounts(em, s.events1, s.n1, s.events2, s.n2).se);
}

// ---- IPD-Cox PH stress test (weighted regression on year) ----
const cyRows = readCsv('fixtures/nmapro3-coxyear.csv');
const cy = binary(cyRows).map((s, i) => ({ ...s, year: +cyRows[i].year }));
out.coxyear = X.IPDCoxNMA.phDiagnostic(X.IPDCoxNMA.buildPseudoContrasts(cy).contrasts);

// ---- MCID probabilities ----
const tinyDL = X.FrequentistNMA.analyze(contrasts(tiny, 0.01, 0.01), { reference: 'A', effectMeasure: 'MD',
  estimator: 'DL', smallStudyCorrection: 'none' });
const mc = X.MCIDProbabilityRanking.analyze(tinyDL, { effectMeasure: 'MD', direction: 'lower', benefitThreshold: -0.002,
  harmThreshold: 0.002 });
out.mcid = { pBenefit: Object.fromEntries(mc.rows.map(r => [r.treatment, r.pBenefit])),
  pHarm: Object.fromEntries(mc.rows.map(r => [r.treatment, r.pHarm])) };

// ---- fractional-polynomial survival NMA, one time point (PH model) ----
const fp = X.FractionalPolynomialNMA.analyze(tiny.map(r => ({ name: r.study, treatment1: r.treat1, treatment2: r.treat2,
  logHR: +r.yi, seLogHR: +r.sei * 0.01, time: 12 })), { reference: 'A' });
const fpPred = t => X.FractionalPolynomialNMA.predictTreatment(fp.fit, t, 12);
out.fp = { applicable: fp.applicable, best: fp.bestModel && fp.bestModel.name,
  TE: map(['B', 'C', 'D'], t => fpPred(t).logHR),
  seTE: map(['B', 'C', 'D'], t => (Math.log(fpPred(t).ci95[1]) - fpPred(t).logHR) / 1.959963984540054) };

// ---- ML-NMR (common-effect treatment x covariate model) ----
const ml = readCsv('fixtures/nmapro3-mlnmr.csv');
for (const sc of [1, 0.01]) {
  const st = contrasts(ml, sc, 1).map((s, i) => ({ ...s, age: +ml[i].age }));
  const r = X.MLNMR.analyze(st, { age: 50 }, { reference: 'A', effectMeasure: 'MD', estimator: 'DL',
    smallStudyCorrection: 'none', effectModifiers: ['age'] });
  const beta = {}, se = {};
  if (!r.error) {
    const e = r.adjusted.effects.effects;
    ['B', 'C', 'D'].forEach(t => { beta[t] = e[t].estimate; se[t] = e[t].se });
    r.adjusted.interactions.forEach(x => { beta[x.treatment + ':age'] = x.slope; se[x.treatment + ':age'] = x.se });
  }
  out.mlnmr['s' + sc] = { error: r.error, beta, se };
}

// ---- composite likelihood ----
const cl = X.CompositeLikelihoodNMA.analyze(contrasts(senn, 0.01, 0.01), { reference: 'plac', effectMeasure: 'MD' });
const ctr = Object.keys(cl.effects).filter(t => t !== 'plac');
out.composite = { df: cl.heterogeneity.df, tau2: cl.tau2, TE: map(ctr, t => cl.effects[t].estimate),
  seTE: map(ctr, t => cl.effects[t].se) };

// ---- scale equivariance (no R counterpart): y and SE x sc; z, P, weights and ranks must not change ----
const s2 = readCsv('fixtures/nmapro2-senn2013-2arm.csv'), cn = readCsv('fixtures/nmapro2-cnma.csv');
for (const sc of [1, 0.01, 1e-4]) {
  const st = contrasts(s2, sc, sc), o = { reference: 'plac', effectMeasure: 'MD', estimator: 'DL',
    smallStudyCorrection: 'none', direction: 'lower', seed: 7 };
  const base = X.FrequentistNMA.analyze(st, o);
  out.equi['s' + sc] = {
    ppscore: safe(() => Object.fromEntries(X.PredictivePScore.analyze(base, { direction: 'lower', effectMeasure: 'MD',
      tau2: base.tau2 }).rows.map(r => [r.treatment, r.predictivePScore]))),
    gfl: safe(() => { const g = X.GFLSparsePooling.analyze(base, { lambda: 1 }); return { nClusters: g.nClusters,
      pooled: Object.fromEntries(g.rows.map(r => [r.treatment, r.pooled / sc])),
      se: Object.fromEntries(g.groups.map(x => [x.members.join('+'), x.se / sc])) } }),
    smaa: safe(() => Object.fromEntries(X.SMAANMARanking.analyze(base, { direction: 'lower', nSim: 2000, seed: 11 })
      .rows.map(r => [r.treatment, r.acceptability]))),
    cnmaloo: safe(() => { const l = X.CNMALOOContribution.analyze(contrasts(cn, sc, sc), { separator: '+',
      effectMeasure: 'MD' }); return l.applicable === false ? 'NA ' + l.message :
      Object.fromEntries(l.rows.map(r => [r.component + ' ' + r.comparison, r.contribution])) }),
    influence: safe(() => { const r = X.NMAInfluenceDiagnostics.analyze(st, o); return r.applicable === false ?
      'NA ' + r.message : Object.fromEntries(r.rows.map(x => [x.studyName, x.maxStdShift ?? null])) }),
    qdecomp: safe(() => { const q = X.QDecompositionNMA.analyze(st, o); return q.applicable === false ? 'NA ' + q.message :
      { qWithin: q.qWithin, qBetween: q.qBetween, z: Object.fromEntries(q.rows.map(r => [r.design, r.residualZ])) } }),
    outlier: safe(() => { const b = X.BayesianOutlierDownweightNMA.analyze(st, o); return b.applicable === false ?
      'NA ' + b.message : Object.fromEntries(b.diagnostics.map(d => [d.studyName, d.weight])) })
  };
}
process.stdout.write(JSON.stringify(out));
