// Regression for review finding 1: execute the real page and plus panel in linkedom.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { parseHTML } = require('linkedom');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function setup() {
  const { window, document } = parseHTML(read("correlation-ma/index.html"));
  window.__almChartExportAuto = false; window.alm = {};
  document.readyState = "complete";
  Object.defineProperty(document.querySelector("#f-method"), "value", { value: "REML", writable: true });
  for (const id of ["f-data", "f-method"]) { document.getElementById(id).disabled = false; document.getElementById(id).readOnly = false; }
  window.Element.prototype.getBoundingClientRect = () => ({ width: 560, height: 200 });
  window.matchMedia = () => ({ matches: false });
  const timers = [];
  const observers = [];
  class TrackedObserver extends window.MutationObserver {
    constructor(callback) { super(callback); observers.push(this); }
  }
  const ctx = vm.createContext({ window, document, matchMedia: window.matchMedia, console, URL, Blob, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, crypto: webcrypto,
    location: { protocol: "http:", origin: "http://localhost", pathname: "/correlation-ma/index.html" },
    setTimeout: (f, n) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance, structuredClone,
    MutationObserver: TrackedObserver, Event: window.Event });
  window.setTimeout = ctx.setTimeout; window.clearTimeout = ctx.clearTimeout;
  const run = (p) => vm.runInContext(read(p), ctx, { filename: p });
  run("shared/ma-core.js"); run("hub/shared/results-export.js");
  vm.runInContext([...document.querySelectorAll("script")].find((s) => s.textContent.includes("var EXAMPLE")).textContent, ctx);
  run("correlation-ma/plus-core.js"); run("correlation-ma/plus-ui.js");
  const flush = () => { let g = 0; while (timers.length && g++ < 1000) timers.shift()(); };
  flush();
  const setText = (t, method) => {
    if (method) { document.getElementById("f-method").value = method; document.getElementById("f-method").dispatchEvent(new window.Event("change")); }
    const ta = document.getElementById("f-data"); ta.value = t; ta.dispatchEvent(new window.Event("input")); flush();
  };
  return { window, document, ctx, flush, setText, dispose: () => observers.forEach(o => o.disconnect()) };
}

for (const input of ['', 'A,.2,30']) test(input ? 'singleton refuses and clears prose' : 'Clear removes previous numerical prose', t => {
  const e = setup(), d = e.document, w = e.window;
  t.after(e.dispose);
  const example = d.getElementById('f-data').value;
  assert.equal(w._almCorrPlus().k, 8);
  assert.ok(d.getElementById('alm-plus-results'));
  if (input) e.setText(input);
  else { d.querySelector('[data-tool="clear"]').dispatchEvent(new w.Event('click', { bubbles: true })); e.flush(); }
  assert.equal(w._almCorrPlus(), null);
  assert.match(d.getElementById('alm-plus-sens').textContent, /Enter at least 2 studies/);
  assert.equal(d.getElementById('alm-plus-prose').textContent, '');
  const bench = d.querySelector('[name="alm-plus-bench"][value="gignac"]');
  bench.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(d.getElementById('alm-plus-prose').textContent, '');
  e.setText(example);
  assert.equal(w._almCorrPlus().k, 8);
  assert.ok(d.getElementById('alm-plus-results'));
});
