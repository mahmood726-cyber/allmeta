import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './p09-proportion-harness.mjs';

const MAX = Number.MAX_SAFE_INTEGER;
const methods = ['PM', 'DL', 'FE'];
function finiteFit(h, result) {
  assert.ok(result, 'fit must succeed');
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} must be finite; got ${value}`);
  }
  assert.ok(result.seRE > 0);
  assert.equal(h.get('analysis-status').hidden, false);
  const details = h.details();
  assert.ok(details.yi.every(Number.isFinite));
  assert.ok(details.vi.every(v => Number.isFinite(v) && v > 0));
  assert.doesNotMatch(h.get('forest').innerHTML, /NaN|Infinity/);
}
function refused(h) {
  assert.equal(h.context._almLastPropMA(), null, 'refused analysis must not remain exportable');
  assert.equal(h.details(), null, 'refused analysis must not have a validation snapshot');
  assert.equal(h.get('analysis-status').hidden, true, 'refused analysis must not announce success');
  assert.match(h.get('res-body').innerHTML, /unsupported numeric range/i);
  assert.equal(h.get('forest').innerHTML, '', 'previous forest must be cleared');
  assert.equal(h.get('het').innerHTML, '', 'previous heterogeneity must be cleared');
}

test('P09-R5 plant: corrected logit counts retain the half non-event at MAX_SAFE_INTEGER', () => {
  const h = harness();
  const full = h.engine.logit(MAX, MAX);
  const zero = h.engine.logit(0, MAX);
  assert.ok(Number.isFinite(full.y), `full-cell logit is ${full.y}`);
  assert.ok(Number.isFinite(full.v), `full-cell variance is ${full.v}`);
  assert.equal(full.y, -zero.y, 'complementary boundary logits are symmetric');
  assert.equal(full.v, zero.v, 'complementary boundary variances are equal');
  assert.equal(full.v, 2, 'the half non-event contributes reciprocal variance 2');
});

for (const trans of ['logit', 'raw']) for (const method of methods) {
  test(`P09-R5 plant: huge full-cell ${trans}/${method} fit is finite before success`, () => {
    const h = harness();
    finiteFit(h, h.run(`${MAX},${MAX},A\n${MAX},${MAX},B`, trans, method));
    assert.equal(h.context.__propMaBusStudies().length, 2, 'both finite logits can be exported to the bus');
  });
}

for (const trans of ['logit', 'ft', 'raw']) for (const method of methods) {
  test(`P09-R5 control: ordinary zero/full cells and recovery ${trans}/${method}`, () => {
    const h = harness();
    finiteFit(h, h.run(undefined, trans, method));
    assert.ok(h.context._almLastPropMA().poolPiLo !== null);
    finiteFit(h, h.run('0,10,A\n10,10,B', trans, method));
    assert.equal(h.context._almLastPropMA().poolPiLo, null);
  });
}

test('P09-R5 control: huge zero and FT boundary fits remain finite', () => {
  for (const trans of ['logit', 'ft', 'raw']) for (const method of methods) {
    const h = harness();
    finiteFit(h, h.run(`0,${MAX},A\n0,${MAX},B`, trans, method));
    if (trans === 'ft') finiteFit(h, h.run(`${MAX},${MAX},A\n${MAX},${MAX},B`, trans, method));
  }
});

for (const count of ['9007199254740992', '9'.repeat(310)]) {
  test(`P09-R5 plant: ${count.length > 30 ? 'overflowing' : 'unsafe-integer'} counts refuse the whole analysis`, () => {
    for (const trans of ['logit', 'ft', 'raw']) {
      const h = harness();
      finiteFit(h, h.run(undefined, trans));
      h.run(`1,10,A\n2,10,B\n0,${count},C`, trans);
      refused(h);
      assert.equal(h.context.__propMaBusStudies().length, 0, 'unsupported inputs must not export a partial bus dataset');
      finiteFit(h, h.run(undefined, trans));
    }
  });
}

const faults = [
  ['nonfinite effect', 'transform', { y: Infinity, v: 1 }],
  ['nonfinite variance', 'transform', { y: 0, v: Infinity }],
  ['zero variance', 'transform', { y: 0, v: 0 }],
  ['negative variance', 'transform', { y: 0, v: -1 }],
  ...['mu_re', 'seRE', 'tau2', 'Q', 'i2'].map(key => [`nonfinite pooled ${key}`, 'pool', { [key]: Infinity }]),
  ['nonfinite weight', 'pool', { weights: [Infinity, 1, 1] }],
  ['nonfinite back-transform', 'back', NaN],
  ['nonfinite study CI', 'ci', [NaN, 1]]
];
for (const [name, stage, value] of faults) {
  test(`P09-R5 plant: ${name} refuses instead of storing or rendering success`, () => {
    const h = harness();
    finiteFit(h, h.run());
    h.engine.fault(stage, value);
    h.run();
    refused(h);
  });
}

test('P09-R5 plant: nonfinite prediction limits refuse even when logit back-transform hides infinity', () => {
  const h = harness();
  finiteFit(h, h.run());
  h.context.AlmMaCore.predictionInterval = () => ({ lo: -Infinity, hi: Infinity });
  h.run();
  refused(h);
});
