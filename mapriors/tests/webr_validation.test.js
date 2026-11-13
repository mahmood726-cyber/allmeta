// node mapriors/tests/webr_validation.test.js [page]
// "Validate with R" must compare like with like. The page's default model is the RBesT-model posterior
// (beta/tau posterior moments, fitted mixtures); WebR has no RBesT (not in repo.r-wasm.org 4.3-4.6), so
// the in-browser check can only re-fit a frequentist pool. Requirement: every JS number shown beside an
// R metafor number is the page's own frequentist computation of the SAME model on the SAME data, and the
// screen says plainly that the posterior is not what R re-fits.
// The WebR object is replaced by a shim that runs the page's R code in desktop R (metafor), so the
// comparison is against real metafor, not a stub. Needs Rscript (env RSCRIPT) with metafor; fails closed.
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
  const rcode = [];
  // Shim with the webR 0.4.4 API surface the page uses (checked against https://webr.r-wasm.org/v0.4.4/webr.mjs):
  // a shelter is created with `await new webR.Shelter()` (there is no webR.shelter() method), and captureR's
  // `output` is a list of {type: 'stdout'|'stderr', data} lines, so R messages (package start-up) arrive too.
  sandbox.__fakeWebR = { async init() {}, async installPackages() {}, Shelter: function () { return {
    async captureR(code) { rcode.push(code); if (!/library\(metafor\)/.test(code)) return { output: [] };
      const f = path.join(os.tmpdir(), 'mapriors_webr_' + process.pid + '_' + rcode.length + '.R'); fs.writeFileSync(f, code);
      const r = spawnSync(RSCRIPT, ['--vanilla', f], { encoding: 'utf8', timeout: 120000 }); fs.unlinkSync(f);
      if (r.status !== 0) throw Error('R failed: ' + r.stderr);
      const lines = (t, type) => t.split(/\r?\n/).filter(x => x !== '').map(data => ({ type, data }));
      return { output: [...lines(r.stderr, 'stderr'), ...lines(r.stdout, 'stdout')] }; },
    async purge() {} }; } };
  vm.runInContext('webrInstance = __fakeWebR;', sandbox);
  return { sandbox, el, alerts, rcode, run: s => vm.runInContext(s, sandbox) };
}
// Parse the rendered comparison table: label -> {js, r, match}
function table(html) { const out = {};
  for (const m of html.matchAll(/<tr>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>([^<]*)<\/td>/g))
    out[m[1]] = { js: Number(m[2]), r: Number(m[3]), match: m[4].trim() === 'YES' }; return out; }
const CROHNS = [[15, 80], [22, 120], [18, 95], [25, 150], [12, 70], [30, 175], [20, 110], [28, 160]].map(([events, n], i) => ({ trial: 'S' + i, events, n }));
const HETERO = [1, 3, 0, 4, 2].map((mean, i) => ({ trial: 'S' + i, mean, sd: 2, n: 50 }));
let passed = 0, total = 0;
async function test(name, f) { total++; try { await f(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); } }
const memo = new Map();
function scenario(type, mode, data, conf = '0.95') { const key = JSON.stringify([type, mode, data, conf]); if (!memo.has(key)) memo.set(key, scenario1(type, mode, data, conf)); return memo.get(key); }
async function scenario1(type, mode, data, conf) {
  const app = load({ endpointType: type, engineMode: mode, wSlider: '20', confLevel: conf });
  app.sandbox.__data = data; app.run('studies = __data; runMAP();');
  assert.ok(app.run('!!mapResult'), 'mapResult not derived; alerts: ' + app.alerts.join(' | '));
  await app.run('runWebRValidation()');
  const html = app.el('webrResults').innerHTML;
  // The page's own frequentist pool of the same studies (the function the archive's A1 check exercises).
  const ref = app.run((type === 'binary' ? 'deriveMAPBinary' : 'deriveMAPContinuous') + '(mapResult.w, mapResult.confLevel)');
  return { app, html, rows: table(html), ref, mr: app.run('mapResult'), badge: app.el('webrBadge').textContent };
}
function likeForLike(s) {
  const muRow = Object.entries(s.rows).find(([k]) => /REML/.test(k) && /mu/.test(k) && !/SE/.test(k));
  assert.ok(muRow, 'no REML mu row in ' + JSON.stringify(Object.keys(s.rows)));
  assert.ok(Math.abs(muRow[1].js - s.ref.mu) < 5e-7, `JS "REML mu" shown ${muRow[1].js} is not the page's REML mu ${s.ref.mu}`);
  for (const [k, v] of Object.entries(s.rows)) assert.ok(v.match, `${k}: JS ${v.js} vs R ${v.r} reported NO`);
  assert.ok(/PASS:/.test(s.html) && s.badge === 'ALL MATCH', 'summary/badge not PASS: ' + s.badge);
}
(async () => {
  await test('W1 model mode (default), binary demo: compares the page\'s REML pool with metafor REML, all match', async () => {
    const s = await scenario('binary', 'model', CROHNS); likeForLike(s);
    // Precondition: the posterior mean is not the REML mu at the button's own tolerance (1e-4), so the old pairing could not pass.
    assert.ok(Math.abs(s.mr.mu - s.ref.mu) > 1e-4, 'precondition: posterior mean differs from REML mu on the demo');
  });
  await test('W2 model mode says on screen the RBesT-model posterior is not re-fitted by R', async () => {
    const s = await scenario('binary', 'model', CROHNS);
    assert.ok(/not re-fitted/i.test(s.html) && /RBesT/.test(s.html), 'no "posterior not re-fitted" banner');
    assert.ok(!/MAP uses REML internally/.test(fs.readFileSync(page, 'utf8')), 'stale claim "MAP uses REML internally" still in page');
  });
  await test('W3 model mode, heterogeneous continuous data (tau2 > 0): all match incl. I2 and 95% prediction interval', async () => {
    const s = await scenario('continuous', 'model', HETERO); likeForLike(s);
    assert.ok(s.ref.tau2 > 0.5, 'precondition tau2 > 0');
  });
  await test('W4 quick mode, conf 0.90: prediction interval compared at the same level', async () => {
    const s = await scenario('continuous', 'quick', HETERO, '0.9'); likeForLike(s);
    assert.ok(Object.keys(s.rows).some(k => /pred/i.test(k)), 'no prediction rows');
  });
  await test('W5 model mode with k = 1: no R re-fit is claimed, plain message instead', async () => {
    const s = await scenario('binary', 'model', CROHNS.slice(0, 1));
    assert.strictEqual(s.app.rcode.filter(c => /library\(metafor\)/.test(c)).length, 0, 'R REML run with k = 1');
    assert.ok(/at least two studies/i.test(s.html), 'no k=1 message: ' + s.html.slice(0, 200));
  });
  console.log(`${passed}/${total} PASS`); process.exitCode = passed === total ? 0 : 1;
})();
