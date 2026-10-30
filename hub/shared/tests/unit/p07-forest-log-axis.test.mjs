import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('function drawForest('));
const z = 1.959963984540054;
const positive = 'A, 0.2, 0.02, first\nB, 0.4, 0.02, second\nC, 0.8, 0.02, third';
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9,
  `${label}: ${actual} != ${expected}`);

// A minimal DOM for the real shared axis controls and the page's full analysis
// script. Checkbox/input changes use their production listeners and onChange.
class Element {
  constructor() {
    this.children = [];
    this.inputs = [];
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.value = '';
  }
  set innerHTML(markup) {
    this.markup = markup;
    this.children = markup === '<div class="alm-axis"></div>' ? [new Element()] : [];
    this.inputs = [...markup.matchAll(/<input\b([^>]*)>/g)].map(([, attrs]) => {
      const input = new Element();
      input.dataset = Object.fromEntries([...attrs.matchAll(/data-(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      input.value = attrs.match(/value="([^"]*)"/)?.[1] ?? '';
      input.checked = /\bchecked\b/.test(attrs);
      return input;
    });
  }
  get innerHTML() { return this.markup ?? ''; }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  querySelectorAll(selector) {
    assert.equal(selector, 'input');
    return this.inputs;
  }
}

function harness(src = positive) {
  const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => {
    const el = new Element();
    el.hidden = /\bhidden\b/.test(tag);
    return [id, el];
  }));
  elements.get('src').value = src;
  const document = {
    head: new Element(),
    createElement: () => new Element(),
    getElementById: id => elements.get(id) ?? null,
    querySelector: selector => elements.get(selector.slice(1)) ?? null,
  };
  const noop = () => {};
  const urlState = Object.assign(noop, { read: () => ({}), write: noop });
  const context = vm.createContext({ document, console, alm: {
    analysisLifecycle: fn => fn, csvUpload: noop, plotExport: noop,
    resultsExport: noop, urlState, resetUndo: noop, tooltips: noop,
  } });
  context.window = context;
  for (const file of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/multilevel-reml.js', 'hub/shared/axis-controls.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  vm.runInContext(main, context, { filename: 'multilevel-ma/index.html' });
  const inputs = elements.get('alm-axis-mount').firstChild.children[0].inputs;
  const change = (edge, value) => {
    const input = inputs.find(input => input.dataset.edge === edge);
    assert.ok(input, `production ${edge} input exists`);
    if (edge === 'log') input.checked = value;
    else input.value = value == null ? '' : String(value);
    input.listeners.change();
  };
  return {
    change,
    get svg() { return elements.get('forest').innerHTML; },
    get error() { return elements.get('forest-axis-error'); },
    get results() { return JSON.parse(JSON.stringify(context._almLastMlma())); },
    get reml() { return JSON.parse(JSON.stringify(context.__almReml())); },
    get summary() { return elements.get('summary').innerHTML; },
    load(value) { elements.get('src').value = value; context.__almMlmaRun(); },
  };
}

const squares = svg => [...svg.matchAll(/<rect\b[^>]*\bx="([^"]+)"/g)].map(m => Number(m[1]) + 3.5);
function checkGeometry(h, src, X, zeroLine) {
  const rows = src.split('\n').map(line => line.split(',').map(s => s.trim()));
  const xs = squares(h.svg);
  assert.equal(xs.length, rows.length);
  const intervals = [...h.svg.matchAll(/<line\b[^>]*stroke-width="1.2"[^>]*>/g)].map(m => m[0]);
  assert.equal(intervals.length, rows.length);
  rows.forEach((row, i) => {
    near(xs[i], X(Number(row[1])), `effect ${i}`);
    near(Number(intervals[i].match(/x1="([^"]+)"/)[1]), X(Number(row[1]) - z * Number(row[2])), `CI lower ${i}`);
    near(Number(intervals[i].match(/x2="([^"]+)"/)[1]), X(Number(row[1]) + z * Number(row[2])), `CI upper ${i}`);
    assert.ok(h.svg.includes(`Study ${row[0]}`));
    assert.ok(h.svg.includes(row[3]));
  });
  const diamond = h.svg.match(/<polygon points="([^"]+)"/)[1].split(' ').map(point => Number(point.split(',')[0]));
  const f = h.results;
  [f.ci_lb_z, f.mu, f.ci_ub_z, f.mu].forEach((value, i) => near(diamond[i], X(value), `pooled vertex ${i}`));
  assert.equal(h.svg.includes('stroke-dasharray'), zeroLine);
  if (zeroLine) near(Number(h.svg.match(/<line x1="([^"]+)"/)[1]), X(0), 'zero reference');
  assert.doesNotMatch(h.svg, /NaN|Infinity/);
}

test('P07-R5 plant: checked log axis gives equal gaps for effects 0.2, 0.4, 0.8 with automatic bounds', () => {
  const h = harness();
  h.change('log', true);
  const xs = squares(h.svg);
  assert.equal(xs.length, 3);
  assert.ok(xs[1] > xs[0]);
  near(xs[1] - xs[0], xs[2] - xs[1], 'equal ratios must have equal log-axis gaps');
  assert.ok(xs.every(x => x > 180 && x < 570), 'automatic padding keeps points inside the plot');
  assert.doesNotMatch(h.svg, /NaN|Infinity|stroke-dasharray/);
});

test('P07-R5 plant: manual log bounds transform effects, CIs and pooled diamond consistently', () => {
  const h = harness();
  h.change('min', 0.1);
  h.change('max', 1.6);
  h.change('log', true);
  // Four doublings span the 390-pixel plotting region.
  checkGeometry(h, positive, value => 180 + Math.log2(value / 0.1) / 4 * 390, false);
});

for (const [edge, bound] of [['min', 0.1], ['max', 1.6]]) {
  test(`P07-R5 plant: one-sided ${edge} log bound preserves ratio spacing`, () => {
    const h = harness();
    h.change(edge, bound);
    h.change('log', true);
    const xs = squares(h.svg);
    const slope = (xs[1] - xs[0]) / Math.log(2);
    near(xs[1] - xs[0], xs[2] - xs[1], 'equal ratio spacing');
    near(xs[0] + slope * Math.log(bound / 0.2), edge === 'min' ? 180 : 570, 'manual edge');
    assert.doesNotMatch(h.svg, /NaN|Infinity/);
  });
}

const invalidData = [
  ['zero effect', positive.replace('0.2, 0.02', '0, 0.02')],
  ['negative effect', positive.replace('0.2, 0.02', '-0.2, 0.02')],
  ['CI crossing zero', positive.replace('0.2, 0.02', '0.2, 0.2')],
  ['CI touching zero', positive.replace('0.2, 0.02', `${z * 0.1}, 0.1`)],
  ['pooled CI crossing zero', 'A, 0.1, 0.01, first\nB, 0.2, 0.01, second\nC, 10, 0.01, third'],
];
function checkRefusal(h) {
  assert.equal(h.svg, '', 'an invalid log domain must clear the previous plot');
  assert.ok(h.error && !h.error.hidden, 'the user must see a log-domain explanation');
  assert.match(h.error.textContent, /log/i);
  assert.match(h.error.textContent, /positive/i);
  assert.match(h.error.textContent, /linear/i);
}
for (const [name, src] of invalidData) {
  test(`P07-R5 plant: log axis refuses ${name} and recovers on linear`, () => {
    const h = harness(src);
    const linear = h.svg;
    assert.equal(squares(linear).length, 3, 'linear control renders the same data');
    if (name === 'pooled CI crossing zero') assert.ok(h.results.ci_lb_z < 0);
    const results = h.results;
    h.change('log', true);
    checkRefusal(h);
    assert.deepEqual(h.results, results, 'plot refusal must not alter estimates');
    h.change('log', false);
    assert.equal(h.svg, linear, 'switching back restores exactly the linear SVG');
    assert.ok(h.error.hidden);
  });
}

for (const [edge, bound] of [['min', 0], ['min', -1], ['max', 0], ['min', 2], ['max', 0.01]]) {
  test(`P07-R5 plant: log axis refuses invalid ${edge} bound ${bound}`, () => {
    const h = harness();
    h.change('log', true);
    h.change(edge, bound);
    checkRefusal(h);
    h.change(edge, null);
    assert.equal(squares(h.svg).length, 3, 'clearing the bad bound restores the log plot');
    assert.ok(h.error.hidden);
  });
}

test('P07-R5 control: default and explicit linear axes retain affine geometry and the zero reference', () => {
  const h = harness();
  const f = h.results;
  const hi = Math.max(0.8 + z * 0.02, f.ci_ub_z);
  const lo = Math.min(0, 0.2 - z * 0.02, f.ci_lb_z);
  const pad = (hi - lo) * 0.1 || 0.3;
  checkGeometry(h, positive, value => 180 + (value - lo + pad) / (hi - lo + 2 * pad) * 390, true);
  h.change('min', -0.1);
  h.change('max', 1);
  checkGeometry(h, positive, value => 180 + (value + 0.1) / 1.1 * 390, true);
});

test('P07-R5 control: toggling log leaves MoM, REML, summary and restored linear SVG unchanged', () => {
  const h = harness();
  const before = { svg: h.svg, results: h.results, reml: h.reml, summary: h.summary };
  h.change('log', true);
  assert.deepEqual(h.results, before.results);
  assert.deepEqual(h.reml, before.reml);
  assert.equal(h.summary, before.summary);
  h.change('log', false);
  assert.equal(h.svg, before.svg);
});

test('P07-R5 plant: changing invalid data to positive data clears the log-domain notice', () => {
  const h = harness(invalidData[0][1]);
  h.change('log', true);
  checkRefusal(h);
  h.load(positive);
  assert.equal(squares(h.svg).length, 3);
  assert.ok(h.error.hidden);
  assert.equal(h.error.textContent, '');
});
