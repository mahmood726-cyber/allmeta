import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('meta-regression/index.html');
const adapter = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('window.__almResults ='));
const example = html.match(/<textarea id="plus-data"[^>]*>([\s\S]*?)<\/textarea>/)[1];
const plain = value => JSON.parse(JSON.stringify(value));

// Exercise the shipped adapter, exporter and extras UI without browser packages.
// Only the main engine's cached fit and unrelated UX modules are stubbed: this
// test concerns export provenance, not numerical parity.
function harness({ build = true } = {}) {
  const elements = new Map(), downloads = [], blobs = new Map();
  function element() {
    return {
      value: '', defaultValue: '', textContent: '', innerHTML: '', checked: false,
      disabled: false, listeners: {}, children: new Map(),
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      querySelector(selector) {
        if (!this.children.has(selector)) this.children.set(selector, element());
        return this.children.get(selector);
      },
      replaceChildren() { this.innerHTML = ''; },
      appendChild() {}, removeChild() {}, remove() {},
      async click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        if (this.listeners.click) await this.listeners.click();
        if (this.onclick) await this.onclick();
      },
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  get('plus-data').value = get('plus-data').defaultValue = example;
  const document = {
    title: 'Meta-Regression', head: element(), body: element(),
    getElementById: get, createElement: element,
    querySelector(selector) {
      if (selector.startsWith('#')) return get(selector.slice(1));
      const copy = { h1: 'Meta-Regression', 'header p': 'Single moderator analysis.',
        '.footer-note': 'Paule-Mandel with Knapp-Hartung inference.' };
      return Object.hasOwn(copy, selector) ? { textContent: copy[selector] } : null;
    },
  };
  const noOp = () => {};
  const context = vm.createContext({ document, console, structuredClone, Blob,
    setTimeout: noOp,
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; },
      revokeObjectURL: noOp,
    },
    alm: {
      csvUpload: noOp, axisControls: noOp, tooltips: noOp,
      resetUndo: noOp, urlState: Object.assign(noOp, { read: () => null }),
    },
    _almLastFitted: () => ({ fit: { b0: 0.25, b1: -0.5 }, tau2: 0.125 }),
    _almLastStudies: () => [{}, {}, {}, {}],
    _almLastHK: () => ({ df: 2, varB0: 0.0625, varB1: 0.25, q: 1 }),
    _almLastR2: () => 0.5,
    _almLastQE: () => ({ qE: 1.5, dfE: 2, pQE: 0.75 }),
    _almTQuantile975: () => 4, // Deliberate stub: exact adapter transport control.
  });
  context.window = context;
  const run = path => vm.runInContext(read(path), context, { filename: path });
  // Match page order: exporter loads before build-info; export happens after it.
  run('hub/shared/results-export.js');
  if (build) run('shared/build-info.js');
  assert.ok(adapter, 'the real app export adapter must be present');
  vm.runInContext(adapter, context, { filename: 'meta-regression/index.html (export adapter)' });
  run('meta-regression/plus-engine.js');
  run('meta-regression/plus-ui.js');
  return {
    context, get, downloads,
    async download(action) {
      await get('alm-export-mount').querySelector(`[data-action="${action}"]`).click();
      return downloads.at(-1).blob.text();
    },
    async extras() {
      await get('plus-export').click();
      return JSON.parse(await downloads.at(-1).blob.text());
    },
  };
}

test('control: page loads real build identity before its export adapter and extras UI', () => {
  const h = harness(), by = h.context.AlmBuildInfo;
  assert.match(by.version, /^v\d+\.\d+\.\d+/);
  assert.match(by.sha, /^[0-9a-f]{40}$/);
  assert.equal(by.shortSha, by.sha.slice(0, 7));
  assert.ok(Number.isFinite(Date.parse(by.builtAt)));
  const buildPosition = html.indexOf('src="../shared/build-info.js"');
  assert.ok(buildPosition >= 0 && buildPosition < html.indexOf('window.__almResults ='));
  assert.ok(buildPosition < html.indexOf('src="plus-ui.js"'));
});

for (const field of ['version', 'sha', 'builtAt']) {
  test(`plant P08-R5: results JSON carries loaded producedBy.${field}`, async () => {
    const h = harness();
    const payload = JSON.parse(await h.download('json'));
    assert.equal(payload.producedBy?.[field], h.context.AlmBuildInfo[field]);
  });
  test(`plant P08-R5: extras JSON carries loaded producedBy.${field}`, async () => {
    const h = harness();
    const payload = await h.extras();
    assert.equal(payload.producedBy?.[field], h.context.AlmBuildInfo[field]);
  });
}

for (const action of ['report-md', 'report-txt']) {
  for (const field of ['version', 'sha']) {
    test(`plant P08-R5: ${action} identifies loaded ${field} in readable report header`, async () => {
      const h = harness();
      const text = await h.download(action);
      const header = text.split(action === 'report-md' ? '## Methods' : 'METHODS')[0];
      assert.ok(header.includes(h.context.AlmBuildInfo[field]), `missing ${field}: ${header}`);
      assert.match(header, /(?:source|commit)/i);
    });
  }
  test(`control: ${action} retains methods and computed results`, async () => {
    const h = harness(), text = await h.download(action);
    assert.ok(text.includes('Single moderator analysis.'));
    assert.ok(text.includes('Paule-Mandel with Knapp-Hartung inference.'));
    assert.ok(text.includes(action === 'report-md' ? '## Results' : 'RESULTS'));
    assert.match(text, /slope(?:\s*\|\s*|: )-0\.5/);
    assert.match(text, /Generated \d{4}-\d{2}-\d{2}/);
  });
}

test('plant P08-R5: payload provenance copies all loaded fields without sharing mutable build state', async () => {
  const h = harness(), expected = plain(h.context.AlmBuildInfo);
  const results = h.context.__almResults(), extras = h.context.AlmMetaPlusUI.exportPayload();
  assert.deepEqual(plain(results.producedBy ?? null), expected);
  assert.deepEqual(plain(extras.producedBy ?? null), expected);
  results.producedBy.version = 'mutated export';
  extras.producedBy.sha = 'mutated export';
  assert.deepEqual(plain(h.context.AlmBuildInfo), expected);
  assert.deepEqual(JSON.parse(await h.download('json')).producedBy, expected);
  assert.deepEqual((await h.extras()).producedBy, expected);
});

test('control: results JSON retains the schema and all existing computed fields', async () => {
  const h = harness(), payload = JSON.parse(await h.download('json'));
  delete payload.producedBy;
  assert.deepEqual(payload, {
    _schema: 'meta-regression-results-v1', k: 4,
    intercept: 0.25, intercept_se: 0.25, intercept_ci_lb: -0.75, intercept_ci_ub: 1.25,
    slope: -0.5, slope_se: 0.5, slope_ci_lb: -2.5, slope_ci_ub: 1.5,
    tau2_pm: 0.125, hksj_q: 1, hksj_q_df: 2, R2_tau2: 0.5, QE: 1.5, QE_df: 2, QE_p: 0.75,
  });
  assert.equal(h.downloads.at(-1).name, 'meta-regression-results.json');
});

test('control: extras JSON preserves the real example input, fit and schema', async () => {
  const h = harness(), ui = h.context.AlmMetaPlusUI, before = plain(ui.current());
  assert.equal(before.result.status, 'ok');
  const payload = await h.extras();
  assert.equal(payload.schema, 'meta-regression-plus-v1');
  assert.deepEqual(payload.input, plain(ui.parse(example, false)));
  assert.deepEqual(payload.result, before.result);
  payload.input.yi[0] = 999;
  assert.deepEqual(plain(ui.current()), before);
  assert.equal(h.downloads.at(-1).name, 'meta-regression-plus.json');
});

test('control: missing build metadata keeps exports usable without inventing identity', async () => {
  const h = harness({ build: false });
  assert.equal(Object.hasOwn(JSON.parse(await h.download('json')), 'producedBy'), false);
  assert.equal(Object.hasOwn(await h.extras(), 'producedBy'), false);
  for (const action of ['report-md', 'report-txt']) {
    const text = await h.download(action);
    assert.ok(text.includes('with allmeta'));
    assert.doesNotMatch(text, /undefined|\[object Object\]/);
  }
});
