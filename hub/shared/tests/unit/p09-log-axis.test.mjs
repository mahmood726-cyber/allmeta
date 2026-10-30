import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('proportion-ma/index.html', root), 'utf8');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function drawForest('));
const sample = '1,100,A\n10,100,B\n80,100,C';
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8,
  `${label}: got ${actual}, expected ${expected}`);

// Small DOM surface for the real shared checkbox/change handler and application
// render path. No production functions are extracted, replaced or reimplemented.
class Element {
  constructor() {
    this.value = ''; this.checked = false; this.hidden = false;
    this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.children = []; this.textContent = ''; this._html = '';
  }
  set innerHTML(value) {
    this._html = value;
    this.children = [];
    if (value === '<div class="alm-axis"></div>') this.children.push(new Element());
    for (const match of value.matchAll(/<input\b([^>]*)>/g)) {
      const input = new Element(), attrs = match[1];
      input.dataset.axis = attrs.match(/data-axis="([^"]*)"/)?.[1];
      input.dataset.edge = attrs.match(/data-edge="([^"]*)"/)?.[1];
      input.value = attrs.match(/value="([^"]*)"/)?.[1] ?? '';
      input.checked = /\bchecked\b/.test(attrs);
      this.children.push(input);
    }
  }
  get innerHTML() { return this._html; }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(event, listener) { (this.listeners[event] ??= []).push(listener); }
  dispatch(event) { for (const listener of this.listeners[event] ?? []) listener({ target: this }); }
  querySelectorAll(selector) {
    assert.equal(selector, 'input');
    return this.children.filter(child => child.dataset.edge);
  }
}

function harness(source = sample, transform = 'logit') {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.get('src').value = source;
  elements.get('trans').value = transform;
  elements.get('tau-est').value = 'PM';
  const urlState = Object.assign(() => {}, { read: () => ({}), write() {} });
  const document = {
    getElementById: id => elements.get(id) ?? null,
    querySelector: selector => elements.get(selector.slice(1)) ?? null,
    createElement: () => new Element(), head: new Element()
  };
  const context = vm.createContext({ document, console });
  context.window = context;
  context.alm = {
    csvUpload() {}, plotExport() {}, resultsExport() {}, resetUndo() {}, tooltips() {},
    urlState, analysisLifecycle: run => run
  };
  for (const file of ['shared/ma-core.js', 'hub/shared/axis-controls.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  vm.runInContext(main, context, { filename: 'proportion-ma/index.html' });
  const inputs = elements.get('alm-axis-mount').firstChild.children[0].querySelectorAll('input');
  const change = (edge, value) => {
    const input = inputs.find(input => input.dataset.edge === edge);
    assert.ok(input, `real axis control ${edge} exists`);
    if (edge === 'log') input.checked = value;
    else input.value = value === null ? '' : String(value);
    input.dispatch('change');
  };
  return {
    elements, change,
    bounds(min, max) { change('min', min); change('max', max); },
    get svg() { return elements.get('forest').innerHTML; },
    get results() { return JSON.parse(JSON.stringify(context._almLastPropMA())); },
    get snapshot() { return JSON.parse(JSON.stringify(context.__almPropValidation.snapshot())); },
    get error() { return elements.get('forest-axis-error'); }
  };
}

const tags = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))]
  .map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]])));
const centers = svg => tags(svg, 'rect').map(rect => Number(rect.x) + Number(rect.width) / 2);
const ticks = svg => [...svg.matchAll(/<text\b[^>]*x="([^"]+)"[^>]*>([^<]+)%<\/text>/g)]
  .map(match => ({ x: Number(match[1]), p: Number(match[2]) / 100 }));
const linearX = p => 160 + (p - 0.0001) / (1 - 0.0001) * 410;
const logX = p => 160 + (Math.log10(p) + 4) / 4 * 410;

test('P09-R2 control: linear marker positions and ticks retain explicit bounds', () => {
  const h = harness(); h.bounds(0.0001, 1);
  centers(h.svg).forEach((x, i) => near(x, linearX([0.01, 0.1, 0.8][i]), 'linear marker'));
  assert.deepEqual(ticks(h.svg).map(t => t.p), [0.2, 0.4, 0.6, 0.8, 1]);
  const before = h.svg; h.bounds(0, 1);
  assert.notEqual(h.svg, before, 'ordinary axis-bound control changes the plot');
  centers(h.svg).forEach((x, i) => near(x, 160 + [0.01, 0.1, 0.8][i] * 410, 'linear bound update'));
});

test('P09-R2 plant: checkbox maps study estimates, CIs and pooled diamond logarithmically', () => {
  const h = harness(); h.bounds(0.0001, 1);
  const linear = h.svg; h.change('log', true);
  centers(h.svg).forEach((x, i) => near(x, logX([0.01, 0.1, 0.8][i]), 'log marker'));
  assert.notEqual(h.svg, linear);
  const ci = tags(h.svg, 'line').filter(line => line['stroke-width'] === '1.2');
  h.snapshot.studies.forEach((study, i) => {
    near(Number(ci[i].x1), logX(study.lo), 'log CI lower');
    near(Number(ci[i].x2), logX(study.hi), 'log CI upper');
  });
  const diamond = tags(h.svg, 'polygon')[0].points.split(' ').map(point => Number(point.split(',')[0]));
  [h.results.poolLo, h.results.poolP, h.results.poolHi, h.results.poolP].forEach((p, i) => near(diamond[i], logX(p), 'log diamond'));
  h.change('log', false);
  assert.equal(h.svg, linear, 'unchecking log restores the identical linear SVG');
});

test('P09-R2 plant: log ticks show positive decades at equal pixel intervals', () => {
  const h = harness(); h.bounds(0.0001, 1); h.change('log', true);
  const actual = ticks(h.svg);
  assert.deepEqual(actual.map(t => t.p), [0.0001, 0.001, 0.01, 0.1, 1]);
  actual.forEach((tick, i) => near(tick.x, 160 + i * 102.5, 'decade tick'));
});

test('P09-R2 plant: a narrow log range has distinct positive labelled ticks', () => {
  const h = harness(); h.bounds(0.05, 0.15); h.change('log', true);
  const actual = ticks(h.svg);
  assert.ok(actual.length >= 2, 'narrow ranges still have readable ticks');
  assert.equal(new Set(actual.map(t => t.p)).size, actual.length);
  actual.forEach(tick => {
    assert.ok(tick.p >= 0.05 && tick.p <= 0.15);
    near(tick.x, 160 + Math.log(tick.p / 0.05) / Math.log(3) * 410, 'narrow log tick');
  });
});

for (const transform of ['logit', 'ft', 'raw']) {
  test(`P09-R2 control: ${transform} numerical results, table and heterogeneity survive axis changes`, () => {
    const h = harness(sample, transform);
    const before = { results: h.results, snapshot: h.snapshot, table: h.elements.get('res-body').innerHTML, het: h.elements.get('het').innerHTML };
    h.bounds(0.0001, 1); h.change('log', true);
    assert.deepEqual({ results: h.results, snapshot: h.snapshot, table: h.elements.get('res-body').innerHTML, het: h.elements.get('het').innerHTML }, before);
  });
}

for (const [name, bounds] of [['automatic', [null, null]], ['automatic lower', [null, 1]], ['automatic upper', [0.0001, null]]]) {
  test(`P09-R2 plant: ${name} log bounds fit positive data even when linear padding crosses zero`, () => {
    const h = harness(); h.bounds(...bounds); h.change('log', true);
    const [a, b, c] = centers(h.svg);
    assert.equal(centers(h.svg).length, 3);
    near((c - b) / (b - a), Math.log10(8), 'log distance ratio');
    assert.ok(a >= 160 && c <= 570, 'automatic domain contains study estimates');
    assert.doesNotMatch(h.svg, /NaN|Infinity/);
    assert.ok(ticks(h.svg).every(t => t.p > 0));
  });
}

for (const [name, bounds] of [
  ['zero minimum', [0, 1]], ['negative minimum', [-0.1, 1]],
  ['nonpositive maximum', [-1, 0]], ['nonfinite maximum', [0.0001, Infinity]],
  ['automatic maximum below minimum', [2, null]], ['automatic minimum above maximum', [null, 0.000001]]
]) {
  test(`P09-R2 plant: log axis refuses ${name} and recovers after correction`, () => {
    const h = harness(); h.bounds(...bounds); h.change('log', true);
    assert.equal(h.svg, '', 'invalid log bounds must clear the old forest');
    assert.ok(h.error && !h.error.hidden, 'visible axis error');
    assert.match(h.error.textContent, /log.*(positive|minimum|maximum)/i);
    h.bounds(0.0001, 1);
    assert.equal(centers(h.svg).length, 3);
    assert.equal(h.error.hidden, true);
    assert.equal(h.error.textContent, '');
  });
}

for (const [name, source, transform] of [
  ['zero-event study', '0,100,A\n10,100,B\n80,100,C', 'logit'],
  ['zero pooled confidence limit', sample, 'raw']
]) {
  test(`P09-R2 plant: log axis refuses ${name} without altering analysis`, () => {
    const h = harness(source, transform); h.bounds(0.0001, 1);
    const results = h.results, linear = h.svg;
    if (transform === 'raw') assert.equal(results.poolLo, 0, 'plant contains a zero pooled CI endpoint');
    h.change('log', true);
    assert.equal(h.svg, '', 'nonpositive plotted data have no log coordinates');
    assert.ok(h.error && !h.error.hidden);
    assert.match(h.error.textContent, /positive.*(estimate|confidence)/i);
    assert.deepEqual(h.results, results);
    h.change('log', false);
    assert.equal(h.svg, linear);
    assert.equal(h.error.hidden, true);
  });
}

test('P09-R2 control: linear axes continue to plot zero-event and all-event studies', () => {
  const h = harness('0,100,A\n100,100,B'); h.bounds(0, 1);
  assert.deepEqual(centers(h.svg), [160, 570]);
  assert.doesNotMatch(h.svg, /NaN|Infinity/);
});

test('P09-R2 plant: all-event studies remain valid on a log axis', () => {
  const h = harness('10,100,A\n100,100,B'); h.bounds(0.0001, 1); h.change('log', true);
  const [a, b] = centers(h.svg);
  near(a, logX(0.1), 'positive control estimate'); near(b, 570, '100 percent is log-valid');
  assert.doesNotMatch(h.svg, /NaN|Infinity/);
});
