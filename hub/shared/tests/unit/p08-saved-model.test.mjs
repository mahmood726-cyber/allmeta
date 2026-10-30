import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('meta-regression/index.html', root), 'utf8');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('const LS_KEY = "meta-regression-v1";'));
assert.ok(appScript, 'Load the actual application script, including its event handlers');
const storageKey = 'meta-regression-v1';
const input = {
  data: 'A, -0.6, 0.10, -2\nB, 0.1, 0.12, -1\nC, -0.3, 0.11, 0\nD, 0.7, 0.15, 1\nE, -0.2, 0.14, 2\nF, 1.3, 0.16, 3',
  title: 'Saved model selection', modlabel: 'Moderator', effectlabel: 'Effect'
};

// Browser-free DOM/IO boundary doubles. Execute the unmodified app, lifecycle,
// and real numerical engines; exercise the registered download/import handlers.
function harness(saved) {
  const elements = new Map(), downloads = [], blobs = new Map(), messages = [];
  const storage = new Map(saved === undefined ? [] : [[storageKey, JSON.stringify(saved)]]);
  function element(id, attrs = '') {
    const listeners = new Map();
    let value = /\bvalue="([^"]*)"/.exec(attrs)?.[1] ?? (/type="checkbox"/.test(attrs) ? 'on' : '');
    return {
      id, type: /\btype="([^"]*)"/.exec(attrs)?.[1] ?? '',
      get value() { return value; }, set value(next) { value = String(next); },
      checked: false, hidden: false, innerHTML: '', files: [],
      classList: { add() {}, remove() {} },
      matches(selector) { assert.equal(selector, '[id^="f-"]'); return id.startsWith('f-'); },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      async fire(type) {
        const handlers = listeners.get(type) ?? [];
        assert.ok(handlers.length, `${id} has a ${type} handler`);
        for (const fn of handlers) await fn({ type, target: this });
      },
      click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); }
    };
  }
  for (const match of html.matchAll(/<[a-z][\w-]*\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    elements.set(match[2], element(match[2], match[1]));
  }
  const document = {
    getElementById: id => elements.get(id) ?? null,
    querySelectorAll(selector) {
      assert.equal(selector, '[id^="f-"]');
      return [...elements.values()].filter(el => el.id.startsWith('f-'));
    },
    addEventListener() {},
    createElement(tag) { assert.equal(tag, 'a'); return element('download'); },
    body: { appendChild() {}, removeChild() {} }
  };
  const window = { alm: { plotExport() {} } };
  const context = vm.createContext({
    window, document, Blob,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); }
    },
    FileReader: class {
      readAsText(file) { this.result = file.contents; this.onload(); }
    },
    setTimeout() {},
    Toast: { show: message => messages.push(message) }
  });
  for (const path of ['shared/ma-core.js', 'shared/permutest.js', 'shared/location-scale.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  vm.runInContext(appScript, context, { filename: 'meta-regression/index.html' });
  const get = id => elements.get(id);
  return {
    window, get,
    state: () => JSON.parse(storage.get(storageKey)),
    async prepare(scale = false) {
      for (const [key, value] of Object.entries(input)) get(`f-${key}`).value = value;
      get('f-scale').checked = scale;
      await get('btn-run').fire('click');
    },
    async select(scale) { get('f-scale').checked = scale; await get('f-scale').fire('change'); },
    async download() {
      await get('btn-json').fire('click');
      const download = downloads.at(-1);
      assert.equal(download.name, 'metareg-state.json');
      assert.equal(download.blob.type, 'application/json');
      const state = JSON.parse(await download.blob.text());
      assert.equal(state._schema, storageKey);
      return state;
    },
    async import(state) {
      get('file-import').files = [{ contents: JSON.stringify(state) }];
      await get('file-import').fire('change');
      assert.deepEqual(messages, [], 'Import must not swallow a render or parse error');
      assert.equal(get('file-import').value, '');
    }
  };
}

function assertInputs(app) {
  for (const [key, value] of Object.entries(input)) assert.equal(app.get(`f-${key}`).value, value, key);
}
function ordinaryFit(app) { return structuredClone(app.window._almLastFitted()); }
function scaleFit(app) { return structuredClone(app.window.__almLocScale()); }
function assertScaleFit(app) {
  const fit = scaleFit(app);
  assert.ok(fit, 'The real location-scale fit ran');
  assert.ok([...fit.beta, ...fit.alpha, ...fit.tau2, fit.logLik].every(Number.isFinite));
  assert.match(app.get('stats-wrap').innerHTML, /LS .*location slope/);
  return fit;
}

test('P08-R2 control: saved JSON restores data, title and ordinary fit', async () => {
  const source = harness();
  await source.prepare();
  const expected = ordinaryFit(source);
  assert.ok(expected);
  const restored = harness();
  await restored.import(await source.download());
  assertInputs(restored);
  assert.equal(restored.get('f-scale').checked, false);
  assert.equal(scaleFit(restored), null);
  assert.deepEqual(ordinaryFit(restored), expected);
  assert.equal(restored.get('stats-wrap').innerHTML, source.get('stats-wrap').innerHTML);
});

test('P08-R2 plant: saved JSON restores the selected location-scale analysis', async () => {
  const source = harness();
  await source.prepare(true);
  const expected = assertScaleFit(source);
  const saved = await source.download();
  const restored = harness();
  assert.equal(restored.get('f-scale').checked, false);
  await restored.import(saved);
  assertInputs(restored);
  assert.equal(restored.get('f-scale').checked, true);
  assert.equal(saved.scale, true);
  assert.deepEqual(assertScaleFit(restored), expected);
  assert.deepEqual(ordinaryFit(restored), ordinaryFit(source));
  assert.equal(restored.get('stats-wrap').innerHTML, source.get('stats-wrap').innerHTML);
});

test('P08-R2 plant: JSON stores both checkbox choices as booleans', async () => {
  const app = harness();
  await app.prepare();
  for (const selected of [false, true]) {
    await app.select(selected);
    assert.equal((await app.download()).scale, selected);
  }
});

for (const [name, payload] of [
  ['explicit false', { ...input, scale: false }],
  ['legacy JSON without scale', { ...input }]
]) {
  test(`P08-R2 plant: ${name} clears a previously selected location-scale model`, async () => {
    const app = harness();
    await app.prepare(true);
    assertScaleFit(app);
    const expected = ordinaryFit(app);
    await app.import(payload);
    assertInputs(app);
    assert.equal(app.get('f-scale').checked, false);
    assert.equal(scaleFit(app), null);
    assert.doesNotMatch(app.get('stats-wrap').innerHTML, /LS .*location slope/);
    assert.deepEqual(ordinaryFit(app), expected);
  });
}

test('P08-R2 control: legacy JSON opens with the ordinary model by default', async () => {
  const app = harness();
  await app.import({ _schema: storageKey, ...input });
  assertInputs(app);
  assert.equal(app.get('f-scale').checked, false);
  assert.equal(scaleFit(app), null);
  assert.ok(ordinaryFit(app));
});

test('P08-R2 plant: local saved state also restores the selected location-scale analysis', async () => {
  const source = harness();
  await source.prepare(true);
  const expected = assertScaleFit(source);
  const restored = harness(source.state());
  assertInputs(restored);
  assert.equal(restored.get('f-scale').checked, true);
  assert.deepEqual(assertScaleFit(restored), expected);
});

test('P08-R2 control: legacy local state keeps the ordinary model default', () => {
  const restored = harness(input);
  assertInputs(restored);
  assert.equal(restored.get('f-scale').checked, false);
  assert.equal(scaleFit(restored), null);
  assert.ok(ordinaryFit(restored));
});

test('P08-R2 plant: JSON retains the selected model even before enough studies are entered', async () => {
  const source = harness();
  source.get('f-data').value = 'A, 0.1, 0.1, 1';
  await source.select(true);
  const saved = await source.download();
  const restored = harness();
  await restored.import(saved);
  assert.equal(restored.get('f-data').value, source.get('f-data').value);
  assert.equal(restored.get('f-scale').checked, true);
  assert.equal(saved.scale, true);
  assert.equal(ordinaryFit(restored), null);
  assert.equal(scaleFit(restored), null);
});
