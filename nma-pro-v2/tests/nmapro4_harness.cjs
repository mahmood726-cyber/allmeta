// Runs nma-pro-v8.0.html's main inline script (after the ../shared/*.js it loads first) in a Node vm sandbox, plus the
// Web Worker's own engine (WORKER_CODE), and prints what tests/test_nmapro4_modules.py compares with
// tests/nmapro4_r460.json (tests/nmapro4_reference.R):
//   decomp    FrequentistNMA heterogeneity.decomposition / designByTreatment and QDecompositionNMA on the full Senn
//             2013 data and on smokingcessation (OR from counts), DL
//   netsplit  FrequentistNMA consistency (node-splitting) on the same networks, DL (random) and FE (common)
//   refuse    the Senn data with an inconsistent 3-arm study: FrequentistNMA.analyze, NetworkGuardian.analyze
//   mlnmr     MLNMR adjusted-model tau2 (two-arm, SE x 0.3) and the multi-arm GLS fit (SE x 0.3)
//   rr        FrequentistNMA / WORKER_CODE calcEffects RR per contrast, FrequentistNMA.analyze RR smokingcessation DL
//   bayesRR   the matrices BayesianNMA.analyze builds for RR counts (common-effect GLS on them)
//   zero      smokingcessation + a 3-arm study with a zero arm: its contrasts and the DL network, OR and RR
//   boot      BootstrapRankUncertainty: the resampling unit (studies, multi-arm rows together), seed, B, MC SE
//   cross     CrossDesignCalibratedNMA with y and SE x 1, x 0.01, x 1e-4 (scale equivariance) and row/RoB alignment
// Usage: node nmapro4_harness.cjs   (PAGE=<path> runs another copy of the page)
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
vm.runInContext(main[1] + '\n;globalThis.__X = {FrequentistNMA, NetworkGuardian, QDecompositionNMA, MLNMR, BayesianNMA,' +
  ' BootstrapRankUncertainty, CrossDesignCalibratedNMA, WORKER_CODE: typeof WORKER_CODE !== "undefined" ? WORKER_CODE : null};', ctx, { filename: 'nma-pro-v8.0.html' });
const X = vm.runInContext('__X', ctx);
// lane nmapro5 (2026-11-15) removed the inlined Web Worker engine; WNMA is null unless an older page is run (PAGE=)
const WNMA = X.WORKER_CODE ? (() => { const wctx = sandbox(); wctx.postMessage = noop;
  vm.runInContext(X.WORKER_CODE + '\n;globalThis.__WNMA = NMA;', wctx, { filename: 'WORKER_CODE' });
  return vm.runInContext('__WNMA', wctx); })() : null;

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
const safe = f => { try { return f() } catch (e) { return { error: String(e && e.message || e) } } };
const out = { decomp: {}, netsplit: {}, refuse: {}, mlnmr: {}, rr: {}, zero: {}, boot: {}, cross: {} };

const senn = readCsv('fixtures/nmapro3-senn2013-full.csv'), smoke = binary(readCsv('fixtures/nmapro3-smoking.csv'));
const nets = { senn: [contrasts(senn, 1, 1), 'plac', 'MD'], smoke: [smoke, 'A', 'OR'] };

// ---- design decomposition and node-splitting ----
for (const [nm, [st, ref, em]] of Object.entries(nets)) {
  const o = { reference: ref, effectMeasure: em, estimator: 'DL', smallStudyCorrection: 'none', predictionIntervals: false };
  const r = X.FrequentistNMA.analyze(st, o), h = r.heterogeneity;
  out.decomp[nm] = { Q: h.Q, df: h.df, decomposition: h.decomposition, designByTreatment: h.designByTreatment,
    qmodule: safe(() => { const q = X.QDecompositionNMA.analyze(st, o); return { qWithin: q.qWithin, qBetween: q.qBetween,
      qTotal: q.qTotal, dfWithin: q.dfWithin, dfBetween: q.dfBetween, nDesigns: q.nDesigns,
      designs: (q.rows || []).map(x => x.design),
      twoArm: Object.fromEntries((q.rows || []).filter(x => x.arms && x.arms.length === 2).map(x => [x.arms.join(':'),
        { label: x.design, direct: x.directEstimate, network: x.predictedEstimate, z: x.residualZ }])) } }) };
  const ns = rows => Object.fromEntries(rows.map(c => [c.t1 + ':' + c.t2, { network: c.networkEstimate,
    seNetwork: c.networkSE ?? null, direct: c.directEstimate, seDirect: c.directSE, indirect: c.indirectEstimate,
    seIndirect: c.indirectSE, diff: c.difference, seDiff: c.differenceSE, p: c.pValue, nStudies: c.nStudies }]));
  const fe = X.FrequentistNMA.analyze(st, { ...o, estimator: 'FE' });
  out.netsplit[nm] = { tau2: r.tau2, random: ns(r.consistency), common: ns(fe.consistency) };
}

// a star network (no loops): no design has indirect evidence, df between designs = 0 -> no design-by-treatment test
{ const star = [['S1', 'B', 'A', -0.3, 0.2], ['S2', 'B', 'A', -0.1, 0.25], ['S3', 'C', 'A', 0.2, 0.2], ['S4', 'C', 'A', 0.5, 0.3],
    ['S5', 'D', 'A', -0.4, 0.2], ['S6', 'D', 'A', 0.1, 0.22]].map(([n, t1, t2, y, se]) => ({ name: n, study: n,
    treatment1: t1, treatment2: t2, yi: y, se, vi: se * se }));
  const r = X.FrequentistNMA.analyze(star, { reference: 'A', effectMeasure: 'MD', estimator: 'DL', smallStudyCorrection: 'none' });
  out.decomp.star = { df: r.heterogeneity.df, dfWithin: r.heterogeneity.decomposition.dfWithin,
    dfBetween: r.heterogeneity.decomposition.dfBetween, pValue: r.heterogeneity.designByTreatment.pValue,
    overall: r.consistencySummary.overall, nTests: r.consistencySummary.nTests }; }

// ---- refusal of an inconsistent multi-arm study ----
const inc = contrasts(readCsv('fixtures/nmapro4-senn-inconsistent.csv'), 1, 1);
out.refuse.analyze = safe(() => { const r = X.FrequentistNMA.analyze(inc, { reference: 'plac', effectMeasure: 'MD',
  estimator: 'DL', smallStudyCorrection: 'none' }); return { tau2: r.tau2, df: r.heterogeneity.df } });
out.refuse.guardian = safe(() => { const g = X.NetworkGuardian.analyze(inc); return { canProceed: g.canProceed,
  fails: g.checks.filter(c => c.status === 'fail').map(c => c.message) } });
out.refuse.guardianClean = safe(() => { const g = X.NetworkGuardian.analyze(contrasts(senn, 1, 1)); return {
  canProceed: g.canProceed, fails: g.checks.filter(c => c.status === 'fail').map(c => c.message) } });

// ---- ML-NMR ----
for (const [nm, f] of [['twoarm', 'fixtures/nmapro3-mlnmr.csv'], ['multiarm', 'fixtures/nmapro4-mlnmr-multiarm.csv']]) {
  const rows = readCsv(f);
  const st = contrasts(rows, 0.3, 1).map((s, i) => ({ ...s, age: +rows[i].age }));
  out.mlnmr[nm] = safe(() => {
    const r = X.MLNMR.analyze(st, { age: 50 }, { reference: 'A', effectMeasure: 'MD', estimator: 'DL',
      smallStudyCorrection: 'none', effectModifiers: ['age'] });
    if (r.error) return { error: r.error };
    const beta = {}, se = {}, e = r.adjusted.effects.effects;
    ['B', 'C', 'D'].forEach(t => { beta[t] = e[t].estimate; se[t] = e[t].se });
    r.adjusted.interactions.forEach(x => { beta[x.treatment + ':age'] = x.slope; se[x.treatment + ':age'] = x.se });
    return { tau2: r.adjusted.tau2, Q: r.adjusted.modelFit.Q, df: r.adjusted.modelFit.df ?? null, beta, se };
  });
}

// ---- RR continuity correction and multi-arm RR ----
out.rr = { main: X.FrequentistNMA.calcEffects(smoke, 'RR').map(s => ({ yi: s.yi, vi: s.vi })),
  worker: WNMA ? WNMA.calcEffects(smoke, 'RR').map(s => ({ yi: s.yi, vi: s.vi })) : null };
{ const r = X.FrequentistNMA.analyze(smoke, { reference: 'A', effectMeasure: 'RR', estimator: 'DL',
    smallStudyCorrection: 'none', predictionIntervals: false }), e = r.effects.effects;
  out.rr.net = { Q: r.heterogeneity.Q, df: r.heterogeneity.df, tau2: r.tau2, TE: map(['B', 'C', 'D'], t => e[t].estimate),
    seTE: map(['B', 'C', 'D'], t => e[t].se) }; }

// ---- a 3-arm study with a zero arm: the increment goes to all its arms ----
out.zero = {};
{ const sz = binary(readCsv('fixtures/nmapro4-smoking-zero.csv'));
  for (const em of ['OR', 'RR']) {
    const rows = X.FrequentistNMA.calcEffects(sz, em).filter(s => String(s.study) === '25');
    const r = X.FrequentistNMA.analyze(sz, { reference: 'A', effectMeasure: em, estimator: 'DL', smallStudyCorrection: 'none',
      predictionIntervals: false }), e = r.effects.effects;
    const wrows = WNMA ? WNMA.calcEffects(sz, em).filter(s => String(s.study) === '25') : null;
    out.zero['worker' + em] = wrows && { rowTE: wrows.map(s => s.yi), rowSE: wrows.map(s => Math.sqrt(s.vi)) };
    out.zero[em] = { rowTE: rows.map(s => s.yi), rowSE: rows.map(s => Math.sqrt(s.vi)), Q: r.heterogeneity.Q, tau2: r.tau2,
      TE: map(['B', 'C', 'D'], t => e[t].estimate), seTE: map(['B', 'C', 'D'], t => e[t].se) };
  } }

// ---- BayesianNMA on RR counts: the matrices it is given must carry the RR multi-arm covariance ----
{ const orig = X.FrequentistNMA.buildMatrices; let cap = null;
  X.FrequentistNMA.buildMatrices = function (st, ref, o) { const m = orig.call(this, st, ref, o); if (!cap) cap = m; return m };
  try { X.BayesianNMA.analyze(smoke, { reference: 'A', effectMeasure: 'RR', modelType: 'fixed', nChains: 2, nIter: 300,
    burnin: 100, thin: 1, seed: 3, betaPriorSD: 1000, ppcReplicates: 100 }) } catch (e) { out.bayesRR = { error: String(e.message) } }
  finally { X.FrequentistNMA.buildMatrices = orig }
  if (cap) { const f = X.FrequentistNMA.fitGLS(cap, 0); out.bayesRR = Object.fromEntries(cap.treatments.slice(1).map((t, i) => [t, f.beta[i]])) } }

// ---- bootstrap ranks: what is resampled ----
{ // instrument FrequentistNMA.analyze to record each bootstrap sample (the first call is the baseline)
  const orig = X.FrequentistNMA.analyze, samples = [];
  X.FrequentistNMA.analyze = function (st, o) { samples.push(st.map(s => ({ name: s.name, study: s.study,
    t: [s.treatment1, s.treatment2].sort().join('|') }))); return orig.call(this, st, o) };
  const o = { reference: 'A', effectMeasure: 'OR', estimator: 'DL', smallStudyCorrection: 'none', direction: 'lower',
    nBoot: 80, seed: 12345 };
  let b1;
  try { b1 = X.BootstrapRankUncertainty.analyze(smoke, o) } finally { X.FrequentistNMA.analyze = orig }
  const b2 = X.BootstrapRankUncertainty.analyze(smoke, o);
  const boots = samples.slice(1);
  // multi-arm studies 1 and 2 have 3 rows each: in a study-level bootstrap every copy brings all 3 rows, under a
  // fresh study label so that two copies are two studies
  let splitCopies = 0, sharedLabel = 0, nStudiesOk = 0;
  boots.forEach(bs => {
    const byName = new Map();
    bs.forEach(r => { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r) });
    byName.forEach((rows) => {
      const pairs = rows.map(r => r.t), uniq = new Set(pairs);
      if (uniq.size !== pairs.length) sharedLabel++;
      const isMulti = rows.some(r => ['1', '2'].includes(String(r.study)));
      if (isMulti && rows.length !== 3) splitCopies++;
    });
    const origStudies = new Set(bs.map(r => String(r.study)));
    if (byName.size === 24 || origStudies.size <= 24) nStudiesOk += byName.size === 24 ? 1 : 0;
  });
  out.boot = { nSamples: boots.length, splitCopies, sharedLabel, samplesWith24Studies: nStudiesOk,
    seed: b1.seed ?? null, nBoot: b1.nBootRequested, mcse: b1.mcse ?? null,
    summaries1: b1.summaries.map(s => [s.treatment, s.meanPScore, s.topProbability]),
    summaries2: b2.summaries.map(s => [s.treatment, s.meanPScore, s.topProbability]),
    rowMcse: b1.summaries.map(s => [s.treatment, s.meanPScoreMCSE ?? null, s.topProbabilityMCSE ?? null]) };
}

// ---- cross-design calibration: scale equivariance ----
const s2 = readCsv('fixtures/nmapro2-senn2013-2arm.csv');
const robOf = i => ['low', 'some', 'high', ''][i % 4];
for (const sc of [1, 0.01, 1e-4]) {
  const st = contrasts(s2, sc, sc).map((s, i) => ({ ...s, rob: robOf(i) }));
  out.cross['s' + sc] = safe(() => { const r = X.CrossDesignCalibratedNMA.analyze(st, { reference: 'plac',
    effectMeasure: 'MD', estimator: 'DL', smallStudyCorrection: 'none', direction: 'lower', seed: 9 });
    return { tau2Ratio: r.tau2Calibrated / (sc * sc), counts: r.counts,
      p: Object.fromEntries(r.rows.map(x => [x.treatment, x.calibratedPScore])) } });
}
// a row the engine drops (OR without n: yi NaN) ahead of the others must not shift the RoB labels onto the wrong rows
{ const st = smoke.map(s => ({ ...s, rob: robOf(+s.study) }));   // RoB is a property of the study
  const bad = { name: 'NoN', study: 'NoN', treatment1: 'A', treatment2: 'B', events1: 3, events2: 4, rob: 'high' };
  const o = { reference: 'A', effectMeasure: 'OR', estimator: 'DL', smallStudyCorrection: 'none', direction: 'lower', seed: 9 };
  out.cross.align = safe(() => { const a = X.CrossDesignCalibratedNMA.analyze(st, o), b = X.CrossDesignCalibratedNMA.analyze([bad, ...st], o);
    return { a: a.counts, b: b.counts, tauA: a.tau2Calibrated, tauB: b.tau2Calibrated } });
}
process.stdout.write(JSON.stringify(out));
