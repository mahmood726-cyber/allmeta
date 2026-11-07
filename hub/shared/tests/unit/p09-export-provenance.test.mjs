import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('window._almLastPropMA ='));
assert.ok(appScript, 'exercise the real proportion-ma analysis and export wiring');
const actions = ['json', 'csv', 'report-md', 'report-txt', 'md'];
const suffixes = { json: '.json', csv: '.csv', 'report-md': '-report.md', 'report-txt': '-report.txt', md: '.md' };
const numericKeys = ['k', 'mu_re', 'seRE', 'tau2', 'Q', 'df', 'i2', 'poolP', 'poolLo', 'poolHi', 'poolPiLo', 'poolPiHi'];
const sample = '5, 100, A\n50, 100, B\n10, 120, C\n80, 100, D';

// Only DOM, download transport and unrelated UI widgets are doubles. Run the
// shipped analysis, ma-core, lifecycle and every results-export click handler.
// Captured Blobs remain in memory; no browser, files, network or R oracle needed.
function harness({ transform = 'logit', tauEstimator = 'PM', source = sample, build } = {}) {
  const elements = new Map();
  const downloads = [];
  const blobs = new Map();
  let blobId = 0;
  function element(id = '') {
    const listeners = new Map();
    const children = new Map();
    return {
      id, value: '', innerHTML: '', textContent: '', style: {}, hidden: true,
      addEventListener(type, fn) { listeners.set(type, fn); },
      setAttribute(key, value) { this[key] = value; },
      appendChild() {}, removeChild() {},
      querySelector(selector) {
        const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
        assert.ok(action && this.innerHTML.includes(`data-action="${action}"`), selector);
        if (!children.has(action)) children.set(action, element(action));
        return children.get(action);
      },
      async click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        return listeners.get('click')?.();
      }
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], element(match[1]));
  elements.get('src').value = source;
  elements.get('trans').value = transform;
  elements.get('tau-est').value = tauEstimator;
  const copy = tag => ({ textContent: html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1].replace(/<[^>]*>/g, '') || '' });
  const document = {
    title: 'Proportion MA', head: element(), body: element(),
    createElement: () => element(),
    getElementById: id => elements.get(id) || null,
    addEventListener() {},
    querySelectorAll: () => ['src', 'trans', 'tau-est'].map(id => elements.get(id)),
    querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) :
      selector === 'h1' ? copy('h1') : selector === 'header p' ? copy('p') : selector === 'footer' ? copy('footer') : null
  };
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, tooltips: noop,
    resetUndo: Object.assign(noop, { snapshot: noop }),
    urlState: Object.assign(() => {}, { read: () => ({}), write: noop })
  } };
  const context = vm.createContext({ window, document, console, Blob,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${++blobId}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); }
    },
    setTimeout: fn => fn()
  });
  const scripts = ['shared/ma-core.js', 'shared/build-info.js', 'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js'];
  for (const path of scripts) {
    assert.ok(html.includes(`src="../${path}"`), `${path} must be loaded by the page`);
    vm.runInContext(read(path), context, { filename: path });
  }
  if (build === null) delete window.AlmBuildInfo;
  else if (build !== undefined) window.AlmBuildInfo = { ...build };
  vm.runInContext(appScript, context, { filename: 'proportion-ma/index.html (main script)' });
  return {
    window,
    result: () => JSON.parse(JSON.stringify(window._almLastPropMA())),
    run: () => window.__almPropValidation.run(),
    async export(action) {
      const before = downloads.length;
      await elements.get('alm-export-mount').querySelector(`[data-action="${action}"]`).click();
      assert.equal(downloads.length, before + 1, `${action} downloads one file`);
      const download = downloads.at(-1);
      assert.equal(download.name, 'propma-results' + suffixes[action]);
      return download.blob.text();
    }
  };
}

function fields(action, text) {
  if (action === 'json') {
    const out = {};
    function flatten(obj, prefix = '') {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix + key;
        if (value && typeof value === 'object') flatten(value, path + '.');
        else out[path] = value == null ? '' : String(value);
      }
    }
    flatten(JSON.parse(text));
    return out;
  }
  if (action === 'csv') return Object.fromEntries(text.split('\r\n').slice(1).map(line => line.split(',')));
  if (action === 'report-txt') return Object.fromEntries(text.split('\n').filter(line => line.includes(': ')).map(line => {
    const at = line.indexOf(': ');
    return [line.slice(0, at), line.slice(at + 2)];
  }));
  return Object.fromEntries(text.split('\n').filter(line => line.startsWith('| ')).map(line => line.split('|').slice(1, 3).map(s => s.trim())));
}

for (const action of actions) {
  test(`P09-R6 plant: ${action} includes the loaded build version and full SHA`, async () => {
    const h = harness();
    const exported = fields(action, await h.export(action));
    assert.equal(exported['build.version'], h.window.AlmBuildInfo.version, `${action} producing version`);
    assert.equal(exported['build.sha'], h.window.AlmBuildInfo.sha, `${action} producing full SHA`);
  });
}

test('P09-R6 plant: provenance is captured for the producing analysis, then refreshed on rerun', async () => {
  const original = { version: 'v9.8.7-test', sha: '0123456789abcdef0123456789abcdef01234567' };
  const next = { version: 'v9.8.8-test', sha: 'fedcba9876543210fedcba9876543210fedcba98' };
  const h = harness({ build: original });
  const analysis = h.result();
  Object.assign(h.window.AlmBuildInfo, next);
  for (const action of actions) {
    const exported = fields(action, await h.export(action));
    assert.equal(exported['build.version'], original.version);
    assert.equal(exported['build.sha'], original.sha);
  }
  h.run();
  for (const action of actions) {
    const exported = fields(action, await h.export(action));
    assert.equal(exported['build.version'], next.version);
    assert.equal(exported['build.sha'], next.sha);
  }
  for (const key of numericKeys) assert.equal(h.result()[key], analysis[key], key);
});

test('P09-R6 plant: unavailable build identity is explicit without inventing a version or SHA', async () => {
  const h = harness({ build: null });
  const json = JSON.parse(await h.export('json'));
  assert.deepEqual(json.build, { version: null, sha: null });
  for (const action of actions.slice(1)) {
    const exported = fields(action, await h.export(action));
    assert.equal(exported['build.version'], '');
    assert.equal(exported['build.sha'], '');
    assert.equal(exported.poolP, String(json.poolP));
  }
});

for (const transform of ['ft', 'logit', 'raw']) {
  for (const tauEstimator of ['PM', 'DL', 'FE']) {
    test(`P09-R6 control: ${transform}/${tauEstimator} exports preserve all analysis values and method settings`, async () => {
      const h = harness({ transform, tauEstimator });
      const result = h.result();
      assert.equal(result._schema, 'propma-results-v1');
      assert.equal(result.transform, transform);
      assert.equal(result.tauEstimator, tauEstimator);
      assert.equal(result.k, 4);
      assert.ok(result.poolP > 0 && result.poolP < 1);
      if (tauEstimator === 'FE') assert.equal(result.tau2, 0);
      else assert.ok(result.tau2 > 0, 'heterogeneous control exercises random effects');
      for (const action of actions) {
        const exported = fields(action, await h.export(action));
        for (const key of [...numericKeys, 'transform', 'tauEstimator']) {
          assert.equal(exported[key], String(result[key]), `${action}: ${key}`);
        }
      }
      assert.deepEqual(h.result(), result, 'export does not mutate the analysis');
    });
  }
}

test('P09-R6 control: two-study exports retain null prediction intervals', async () => {
  const h = harness({ source: '10, 100, A\n20, 100, B' });
  const result = h.result();
  assert.equal(result.poolPiLo, null);
  assert.equal(result.poolPiHi, null);
  for (const action of actions) {
    const exported = fields(action, await h.export(action));
    assert.equal(exported.poolPiLo, '');
    assert.equal(exported.poolPiHi, '');
    assert.equal(exported.poolP, String(result.poolP));
  }
});
