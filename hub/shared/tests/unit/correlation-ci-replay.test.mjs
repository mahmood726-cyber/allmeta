import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../../../../' + p, import.meta.url), 'utf8');
const corpus = JSON.parse(read('correlation-ma/validate/corpus/corpus.json'));
const reference = JSON.parse(read('correlation-ma/validate/corpus/reference.json'));

function page() {
  const nodes = new Map();
  const el = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'f-method' ? 'REML' : '', innerHTML: '', textContent: '',
      disabled: true, childNodes: [], addEventListener() {},
      setAttribute(n, v) { this[n] = v; }, hasAttribute() { return false; },
      closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    });
    return nodes.get(id);
  };
  const document = {
    readyState: 'loading', body: { children: [] }, getElementById: el,
    addEventListener() {}, querySelectorAll() { return []; },
  };
  const ctx = vm.createContext({ document, matchMedia: () => ({ matches: false }) });
  ctx.window = ctx;
  vm.runInContext(read('shared/ma-core.js'), ctx);
  vm.runInContext(read('correlation-ma/index.html').match(/<script>([\s\S]*?)<\/script>/)[1], ctx);
  ctx.AlmCorrValidationPins = { files: [] };
  // Expose the real evaluator without replacing any validation logic. This minimal
  // DOM supports result-contract checks only; it does not claim display coverage.
  vm.runInContext(read('correlation-ma/validate/adapter.js').replace(
    'window.AlmCorrValidationAdapter=adapter;',
    'window.AlmCorrValidationAdapter=adapter; window.evaluateForTest=evaluate;'), ctx);
  return { ctx, el };
}

function checksFor(p, i, mutate = () => {}) {
  const c = corpus[i], r = reference.configurations[i];
  p.el('f-data').value = c.text;
  p.el('f-method').value = c.method;
  p.ctx.__almCorrValidationRun('z');
  mutate(p.ctx._almLastCorrMA());
  const checks = new Map();
  p.ctx.evaluateForTest(c, r, [], (key, actual, expected) => checks.set(key, { actual, expected }), true);
  return checks;
}

test('CI replay accepts the actual result fields for all archived accepted configurations', () => {
  const p = page();
  let accepted = 0;
  reference.configurations.forEach((r, i) => {
    if (r.status !== 'ok') return;
    const c = checksFor(p, i).get('output.fields');
    assert.equal(c.actual, c.expected, corpus[i].id);
    accepted++;
  });
  assert.equal(accepted, 64);
});

for (const [name, mutate] of [
  ['missing standard error', a => { delete a.se_z; }],
  ['missing CI method', a => { delete a.test; }],
  ['unexpected field', a => { a.unexpected = true; }],
]) test('control: replay rejects ' + name, () => {
  const i = reference.configurations.findIndex(r => r.status === 'ok');
  const c = checksFor(page(), i, mutate).get('output.fields');
  assert.notEqual(c.actual, c.expected);
});
