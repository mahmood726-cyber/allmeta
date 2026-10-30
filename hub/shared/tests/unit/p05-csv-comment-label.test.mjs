import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('heterogeneity/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.find(s => s.includes('const LS_KEY = "heterogeneity-v1"'));
const adapter = scripts.find(s => s.includes('window.__almLoad = function'));
assert.ok(main && adapter, 'load the real app and CSV adapter script blocks');

// A small in-memory DOM runs the real CSV paste handler, app rendering, numerical
// engines and Undo module. Unrelated layout/export/share widgets are inert.
function element() {
  const listeners = new Map(), children = new Map(), classes = new Set();
  let value = '';
  return {
    assignments: [], attributes: {}, innerHTML: '', textContent: '', style: {},
    get value() { return value; },
    set value(next) { value = String(next); this.assignments.push(value); },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setAttribute(name, next) { this.attributes[name] = String(next); },
    appendChild() {},
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) || []) fn({ ...event, target: this });
    },
    click() { this.dispatchEvent({ type: 'click' }); }
  };
}

function harness() {
  const elements = new Map(), storage = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  get('f-tau2').value = 'pm';
  const document = {
    getElementById: get,
    querySelector: selector => get(selector.slice(1)),
    querySelectorAll: () => [],
    createElement: element,
    head: element()
  };
  const noop = () => {};
  const urlState = Object.assign(noop.bind(null), { read: () => ({}), write: noop });
  const window = { alm: {
    analysisLifecycle: render => render,
    plotExport: noop, axisControls: noop, resultsExport: noop, tooltips: noop, urlState
  } };
  const context = vm.createContext({ window, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    Event: class { constructor(type) { this.type = type; } }
  });
  for (const path of ['shared/ma-core.js', 'shared/heterogeneity-ci.js',
    'hub/shared/csv-upload.js', 'hub/shared/reset-undo.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(main, context, { filename: 'heterogeneity/index.html:main' });
  vm.runInContext(adapter, context, { filename: 'heterogeneity/index.html:adapter' });
  return {
    window, get,
    result: () => JSON.parse(JSON.stringify(window.__almResults())),
    input(text) {
      get('f-data').value = text;
      get('f-data').dispatchEvent({ type: 'input' });
    },
    csv(text) {
      const mount = get('alm-csv-mount');
      mount.querySelector('textarea').value = text;
      mount.querySelector('[data-action="parse-paste"]').click();
    },
    undo() { get('alm-undo-mount').querySelector('button[data-action="undo"]').click(); }
  };
}

const priorInput = 'Before A, 1, 1\nBefore B, 2, 1\nBefore C, 3, 1';
const ordinaryCSV = 'study,yi,vi\nA,0,1\nB,0,1\nOutlier,4,1';

function assertRejected(h, before, row, t) {
  const actual = h.result();
  t.diagnostic(`after import: k=${actual.k}, mu=${actual.mu ?? 'absent'}`);
  assert.equal(actual.k, 0, `reject the whole CSV instead of silently pooling k=${actual.k}, mu=${actual.mu}`);
  assert.equal(h.window._almLastFE(), null);
  assert.deepEqual(actual.studies, []);
  assert.equal(Object.hasOwn(actual, 'mu'), false);
  assert.equal(h.get('f-data').value, '');
  assert.deepEqual(h.get('f-data').assignments, [''], 'unsafe native text must never be committed');
  assert.equal(h.get('f-data').attributes['aria-invalid'], 'true');
  assert.equal(h.get('stats-wrap').innerHTML, '');
  assert.equal(h.get('loo-table').innerHTML, '');
  assert.doesNotMatch(h.get('svg-host').innerHTML, /<circle\b/);
  assert.ok(h.get('warn-banner').classList.contains('is-visible'));
  assert.match(h.get('warn-banner').innerHTML, new RegExp('CSV rejected: CSV row ' + row + ':'));
  assert.match(h.get('warn-banner').innerHTML, /label.*#.*comment/i);
  h.undo();
  assert.equal(h.get('f-data').value, priorInput);
  assert.deepEqual(h.result(), before, 'Undo must restore the complete previous analysis');
}

for (const [name, rows, row] of [
  ['quoted outlier last', ['A,0,1', 'B,0,1', '"#Outlier",4,1'], 3],
  ['unquoted outlier first', ['#Outlier,4,1', 'A,0,1', 'B,0,1'], 1],
  ['space-padded quoted outlier middle', ['A,0,1', '"   #Outlier  ",4,1', 'B,0,1'], 2],
  ['all labels are comments', ['"#A",0,1', '"#B",0,1', '"#Outlier",4,1'], 1]
]) {
  test('plant P05-R2: reject CSV comment labels atomically - ' + name, t => {
    const h = harness();
    h.input(priorInput);
    const before = h.result();
    assert.equal(before.k, 3);
    h.get('f-data').assignments.length = 0;
    h.csv('study,yi,vi\n' + rows.join('\n'));
    assertRejected(h, before, row, t);
  });
}

test('plant P05-R2: direct adapter rejects a whitespace-prefixed hash label', t => {
  const h = harness();
  h.input(priorInput);
  const before = h.result();
  h.get('f-data').assignments.length = 0;
  h.window.__almLoad([{ study: 'A', yi: 0, vi: 1 }, { study: 'B', yi: 0, vi: 1 },
    { study: ' \u00a0#Outlier', yi: 4, vi: 1 }]);
  assertRejected(h, before, 3, t);
});

test('control P05-R2: ordinary CSV keeps all three studies and the equal-weight mean', () => {
  const h = harness();
  h.csv(ordinaryCSV);
  const out = h.result();
  assert.equal(out.k, 3);
  assert.deepEqual(out.studies.map(s => s.label), ['A', 'B', 'Outlier']);
  assert.deepEqual(out.studies.map(s => s.est), [0, 0, 4]);
  // Analytic equal-weight mean, not an R-parity reference.
  assert.ok(Math.abs(out.mu - (0 + 0 + 4) / 3) < 1e-12);
  assert.equal(h.get('warn-banner').innerHTML, '');
  assert.equal((h.get('svg-host').innerHTML.match(/<circle\b/g) || []).length, 3);
});

test('control P05-R2: embedded hash and quoted comma labels remain accepted', () => {
  const h = harness();
  h.csv('study,yi,vi\nTrial #1,0,1\n"Study, B",0,1\nOutlier,4,1');
  const out = h.result();
  assert.equal(out.k, 3);
  assert.deepEqual(out.studies.map(s => s.label), ['Trial #1', 'Study, B', 'Outlier']);
  assert.ok(Math.abs(out.mu - 4 / 3) < 1e-12);
});

test('control P05-R2: native comments and a recognised header remain ignored', () => {
  const h = harness();
  h.input('# source\n  # metadata\nlabel,estimate,se\nA,0,1\nB,0,1\nOutlier,4,1');
  assert.equal(h.result().k, 3);
  assert.ok(Math.abs(h.result().mu - 4 / 3) < 1e-12);
  assert.equal(h.get('warn-banner').innerHTML, '');
});

test('control P05-R2: invalid variance still rejects the full CSV and Undo recovers', () => {
  const h = harness();
  h.input(priorInput);
  const before = h.result();
  h.csv('study,yi,vi\nA,0,1\nB,0,-1\nOutlier,4,1');
  assert.equal(h.result().k, 0);
  assert.match(h.get('warn-banner').innerHTML, /CSV rejected/);
  h.undo();
  assert.deepEqual(h.result(), before);
});
