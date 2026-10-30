import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = new URL('../../../../meta-regression/', import.meta.url);
await import(new URL('plus-engine.js', base));
const fixture = JSON.parse(readFileSync(new URL('fixtures/p08-ml-review-reference.json', import.meta.url), 'utf8'));
const close = (a, b, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-9,
  `${label}: ${a} versus ${b}`);

for (const record of fixture.records) {
  const { input, expected, scale } = record;
  test(`${record.case === 'imprecise' ? 'plant' : 'control'} P08 review: ${record.case} independent R fit at scale ${scale}`, () => {
    const actual = AlmMetaPlus.compute(input);
    assert.equal(actual.status, 'ok', actual.reason);
    for (const model of ['full', 'reduced']) {
      close(actual[model].tau2 / scale ** 2, expected[model].tau2 / scale ** 2, `${model}.tau2 in original units`);
      for (const key of ['beta', 'se', 'ciLo', 'ciHi']) {
        assert.equal(actual[model][key].length, expected[model][key].length);
        actual[model][key].forEach((x, i) => close(x / scale, expected[model][key][i] / scale, `${model}.${key}.${i}`));
      }
      for (const key of ['z', 'pval']) actual[model][key].forEach((x, i) => close(x, expected[model][key][i], `${model}.${key}.${i}`));
      for (const key of ['logLik', 'AIC', 'BIC']) close(actual[model][key], expected[model][key], `${model}.${key}`);
    }
    assert.equal(actual.comparison.df, expected.comparison.df);
    for (const key of ['LRT', 'pval']) close(actual.comparison[key], expected.comparison[key], `comparison.${key}`);
  });
}

test('control P08 review: the live R source and desktop R source are identical', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL('validate/plus-pins.js', base), 'utf8'), context);
  assert.equal(context.window.AlmMetaPlusManifest.referenceR,
    readFileSync(new URL('validate/reference.R', base), 'utf8').replaceAll('\r\n', '\n'));
});
