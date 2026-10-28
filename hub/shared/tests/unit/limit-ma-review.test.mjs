import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('limit-ma/index.html');
const pageScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const plain = value => JSON.parse(JSON.stringify(value));

// Run the actual page engine, build identity and shared download handler.
// Only DOM and unrelated shared UI modules are stubbed; no estimator is copied.
function harness({ buildInfo = true } = {}) {
  const nodes = {}, blobs = new Map(), downloads = [];
  function node() {
    return {
      value: '', innerHTML: '', textContent: '',
      addEventListener(event, fn) { this[event] = fn; },
      appendChild() {}, removeChild() {},
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes[match[1]] = node();
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const buttons = Object.fromEntries(
    ['report-md', 'report-txt', 'json', 'csv', 'md'].map(action => [action, node()]));
  nodes['alm-export-mount'].querySelector = selector => {
    const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
    assert.ok(buttons[action], `Unexpected export selector: ${selector}`);
    return buttons[action];
  };
  const document = {
    head: node(), body: node(),
    getElementById: id => nodes[id] || null,
    querySelector: selector => nodes[selector.slice(1)] || null,
    querySelectorAll: () => [],
    createElement(tag) {
      const element = node();
      if (tag === 'a') element.click = () => downloads.push({
        name: element.download, blob: blobs.get(element.href),
      });
      return element;
    },
  };
  const noop = () => {};
  const window = { alm: {
    analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
    axisControls: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null }),
  } };
  const context = vm.createContext({
    window, document, structuredClone, console, Blob,
    URL: {
      createObjectURL(blob) {
        const url = `blob:limit-ma-test-${blobs.size}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    setTimeout(fn) { fn(); },
  });
  if (buildInfo) {
    assert.match(html, /<script src="\.\.\/shared\/build-info\.js"><\/script>/);
    vm.runInContext(read('shared/build-info.js'), context);
  }
  vm.runInContext(read('hub/shared/results-export.js'), context);
  vm.runInContext(pageScript, context);
  return {
    window, nodes,
    run(text) { nodes.src.value = text; nodes['btn-run'].click(); },
    async download() {
      const before = downloads.length;
      await buttons.json.click();
      assert.equal(downloads.length, before + 1);
      const { name, blob } = downloads.at(-1);
      assert.equal(name, 'limit-ma-results.json');
      assert.equal(blob.type, 'application/json');
      return JSON.parse(await blob.text());
    },
  };
}

test('P12-R3 planted defect: downloaded JSON includes the loaded producedBy build identity', async () => {
  const h = harness();
  assert.ok(h.window._almLastLimit(), 'The page must have a fitted result');
  const expected = plain(h.window.AlmBuildInfo);
  assert.ok(expected.version && expected.sha && expected.builtAt);
  const exported = await h.download();
  assert.deepEqual(exported.producedBy, expected);
});

test('P12-R3 control: download preserves the displayed fit, null diagnostics and validation quantities', async () => {
  const h = harness();
  for (const text of [h.nodes.src.value, '0, 0.1\n0, 0.2\n0, 0.3']) {
    h.run(text);
    const fitted = h.window._almLastLimit();
    assert.ok(fitted);
    const before = plain(fitted);
    const snapshot = plain(h.window.__almLimitValidationSnapshot());
    Object.freeze(fitted.te_limit);
    Object.freeze(fitted);
    Object.freeze(h.window.AlmBuildInfo);
    // Pending edits must not silently replace the displayed analysis on export.
    h.nodes.src.value = '0.1, 0.2\n0.2, 0.3';
    const { producedBy, ...quantities } = await h.download();
    assert.deepEqual(quantities, before);
    assert.strictEqual(h.window._almLastLimit(), fitted);
    assert.deepEqual(plain(fitted), before);
    assert.equal(Object.hasOwn(fitted, 'producedBy'), false);
    const after = plain(h.window.__almLimitValidationSnapshot());
    assert.deepEqual(after.result, snapshot.result);
    assert.deepEqual(after.dom, snapshot.dom);
    if (text.startsWith('0,')) assert.equal(quantities.G_squared, null);
  }
});

test('P12-R3 control: unavailable build info preserves the existing numerical JSON payload', async () => {
  const h = harness({ buildInfo: false });
  assert.deepEqual(await h.download(), plain(h.window._almLastLimit()));
});

test('P12-R3 control: a refused analysis still downloads null instead of stale results', async () => {
  const h = harness();
  assert.ok(h.window._almLastLimit());
  h.run('0.1, 0.2\n0.2, 0.3');
  assert.equal(h.window._almLastLimit(), null);
  assert.equal(await h.download(), null);
});
