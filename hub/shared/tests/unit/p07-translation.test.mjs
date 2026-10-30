import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// The recorded R digest describes LF bytes, independent of checkout line endings.
const inputBytes = readFileSync(new URL('./p07-translation-input.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const input = JSON.parse(inputBytes);
// Read the oracle inside its tests so a missing R fixture cannot mask the
// independent translation-invariance regression assertions.
let recordedReference;
function nativeReference() {
  return recordedReference ??= JSON.parse(readFileSync(new URL('./p07-translation-reference.json', import.meta.url), 'utf8'));
}
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../../../shared/multilevel-reml.js', import.meta.url), 'utf8'), context);
const fit = rows => context.AlmMultilevelREML.fit(rows);
const keys = ['mu', 'se', 'ciLo', 'ciHi', 'sigma2Between', 'sigma2Within', 'logLik'];
const locationKeys = new Set(['mu', 'ciLo', 'ciHi']);
const tolerance = 1e-6; // Existing multilevel validation tolerance; never scaled by the large offset.
const shiftedRows = offset => input.rows.map(row => ({ ...row, y: row.y + offset }));
const baseline = fit(input.rows);
const results = new Map(input.offsets.map(offset => [offset, fit(shiftedRows(offset))]));

function compare(actual, expected, actualOffset = 0, expectedOffset = 0) {
  const failures = [];
  for (const key of keys) {
    const a = actual[key] - (locationKeys.has(key) ? actualOffset : 0);
    const b = expected[key] - (locationKeys.has(key) ? expectedOffset : 0);
    const diff = Math.abs(a - b) / Math.max(1, Math.abs(b));
    if (!Number.isFinite(a) || !Number.isFinite(b) || diff > tolerance) {
      failures.push(`${key}: actual=${a}, expected=${b}, difference=${diff}`);
    }
  }
  assert.deepEqual(failures, [], 'All seven REML quantities must agree after removing the translation');
}

test('P07-R1 control: R fixture records the exact input and native package versions', () => {
  const reference = nativeReference();
  assert.equal(reference.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  for (const key of ['R', 'metafor', 'jsonlite']) assert.ok(reference.provenance[key]);
  assert.deepEqual(reference.fits.map(f => f.offset), input.offsets);
  assert.deepEqual(reference.input.rows, input.rows);
  assert.deepEqual(reference.input.offsets, input.offsets);
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
  for (const pkg of reference.provenance.packages) assert.ok(pkg.version, pkg.package);
});

test('P07-R1 control: native metafor is translation invariant at all seven offsets', () => {
  const reference = nativeReference();
  for (const ref of reference.fits) compare(ref.values, reference.fits[0].values, ref.offset);
});

test('P07-R1 control: unshifted fit matches native metafor', () => {
  compare(baseline, nativeReference().fits[0].values);
  assert.equal(baseline.k, input.rows.length);
  assert.equal(baseline.nClusters, 3);
});

for (const offset of input.offsets.filter(offset => offset !== 0)) {
  const kind = Math.abs(offset) <= 1 ? 'control' : 'plant';
  test(`P07-R1 ${kind}: translation invariance at offset ${offset}`, () => {
    const actual = results.get(offset);
    compare(actual, baseline, offset);
    assert.equal(actual.k, baseline.k);
    assert.equal(actual.nClusters, baseline.nClusters);
  });
  test(`P07-R1 ${kind}: native metafor parity at offset ${offset}`, () => {
    compare(results.get(offset), nativeReference().fits.find(f => f.offset === offset).values, offset, offset);
  });
}

test('P07-R1 control: fitting preserves caller rows, including frozen inputs', () => {
  const rows = shiftedRows(1000000);
  const original = structuredClone(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  const actual = fit(rows);
  assert.deepEqual(rows, original);
  compare(actual, results.get(1000000), 1000000, 1000000);
});
