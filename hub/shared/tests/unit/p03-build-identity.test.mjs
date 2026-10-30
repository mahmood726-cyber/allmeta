import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import B from '../../../../shared/dta-bivariate.js';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('dta-sroc/index.html');
const buildSource = read('shared/build-info.js');
const exportSource = read('hub/shared/results-export.js');
const serializer = html.slice(html.indexOf('    // Results accessor for results-export'),
  html.indexOf('    function readState()'));
const analysis = html.slice(html.indexOf('    const COUNT_FIELDS ='),
  html.indexOf('    function escapeXml('));
const example = JSON.parse(html.match(/const EXAMPLE = ("[^\r\n]+");/)[1]);
const wiring = html.match(/    window\.alm\.resultsExport\(\{[\s\S]*?\n    \}\);/)[0];
const plain = value => JSON.parse(JSON.stringify(value));

// Run the actual app serializer, parser and fitter, plus the real shared export
// click handlers. Only DOM/download primitives are stubbed; no browser is needed.
function harness({ stamp = 'loaded', method = 'reml' } = {}) {
  const listeners = new Map(), blobs = new Map(), downloads = [];
  const target = {
    innerHTML: '',
    querySelector(selector) {
      return { addEventListener(event, callback) { listeners.set(selector, callback); } };
    },
  };
  const document = {
    title: 'DTA-SROC',
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    querySelector(selector) { return selector === '#alm-export-mount' ? target : null; },
    createElement(tag) {
      return tag === 'a' ? {
        click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); },
      } : {};
    },
  };
  const context = vm.createContext({
    window: { AlmDTABivariate: B }, document, Blob, console,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    setTimeout(callback) { callback(); },
    readState: () => ({ data: example, title: 'Example', method, cc: 'all', cov: '' }),
    requireValidResult: () => true,
  });
  if (stamp === 'loaded') vm.runInContext(buildSource, context);
  else if (stamp !== null) context.window.AlmBuildInfo = stamp;
  vm.runInContext(analysis + '\n' + serializer, context);
  vm.runInContext(exportSource + '\n' + wiring, context);
  return {
    identity: context.window.AlmBuildInfo,
    results: () => plain(context.window.__almResults()),
    async download(action) {
      await listeners.get(`[data-action="${action}"]`)();
      const download = downloads.at(-1);
      assert.ok(download?.blob, 'export handler must produce a downloadable Blob');
      return { name: download.name, text: await download.blob.text() };
    },
  };
}

test('control: loaded build stamp has a version and full SHA and is wired before the app', () => {
  const { identity } = harness();
  assert.ok(identity.version);
  assert.match(identity.sha, /^[0-9a-f]{40}$/);
  assert.equal(identity.shortSha, identity.sha.slice(0, 7));
  assert.ok(html.indexOf('src="../shared/build-info.js"') < html.indexOf('const LS_KEY'));
});

test('control: fitted summary and study values survive results JSON export', async t => {
  for (const method of ['reml', 'fixed']) {
    const h = harness({ method }), result = JSON.parse((await h.download('json')).text);
    assert.equal(result._schema, 'dta-sroc-results-v2');
    assert.equal(result.k, 7);
    assert.equal(result.rows.length, 7);
    assert.equal(result.rows[0].study, 'Study A');
    assert.equal(result.rows[0].TP, 85);
    assert.equal(result.rows[0].FP, 10);
    assert.equal(result.rows[0].FN, 15);
    assert.equal(result.rows[0].TN, 140);
    assert.equal(result.bivariate.method, method);
    assert.ok(Number.isFinite(result.alpha));
    assert.ok(Number.isFinite(result.beta));
    assert.ok(result.bivariate.sens > 0 && result.bivariate.sens < 1);
    assert.ok(result.bivariate.spec > 0 && result.bivariate.spec < 1);
    assert.deepEqual(result.errors, []);
    // Diagnostic fingerprints compare OLD and NEW runs, not R-parity references.
    const { _savedAt, _build, ...numerical } = result;
    t.diagnostic(`${method} results SHA-256: ${createHash('sha256').update(JSON.stringify(numerical)).digest('hex')}`);
  }
});

test('plant P03-R3: results JSON includes the full loaded SHA', async () => {
  const h = harness(), result = JSON.parse((await h.download('json')).text);
  assert.equal(result._build?.sha, h.identity.sha);
});

test('plant P03-R3: results JSON includes application version separately from schema', async () => {
  const h = harness(), result = JSON.parse((await h.download('json')).text);
  assert.equal(result._build?.version, h.identity.version);
  assert.equal(result._schema, 'dta-sroc-results-v2');
  assert.notEqual(result._build.version, result._schema);
});

for (const [action, extension] of [
  ['csv', '.csv'], ['md', '.md'], ['report-md', '-report.md'], ['report-txt', '-report.txt'],
]) {
  test(`plant P03-R3: ${action} download includes labelled application version and full SHA`, async () => {
    const h = harness(), download = await h.download(action);
    assert.equal(download.name, `dta-sroc-results${extension}`);
    for (const key of ['version', 'sha']) {
      const line = download.text.split(/\r?\n/).find(line => line.includes(`_build.${key}`));
      assert.ok(line, `missing _build.${key} label`);
      assert.ok(line.includes(h.identity[key]), `missing loaded ${key}`);
    }
  });
}

test('plant P03-R3: serializer snapshots the supplied identity without hard-coding the bundled stamp', () => {
  const stamp = { version: 'v99.2.1-test', sha: 'abcdef0123456789'.repeat(2) + 'abcdef01' };
  const h = harness({ stamp }), first = h.results();
  assert.deepEqual(first._build, stamp);
  h.identity.version = 'v99.2.2-test';
  assert.equal(first._build.version, 'v99.2.1-test');
  assert.equal(h.results()._build.version, 'v99.2.2-test');
});

test('plant P03-R3: absent or partial build metadata is explicitly unknown', () => {
  for (const stamp of [null, {}, { version: 'test-version' }, { sha: 'test-sha' }]) {
    const result = harness({ stamp }).results();
    assert.deepEqual(result._build, { version: stamp?.version || null, sha: stamp?.sha || null });
    assert.equal(result.bivariate.method, 'reml');
  }
});

test('control: build identity cannot change fitted results or study data', () => {
  const without = harness({ stamp: null }).results(), withStamp = harness().results();
  for (const result of [without, withStamp]) { delete result._build; delete result._savedAt; }
  assert.deepEqual(withStamp, without);
});
