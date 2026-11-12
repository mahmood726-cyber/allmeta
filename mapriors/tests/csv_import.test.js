// node mapriors/tests/csv_import.test.js [page]
// Requirements for the CSV import (parseCSVAndLoad):
//  R1 a header is matched to a column role only by an exact name or a whole word of the header (words are split at
//     any character that is not a letter or digit), never by a substring: "trial" must not be read as the binary
//     events column "r" (defect: b38a65fc findCol partial match, which made trial,mean,sd,n load 0 studies unless
//     "Continuous" had been selected first);
//  R2 the endpoint type follows the headers: events + n -> binary, mean + sd + n -> continuous, whatever was selected;
//  R3 every data row that is not loaded is named in a visible notice (#csvImportNotice) with its line and reason,
//     instead of being dropped silently.
// Node only: the page's inline scripts run in a vm with a minimal DOM; addRow/clearAll are recorded, not rendered.
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
    const o = { value: values[id] ?? '', textContent: '', innerHTML: '', style: { display: id === 'csvImportNotice' ? 'none' : '' }, disabled: false,
      dispatchEvent() { return true; } };
    els.set(id, new Proxy(o, { get(t, p) { return p in t ? t[p] : makeStub()[p]; }, set(t, p, v) { t[p] = v; return true; } })); } return els.get(id); };
  const alerts = [];
  const sandbox = { document: { getElementById: el, querySelector: () => makeStub(), querySelectorAll: () => [], createElement: () => makeStub(),
      createElementNS: () => makeStub(), addEventListener() {}, removeEventListener() {}, body: makeStub(), documentElement: makeStub(), head: makeStub(), scripts: [] },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    alert: m => alerts.push(m), console, Math, JSON, Date, parseInt, parseFloat, isFinite, isNaN, Array, Object, Number, String, Boolean,
    Infinity, NaN, undefined, Proxy, Symbol, Promise, Error, Map, Set, URL, TextEncoder, crypto: require('crypto').webcrypto, Blob: function () {},
    Event: function (type) { this.type = type; } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.navigator = { userAgent: 'node' }; sandbox.location = { href: '' };
  vm.createContext(sandbox);
  const html = fs.readFileSync(page, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    vm.runInContext(m[2].replace(/^(renderHeader|autoLoadDemo)\(\);[ \t]*\r?$/gm, '//$&'), sandbox);
  }
  vm.runInContext('globalThis.__rows = []; addRow = function (d) { __rows.push(d); }; clearAll = function () { __rows.length = 0; };', sandbox);
  return { el, alerts, run: s => vm.runInContext(s, sandbox) };
}
function importCSV(text, selected) {
  const app = load({ endpointType: selected });
  app.run('parseCSVAndLoad(' + JSON.stringify(text) + ', "t.csv")');
  return { app, rows: JSON.parse(app.run('JSON.stringify(__rows)')), type: app.el('endpointType').value,
    notice: app.el('csvImportNotice'), status: app.el('liveStatus').textContent };
}
let passed = 0, total = 0;
function test(name, f) { total++; try { f(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); } }

const CONT = 'trial,mean,sd,n\nA,1.5,2,50\nB,0.8,1.9,40\nC,1.1,2.2,60\n';
test('I1 trial,mean,sd,n with Binary selected (the default) loads 3 continuous studies', () => {
  const r = importCSV(CONT, 'binary');
  assert.strictEqual(r.type, 'continuous', 'endpoint type');
  assert.deepStrictEqual(r.rows, [{ trial: 'A', mean: 1.5, sd: 2, n: 50 }, { trial: 'B', mean: 0.8, sd: 1.9, n: 40 }, { trial: 'C', mean: 1.1, sd: 2.2, n: 60 }]);
});
test('I2 control: trial,mean,sd,n with Continuous selected loads the same 3 studies', () => {
  const r = importCSV(CONT, 'continuous');
  assert.strictEqual(r.type, 'continuous'); assert.strictEqual(r.rows.length, 3);
});
test('I3 trial,events,n with Continuous selected switches to binary and loads 2 studies', () => {
  const r = importCSV('trial,events,n\nA,12,40\nB,9,35\n', 'continuous');
  assert.strictEqual(r.type, 'binary');
  assert.deepStrictEqual(r.rows, [{ trial: 'A', events: 12, n: 40 }, { trial: 'B', events: 9, n: 35 }]);
});
test('I4 whole-word headers are matched ("Study ID", "Events (control)", "N total")', () => {
  const r = importCSV('Study ID,Events (control),N total\nA,12,40\nB,9,35\n', 'continuous');
  assert.strictEqual(r.type, 'binary');
  assert.deepStrictEqual(r.rows, [{ trial: 'A', events: 12, n: 40 }, { trial: 'B', events: 9, n: 35 }]);
});
test('I5 substrings are not matched: "trial" is not "r", "mean" is not "n"', () => {
  // trial, mean, variance: no events, n or sd column, so nothing may be detected (old code: events = "trial", n = "mean").
  const r = importCSV('trial,mean,variance\nA,1,2\n', 'binary');
  assert.strictEqual(r.rows.length, 0);
  assert.strictEqual(r.app.alerts.length, 1, 'the "could not auto-detect" alert');
});
test('I6 rows not loaded are named in a visible notice with their line and reason', () => {
  const r = importCSV('trial,events,n\nA,12,40\nBad1,abc,30\nB,9,35\nBad2,5,0\n', 'binary');
  assert.strictEqual(r.rows.length, 2);
  assert.notStrictEqual(r.notice.style.display, 'none', 'notice visible');
  const t = r.notice.textContent;
  assert.ok(/2 of 4/.test(t) || /excluded 2/i.test(t) || /2 rows? (were )?not loaded/i.test(t), 'count of excluded rows in: ' + t);
  assert.ok(t.includes('line 3') && t.includes('Bad1'), 'names line 3 / Bad1: ' + t);
  assert.ok(t.includes('line 5') && t.includes('Bad2'), 'names line 5 / Bad2: ' + t);
  assert.ok(!t.includes('line 2') && !t.includes('line 4'), 'loaded rows not named: ' + t);
});
test('I7 control: an all-valid import shows no excluded-row text', () => {
  const r = importCSV(CONT, 'binary');
  assert.ok(!/line \d/.test(r.notice.textContent), 'no row named: ' + r.notice.textContent);
});
console.log(passed + '/' + total + ' passed');
process.exitCode = passed === total ? 0 : 1;
