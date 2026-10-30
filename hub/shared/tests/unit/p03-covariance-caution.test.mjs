import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../../../../dta-sroc/index.html');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('const LS_KEY = "dta-sroc-v1"'));
assert.ok(app, 'the real dta-sroc application script must be present');
const engine = read('../../../../shared/dta-bivariate.js');
const exporter = read('../../results-export.js');
const lifecycle = read('../../analysis-lifecycle.js');
const caution = method => `The ${method === 'mm' ? 'method of moments' : 'variance components'} estimate of the between-study covariance was not positive definite and was truncated (as mada does).`;
const clone = value => JSON.parse(JSON.stringify(value));

// Run the actual app, numerical engine, lifecycle and download handlers in Node.
// Only DOM/storage/URL services and unrelated UI modules are stand-ins.
function loadApp(method = 'mm') {
  const elements = new Map(), downloads = [], blobs = new Map();
  function element(id = '', tagName = 'DIV') {
    const listeners = new Map(), classes = new Set();
    return {
      id, tagName, value: '', innerHTML: '', textContent: '', hidden: false,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      appendChild() {}, removeChild() {},
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      async click() {
        if (tagName === 'A') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        for (const listener of listeners.get('click') || []) await listener({ target: this });
      },
      querySelector(selector) { return get(`${id} ${selector}`); }
    };
  }
  function get(id) {
    if (!elements.has(id)) elements.set(id, element(id, ['f-method', 'f-cc', 'f-cov', 'f-example'].includes(id) ? 'SELECT' : 'DIV'));
    return elements.get(id);
  }
  get('f-method').value = method;
  get('f-cc').value = 'all';
  const document = {
    title: 'DTA SROC Explorer', head: element(), body: element(),
    getElementById: get, createElement: tag => element('', tag.toUpperCase()),
    addEventListener() {},
    querySelector(selector) {
      if (selector.startsWith('#')) return get(selector.slice(1));
      if (selector === 'h1') return { textContent: 'DTA SROC Explorer' };
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[id^="f-"]' ? ['f-data', 'f-title', 'f-method', 'f-cc', 'f-cov'].map(get) : [];
    }
  };
  const urlState = Object.assign(() => {}, { read: () => null, write() {} });
  const context = vm.createContext({
    document, Blob, console, setTimeout() {}, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {} },
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL() {}
    },
    alm: { csvUpload() {}, axisControls() {}, plotExport() {}, resetUndo() {}, tooltips() {}, urlState }
  });
  context.window = context;
  for (const [source, filename] of [[engine, 'dta-bivariate.js'], [exporter, 'results-export.js'], [lifecycle, 'analysis-lifecycle.js'], [app, 'dta-sroc/index.html']]) {
    vm.runInContext(source, context, { filename });
  }
  return {
    context, get,
    results: () => clone(context.__almResults()),
    fit: () => context.__almBivariate(),
    restore: state => context.__almRestore({ ...context.__almSnapshot(), ...state }),
    async download(action) {
      const count = downloads.length;
      await get(`alm-export-mount [data-action="${action}"]`).click();
      assert.equal(downloads.length, count + 1, `the real ${action} handler must download one file`);
      const output = downloads.at(-1);
      assert.ok(output.blob instanceof Blob);
      return { name: output.name, text: await output.blob.text() };
    }
  };
}

for (const method of ['mm', 'vc']) {
  for (const action of ['report-txt', 'report-md', 'json']) {
    test(`plant P03-R2: ${method} ${action} retains the displayed covariance-truncation caution`, async () => {
      const app = loadApp(method), fit = app.fit(), message = caution(method);
      assert.ok(fit.negeigen > 0, 'the actual example fit must truncate covariance eigenvalues');
      assert.ok(app.get('warn-banner').classList.contains('is-visible'));
      assert.equal(app.get('warn-banner').innerHTML.split(message).length - 1, 1, 'the visible caution appears once');
      const output = await app.download(action);
      assert.equal(output.text.split(message).length - 1, 1, 'the standalone export must retain the exact displayed caution once');
      const results = action === 'json' ? JSON.parse(output.text) : app.results();
      assert.ok(results.warnings.includes(message), 'analysis warnings reach the common results object');
      assert.equal(results.bivariate.negeigen, fit.negeigen, 'retain the numerical truncation status');
      assert.deepEqual(results.errors, [], 'a numerical caution is not a failed fit');
      if (action !== 'json') {
        assert.match(output.text, /Methods|METHODS/);
        assert.match(output.text, /Results|RESULTS/);
        assert.match(output.text, /bivariate\.negeigen/);
      }
    });
  }
}

test('plant P03-R2: caution metadata is computed by analysis before rendering', () => {
  const app = loadApp('fixed');
  assert.doesNotMatch(app.get('warn-banner').innerHTML, /was truncated/);
  app.get('f-method').value = 'mm';
  const results = app.results();
  assert.ok(results.warnings?.includes(caution('mm')), 'fresh analysis must supply the caution without a render');
  assert.ok(results.bivariate.negeigen > 0);
  assert.doesNotMatch(app.get('warn-banner').innerHTML, /was truncated/, 'results access does not render');
});

test('control: fixed-effect report preserves summary estimates and has no truncation caution', async () => {
  const app = loadApp('fixed'), results = app.results(), fit = app.fit();
  assert.equal(results.k, 7);
  assert.equal(results.bivariate.method, 'fixed');
  assert.equal(results.bivariate.sens, +fit.sens.toFixed(6));
  assert.equal(results.bivariate.spec, +fit.spec.toFixed(6));
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.warnings ?? [], []);
  for (const action of ['report-txt', 'report-md', 'json']) {
    const output = await app.download(action);
    assert.match(output.text, /fixed/);
    assert.ok(output.text.includes(String(results.bivariate.sens)));
    assert.ok(output.text.includes(String(results.bivariate.spec)));
    assert.doesNotMatch(output.text, /was truncated/);
  }
});

test('control: a subsequent untruncated MM fit clears the previous caution', async () => {
  const app = loadApp('mm');
  assert.ok(app.fit().negeigen > 0);
  // Synthetic independent variation in logit Se/FPR: a positive definite covariance.
  const data = [[20, 10], [20, 70], [90, 10], [90, 70]]
    .map(([tp, fp], i) => `Study ${i + 1},${tp},${fp},${100 - tp},${100 - fp}`).join('\n');
  app.restore({ data });
  assert.equal(app.fit().negeigen, 0);
  assert.doesNotMatch(app.get('warn-banner').innerHTML, /was truncated/);
  assert.deepEqual(app.results().warnings ?? [], []);
  for (const action of ['report-txt', 'report-md', 'json']) {
    assert.doesNotMatch((await app.download(action)).text, /was truncated/);
  }
});

test('control: zero-cell correction metadata survives report and JSON export', async () => {
  const app = loadApp('fixed');
  const data = 'A,50,5,10,80\nB,40,0,8,75\nC,60,8,12,90\nD,30,4,15,70';
  for (const [cc, corrected] of [['single', [0, 1, 0, 0]], ['all', [1, 1, 1, 1]]]) {
    app.restore({ data, cc });
    const output = await app.download('json'), results = JSON.parse(output.text);
    assert.equal(results.correction_control, cc);
    assert.deepEqual(results.rows.map(row => row.corrected), corrected);
    assert.equal(results.rows[1].FP, 0, 'raw counts remain unchanged');
    assert.doesNotMatch(output.text, /was truncated/);
    const report = await app.download('report-txt');
    assert.ok(report.text.includes(`correction_control: ${cc}`));
    assert.match(report.text, /"corrected":1/);
  }
});
