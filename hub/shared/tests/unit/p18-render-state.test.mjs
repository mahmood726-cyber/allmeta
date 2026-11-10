import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multivariate-ma/index.html');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('window.AlmMvPage ='));

// Execute the actual page, engine and panel in a small DOM double. No browser,
// extracted/reimplemented formatters, external dependencies or fixture estimates.
function harness() {
  class Element {
    constructor() {
      this.value = ''; this.style = {}; this.dataset = {}; this.children = [];
      this.attributes = {}; this.listeners = {}; this._html = ''; this._text = '';
    }
    set innerHTML(value) { this._html = String(value); this._text = ''; this.children = []; }
    get innerHTML() { return this._html; }
    set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this._html = ''; this._text = ''; this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    querySelectorAll(selector) { return selector === 'option' ? this.children : []; }
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element()]));
  const el = id => { assert.ok(elements.has(id), `page element ${id} exists`); return elements.get(id); };
  for (const mode of ['cov', 'r', 'rhoW']) {
    const option = new Element(); option.value = mode; el('f-mode').appendChild(option);
  }
  for (const [id, value] of Object.entries({ 'f-rhow': '0.5', 'plus-from': '0', 'plus-to': '0', 'plus-step': '0.1' })) el(id).value = value;
  const window = {};
  const context = vm.createContext({ window,
    document: { getElementById: el, createElement: () => new Element() },
    setTimeout, clearTimeout
  });
  for (const file of ['shared/multivariate-ma.js', 'multivariate-ma/plus.js']) vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(inline, context, { filename: 'multivariate-ma/index.html' });
  vm.runInContext(read('multivariate-ma/plus-ui.js'), context, { filename: 'multivariate-ma/plus-ui.js' });
  return { window, context, el, page: window.AlmMvPage, ui: window.AlmMvPlusUI, plus: window.AlmMvPlus };
}

const tied = variance => `Current A,0,${variance},0,${variance},0\nCurrent B,0,${variance},0,${variance},0`;
function seedPrevious(h) {
  assert.equal(h.window._almLastMultivariate().k, 5);
  assert.match(h.el('plus-results').value, /Across k = 5 studies/);
  assert.equal(h.ui.runSweep()[0].status, 'ok');
  assert.ok(h.ui.resultsJSON().sweep);
  assert.ok(h.el('plus-sweep-plot').innerHTML);
}
function assertSweepCleared(h) {
  assert.equal(h.ui.resultsJSON().sweep, null);
  assert.equal(h.ui.state().grid, null);
  assert.equal(h.el('plus-sweep-plot').innerHTML, '');
  assert.equal(h.el('plus-sweep-body').children.length, 0);
  assert.equal(h.el('plus-sweep-head').children.length, 0);
}
function assertCurrentInput(h) {
  const exported = h.ui.resultsJSON();
  assert.equal(exported.input.rows.length, 2);
  assert.equal(exported.input.rows[0].label, 'Current A');
  assert.equal(exported.input.outcomes[0], 'Current first');
  assert.match(h.ui.rScript(), /label = c\("Current A", "Current B"\)/);
  assert.doesNotMatch(h.ui.rScript(), /Trial 1/);
}
function assertCurrentFit(h) {
  assertCurrentInput(h);
  const exported = h.ui.resultsJSON();
  assert.equal(exported.result.k, 2);
  assert.equal(exported.result, h.window._almLastMultivariate());
  assert.equal(h.ui.state().res.status, 'ok');
  assert.equal(h.el('plus-cmp-body').children.length, 4);
  assert.match(h.el('plus-cmp-body').textContent, /Current first/);
  assert.doesNotMatch(h.el('plus-cmp-body').textContent, /\bPD\b/);
  const texts = h.plus.texts(h.ui.state().parsed, h.ui.state().res, null);
  assert.equal(h.el('plus-results').value, texts.results);
  assert.equal(h.el('plus-methods').value, texts.methods);
  assert.equal(h.el('plus-interpretation').textContent, texts.interpretation);
  assert.match(h.el('plus-results').value, /Across k = 2 studies/);
  assert.ok(exported.univariate.every(fit => fit.k === 2));
  assertSweepCleared(h);
}
function assertScientificTicks(svg, joint) {
  assert.match(svg, /<svg /);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  const labels = [...svg.matchAll(joint
    ? /<text data-tick='[xy]'[^>]*>([^<]+)<\/text>/g
    : /<text [^>]*text-anchor='end'[^>]*>([^<]+)<\/text>/g)].map(match => match[1]);
  assert.ok(labels.length >= 4, 'both axes have labelled ticks');
  const nonzero = labels.filter(label => Number(label) !== 0);
  assert.ok(nonzero.some(label => Number(label) < 0));
  assert.ok(nonzero.some(label => Number(label) > 0));
  assert.ok(nonzero.every(label => /e-\d+/.test(label)), 'tiny nonzero ticks use scientific notation');
}

test('P18-R3 control: ordinary refusal clears the preceding report and sweep', () => {
  const h = harness(); seedPrevious(h);
  h.page.load('Only current,0,1,0,1,0', 'cov', 'Current first', 'Current second');
  assert.equal(h.window._almLastMultivariate(), null);
  assert.equal(h.ui.resultsJSON().input.rows.length, 1);
  assert.equal(h.ui.resultsJSON().univariate, null);
  assert.equal(h.el('plus-results').value, '');
  assert.equal(h.el('plus-methods').value, '');
  assert.match(h.el('plus-cmp-body').textContent, /Not available/);
  assert.match(h.el('plus-interpretation').textContent, /No model was fitted/);
  assertSweepCleared(h);
});

test('P18-R3 control: small supported variance updates reports and exports', () => {
  const h = harness(); seedPrevious(h);
  assert.doesNotThrow(() => h.page.load(tied('1e-190'), 'cov', 'Current first', 'Current second'));
  assertCurrentFit(h);
  assert.match(h.el('plot-host').innerHTML, /<svg /);
  assert.doesNotMatch(h.el('plot-host').innerHTML, /NaN|Infinity/);
});

test('P18-R3 plant: variance 1e-204 renders joint ticks and replaces the previous analysis', () => {
  const h = harness(); seedPrevious(h);
  assert.doesNotThrow(() => h.page.load(tied('1e-204'), 'cov', 'Current first', 'Current second'));
  assertCurrentFit(h);
  assertScientificTicks(h.el('plot-host').innerHTML, true);
});

test('P18-R3 plant: variance 1e-204 renders sensitivity ticks', () => {
  const h = harness();
  const parsed = h.page.parse(tied('1e-204'), 'cov', 0);
  parsed.outcomes = ['Current first', 'Current second'];
  const res = h.plus.compute(parsed);
  assert.equal(res.status, 'ok');
  // Set the panel directly so this test reaches its formatter even when the
  // separate joint-plot formatter is still defective.
  h.ui.update(parsed, res);
  assert.doesNotThrow(() => h.ui.runSweep());
  assertScientificTicks(h.el('plus-sweep-plot').innerHTML, false);
  assert.equal(h.el('plus-sweep-body').children.length, 1);
  assert.equal(h.ui.resultsJSON().sweep.length, 1);
  assert.match(h.el('plus-results').value, /Across k = 2 studies/);
  assert.match(h.el('plus-results').value, /Across ρw/);
});

test('P18-R3 control: ordinary joint and sweep ticks keep fixed notation', () => {
  const h = harness();
  h.page.load(tied('1'), 'cov', 'Current first', 'Current second');
  assertCurrentFit(h);
  const joint = h.el('plot-host').innerHTML;
  for (const label of ['-2', '-1', '0', '1', '2']) assert.ok(joint.includes(`>${label}</text>`), label);
  assert.equal(h.ui.runSweep()[0].status, 'ok');
  assert.match(h.el('plus-sweep-plot').innerHTML, />-1<\/text>/);
  assert.match(h.el('plus-sweep-plot').innerHTML, />1<\/text>/);
});

test('P18-R3 plant: unexpected plot error clears reports and exports, then recovers', () => {
  const h = harness(); seedPrevious(h);
  // The page reaches matchMedia only during plot rendering, after a valid fit.
  h.window.matchMedia = true;
  h.context.matchMedia = () => { throw new Error('planted plot failure'); };
  assert.doesNotThrow(() => h.page.load(tied('1'), 'cov', 'Current first', 'Current second'));
  assertCurrentInput(h);
  assert.equal(h.window._almLastMultivariate(), null);
  assert.equal(h.page.current().fit, null);
  assert.equal(h.ui.resultsJSON().result, null);
  assert.equal(h.ui.resultsJSON().univariate, null);
  assert.equal(h.ui.resultsJSON().varRatio, null);
  assert.equal(h.el('plus-results').value, '');
  assert.equal(h.el('plus-methods').value, '');
  assert.match(h.el('plus-cmp-body').textContent, /Not available/);
  assert.match(h.el('plus-interpretation').textContent, /planted plot failure/);
  assert.match(h.el('headline').textContent, /planted plot failure/);
  assert.equal(h.el('stats').innerHTML, '');
  assert.equal(h.el('plot-host').innerHTML, '');
  assert.equal(h.el('likelihood-diagnostic').hidden, true);
  assertSweepCleared(h);
  h.window.matchMedia = false;
  h.page.run();
  assertCurrentFit(h);
  assert.match(h.el('plot-host').innerHTML, /<svg /);
});
