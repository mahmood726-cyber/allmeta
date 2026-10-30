import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('gosh/index.html');
const pageScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const formats = ['json', 'csv', 'md', 'report-txt', 'report-md'];
const smallInput = '0.25, 0.5, A\n0.25, 1, B\n0.25, 2, C';
const sampledInput = Array.from({ length: 16 }, (_, i) => `${(i - 5) / 8}, 0.5, S${i + 1}`).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
const withoutSoftware = ({ software, ...result }) => result;

// Execute the production page, build script and exporter. Only DOM/download
// plumbing and unrelated shared widgets are stubbed; no browser is required.
function load({ build = 'loaded', input = smallInput, model = 'FE' } = {}) {
  const nodes = {}, buttons = {}, downloads = [], blobs = new Map();
  const noop = () => {};
  function element() {
    return { value: '', style: {}, textContent: '', innerHTML: '',
      addEventListener(event, fn) { this[event] = fn; },
      appendChild: noop, removeChild: noop };
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) nodes[match[1]] = element();
  for (const format of formats) buttons[format] = element();
  nodes['alm-export-mount'].querySelector = selector => buttons[selector.match(/data-action="([^"]+)"/)[1]];
  nodes.src.value = input;
  nodes.model.value = model;
  nodes['n-sample'].value = '32';
  const document = {
    title: 'GOSH', head: element(), body: element(),
    getElementById: id => nodes[id],
    querySelector: selector => selector.startsWith('#') ? nodes[selector.slice(1)] : null,
    createElement(tag) {
      const el = element();
      if (tag === 'a') el.click = () => downloads.push({ name: el.download, blob: blobs.get(el.href) });
      return el;
    },
  };
  const window = { alm: {
    analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
    axisControls: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null, write: () => true, isSuspended: () => false }),
  } };
  const context = vm.createContext({ window, document, Blob, console, setTimeout: noop,
    URL: { createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL: noop },
  });
  assert.match(html, /<script src="\.\.\/shared\/build-info\.js"><\/script>/);
  if (build === 'loaded') vm.runInContext(read('shared/build-info.js'), context);
  else if (build !== null) window.AlmBuildInfo = { ...build };
  vm.runInContext(read('hub/shared/results-export.js'), context);
  vm.runInContext(pageScript, context);
  return { window, nodes,
    async download(format) {
      const count = downloads.length;
      await buttons[format].click();
      assert.equal(downloads.length, count + 1, `${format} creates one download`);
      const { name, blob } = downloads.at(-1);
      return { name, text: await blob.text() };
    },
    run(input) { nodes.src.value = input; nodes['btn-run'].click(); },
  };
}

test('P13-R7 control: the page loads a version and full 40-character build SHA', () => {
  const h = load();
  assert.match(h.window.AlmBuildInfo.version, /^v?\d+\.\d+\.\d+/);
  assert.match(h.window.AlmBuildInfo.sha, /^[a-f0-9]{40}$/);
  assert.notEqual(h.window.AlmBuildInfo.version, 'gosh-results-v1');
});

for (const format of formats) {
  test(`P13-R7 plant: ${format} includes the loaded software version and full SHA`, async () => {
    for (const model of ['FE', 'DL']) for (const input of [smallInput, sampledInput]) {
      const h = load({ input, model });
      const { version, sha } = h.window.AlmBuildInfo;
      const exported = await h.download(format);
      if (format === 'json') {
        const result = JSON.parse(exported.text);
        assert.equal(result._schema, 'gosh-results-v1');
        assert.deepEqual(result.software, { version, sha });
      } else {
        for (const value of ['software.version', version, 'software.sha', sha]) {
          assert.ok(exported.text.includes(value), `${format} must include ${value}`);
        }
      }
    }
  });
}

test('P13-R7 plant: exports use the loaded identity rather than a hard-coded build', async () => {
  const build = { version: 'v99.1.2-test', sha: 'abcdef0123456789abcdef0123456789abcdef01' };
  const h = load({ build });
  assert.deepEqual(JSON.parse((await h.download('json')).text).software, build);
});

test('P13-R7 plant: unavailable build identity is explicitly unknown', async () => {
  const h = load({ build: null });
  assert.deepEqual(JSON.parse((await h.download('json')).text).software, { version: 'unknown', sha: 'unknown' });
});

test('P13-R7 control: homogeneous FE and DL exports retain schema, inputs and exact summaries', async () => {
  for (const model of ['FE', 'DL']) {
    const h = load({ model });
    const exported = await h.download('json');
    assert.equal(exported.name, 'gosh-results.json');
    const result = JSON.parse(exported.text);
    // Analytical control: identical effects have the same pooled estimate in
    // all seven non-empty subsets and zero heterogeneity. No R oracle is used.
    assert.deepEqual(withoutSoftware(result), {
      _schema: 'gosh-results-v1', k: 3, model, sampled: false, n_subsets: 7,
      median_est: 0.25, median_i2: 0, min_est: 0.25, max_est: 0.25,
      q25_est: 0.25, q75_est: 0.25,
      studies: [{ label: 'A', te: 0.25, se: 0.5 }, { label: 'B', te: 0.25, se: 1 }, { label: 'C', te: 0.25, se: 2 }],
    });
    assert.equal(h.nodes['m-n'].textContent, result.n_subsets.toLocaleString());
    assert.equal(h.nodes['m-est'].textContent, result.median_est.toFixed(3));
    assert.equal(h.nodes['m-i2'].textContent, result.median_i2.toFixed(1) + '%');
  }
});

test('P13-R7 control: build availability does not alter sampled FE/DL results or displayed values', async () => {
  for (const model of ['FE', 'DL']) {
    const h = load({ input: sampledInput, model });
    const absent = load({ input: sampledInput, model, build: null });
    const before = plain(h.window._almLastGosh());
    const result = JSON.parse((await h.download('json')).text);
    assert.deepEqual(result, before);
    assert.deepEqual(plain(h.window._almLastGosh()), before, 'export does not mutate results');
    assert.deepEqual(withoutSoftware(result), withoutSoftware(plain(absent.window._almLastGosh())));
    assert.equal(result._schema, 'gosh-results-v1');
    assert.equal(result.k, 16);
    assert.equal(result.sampled, true);
    assert.equal(result.n_subsets, 32);
    for (const key of ['median_est', 'median_i2', 'min_est', 'max_est', 'q25_est', 'q75_est']) assert.ok(Number.isFinite(result[key]), key);
    assert.equal(h.nodes['m-n'].textContent, result.n_subsets.toLocaleString());
    assert.equal(h.nodes['m-est'].textContent, result.median_est.toFixed(3));
    assert.equal(h.nodes['m-i2'].textContent, result.median_i2.toFixed(1) + '%');
  }
});

test('P13-R7 control: invalid input still clears the result and JSON does not revive it', async () => {
  const h = load();
  h.run('bad, 1');
  assert.equal(h.window._almLastGosh(), null);
  assert.equal(JSON.parse((await h.download('json')).text), null);
  h.run(smallInput);
  assert.equal(JSON.parse((await h.download('json')).text).n_subsets, 7);
});
