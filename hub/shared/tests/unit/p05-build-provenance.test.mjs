import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('heterogeneity/index.html');
const adapter = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.includes('window.__almResults = function'));
assert.ok(adapter, 'The actual heterogeneity results adapter must be exercised');
const plain = value => JSON.parse(JSON.stringify(value));
const formats = [
  ['json', '.json', 'application/json'],
  ['csv', '.csv', 'text/csv'],
  ['md', '.md', 'text/markdown'],
  ['report-md', '-report.md', 'text/markdown'],
  ['report-txt', '-report.txt', 'text/plain'],
];

// Deliberate adapter sentinels, not statistical reference values or R oracles.
const studies = [{ label: 'A', est: 0.2, se: 0.1 }, { label: 'B', est: 0.3, se: 0.2 }];
const info = {
  sum: { mu: 0.25, se: 0.125, ciLo: 0, ciHi: 0.5, ciLoHKSJ: -0.25, ciHiHKSJ: 0.75,
    Q: 2, df: 1, pQ: 0.15, I2: 50, I2Model: 40, seHKSJ: 0.25, tau2: 0.02 },
  estimator: 'pm', tauEstimates: { pm: 0.02, reml: 0.03, dl: 0.01 }, pi: { lo: -0.5, hi: 1 },
};
const expectedData = {
  _schema: 'heterogeneity-results-v1', k: 2,
  I2_definition: 'Q-based; retained for backwards compatibility',
  I2_model_definition: '100*tau2/(tau2+v_typical)',
  I2_ci_definition: 'Model-based I2 obtained by transforming Q-profile tau2 limits',
  normal_interval_test: 'z', modified_HK_test: 'adhoc', prediction_interval_test: 't',
  prediction_interval_SE: 'unadjusted model SE', studies,
  mu: 0.25, se: 0.125, ci_lb: 0, ci_ub: 0.5, ci_lb_hksj: -0.25, ci_ub_hksj: 0.75,
  Q: 2, Q_df: 1, Q_p: 0.15, I2: 50, I2_Q: 50, I2_model: 40, se_modified_hk: 0.25,
  tau2: 0.02, tau2_estimator: 'pm', tau2_pm: 0.02, tau2_reml: 0.03, tau2_dl: 0.01,
  pi_lb: -0.5, pi_ub: 1, tau2_ci_lb: 0.005, tau2_ci_ub: 0.08, I2_ci_lb: 10, I2_ci_ub: 80,
};

function harness({ loadBuild = true } = {}) {
  const listeners = new Map(), blobs = new Map(), downloads = [];
  const mount = {
    innerHTML: '',
    querySelector(selector) {
      const action = /^\[data-action="([\w-]+)"\]$/.exec(selector)?.[1];
      assert.ok(action, selector);
      return { addEventListener(event, fn) { assert.equal(event, 'click'); listeners.set(action, fn); } };
    },
  };
  const pageCopy = {
    h1: html.match(/<h1>(.*?)<\/h1>/s)[1],
    'header p': html.match(/<header>\s*<h1>.*?<\/h1>\s*<p>(.*?)<\/p>/s)[1],
  };
  const document = {
    title: 'Heterogeneity Explorer',
    head: { appendChild() {} }, body: { appendChild() {}, removeChild() {} },
    querySelector(selector) {
      if (selector === '#alm-export-mount') return mount;
      return Object.hasOwn(pageCopy, selector) ? { textContent: pageCopy[selector] } : null;
    },
    querySelectorAll() { return []; },
    createElement(tag) {
      if (tag === 'style') return {};
      assert.equal(tag, 'a');
      return { click() { downloads.push({ blob: blobs.get(this.href), name: this.download }); } };
    },
  };
  const window = {
    alm: { csvUpload() {}, axisControls() {}, urlState: Object.assign(() => {}, { read: () => ({}) }),
      resetUndo() {}, tooltips() {} },
    _almLastFE: () => structuredClone(info), _almLastStudies: () => structuredClone(studies),
    __almQProfileCI: () => ({ tau2Lo: 0.005, tau2Hi: 0.08, I2Lo: 10, I2Hi: 80 }),
  };
  const context = vm.createContext({ window, document, Blob, console,
    URL: { createObjectURL(blob) { const url = `blob:${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); } },
    setTimeout(fn) { fn(); },
  });
  if (loadBuild) vm.runInContext(read('shared/build-info.js'), context, { filename: 'shared/build-info.js' });
  vm.runInContext(read('hub/shared/results-export.js'), context, { filename: 'hub/shared/results-export.js' });
  vm.runInContext(adapter[2], context, { filename: 'heterogeneity/index.html:results-adapter' });
  return {
    window,
    async download(action) {
      const count = downloads.length;
      assert.ok(listeners.has(action), `Actual exporter must register ${action}`);
      await listeners.get(action)();
      assert.equal(downloads.length, count + 1);
      const { blob, name } = downloads.at(-1);
      assert.ok(blob instanceof Blob);
      return { text: await blob.text(), name, type: blob.type };
    },
  };
}

function assertField(action, text, key, value) {
  if (action === 'json') {
    const actual = key.split('.').reduce((obj, part) => obj?.[part], JSON.parse(text));
    assert.equal(actual, value, `${action}: missing or incorrect ${key}`);
  } else if (action === 'csv') {
    assert.ok(text.split('\r\n').includes(`${key},${value}`), `${action}: missing or incorrect ${key}`);
  } else if (action === 'report-txt') {
    assert.ok(text.split('\n').includes(`${key}: ${value}`), `${action}: missing or incorrect ${key}`);
  } else {
    assert.ok(text.split('\n').some(line => {
      const cells = line.split('|').map(cell => cell.trim());
      return cells[1] === key && cells[2] === String(value);
    }), `${action}: missing or incorrect ${key}`);
  }
}

test('P05-R4 control: build-info loads synchronously before the results adapter', () => {
  const tag = /<script\b([^>]*\bsrc="\.\.\/shared\/build-info\.js"[^>]*)><\/script>/.exec(html);
  assert.ok(tag);
  assert.doesNotMatch(tag[1], /\b(?:async|defer|type\s*=\s*["']module["'])\b/);
  assert.ok(tag.index < adapter.index);
  const build = harness().window.AlmBuildInfo;
  assert.ok(build.version);
  assert.match(build.sha, /^[0-9a-f]{40}$/);
  assert.ok(build.builtAt);
});

for (const [action, extension, type] of formats) {
  for (const field of ['version', 'sha']) {
    test(`P05-R4 plant: ${action} retains loaded build ${field}`, async () => {
      const h = harness();
      const exported = await h.download(action);
      assertField(action, exported.text, `producedBy.${field}`, h.window.AlmBuildInfo[field]);
    });
  }
  test(`P05-R4 control: ${action} preserves analysis data and download contract`, async () => {
    const h = harness();
    const { producedBy, ...data } = plain(h.window.__almResults());
    assert.deepEqual(data, expectedData);
    const exported = await h.download(action);
    assert.equal(exported.name, `heterogeneity-results${extension}`);
    assert.equal(exported.type, type);
    for (const field of ['k', 'mu', 'se', 'Q', 'I2', 'tau2', 'tau2_estimator', 'pi_lb', 'tau2_ci_lb']) {
      assertField(action, exported.text, field, expectedData[field]);
    }
    if (action === 'json') {
      const { producedBy, ...payload } = JSON.parse(exported.text);
      assert.deepEqual(payload, expectedData);
    }
    if (action.startsWith('report-')) {
      assert.match(exported.text, /Generated \d{4}-\d{2}-\d{2}/);
      assert.match(exported.text, action === 'report-md' ? /## Methods/ : /\nMETHODS\n/);
      assert.match(exported.text, action === 'report-md' ? /## Results/ : /\nRESULTS\n/);
    }
  });
}

test('P05-R4 plant: every format uses the runtime identity instead of a hard-coded release', async () => {
  const h = harness();
  const alternate = Object.freeze({ app: 'allmeta', version: 'v0.0.0-provenance-test',
    sha: '0123456789abcdef0123456789abcdef01234567', builtAt: '2000-01-02T03:04:05Z' });
  h.window.AlmBuildInfo = alternate;
  for (const [action] of formats) {
    const exported = await h.download(action);
    for (const [field, value] of Object.entries(alternate)) assertField(action, exported.text, `producedBy.${field}`, value);
  }
});

test('P05-R4 plant: results capture build identity without aliasing the global object', () => {
  const h = harness(), build = h.window.AlmBuildInfo;
  const out = h.window.__almResults();
  assert.ok(out.producedBy);
  assert.notEqual(out.producedBy, build);
  for (const field of ['app', 'version', 'sha', 'builtAt']) assert.equal(out.producedBy[field], build[field]);
  const captured = plain(out.producedBy);
  build.version = 'changed-after-capture';
  assert.deepEqual(plain(out.producedBy), captured);
});

test('P05-R4 plant: unavailable build identity is explicitly unknown in every format', async () => {
  const h = harness({ loadBuild: false });
  for (const [action] of formats) {
    const exported = await h.download(action);
    for (const [field, value] of Object.entries({ app: 'allmeta', version: 'unknown', sha: 'unknown', builtAt: '' })) {
      assertField(action, exported.text, `producedBy.${field}`, value);
    }
  }
});

test('P05-R4 control: missing build helper does not block exports or change analysis data', async () => {
  const h = harness({ loadBuild: false });
  const { producedBy, ...data } = plain(h.window.__almResults());
  assert.deepEqual(data, expectedData);
  for (const [action] of formats) assertField(action, (await h.download(action)).text, 'mu', expectedData.mu);
});
