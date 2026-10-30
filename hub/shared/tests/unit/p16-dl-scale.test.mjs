import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { engine, input, scaled } from './p16-dl-harness.mjs';
import { referenceBytes } from './p16-dl-provenance.mjs';

const E = engine();
const fit = (rows, model = 'DL') => E.AlmIncoPlusCore.fitAll(E, rows, model);
const tolerance = 1e-9; // Existing P16 FE/DL tolerance; p-values always absolute.
const near = (actual, expected, label, absolute = false) => {
  const error = Math.abs(actual - expected) / (absolute ? 1 : Math.max(1, Math.abs(expected)));
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && error <= tolerance,
    `${label}: actual=${actual}, expected=${expected}, error=${error}, tolerance=${tolerance}`);
};
const rows = input.cases.triangle;
const baseline = fit(rows);
let reference;
const nativeReference = () => reference ??= JSON.parse(readFileSync(new URL('./p16-dl-reference.json', import.meta.url), 'utf8'));

for (const scale of input.scales.filter(s => s !== 1)) {
  const kind = scale === 10 ? 'control' : 'plant';
  test(`P16-R1 ${kind}: DL tau2 scales with squared measurement units at ${scale}`, () => {
    const actual = fit(scaled(rows, scale));
    assert.equal(baseline.status, 'ok');
    assert.equal(actual.status, 'ok');
    assert.ok(baseline.tau2 > 0);
    near(actual.tau2 / scale ** 2, baseline.tau2, 'normalized tau2');
  });
  test(`P16-R1 ${kind}: global Q, p and verdict are unit invariant at ${scale}`, () => {
    const actual = fit(scaled(rows, scale));
    assert.equal(actual.status, 'ok');
    near(actual.dbt.Q, baseline.dbt.Q, 'global Q');
    near(actual.dbt.p, baseline.dbt.p, 'global p', true);
    assert.equal(actual.dbt.df, baseline.dbt.df);
    assert.equal(actual.dbt.p < 0.05, baseline.dbt.p < 0.05);
  });
  test(`P16-R1 ${kind}: node-split estimates, p and verdicts are unit invariant at ${scale}`, () => {
    const actual = fit(scaled(rows, scale));
    assert.equal(actual.status, 'ok');
    assert.equal(actual.nodeSplit.length, 3);
    actual.nodeSplit.forEach((split, i) => {
      const ref = baseline.nodeSplit[i];
      assert.equal(split.comparison, ref.comparison);
      for (const side of ['direct', 'indirect']) for (const key of ['mean', 'se']) {
        near(split[side][key] / scale, ref[side][key], `${split.comparison} ${side}.${key}`);
      }
      for (const key of ['diff', 'seDiff']) near(split[key] / scale, ref[key], `${split.comparison} ${key}`);
      near(split.z, ref.z, `${split.comparison} z`);
      near(split.p, ref.p, `${split.comparison} p`, true);
      assert.equal(split.p < 0.05, ref.p < 0.05);
    });
  });
}

test('P16-R1 control: FE global and split p-values remain unit invariant', () => {
  const ref = fit(rows, 'FE');
  for (const scale of input.scales) {
    const actual = fit(scaled(rows, scale), 'FE');
    assert.equal(actual.status, 'ok');
    assert.equal(actual.tau2, 0);
    near(actual.dbt.Q, ref.dbt.Q, 'FE global Q');
    near(actual.dbt.p, ref.dbt.p, 'FE global p', true);
    assert.equal(actual.nodeSplit.length, ref.nodeSplit.length);
    actual.nodeSplit.forEach((s, i) => near(s.p, ref.nodeSplit[i].p, 'FE split p', true));
  }
});

test('P16-R1 control: nonpositive excess Q and zero residual df still give zero DL tau2', () => {
  for (const scale of input.scales) {
    const consistent = scaled(rows.map(r => ({ ...r, te: 0 })), scale);
    assert.equal(E.tau2_DL(consistent), 0);
    const tree = scaled(rows.slice(0, 2), scale);
    assert.equal(E.fitNMA(tree).df, 0);
    assert.equal(E.tau2_DL(tree), 0);
  }
});

test('P16-R1 control: native R fixture preserves exact input and script provenance', () => {
  const ref = nativeReference();
  assert.deepEqual(ref.input, input);
  for (const key of ['R', 'stats']) assert.ok(ref.provenance[key]);
  for (const [key, file] of [['input_md5', 'p16-dl-input.json'], ['input_r_md5', 'p16-dl-input.R'], ['script_md5', 'p16-dl-reference.R']]) {
    assert.equal(ref.provenance[key], createHash('md5').update(referenceBytes(file)).digest('hex'));
  }
  assert.equal(ref.provenance.method, 'uncentred weighted QR; C=sum(w*(1-leverage)); native stats::pchisq');
  assert.equal(ref.provenance.serialization, 'base R; 17 significant digits');
});

test('P16-R1 control: independent native R moments are invariant across units', () => {
  const refs = nativeReference().fits;
  for (const name of Object.keys(input.cases)) {
    const ref = refs.find(f => f.name === name && f.scale === 1);
    for (const actual of refs.filter(f => f.name === name)) {
      near(actual.C * actual.scale ** 2, ref.C, `${name} normalized C`);
      near(actual.tau2 / actual.scale ** 2, ref.tau2, `${name} normalized R tau2`);
      near(actual.global.Q, ref.global.Q, `${name} R global Q`);
      near(actual.global.p, ref.global.p, `${name} R global p`, true);
    }
  }
  const plant = refs.find(f => f.name === 'triangle' && f.scale === 11000000);
  assert.ok(plant.C > 0 && plant.C < 1e-12, 'Positive denominator below the defective absolute cutoff');
  assert.ok(plant.tau2 > 0);
});

for (const name of Object.keys(input.cases)) for (const scale of input.scales) {
  const kind = name === 'triangle' && scale === 11000000 ? 'plant' : 'control';
  test(`P16-R1 ${kind}: native R generalized DL parity for ${name} at ${scale}`, () => {
    const ref = nativeReference().fits.find(f => f.name === name && f.scale === scale);
    const data = scaled(input.cases[name], scale);
    const actual = fit(data);
    assert.equal(actual.status, 'ok');
    near(E.fitNMA(data).Q, ref.Qfixed, 'fixed Q');
    near(actual.tau2, ref.tau2, 'native R tau2');
    near(actual.dbt.Q, ref.global.Q, 'native R global Q');
    near(actual.dbt.p, ref.global.p, 'native R global p', true);
    assert.equal(actual.dbt.df, ref.global.df);
    assert.equal(actual.nodeSplit.length, ref.splits.length);
    for (const split of actual.nodeSplit) {
      const r = ref.splits.find(s => s.comparison === split.comparison);
      assert.ok(r, split.comparison);
      for (const side of ['direct', 'indirect']) for (const key of ['mean', 'se']) {
        near(split[side][key], r[side][key], `native R ${split.comparison} ${side}.${key}`);
      }
      for (const key of ['diff', 'seDiff', 'z', 'p']) near(split[key], r[key], `native R ${split.comparison} ${key}`, key === 'p');
    }
  });
}
