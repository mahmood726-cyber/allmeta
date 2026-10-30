import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const engine = readFileSync(new URL('limit-ma/plus.js', root), 'utf8');
const ui = readFileSync(new URL('limit-ma/plus-ui.js', root), 'utf8');
const input = {te: [.2, .1, .4, .3, .6, .2], se: [.1, .15, .2, .25, .3, .4]};

// Minimal DOM runs the complete production renderer, including its plots.
class Element {
  children = [];
  dataset = {};
  checked = false;
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  set textContent(text) { this.children = [String(text)]; }
  get textContent() { return this.children.map(n => typeof n === 'string' ? n : n.textContent).join(''); }
  setAttribute() {}
  addEventListener() {}
  querySelectorAll() { return []; }
}
function harness(branch = 'PET', refused = false) {
  const nodes = new Map();
  const el = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  const context = vm.createContext({window: {}, document: {
    getElementById: el,
    createElement: () => new Element(),
    createElementNS: () => new Element(),
    createTextNode: text => String(text),
  }});
  vm.runInContext(engine, context);
  vm.runInContext(ui, context);
  const api = context.window.AlmLimitPlus;
  const results = Object.fromEntries(['RE', 'limit', 'trimfill', 'selection', 'shift', 'G2'].map(
    key => [key, {status: 'refused', reason: 'control-unavailable'}]));
  results.PET = api.reg(input.te, input.se, 1);
  results.PEESE = api.reg(input.te, input.se, 2);
  const alpha = branch === 'PET' ? results.PET.values.p / 2 : (1 + results.PET.values.p) / 2;
  results.conditional = api.conditional(results.PET, results.PEESE, alpha);
  for (const key of ['Egger', 'Peters']) results[key] = {status: 'ok', values: {statistic: 2, df: 10, p: .07}};
  if (refused) for (const key of ['PET', 'PEESE', 'conditional']) results[key] = {status: 'refused', reason: 'singular-design'};
  context.window.AlmLimitPlusUI.render(results, input, null);
  return {el, results, detail: key => el('plus-details').children.find(n => n.dataset.plusDetail === key)};
}
function descendants(node) {
  return [node, ...node.children.filter(n => typeof n !== 'string').flatMap(descendants)];
}

// These assertions fail on the original renderer's bare t/p labels.
for (const key of ['PET', 'PEESE', 'conditional']) {
  for (const branch of key === 'conditional' ? ['PET', 'PEESE'] : ['PET']) {
    test(`${key} (${branch} branch): identify t and p as intercept tests beside the slope`, () => {
      const h = harness(branch), text = h.detail(key).textContent, values = h.results[key].values;
      assert.ok(text.includes('intercept t = ' + values.t.toPrecision(12)));
      assert.ok(text.includes('intercept p = ' + values.p.toPrecision(12)));
      assert.ok(text.includes('slope = ' + values.slope.toPrecision(12)));
      assert.doesNotMatch(text, /; [tp] = /);
      if (key === 'conditional') assert.equal(h.results[key].branch, branch);
    });
  }
}

for (const key of ['PET', 'PEESE']) test(`${key} control: engine t tests the intercept, not the slope`, () => {
  const {values: v} = harness().results[key];
  assert.equal(v.t, v.mu / v.se);
  assert.notEqual(v.t, v.slope / v.se);
  assert.ok(v.p > 0 && v.p < 1);
});

test('control: preserve numeric identifiers, values, and effect table cells', () => {
  const h = harness();
  for (const key of ['PET', 'PEESE', 'conditional']) {
    const row = h.el('plus-body').children.find(n => n.dataset.plusMethod === key);
    const numbers = [...descendants(row), ...descendants(h.detail(key))].filter(n => n.dataset.plusNumber);
    assert.deepEqual(numbers.map(n => n.dataset.plusNumber).sort(), Object.keys(h.results[key].values).map(q => key + '.' + q).sort());
    for (const n of numbers) assert.equal(n.textContent, h.results[key].values[n.dataset.plusNumber.split('.')[1]].toPrecision(12));
    assert.equal(row.children.length, 5);
  }
});

test('control: unrelated small-study tests retain their own statistic and p labels', () => {
  const h = harness();
  for (const key of ['Egger', 'Peters']) {
    assert.equal(h.detail(key).textContent, `${key === 'Egger' ? 'Egger small-study test' : 'Peters binary test'}: statistic = 2.00000000000; df = 10.0000000000; p = 0.0700000000000; `);
  }
});

test('control: refused regressions show the reason without intercept statistics', () => {
  const h = harness('PET', true);
  for (const key of ['PET', 'PEESE', 'conditional']) {
    assert.ok(h.detail(key).textContent.endsWith('Refused: singular-design'));
    assert.doesNotMatch(h.detail(key).textContent, /intercept|slope|[tp] = /);
  }
});
