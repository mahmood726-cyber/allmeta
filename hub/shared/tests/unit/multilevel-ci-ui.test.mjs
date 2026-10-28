// Browser-free checks for the usability requirements behind the logged CI failures.
// Execute shipped page code and the example callback; the extras panel is out of scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.find(source => source.includes('function fit(rows)'));
const sample = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
const example = read('multilevel-ma/plus-ui.js').match(/example\.onclick=([^\r\n]+);\r?\n/)[1];

function app(source = main) {
  const nodes = new Map(), captures = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'src' ? sample : '', defaultValue: sample, innerHTML: '',
      setAttribute() {}, dispatchEvent() {},
      addEventListener(type, handler) { this[type] = handler; },
    });
    return nodes.get(id);
  };
  const alm = {
    analysisLifecycle: f => f, csvUpload() {}, axisControls() {}, tooltips() {}, resetUndo() {},
    plotExport: x => captures.plot = x, resultsExport: x => captures.export = x,
    urlState: Object.assign(() => {}, { read: () => null, write() {} }),
  };
  const ctx = vm.createContext({ alm, document: { getElementById: node, readyState: 'complete' },
    GradePush: { attach: x => captures.grade = x }, MaPooled: {},
    Event: class {}, run: { onclick() {} } });
  ctx.window = ctx;
  for (const path of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/multilevel-reml.js']) {
    vm.runInContext(read(path), ctx);
  }
  vm.runInContext(source, ctx);
  vm.runInContext(scripts.find(s => s.includes('GradePush.attach')), ctx);
  return { ctx, node, captures, result: () => ctx._almLastMlma() };
}

function checkExample(handler) {
  const a = app(), expected = a.result();
  a.node('src').value = '1,0.5,0.1\n2,0.4,0.1\n3,0.3,0.1';
  a.node('btn-run').click();
  assert.notEqual(a.result().mu, expected.mu, 'alternate input changes the fit');
  vm.runInContext('(' + handler + ')()', a.ctx);
  assert.equal(a.node('src').value, sample, 'example input restored');
  assert.equal(a.result().mu, expected.mu, 'example fit recomputed');
  assert.equal(a.result().method, 'REML');
  assert.equal(a.captures.export.getResults(), a.result());
  assert.equal(a.captures.grade.getPooled().mu, expected.mu);
}

function checkEmpty(source) {
  const a = app(source);
  assert.ok(a.node('forest').innerHTML.includes('<polygon'), 'valid control starts with a plot');
  a.node('src').value = '';
  a.node('btn-run').click();
  // Same desired message as multilevel-ma-usability.spec.mjs (without test.fail).
  assert.match(a.node('summary').innerHTML, /no studies|nothing entered|empty|enter (one|at least)/i);
  assert.equal(a.result(), null);
  assert.equal(a.ctx.__almReml(), null);
  assert.equal(a.captures.export.getResults(), null);
  assert.equal(a.captures.plot.getReceiptInput(), null);
  assert.equal(a.captures.grade.getPooled(), null);
  assert.equal(a.node('body').innerHTML, '');
  assert.equal(a.node('forest').innerHTML, '');
}

test('multilevel CI control: one example click restores input and recomputes current outputs', () => {
  checkExample(example);
});
test('multilevel CI plant: example callback that does not restore input is rejected', () => {
  const broken = example.replace('src.value=src.defaultValue;', '');
  assert.notEqual(broken, example);
  assert.throws(() => checkExample(broken), /example input restored/);
});
test('multilevel CI plant: example callback that leaves an old fit is rejected', () => {
  const broken = example.replace("document.getElementById('btn-run')?.click();", '');
  assert.notEqual(broken, example);
  assert.throws(() => checkExample(broken), /example fit recomputed/);
});
test('multilevel CI control: empty input explains refusal and clears results', () => {
  checkEmpty(main);
});
test('multilevel CI plant: silent empty-input return with stale display is rejected', () => {
  const broken = main.replace(/if \(rows.length < 3\) \{[\s\S]*?\n      \}/,
    'if (rows.length < 3) { _lastResults = null; _lastReml = null; return; }');
  assert.notEqual(broken, main);
  assert.throws(() => checkEmpty(broken), assert.AssertionError);
});
