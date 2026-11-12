// Loads app.js the way index.html does (shared/upper-tail.js first, then app.js) in a Node vm
// sandbox and prints the values checked by tests/test_upper_tail.py as JSON.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
const el = () => ({ textContent: '', value: '', style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop });
const sandbox = {
  console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date, Error,
  TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Uint32Array, Float64Array, Map, Set, Promise, Symbol,
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
  document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: { appendChild: noop },
    addEventListener: noop, readyState: 'complete' },
  navigator: { userAgent: 'Node.js' }, location: { hash: '' }, history: { pushState: noop },
  fetch: () => Promise.resolve({ ok: false }), WebAssembly: { instantiate: () => Promise.reject('no wasm') },
  Worker: function () { this.postMessage = noop; this.terminate = noop; }, Blob: function () {}, URL: { createObjectURL: () => '' },
  Intl: globalThis.Intl, requestAnimationFrame: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }),
  addEventListener: noop, localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
const tail = path.join(root, '..', 'shared', 'upper-tail.js');
vm.runInContext(fs.readFileSync(tail, 'utf8'), ctx, { filename: tail });
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx, { filename: 'app.js' });
const W = sandbox;
const out = {};
// Design-by-treatment interaction: two designs whose pooled estimates differ by 1.1 (Q = 484 on 1 df).
const studies = [
  { treatments: ['A', 'B'], effect: 0, se: 0.05 }, { treatments: ['A', 'B'], effect: 0, se: 0.05 },
  { treatments: ['A', 'C'], effect: 1.1, se: 0.05 }, { treatments: ['A', 'C'], effect: 1.1, se: 0.05 }];
const dbt = new W.DesignByTreatmentInteraction(studies, ['A', 'B', 'C']).test();
out.dbt = { Q: dbt.Q_inconsistency, df: dbt.df, p: dbt.pValue };
// chiSquareCDF / normalCDF of the shared StatUtils (lower tails, used elsewhere in the app)
out.stat = { chisq_10_5: W.StatUtils.chiSquareCDF(10, 5), norm_196: W.StatUtils.normalCDF(1.959963984540054) };
// Incoherence assessment on a tree network A-B-C (no closed loop): Q = 0 on 0 df. The class is exported to window
// by the app's async IIFE after its first await, so wait for it (bounded) before using it.
(async () => {
for (let i = 0; i < 200 && typeof W.NetworkIncoherenceAssessment !== 'function'; i++) await new Promise(r => setImmediate(r));
const inc = new W.NetworkIncoherenceAssessment().assess([[0, 1, 0], [1, 0, 1], [0, 1, 0]],
  [[0, 0.2, 0], [-0.2, 0, 0.1], [0, -0.1, 0]], [[0, 0.04, 0], [0.04, 0, 0.05], [0, 0.05, 0]]);
out.incoherence_tree = { loop: inc.loopIncoherence, overall: inc.overallIncoherence };
process.stdout.write(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
