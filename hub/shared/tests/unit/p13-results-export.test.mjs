import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const exporterSource = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8');
const goshHTML = readFileSync(new URL('gosh/index.html', root), 'utf8');
const goshScript = goshHTML.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
const refused = '0.1, 0.2, A';
const formats = [
  ['report-txt', '-report.txt', 'text/plain'],
  ['report-md', '-report.md', 'text/markdown'],
  ['csv', '.csv', 'text/csv'],
  ['md', '.md', 'text/markdown'],
  ['json', '.json', 'application/json'],
];

// Run the production exporter and GOSH inline script, stubbing DOM/downloads
// and unrelated shared UI only. The exact controller is deliberately absent.
function harness() {
  const downloads = [], blobs = new Map(), nodes = {};
  function element(tag = 'div', attributes = {}) {
    let markup = '';
    return {
      tag, attributes, children: [], listeners: {}, style: {}, value: '', textContent: '',
      get innerHTML() { return markup; },
      set innerHTML(value) {
        markup = value;
        this.children = [];
        for (const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
          const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
          if (attrs['data-action'] || attrs.role) this.children.push(element(match[1], attrs));
        }
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      querySelector(selector) {
        const attribute = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
        return this.children.find(child => attribute
          ? child.attributes[attribute[1]] === attribute[2]
          : selector.startsWith('.') && (child.attributes.class || '').split(/\s+/).includes(selector.slice(1))) || null;
      },
      click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        return this.listeners.click?.();
      },
    };
  }
  for (const match of goshHTML.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) nodes[match[1]] = element();
  const mount = nodes['alm-export-mount'];
  const noop = () => {};
  const window = { alm: {
    analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
    axisControls: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(() => {}, { read: () => null, isSuspended: () => true }),
  } };
  const document = {
    title: 'GOSH', head: element('head'), body: element('body'),
    createElement: tag => element(tag), getElementById: id => nodes[id],
    querySelector: selector => selector.startsWith('#') ? nodes[selector.slice(1)] : null,
  };
  const context = vm.createContext({ window, document, Blob, console,
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    setTimeout(callback) { callback(); },
  });
  vm.runInContext(exporterSource, context, { filename: 'hub/shared/results-export.js' });
  return { window, nodes, mount, downloads,
    init(getResults, extra = {}) {
      window.alm.resultsExport({ target: mount, basename: 'gosh-results', getResults, ...extra });
    },
    loadGosh(text) {
      nodes.src.value = text;
      nodes.model.value = 'FE';
      vm.runInContext(goshScript, context, { filename: 'gosh/index.html:inline' });
      assert.equal(window.AlmGoshExact, undefined);
    },
    run(text) { nodes.src.value = text; return nodes['btn-run'].click(); },
    click(action) {
      const button = mount.querySelector(`[data-action="${action}"]`);
      assert.ok(button, `${action} button exists in production markup`);
      return button.click();
    },
  };
}

function noResults(h, previousDownloads = 0) {
  assert.equal(h.downloads.length, previousDownloads, 'no result must not create a download');
  const status = h.mount.querySelector('[role="status"]');
  assert.ok(status, 'export refusal must have a visible status message');
  assert.notEqual(status.hidden, true);
  assert.match(status.textContent, /no results/i);
  assert.match(status.textContent, /run.*analysis.*export/i);
}

async function successfulDownload(h, action, suffix, mime) {
  const before = h.downloads.length;
  const current = JSON.parse(JSON.stringify(h.window._almLastGosh()));
  await h.click(action);
  assert.equal(h.downloads.length, before + 1);
  const download = h.downloads.at(-1);
  assert.equal(download.name, 'gosh-results' + suffix);
  assert.equal(download.blob.type, mime);
  const text = await download.blob.text();
  if (action === 'json') assert.deepEqual(JSON.parse(text), current);
  else {
    assert.ok(text.includes(String(current.median_est)), 'current result is serialized without changing its value');
    if (action === 'report-txt') assert.match(text, /RESULTS\n\nk: 3\nmodel: FE/);
    else if (action === 'csv') assert.match(text, /\r\nk,3\r\nmodel,FE\r\n/);
    else assert.match(text, /\| k\s*\| 3\s*\|/);
    if (action === 'report-md') assert.match(text, /## Methods[\s\S]*## Results/);
  }
  const status = h.mount.querySelector('[role="status"]');
  if (status) assert.equal(status.textContent, '', 'successful export clears the refusal message');
}

for (const [action, suffix, mime] of formats) {
  test(`plant P13-R3: ${action} explains fresh GOSH k=1 refusal without a download`, async () => {
    const h = harness();
    h.loadGosh(refused);
    assert.equal(h.window._almLastGosh(), null);
    assert.match(h.nodes['input-error'].textContent, /at least 3 valid studies.*found 1/);
    await h.click(action);
    noResults(h);
  });

  test(`control P13-R3: ${action} downloads current successful GOSH results`, async () => {
    const h = harness();
    h.loadGosh(good);
    assert.equal(h.window._almLastGosh().k, 3);
    await successfulDownload(h, action, suffix, mime);
  });

  test(`plant P13-R3: ${action} blocks a refused rerun and exports again after recovery`, async () => {
    const h = harness();
    h.loadGosh(good);
    await successfulDownload(h, action, suffix, mime);
    h.run(refused);
    assert.equal(h.window._almLastGosh(), null);
    await h.click(action);
    noResults(h, 1);
    h.run(good.replace('0.1,', '0.7,'));
    await successfulDownload(h, action, suffix, mime);
  });

  test(`plant P13-R3: ${action} handles an undefined result once without requesting a receipt`, async () => {
    const h = harness();
    let reads = 0, receipts = 0;
    h.window.AlmTruthCertExport = { buildReceipt() { throw new Error('absent results must not be signed'); } };
    h.init(() => { reads++; return undefined; }, { getReceiptInput() { receipts++; return {}; } });
    await h.click(action);
    noResults(h);
    assert.equal(reads, 1);
    assert.equal(receipts, 0);
  });
}

test('control P13-R3: JSON still signs a current result read once', async () => {
  const h = harness();
  let reads = 0, signatures = 0;
  const current = { k: 3, label: 'current result' };
  const input = { results: current };
  const receipt = { id: 'test receipt' };
  h.window.AlmTruthCertExport = { async buildReceipt(actual) {
    assert.equal(actual, input);
    signatures++;
    return { signed: true, receipt };
  } };
  h.init(() => { reads++; return current; }, { getReceiptInput: () => input });
  await h.click('json');
  assert.equal(reads, 1);
  assert.equal(signatures, 1);
  assert.equal(h.downloads.length, 1);
  assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), { ...current, _truthcert: receipt });
  assert.deepEqual(current, { k: 3, label: 'current result' }, 'signing must not mutate the result');
});

test('control P13-R3: an empty object retains its existing JSON export', async () => {
  const h = harness();
  h.init(() => ({}));
  await h.click('json');
  assert.equal(h.downloads.length, 1);
  assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), {});
});
