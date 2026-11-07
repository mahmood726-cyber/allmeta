import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('mh-peto/index.html', root), 'utf8');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('// ---- engine'));
assert.ok(app, 'Run the actual mh-peto application script');
const controls = readFileSync(new URL('hub/shared/axis-controls.js', root), 'utf8');
const lifecycle = readFileSync(new URL('hub/shared/analysis-lifecycle.js', root), 'utf8');
const source = 'Null, 20, 100, 20, 100\nLess, 10, 100, 20, 100\nMore, 40, 100, 20, 100';

// Only the DOM surface used by the page and the real shared axis widget is
// emulated. Parsing, pooling, rendering, controls and measure handlers are real.
class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.value = '';
    this.checked = false;
    this.textContent = '';
  }
  set innerHTML(value) {
    this.markup = value;
    this.children = [];
    if (value === '<div class="alm-axis"></div>') this.appendChild(new Element());
    for (const match of value.matchAll(/<input\b([^>]*)>/g)) {
      const input = new Element();
      for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
        input.setAttribute(attr[1], attr[2]);
        if (attr[1] === 'value') input.value = attr[2];
        if (attr[1] === 'data-axis') input.dataset.axis = attr[2];
        if (attr[1] === 'data-edge') input.dataset.edge = attr[2];
      }
      input.checked = /\bchecked\b/.test(match[1]);
      this.appendChild(input);
    }
  }
  get innerHTML() { return this.markup || ''; }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type) {
    for (const handler of this.listeners[type] || []) handler.call(this, { target: this });
  }
  dispatchEvent(event) { this.dispatch(event.type); return true; }
  querySelectorAll(selector) {
    assert.equal(selector, 'input');
    return this.children.flatMap(child => [
      ...(child.dataset.edge ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
}

function harness(measure = 'OR', restored = null) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element()]));
  const get = id => {
    assert.ok(elements.has(id), `Known page element: ${id}`);
    return elements.get(id);
  };
  get('src').value = source;
  get('measure').value = measure;
  const document = {
    head: new Element(),
    getElementById: get,
    createElement: () => new Element(),
    querySelector: selector => get(selector.slice(1)),
    querySelectorAll: selector => {
      if (selector === '#src, #measure') return [get('src'), get('measure')];
      assert.equal(selector, '#alm-csv-mount textarea');
      return [];
    },
    addEventListener() {},
  };
  let undo;
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, plotExport: noop, resultsExport: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => restored, write: noop }),
    resetUndo: Object.assign(options => { undo = options; }, { snapshot: noop }),
  } };
  const context = vm.createContext({ window, document, Event });
  vm.runInContext(controls, context, { filename: 'axis-controls.js' });
  vm.runInContext(lifecycle, context, { filename: 'analysis-lifecycle.js' });
  vm.runInContext(app, context, { filename: 'mh-peto/index.html' });
  const input = edge => {
    const found = get('alm-axis-mount').querySelectorAll('input')
      .find(element => element.dataset.axis === 'x' && element.dataset.edge === edge);
    assert.ok(found, `X-axis ${edge} control exists`);
    return found;
  };
  return {
    input,
    get svg() { return get('forest').innerHTML; },
    get results() { return JSON.parse(JSON.stringify(window._almLastMhPeto())); },
    edit(edge, value) {
      const element = input(edge);
      if (edge === 'log') element.checked = value;
      else element.value = String(value);
      element.dispatch('change');
    },
    select(value) { get('measure').value = value; get('measure').dispatch('change'); },
    rerun() { get('btn-run').dispatch('click'); },
    restore(value) { undo.restore({ src: source, measure: value }); },
    example() { get('btn-example').dispatch('click'); },
  };
}

function assertScale(h, measure, log) {
  const label = h.svg.match(/class="forest-axis-label"[^>]*>([^<]+)</)?.[1];
  assert.ok(label, 'Forest has an axis label');
  assert.equal(label.includes('(log scale)'), log, `${measure}: axis scale`);
  // Check actual coordinates too, so relabelling the axis cannot satisfy this test.
  const x = [...h.svg.matchAll(/<rect x="([^"]+)"/g)].map(match => Number(match[1]) + 3.5);
  assert.equal(x.length, 3);
  const effects = measure === 'OR' ? [1, 4 / 9, 8 / 3]
    : measure === 'RR' ? [1, 0.5, 2] : [0, -0.1, 0.2];
  const map = value => log ? Math.log(value) : value;
  const expected = (map(effects[2]) - map(effects[0])) / (map(effects[0]) - map(effects[1]));
  assert.ok(Math.abs((x[2] - x[0]) / (x[0] - x[1]) - expected) < 1e-10,
    `${measure}: study spacing uses the selected transform`);
}

function assertNull(h) {
  const nullX = Number(h.svg.match(/<line x1="([^"]+)"[^>]*stroke-dasharray="3 3"/)?.[1]);
  const studyX = Number(h.svg.match(/<rect x="([^"]+)"/)?.[1]) + 3.5;
  assert.ok(Number.isFinite(nullX) && Math.abs(nullX - studyX) < 1e-9,
    `No-effect line x=${nullX} aligns with equal-risk study x=${studyX}`);
}

for (const measure of ['OR', 'RR', 'RD']) {
  test(`control: ${measure} default forest scale and no-effect line`, () => {
    const h = harness(measure);
    assertScale(h, measure, measure !== 'RD');
    assertNull(h);
  });

  test(`${measure === 'RD' ? 'control' : 'plant P10-D3'}: ${measure} checkbox matches default scale`, () => {
    const h = harness(measure);
    assert.equal(h.input('log').checked, measure !== 'RD');
  });

  for (const edges of [['min'], ['max'], ['min', 'max']]) {
    test(`${measure === 'RD' ? 'control' : 'plant P10-D3'}: ${measure} bound-only edit (${edges.join('+')}) preserves scale`, () => {
      const h = harness(measure), before = h.svg;
      for (const edge of edges) h.edit(edge, edge === 'min' ? (measure === 'RD' ? -0.5 : 0.25) : 4);
      assert.notEqual(h.svg, before, 'Bounds change the plotted geometry');
      assertScale(h, measure, measure !== 'RD');
      assertNull(h);
    });
  }

  test(`control: ${measure} axis edits preserve all exported numerical results`, () => {
    const h = harness(measure), before = h.results;
    h.edit('min', measure === 'RD' ? -0.5 : 0.25);
    h.edit('max', 4);
    h.edit('log', false);
    assert.deepEqual(h.results, before);
  });
}

for (const measure of ['OR', 'RR']) {
  test(`plant P10-D3: ${measure} explicit linear scale keeps no-effect line at one`, () => {
    const h = harness(measure);
    h.edit('log', false);
    assertScale(h, measure, false);
    assertNull(h);
  });

  test(`control: ${measure} explicit log scale keeps no-effect line at one`, () => {
    const h = harness(measure);
    h.edit('log', true);
    assertScale(h, measure, true);
    assertNull(h);
  });
}

test('plant P10-D3: RD no-effect value is zero even with an explicit log override', () => {
  const h = harness('RD');
  h.edit('log', true);
  assertNull(h);
});

for (const from of ['OR', 'RR', 'RD']) {
  for (const to of ['OR', 'RR', 'RD'].filter(measure => measure !== from)) {
    test(`plant P10-D3: ${from} to ${to} clears measure-specific bounds and scale overrides`, () => {
      const h = harness(from);
      h.edit('min', from === 'RD' ? -0.5 : 0.25);
      h.edit('max', 4);
      h.edit('log', false);
      h.select(to);
      assert.equal(h.input('min').value, '');
      assert.equal(h.input('max').value, '');
      assert.equal(h.input('log').checked, to !== 'RD');
      assert.equal(h.svg, harness(to).svg, 'New measure uses its own default plot');
      assertScale(h, to, to !== 'RD');
      assertNull(h);
      // A subsequent edit must use the new measure's state inside the widget too.
      h.edit('max', 5);
      const fresh = harness(to);
      fresh.edit('max', 5);
      assert.equal(h.svg, fresh.svg);
      assertScale(h, to, to !== 'RD');
      assertNull(h);
    });
  }
}

test('plant P10-D3: restoring RD after a ratio log override restores linear defaults', () => {
  const h = harness('OR');
  h.edit('log', true);
  h.edit('min', 0.25);
  h.restore('RD');
  assert.equal(h.input('log').checked, false);
  assert.equal(h.input('min').value, '');
  assert.equal(h.svg, harness('RD').svg);
});

test('plant P10-D3: one-click example resets a previous RD override to OR defaults', () => {
  const h = harness('RD');
  h.edit('min', -0.5);
  h.example();
  assert.equal(h.input('log').checked, true);
  assert.equal(h.input('min').value, '');
  const fresh = harness('OR');
  fresh.example();
  assert.equal(h.svg, fresh.svg);
});

for (const measure of ['OR', 'RR', 'RD']) {
  test(`${measure === 'RD' ? 'control' : 'plant P10-D3'}: restored ${measure} URL state synchronizes controls`, () => {
    const h = harness('OR', { src: source, measure });
    assert.equal(h.input('log').checked, measure !== 'RD');
    h.edit('max', 4);
    assertScale(h, measure, measure !== 'RD');
    assertNull(h);
  });
}

test('control: same-measure rerun preserves explicitly chosen bounds and scale', () => {
  const h = harness('OR');
  h.edit('min', 0.25);
  h.edit('max', 4);
  h.edit('log', false);
  const before = h.svg;
  h.rerun();
  assert.equal(h.input('min').value, '0.25');
  assert.equal(h.input('max').value, '4');
  assert.equal(h.input('log').checked, false);
  assert.equal(h.svg, before);
});

test('control: measure changes preserve input references used by autosave', () => {
  const h = harness('OR');
  const inputs = ['min', 'max', 'log'].map(edge => h.input(edge));
  h.select('RD');
  for (const [index, edge] of ['min', 'max', 'log'].entries()) {
    assert.equal(h.input(edge), inputs[index]);
  }
  h.select('OR');
  for (const [index, edge] of ['min', 'max', 'log'].entries()) {
    assert.equal(h.input(edge), inputs[index]);
  }
});
