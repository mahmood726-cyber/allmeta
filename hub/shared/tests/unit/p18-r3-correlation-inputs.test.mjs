import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('multivariate-ma/index.html', root), 'utf8');

// Minimal DOM for the actual page scripts; no browser or third-party dependencies.
// Numeric values remain strings, including whitespace supplied by a DOM replay.
class Element {
  constructor() {
    this.value = ''; this.style = {}; this.dataset = {}; this.children = [];
    this.attributes = {}; this.listeners = {}; this.innerHTML = '';
  }
  set innerHTML(value) { this.markup = value; this.children = []; this.text = ''; }
  get innerHTML() { return this.markup + this.children.map(c => c.innerHTML || c.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.markup = ''; this.children = []; }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.innerHTML = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  click() { for (const fn of this.listeners.click || []) fn({ currentTarget: this, target: this }); }
  querySelectorAll(selector) { return selector === 'option' ? this.options || [] : []; }
}

function page() {
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element();
    element.value = /\bvalue="([^"]*)"/.exec(match[0])?.[1] || '';
    elements.set(match[1], element);
  }
  const el = id => {
    assert.ok(elements.has(id), `page element ${id} exists`);
    return elements.get(id);
  };
  el('f-mode').options = ['cov', 'r', 'rhoW'].map(value => Object.assign(new Element(), { value }));
  const document = { getElementById: el, createElement: () => new Element() };
  const window = { matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ window, document, matchMedia: window.matchMedia,
    setTimeout, clearTimeout, navigator: {}, Blob });
  for (const file of ['shared/multivariate-ma.js', 'multivariate-ma/plus.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .find(match => match[1].includes('window.AlmMvPage ='));
  assert.ok(inline, 'main page script exists');
  vm.runInContext(inline[1], context, { filename: 'multivariate-ma/index.html' });
  vm.runInContext(readFileSync(new URL('multivariate-ma/plus-ui.js', root), 'utf8'), context,
    { filename: 'multivariate-ma/plus-ui.js' });
  return { w: window, el, ui: window.AlmMvPlusUI };
}

const { w, el, ui } = page();
// Synthetic two-study inputs exercise real fits; no R-parity estimates are asserted.
const data = 'a,0,2,0,2\nb,0,2,0,2';
const clone = value => JSON.parse(JSON.stringify(value));
const rGrid = () => ui.rScript().split('\n').find(line => line.startsWith('grid <- '));
function reset(mode = 'rhoW', rho = '0.5') {
  el('f-rhow').value = rho;
  w.AlmMvPage.load(mode === 'rhoW' ? data : data.split('\n').map(row => row + ',0').join('\n'), mode, 'A', 'B');
  el('plus-from').value = '0'; el('plus-to').value = '0'; el('plus-step').value = '0.1';
  assert.ok(w.AlmMvPage.current().fit, 'valid starting analysis fits');
}
function seedSweep() {
  assert.equal(ui.runSweep().length, 1);
  assert.deepEqual(clone(ui.state().grid), [0]);
  assert.ok(el('plus-sweep-plot').innerHTML);
}

for (const [label, blank] of [['empty', ''], ['whitespace', ' \t ']]) {
  test(`P18-R3 plant: ${label} assumed rho refuses and clears a prior fit`, () => {
    reset(); seedSweep();
    el('f-rhow').value = blank;
    w.AlmMvPage.run();
    assert.ok(w.AlmMvPage.current().parsed.invalid, 'missing assumed rho must be invalid, not zero');
    assert.equal(w.AlmMvPage.current().fit, null);
    assert.equal(w._almLastMultivariate(), null);
    assert.match(el('headline').textContent, /^Refused: Assumed within-study correlation/);
    assert.equal(ui.state().res.status, 'refused');
    assert.equal(ui.state().grid, null);
    const exported = clone(ui.resultsJSON());
    assert.equal(exported.input.rhoW, null);
    assert.equal(exported.result, null);
    assert.equal(exported.sweep, null);
    for (const id of ['stats', 'plot-host', 'plus-sweep-plot', 'plus-sweep-body', 'plus-sweep-head']) {
      assert.equal(el(id).innerHTML, '', id);
    }
    assert.equal(el('plus-methods').value, '');
    assert.equal(el('plus-results').value, '');
  });

  for (const id of ['plus-from', 'plus-to', 'plus-step']) {
    test(`P18-R3 plant: ${label} ${id} refuses as missing and clears a prior sweep`, () => {
      reset(); seedSweep();
      el(id).value = blank;
      assert.equal(ui.runSweep() === null, true, `${id} must not synthesize a zero grid`);
      assert.match(el('plus-status').textContent, /^Refused: From, to and step must be numbers\./);
      assert.equal(ui.state().grid, null);
      assert.equal(ui.state().sweep, null);
      assert.equal(ui.resultsJSON().sweep, null);
      for (const output of ['plus-sweep-plot', 'plus-sweep-head', 'plus-sweep-body']) {
        assert.equal(el(output).innerHTML, '', output);
      }
      assert.doesNotMatch(el('plus-methods').value, /Sensitivity to the within-study correlation/);
      assert.doesNotMatch(el('plus-results').value, /Across .* from/);
      assert.doesNotMatch(el('plus-interpretation').textContent, /Across .* from/);
      assert.equal(rGrid(), 'grid <- c()');
    });

    test(`P18-R3 plant: ${label} ${id} cannot create a zero grid in R export before a sweep`, () => {
      reset();
      el(id).value = blank;
      assert.equal(ui.state().grid, null);
      assert.equal(rGrid(), 'grid <- c()');
    });
  }
}

test('P18-R3 control: explicit zero and nonzero assumed rho still fit and export', () => {
  for (const rho of ['0', '0.5', '-0.5']) {
    reset('rhoW', rho);
    assert.equal(w.AlmMvPage.current().parsed.invalid, undefined);
    assert.equal(w._almLastMultivariate().rhoW, Number(rho));
    assert.equal(ui.resultsJSON().input.rhoW, Number(rho));
    assert.equal(ui.state().res.status, 'ok');
    assert.ok(ui.rScript().includes(`rho_w <- ${Number(rho)};`));
  }
});

test('P18-R3 control: supplied covariance and per-study r ignore a blank assumed rho', () => {
  for (const mode of ['cov', 'r']) {
    reset(mode, '');
    assert.equal(w._almLastMultivariate().mode, mode);
    assert.equal(w._almLastMultivariate().rhoW, null);
    assert.equal(w.AlmMvPage.current().parsed.invalid, undefined);
  }
});

test('P18-R3 control: explicit zero sweep endpoints remain valid in fitting and R download', async () => {
  reset();
  assert.equal(rGrid(), 'grid <- c(0)');
  seedSweep();
  assert.equal(ui.state().sweep[0].status, 'ok');
  assert.equal(ui.resultsJSON().sweep[0].rhoW, 0);
  assert.equal(rGrid(), 'grid <- c(0)');
  let download;
  w.AlmMvPage.download = (name, blob) => { download = { name, blob }; };
  el('plus-dl-r').click();
  assert.equal(download.name, 'multivariate-ma-analysis.R');
  assert.match(await download.blob.text(), /^grid <- c\(0\)$/m);
});

test('P18-R3 control: explicit zero step is still refused as nonpositive', () => {
  reset(); seedSweep();
  el('plus-step').value = '0';
  assert.equal(ui.runSweep(), null);
  assert.match(el('plus-status').textContent, /^Refused: Step must be positive\./);
  assert.equal(ui.resultsJSON().sweep, null);
  assert.equal(rGrid(), 'grid <- c()');
});

test('P18-R3 control: nonnumeric and nonfinite controls still refuse', () => {
  for (const bad of ['invalid', 'NaN', 'Infinity']) {
    reset(); el('f-rhow').value = bad; w.AlmMvPage.run();
    assert.equal(w._almLastMultivariate(), null);
    for (const id of ['plus-from', 'plus-to', 'plus-step']) {
      reset(); el(id).value = bad;
      assert.equal(ui.runSweep(), null);
      assert.match(el('plus-status').textContent, /must be numbers/);
      assert.equal(rGrid(), 'grid <- c()');
    }
  }
});

test('P18-R3 control: the explicit default sweep and completed-grid export are preserved', () => {
  reset();
  el('plus-from').value = '-0.9'; el('plus-to').value = '0.9'; el('plus-step').value = '0.1';
  const expected = Array.from({ length: 19 }, (_, i) => (i - 9) / 10);
  assert.equal(rGrid(), `grid <- c(${expected.join(', ')})`);
  assert.equal(ui.runSweep().length, 19);
  assert.deepEqual(clone(ui.state().grid), expected);
  assert.equal(ui.state().sweep.every(row => row.status === 'ok'), true);
  assert.equal(ui.resultsJSON().sweep.length, 19);
  // Export an already completed sweep, even if an unrun draft control was edited.
  el('plus-from').value = '';
  assert.equal(rGrid(), `grid <- c(${expected.join(', ')})`);
});
