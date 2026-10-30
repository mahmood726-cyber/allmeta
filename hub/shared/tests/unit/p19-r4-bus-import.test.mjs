import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('component-nma/index.html');
const busCode = read('shared/ma-comparisons-v1.js');
const exportCode = read('hub/shared/results-export.js');
const formats = ['json', 'csv', 'md', 'report-md', 'report-txt'];

// Run the actual page scripts, bus reader/converter and export handlers in Node.
// Only DOM, storage, notifications and download destinations are test doubles.
// Blobs remain in memory; no browser, network, test output or cache files.
function harness() {
  const ids = new Map(), storage = new Map(), warnings = [], blobs = [];
  class Element {
    constructor() {
      this.style = {};
      this.children = [];
      this.listeners = new Map();
      this.value = '';
      this.textContent = '';
      this._html = '';
    }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      this._html = value;
      this.children = [];
      for (const [, action] of value.matchAll(/data-action="([^"]+)"/g)) {
        const button = new Element();
        button.action = action;
        this.appendChild(button);
      }
    }
    get innerHTML() { return this._html; }
    appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
    removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
    replaceChildren() { this.children = []; }
    insertBefore(node) { return this.appendChild(node); }
    insertAdjacentElement(_where, node) { this.parentNode.appendChild(node); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    dispatchEvent(event) {
      let result;
      for (const fn of this.listeners.get(event.type) || []) result = fn.call(this, event);
      return result;
    }
    click() { return this.dispatchEvent({ type: 'click' }); }
    querySelector(selector) {
      const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      return this.children.find(node => node.action === action) || null;
    }
  }
  const body = new Element(), head = new Element(), main = new Element();
  body.appendChild(main);
  // JavaScript assignments such as m.id="alm-export-mount" are not markup.
  // Precreating that element makes the real export installer return early.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const [, id] of markup.matchAll(/\bid="([^"]+)"/g)) {
    const element = new Element();
    element.id = id;
    main.appendChild(element);
  }
  ids.get('src').value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const meta = new Map([['main', main]]);
  for (const [selector, pattern] of [
    ['h1', /<h1>([\s\S]*?)<\/h1>/],
    ['header p', /<header>[\s\S]*?<p>([\s\S]*?)<\/p>/],
    ['footer', /<footer>([\s\S]*?)<\/footer>/],
  ]) {
    const element = new Element();
    element.textContent = html.match(pattern)[1].replace(/<[^>]+>/g, '');
    body.appendChild(element);
    meta.set(selector, element);
  }
  const document = {
    body, head, readyState: 'complete', title: 'Component NMA',
    getElementById: id => ids.get(id) || null,
    createElement: () => new Element(),
    querySelector: selector => selector.startsWith('#') ? ids.get(selector.slice(1)) : meta.get(selector) || null,
  };
  const context = vm.createContext({
    document, console, Blob,
    Event: class { constructor(type) { this.type = type; } },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    Toast: { show: (message, level) => warnings.push({ message, level }) },
    URL: {
      createObjectURL: blob => { blobs.push(blob); return 'blob:in-memory-test'; },
      revokeObjectURL() {},
    },
    setTimeout() {},
  });
  context.window = context;
  vm.runInContext(busCode, context, { filename: 'shared/ma-comparisons-v1.js' });
  vm.runInContext(exportCode, context, { filename: 'hub/shared/results-export.js' });
  for (const [index, script] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].entries()) {
    if (!/\bsrc=/.test(script[1]) && script[2].trim()) {
      vm.runInContext(script[2], context, { filename: `component-nma/index.html:inline-${index}` });
    }
  }
  assert.ok(ids.get('btn-bus-load'), 'real import handler is installed');
  assert.ok(ids.get('alm-export-mount'), 'real export handlers are installed');
  for (const format of formats) {
    assert.ok(ids.get('alm-export-mount').querySelector(`[data-action="${format}"]`),
      `real ${format} export control is installed`);
  }
  context.__almCnmaLoad('drug | control | 2 | 1\ndrug | control | 5 | 2');
  assert.ok(context._almLastCnma()?.components.drug, 'a previous analysis exists');
  for (const id of ['comp-body', 'int-body', 'forest']) assert.notEqual(ids.get(id).innerHTML, '');
  warnings.length = 0;
  return {
    context, warnings, ids,
    results: () => context._almLastCnma(),
    load(env) { storage.set('ma-comparisons-v1', JSON.stringify(env)); return ids.get('btn-bus-load').click(); },
    async download(format) {
      const before = blobs.length;
      await ids.get('alm-export-mount').querySelector(`[data-action="${format}"]`).click();
      assert.equal(blobs.length, before + 1, 'export click creates a Blob');
      return blobs.at(-1).text();
    },
  };
}

function envelope(studies, effectMeasure = 'OR') {
  return { _schema: 'ma-comparisons-v1', _savedAt: '2026-10-28T00:00:00.000Z', effectMeasure, studies };
}

function studies(measure = 'OR') {
  return [1, 2].map(i => ({
    id: `study-${i}`,
    arms: measure === 'MD' || measure === 'SMD' ? [
      { treatment: 'drug', mean: 3 + i, sd: 2, n: 30 },
      { treatment: 'control', mean: 2, sd: 3, n: 30 },
    ] : [
      { treatment: 'drug', events: 4 + i, n: 30 },
      { treatment: 'control', events: 10, n: 30 },
    ],
  }));
}

function assertCleared(h) {
  assert.equal(h.results(), null, 'previous analysis must be invalidated');
  for (const id of ['comp-body', 'int-body', 'forest']) assert.equal(h.ids.get(id).innerHTML, '', id);
}

function assertRefusal(h, pattern) {
  assert.ok(h.warnings.some(w => w.level === 'warn' && pattern.test(w.message)), 'visible refusal warning');
  assert.ok(h.warnings.every(w => !/^Loaded /.test(w.message)), 'no success notification');
}

test('P19-R4 plant: null study clears previous fit and rendered results', () => {
  const h = harness();
  try { h.load(envelope([null])); } catch { /* inspect state even if the old handler throws */ }
  assertCleared(h);
});

test('P19-R4 plant: null study is contained with a visible refusal', () => {
  const h = harness();
  assert.doesNotThrow(() => h.load(envelope([null])));
  assertRefusal(h, /invalid|cannot|unable|failed/i);
});

// Separate tests ensure a JSON failure cannot hide the other four exporters.
for (const format of formats) {
  test(`P19-R4 plant: null study removes stale results from ${format} download`, async () => {
    const h = harness();
    const before = await h.download(format);
    assert.match(before, /tau2/);
    assert.match(before, /components/);
    try { h.load(envelope([null])); } catch { /* still exercise the actual exporter */ }
    const after = await h.download(format);
    if (format === 'json') assert.deepEqual(JSON.parse(after), {});
    else {
      assert.doesNotMatch(after, /tau2|components\.drug|combinations\.drug/);
      if (format.startsWith('report-')) assert.match(after, /No results yet/);
    }
  });
}

const malformed = [
  ['primitive study', 7],
  ['array study', []],
  ['missing arms', { id: 'bad' }],
  ['non-array arms', { id: 'bad', arms: {} }],
  ['single arm', { id: 'bad', arms: [studies()[0].arms[0]] }],
  ['null arm', { id: 'bad', arms: [null, studies()[0].arms[1]] }],
  ['primitive arm', { id: 'bad', arms: [7, studies()[0].arms[1]] }],
  ['missing treatment', { id: 'bad', arms: [{ events: 5, n: 30 }, studies()[0].arms[1]] }],
  ['missing study id', { arms: studies()[0].arms }],
];
for (const [name, bad] of malformed) {
  test(`P19-R4 plant: ${name} refuses the whole import without a partial fit`, () => {
    const h = harness();
    assert.doesNotThrow(() => h.load(envelope([...studies(), bad])));
    assertCleared(h);
    assertRefusal(h, /invalid|cannot|unable|failed/i);
  });
}

for (const method of ['read', 'toContrasts']) {
  test(`P19-R4 plant: ${method} exception clears results and gives a refusal`, () => {
    const h = harness();
    h.context.MaComparisons[method] = () => { throw new Error('planted import failure'); };
    assert.doesNotThrow(() => h.load(envelope(studies())));
    assertCleared(h);
    assertRefusal(h, /invalid|cannot|unable|failed/i);
  });
}

test('P19-R4 plant: previous fit is cleared before the bus is read', () => {
  const h = harness();
  const readBus = h.context.MaComparisons.read;
  let stateAtRead;
  h.context.MaComparisons.read = () => { stateAtRead = h.results(); return readBus(); };
  h.load(envelope(studies()));
  assert.equal(stateAtRead, null);
  assert.ok(h.results()?.components.drug, 'valid import publishes a new fit');
});

for (const measure of ['OR', 'RR', 'MD', 'SMD']) {
  test(`P19-R4 control: valid ${measure} import still fits and exports`, async () => {
    const h = harness();
    const previous = JSON.stringify(h.results());
    assert.doesNotThrow(() => h.load(envelope(studies(measure), measure)));
    assert.ok(Number.isFinite(h.results()?.components.drug.est));
    assert.notEqual(JSON.stringify(h.results()), previous);
    assert.match(h.warnings.at(-1).message, /^Loaded 2 contrasts/);
    assert.deepEqual(JSON.parse(await h.download('json')), JSON.parse(JSON.stringify(h.results())));
  });
}

const multiArm = studies();
multiArm[0].arms.push({ treatment: 'exercise', events: 8, n: 30 });
const repeated = studies();
repeated[1].id = repeated[0].id;
for (const [name, env, pattern] of [
  ['empty bus', null, /empty/],
  ['empty studies', envelope([]), /empty/],
  ['multi-arm study', envelope(multiArm), /covariance/],
  ['repeated study', envelope(repeated), /covariance/],
  ['unsupported measure', envelope(studies(), 'HR'), /no contrasts/],
]) {
  test(`P19-R4 control: ${name} still clears results and refuses import`, async () => {
    const h = harness();
    assert.doesNotThrow(() => h.load(env));
    assertCleared(h);
    assertRefusal(h, pattern);
    assert.deepEqual(JSON.parse(await h.download('json')), {});
  });
}

test('P19-R4 control: valid import recovers after a malformed import', () => {
  const h = harness();
  try { h.load(envelope([null])); } catch { /* old behavior is covered by plants */ }
  h.load(envelope(studies()));
  assert.ok(Number.isFinite(h.results()?.components.drug.est));
  assert.match(h.warnings.at(-1).message, /^Loaded 2 contrasts/);
});
