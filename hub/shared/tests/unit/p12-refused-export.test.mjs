import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('limit-ma/index.html', root), 'utf8');
const exporter = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8');
const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
const recovered = '0.4, 0.2, A\n0.5, 0.3, B\n0.6, 0.4, C\n0.7, 0.5, D';
const formats = [
  ['csv', '.csv', 'text/csv'],
  ['md', '.md', 'text/markdown'],
  ['report-md', '-report.md', 'text/markdown'],
  ['report-txt', '-report.txt', 'text/plain'],
  ['json', '.json', 'application/json'],
];

// Execute the real page and exporter. Only browser plumbing and unrelated UI
// modules are stubbed; downloads stay in memory and no browser is required.
function load() {
  const nodes = {}, downloads = [], blobs = new Map();
  let urlsCreated = 0;
  function element(tag = 'div', attrs = {}) {
    let markup = '', children = [];
    const listeners = {};
    return {
      value: '', textContent: '', attrs, parentNode: {},
      get innerHTML() { return markup; },
      set innerHTML(value) {
        markup = value;
        children = [];
        for (const m of value.matchAll(/<(button|span)\b([^>]*)>/g)) {
          const attributes = {};
          for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[a[1]] = a[2] ?? '';
          children.push(element(m[1], attributes));
        }
      },
      querySelector(selector) {
        const m = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        assert.ok(m, 'supported export selector: ' + selector);
        return children.find(child => Object.hasOwn(child.attrs, m[1]) &&
          (m[2] === undefined || child.attrs[m[1]] === m[2])) || null;
      },
      addEventListener(event, listener) { listeners[event] = listener; },
      click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        else return listeners.click?.();
      },
      setAttribute(key, value) { this.attrs[key] = value; },
      appendChild() {}, removeChild() {},
    };
  }
  for (const m of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) nodes[m[2]] = element(m[1]);
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = {
    title: 'Limit meta-analysis', head: element('head'), body: element('body'),
    getElementById: id => nodes[id] || null,
    querySelector: selector => selector.startsWith('#') ? nodes[selector.slice(1)] || null : null,
    querySelectorAll: () => [], createElement: element,
  };
  const noop = () => {};
  const window = { alm: {
    analysisLifecycle: run => run, csvUpload: noop, plotExport: noop, axisControls: noop,
    urlState: Object.assign(noop, { read: () => null }), resetUndo: noop, tooltips: noop,
  } };
  const context = vm.createContext({ window, document, console, Blob, structuredClone,
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + ++urlsCreated; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    setTimeout(fn) { fn(); },
  });
  vm.runInContext(exporter, context, { filename: 'hub/shared/results-export.js' });
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context, { filename: 'limit-ma/index.html' });
  const mount = nodes['alm-export-mount'];
  return {
    window, nodes, downloads,
    get urlsCreated() { return urlsCreated; },
    get status() { return mount.querySelector('[data-export-status]'); },
    result: () => window._almLastLimit(),
    run(text) { nodes.src.value = text; nodes['btn-run'].click(); },
    click(action) { return mount.querySelector('[data-action="' + action + '"]').click(); },
  };
}

async function assertDownload(h, format, expected) {
  const [action, suffix, mime] = format;
  const count = h.downloads.length;
  await h.click(action);
  assert.equal(h.downloads.length, count + 1);
  const download = h.downloads.at(-1);
  assert.equal(download.name, 'limit-ma-results' + suffix);
  assert.equal(download.blob.type, mime);
  const text = await download.blob.text();
  assert.doesNotMatch(text, /No results yet/);
  if (action === 'json') {
    assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(expected)));
  } else {
    for (const key of ['k', 'limit_est', 'limit_se', 'tau2_dl']) {
      if (action === 'csv') assert.ok(text.split('\r\n').includes(key + ',' + expected[key]), key);
      else if (action === 'report-txt') assert.ok(text.split('\n').includes(key + ': ' + expected[key]), key);
      else {
        const row = text.split('\n').find(line => line.split('|')[1]?.trim() === key);
        assert.ok(row, key);
        assert.equal(row.split('|')[2].trim(), String(expected[key]), key);
      }
    }
    if (action === 'report-md') { assert.match(text, /## Methods/); assert.match(text, /## Results/); }
    if (action === 'report-txt') { assert.match(text, /\nMETHODS\n/); assert.match(text, /\nRESULTS\n/); }
  }
}

function assertNoResults(h) {
  assert.equal(h.downloads.length, 0, 'absent results must not create a download');
  assert.equal(h.urlsCreated, 0, 'absent results must not allocate a download URL');
  assert.ok(h.status, 'an accessible status must explain the refused export');
  assert.equal(h.status.attrs.role, 'status');
  assert.match(h.status.textContent, /No results yet.*run the analysis first.*export/i);
}

for (const format of formats) {
  const [action] = format;
  test(`control P12-R3: ${action} exports the successful limit-ma snapshot`, async () => {
    const h = load();
    h.run(good);
    assert.equal(h.result().k, 3);
    await assertDownload(h, format, h.result());
  });

  test(`plant P12-R3: ${action} explains k=2 refusal without download and recovers`, async () => {
    const h = load();
    h.run(good);
    assert.equal(h.result().k, 3, 'a previous successful fit must exist');
    h.run('0.1, 0.2, A\n0.2, 0.3, B');
    assert.equal(h.result(), null);
    assert.match(h.nodes['limit-error'].textContent, /At least three valid studies/);
    await h.click(action);
    assertNoResults(h);
    // Read the current snapshot on every click, including a repeated refusal.
    await h.click(action);
    assertNoResults(h);
    h.run(recovered);
    assert.equal(h.result().k, 4);
    await assertDownload(h, format, h.result());
    assert.equal(h.status.textContent, '', 'successful export clears the no-results status');
  });

  test(`plant P12-R3: ${action} explains an undefined snapshot without download`, async () => {
    const h = load();
    h.window._almLastLimit = () => undefined;
    await h.click(action);
    assertNoResults(h);
  });
}
