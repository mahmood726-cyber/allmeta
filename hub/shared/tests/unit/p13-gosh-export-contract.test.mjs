import { test } from 'node:test';
import assert from 'node:assert/strict';
import installExports from '../../../../gosh/tests/export-boundaries.cjs';

const build = { version: 'v99.2.3-test', sha: 'abcdef0123456789abcdef0123456789abcdef01' };
const core = { _schema: 'gosh-results-v1', k: 3, model: 'FE', sampled: false,
  n_subsets: 7, median_est: 0.25, median_i2: 0, min_est: 0.25, max_est: 0.25,
  q25_est: 0.25, q75_est: 0.25, studies: [] };
const receiptFor = results => results === null ? null : {
  studies: [], method: 'GOSH all-subsets meta-analysis stability', label: 'gosh-plot', results,
};

function capture(results, receipt = receiptFor(results), identity = build) {
  const noop = () => {};
  const window = { AlmBuildInfo: identity,
    alm: { resultsExport: noop, plotExport: noop },
    MaStudies: { toTruthCert: noop, clear: noop, read: () => [] },
    TruthCertUI: { setKey: noop },
    document: { querySelector: () => ({ click: noop }) },
  };
  installExports(window);
  window.alm.resultsExport({ getResults: () => results });
  window.alm.plotExport({ getReceiptInput: () => receipt, plots: [{ getSvg: () => ({ innerHTML: '<circle/>' }) }] });
  return window.__readExports();
}

test('P13 contract plant: validate provenance before projecting both numerical payloads', () => {
  const payload = { ...core, software: { ...build } }, receipt = receiptFor(payload);
  const before = structuredClone({ payload, receipt });
  const actual = capture(payload, receipt);
  assert.deepEqual(actual, { results: core, receipt: receiptFor(core), chart: '<circle/>', input_receipt: [], bus: [] });
  assert.deepEqual({ payload, receipt }, before, 'projection must not mutate exported objects');
});

for (const [name, software] of [
  ['missing', undefined], ['null', null], ['missing SHA', { version: build.version }],
  ['stale version', { ...build, version: 'v0.0.0' }], ['short SHA', { ...build, sha: build.sha.slice(0, 7) }],
  ['extra key', { ...build, unexpected: true }],
]) {
  for (const location of ['results', 'receipt']) {
    test(`P13 contract plant: reject ${name} software in ${location}`, () => {
      const valid = { ...core, software: { ...build } };
      const invalid = { ...core, ...(software === undefined ? {} : { software }) };
      assert.throws(() => location === 'results' ? capture(invalid, receiptFor(valid)) : capture(valid, receiptFor(invalid)), /software/);
    });
  }
}

test('P13 contract plant: absent and partial builds require explicit unknown fields', () => {
  for (const identity of [undefined, {}, { version: build.version }, { sha: build.sha }]) {
    const software = { version: identity?.version || 'unknown', sha: identity?.sha || 'unknown' };
    // null bypasses capture's default parameter for an unavailable build.
    assert.deepEqual(capture({ ...core, software }, undefined, identity ?? null).results, core);
  }
});

test('P13 contract control: invalid analysis keeps both result boundaries null', () => {
  assert.deepEqual(capture(null), { results: null, receipt: null, chart: '<circle/>', input_receipt: [], bus: [] });
});

test('P13 contract control: preserve every non-software key and numerical value for the exact oracle', () => {
  const changed = { ...core, median_est: 123, unexpected: 42, software: build };
  delete changed.q25_est;
  const actual = capture(changed, { ...receiptFor(changed), extra_receipt_key: true });
  assert.equal(actual.results.median_est, 123);
  assert.equal(actual.results.unexpected, 42);
  assert.equal(Object.hasOwn(actual.results, 'q25_est'), false);
  assert.equal(actual.receipt.extra_receipt_key, true);
  assert.equal(actual.receipt.results.unexpected, 42);
});
