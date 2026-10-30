import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const appSource = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(([, source]) => source.includes('function parseTable(text)'))?.[1];
assert.ok(appSource, 'load the real proportion-ma engine and export wiring');

const validInput = '1,10,Study A\n4,20,Study B';
const refusedInput = '1,10,Only study';
const formats = {
  csv: ['propma-results.csv', 'text/csv'],
  md: ['propma-results.md', 'text/markdown'],
  'report-md': ['propma-results-report.md', 'text/markdown'],
  'report-txt': ['propma-results-report.txt', 'text/plain'],
  json: ['propma-results.json', 'application/json'],
};

// Browser-free DOM/download boundary only. Run the production parser, fitting
// core, lifecycle, app initialization and result-export click handlers unchanged.
function harness(initialInput = validInput) {
  const downloads = [];
  const blobs = new Map();
  let nextBlob = 0;
  function element(id = '') {
    const listeners = new Map();
    const children = new Map();
    let markup = '';
    return {
      id, value: '', textContent: '', hidden: true, style: {},
      setAttribute(key, value) { this[key] = value; },
      appendChild() {}, removeChild() {},
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      async click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        for (const listener of listeners.get('click') || []) await listener();
      },
      set innerHTML(value) {
        markup = value;
        children.clear();
        for (const [, action] of value.matchAll(/data-action="([^"]+)"/g)) {
          children.set(`[data-action="${action}"]`, element());
        }
      },
      get innerHTML() { return markup; },
      querySelector(selector) { return children.get(selector) || null; },
    };
  }
  const ids = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, element(id)]));
  const get = id => {
    assert.ok(ids.has(id), `element #${id} exists in the real page`);
    return ids.get(id);
  };
  get('src').value = initialInput;
  get('trans').value = 'logit';
  get('tau-est').value = 'PM';
  const document = {
    title: 'Proportion MA', head: element(), body: element(),
    getElementById: get,
    createElement: () => element(),
    addEventListener() {},
    querySelector(selector) { return selector.startsWith('#') ? get(selector.slice(1)) : null; },
    querySelectorAll(selector) { return selector.split(',').map(id => get(id.trim().slice(1))); },
  };
  const noop = () => {};
  const context = vm.createContext({
    document, console, Blob,
    URL: {
      createObjectURL(blob) { const url = `blob:p09-${++nextBlob}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    setTimeout(fn) { fn(); },
    window: { alm: {
      csvUpload: noop, plotExport: noop, axisControls: noop, tooltips: noop,
      urlState: Object.assign(noop, { read: () => ({}), write: noop }),
      resetUndo: Object.assign(noop, { snapshot: noop }),
    } },
  });
  for (const path of ['shared/ma-core.js', 'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(appSource, context, { filename: 'proportion-ma/index.html' });
  return {
    results: () => context.window._almLastPropMA(),
    async run(input) {
      get('src').value = input;
      await get('btn-run').click();
    },
    assertRefused() {
      assert.equal(this.results(), null, 'a refusal must clear the actual fit');
      assert.match(get('res-body').innerHTML, /Need at least 2 studies/);
      assert.equal(get('analysis-status').hidden, true, 'a refusal is not a successful fit');
    },
    async download(action) {
      const button = get('alm-export-mount').querySelector(`[data-action="${action}"]`);
      assert.ok(button, `the production exporter mounted ${action}`);
      const before = downloads.length;
      await button.click();
      assert.equal(downloads.length, before + 1, 'one download per click');
      const { name, blob } = downloads.at(-1);
      assert.equal(name, formats[action][0]);
      assert.equal(blob.type, formats[action][1]);
      return blob.text();
    },
  };
}

function assertNoFit(text, action) {
  assert.match(text, /no (?:fitted )?results/i, 'explicit no-fit response');
  assert.match(text, /at least 2 (?:valid )?studies/i, 'explain how to obtain a fit');
  assert.doesNotMatch(text, /propma-results-v1|poolP|mu_re|seRE|NaN|undefined/,
    'do not export stale fitted statistics or an invalid result');
  if (action === 'json') {
    const data = JSON.parse(text);
    assert.equal(typeof data.status, 'string');
    assert.equal(Object.hasOwn(data, '_schema'), false);
  }
}

function assertFit(text, action, results) {
  assert.doesNotMatch(text, /no (?:fitted )?results/i);
  const expected = JSON.parse(JSON.stringify(results));
  assert.equal(expected.k, 2);
  assert.equal(expected._schema, 'propma-results-v1');
  assert.ok(Number.isFinite(expected.poolP));
  if (action === 'json') {
    assert.deepEqual(JSON.parse(text), expected, 'all exported fit fields are preserved');
    return;
  }
  let pairs;
  if (action === 'csv') {
    assert.match(text, /^key,value\r\n/);
    pairs = text.split('\r\n').slice(1).map(line => line.split(','));
  } else if (action === 'report-txt') {
    assert.match(text, /\nMETHODS\n/);
    pairs = text.split('\nRESULTS\n\n')[1].split('\n').filter(Boolean).map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon), line.slice(colon + 1).trim()];
    });
    delete expected._schema; // Plain reports intentionally omit the schema field.
  } else {
    if (action === 'report-md') assert.match(text, /## Methods[\s\S]*## Results/);
    pairs = [...text.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/gm)]
      .map(([, key, value]) => [key.trim(), value.trim()])
      .filter(([key]) => key !== 'key' && !/^-+$/.test(key));
  }
  assert.deepEqual(Object.fromEntries(pairs), Object.fromEntries(Object.entries(expected)
    .map(([key, value]) => [key, value == null ? '' : String(value)])),
  'all exported fit fields are preserved');
}

for (const action of Object.keys(formats)) {
  test(`plant P09-R1: ${action} gives an explicit no-fit export after one-study refusal`, async () => {
    const h = harness();
    assert.equal(h.results().k, 2, 'start with a genuine earlier fit');
    await h.run(refusedInput);
    h.assertRefused();
    assertNoFit(await h.download(action), action);
    h.assertRefused();
  });

  test(`plant P09-R1: ${action} gives an explicit no-fit export on initial one-study input`, async () => {
    const h = harness(refusedInput);
    h.assertRefused();
    assertNoFit(await h.download(action), action);
    h.assertRefused();
  });

  test(`control P09-R1: ${action} preserves a valid two-study export`, async () => {
    const h = harness();
    assertFit(await h.download(action), action, h.results());
  });

  test(`control P09-R1: ${action} exports a fresh fit after refusal and recovery`, async () => {
    const h = harness();
    const earlierPooled = h.results().poolP;
    await h.run(refusedInput);
    h.assertRefused();
    await h.run('6,10,Study C\n15,20,Study D');
    assert.notEqual(h.results().poolP, earlierPooled, 'the recovered fit is new');
    assertFit(await h.download(action), action, h.results());
  });
}
