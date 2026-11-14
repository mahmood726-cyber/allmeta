// Runs nma-pro-v8.0.html's main inline script (after the ../shared/*.js it loads first) in a Node vm sandbox and
// prints FrequentistNMA.analyze on tests/nma-tiny.csv with every SE multiplied by 1 and by 0.01 (variances 3e-6 to
// 6e-6: below the old 1e-4 VARIANCE_FLOOR), REML and DL, no small-sample correction: tau2, Q, the effects vs A and
// their SEs, and TreatmentRanking.calcPScores (lower is better). tests/floor_reference.R gives netmeta's values.
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
    URLSearchParams, Intl: globalThis.Intl, TextEncoder, TextDecoder
  };
  s.window = s; s.self = s; s.globalThis = s;
  return vm.createContext(s);
}
// the object literal / function starting at `marker` (brace-matched; the code has no braces inside strings here)
function grab(src, marker) {
  const a = src.indexOf(marker);
  if (a < 0) throw new Error('not found: ' + marker);
  let d = 0, j = src.indexOf('{', a);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) { j = k; break; } }
  return src.slice(a, j + 1);
}
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
const main = blocks.find(m => m[1].includes('const Stats='));
if (!main) throw new Error('main inline script with const Stats= not found');
const ctx = sandbox();
const loaded = [];
for (const m of html.slice(0, main.index).matchAll(/<script src="\.\.\/shared\/([\w.-]+\.js)"[^>]*><\/script>/g)) {
  const f = path.join(root, '..', 'shared', m[1]);
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  loaded.push(m[1]);
}

const src = main[1];
vm.runInContext(src + '\n;globalThis.__F = FrequentistNMA; globalThis.__C = NMA_CONSTANTS;', ctx, { filename: 'nma-pro-v8.0.html' });
const F = vm.runInContext('__F', ctx);
vm.runInContext('globalThis.__TR = TreatmentRanking;', ctx);
const TR = vm.runInContext('__TR', ctx);
const csv = fs.readFileSync(path.join(__dirname, 'nma-tiny.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const out = { floor: vm.runInContext('__C.VARIANCE_FLOOR', ctx), cases: {} };
for (const scale of [1, 0.01]) {
  const studies = csv.map(([study, t1, t2, yi, sei]) => ({ name: study, study, treatment1: t1, treatment2: t2, yi: +yi, se: +sei * scale, vi: (+sei * scale) ** 2 }));
  for (const est of ['REML', 'DL']) {
    const r = F.analyze(studies, { reference: 'A', effectMeasure: 'MD', estimator: est, smallStudyCorrection: 'none' });
    const e = r.effects.effects;
    out.cases[`s${scale}_${est}`] = { tau2: r.tau2, Q: r.heterogeneity && r.heterogeneity.Q, v: Array.from(r.matrices.v),
      effects: Object.fromEntries(['B', 'C', 'D'].map(t => [t, { est: e[t].estimate, se: e[t].se }])),
      pscores: TR.calcPScores(r.effects, r.treatments, 'lower') };
  }
}
process.stdout.write(JSON.stringify(out));
