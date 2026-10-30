import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NM = require('../../../../shared/nma-multiarm-v1.js');
const scales = [1, 1e-6, 1e8];
const scaleRows = (rows, scale) => rows.map(r => ({ ...r, est: r.est * scale, se: r.se * scale }));
const near = (got, expected, label) => {
  assert.ok(Number.isFinite(got), `${label}: non-finite ${got}`);
  assert.ok(Math.abs(got - expected) <= 1e-11 * Math.max(1, Math.abs(expected)),
    `${label}: ${got} versus ${expected}`);
};

// Analytic controls, not R reference values: equal covariance blocks make the
// GLS estimate the mean of study estimates, for both FE and DL random effects.
const twoEffects = [0.25, 1.25, -0.5];
const twoMean = twoEffects.reduce((s, v) => s + v, 0) / 3;
const twoQ = twoEffects.reduce((s, v) => s + (v - twoMean) ** 2 / (1 / 16), 0);
const twoTau = (twoQ - 2) / 32;
const twoRows = twoEffects.map((est, i) => ({ study: `two${i}`, t1: 'A', t2: 'B', est, se: 0.25 }));

// Each three-arm study has V = (1/16) * [[1, 1/2], [1/2, 1]].
// V^-1 = (64/3) * [[1, -1/2], [-1/2, 1]], df = 4 and tr(P R) = 64.
const multiEffects = [[0.25, 0.5], [1.25, -0.5], [-0.5, 1.5]];
const multiMean = [twoMean, 0.5];
const multiQ = multiEffects.reduce((sum, y) => {
  const b = y[0] - multiMean[0], c = y[1] - multiMean[1];
  return sum + (64 / 3) * (b * b - b * c + c * c);
}, 0);
const multiTau = (multiQ - 4) / 64;
const multiRows = multiEffects.flatMap(([b, c], i) => [
  { study: `multi${i}`, t1: 'A', t2: 'B', est: b, se: 0.25 },
  { study: `multi${i}`, t1: 'A', t2: 'C', est: c, se: 0.25 },
  { study: `multi${i}`, t1: 'B', t2: 'C', est: c - b, se: 0.25 },
]);

for (const scale of scales) for (const model of ['fe', 're']) {
  test(`P04-R3 two-arm ${model} analytic fit at outcome scale ${scale}`, () => {
    const fit = NM.fit(scaleRows(twoRows, scale), { model, ref: 'A' });
    assert.equal(fit.ok, true, fit.error);
    assert.deepEqual(fit.nonref, ['B']);
    near(fit.d[0] / scale, twoMean, 'estimate in original units');
    near(fit.cov[0][0] / (scale * scale), (1 / 16 + (model === 're' ? twoTau : 0)) / 3, 'variance in original units');
    near(fit.Q, twoQ, 'Q');
    near(fit.tau2 / (scale * scale), model === 're' ? twoTau : 0, 'tau2 in original units');
    assert.equal(fit.df, 2);
  });

  test(`P04-R3 multi-arm ${model} analytic fit at outcome scale ${scale}`, () => {
    const fit = NM.fit(scaleRows(multiRows, scale), { model, ref: 'A' });
    assert.equal(fit.ok, true, fit.error);
    assert.deepEqual(fit.nonref, ['B', 'C']);
    assert.deepEqual(fit.multiArmStudies, ['multi0', 'multi1', 'multi2']);
    const variance = (1 / 16 + (model === 're' ? multiTau : 0)) / 3;
    for (let i = 0; i < 2; i++) {
      near(fit.d[i] / scale, multiMean[i], `estimate ${i} in original units`);
      for (let j = 0; j < 2; j++) near(fit.cov[i][j] / (scale * scale), variance * (i === j ? 1 : 0.5), `covariance ${i},${j}`);
    }
    near(fit.Q, multiQ, 'Q');
    near(fit.tau2 / (scale * scale), model === 're' ? multiTau : 0, 'tau2 in original units');
    assert.equal(fit.df, 4);
  });
}

for (const scale of scales) for (const randomCi of ['classic', 't-dist']) {
  test(`P04-R3 analyse ${randomCi} preserves inference at outcome scale ${scale}`, () => {
    const original = NM.analyse(multiRows, { randomCi });
    const scaled = NM.analyse(scaleRows(multiRows, scale), { randomCi });
    assert.equal(original.ok, true, original.error);
    assert.equal(scaled.ok, true, scaled.error);
    assert.deepEqual(scaled.treatments, original.treatments);
    for (const model of ['common', 'random']) for (const quantity of ['TE', 'seTE', 'lower', 'upper', 'pval']) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const expected = original[model][quantity][i][j], got = scaled[model][quantity][i][j];
        if (expected === null) assert.equal(got, null);
        else near(got / (quantity === 'pval' ? 1 : scale), expected, `${model}.${quantity}[${i}][${j}]`);
      }
    }
    for (const quantity of ['Q', 'df', 'pvalQ', 'I2', 'lowerI2', 'upperI2']) near(scaled[quantity], original[quantity], quantity);
    near(scaled.tau2 / (scale * scale), multiTau, 'tau2');
    for (const quantity of ['Q', 'df', 'pval']) original.decomp[quantity].forEach((v, i) => {
      if (v === null) assert.equal(scaled.decomp[quantity][i], null);
      else near(scaled.decomp[quantity][i], v, `decomp.${quantity}[${i}]`);
    });
    for (const model of ['common', 'random']) original.pscore[model].forEach((v, i) => near(scaled.pscore[model][i], v, `pscore.${model}[${i}]`));
    for (const bound of ['lower', 'upper']) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (i === j) assert.equal(scaled.predict[bound][i][j], null);
      else near(scaled.predict[bound][i][j] / scale, original.predict[bound][i][j], `predict.${bound}[${i}][${j}]`);
    }
  });
}

for (const scale of [1, 1e-20, 1e20]) {
  test(`P04-R3 invert well-conditioned matrix at matrix scale ${scale}`, () => {
    const inverse = NM._invert([[4 * scale, 2 * scale], [2 * scale, 3 * scale]]);
    assert.notEqual(inverse, null);
    const expected = [[3 / 8, -1 / 4], [-1 / 4, 1 / 2]];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) near(inverse[i][j] * scale, expected[i][j], `inverse[${i}][${j}]`);
  });

  test(`P04-R3 singular and numerically rank-deficient matrices stay refused at matrix scale ${scale}`, () => {
    assert.equal(NM._invert([[scale, scale], [scale, scale]]), null);
    assert.equal(NM._invert([[scale, scale], [scale, (1 + Number.EPSILON) * scale]]), null);
  });
}

for (const scale of scales) {
  test(`P04-R3 disconnected network stays refused at outcome scale ${scale}`, () => {
    // N=4 >= K=3: this must reach the singular information-matrix check.
    const rows = [
      { study: 'ab1', t1: 'A', t2: 'B', est: 0.25, se: 0.25 },
      { study: 'ab2', t1: 'A', t2: 'B', est: 0.5, se: 0.25 },
      { study: 'cd1', t1: 'C', t2: 'D', est: 0.25, se: 0.25 },
      { study: 'cd2', t1: 'C', t2: 'D', est: 0.5, se: 0.25 },
    ];
    for (const model of ['fe', 're']) {
      const fit = NM.fit(scaleRows(rows, scale), { model });
      assert.equal(fit.ok, false);
      assert.match(fit.error, /singular design/);
    }
  });
}
