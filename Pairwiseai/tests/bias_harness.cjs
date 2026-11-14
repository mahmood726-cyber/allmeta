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
// the pages load shared/ma-core.js (AlmMaCore) before the engine; NO_MA_CORE=1 simulates a page that does not
if (!process.env.NO_MA_CORE) vm.runInContext(fs.readFileSync(path.join(shared, 'ma-core.js'), 'utf8'), ctx, { filename: 'ma-core.js' });
let src = fs.readFileSync(file, 'utf8');
// load the shared scripts the page itself loads (an .html engine), in page order; the .js engine is
// Truthcert1/app.min.js, whose page loads only upper-tail.js and ma-core.js (both loaded above)
if (file.endsWith('.html')) for (const m of src.matchAll(/<script src="\.\.\/shared\/([a-z0-9-]+\.js)"><\/script>/g))
  if (!['upper-tail.js', 'ma-core.js'].includes(m[1])) vm.runInContext(fs.readFileSync(path.join(shared, m[1]), 'utf8'), ctx, { filename: m[1] });
if (file.endsWith('.html')) {
  const s = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('function estimateTau2_REML('));
  if (s.length !== 1) throw new Error('engine script count ' + s.length);
  src = s[0];
}
vm.runInContext(src, ctx, { filename: path.basename(file) });
const g = n => vm.runInContext(n, ctx);
// R's sort/order are stable; the vm has no AppState, so the engine's own globals are used as the page does
const out = {};
for (const nm of ['bcg', 'hack']) {
  const d = ref[nm], se = d.vi.map(Math.sqrt), o = {};
  const eg = g('eggersTest')(d.yi, se, null, 'continuous');
  o.egger = { intercept: eg.intercept, se: eg.se, t: eg.t_statistic, p: eg.p_value, df: eg.df };
  o.trimfill = {};
  for (const m of ['REML', 'DL', 'ML']) for (const est of ['L0', 'R0']) {
    const tf = g('trimAndFill')(d.yi, d.vi, 'auto', est, 100, m);
    o.trimfill[m + '_' + est] = { side: tf.side, k0: tf.k0_imputed, b: tf.adjusted.theta ?? tf.adjusted.effect, se: tf.adjusted.se ?? null,
      ci_lb: tf.adjusted.ci_lower ?? null, ci_ub: tf.adjusted.ci_upper ?? null, fill_yi: (tf.imputed_studies || []).map(x => x.yi), fill_vi: (tf.imputed_studies || []).map(x => x.vi) };
    for (const sd of ['left', 'right']) { const t2 = g('trimAndFill')(d.yi, d.vi, sd, est, 100, m);
      o.trimfill[m + '_' + est + '_' + sd] = { k0: t2.k0_imputed, b: t2.adjusted.theta ?? t2.adjusted.effect }; }
  }
  o.pi = {};
  for (const m of ['REML', 'DL']) {
    const tau2 = g('estimateTau2')(d.yi, d.vi, m).tau2, pe = g('calculatePooledEstimate')(d.yi, d.vi, tau2), k = d.yi.length;
    const st = g('predictionInterval_Standard')(pe.theta, pe.se, tau2, k);
    const cp = g('calculatePredictionInterval')(d.yi, d.vi, tau2);
    const ip = g('improvedPredictionInterval')(d.yi, d.vi, tau2);
    const hk = g('calculateHKSJ')(d.yi, d.vi, pe.theta, tau2);
    o.pi[m] = { theta: pe.theta, se: pe.se, tau2, standard: [st.lower, st.upper, st.df], calc: [cp.lower, cp.upper, cp.df],
      improved_hts: [ip.standardPI.lower, ip.standardPI.upper],
      hksj: [hk.se_hksj, hk.ci_lower, hk.ci_upper] };
  }
  out[nm] = o;
}
// the bundle's R export (Code tab); Truthcert1's R export is another lane's
if (file.endsWith('.html')) {
  const d = ref.bcg, e = { yi: d.yi, vi: d.vi, names: d.yi.map((_, i) => 'S' + (i + 1)), measure: 'RR', direction: 'lower' };
  out.rcode = { hksj: g('generateRCode')(e, { method: 'REML', hksj: true }), z: g('generateRCode')(e, { method: 'REML', hksj: false }) };
}
process.stdout.write(JSON.stringify(out));
