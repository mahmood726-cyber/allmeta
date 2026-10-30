import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const engineSource = read('shared/nma-multiarm-v1.js');
const lifecycleSource = read('hub/shared/analysis-lifecycle.js');
const pageSource = [...read('nma/index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('const LS_KEY = "nma-v1"'));
assert.ok(pageSource, 'execute the actual NMA inline application');

function engine() {
  const context = createContext({});
  runInContext(engineSource, context);
  return context.AlmNmaMultiarm;
}

function rows(t1 = 'a', t2 = 'z') {
  return [
    { study: 'S1', t1, t2, est: 0.2, se: 0.1 },
    { study: 'S2', t1, t2, est: 0.4, se: 0.2 },
  ];
}
const csv = (t1 = 'a', t2 = 'z') => rows(t1, t2).map(r =>
  [r.study, r.t1, r.t2, r.est, r.se].join(',')).join('\n');

test('P04-R5 control: ordinary labels retain inverse-variance pooling and league orientation', () => {
  const a = engine().analyse(rows());
  assert.equal(a.ok, true);
  const pooled = (0.2 / 0.1 ** 2 + 0.4 / 0.2 ** 2) / (1 / 0.1 ** 2 + 1 / 0.2 ** 2);
  assert.ok(Math.abs(a.common.TE[1][0] - pooled) < 1e-14);
  assert.equal(a.common.TE[0][1], -a.common.TE[1][0]);
});

for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
  test(`P04-R5 defect: reference named ${name} preserves every numerical analysis field`, () => {
    const E = engine();
    const ordinary = E.analyse(rows());
    const reserved = E.analyse(rows(name));
    assert.equal(reserved.ok, true);
    assert.deepEqual(Array.from(reserved.treatments), [name, 'z']);
    // Renaming is an exact invariant, not an R reference or a new tolerance.
    const { treatments: ignoredOrdinary, ...expected } = ordinary;
    const { treatments: ignoredReserved, ...actual } = reserved;
    assert.deepEqual(actual, expected);
  });
}

test('P04-R5 control: constructor as a nonreference treatment already works', () => {
  const E = engine();
  const { treatments: ignoredOrdinary, ...expected } = E.analyse(rows());
  const { treatments: ignoredReserved, ...actual } = E.analyse(rows('a', 'constructor'));
  assert.deepEqual(actual, expected);
});

// Minimal DOM double: production parser, renderer, engine, lifecycle and export handlers
// execute unchanged. Only browser I/O (DOM, storage, downloads) is replaced.
function page() {
  let downloads = 0;
  const captures = new Map();
  class Element {
    constructor(id = '', tag = 'div') {
      this.id = id;
      this.tagName = tag.toUpperCase();
      this.value = '';
      this.hidden = true;
      this.children = [];
      this.listeners = new Map();
      this.html = '';
      this.classes = new Set();
      this.classList = {
        add: name => this.classes.add(name), remove: name => this.classes.delete(name),
        contains: name => this.classes.has(name),
      };
    }
    set innerHTML(value) { this.html = String(value); this.children = []; }
    get innerHTML() { return this.html + this.children.map(child => child.innerHTML).join(''); }
    set textContent(value) { this.innerHTML = value; }
    get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); }
    appendChild(child) {
      this.children.push(child);
      if (this.tagName === 'SELECT' && this.children.length === 1) this.value = child.value;
      return child;
    }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    matches(selector) { return selector === '[id^="f-"]' && this.id.startsWith('f-'); }
    dispatch(type) {
      const event = { target: this };
      for (const fn of captures.get(type) || []) fn(event);
      for (const fn of this.listeners.get(type) || []) fn.call(this, event);
    }
    click() { if (this.tagName === 'A') downloads++; this.dispatch('click'); }
  }
  const elements = new Map();
  for (const match of read('nma/index.html').matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[2], new Element(match[2], match[1]));
  }
  const get = id => {
    assert.ok(elements.has(id), `known DOM id ${id}`);
    return elements.get(id);
  };
  const document = {
    getElementById: get,
    querySelectorAll: selector => [...elements.values()].filter(el => el.matches(selector)),
    createElement: tag => new Element('', tag),
    body: new Element('body', 'body'),
    addEventListener(type, fn, capture) {
      assert.equal(capture, true);
      if (!captures.has(type)) captures.set(type, []);
      captures.get(type).push(fn);
    },
  };
  const state = { data: csv(), ref: 'a', model: 'fe', ci: 'classic', dir: 'desirable', scale: 'log', title: 'Control' };
  const window = { alm: { plotExport() {} } };
  const context = createContext({ window, document, Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    setTimeout: fn => fn(),
    localStorage: { getItem: () => JSON.stringify(state), setItem() {} },
  });
  runInContext(engineSource, context, { filename: 'shared/nma-multiarm-v1.js' });
  runInContext(lifecycleSource, context, { filename: 'hub/shared/analysis-lifecycle.js' });
  runInContext(pageSource, context, { filename: 'nma/index.html:inline' });
  return { get, window, run: () => get('btn-run').click(),
    input(text) { get('f-data').value = text; get('f-data').dispatch('input'); },
    exportJson: () => get('btn-json').click(), get downloads() { return downloads; } };
}

const outputIds = ['stats-wrap', 'svg-host', 'sucra-host', 'league-host', 'het-host', 'ref-host'];
function assertSuccessful(p) {
  for (const id of outputIds) assert.notEqual(p.get(id).innerHTML, '', id);
  assert.equal(p.get('analysis-status').hidden, false);
  assert.equal(p.get('analysis-stale').hidden, true);
}
function assertCleared(p) {
  for (const id of outputIds) assert.equal(p.get(id).innerHTML, '', id);
  assert.equal(p.get('analysis-status').hidden, true);
  assert.equal(p.get('analysis-stale').hidden, true);
  assert.equal(p.get('warn-banner').classList.contains('is-visible'), true);
}

test('P04-R5 defect: constructor input replaces the previous league and remains exportable', () => {
  const p = page();
  assertSuccessful(p);
  const previous = p.get('league-host').innerHTML;
  assert.match(previous, /0\.240/);
  assert.doesNotThrow(() => p.input(csv('constructor')));
  assertSuccessful(p);
  assert.notEqual(p.get('league-host').innerHTML, previous);
  assert.match(p.get('league-host').innerHTML, /constructor/);
  assert.match(p.get('league-host').innerHTML, /0\.240/);
  assert.equal(p.get('warn-banner').textContent, '');
  p.exportJson();
  assert.equal(p.downloads, 1);
});

test('P04-R5 control: malformed input clears every output and blocks JSON export', () => {
  const p = page();
  assertSuccessful(p);
  p.input('S1,a,z,not-a-number,0.1');
  assertCleared(p);
  assert.match(p.get('warn-banner').textContent, /estimate must be a finite number/);
  p.exportJson();
  assert.equal(p.downloads, 0);
  assert.match(p.get('warn-banner').textContent, /No valid results to export/);
});

for (const phase of ['analysis', 'rendering']) {
  test(`P04-R5 defect: ${phase} exception clears results, diagnoses, blocks export, then recovers`, () => {
    const p = page();
    assertSuccessful(p);
    const E = p.window.AlmNmaMultiarm;
    const original = E.analyse;
    const message = `Injected <${phase}> failure`;
    // Early failure leaves the old _lastAnalysis; late failure occurs after the
    // new analysis and heterogeneity table have been assigned by the real renderer.
    E.analyse = phase === 'analysis'
      ? () => { throw new Error(message); }
      : (...args) => {
        const a = original(...args);
        Object.defineProperty(a, 'pscore', { get() { throw new Error(message); } });
        return a;
      };
    // Catch here so old-code failures describe the stale outputs, not just a throw.
    let escaped;
    try { p.run(); } catch (error) { escaped = error; }
    assertCleared(p);
    assert.equal(escaped, undefined, 'renderer handles the exception');
    assert.match(p.get('warn-banner').textContent, /Analysis could not be completed/);
    assert.ok(p.get('warn-banner').innerHTML.includes(`&lt;${phase}&gt;`), 'diagnostic is escaped');
    assert.doesNotThrow(() => p.exportJson());
    assert.equal(p.downloads, 0);
    assert.match(p.get('warn-banner').textContent, /No valid results to export/);
    assertCleared(p);
    E.analyse = original;
    p.run();
    assertSuccessful(p);
    assert.equal(p.get('warn-banner').textContent, '');
    p.exportJson();
    assert.equal(p.downloads, 1);
  });
}

test('P04-R5 control: ordinary repeated runs keep results and JSON export available', () => {
  const p = page();
  const previous = p.get('league-host').innerHTML;
  p.run();
  assertSuccessful(p);
  assert.equal(p.get('league-host').innerHTML, previous);
  p.exportJson();
  assert.equal(p.downloads, 1);
});
