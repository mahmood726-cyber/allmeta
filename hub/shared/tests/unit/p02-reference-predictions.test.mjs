import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('dose-response-ma/index.html');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('var EXAMPLE ='));
assert.ok(app, 'load the actual dose-response page script');

// Run the real parser, fit, render and result accessor with only DOM/export plumbing
// replaced. No browser, copied prediction logic, or numerical engine mocks.
function page() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    id, value: '', checked: false, hidden: false, innerHTML: '', textContent: '',
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); }
  }]));
  const get = id => {
    assert.ok(elements.has(id), `known page element: ${id}`);
    return elements.get(id);
  };
  for (const [id, value] of Object.entries({
    'f-shape': 'linear', 'f-cov': 'gl', 'f-proc': '2stage', 'f-method': 'FE'
  })) get(id).value = value;
  get('f-method').options = ['REML', 'ML', 'MM', 'FE', 'PM', 'DL'].map(value => ({ value }));
  let exportResults;
  const context = vm.createContext({
    document: {
      readyState: 'complete', getElementById: get, addEventListener() {},
      querySelectorAll(selector) {
        assert.equal(selector, '[id^="f-"]');
        return [...elements.values()].filter(element => element.id.startsWith('f-'));
      }
    },
    alm: { plotExport() {}, resultsExport(options) { exportResults = options.getResults; } }
  });
  context.window = context;
  for (const path of ['shared/ma-core.js', 'shared/dose-response.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(app, context, { filename: 'dose-response-ma/index.html' });
  return (data, doses = '') => {
    get('f-data').value = data;
    get('f-pdoses').value = doses;
    get('btn-run').listeners.get('click')();
    const result = context._almLastDoseResponse();
    assert.ok(result, get('msgs').innerHTML);
    assert.equal(exportResults(), result, 'export reads the rendered result');
    assert.equal(result.k, 2);
    assert.equal(result.nobs, 4);
    assert.equal(result.excluded.length, 0);
    for (const prediction of result.predictions) {
      for (const value of Object.values(prediction)) assert.ok(Number.isFinite(value));
    }
    return { result: JSON.parse(JSON.stringify(result)), table: get('pred-body').innerHTML };
  };
}

function data(refA = '', refB = refA, shift = 0) {
  return [
    ['A', 0, 100, 1000, 0, refA, 'cc'],
    ['A', 10, 120, 1000, 0, 0.13, 'cc'], // A positive-SE, zero-effect observation is not a reference.
    ['A', 20, 140, 1000, 0.3, 0.14, 'cc'],
    ['B', 0, 80, 800, 0, refB, 'cc'],
    ['B', 10, 100, 800, 0.2, 0.15, 'cc'],
    ['B', 20, 110, 800, 0.35, 0.16, 'cc']
  ].map(row => { row[1] += shift; return row.join(','); }).join('\n');
}

test('control: blank reference SE uses only non-reference doses and deduplicates automatic quantiles', () => {
  const { result, table } = page()(data());
  // The non-reference sample is [10, 10, 20, 20]. These elementary expectations
  // test dose selection, not a statistical parity reference from R.
  assert.deepEqual(result.predictions.map(p => p.dose), [10, 15, 20]);
  assert.equal((table.match(/<tr>/g) || []).length, 4, 'one reference row and three predictions');
});

test('plant P02-R3: zero reference SE preserves automatic prediction doses and results', () => {
  const run = page(), blank = run(data()), zero = run(data('0'));
  assert.deepEqual(zero.result.beta, blank.result.beta, 'same fitted coefficients');
  assert.deepEqual(zero.result.cov, blank.result.cov, 'same fitted covariance');
  assert.deepEqual(zero.result.predictions.map(p => p.dose), [10, 15, 20]);
  assert.deepEqual(zero.result.predictions, blank.result.predictions, 'same exported predictions');
  assert.equal(zero.table, blank.table, 'same displayed predictions');
});

test('control: explicit prediction doses including the reference remain unchanged for blank and zero SE', () => {
  const run = page(), doses = '0,2.5,10,17.5,20';
  const blank = run(data(), doses), zero = run(data('0'), doses);
  assert.deepEqual(zero.result.predictions.map(p => p.dose), [0, 2.5, 10, 17.5, 20]);
  assert.deepEqual(zero.result, blank.result);
  assert.equal(zero.table, blank.table);
});

test('plant P02-R3: mixed reference SE encodings at a nonzero dose preserve automatic predictions', () => {
  const run = page(), blank = run(data('', '', 5));
  const mixed = run(data('0', '', 5).split('\n').reverse().join('\n'));
  assert.equal(mixed.result.referenceDose, 5);
  assert.deepEqual(blank.result.predictions.map(p => p.dose), [15, 20, 25]);
  assert.deepEqual(mixed.result.predictions.map(p => p.dose), [15, 20, 25]);
  assert.equal(mixed.table, blank.table);
});
