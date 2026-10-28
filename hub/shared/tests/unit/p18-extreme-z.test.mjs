import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
for (const file of ['shared/multivariate-ma.js', 'multivariate-ma/plus.js']) {
  vm.runInContext(readFileSync(new URL('../../../../' + file, import.meta.url), 'utf8'), context);
}
const engine = context.AlmMultivariate;
const plus = context.AlmMvPlus;

function identicalStudies(y) {
  return { mode: 'cov', outcomes: ['A', 'B'], omitted: [], rows: [1, 2].map(line => ({
    line, label: 'study ' + line, y: y.slice(), v: [2, 2], cov: 0
  })) };
}

for (const sign of [1, -1]) {
  test(`P18-R1 plant: finite ${sign > 0 ? 'positive' : 'negative'} z with overflowing square has p=0`, () => {
    for (const [mu, se] of [[sign * 1e155, 1], [sign * Number.MAX_VALUE, 1], [sign * 1e154, 0.1]]) {
      const z = mu / se;
      assert.ok(Number.isFinite(z));
      assert.equal(z * z, Infinity);
      const result = engine.zTest(mu, se);
      assert.equal(result.status, 'ok');
      assert.equal(result.z, z);
      assert.equal(result.p, 0);
    }
  });
}

test('P18-R1 plant: two identical extreme studies return multivariate and univariate zero tails', () => {
  const result = plus.compute(identicalStudies([1e155, -1e155]));
  assert.equal(result.status, 'ok');
  assert.equal(result.k, 2);
  assert.equal(result.boundary, 'zero');
  assert.ok(Number.isFinite(result.fit.logLik));
  for (let j = 0; j < 2; j++) {
    const mu = j === 0 ? 1e155 : -1e155;
    assert.equal(result.fit.mu[j], mu);
    assert.equal(result.fit.muSE[j], 1);
    assert.equal(result.tests[j].z, mu);
    assert.equal(result.tests[j].p, 0);
    assert.equal(result.univariate[j].status, 'ok');
    assert.equal(result.univariate[j].mu, mu);
    assert.equal(result.univariate[j].se, 1);
    assert.equal(result.univariate[j].z, mu);
    assert.equal(result.univariate[j].p, 0);
    assert.equal(result.varRatio[j], 1);
  }
});

test('P18-R1 plant: correlation sweep returns zero tails for finite extreme fitted means', () => {
  const results = plus.sweep(identicalStudies([1e155, -1e155]), [0]);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'ok');
  for (const result of results[0].tests) {
    assert.ok(Number.isFinite(result.z));
    assert.equal(Math.abs(result.z), 1e155);
    assert.equal(result.p, 0);
  }
});

test('P18-R1 control: finite squares keep ordinary tails, symmetry and the zero-tail boundary', () => {
  for (const z of [0, 0.1, 0.5, 1, 1.96, 3, 5, 8, 10, 20, 37, 40, 1e154, Math.sqrt(Number.MAX_VALUE)]) {
    assert.ok(Number.isFinite(z * z));
    for (const sign of [1, -1]) {
      const result = engine.zTest(sign * z, 1);
      assert.equal(result.status, 'ok');
      assert.equal(result.z, sign * z);
      assert.equal(result.p, engine.chisqSF(z * z, 1));
      if (z < 40) assert.ok(result.p > 0 && result.p <= 1);
      else assert.equal(result.p, 0);
    }
  }
  assert.equal(engine.zTest(0, 1).p, 1);
});

for (const z of [1e154, Math.sqrt(Number.MAX_VALUE)]) {
  test(`P18-R1 plant: chi-square-one tail terminates at zero for finite square of ${z}`, () => {
    const x = z * z;
    assert.ok(Number.isFinite(x));
    assert.equal(engine.chisqSF(x, 1), 0);
  });
}

test('P18-R1 control: zero-effect studies and their sweep retain p=1', () => {
  const parsed = identicalStudies([0, 0]);
  const result = plus.compute(parsed);
  assert.equal(result.status, 'ok');
  for (let j = 0; j < 2; j++) {
    assert.equal(result.tests[j].z, 0);
    assert.equal(result.tests[j].p, 1);
    assert.equal(result.univariate[j].status, 'ok');
    assert.equal(result.univariate[j].p, 1);
  }
  for (const row of plus.sweep(parsed, [-0.5, 0, 0.5])) {
    assert.equal(row.status, 'ok');
    for (const t of row.tests) assert.equal(t.p, 1);
  }
});

test('P18-R1 control: invalid Wald inputs remain refused and chi-square guards remain intact', () => {
  for (const mu of [NaN, Infinity, -Infinity, undefined, null, '1']) {
    const result = engine.zTest(mu, 1);
    assert.equal(result.status, 'refused');
    assert.equal(result.reason, 'SE must be positive and finite');
  }
  for (const se of [0, -0, -1, NaN, Infinity, -Infinity, undefined, null, '1']) {
    assert.equal(engine.zTest(1, se).status, 'refused');
  }
  for (const x of [-1, NaN, Infinity, -Infinity]) {
    assert.throws(() => engine.chisqSF(x, 1), /invalid chi-square argument/);
  }
  for (const df of [0, -1, NaN]) {
    assert.throws(() => engine.chisqSF(1, df), /invalid chi-square argument/);
  }
  // This fix is limited to finite z; preserve the existing overflowing-quotient guard.
  for (const mu of [Number.MAX_VALUE, -Number.MAX_VALUE]) {
    assert.throws(() => engine.zTest(mu, 0.5), /invalid chi-square argument/);
  }
});

// Recorded from the real R 4.6.0 run of the adjacent reference generator.
// Keep the original regression assertions above independent of the R fixture.
const reference = JSON.parse(readFileSync(
  new URL('../fixtures/p18-extreme-z-reference.json', import.meta.url), 'utf8'));

function assertTail(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && actual >= 0 && actual <= 1, label);
  if (expected === 0) {
    assert.equal(actual, 0, label);
  } else {
    assert.ok(actual > 0, label + ': a positive reference tail must stay positive');
    // Relative error, including z=37, prevents an absolute tolerance from
    // accepting zero in place of a tiny representable probability.
    assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.abs(expected),
      `${label}: ${actual} versus R ${expected}`);
  }
}

test('P18-R1 R parity: finite extreme normal tails match stats', () => {
  for (const row of reference.tails.filter(row => Math.abs(row.z) > 40)) {
    const result = engine.zTest(row.mu, row.se);
    assert.equal(result.status, 'ok');
    assert.equal(result.z, row.z);
    assertTail(result.p, row.p, `extreme z=${row.z}`);
  }
});

test('P18-R1 R parity control: ordinary tails including tiny positive probabilities match stats', () => {
  for (const row of reference.tails.filter(row => Math.abs(row.z) <= 40)) {
    const result = engine.zTest(row.mu, row.se);
    assert.equal(result.status, 'ok');
    assert.equal(result.z, row.z);
    assertTail(result.p, row.p, `ordinary z=${row.z}`);
  }
});

test('P18-R1 R parity: finite chi-square-one tails match stats', () => {
  for (const row of reference.chi_square) {
    assertTail(engine.chisqSF(row.x, row.df), row.p, `chi-square x=${row.x}`);
  }
});

test('P18-R1 R parity control: Berkey Wald tails match stats at R coefficients', () => {
  const row = reference.berkey;
  for (let j = 0; j < 2; j++) {
    const result = engine.zTest(row.mu[j], row.se[j]);
    assert.equal(result.status, 'ok');
    assert.equal(result.z, row.z[j]);
    assertTail(result.p, row.p[j], `Berkey R coefficient ${j}`);
  }
});

test('P18-R1 R parity control: Berkey REML fit and pooled tests match metafor', () => {
  const row = reference.berkey;
  const parsed = {
    mode: 'cov', outcomes: ['AL', 'PD'], omitted: [],
    rows: row.studies.map((study, i) => ({
      line: i + 1, label: `Berkey ${i + 1}`, y: study.y,
      v: [study.S[0][0], study.S[1][1]], cov: study.S[0][1]
    }))
  };
  const result = plus.compute(parsed);
  assert.equal(result.status, 'ok');
  assert.equal(result.k, 5);
  // Same scaled 1e-6 comparison as multivariate-ma-sanity.spec.mjs for
  // fitted parameters; the separate Wald-tail test isolates tail precision.
  const near = (actual, expected, label) => assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) < 1e-6,
    `${label}: ${actual} versus R ${expected}`);
  for (let j = 0; j < 2; j++) {
    near(result.fit.mu[j], row.mu[j], `Berkey mu ${j}`);
    near(result.fit.muSE[j], row.se[j], `Berkey SE ${j}`);
    near(result.tests[j].z, row.z[j], `Berkey z ${j}`);
    assert.ok(result.tests[j].p > 0);
    near(result.tests[j].p, row.p[j], `Berkey p ${j}`);
  }
  near(result.fit.logLik, row.logLik, 'Berkey logLik');
});
