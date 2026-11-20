// Runs TruthCert-PairwisePro-v1.0-bundle.html's own code in a Node vm sandbox the way the page does: every
// ../shared/*.js script it loads (page order), the engine <script>, then the later inline <script> that defines a
// second global pnorm (the page's pnorm is the LAST definition). Prints the page's normal / t / chi-square
// quantiles and CDFs and its incomplete beta on the grid of tests/quantile_r460.json as JSON.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.PAGE || path.join(root, 'TruthCert-PairwisePro-v1.0-bundle.html'), 'utf8');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'quantile_r460.json'), 'utf8'));
const noop = () => {};
const el = () => ({ textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, checked: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null });
const sandbox = {
  console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date, Error,
  TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, Promise, Symbol, Float64Array, Uint32Array,
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
  document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: el,
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
for (const m of html.matchAll(/<script src="\.\.\/shared\/([\w.-]+\.js)"><\/script>/g)) {
  const f = path.join(root, '..', 'shared', m[1]);
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = blocks.filter(s => s.includes('function calculatePooledEstimate('));
if (engine.length !== 1) throw new Error('engine script not found: ' + engine.length);
vm.runInContext(engine[0], ctx, { filename: 'engine' });
// later blocks that (re)define a global pnorm: take the function declaration itself (the rest of the block needs a DOM)
for (const b of blocks.slice(blocks.indexOf(engine[0]) + 1)) {
  const i = b.search(/\nfunction pnorm\(/);
  if (i < 0) continue;
  let d = 0, j = b.indexOf('{', i);
  for (let k = j; k < b.length; k++) { if (b[k] === '{') d++; else if (b[k] === '}' && --d === 0) { j = k; break; } }
  vm.runInContext(b.slice(i, j + 1), ctx, { filename: 'later-block' });
}
const f = n => vm.runInContext(n, ctx);
process.stdout.write(JSON.stringify({
  qnorm: R.p.map(p => f('qnorm')(p)),
  pnorm: R.x.map(x => f('pnorm')(x)),
  qt: R.df.map(d => R.p.map(p => f('qt')(p, d))),
  pt: R.df.map(d => R.x.map(x => f('pt')(x, d))),
  qchisq: R.chidf.map(d => R.p.map(p => f('qchisq')(p, d))),
  pbeta: R.beta_ab.map(v => R.beta_x.map(x => f('betainc')(v[0], v[1], x)))
}));
