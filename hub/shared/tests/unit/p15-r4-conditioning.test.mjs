import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import '../../../../shared/stats-qt.js';
import RVE from '../../../../shared/rve.js';
import E from '../../../../shared/rve-extras.js';

const root = new URL('../../../../', import.meta.url);
const inputBytes = readFileSync(new URL('./p15-r4-conditioning-input.json', import.meta.url));
const input = JSON.parse(inputBytes);
const readReference = () => JSON.parse(readFileSync(new URL('./p15-r4-conditioning-reference.json', import.meta.url), 'utf8'));
const rowsFor = c => input.rows.map(r => ({ ...r, X: r.X.slice(), vi: c.vi }));
const fitRowsFor = c => c.centred ? E.centreRows(rowsFor(c)).rows : rowsFor(c);
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a / b - 1) < tolerance, `${label}: app=${a}, reference=${b}, relative tolerance=${tolerance}`);
// The existing ill-conditioned check in tests/test_rve_extras.py uses 1e-4;
// kappa itself is subject to rounding at these condition numbers (~1e11).
const kappaTolerance = 1e-4;

test('P15-R4 control: native R fixture records inputs and package versions', () => {
  const ref = readReference();
  assert.equal(ref.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.deepEqual(ref.input, input);
  assert.ok(ref.provenance.R);
  for (const name of ['robumeta', 'jsonlite']) assert.ok(ref.provenance.packages[name]);
  assert.deepEqual(ref.cases.map(c => c.name), input.cases.map(c => c.name));
});

for (const c of input.cases) {
  const kind = c.vi === 1e20 ? 'plant' : 'control';
  test(`P15-R4 ${kind}: ${c.name} fitted-weight kappa agrees with fresh R`, () => {
    const rows = fitRowsFor(c);
    const fit = RVE.fitCORR(rows, { rho: input.rho });
    const ref = readReference().cases.find(r => r.name === c.name);
    fit.weights.forEach((w, i) => near(w, ref.weights[i], 1e-12, `weight[${i}]`));
    near(E.kappaXtWX(rows, fit.weights), ref.kappa, kappaTolerance, c.name);
  });
}

// Analytic oracle: X'WX = scale * [[3,1],[1,3]], eigenvalues 4*scale and 2*scale.
for (const scale of [1, 1e-20, 1e-200, 1e200]) {
  const kind = scale < 1 ? 'plant' : 'control';
  test(`P15-R4 ${kind}: common weight scale ${scale} preserves analytic kappa 2`, () => {
    const rows = [{ X: [1, 1] }, { X: [1, -1] }];
    near(E.kappaXtWX(rows, [2 * scale, scale]), 2, 1e-12, `scale ${scale}`);
  });
}

// Execute the unchanged page controller and actual export handlers in a VM.
// The DOM only stores HTML/handlers; this is not a rendered-browser test.
function pageOutputs(c) {
  const html = readFileSync(new URL('rve-meta/index.html', root), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('var SMALL_EXAMPLE'));
  assert.ok(script, 'page controller exists');
  const element = () => ({ value: '', checked: false, hidden: true, innerHTML: '', textContent: '',
    handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
  const ids = ['src', 'f-rho', 'f-names', 'f-centre', 'stale-note', 'names-warning',
    'coef-body', 'rho-sens', 'btn-rho-sens', 'meta-row', 'btn-centre', 'fit-form',
    'btn-example', 'btn-example-small'];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  elements.src.value = 'cluster,yi,vi,year\n' + rowsFor(c)
    .map(r => [r.cluster, r.yi, r.vi, r.X[1]].join(',')).join('\n');
  elements['f-rho'].value = String(input.rho);
  elements['f-centre'].checked = c.centred;
  const buttons = ['json', 'report-md'].map(action => ({ ...element(), getAttribute: () => action }));
  const downloads = [];
  const document = {
    getElementById(id) {
      assert.ok(Object.hasOwn(elements, id), `known page element ${id}`);
      if (id === 'btn-centre' && !elements['meta-row'].innerHTML.includes('id="btn-centre"')) return null;
      return elements[id];
    },
    querySelectorAll(selector) { assert.equal(selector, '#alm-export-mount button'); return buttons; },
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { downloads.push({ name: this.download, text: this.href.text }); } };
    },
    body: { appendChild() {}, removeChild() {} }
  };
  const context = vm.createContext({ document, AlmRVE: RVE, AlmRVEExtras: E,
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    URL: { createObjectURL: blob => blob, revokeObjectURL() {} }, setTimeout() {} });
  context.window = context;
  vm.runInContext(script, context, { filename: 'rve-meta/index.html controller' });
  assert.equal(typeof context.__almLastRVE, 'function', elements['meta-row'].innerHTML);
  for (const button of buttons) button.handlers.click();
  assert.equal(downloads.length, 2);
  return {
    page: elements['meta-row'].innerHTML,
    json: JSON.parse(downloads.find(d => d.name === 'rve-meta.json').text),
    report: downloads.find(d => d.name === 'rve-meta-report.md').text
  };
}

for (const c of input.cases) {
  const kind = c.vi === 1e20 && !c.centred ? 'plant' : 'control';
  test(`P15-R4 ${kind}: ${c.name} page, JSON and Markdown conditioning warnings`, () => {
    const out = pageOutputs(c);
    assert.equal(out.json.conditioning.threshold, 1e-9 / 2 ** -53);
    assert.deepEqual({
      page: out.page.includes('id="kappa-warning"'),
      jsonFlag: out.json.conditioning.ill_conditioned,
      jsonWarning: out.json.warnings.some(w => w.includes('Ill-conditioned design')),
      report: out.report.includes('Ill-conditioned design')
    }, { page: c.warn, jsonFlag: c.warn, jsonWarning: c.warn, report: c.warn });
    assert.match(out.page, new RegExp(`data-kappa="${out.json.conditioning.kappa_XtWX}"`.replaceAll('.', '\\.')));
    assert.ok(out.report.includes(E.kappaText(out.json.conditioning.kappa_XtWX)));
  });
}

test('P15-R4 control: empty, intercept-only and zero-matrix conventions stay unchanged', () => {
  assert.ok(Number.isNaN(E.kappaXtWX([], [])));
  assert.equal(E.kappaXtWX([{ X: [1] }, { X: [1] }], [1e-200, 1e-200]), 1);
  assert.equal(E.kappaXtWX([{ X: [0, 0] }], [1]), Infinity);
});

test('P15-R4 control: conditioning leaves inputs and CR2 inference unchanged', () => {
  const fixture = JSON.parse(readFileSync(new URL('rve-meta/tests/fixtures/p15-eigen/eigen.json', root), 'utf8'));
  const rows = structuredClone(fixture.input.rows);
  for (const row of rows) { Object.freeze(row.X); Object.freeze(row); }
  Object.freeze(rows);
  const fit = RVE.fitCORR(rows, { rho: fixture.input.rho });
  const before = structuredClone(fit);
  Object.freeze(fit.weights);
  assert.ok(Number.isFinite(E.kappaXtWX(rows, fit.weights)));
  assert.deepEqual(fit, before);
  assert.deepEqual(rows, fixture.input.rows);
  assert.equal(fit.method, 'CR2');
  const fields = { estimate: 'b.r', se: 'SE', t: 't', df: 'dfs', p: 'prob', ci_lo: 'CI.L', ci_hi: 'CI.U' };
  RVE.summary(fit).forEach((s, i) => {
    for (const [actual, expected] of Object.entries(fields)) {
      const ref = fixture.R.table[i][expected];
      const divisor = ['p', 'ci_lo', 'ci_hi'].includes(actual) ? 1 : Math.max(1, Math.abs(ref));
      assert.ok(Number.isFinite(s[actual]) && Math.abs(s[actual] - ref) / divisor <= 1e-9,
        `unchanged CR2 ${actual}[${i}]: app=${s[actual]}, R=${ref}`);
    }
  });
});
