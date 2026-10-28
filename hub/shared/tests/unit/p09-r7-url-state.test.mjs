import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parseTable('));
const previous = '10, 100, A\n20, 100, B';
const current = '70, 100, A\n90, 100, B';
const oversized = '70, 100, ' + 'A'.repeat(5000) + '\n90, 100, B';
const plain = value => JSON.parse(JSON.stringify(value));

// Run the actual app, numerical core, lifecycle and URL module. Only peripheral
// UI mounts and the browser DOM are doubles; no computation/share code is copied.
function harness(hash = '') {
  const elements = new Map();
  for (const match of html.matchAll(/<[\w-]+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const attributes = new Map([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(attribute => [attribute[1], attribute[2]]));
    const handlers = new Map();
    elements.set(match[2], {
      id: match[2], value: '', textContent: '', innerHTML: '', style: {},
      hidden: /\bhidden\b/.test(match[1]),
      getAttribute(name) { return attributes.get(name) ?? null; },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      addEventListener(type, callback) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(callback);
      },
      dispatch(type) {
        for (const callback of handlers.get(type) || []) callback({ type, target: this });
      }
    });
  }
  elements.get('src').value = previous;
  elements.get('trans').value = 'logit';
  elements.get('tau-est').value = 'PM';
  const document = {
    getElementById: id => elements.get(id) ?? null,
    querySelectorAll: () => ['src', 'trans', 'tau-est'].map(id => elements.get(id)),
    addEventListener() {}
  };
  const noop = () => {};
  const window = { location: { hash }, alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop,
    resultsExport: noop, tooltips: noop, resetUndo: Object.assign(noop, { snapshot: noop })
  } };
  const context = vm.createContext({ window, document,
    console: { warn() {} }, escape, unescape, encodeURIComponent, decodeURIComponent,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary')
  });
  for (const path of ['shared/ma-core.js', 'hub/shared/url-state.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(appScript, context, { filename: 'proportion-ma/index.html' });
  return {
    window, elements, state: window.alm.urlState,
    get notice() { return document.getElementById('share-data-note'); },
    get results() { return plain(window._almLastPropMA()); },
    run(src, { trans = 'logit', tau = 'PM', validation = false } = {}) {
      elements.get('src').value = src;
      elements.get('trans').value = trans;
      elements.get('tau-est').value = tau;
      if (validation) window.__almPropValidation.run();
      else elements.get('btn-run').dispatch('click');
    }
  };
}

function assertNotice(h) {
  assert.ok(h.notice, 'a persistent sharing live region must exist');
  assert.equal(h.notice.getAttribute('role'), 'status');
  assert.equal(h.notice.getAttribute('aria-live'), 'polite');
  assert.equal(h.notice.hidden, false);
  assert.match(h.notice.textContent, /too (large|long).*URL/i);
  assert.match(h.notice.textContent, /cop(y|ying).*study data.*settings/i);
}

function assertQuiet(h) {
  assert.equal(h.notice?.textContent ?? '', '');
}

test('P09-R7 regression: oversized analysis clears the preceding share state', () => {
  const h = harness();
  assert.equal(h.state.read().src, previous);
  assert.ok(h.results.poolP < 0.5);
  h.run(oversized);
  assert.ok(h.results.poolP > 0.5, 'the new analysis really ran');
  assert.equal(h.state.read(), null, 'the preceding analysis must not remain shareable');
  assert.equal(h.window.location.hash, '');
});

test('P09-R7 regression: oversized analysis explains URL refusal in a live region', () => {
  const h = harness();
  assertQuiet(h);
  h.run(oversized);
  assertNotice(h);
  const notice = h.notice;
  h.run(oversized.replaceAll('A', 'B'));
  assert.equal(h.notice, notice);
  assertNotice(h);
});

test('P09-R7 regression: a fitting analysis restores sharing and clears the warning', () => {
  const h = harness();
  h.run(oversized);
  assertNotice(h);
  h.run(current, { trans: 'raw', tau: 'FE' });
  assert.deepEqual(plain(h.state.read()), { src: current, trans: 'raw', tau: 'FE' });
  assertQuiet(h);
});

test('P09-R7 control: short Unicode data and settings round trip through app reload', () => {
  const h = harness();
  const src = current.replace('A', '\u00e9\u754c');
  h.run(src, { trans: 'ft', tau: 'DL' });
  assert.deepEqual(plain(h.state.read()), { src, trans: 'ft', tau: 'DL' });
  const restored = harness(h.window.location.hash);
  assert.equal(restored.elements.get('src').value, src);
  assert.equal(restored.elements.get('trans').value, 'ft');
  assert.equal(restored.elements.get('tau-est').value, 'DL');
  assert.deepEqual(restored.results, h.results);
  assertQuiet(restored);
});

test('P09-R7 control: the shared writer keeps its 4096-byte encoded limit', () => {
  const h = harness();
  const state = { src: '', trans: 'logit', tau: 'PM' };
  const overhead = Buffer.byteLength(JSON.stringify({ v: 1, ...state }));
  state.src = 'a'.repeat(3072 - overhead); // 3072 bytes encode to 4096 base64 bytes.
  assert.equal(h.state.write(state), true);
  assert.equal(h.window.location.hash.length, 4096);
  assert.equal(h.state.read().src, state.src);
  state.src += 'a';
  assert.equal(h.state.write(state), false);
  assert.equal(h.window.location.hash.length, 4096);
});

test('P09-R7 regression: encoded Unicode overflow also clears the previous URL', () => {
  const h = harness();
  const src = '70, 100, ' + '\u754c'.repeat(1100) + '\n90, 100, B';
  assert.ok(src.length < 4096);
  h.run(src);
  assert.equal(h.state.read(), null);
  assertNotice(h);
});

test('P09-R7 control: validation and suspended writes preserve a valid URL and quiet notice', async () => {
  const h = harness();
  const hash = h.window.location.hash;
  h.run(oversized, { validation: true });
  assert.equal(h.window.location.hash, hash);
  assertQuiet(h);
  await h.state.withoutWrites(() => h.run(oversized));
  assert.equal(h.window.location.hash, hash);
  assertQuiet(h);
});

test('P09-R7 regression: suppressed runs preserve an existing oversize warning', async () => {
  const h = harness();
  h.run(oversized);
  assertNotice(h);
  const message = h.notice.textContent;
  h.run(current, { validation: true });
  assert.equal(h.notice.textContent, message);
  await h.state.withoutWrites(() => h.run(current));
  assert.equal(h.notice.textContent, message);
  assert.equal(h.state.read(), null);
  h.run(current);
  assertQuiet(h);
  assert.equal(h.state.read().src, current);
});

test('P09-R7 control: labels and URL refusal leave numerical results unchanged', () => {
  const h = harness();
  h.run(current);
  const results = h.results;
  h.run(oversized);
  assert.deepEqual(h.results, results);
  assert.match(h.elements.get('forest').innerHTML, /<polygon/);
});
