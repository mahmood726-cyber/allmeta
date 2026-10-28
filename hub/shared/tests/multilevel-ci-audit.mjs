// Diagnostic reproduction of the logged CI assertions, without Playwright.
// Deliberately exits nonzero while those assertions conflict with PR #258.
// This does not replace, disable, or change any existing test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadPageFunctions } from './features-helpers.mjs';

const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sample = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
function page(input = sample) {
  const nodes = new Map(), captures = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'src' ? input : '', defaultValue: sample, innerHTML: '',
      setAttribute() {}, dispatchEvent() {},
      addEventListener(type, handler) { this[type] = handler; },
    });
    return nodes.get(id);
  };
  const alm = { analysisLifecycle: f => f, csvUpload() {}, axisControls() {}, tooltips() {}, resetUndo() {},
    plotExport: x => captures.plot = x, resultsExport: x => captures.export = x,
    urlState: Object.assign(() => {}, { read: () => null, write() {} }) };
  const ctx = vm.createContext({ alm, document: { getElementById: node, readyState: 'complete' },
    GradePush: { attach: x => captures.grade = x }, MaPooled: {} });
  ctx.window = ctx;
  for (const path of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/multilevel-reml.js']) vm.runInContext(read(path), ctx);
  vm.runInContext(scripts.find(s => s.includes('function fit(rows)')), ctx);
  vm.runInContext(scripts.find(s => s.includes('GradePush.attach')), ctx);
  return { ctx, node, captures, result: () => ctx._almLastMlma() };
}
const engine = loadPageFunctions(fileURLToPath(new URL('multilevel-ma/index.html', root)), ['fit'], {},
  ['shared/stats-qt.js', 'shared/ma-core.js'].map(path => fileURLToPath(new URL(path, root))));
const a = page(), mom = engine.fit(a.ctx.__almMlmaParse(sample));
const reference = JSON.parse(read('hub/shared/tests/fixtures/multilevel-ci/reference.json'));
let mismatches = 0;
function check(name, action) {
  try { action(); console.log('PASS assertion: ' + name); }
  catch (error) { mismatches++; console.log('FAIL assertion: ' + name + ' — ' + error.message.split('\n')[0]); }
}
console.log('Current primary:', JSON.stringify(a.result()));
console.log('Current supplementary MoM:', JSON.stringify({ mu: mom.mu, seMu: mom.seMu, piLo: mom.piLo, piHi: mom.piHi }));

check('features:41 CSV MoM display reader finds HKSJ row', () => {
  assert.match(a.node('summary').innerHTML, /95% CI \(HKSJ/, 'displayedNumbers requires the retired HKSJ label');
});
check('features:97 diamond is distinct from REML', () => {
  assert.ok(Math.abs(a.result().mu - a.ctx.__almReml().mu) > 1e-4, 'primary/diamond mu equals REML');
});
check('features:132 receipt names method-of-moments', () => {
  assert.match(a.captures.plot.getReceiptInput().method, /method-of-moments/i, 'receipt accurately names REML');
});
const old = JSON.parse(read('hub/shared/tests/fixtures/features/multilevel-ma/mom-reference.json'));
const keys = ['mu', 'seMu', 'seMuHK', 'tau2_study', 'tau2_within', 'ci_lb_hk', 'ci_ub_hk', 'pi_lb', 'pi_ub'];
const rowsOf = cfg => {
  const ids = new Map();
  return cfg.rows.map(([c, y, v]) => {
    if (!ids.has(c)) ids.set(c, 'C' + (ids.size + 1));
    return { study: ids.get(c), te: y, se: Math.sqrt(v), label: '' };
  });
};
const values = f => ({ ...f, ci_lb_hk: f.mu - f.tCrit * f.seMuHK,
  ci_ub_hk: f.mu + f.tCrit * f.seMuHK, pi_lb: f.piLo, pi_ub: f.piHi });
check('features:187 old MoM R reference agrees on 44/44 configurations', () => {
  const failures = [];
  for (const cfg of old.configs) {
    const actual = values(engine.fit(rowsOf(cfg)));
    for (const key of keys) if (!(Math.abs(actual[key] - cfg.ref[key]) / Math.max(1, Math.abs(cfg.ref[key])) < 1e-6)) failures.push(cfg.id + ' ' + key);
  }
  assert.equal(failures.length, 0, `${failures.length}/${old.configs.length * keys.length} comparisons differ; first: ${failures[0]}`);
});
check('features:199 primary result equals MoM engine on three corpus configurations', () => {
  let failures = 0;
  for (const cfg of old.configs.filter(c => c.rows.length <= 60).slice(0, 3)) {
    const rows = rowsOf(cfg), actual = page(rows.map(r => `${r.study},${r.te},${r.se}`).join('\n')).result();
    const expected = values(engine.fit(rows));
    for (const key of keys) if (!(Math.abs(actual[key] - expected[key]) < 1e-12 * Math.max(1, Math.abs(expected[key])))) failures++;
  }
  assert.equal(failures, 0, `${failures}/27 primary-versus-MoM comparisons differ`);
});
check('pi:10 primary result contains the MoM prediction interval', () => assert.notEqual(a.result().pi_lb, null, 'REML does not inherit the MoM interval'));
check('sanity:148 primary tiny result matches the diagonal MoM replica', () => {
  const tiny = reference.configs.find(c => c.id === 'tiny');
  const actual = page(tiny.rows.map(r => `${r.study},${r.te},${r.se}`).join('\n')).result();
  assert.ok(Math.abs(actual.mu - tiny.legacy.mu) < 1e-6, `REML mu ${actual.mu}; historical MoM mu ${tiny.legacy.mu}`);
});
check('usability:64 example restores historical 0.313', () => {
  // Execute the shipped click callback; extras computation is outside this assertion.
  a.node('src').value = '1,0.5,0.1\n2,0.4,0.1\n3,0.3,0.1';
  a.node('btn-run').click();
  const handler = read('multilevel-ma/plus-ui.js').match(/example\.onclick=([\s\S]*?);\r?\n/)[1];
  a.ctx.run = { onclick() {} }; a.ctx.Event = class {};
  vm.runInContext('(' + handler + ')()', a.ctx);
  assert.equal(a.node('src').value, sample, 'the example input is restored');
  assert.ok(a.node('summary').innerHTML.includes('0.313'), 'restored example has corrected estimates, not 0.313');
});
check('usability:93 empty input satisfies its desired error-message assertion', () => {
  a.node('src').value = ''; a.node('btn-run').click();
  assert.match(a.node('summary').innerHTML, /no studies|nothing entered|empty|enter (one|at least)/i);
  assert.equal(a.result(), null);
  console.log('The desired assertion PASSES; test.fail(true, known issue) makes this an unexpected pass in CI.');
});
const b = page();
check('grade-pooled-bus:368 legacy expected k equals effect rows', () => {
  assert.equal(b.captures.grade.getPooled().k, b.result().k, 'GRADE carries 6 studies; the old test expects 13 effect rows');
});
console.log(`${mismatches} legacy assertion mismatches. Diagnostic only; browser execution and the truncated test-check failure remain unverified.`);
process.exitCode = mismatches ? 1 : 0;
