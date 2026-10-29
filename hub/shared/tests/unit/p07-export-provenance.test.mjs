import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const plain = value => JSON.parse(JSON.stringify(value));
const withoutBuild = ({ producedBy, ...result }) => result;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A small in-memory DOM: execute the actual app, engines and JSON download
// handlers without a browser, network, timers or files written by the test.
function harness(build = 'loaded') {
  const ids = new Map(), downloads = [], blobs = new Map(), intervals = [];
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.dataset = {}; this.style = {};
      this.listeners = {}; this.textContent = ''; this.disabled = false;
    }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      this._html = value; this.children = [];
      for (const [, action] of value.matchAll(/data-action="([^"]+)"/g)) {
        const button = new Element('button'); button.dataset.action = action; this.append(button);
      }
    }
    get innerHTML() { return this._html || ''; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
    replaceChildren(...nodes) { this.children = nodes; this._html = ''; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    matches(selector) { return selector === '#' + this.id; }
    querySelector(selector) {
      const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      return this.children.find(node => node.dataset.action === action) || null;
    }
    async dispatchEvent(event) {
      event.target = this;
      for (const fn of this.listeners[event.type] || []) await fn(event);
      for (const fn of document.listeners[event.type] || []) await fn(event);
    }
    async click() {
      if (this.disabled) return;
      if (this.tagName === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
      if (this.onclick) await this.onclick();
      await this.dispatchEvent({ type: 'click' });
    }
  }
  const document = {
    listeners: {}, head: new Element('head'), body: new Element('body'),
    getElementById: id => ids.get(id) || null,
    createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    querySelector: selector => selector.startsWith('#') ? ids.get(selector.slice(1)) : null,
    querySelectorAll: selector => [...ids.values()].filter(node => node.matches(selector)),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  };
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) new Element('div').id = id;
  const src = ids.get('src');
  src.value = src.defaultValue = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const sandbox = {
    document, Blob, console,
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; },
      revokeObjectURL() {},
    },
    setTimeout(fn) { fn(); }, setInterval(fn) { intervals.push(fn); },
    Event: class { constructor(type) { this.type = type; } },
    alm: {
      csvUpload() {}, plotExport() {}, axisControls() {}, resetUndo() {}, tooltips() {},
      urlState: Object.assign(() => {}, { read: () => ({}), write() {} }),
    },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const execute = path => vm.runInContext(read(path), context, { filename: path });
  // Model an unavailable script by never loading it in this fresh VM. Deleting
  // a property from the outer sandbox need not remove the VM's global value.
  if (build !== null) execute('shared/build-info.js');
  const loadedBuild = build === null ? null : plain(context.AlmBuildInfo);
  if (build !== null && build !== 'loaded') context.AlmBuildInfo = build;
  if (build === null) {
    assert.equal(vm.runInContext('window.AlmBuildInfo', context), undefined,
      'the unavailable-stamp fixture must be absent inside the application VM');
  }
  for (const path of ['shared/ma-core.js', 'shared/multilevel-reml.js', 'shared/stats-qt.js',
    'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) execute(path);
  const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(code => code.includes('function fit(rows)'));
  assert.ok(main, 'execute the complete inline analysis, including resultsExport wiring');
  vm.runInContext(main, context, { filename: 'multilevel-ma/index.html' });
  execute('multilevel-ma/plus-engine.js');
  execute('multilevel-ma/plus-ui.js');
  const result = context.AlmMultilevelPlus.calculate();
  async function download(button, expectedName) {
    const count = downloads.length;
    await button.click();
    assert.equal(downloads.length, count + 1, 'the actual handler must initiate a download');
    const file = downloads.at(-1);
    assert.equal(file.name, expectedName);
    assert.equal(file.blob.type, 'application/json');
    return JSON.parse(await file.blob.text());
  }
  return {
    context, ids, src, loadedBuild, result, downloads, intervals,
    mainJSON: () => download(ids.get('alm-export-mount').querySelector('[data-action="json"]'), 'mlma-results.json'),
    extrasJSON: () => download(ids.get('alm-plus-export'), 'multilevel-extras.json'),
  };
}

let cached;
const app = () => cached ||= harness();

test('P07-R4 control: the page loads a complete build stamp before analysis', () => {
  const h = app();
  assert.ok(html.indexOf('src="../shared/build-info.js"') < html.indexOf('function fit(rows)'));
  assert.equal(h.loadedBuild.app, 'allmeta');
  assert.match(h.loadedBuild.version, /^v?\d+\.\d+\.\d+/);
  assert.match(h.loadedBuild.sha, /^[0-9a-f]{40}$/);
  assert.equal(h.loadedBuild.shortSha, h.loadedBuild.sha.slice(0, 7));
  assert.ok(Number.isFinite(Date.parse(h.loadedBuild.builtAt)));
});

test('P07-R4 plant: main JSON download includes the loaded build version and commit', async () => {
  const h = app();
  assert.deepEqual((await h.mainJSON()).producedBy, h.loadedBuild);
});

test('P07-R4 plant: extras JSON download includes the loaded build version and commit', async () => {
  const h = app();
  assert.deepEqual((await h.extrasJSON()).producedBy, h.loadedBuild);
});

test('P07-R4 control: main JSON preserves its schema and every numerical field', async () => {
  const h = app(), result = withoutBuild(await h.mainJSON());
  assert.deepEqual(result, withoutBuild(plain(h.context._almLastMlma())));
  assert.deepEqual(Object.keys(result), ['_schema', 'k', 'J', 'mu', 'seMu', 'ci_lb_z', 'ci_ub_z',
    'seMuHK', 'ci_lb_hk', 'ci_ub_hk', 'pi_lb', 'pi_ub', 'tau2_study', 'tau2_within',
    'I2_study', 'I2_within', 'I2_sampling']);
  assert.equal(result._schema, 'mlma-results-v1');
  assert.equal(result.k, 13); assert.equal(result.J, 6);
  for (const [key, value] of Object.entries(result).filter(([key]) => key !== '_schema')) {
    assert.ok(Number.isFinite(value), key);
  }
  assert.ok(h.ids.get('summary').innerHTML.includes(result.mu.toFixed(3)));
  console.log('P07-R4 main payload without provenance sha256=' + digest(result));
});

test('P07-R4 control: extras download preserves every result and rendered quantity', async () => {
  const h = app(), result = withoutBuild(await h.extrasJSON());
  assert.deepEqual(result, {
    model: 'Three-level REML; diagonal sampling V',
    inference: 'CR2; Satterthwaite; 95% confidence', ...plain(h.result),
  });
  const quantities = h.context.AlmMultilevelPlus.quantities(result);
  const nodes = node => [node, ...node.children.flatMap(nodes)];
  const rendered = nodes(h.ids.get('alm-plus-output')).filter(node => node.dataset.quantity);
  assert.equal(rendered.length, Object.keys(quantities).length);
  for (const node of rendered) assert.equal(node.textContent, h.context.AlmMultilevelPlus.display(quantities[node.dataset.quantity]));
  assert.equal(result.status, 'ok'); assert.equal(result.rows, 13); assert.equal(result.clusters, 6);
  console.log('P07-R4 extras payload without provenance sha256=' + digest(result));
});

test('P07-R4 plant: both exports follow a replacement loaded stamp rather than hardcoded identity', async () => {
  const replacement = { app: 'allmeta', version: 'v9.8.7-test', sha: 'b'.repeat(40),
    shortSha: 'bbbbbbb', builtAt: '2030-01-02T03:04:05Z', url: 'https://example.invalid/' };
  const h = harness(replacement);
  assert.deepEqual((await h.mainJSON()).producedBy, replacement);
  assert.deepEqual((await h.extrasJSON()).producedBy, replacement);
});

test('P07-R4 plant: an unavailable build stamp is explicitly null in both exports', async () => {
  const h = harness(null);
  assert.equal((await h.mainJSON()).producedBy, null);
  assert.equal((await h.extrasJSON()).producedBy, null);
});

test('P07-R4 control: exports remain usable with unchanged values when the build stamp is unavailable', async () => {
  const h = harness(null), loaded = app();
  assert.deepEqual(withoutBuild(await h.mainJSON()), withoutBuild(await loaded.mainJSON()));
  assert.deepEqual(withoutBuild(await h.extrasJSON()), withoutBuild(await loaded.extrasJSON()));
});

test('P07-R4 control: editing input refuses stale extras and disables the download', async () => {
  const h = app();
  h.src.value += '\n7, 0.33, 0.12, new';
  assert.throws(() => h.context.AlmMultilevelPlus.exportText(), /out of date/);
  await h.src.dispatchEvent({ type: 'input' });
  assert.equal(h.ids.get('alm-plus-export').disabled, true);
  assert.equal(h.ids.get('alm-plus-output').children.length, 0);
  const count = h.downloads.length;
  await h.ids.get('alm-plus-export').click();
  assert.equal(h.downloads.length, count);
  assert.throws(() => h.context.AlmMultilevelPlus.exportText(), /out of date/);
});
