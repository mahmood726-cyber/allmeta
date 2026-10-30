import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('gosh/index.html');
const controller = read('gosh/exact-ui.js');
const pageScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function parse(text)') && script.includes('window._almLastGosh'));
assert.ok(pageScript, 'load the real page analysis and export callbacks');
const source = Array.from({ length: 16 }, (_, i) => `${(i - 8) / 10}, ${0.2 + i / 100}, S${i + 1}`).join('\n');
const exactCount = 2 ** 16 - 1;
const engineContext = vm.createContext({});
vm.runInContext(read('gosh/exact-enum.js'), engineContext);
const results = new Map();

// Only DOM plumbing and worker delivery are simulated. Analysis, enumeration,
// lifecycle, exact rendering, and registered export callbacks use production code.
class Element {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.hidden = false;
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this._html = '';
    this._text = '';
  }
  set innerHTML(value) { this._html = String(value); this._text = ''; this.children = []; }
  get innerHTML() { return this._html || this._text; }
  set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
  get textContent() { return this._text || this._html; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._html = ''; this._text = ''; this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  matches(selectors) { return selectors.split(',').some(selector => selector.trim() === '#' + this.id); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
}

function harness(mode = 'exact') {
  const elements = new Map([...`${html}\n${controller}`.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element(match[1])]));
  const el = id => {
    assert.ok(elements.has(id), `known DOM element: ${id}`);
    return elements.get(id);
  };
  for (const id of ['exact-summary', 'exact-perstudy']) {
    el(id).caption = new Element();
    el(id).tHead = new Element();
    el(id).tBodies = [new Element()];
  }
  el('src').value = source;
  el('model').value = 'FE';
  el('n-sample').value = '20';
  el('enum-mode').value = mode;
  const documentEvents = new Element();
  const document = {
    getElementById: el,
    createElement: () => new Element(),
    querySelectorAll: selectors => [...elements.values()].filter(element => element.matches(selectors)),
    addEventListener: (...args) => documentEvents.addEventListener(...args),
  };
  let exportOptions, plotOptions;
  const urlState = Object.assign(() => {}, { read: () => null, isSuspended: () => true });
  const window = { alm: {
    csvUpload() {}, plotExport(options) { plotOptions = options; }, axisControls() {},
    resultsExport(options) { exportOptions = options; }, urlState, resetUndo() {}, tooltips() {},
  } };
  const workers = [];
  class Worker {
    constructor() { this.stopped = false; workers.push(this); }
    postMessage(payload) { this.payload = payload; }
    terminate() { this.stopped = true; }
    deliver(type, extra = {}) { this.onmessage({ data: { id: this.payload.id, type, ...extra } }); }
    complete() {
      const { te, se, model } = this.payload;
      const key = JSON.stringify([te, se, model]);
      if (!results.has(key)) results.set(key, engineContext.AlmGoshExactEngine.run(te, se, model));
      // Deliberately allow queued delivery even after terminate(), to test invalidation.
      this.deliver('done', { result: results.get(key) });
    }
  }
  const context = vm.createContext({ window, document, Worker, setTimeout, clearTimeout });
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context, { filename: 'analysis-lifecycle.js' });
  vm.runInContext(pageScript, context, { filename: 'gosh/index.html' });
  vm.runInContext(controller, context, { filename: 'gosh/exact-ui.js' });
  function emit(id, type) {
    const target = el(id), event = { type, target };
    for (const listener of documentEvents.listeners.get(type) || []) listener(event);
    for (const listener of target.listeners.get(type) || []) listener(event);
    if (typeof target['on' + type] === 'function') target['on' + type](event);
  }
  return {
    el, window, workers, emit,
    edit(id, value) { el(id).value = value; emit(id, 'input'); },
    run() { emit('btn-run', 'click'); },
    manual() { emit('exact-run', 'click'); },
    exported: () => exportOptions.getResults(),
    receipt: () => plotOptions.getReceiptInput(),
  };
}

function assertExact(h) {
  const result = h.exported();
  assert.equal(result._schema, 'gosh-results-v1');
  assert.equal(result.k, 16);
  assert.equal(result.model, 'FE');
  assert.equal(result.studies.length, 16);
  assert.equal(result.sampled, false);
  assert.equal(result.n_subsets, exactCount);
  assert.equal(result.enumeration_label, `all 2^16-1 subsets (exact): ${exactCount.toLocaleString()}`);
  assert.equal(h.el('m-n').textContent, exactCount.toLocaleString());
  assert.match(h.el('plot').innerHTML, /exact-cell/);
  assert.equal(h.el('exact-perstudy').tBodies[0].children.length, 16);
  assert.equal(h.receipt().results, result);
}

function assertInvalidated(h) {
  for (const id of ['exact-run', 'exact-progress', 'exact-cancel', 'exact-summary', 'exact-perstudy']) {
    assert.equal(h.el(id).hidden, true, `${id} is hidden`);
  }
  assert.equal(h.el('exact-summary').tBodies[0].children.length, 0);
  assert.equal(h.el('exact-perstudy').tBodies[0].children.length, 0);
  assert.equal(h.el('exact-perstudy').tHead.children.length, 0);
}

function assertRefused(h) {
  assert.equal(h.exported() === null, true, 'refused input stays unexportable');
  assert.equal(h.receipt(), null);
  assert.equal(h.el('plot').innerHTML, '');
  for (const id of ['m-n', 'm-est', 'm-i2']) assert.equal(h.el(id).textContent, '\u2014');
  assert.equal(h.window.AlmGoshExact.cached, null, 'refusal invalidates cached exact output');
  assertInvalidated(h);
}

test('P13-R2 plant: completed exact output cannot return after malformed input is refused', t => {
  const h = harness();
  h.workers[0].complete();
  assertExact(h);
  h.edit('src', source + '\nnot-a-number, 0.2, Broken');
  h.run();
  assert.match(h.el('input-error').textContent, /Line 17: effect/);
  assert.equal(h.exported(), null, 'page initially refuses the malformed input');
  h.manual();
  t.diagnostic(JSON.stringify({ manualButtonVisible: !h.el('exact-run').hidden,
    count: h.exported()?.n_subsets, label: h.exported()?.enumeration_label }));
  assertRefused(h);
});

test('P13-R2 plant: refusal without an input event invalidates a completed cache', () => {
  const h = harness();
  h.workers[0].complete();
  assertExact(h);
  h.el('src').value = 'bad, 0.2';
  h.run();
  assert.equal(h.exported(), null);
  h.manual();
  assertRefused(h);
});

for (const [name, rows] of [['empty', []], ['too few studies', [{ yi: 0.1, sei: 0.2 }]]]) {
  test(`P13-R2 plant: ${name} programmatic load cancels pending exact work at refusal`, t => {
    const h = harness(), worker = h.workers[0];
    assert.equal(worker.stopped, false);
    assert.equal(h.exported().sampled, true);
    h.window.__almGoshLoad(rows);
    assert.match(h.el('input-error').textContent, /at least 3 valid studies/);
    assert.equal(h.exported(), null, 'page initially refuses the loaded input');
    const stoppedAtRefusal = worker.stopped;
    worker.deliver('progress', { fraction: 0.5 });
    worker.complete();
    h.manual();
    t.diagnostic(JSON.stringify({ stoppedAtRefusal, count: h.exported()?.n_subsets,
      label: h.exported()?.enumeration_label }));
    assertRefused(h);
    assert.equal(stoppedAtRefusal, true, 'terminate at refusal, not on stale completion');
  });
}

for (const [id, value] of [['src', source.replace('S1', 'Edited')], ['model', 'DL'],
  ['n-sample', '21'], ['enum-mode', 'sample']]) {
  test(`P13-R2 plant: editing ${id} after completion invalidates the pending manual request`, () => {
    const h = harness();
    h.workers[0].complete();
    assertExact(h);
    h.edit(id, value);
    const before = h.exported();
    h.manual();
    assert.equal(h.exported(), before, 'manual action cannot reapply results after an edit');
    assert.equal(h.workers.length, 1, 'manual action cannot restart stale work');
    assertInvalidated(h);
    assert.match(h.el('exact-status').textContent, /Inputs changed/);
  });
}

test('P13-R2 plant: editing a sampling preview invalidates its pending manual request', () => {
  const h = harness('sample');
  assert.equal(h.workers.length, 0);
  assert.equal(h.exported().sampled, true);
  h.edit('src', source.replace('S1', 'Edited'));
  h.manual();
  assert.equal(h.workers.length, 0, 'no worker may start for the previous inputs');
  assertInvalidated(h);
});

test('P13-R2 control: active-worker edit cancels and ignores late completion', () => {
  const h = harness(), worker = h.workers[0], preview = h.exported();
  assert.equal(worker.stopped, false);
  h.edit('src', source.replace('S1', 'Edited'));
  assert.equal(worker.stopped, true);
  worker.complete();
  h.manual();
  assert.equal(h.exported(), preview);
  assert.equal(h.workers.length, 1);
  assertInvalidated(h);
});

test('P13-R2 control: unchanged inputs support completion and manual cache reuse', () => {
  const h = harness();
  h.workers[0].complete();
  assertExact(h);
  const exact = h.exported().exact;
  h.manual();
  assertExact(h);
  assert.equal(h.exported().exact, exact);
  assert.equal(h.workers.length, 1, 'unchanged inputs reuse the completed cache');
  assert.equal(h.el('exact-run').hidden, false);
});

test('P13-R2 control: sampling preview can run exact manually and cancel safely', () => {
  const h = harness('sample');
  assert.equal(h.workers.length, 0);
  const preview = h.exported();
  h.manual();
  assert.equal(h.workers.length, 1);
  h.emit('exact-cancel', 'click');
  assert.equal(h.workers[0].stopped, true);
  h.workers[0].complete();
  assert.equal(h.exported(), preview);
  h.manual();
  assert.equal(h.workers.length, 2);
  h.workers[1].complete();
  assertExact(h);
});

test('P13-R2 control: refused input recovers on a fresh valid programmatic load', () => {
  const h = harness();
  h.workers[0].complete();
  h.el('src').value = '';
  h.run();
  assert.equal(h.exported(), null);
  h.window.__almGoshLoad([{ yi: 0.1, sei: 0.2 }, { yi: 0.2, sei: 0.3 }, { yi: 0.3, sei: 0.4 }]);
  assert.equal(h.el('input-error').textContent, '');
  assert.equal(h.exported().k, 3);
  assert.equal(h.exported().n_subsets, 2 ** 3 - 1);
  assert.equal(h.exported().sampled, false);
  assertInvalidated(h);
});
