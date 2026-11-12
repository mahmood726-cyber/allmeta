import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Tail = require('../../../../shared/upper-tail.js');
const Egger = require('../../../../shared/egger.js');
const XMA = require('../../../../shared/experimental-ma.js');
const Transport = require('../../../../shared/transportability-v1.js');
const DTA = require('../../../../shared/dta-bivariate.js');
const DTAPlus = require('../../../../dta-sroc/plus-bivariate.js');

const rel = (a, b) => Math.abs(a - b) / b;
// R 4.6.0: 2 * pt(t, df, lower.tail = FALSE), %.17g
const R2 = [[50, 3, 1.7617152041271951e-05], [1e4, 3, 2.2053155022958127e-12], [1e9, 5, 1.8980334491124529e-44], [3, 10, 0.013343655022569588]];

// Egger-type data: y/se = b0 + b1 / se + tiny alternating noise, so the intercept t is ~1e7 and the
// two-sided p is ~1e-20 or smaller -- far below where 1 - CDF cancels to 0.
const se = [0.1, 0.15, 0.2, 0.3, 0.45, 0.6];
const yi = se.map((s, i) => s * (10 + 1 / s + (i % 2 ? 1e-6 : -1e-6)));

for (const [name, tsf2] of [['egger.js', Egger._tsf2], ['transportability-v1.js', Transport._tsf2],
  ['dta-bivariate.js', DTA._internal && DTA._internal.tsf2], ['dta-sroc/plus-bivariate.js', DTAPlus._internal && DTAPlus._internal.tsf2],
  ['experimental-ma.js', XMA._tsf2]]) {
  test(`t tails ${name}: two-sided t p-value helper matches R 2*pt(|t|, df, lower=FALSE)`, () => {
    assert.equal(typeof tsf2, 'function', `${name} has no two-sided upper-tail helper`);
    for (const [t, df, ref] of R2) {
      assert.ok(rel(tsf2(t, df), ref) < 1e-9, `${name} tsf2(${t}, ${df}) = ${tsf2(t, df)}, R ${ref}`);
      assert.ok(rel(tsf2(-t, df), ref) < 1e-9, `${name} tsf2(${-t}, ${df}) symmetric`);
    }
    assert.equal(tsf2(0, 4), 1);
  });
}

test('t tails egger.js: eggerTest p keeps relative precision at a huge intercept t', () => {
  const r = Egger.eggerTest(yi.map((y, i) => ({ y, se: se[i] })));
  assert.ok(Math.abs(r.t) > 1e5, `t = ${r.t}`);
  assert.ok(r.p > 0, `Egger p underflowed to ${r.p}`);
  assert.ok(rel(r.p, Tail.p2t(r.t, r.df)) < 1e-9, `p ${r.p} vs ${Tail.p2t(r.t, r.df)}`);
});

test('t tails experimental-ma.js: egger() p keeps relative precision at a huge intercept t', () => {
  const r = XMA.egger(yi, se);
  assert.ok(Math.abs(r.t) > 1e5, `t = ${r.t}`);
  assert.ok(r.p > 0, `egger p underflowed to ${r.p}`);
  assert.ok(rel(r.p, Tail.p2t(r.t, r.df)) < 1e-9, `p ${r.p} vs ${Tail.p2t(r.t, r.df)}`);
});

test('t tails Deeks: deeksTest p is the two-sided upper tail of its own t', () => {
  const rows = [[90, 10, 10, 90], [45, 8, 7, 50], [30, 9, 6, 40], [20, 6, 5, 25], [60, 12, 9, 70]]
    .map(([tp, fp, fn, tn]) => ({ tp, fp, fn, tn }));
  for (const M of [DTA, DTAPlus]) {
    const r = M.deeksTest(rows);
    assert.ok(rel(r.p, Tail.p2t(r.t, r.df)) < 1e-9, `deeks p ${r.p} vs ${Tail.p2t(r.t, r.df)}`);
  }
});
