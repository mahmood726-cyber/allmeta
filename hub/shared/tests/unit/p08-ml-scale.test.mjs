import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const engineURL = new URL('../../../../meta-regression/plus-engine.js', import.meta.url);
await import(engineURL);
const engine = readFileSync(engineURL, 'utf8');
const fixture = JSON.parse(readFileSync(new URL('fixtures/p08-ml-reference.json', import.meta.url), 'utf8'));
const records = fixture.records;
const close = (actual, expected, tolerance, label) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} versus ${expected}, tolerance ${tolerance}`);
};
function checkReference(record) {
  const { input, expected, scale } = record, result = AlmMetaPlus.compute(input);
  const label = `${record.case} scale=${scale}`;
  assert.equal(result.status, 'ok', `${label}: ${result.reason}`);
  for (const model of ['full', 'reduced']) {
    const a = result[model], b = expected[model];
    close(a.tau2 / scale ** 2, b.tau2 / scale ** 2, 1e-9, `${label} ${model}.tau2 in original units`);
    for (const key of ['beta', 'se', 'ciLo', 'ciHi']) a[key].forEach((x, i) =>
      close(x / scale, b[key][i] / scale, 1e-9, `${label} ${model}.${key}[${i}] in original units`));
    for (const key of ['z', 'pval']) a[key].forEach((x, i) =>
      close(x, b[key][i], 1e-9, `${label} ${model}.${key}[${i}]`));
    for (const key of ['logLik', 'AIC', 'BIC']) close(a[key], b[key], 1e-9, `${label} ${model}.${key}`);
  }
  assert.equal(result.comparison.df, expected.comparison.df);
  close(result.comparison.LRT, expected.comparison.LRT, 1e-9, `${label} LRT`);
  close(result.comparison.pval, expected.comparison.pval, 1e-9, `${label} LRT p-value`);
  return result;
}

for (const name of ['balanced', 'heterogeneous', 'interaction']) {
  test(`control P08-R3: ${name} ordinary-unit ML matches recorded metafor`, () => {
    checkReference(records.find(r => r.case === name && r.scale === 1));
  });
  for (const scale of [1e-3, 1e-6, 1e-8, 1e6]) {
    test(`plant P08-R3: ${name} ML is invariant at outcome scale ${scale}`, () => {
      const record = records.find(r => r.case === name && r.scale === scale);
      const result = checkReference(record);
      const original = AlmMetaPlus.compute(records.find(r => r.case === name && r.scale === 1).input);
      close(result.full.tau2 / scale ** 2, original.full.tau2, 1e-9, 'unit-invariant tau2');
      close(result.full.logLik + record.input.yi.length * Math.log(scale), original.full.logLik, 1e-9, 'log-likelihood unit shift');
      close(result.comparison.LRT, original.comparison.LRT, 1e-9, 'unit-invariant LRT');
      for (const key of ['pred', 'se', 'ciLo', 'ciHi']) result.plot[key].forEach((x, i) =>
        close(x / scale, original.plot[key][i], 1e-9, `unit-invariant plot.${key}[${i}]`));
      result.plot.weights.forEach((x, i) => close(x, original.plot.weights[i], 1e-9, `unit-invariant weight[${i}]`));
    });
  }
}
test('plant P08-R3: small-unit nested-model LRT agrees with recorded metafor instead of collapsing to zero', () => {
  const record = records.find(r => r.case === 'balanced' && r.scale === 1e-6);
  const result = AlmMetaPlus.compute(record.input);
  assert.equal(result.status, 'ok');
  assert.ok(record.expected.comparison.LRT > .01, 'reference has a detectable nonzero comparison');
  close(result.comparison.LRT, record.expected.comparison.LRT, 1e-9, 'small-unit LRT');
});
for (const name of ['boundary', 'null']) {
  test(`control P08-R3: ${name} ML remains valid across outcome units`, () => {
    for (const record of records.filter(r => r.case === name)) checkReference(record);
  });
}

// Simulate a failed optimizer returning an inferior full-model likelihood.
// This tests the public refusal contract, without exporting private fit helpers.
function withLikelihoodGap(gap) {
  const marker = 'reduced=fit(y,v,reducedX);';
  assert.equal(engine.split(marker).length, 2, 'fault injection reaches nested fit result');
  const context = vm.createContext({});
  vm.runInContext(engine.replace(marker, `${marker}full.values.logLik=reduced.values.logLik+(${gap});`), context);
  return context.AlmMetaPlus.compute(records.find(r => r.case === 'balanced' && r.scale === 1).input);
}
test('plant P08-R3: an inferior nested full fit must refuse instead of reporting LRT zero', () => {
  const result = withLikelihoodGap(-1);
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /likelihood/i);
});
test('control P08-R3: likelihood roundoff and exactly equal nested fits may report LRT zero', () => {
  for (const gap of [0, -1e-14]) {
    const result = withLikelihoodGap(gap);
    assert.equal(result.status, 'ok', result.reason);
    assert.equal(result.comparison.LRT, 0);
    assert.equal(result.comparison.pval, 1);
  }
});
