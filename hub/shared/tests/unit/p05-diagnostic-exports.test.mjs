import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('heterogeneity/index.html', root), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const DATA = 'Trial, "Alpha",-0.5,0.1\nBeta,0.1,0.4\nGamma,1.2,0.2';
const formats = ['json', 'csv', 'md', 'report-md', 'report-txt'];
const plain = value => JSON.parse(JSON.stringify(value));

// Run the unchanged application script blocks, numerical engines and exporter.
// Only DOM, storage and download plumbing are faked; no fitted results are mocked.
function harness() {
  const nodes = new Map(), downloads = [], blobs = new Map();
  function element(id = '') {
    const listeners = new Map(), children = new Map();
    return {
      id, value: '', innerHTML: '', textContent: '', hidden: false,
      classList: { add() {}, remove() {} },
      setAttribute(key, value) { this[key] = value; },
      appendChild() {}, removeChild() {},
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      async dispatchEvent(event) {
        for (const fn of listeners.get(event.type) || []) await fn(event);
      },
      closest(selector) { return selector === 'button' ? this : null; },
      querySelector(selector) {
        const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
        if (!action) return null;
        assert.ok(this.innerHTML.includes(`data-action="${action}"`), selector);
        if (!children.has(action)) children.set(action, element(action));
        return children.get(action);
      },
      click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
      },
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], element(match[1]));
  const document = {
    title: 'Heterogeneity Explorer', head: element(), body: element(),
    getElementById: id => nodes.get(id) || null,
    createElement: () => element(),
    addEventListener() {},
    querySelector: selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) || null : null,
    querySelectorAll: selector => selector === '[id^="f-"]'
      ? [...nodes.values()].filter(el => el.id.startsWith('f-')) : [],
  };
  const saved = new Map([['heterogeneity-v1', JSON.stringify({ data: DATA, tau2: 'pm' })]]);
  const urlState = Object.assign(() => {}, { read: () => null, write() {} });
  const window = { alm: {
    csvUpload() {}, axisControls() {}, plotExport() {}, tooltips() {},
    resetUndo: Object.assign(() => {}, { snapshot() {} }), urlState,
  } };
  const context = vm.createContext({
    window, document, console, Blob,
    Event: class { constructor(type) { this.type = type; } },
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    URL: {
      createObjectURL(blob) { const url = `blob:${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL() {},
    },
    setTimeout() {},
  });
  for (const file of ['shared/ma-core.js', 'shared/heterogeneity-ci.js',
    'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  for (const marker of ['function computeAll(', 'window.__almResults = function']) {
    const block = blocks.find(source => source.includes(marker));
    assert.ok(block, `application block: ${marker}`);
    vm.runInContext(block, context, { filename: 'heterogeneity/index.html' });
  }
  return {
    window, nodes,
    async fit(data = DATA, estimator = 'pm') {
      nodes.get('f-data').value = data;
      nodes.get('f-tau2').value = estimator;
      await nodes.get('btn-run').dispatchEvent({ type: 'click' });
    },
    async download(format) {
      const mount = nodes.get('alm-export-mount');
      const button = mount.querySelector(`[data-action="${format}"]`);
      let blocked = false;
      const event = { type: 'click', target: button, preventDefault() {},
        stopImmediatePropagation() { blocked = true; } };
      const before = downloads.length;
      await mount.dispatchEvent(event); // real capture guard, including current-input refresh
      if (!blocked) await button.dispatchEvent(event);
      if (blocked) { assert.equal(downloads.length, before); return null; }
      assert.equal(downloads.length, before + 1);
      const { name, blob } = downloads.at(-1);
      assert.ok(name.startsWith('heterogeneity-results'));
      assert.ok(blob instanceof Blob);
      return blob.text();
    },
  };
}

function csvRows(text) {
  const rows = [], row = [];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\r' || char === '\n')) {
      row.push(cell); cell = '';
      if (char !== ',') {
        rows.push(row.splice(0));
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else cell += char;
  }
  row.push(cell); rows.push(row);
  return rows;
}

function fields(format, text) {
  if (format === 'json') return JSON.parse(text);
  if (format === 'csv') return Object.fromEntries(csvRows(text).slice(1));
  if (format === 'report-txt') return Object.fromEntries(text.split('\n')
    .filter(line => /^[\w.]+: /.test(line)).map(line => {
      const edge = line.indexOf(': '); return [line.slice(0, edge), line.slice(edge + 2)];
    }));
  return Object.fromEntries(text.split('\n').filter(line => line.startsWith('| '))
    .map(line => line.slice(1, -1).split('|').map(value => value.trim())));
}

async function exported(h, format) {
  const text = await h.download(format);
  assert.equal(typeof text, 'string', 'valid fit must download');
  return fields(format, text);
}

function diagnostic(output, format, key) {
  assert.ok(Object.hasOwn(output, key), `${format} must include fitted ${key}`);
  return format === 'json' ? output[key] : JSON.parse(output[key]);
}

for (const format of formats) {
  test(`plant P05-R3: ${format} preserves displayed leave-one-out rows at full precision`, async () => {
    const h = harness(), info = h.window._almLastFE();
    assert.equal(info.loo.length, 3);
    assert.equal((h.nodes.get('loo-table').innerHTML.match(/<tr><td>/g) || []).length, 3);
    assert.ok(info.loo.some(row => row.mu !== Number(row.mu.toFixed(3))));
    const output = await exported(h, format);
    assert.deepEqual(diagnostic(output, format, 'loo'), plain(info.loo));
  });

  test(`plant P05-R3: ${format} preserves numeric Baujat coordinates without layout state`, async () => {
    const h = harness(), info = h.window._almLastFE();
    assert.equal((h.nodes.get('svg-host').innerHTML.match(/<circle /g) || []).length, 3);
    assert.ok(info.baujat.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(info.baujat.some(point => Object.hasOwn(point, '_left')), 'plot has annotated its fitted points');
    const expected = plain(info.baujat.map(({ label, x, y }) => ({ label, x, y })));
    assert.deepEqual(diagnostic(await exported(h, format), format, 'baujat'), expected);
  });
}

test('control: existing pooled summaries and study data agree across every export format', async () => {
  const h = harness(), info = h.window._almLastFE();
  const expected = { k: info.k, mu: info.sum.mu, se: info.sum.se, Q: info.sum.Q,
    I2: info.sum.I2, tau2: info.tau2, ci_lb: info.sum.ciLo, ci_ub: info.sum.ciHi,
    ci_lb_hksj: info.sum.ciLoHKSJ, ci_ub_hksj: info.sum.ciHiHKSJ,
    pi_lb: info.pi.lo, pi_ub: info.pi.hi, tau2_estimator: info.estimator };
  for (const format of formats) {
    const output = await exported(h, format);
    for (const [key, value] of Object.entries(expected)) assert.equal(String(output[key]), String(value), `${format}.${key}`);
    assert.deepEqual(diagnostic(output, format, 'studies'), plain(h.window._almLastStudies()));
  }
});

test('plant P05-R3: diagnostic exports are detached copies of the fitted cache', () => {
  const h = harness(), info = h.window._almLastFE(), before = plain(info);
  const output = h.window.__almResults();
  assert.ok(Array.isArray(output.loo) && Array.isArray(output.baujat));
  output.loo[0].mu = 12345; output.loo[0].label = 'changed'; output.loo.pop();
  output.baujat[0].x = 12345; output.baujat[0].label = 'changed'; output.baujat.pop();
  assert.deepEqual(plain(info), before);
  assert.deepEqual(plain(h.window.__almResults().loo), before.loo);
});

test('plant P05-R3: cropped Baujat axes retain all fitted diagnostics in every format', async () => {
  const h = harness(), before = plain(h.window._almLastFE());
  h.window.__almAxis = { x: [0, 0.01], y: [0, 0.01] };
  await h.fit();
  assert.ok((h.nodes.get('svg-host').innerHTML.match(/<circle /g) || []).length < 3);
  assert.match(h.nodes.get('baujat-range-note').textContent, /outside the selected axis range/);
  for (const format of formats) {
    const output = await exported(h, format);
    assert.deepEqual(diagnostic(output, format, 'loo'), before.loo);
    assert.deepEqual(diagnostic(output, format, 'baujat'), before.baujat.map(({ label, x, y }) => ({ label, x, y })));
  }
});

test('control: empty, single-study and invalid inputs expose no fitted diagnostics and block downloads', async () => {
  const h = harness();
  for (const data of ['', 'Solo,0.2,0.1', 'Bad,no,0.1\nValid,0.2,0.1']) {
    await h.fit(DATA);
    await h.fit(data);
    assert.equal(h.window._almLastFE(), null);
    const output = h.window.__almResults();
    for (const key of ['mu', 'loo', 'baujat']) assert.equal(Object.hasOwn(output, key), false, key);
    for (const format of formats) assert.equal(await h.download(format), null);
  }
});

test('plant P05-R3: a new two-study zero-effect fit replaces diagnostics and retains zero coordinates', async () => {
  const h = harness();
  await h.fit('Zero A,0,0.1\nZero B,0,0.2', 'reml');
  const info = h.window._almLastFE();
  assert.equal(info.estimator, 'reml');
  assert.equal(info.loo.length, 2);
  assert.ok(info.loo.every(row => row.k === 1 && row.tau2 === 0));
  for (const format of formats) {
    const output = await exported(h, format);
    assert.deepEqual(diagnostic(output, format, 'loo'), plain(info.loo));
    assert.deepEqual(diagnostic(output, format, 'baujat'), [
      { label: 'Zero A', x: 0, y: 0 }, { label: 'Zero B', x: 0, y: 0 },
    ]);
  }
});
