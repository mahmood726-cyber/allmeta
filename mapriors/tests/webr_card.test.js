// node mapriors/tests/webr_card.test.js [page]
// Requirement: after Derive, the "R Cross-Validation (WebR)" card (#webrCard, display:none in the markup) is
// visible in BOTH modes. runWebRValidation() handles the default RBesT-model mode (it re-fits the page's own
// REML/DL pool and says the posterior is not re-fitted), so hiding the card there hides a working check.
// Node only, no R: the page's inline scripts run in a vm with a minimal DOM whose elements keep real style objects.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const page = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));

function makeStub() {
  const fn = function () { return makeStub(); };
  return new Proxy(fn, { get(_t, p) {
    if (p === 'value') return ''; if (p === 'textContent' || p === 'innerHTML') return ''; if (p === 'checked') return false;
    if (p === 'length') return 0; if (p === 'style') return new Proxy({}, { get: () => '', set: () => true });
    if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (p === 'dataset') return {}; if (p === Symbol.toPrimitive) return () => ''; if (p === 'then') return undefined;
    return makeStub(); }, set() { return true; }, apply() { return makeStub(); } });
}
function load(values) {
  const els = new Map();
  const el = id => { if (!els.has(id)) {
    // Markup default for the cards that start hidden.
    const o = { value: values[id] ?? '', textContent: '', innerHTML: '', style: { display: /Card$/.test(id) ? 'none' : '' }, disabled: false };
    els.set(id, new Proxy(o, { get(t, p) { return p in t ? t[p] : makeStub()[p]; }, set(t, p, v) { t[p] = v; return true; } })); } return els.get(id); };
  const alerts = [];
  const sandbox = { document: { getElementById: el, querySelector: () => makeStub(), querySelectorAll: () => [], createElement: () => makeStub(),
      createElementNS: () => makeStub(), addEventListener() {}, removeEventListener() {}, body: makeStub(), documentElement: makeStub(), head: makeStub(), scripts: [] },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    alert: m => alerts.push(m), console, Math, JSON, Date, parseInt, parseFloat, isFinite, isNaN, Array, Object, Number, String, Boolean,
    Infinity, NaN, undefined, Proxy, Symbol, Promise, Error, Map, Set, URL, TextEncoder, crypto: require('crypto').webcrypto, Blob: function () {} };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.navigator = { userAgent: 'node' }; sandbox.location = { href: '' };
  vm.createContext(sandbox);
  const html = fs.readFileSync(page, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    vm.runInContext(m[2].replace(/^(renderHeader|autoLoadDemo)\(\);[ \t]*\r?$/gm, '//$&'), sandbox);
  }
  return { el, alerts, run: s => vm.runInContext(s, sandbox) };
}
const CROHNS = [[15, 80], [22, 120], [18, 95], [25, 150], [12, 70], [30, 175], [20, 110], [28, 160]].map(([events, n], i) => ({ trial: 'S' + i, events, n }));
const HETERO = [1, 3, 0, 4, 2].map((mean, i) => ({ trial: 'S' + i, mean, sd: 2, n: 50 }));
let passed = 0, total = 0;
function test(name, f) { total++; try { f(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); } }
function derive(type, mode, data) {
  const app = load({ endpointType: type, engineMode: mode, wSlider: '20', confLevel: '0.95' });
  app.run('globalThis.__data = ' + JSON.stringify(data) + '; studies = __data; runMAP();');
  assert.ok(app.run('!!mapResult'), 'mapResult not derived; alerts: ' + app.alerts.join(' | '));
  assert.strictEqual(app.run('!!mapResult.engine'), mode !== 'quick', 'precondition: mode ' + mode + ' took the expected path');
  return app;
}
test('C0 control: the card starts hidden (markup display:none) before any Derive', () => {
  const app = load({ endpointType: 'binary', engineMode: 'model' });
  assert.strictEqual(app.el('webrCard').style.display, 'none');
});
test('C1 RBesT-model mode (default), binary: #webrCard visible after Derive', () => {
  assert.notStrictEqual(derive('binary', 'model', CROHNS).el('webrCard').style.display, 'none');
});
test('C2 RBesT-model mode, continuous: #webrCard visible after Derive', () => {
  assert.notStrictEqual(derive('continuous', 'model', HETERO).el('webrCard').style.display, 'none');
});
test('C3 RBesT-model mode, k = 1: #webrCard visible (the button then says R is not applicable)', () => {
  assert.notStrictEqual(derive('binary', 'model', CROHNS.slice(0, 1)).el('webrCard').style.display, 'none');
});
test('C4 quick mode, binary: #webrCard visible after Derive (unchanged behaviour)', () => {
  assert.notStrictEqual(derive('binary', 'quick', CROHNS).el('webrCard').style.display, 'none');
});
console.log(`${passed}/${total} PASS`); process.exitCode = passed === total ? 0 : 1;
