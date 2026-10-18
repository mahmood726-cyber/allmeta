'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const B = require('../../shared/dta-bivariate.js');
const cases = require('./moses-cases.cjs');
const baseline = require('./fixtures/moses-ordinary-baseline.json');

test('constant FPR refuses the SROC conversion and returns undefined correlation', () => {
  for (const correctionControl of ['all','single','none']) {
    // Six rows give a slope one ulp below 1 in the original engine; three give
    // exactly 1 and infinite A2/B2. Both geometries must refuse.
    for (const rows of [cases.fprConstant, cases.fprConstant.slice(0,3)]) {
      assert.throws(() => B.mosesLittenberg(rows, {correctionControl}), /identical false-positive rates/);
      assert.equal(B.thresholdSpearman(rows, {correctionControl}), null);
    }
  }
});
test('constant FPR refuses even when tiny sensitivity variation amplifies slope roundoff', () => {
  for (const correctionControl of ['all','single','none']) {
    for (const scale of [1e6,1e9,1e12,1e14]) {
      const rows = cases.fprConstantCloseSe.map((r,i) => ({...r,tp:scale+i,fn:scale-i}));
      assert.throws(() => B.mosesLittenberg(rows,{correctionControl}), /identical false-positive rates/);
      assert.equal(B.thresholdSpearman(rows,{correctionControl}), null);
    }
  }
});
test('constant S and repeated identical studies refuse rank-deficient regression', () => {
  for (const rows of [cases.sConstant, cases.identical]) {
    assert.throws(() => B.mosesLittenberg(rows), /no resolvable variation/);
  }
  assert.equal(B.thresholdSpearman(cases.identical), null);
  assert.equal(B.thresholdSpearman(cases.sConstant), -1);
});
test('constant sensitivity keeps the identifiable horizontal SROC but has no rank correlation', () => {
  const fit = B.mosesLittenberg(cases.seConstant);
  assert.ok(Math.abs(fit.B1+1) < 1e-12);
  assert.ok(Math.abs(fit.B2) < 1e-12);
  assert.ok(Math.abs(fit.A2-Math.log(4)) < 1e-12);
  assert.equal(B.thresholdSpearman(cases.seConstant), null);
});
test('small study sets, zero-cell policies, and genuinely varying FPR retain their contracts', () => {
  assert.equal(B.mosesLittenberg(cases.ordinary.slice(0,2)), null);
  assert.equal(B.thresholdSpearman(cases.ordinary.slice(0,1)), null);
  assert.throws(() => B.mosesLittenberg(cases.zeroCell, {correctionControl:'none'}));
  for (const cc of ['all','single']) {
    const fit = B.mosesLittenberg(cases.zeroCell, {correctionControl:cc});
    assert.ok(Object.values(fit).every(Number.isFinite));
  }
  const near = cases.fprConstant.map((r,i) => ({...r, fp:100000+i, tn:900000-i}));
  assert.ok(Object.values(B.mosesLittenberg(near)).every(Number.isFinite));
  assert.notEqual(B.thresholdSpearman(near), null);
});
test('3000 seeded ordinary configurations match the unchanged-main numerical fingerprint exactly', () => {
  const outputs = cases.ordinaryCorpus().map(({rows,opts}) => ({moses:B.mosesLittenberg(rows,opts),rho:B.thresholdSpearman(rows,opts)}));
  assert.equal(outputs.length, baseline.cases);
  assert.ok(outputs.every(x => x.moses && Object.values(x.moses).every(Number.isFinite) && Number.isFinite(x.rho)));
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(outputs)).digest('hex'), baseline.sha256);
});
