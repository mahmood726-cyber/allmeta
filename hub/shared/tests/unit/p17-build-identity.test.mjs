import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('correlation-ma/index.html');
const main = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(([, attrs, body]) => !/\bsrc=/.test(attrs) && body.includes('var EXAMPLE'))?.[2];
assert.ok(main, 'execute the real correlation-ma application script');

// Only the DOM/download boundary is simulated. The parser, pooling engine,
// result construction, export registration and JSON Blob are production code.
function setup({ buildOverride, loadBuild = true } = {}) {
  const buttons = new Map(), nodes = new Map(), ready = [], downloads = [];
  const element = () => ({
    value: '', innerHTML: '', textContent: '', listeners: new Map(),
    addEventListener(name, fn) { this.listeners.set(name, fn); },
    appendChild() {}, removeChild() {},
  });
  for (const id of ['f-data', 'f-method', 'res-body', 'headline', 'forest-host', 'alm-export-mount']) {
    nodes.set(id, element());
  }
  nodes.get('f-method').value = 'REML';
  nodes.get('alm-export-mount').querySelector = selector => {
    if (!buttons.has(selector)) buttons.set(selector, element());
    return buttons.get(selector);
  };
  let blob;
  const document = {
    readyState: 'loading', head: element(), body: element(),
    getElementById: id => nodes.get(id),
    querySelector: selector => nodes.get(selector.slice(1)) || null,
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') ready.push(fn); },
    createElement(tag) {
      return tag === 'a' ? { click() { downloads.push({ name: this.download, blob }); } } : element();
    },
  };
  const context = vm.createContext({
    document, Blob, console, matchMedia: () => ({ matches: false }),
    URL: { createObjectURL(value) { blob = value; return 'blob:p17-test'; }, revokeObjectURL() {} },
    setTimeout(fn) { fn(); },
  });
  context.window = context;
  const run = path => vm.runInContext(read(path), context, { filename: path });
  assert.match(html, /<script src="\.\.\/shared\/build-info\.js"><\/script>/);
  run('shared/ma-core.js');
  if (loadBuild) run('shared/build-info.js');
  if (buildOverride) context.AlmBuildInfo = { ...buildOverride };
  vm.runInContext(main, context, { filename: 'correlation-ma/index.html' });
  run('hub/shared/results-export.js');
  ready.forEach(fn => fn());
  return {
    context,
    setData(text, method = 'REML') {
      nodes.get('f-method').value = method;
      nodes.get('f-data').value = text;
      nodes.get('f-data').listeners.get('input')();
    },
    result: () => JSON.parse(JSON.stringify(context._almLastCorrMA())),
    async exportJSON() {
      const before = downloads.length;
      await buttons.get('[data-action="json"]').listeners.get('click')();
      assert.equal(downloads.length, before + 1);
      const download = downloads.at(-1);
      assert.equal(download.name, 'correlation-ma-results.json');
      assert.equal(download.blob.type, 'application/json');
      return JSON.parse(await download.blob.text());
    },
  };
}

const accepted = [
  { label: 'Alpha, cohort', r: 0.1234567890123456, n: 37 },
  { label: 'Beta', r: -0.4567890123456789, n: 81 },
  { label: 'Gamma', r: 0.567890123456789, n: 54 },
];
const input = '# comment\nAlpha, cohort, 0.1234567890123456, 37\n' +
  'invalid, 1, 50\nBeta, -0.4567890123456789, 81\n' +
  'too small, 0.2, 3\ntrailing junk, 0.3oops, 40\n' +
  'Gamma, 0.567890123456789, 54\n';

// A serialization/precision control, not an independent statistical or R oracle.
function expectedResults(context, method) {
  const p = context.AlmMaCore.pool(accepted.map(s => Math.atanh(s.r)),
    accepted.map(s => 1 / (s.n - 3)), { method, pi: true });
  return {
    _schema: 'corr-ma-results-v1', k: accepted.length, method,
    mu_z: p.mu, se_z: p.se, tau2_z: p.tau2, I2: p.I2,
    r: Math.tanh(p.mu), r_lo: Math.tanh(p.ciLo), r_hi: Math.tanh(p.ciHi),
    r_pi_lo: p.piLo != null ? Math.tanh(p.piLo) : null,
    r_pi_hi: p.piHi != null ? Math.tanh(p.piHi) : null,
    studies: accepted,
  };
}

for (const [name, options] of [
  ['loaded build-info.js', {}],
  ['alternate loaded identity', { buildOverride: {
    version: 'v9.8.7-test', sha: '0123456789abcdef0123456789abcdef01234567', shortSha: '0123456',
  } }],
]) {
  test(`plant P17-R3: main result and JSON include version and full SHA from ${name}`, async () => {
    const h = setup(options), build = h.context.AlmBuildInfo;
    const exported = await h.exportJSON();
    assert.equal(exported.producedBy?.sha, build.sha, 'JSON must contain the loaded full SHA');
    assert.equal(exported.producedBy?.version, build.version, 'JSON must contain the loaded version');
    assert.deepEqual(h.result().producedBy, { version: build.version, sha: build.sha },
      'stamp the result at its source');
    assert.deepEqual(exported, h.result(), 'download must serialize the actual result');
    h.setData(input, 'DL');
    assert.deepEqual((await h.exportJSON()).producedBy, { version: build.version, sha: build.sha },
      'recalculated results must retain the loaded identity');
  });
}

test('control: loaded metadata is available and all methods preserve exact numbers and accepted rows', async () => {
  const h = setup();
  assert.match(h.context.AlmBuildInfo.version, /^v\d+\.\d+\.\d+/);
  assert.match(h.context.AlmBuildInfo.sha, /^[a-f0-9]{40}$/);
  assert.equal(h.context.AlmBuildInfo.shortSha, h.context.AlmBuildInfo.sha.slice(0, 7));
  for (const method of ['REML', 'PM', 'DL', 'FE']) {
    h.setData(input, method);
    const exported = await h.exportJSON(), expected = expectedResults(h.context, method);
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k => [k, exported[k]])), expected);
    assert.deepEqual(exported, h.result());
    assert.notEqual(exported.r, Number(exported.r.toFixed(3)), 'do not export display-rounded values');
  }
});

test('control: unavailable build metadata does not prevent calculation or JSON export', async () => {
  const h = setup({ loadBuild: false });
  h.setData(input);
  const exported = await h.exportJSON(), expected = expectedResults(h.context, 'REML');
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k => [k, exported[k]])), expected);
  assert.deepEqual(exported, h.result());
});

test('control: insufficient accepted studies clear the previous result and export an empty object', async () => {
  const h = setup();
  assert.ok(h.result());
  for (const text of ['', 'only study, 0.2, 30\ninvalid, 1, 50']) {
    h.setData(text);
    assert.equal(h.result(), null);
    assert.deepEqual(await h.exportJSON(), {});
  }
});
