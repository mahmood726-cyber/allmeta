// Runs nma-pro-v8.0.html's main inline script (after the ../shared/*.js it loads first) in a Node vm sandbox and
// prints what tests/test_nmapro5_modules.py compares with tests/nmapro5_r460.json (tests/nmapro5_reference.R):
//   rd      calcEffects RD for the 3-arm study 25 with a zero arm, FrequentistNMA.analyze RD DL
//   loo     LeaveOneOut / NMAInfluenceDiagnostics / DesignInfluenceNMA on the full Senn 2013 data, DL and REML
//   bridge  the same three modules on fixtures/nmapro5-bridge.csv (b4 is the only link between {A, B} and {C, D, E})
//   dis     FrequentistNMA.analyze and NetworkGuardian on a disconnected network; Matrix.solve on a singular matrix
//   scale   Senn 2013 with y and SE x 1, x 1e-6, x 1e-7 (DL, REML)
//   zc      zero-cell options tacc / reciprocal / sweeting on smokingcessation + study 25 (multi-arm, zero arm)
//   na      importCSV on a CSV with a missing (NA) event count, then the OR DL network of what was imported
// Usage: node nmapro5_harness.cjs   (PAGE=<path> runs another copy of the page)
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
vm.runInContext(main[1] + '\n;globalThis.__X = {FrequentistNMA, NetworkGuardian, LeaveOneOut, NMAInfluenceDiagnostics,' +
  ' DesignInfluenceNMA, Matrix, AppState, importCSV};', ctx, { filename: 'nma-pro-v8.0.html' });
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
const opt = (ref, em, est) => ({ reference: ref, effectMeasure: em, estimator: est, smallStudyCorrection: 'none',
  predictionIntervals: false, seed: 7 });
const out = {};

// ---------------------------------------------------------------- rd
{ const sz = binary(readCsv('fixtures/nmapro4-smoking-zero.csv'));
  out.rd = safe(() => {
    const rows = X.FrequentistNMA.calcEffects(sz, 'RD').filter(s => String(s.name) === '25');
    const r = X.FrequentistNMA.analyze(sz, opt('A', 'RD', 'DL'));
    return { row25: Object.fromEntries(rows.map(s => [s.treatment1 + ':' + s.treatment2, { TE: s.yi, seTE: Math.sqrt(s.vi) }])),
      tau2: r.tau2, Q: r.heterogeneity.Q, df: r.heterogeneity.df, TE: vs(r, 'estimate'), se: vs(r, 'se') };
  }); }

// ---------------------------------------------------------------- loo
const looOf = (st, ref, est) => {
  const l = safe(() => X.LeaveOneOut.analyze(st, opt(ref, 'MD', est)));
  const inf = safe(() => X.NMAInfluenceDiagnostics.analyze(st, opt(ref, 'MD', est)));
  const des = safe(() => X.DesignInfluenceNMA.analyze(st, opt(ref, 'MD', est)));
  return {
    loo: l.error ? l : { full: l.fullTau2, rows: (l.looResults || []).map(r => ({ study: r.studyName, nRows: r.nRows ?? null,
      error: !!r.error, refused: !!r.refused, message: r.message || null, tau2: r.tau2 ?? null,
      TE: r.effectChanges ? Object.fromEntries(Object.entries(r.effectChanges).map(([t, e]) => [t, e.estimate])) : null })) },
    inf: inf.error ? inf : { applicable: inf.applicable, nStudies: inf.nStudies ?? null, message: inf.message || null,
      rows: (inf.rows || []).map(r => ({ study: r.studyName, nRows: r.nRows ?? null, estimable: r.estimable,
        refused: !!r.refused, message: r.message || null, tau2: r.tau2Loo ?? null })) },
    des: des.error ? des : { applicable: des.applicable, nDesigns: des.nDesigns ?? null, message: des.message || null,
      rows: (des.rows || []).map(r => ({ design: r.design, nRemoved: r.nRemoved, estimable: r.estimable,
        refused: !!r.refused, message: r.message || null, remaining: r.remainingStudies ?? null, tau2: r.tau2Loo ?? null,
        tau2RelChange: r.tau2RelChange ?? null })) }
  };
};
const senn = contrasts(readCsv('fixtures/nmapro3-senn2013-full.csv'), 1);
out.loo = { DL: looOf(senn, 'plac', 'DL'), REML: looOf(senn, 'plac', 'REML') };
out.bridge = looOf(contrasts(readCsv('fixtures/nmapro5-bridge.csv'), 1), 'A', 'DL');

// ---------------------------------------------------------------- dis / singular
{ const dis = [['a', 'A', 'B', 0.1, 0.2], ['b', 'A', 'B', 0.3, 0.25], ['c', 'C', 'D', -0.2, 0.2], ['d', 'C', 'D', 0.0, 0.3]]
    .map(([n, t1, t2, y, se]) => ({ name: n, treatment1: t1, treatment2: t2, yi: y, se, vi: se * se }));
  out.dis = { engine: safe(() => { const r = X.FrequentistNMA.analyze(dis, opt('A', 'MD', 'DL'));
      return { ran: true, TE: vs(r, 'estimate'), se: vs(r, 'se') }; }),
    guardian: safe(() => X.NetworkGuardian.analyze(dis).canProceed),
    solve: safe(() => ({ ran: true, x: X.Matrix.solve([[1, -1], [-1, 1]], [1, 2]) })),
    inverse: safe(() => ({ ran: true, x: X.Matrix.inverse([[2, 4], [1, 2]]) })) }; }

// ---------------------------------------------------------------- scale
out.scale = {};
for (const [sc, lab] of [[1, '1'], [1e-6, '1e-06'], [1e-7, '1e-07']]) for (const est of ['DL', 'REML']) {
  out.scale[est + '_' + lab] = safe(() => { const r = X.FrequentistNMA.analyze(contrasts(readCsv('fixtures/nmapro3-senn2013-full.csv'), sc),
    opt('plac', 'MD', est)); return { sc, tau2: r.tau2, Q: r.heterogeneity.Q, TE: r.effects.effects.acar.estimate, se: r.effects.effects.acar.se }; });
}

// ---------------------------------------------------------------- zero-cell options
{ const sz = binary(readCsv('fixtures/nmapro4-smoking-zero.csv'));
  out.zc = {};
  for (const z of ['haldane', 'tacc', 'reciprocal', 'sweeting']) {
    const rows = safe(() => X.FrequentistNMA.calcEffects(sz, 'OR', z).filter(s => String(s.name) === '25').map(s => s.yi));
    X.AppState.zeroCellCorrection = z; X.AppState.effectMeasure = 'OR';
    out.zc[z] = { rows25: rows, run: safe(() => { const r = X.FrequentistNMA.analyze(sz, { ...opt('A', 'OR', 'DL'), zeroCellCorrection: z });
        return { ran: true, tau2: r.tau2 }; }),
      guardian: safe(() => X.NetworkGuardian.analyze(sz).canProceed) };
    // a two-arm-only network with a zero cell keeps the option (its contrasts are independent)
    const twoArm = sz.filter(s => !['25', '1', '2'].includes(String(s.name)));
    out.zc[z].twoArm = safe(() => { const r = X.FrequentistNMA.analyze(twoArm, { ...opt('A', 'OR', 'DL'), zeroCellCorrection: z });
      return { ran: true, tau2: r.tau2, zeroRows: twoArm.filter(s => s.events1 === 0 || s.events2 === 0).length }; });
  }
  X.AppState.zeroCellCorrection = 'haldane'; }

// ---------------------------------------------------------------- na import
{ const csv = ['study,treatment1,events1,n1,treatment2,events2,n2', 'S1,A,10,100,B,NA,100', 'S2,A,12,100,B,15,100',
    'S3,B,7,90,C,9,90', 'S4,A,8,80,C,11,80', 'S5,A,6,70,C,9,70'].join('\n');
  out.na = safe(() => { const r = X.importCSV(csv);
    const studies = r.studies.map(s => ({ ...s, events1: Number(s.events1), events2: Number(s.events2), n1: Number(s.n1), n2: Number(s.n2) }));
    const a = safe(() => { const f = X.FrequentistNMA.analyze(studies, opt('A', 'OR', 'DL')); return { tau2: f.tau2, Q: f.heterogeneity.Q, TE: vs(f, 'estimate') }; });
    return { kept: r.studies.map(s => [s.name, s.events1, s.events2]), dropped: (r.dropped || []).map(d => d.name),
      warnings: r.warnings, errors: r.errors, fit: a }; }); }

process.stdout.write(JSON.stringify(out));
