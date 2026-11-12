// "Verify in R" user path, run through the page's own scripts (2026-11-12).
// A user who loaded limit-ma and pressed "Verify in R" got the alert "No studies
// on the shared bus yet" and no validator: the button was attached without a
// studies provider, so it only worked after a separate "Save to bus". When it
// did open, the validator re-fitted PM tau2 while the app's random-effects line
// is DerSimonian-Laird, so R and the app disagreed on that line.
// Executes: the main inline app script (DOM stubs as in page-probe.cjs),
// shared/ma-studies-v1.js, and the inline block that wires #btn-verify-in-r.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pagePath = process.argv[2];
const html = fs.readFileSync(pagePath, 'utf8');
const nodes = {};
function node() {
  return {value: '', innerHTML: '', textContent: '', attrs: {}, parentNode: {},
    addEventListener(event, fn) { const previous = this[event]; this[event] = (...args) => { if (previous) previous(...args); fn(...args); }; },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; }};
}
for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)/gi)) {
  nodes[m[2]] = node(); nodes[m[2]].textContent = m[3];
}
nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
// Optional: argv[3] is a file whose text replaces the default example (refusal cases).
if (process.argv[3]) nodes.src.value = fs.readFileSync(process.argv[3], 'utf8');
const logs = [node(), node()];
const store = {};
const alerts = [], opened = [];
const document = {readyState: 'complete', getElementById: id => nodes[id] || null,
  querySelector: sel => (/^#[\w-]+$/.test(sel) ? nodes[sel.slice(1)] || null : null),
  querySelectorAll: selector => {
    if (selector !== '#alm-axis-mount [data-edge="log"]') throw new Error('Unexpected selector in DOM stub: ' + selector);
    return logs;
  }};
const noop = () => {};
const alm = {analysisLifecycle: run => run, csvUpload: noop, plotExport: noop, axisControls: noop,
  resultsExport: noop, urlState: Object.assign(noop, {read: () => null}), resetUndo: noop, tooltips: noop};
const window = {alm, document,
  localStorage: {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
  location: {pathname: '/allmeta/limit-ma/'},
  alert: msg => alerts.push(String(msg)),
  open: (url) => { opened.push(url); return {}; }};
window.window = window;
const ctx = vm.createContext(Object.assign(window, {console}));
const inline = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].map(m => m[1]);
vm.runInContext(inline[0], ctx);
vm.runInContext(fs.readFileSync(path.join(path.dirname(pagePath), '..', 'shared', 'ma-studies-v1.js'), 'utf8'), ctx);
const wiring = inline.find(s => s.includes('#btn-verify-in-r'));
if (!wiring) throw new Error('no inline block wires #btn-verify-in-r');
vm.runInContext(wiring, ctx);
nodes['btn-run'].click();
const fitted = window._almLastLimit();
nodes['btn-verify-in-r'].click();
const bus = store['ma-studies-v1'] ? JSON.parse(store['ma-studies-v1']) : null;
console.log(JSON.stringify({alerts, opened, k: fitted && fitted.k, re_est: fitted && fitted.re_est,
  busStudies: bus && (bus.studies || []).map(s => ({label: s.label, est: s.est, se: s.se})),
  src: nodes.src.value}));
