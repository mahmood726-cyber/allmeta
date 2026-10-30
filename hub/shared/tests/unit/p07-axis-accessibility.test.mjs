import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../axis-controls.js', import.meta.url), 'utf8');

// Small DOM contract harness: execute the production component and its change
// listeners without a browser. This does not simulate screen-reader speech.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.checked = false;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'checked') this.checked = true;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { this.children.push(child); return child; }
  get firstChild() { return this.children[0] ?? null; }
  set innerHTML(html) {
    this.children = [];
    // Only the component's root div and input elements need DOM behaviour.
    const tags = html.match(/<input\b[^>]*>/g) || html.match(/<div\b[^>]*>/g) || [];
    for (const tag of tags) {
      const child = new Element(tag.startsWith('<input') ? 'input' : 'div');
      for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(match[1], match[2]);
      if (/\schecked(?:\s|>)/.test(tag)) child.setAttribute('checked', '');
      this.appendChild(child);
    }
  }
  querySelectorAll(selector) {
    const tag = selector.match(/^[\w-]+/)?.[0];
    const attrs = [...selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
    const matches = el => (!tag || el.tagName === tag) && attrs.every(([, name, value]) =>
      value === undefined ? el.getAttribute(name) !== null : el.getAttribute(name) === value);
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    for (const callback of this.listeners.get(event.type) || []) callback(event);
  }
}

function harness(axes = [{ key: 'x', label: 'X axis', range: [null, null], log: false }]) {
  const target = new Element('div');
  const document = { head: new Element('head'), createElement: tag => new Element(tag) };
  const context = vm.createContext({ window: {}, document, console });
  vm.runInContext(source, context, { filename: 'axis-controls.js' });
  const emitted = [];
  context.window.alm.axisControls({ target, axes, onChange: state => emitted.push(JSON.parse(JSON.stringify(state))) });
  const field = (key, edge) => target.querySelectorAll('input').find(input =>
    input.dataset.axis === key && input.dataset.edge === edge);
  return {
    target, emitted, field,
    error: target.querySelector('[data-error]'),
    change(key, edge, value) {
      const input = field(key, edge);
      if (edge === 'log') input.checked = value;
      else input.value = String(value);
      input.dispatchEvent({ type: 'change' });
    }
  };
}

function reject(h, max = -1) {
  h.change('x', 'min', 0);
  h.change('x', 'max', 2);
  h.change('x', 'max', max);
}

for (const [name, max] of [['reversed', -1], ['equal', 0]]) {
  test(`P07-R6 plant: ${name} bounds update a pre-existing live error region`, () => {
    const h = harness();
    const live = h.error.getAttribute('aria-live');
    const role = h.error.getAttribute('role');
    assert.ok(['polite', 'assertive'].includes(live) || ['alert', 'status'].includes(role),
      'The error region must support announcements before its text changes');
    assert.equal(h.error.textContent, '');
    reject(h, max);
    assert.equal(h.target.querySelector('[data-error]'), h.error);
    assert.equal(h.error.textContent, 'X axis min must be < max');
  });

  test(`P07-R6 plant: ${name} bounds mark both range fields invalid`, () => {
    const h = harness();
    reject(h, max);
    for (const edge of ['min', 'max']) assert.equal(h.field('x', edge).getAttribute('aria-invalid'), 'true');
  });

  test(`P07-R6 control: ${name} bounds keep the visible explanation and last applied plot state`, () => {
    const h = harness();
    h.change('x', 'min', 0);
    h.change('x', 'max', 2);
    const before = JSON.stringify(h.emitted);
    h.change('x', 'max', max);
    assert.equal(h.error.textContent, 'X axis min must be < max');
    assert.equal(JSON.stringify(h.emitted), before, 'A rejected range must not invoke the plot callback');
    assert.deepEqual(h.emitted.at(-1), { ticks: 'auto', x: [0, 2], xLog: false });
  });
}

test('P07-R6 control: automatic, one-sided and valid bounds and log toggles still emit', () => {
  const h = harness();
  assert.equal(h.error.textContent, '');
  assert.equal(h.emitted.length, 0);
  for (const edge of ['min', 'max', 'log']) assert.notEqual(h.field('x', edge).getAttribute('aria-invalid'), 'true');
  h.change('x', 'min', -2);
  h.change('x', 'max', 4);
  h.change('x', 'log', true);
  h.change('x', 'min', '');
  h.change('x', 'max', '');
  assert.deepEqual(h.emitted, [
    { ticks: 'auto', x: [-2, null], xLog: false },
    { ticks: 'auto', x: [-2, 4], xLog: false },
    { ticks: 'auto', x: [-2, 4], xLog: true },
    { ticks: 'auto', x: [null, 4], xLog: true },
    { ticks: 'auto', x: [null, null], xLog: true }
  ]);
  assert.equal(h.error.textContent, '');
  for (const edge of ['min', 'max', 'log']) assert.notEqual(h.field('x', edge).getAttribute('aria-invalid'), 'true');
});

for (const [name, edge, value] of [['correcting max', 'max', 3], ['clearing min', 'min', '']]) {
  test(`P07-R6 plant: ${name} clears the invalid state and resumes plot updates`, () => {
    const h = harness();
    reject(h);
    assert.equal(h.field('x', 'min').getAttribute('aria-invalid'), 'true');
    const before = h.emitted.length;
    h.change('x', edge, value);
    assert.equal(h.error.textContent, '');
    for (const bound of ['min', 'max']) assert.notEqual(h.field('x', bound).getAttribute('aria-invalid'), 'true');
    assert.equal(h.emitted.length, before + 1);
    assert.deepEqual(h.emitted.at(-1).x, edge === 'max' ? [0, 3] : [null, -1]);
  });
}

test('P07-R6 control: rejecting X does not mark a valid Y axis or log checkbox invalid', () => {
  const h = harness([
    { key: 'x', label: 'X axis', range: [0, 2] },
    { key: 'y', label: 'Y axis', range: [0, 4] }
  ]);
  h.change('x', 'max', -1);
  for (const edge of ['min', 'max', 'log']) assert.notEqual(h.field('y', edge).getAttribute('aria-invalid'), 'true');
  assert.notEqual(h.field('x', 'log').getAttribute('aria-invalid'), 'true');
  assert.equal(h.emitted.length, 0);
});

test('P07-R6 plant: all rejected axes retain accurate invalid states as each is corrected', () => {
  const h = harness([
    { key: 'x', label: 'X axis', range: [0, 2] },
    { key: 'y', label: 'Y axis', range: [0, 4] }
  ]);
  h.change('x', 'max', -1);
  h.change('y', 'max', -2);
  for (const key of ['x', 'y']) for (const edge of ['min', 'max']) {
    assert.equal(h.field(key, edge).getAttribute('aria-invalid'), 'true');
  }
  h.change('x', 'max', 2);
  assert.equal(h.error.textContent, 'Y axis min must be < max');
  for (const edge of ['min', 'max']) {
    assert.notEqual(h.field('x', edge).getAttribute('aria-invalid'), 'true');
    assert.equal(h.field('y', edge).getAttribute('aria-invalid'), 'true');
  }
  assert.equal(h.emitted.length, 0);
  h.change('y', 'max', 4);
  assert.equal(h.error.textContent, '');
  for (const key of ['x', 'y']) for (const edge of ['min', 'max']) {
    assert.notEqual(h.field(key, edge).getAttribute('aria-invalid'), 'true');
  }
  assert.deepEqual(h.emitted, [{ ticks: 'auto', x: [0, 2], xLog: false, y: [0, 4], yLog: false }]);
});
