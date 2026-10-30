import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { kernel, kernelSource, read } from './p09-beta-harness.mjs';

const input = JSON.parse(read('hub/shared/tests/unit/p09-beta-input.json'));
const oracle = () => JSON.parse(read('hub/shared/tests/unit/p09-beta-reference.json'));
const app = kernel();
const near = (actual, expected, tol, message) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
  `${message}: ${actual} vs ${expected}; tolerance ${tol}`);

test('control: native R oracle matches input and script hashes and records versions', () => {
  const ref = oracle();
  for (const name of ['R', 'stats', 'metafor', 'jsonlite']) assert.ok(ref.provenance[name]);
  for (const [file, key] of [['input.json', 'input_md5'], ['reference.R', 'script_md5']]) {
    const md5 = createHash('md5').update(read(`hub/shared/tests/unit/p09-beta-${file}`)).digest('hex');
    assert.equal(md5, ref.provenance[key]);
  }
  assert.deepEqual(ref.intervals.map(({name, x, n}) => ({name, x, n})), input.intervals);
  assert.deepEqual(ref.cdfs.map(({name, x, a, b}) => ({name, x, a, b})), input.cdfs);
});

for (const row of input.intervals) {
  const prefix = row.n >= 1e9 ? 'plant P09-R5' : 'control';
  test(`${prefix}: ${row.name} interval is ordered and contains the estimate`, () => {
    const [lo, hi] = app.clopperPearson(row.x, row.n);
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi));
    assert.ok(0 <= lo && lo <= row.x / row.n && row.x / row.n <= hi && hi <= 1,
      `${row.name}: [${lo}, ${hi}] around ${row.x / row.n}`);
  });
  test(`${prefix}: ${row.name} interval matches native R at existing 1e-9 tolerance`, () => {
    const ref = oracle().intervals.find(r => r.name === row.name);
    const actual = app.clopperPearson(row.x, row.n);
    near(actual[0], ref.lo, 1e-9, `${row.name} lower`);
    near(actual[1], ref.hi, 1e-9, `${row.name} upper`);
  });
}

for (const row of input.cdfs) {
  test(`${row.name === 'ordinary' ? 'control' : 'plant P09-R5'}: ${row.name} CDF matches native R`, () => {
    near(app.betaIncReg(row.x, row.a, row.b), oracle().cdfs.find(r => r.name === row.name).value,
      1e-7, row.name);
  });
}

test('plant P09-R5: a larger iteration cap alone does not excuse CDF cancellation', () => {
  const expanded = kernel(kernelSource.replace(/var MAX = \d+/, 'var MAX = 2000000'));
  const ref = oracle().cdfs.find(r => r.name === 'center-trillion');
  near(expanded.betaIncReg(ref.x, ref.a, ref.b), ref.value, 1e-7, 'converged center-trillion');
});

test('plant P09-R5: exhausted continued fraction explicitly fails', () => {
  const exhausted = kernel(kernelSource.replace(/var MAX = \d+/, 'var MAX = 0'));
  assert.throws(() => exhausted.betacf(0.05, 5, 96), /converg/i);
});

test('control: a convergent continued fraction still returns a finite positive value', () => {
  const value = app.betacf(0.05, 5, 96);
  assert.ok(Number.isFinite(value) && value > 0);
});

test('plant P09-R5: inversion refuses nonfinite or out-of-range CDF results', () => {
  for (const value of [NaN, -0.1, 1.1]) {
    const broken = kernel();
    broken.betaIncReg = () => value;
    assert.throws(() => broken.qbeta(0.025, 5, 96), /beta|CDF|converg/i);
  }
});

test('control: beta CDF and quantile endpoints remain exact', () => {
  assert.equal(app.betaIncReg(0, 5, 96), 0);
  assert.equal(app.betaIncReg(1, 5, 96), 1);
  assert.equal(app.qbeta(0, 5, 96), 0);
  assert.equal(app.qbeta(1, 5, 96), 1);
});
