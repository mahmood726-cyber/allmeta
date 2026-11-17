// node mapriors/tests/export_quick.test.js [page]
// Requirement: in "Quick normal approximation" mode, "Export R Code" downloads a script that runs in fresh R
// and recomputes the numbers the page DISPLAYS in that mode (REML pool of the same studies, MAP predictive SE,
// tau, I2, ESS of the pure and robust MAP), printing each next to the page's value and an honest MATCH n/n.
// Before this test the quick-mode script fitted RBesT gMAP (a different model from the one shown, so it could
// not agree) and then stopped with an error in decision2S(pc = postmix(...)) (live user path, 17 Nov 2026).
// Runs the script in real Rscript with metafor; fails closed if Rscript or metafor is missing.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), assert = require('assert');
const { spawnSync } = require('child_process');
const page = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const RSCRIPT = process.env.RSCRIPT || 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe';
if (!fs.existsSync(RSCRIPT)) { console.log('FAIL Rscript not found at ' + RSCRIPT + ' (set RSCRIPT)'); process.exit(1); }

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
  const el = id => { if (!els.has(id)) { const o = { value: values[id] ?? '', textContent: '', innerHTML: '', style: {}, disabled: false };
    els.set(id, new Proxy(o, { get(t, p) { return p in t ? t[p] : makeStub()[p]; }, set(t, p, v) { t[p] = v; return true; } })); } return els.get(id); };
  const alerts = [], blobs = [];
  const sandbox = { document: { getElementById: el, querySelector: () => makeStub(), querySelectorAll: () => [], createElement: () => makeStub(),
      createElementNS: () => makeStub(), addEventListener() {}, removeEventListener() {}, body: makeStub(), documentElement: makeStub(), head: makeStub(), scripts: [] },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    alert: m => alerts.push(m), console, Math, JSON, Date, parseInt, parseFloat, isFinite, isNaN, Array, Object, Number, String, Boolean,
    Infinity, NaN, undefined, Proxy, Symbol, Promise, Error, Map, Set, TextEncoder, crypto: require('crypto').webcrypto,
    Blob: function (parts) { blobs.push(parts.join('')); }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.navigator = { userAgent: 'node' }; sandbox.location = { href: '' };
  vm.createContext(sandbox);
  const html = fs.readFileSync(page, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    vm.runInContext(m[2].replace(/^(renderHeader|autoLoadDemo)\(\);[ \t]*\r?$/gm, '//$&'), sandbox);
  }
  return { sandbox, el, alerts, blobs, run: s => vm.runInContext(s, sandbox) };
}
function runR(code) {
  const f = path.join(os.tmpdir(), 'mapriors_quick_' + process.pid + '_' + Math.random().toString(36).slice(2) + '.R');
  fs.writeFileSync(f, code);
  const r = spawnSync(RSCRIPT, ['--vanilla', f], { encoding: 'utf8', timeout: 120000 }); fs.unlinkSync(f);
  return r;
}
const CROHNS = [[15, 80], [22, 120], [18, 95], [25, 150], [12, 70], [30, 175], [20, 110], [28, 160]].map(([events, n], i) => ({ trial: 'Study ' + i, events, n }));
const ZEROS = [[0, 40], [3, 55], [7, 60], [60, 60], [9, 70]].map(([events, n], i) => ({ trial: 'Z' + i, events, n }));
const PASTED = [[-0.12, 0.95, 120], [-0.05, 1.02, 98], [-0.20, 0.88, 150], [0.02, 1.10, 85], [-0.15, 0.97, 210], [-0.08, 1.05, 132]]
  .map(([mean, sd, n], i) => ({ trial: 'T' + (i + 1), mean, sd, n }));
const HETERO = [1, 3, 0, 4, 2].map((mean, i) => ({ trial: 'S' + i, mean, sd: 2, n: 50 }));
let passed = 0, total = 0;
function test(name, f) { total++; try { f(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); } }
function exportQuick(type, data, slider = '20', conf = '0.95') {
  const app = load({ endpointType: type, engineMode: 'quick', wSlider: slider, confLevel: conf, tauCommSlider: '50' });
  app.sandbox.__data = data; app.run('studies = __data; runMAP();');
  assert.ok(app.run('!!mapResult && !mapResult.engine'), 'quick mapResult not derived; alerts: ' + app.alerts.join(' | '));
  app.run('exportRCode()');
  assert.strictEqual(app.blobs.length, 1, 'expected one download, got ' + app.blobs.length);
  return { app, code: app.blobs[0], mr: app.run('mapResult') };
}
function checkRuns(s, label) {
  const r = runR(s.code);
  assert.strictEqual(r.status, 0, label + ': Rscript exit ' + r.status + '\n' + (r.stderr || '').slice(-1500));
  const m = /^MATCH (\d+)\/(\d+)\s*$/m.exec(r.stdout);
  assert.ok(m && m[1] === m[2] && +m[2] >= 6, label + ': no full MATCH line in R output:\n' + r.stdout.slice(-1500));
  assert.ok(!/MISMATCH/.test(r.stdout), label + ': MISMATCH printed');
  return r.stdout;
}
test('Q1 quick binary demo: exported script runs in fresh R and prints MATCH n/n', () => {
  const s = exportQuick('binary', CROHNS); checkRuns(s, 'binary demo');
});
test('Q2 quick script carries the CURRENT inputs (events, n, weight, level), not the example', () => {
  const s = exportQuick('binary', ZEROS, '35', '0.9');
  assert.ok(s.code.includes('c(0, 3, 7, 60, 9)') && s.code.includes('c(40, 55, 60, 60, 70)'), 'current counts not in script');
  assert.ok(/w <- 0\.65\b/.test(s.code), 'informative weight 0.65 (vague 35%) not in script');
  assert.ok(/conf <- 0\.9\b/.test(s.code), 'confidence level 0.9 not in script');
  checkRuns(s, 'zero and all-event studies, conf 0.90');
});
test('Q3 quick continuous, pasted realistic data: MATCH n/n', () => {
  const s = exportQuick('continuous', PASTED); checkRuns(s, 'pasted continuous');
});
test('Q4 quick continuous with tau2 > 0: MATCH n/n', () => {
  const s = exportQuick('continuous', HETERO); assert.ok(s.mr.tau2 > 0.5, 'precondition tau2 > 0'); checkRuns(s, 'heterogeneous continuous');
});
test('Q5 a wrong page value is reported as MISMATCH (the check can fail)', () => {
  const s = exportQuick('binary', CROHNS);
  const bad = s.code.replace(/(page <- c\([^)]*?ess_map = )([-0-9.eE+]+)/, (_m, a, v) => a + String(Number(v) + 1));
  assert.notStrictEqual(bad, s.code, 'could not plant a wrong page value');
  const r = runR(bad);
  assert.ok(/^MISMATCH/m.test(r.stdout) && !/^MATCH \d+\/\d+/m.test(r.stdout), 'planted wrong ESS not reported as MISMATCH:\n' + r.stdout.slice(-800));
});
console.log(`${passed}/${total} PASS`); process.exitCode = passed === total ? 0 : 1;
