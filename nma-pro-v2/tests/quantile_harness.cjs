// Runs nma-pro-v8.0.html's own distribution code in a Node vm sandbox the way the page does: every ../shared/*.js
// script the page loads before its main inline <script> (page order), then, from that inline script, the
// `const Stats = {...}` object, getCritVal, erfApprox and SurvivalNMA's survival / hazard functions; and,
// separately, the `const Stats = {...}` line of the inlined Web Worker (WORKER_CODE), which has no shared scripts.
// Prints the page's values on the grid of tests/quantile_r460.json as JSON.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.PAGE || path.join(root, 'nma-pro-v8.0.html'), 'utf8');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'quantile_r460.json'), 'utf8'));
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
vm.runInContext('const MainRNG={random:Math.random};' + grab(src, 'const Stats=') + ';globalThis.Stats=Stats;', ctx);
vm.runInContext(grab(src, 'function getCritVal(') + ';globalThis.getCritVal=getCritVal;', ctx);
vm.runInContext(grab(src, 'function erfApprox(') + ';globalThis.erfApprox=erfApprox;', ctx);
vm.runInContext('globalThis.SF={' + grab(src, 'survivalFunctions:{') + ',' + grab(src, 'hazardFunctions:{') + '};', ctx);
const f = n => vm.runInContext(n, ctx);
const S = f('Stats');
// the Web Worker: its own context, nothing loaded (a Blob worker gets no page scripts)
const wa = html.indexOf('const WORKER_CODE=`'), wb = html.indexOf('`;', wa);
const wline = html.slice(wa, wb).split(/\r?\n/).find(l => l.startsWith('const Stats={'));
if (!wline) throw new Error('worker Stats line not found');
const wctx = sandbox();
vm.runInContext(wline + ';globalThis.Stats=Stats;', wctx);
const WS = vm.runInContext('Stats', wctx);
const lowP = R.p.filter(p => p <= 0.5);
const num = v => (typeof v === 'number' && !Number.isNaN(v)) ? v : String(v);
process.stdout.write(JSON.stringify({
  shared_loaded: loaded,
  qnorm: R.p.map(p => num(S.qnorm(p))),
  pnorm: R.x.map(x => num(S.pnorm(x))),
  qt: R.df.map(d => R.p.map(p => num(S.qt(p, d)))),
  pt: R.df.map(d => R.x.map(x => num(S.pt(x, d)))),
  qchisq: R.chidf.map(d => R.p.map(p => num(S.qchisq(p, d)))),
  pchisq: R.chidf.map((d, j) => R.qchisq[j].filter((_, i) => R.p[i] <= 0.5).map(q => num(S.pchisq(q, d)))),
  pchisq_n: lowP.length,
  crit_conf: R.conf.map(c => num(f('getCritVal')(c))),
  crit_t: R.cvdf.map(d => num(f('getCritVal')(0.95, d))),
  slnorm: R.lpar.map(v => R.lt.map(t => num(f('SF').survivalFunctions.lognormal(t, v[0], v[1])))),
  hlnorm: R.lpar.map(v => R.lt.map(t => num(f('SF').hazardFunctions.lognormal(t, v[0], v[1])))),
  erf: R.erf_x.map(x => num(f('erfApprox')(x))),
  worker_pnorm: R.x.map(x => num(WS.pnorm(x)))
}));
