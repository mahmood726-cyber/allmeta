import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('meta-regression/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('const LS_KEY = "meta-regression-v1"'));
const adapter = scripts.find(s => s.includes('window.__almResults = function'));
assert.ok(engine && adapter, 'Use the actual page engine and export adapter');

const rows = [
  ['A', 0.10, 0.20, 1], ['B', 0.30, 0.25, 2],
  ['C', 0.50, 0.18, 3], ['D', 0.20, 0.30, 4],
  ['E', 0.90, 0.22, 5], ['F', 0.40, 0.28, 6],
  ['G', 1.10, 0.35, 7], ['H', 0.05, 0.15, 8],
];
const data = rs => rs.map(r => r.join(', ')).join('\n');
const inferenceKeys = ['slope_t', 'slope_p', 'perm_p', 'perm_exact', 'perm_nperm', 'pred_x', 'pred', 'pi_lb', 'pi_ub'];
const optionalKeys = inferenceKeys.slice(2);
const formats = ['json', 'csv', 'md', 'report-md', 'report-txt'];

// Only DOM/download plumbing is stubbed. The page's render/cache/adapter and
// shared result serializers run unchanged, with the real inference modules.
function boot(input, { optionalModules = true } = {}) {
  const elements = new Map(), blobs = new Map(), downloads = [];
  function element() {
    const listeners = new Map(), children = new Map();
    return {
      value: '', checked: false, innerHTML: '', textContent: '',
      classList: { add() {}, remove() {} },
      appendChild() {}, removeChild() {},
      addEventListener(type, fn) { listeners.set(type, fn); },
      dispatchEvent(event) { return listeners.get(event.type)?.(event); },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
      click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        return this.dispatchEvent({ type: 'click' });
      },
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const context = vm.createContext({
    Blob, console,
    setTimeout() {},
    Event: class { constructor(type) { this.type = type; } },
    URL: {
      createObjectURL(blob) { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; },
      revokeObjectURL() {},
    },
    localStorage: {
      getItem: () => JSON.stringify({ data: input }),
      setItem() {},
    },
    document: {
      title: 'Meta-Regression', head: element(), body: element(),
      getElementById: get,
      createElement: element,
      querySelector: selector => selector.startsWith('#') ? get(selector.slice(1)) : null,
    },
    alm: {
      analysisLifecycle: render => render,
      plotExport() {}, csvUpload() {}, axisControls() {}, resetUndo() {}, tooltips() {},
      urlState: Object.assign(() => {}, { read: () => null, write() {} }),
    },
  });
  context.window = context;
  if (optionalModules) {
    for (const path of ['shared/ma-core.js', 'shared/permutest.js']) vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(read('hub/shared/results-export.js'), context, { filename: 'results-export.js' });
  vm.runInContext(engine, context, { filename: 'meta-regression-engine.js' });
  vm.runInContext(adapter, context, { filename: 'meta-regression-adapter.js' });
  return {
    context,
    stats: () => get('stats-wrap').innerHTML,
    render(next) { get('f-data').value = next; get('f-data').dispatchEvent({ type: 'input' }); },
    async download(format) {
      await get('alm-export-mount').querySelector(`[data-action="${format}"]`).click();
      const file = downloads.pop();
      assert.ok(file, `${format} download produced`);
      return { name: file.name, text: await file.blob.text() };
    },
  };
}

function parseExport(format, text) {
  if (format === 'json') return JSON.parse(text);
  if (format === 'csv') return Object.fromEntries(text.split('\r\n').slice(1).map(line => line.split(',')));
  if (format === 'report-txt') return Object.fromEntries(text.split('\n').filter(line => /^\w+: /.test(line)).map(line => {
    const i = line.indexOf(': '); return [line.slice(0, i), line.slice(i + 2)];
  }));
  return Object.fromEntries(text.split('\n').filter(line => line.startsWith('| ')).map(line => line.split('|').slice(1, 3).map(cell => cell.trim())));
}

function expectedInference(app) {
  const w = app.context, f = w._almLastFitted().fit, hk = w._almLastHK();
  const perm = w._almLastPerm(), pi = w._almLastPI();
  // This is an export-fidelity test, not an independent statistical oracle:
  // compare cached full-precision results and the visible slope-test card.
  const slopeCard = app.stats().match(/t\((\d+)\) = ([^,]+), p = ([^<]+)/);
  assert.ok(slopeCard, 'Slope inference is visibly rendered');
  assert.equal(Number(slopeCard[1]), hk.df);
  return {
    slope_t: f.b1 / Math.sqrt(hk.varB1),
    slope_p: Number(slopeCard[3]),
    perm_p: perm.p, perm_exact: perm.exact, perm_nperm: perm.nperm,
    pred_x: pi.xbar, pred: pi.pred, pi_lb: pi.lo, pi_ub: pi.hi,
  };
}

for (const [label, input, exact] of [
  ['exact', data(rows.slice(0, 4)), true],
  ['Monte Carlo / negative slope', data(rows.map(([id, y, se, x]) => [id, y, se, -x])), false],
]) {
  const app = boot(input);
  for (const format of formats) {
    test(`P08-R1 plant: ${label} ${format} includes displayed slope test, permutation and prediction interval`, async () => {
      const expected = expectedInference(app);
      assert.equal(expected.perm_exact, exact);
      const exported = parseExport(format, (await app.download(format)).text);
      assert.deepEqual(inferenceKeys.filter(key => !Object.hasOwn(exported, key)), [], 'All nine displayed inference fields must be exported');
      for (const key of inferenceKeys.filter(key => key !== 'slope_p')) {
        assert.equal(exported[key], format === 'json' ? expected[key] : String(expected[key]), key);
      }
      const p = Number(exported.slope_p);
      assert.ok(Number.isFinite(p) && p >= 0 && p <= 1, 'slope_p is a probability');
      assert.equal(Number(p.toFixed(3)), expected.slope_p, 'p matches the displayed inference');
      assert.equal(p, app.context.__almResults().slope_p, 'Export preserves the unrounded p');
      assert.notEqual(p, expected.slope_p, 'Do not export the rounded card text');
    });
  }
}

test('P08-R1 control: JSON and CSV retain coefficients, confidence intervals, variance and QE', async () => {
  const app = boot(data(rows.slice(0, 4))), w = app.context;
  const f = w._almLastFitted().fit, hk = w._almLastHK(), qe = w._almLastQE();
  const t = w._almTQuantile975(hk.df), se0 = Math.sqrt(hk.varB0), se1 = Math.sqrt(hk.varB1);
  const expected = {
    _schema: 'meta-regression-results-v1', k: 4,
    intercept: f.b0, intercept_se: se0, intercept_ci_lb: f.b0 - t * se0, intercept_ci_ub: f.b0 + t * se0,
    slope: f.b1, slope_se: se1, slope_ci_lb: f.b1 - t * se1, slope_ci_ub: f.b1 + t * se1,
    tau2_pm: w._almLastFitted().tau2, hksj_q: hk.q, hksj_q_df: hk.df, R2_tau2: w._almLastR2(),
    QE: qe.qE, QE_df: qe.dfE, QE_p: qe.pQE,
  };
  for (const format of ['json', 'csv']) {
    const file = await app.download(format);
    assert.equal(file.name, `meta-regression-results.${format}`);
    const exported = parseExport(format, file.text);
    for (const [key, value] of Object.entries(expected)) assert.equal(exported[key], format === 'json' ? value : String(value), key);
  }
});

test('P08-R1 control: unavailable optional inference is omitted and invalid input clears results', async () => {
  for (const optionalModules of [true, false]) {
    const app = boot(data(rows.slice(0, 4)), { optionalModules });
    app.render(data(rows.slice(0, 3)));
    let out = JSON.parse((await app.download('json')).text);
    assert.equal(out.k, 3);
    for (const key of ['perm_p', 'perm_exact', 'perm_nperm']) assert.equal(Object.hasOwn(out, key), false, key);
    if (!optionalModules) for (const key of optionalKeys) assert.equal(Object.hasOwn(out, key), false, key);
    app.render('');
    out = JSON.parse((await app.download('json')).text);
    assert.deepEqual(out, { _schema: 'meta-regression-results-v1', k: 0 });
    app.render(data(rows.slice(0, 4)));
    assert.equal(JSON.parse((await app.download('json')).text).k, 4);
  }
});

test('P08-R1 plant: rerender refreshes inference including a zero slope and prediction', async () => {
  const app = boot(data(rows.slice(0, 4)));
  app.render(data(rows.slice(0, 4).map(([id, , , x]) => [id, 0, 1, x - 2.5])));
  const out = JSON.parse((await app.download('json')).text);
  assert.equal(out.slope_t, 0);
  assert.equal(out.slope_p, 1);
  assert.equal(out.perm_p, 1);
  assert.equal(out.perm_exact, true);
  assert.equal(out.pred_x, 0);
  assert.equal(out.pred, 0);
  assert.equal(out.pi_lb, app.context._almLastPI().lo);
  assert.equal(out.pi_ub, app.context._almLastPI().hi);
});
