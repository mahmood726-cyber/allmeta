import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('mh-peto/index.html', root), 'utf8');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('window.__mhValidation ='));
assert.ok(main, 'the actual MH/Peto page script must be exercised');
const data = 'A,3,50,7,52\nB,1,40,4,41\nC,0,30,2,29';

// Minimal DOM for the real page script and results-export download handler.
// Calculation, result construction, JSON serialization and Blob creation are real;
// unrelated widget initialization and the browser download destination are stubbed.
function harness({ build = 'loaded', src = data, measure = 'OR' } = {}) {
  const downloads = [];
  const blobs = new Map();
  const elements = new Map();
  function element(id = '') {
    const listeners = new Map();
    const children = new Map();
    const attrs = new Map();
    return {
      id, value: '', innerHTML: '', textContent: '', hidden: false,
      setAttribute(key, value) { attrs.set(key, String(value)); },
      getAttribute(key) { return attrs.get(key) ?? null; },
      removeAttribute(key) { attrs.delete(key); },
      appendChild() {}, removeChild() {},
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element(selector));
        return children.get(selector);
      },
      async click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        for (const fn of listeners.get('click') || []) await fn();
      },
    };
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element(id));
  const document = {
    head: element(), body: element(),
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) { return selector.startsWith('#') ? this.getElementById(selector.slice(1)) : null; },
    querySelectorAll(selector) {
      return selector === '#src, #measure' ? [elements.get('src'), elements.get('measure')] : [];
    },
    createElement() { return element(); },
    addEventListener() {},
  };
  elements.get('src').value = src;
  elements.get('measure').value = measure;
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, tooltips: noop,
    resetUndo: Object.assign(() => {}, { snapshot: noop }),
    urlState: Object.assign(() => {}, { read: () => null, write: noop }),
  } };
  const context = vm.createContext({ window, document, Blob, console,
    setTimeout: fn => fn(),
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; },
      revokeObjectURL() {},
    },
  });
  for (const path of ['shared/ma-core.js', 'shared/fragility.js', 'shared/build-info.js',
    'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    assert.ok(html.includes('src="../' + path + '"'), 'page loads ' + path);
    if (path === 'shared/build-info.js' && build !== 'loaded') continue;
    vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  }
  if (build && build !== 'loaded') window.AlmBuildInfo = { ...build };
  vm.runInContext(main, context, { filename: 'mh-peto/index.html' });
  return {
    window,
    async download() {
      await elements.get('alm-export-mount').querySelector('[data-action="json"]').click();
      assert.equal(downloads.length, 1, 'one download is produced');
      assert.equal(downloads[0].name, 'mhpeto-results.json');
      assert.equal(downloads[0].blob.type, 'application/json');
      return JSON.parse(await downloads[0].blob.text());
    },
  };
}

function withoutSoftware(result) {
  const { software, ...rest } = result;
  return rest;
}

test('P10-R4: downloaded JSON includes the loaded software version and full commit SHA', async () => {
  const h = harness();
  const build = h.window.AlmBuildInfo;
  assert.equal(typeof build.version, 'string');
  assert.match(build.sha, /^[0-9a-f]{40}$/);
  const result = await h.download();
  assert.ok(result.software, 'loaded build identity must be included in the JSON export');
  assert.equal(result.software.version, build.version);
  assert.equal(result.software.sha, build.sha);
  assert.equal(result._schema, 'mhpeto-results-v1', 'schema version remains separate from software version');
  assert.notEqual(result._schema, result.software.version);
});

test('P10-R4: downloaded provenance follows another loaded build without hardcoded release values', async () => {
  const build = { version: 'test-build-2.0.0', sha: '1234567890abcdef1234567890abcdef12345678' };
  const h = harness({ build });
  const result = await h.download();
  assert.ok(result.software, 'the alternate build identity must also be exported');
  assert.equal(result.software.version, build.version);
  assert.equal(result.software.sha, build.sha);
  assert.equal(result._schema, 'mhpeto-results-v1');
});

test('P10-R4: unavailable build fields are explicitly unknown and do not prevent export', async () => {
  for (const build of [null, {}, { version: 'test-build-only' }, { sha: 'test-commit-only' }]) {
    const result = await harness({ build }).download();
    assert.ok(result.software, 'provenance must state when build information is unavailable');
    assert.equal(result.software.version, build?.version || 'unknown');
    assert.equal(result.software.sha, build?.sha || 'unknown');
    assert.ok(Number.isFinite(result.mh_est));
  }
});

test('control: JSON preserves all numerical fields and nulls for OR, RR and RD', async () => {
  for (const measure of ['OR', 'RR', 'RD']) {
    for (const src of [data, 'A,0,10,0,10\nB,0,12,0,9']) {
      const h = harness({ src, measure });
      const before = JSON.stringify(h.window._almLastMhPeto());
      const result = await h.download();
      assert.deepEqual(withoutSoftware(result), withoutSoftware(JSON.parse(before)));
      assert.equal(JSON.stringify(h.window._almLastMhPeto()), before, 'export must not mutate results');
      const noBuild = await harness({ src, measure, build: null }).download();
      assert.deepEqual(withoutSoftware(result), withoutSoftware(noBuild), 'metadata must not affect statistics');
      assert.equal(result._schema, 'mhpeto-results-v1');
      assert.equal(result.measure, measure);
      assert.equal(result.k, src === data ? 3 : 2);
      if (src === data) {
        for (const key of ['mh_est', 'mh_lo', 'mh_hi', 'mh_p', 'mh_QE', 'metamh_beta', 'ivfe_beta']) {
          assert.ok(Number.isFinite(result[key]), key + ' remains a number');
        }
        if (measure === 'OR') assert.ok(Number.isFinite(result.peto_est));
      } else if (measure !== 'RD') {
        assert.equal(result.mh_est, null, 'non-estimable results remain null');
      }
    }
  }
});

test('control: invalid input still exports null rather than a metadata-only result', async () => {
  const h = harness({ src: 'A,invalid,10,2,10\nB,1,10,2,10' });
  assert.equal(h.window._almLastMhPeto(), null);
  assert.equal(await h.download(), null);
});
