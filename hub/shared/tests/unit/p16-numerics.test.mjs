import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, controlText, engine } from '../../../../nma-inconsistency/tests/numerics-harness.mjs';

const triangle = (se, te = ['0.2', '0.3', '0.6']) =>
  `A,B,${te[0]},${se}\nB,C,${te[1]},${se}\nA,C,${te[2]},${se}`;
const numericError = /numerical|finite|weight|variance/i;
function finiteNumbers(x) {
  if (typeof x === 'number') assert.ok(Number.isFinite(x), `non-finite number: ${x}`);
  else if (x && typeof x === 'object') Object.values(x).forEach(finiteNumbers);
}
function refused(c, elements) {
  const s = c._almLastInco();
  assert.equal(s.status, 'refused', `invalid analysis accepted: ${JSON.stringify(s.dbt)}`);
  assert.match(s.reason, /numerically invalid/i);
  assert.equal(elements.get('ns-body').innerHTML, '', 'clear previous verdicts');
  assert.equal(elements.get('ns-plot').innerHTML, '', 'clear previous plot');
  assert.equal(elements.get('dbt').textContent, s.reason);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), { status: 'refused', reason: s.reason });
}

for (const model of ['FE', 'DL', 'PM']) {
  test(`P16-R2 ${model}: tiny finite SE refuses and clears prior results`, () => {
    const { c, elements } = harness();
    elements.get('f-model').value = model;
    c.__almIncoLoad(controlText);
    assert.equal(c._almLastInco().nodeSplit.length, 3);
    const text = triangle('1e-200');
    assert.equal(c.parse(text).length, 3, 'finite input must reach the fitting gate');
    c.__almIncoLoad(text);
    refused(c, elements);
    const plus = c.AlmIncoPlusCore.fitAll(engine(c), c.parse(text), model);
    assert.equal(plus.status, 'refused');
  });
  test(`P16-R2 ${model}: SE=1 control retains finite results and verdicts`, () => {
    const { c, elements } = harness();
    elements.get('f-model').value = model;
    c.__almIncoLoad(controlText);
    const s = c._almLastInco();
    assert.notEqual(s.status, 'refused');
    assert.equal(s.nodeSplit.length, 3);
    finiteNumbers(s);
    assert.equal((elements.get('ns-body').innerHTML.match(/>consistent</g) || []).length, 3);
    assert.ok(s.nodeSplit.every(r => r.direct.se > 0 && r.indirect.se > 0 && r.seDiff > 0 && r.p >= 0 && r.p <= 1));
    assert.equal(c.AlmIncoPlusCore.fitAll(engine(c), c.parse(controlText), model).status, 'ok');
  });
}

for (const [name, se, te] of [
  ['variance underflow', '1e-200'],
  ['weight overflow with nonzero variance', '1e-155'],
  ['variance overflow and zero weight', '1e200'],
  ['finite weights whose sum overflows', '1e-154'],
  ['weighted effect overflow', '1e-100', ['1e200', '1e200', '1e200']],
]) test(`P16-R2 source: ${name} is rejected by fitting and pooling`, () => {
  const { c } = harness(), rows = c.parse(triangle(se, te));
  assert.throws(() => c.fitNMA(rows), numericError);
  assert.throws(() => c.ivPool(rows), numericError);
});

test('P16-R2 source: finite coefficients with overflowing residual Q are rejected', () => {
  const { c } = harness();
  assert.throws(() => c.fitNMA(c.parse(triangle('1', ['1e200', '1e200', '1e200']))), numericError);
});

for (const tau2 of [NaN, Infinity, -1]) test(`P16-R2 source: invalid tau2 ${tau2} is not silently FE`, () => {
  const { c } = harness(), rows = c.parse(controlText);
  assert.throws(() => c.fitNMA(rows, undefined, tau2), numericError);
  assert.throws(() => c.ivPool(rows, tau2), numericError);
});

test('P16-R2 source control: finite small SE and valid tau2 remain usable', () => {
  const { c } = harness();
  for (const se of ['1', '1e-70', '1e-150']) for (const tau2 of [undefined, 0, 1]) {
    const rows = c.parse(triangle(se, ['0', '0', '0']));
    finiteNumbers(c.fitNMA(rows, undefined, tau2));
    const pool = c.ivPool(rows, tau2);
    finiteNumbers(pool); assert.ok(pool.se > 0);
  }
});

test('P16-R2 solver: non-finite input and elimination overflow throw', () => {
  const { c } = harness();
  for (const M of [[[Infinity]], [[NaN]], [[1, 1e308], [-1, 1e308]]]) {
    assert.throws(() => c.invert(M), numericError);
  }
});
test('P16-R2 solver control: finite inverse and singular refusal are preserved', () => {
  const { c } = harness();
  const inv = c.invert([[2, -1], [-1, 2]]);
  assert.equal(inv[0][0], 2 / 3); assert.equal(inv[0][1], 1 / 3);
  assert.throws(() => c.invert([[1, 1], [1, 1]]), /singular/);
});

test('P16-R2 DL: overflowing squared weights cannot become a NaN tau2', () => {
  const { c } = harness();
  const rows = c.parse(triangle('1e-100', ['0', '0', '0']));
  finiteNumbers(c.fitNMA(rows));
  assert.throws(() => c.estimateTau2(rows, 'DL'), numericError);
});
test('P16-R2 DL control: representable squared weights retain zero heterogeneity', () => {
  const { c } = harness();
  assert.equal(c.estimateTau2(c.parse(triangle('1e-70', ['0', '0', '0'])), 'DL'), 0);
});

test('P16-R2 split: non-finite p is rejected at the split source', () => {
  const { c } = harness();
  c.pz = () => NaN; // planted numerical failure after otherwise valid fits
  assert.throws(() => c.nodeSplit(c.parse(controlText)), numericError);
});
test('P16-R2 split: indirect numerical failure is not silently omitted', () => {
  const { c } = harness();
  c.fitNMA = () => { throw new RangeError('Non-finite numerical result.'); };
  assert.throws(() => c.nodeSplit(c.parse(controlText)), numericError);
});
test('P16-R2 split control: singular indirect component remains unavailable', () => {
  const { c } = harness();
  c.fitNMA = () => { throw new Error('singular'); };
  assert.equal(c.nodeSplit(c.parse(controlText)).length, 0);
});
test('P16-R2 run: non-finite split statistics cannot receive a verdict', () => {
  const { c, elements } = harness(), original = c.nodeSplit;
  c.nodeSplit = (...args) => original(...args).map(r => ({ ...r, p: NaN }));
  c.__almIncoLoad(controlText);
  refused(c, elements);
});
test('P16-R2 run: split arithmetic failure becomes a refusal', () => {
  const { c, elements } = harness();
  c.pz = () => NaN;
  c.__almIncoLoad(controlText);
  refused(c, elements);
});
test('P16-R2 plus: split arithmetic failure becomes a refusal', () => {
  const { c } = harness();
  c.pz = () => NaN;
  assert.equal(c.AlmIncoPlusCore.fitAll(engine(c), c.parse(controlText), 'FE').status, 'refused');
});
test('P16-R2 global: non-finite probability is refused at source and in run', () => {
  const { c, elements } = harness(), rows = c.parse(controlText);
  c.chiSqCDF = () => NaN;
  assert.throws(() => c.dbt(rows), numericError);
  // Keep the split probability valid to isolate the global calculation.
  c.pz = () => 0.5;
  c.__almIncoLoad(controlText);
  refused(c, elements);
});
test('P16-R2 plus: global arithmetic failure becomes a refusal', () => {
  const { c } = harness();
  c.chiSqCDF = () => NaN;
  c.pz = () => 0.5;
  assert.equal(c.AlmIncoPlusCore.fitAll(engine(c), c.parse(controlText), 'FE').status, 'refused');
});
test('P16-R2 no-loop control: unavailable global p remains a valid analysis', () => {
  const { c, elements } = harness();
  c.__almIncoLoad('A,B,.2,1\nB,C,.3,1\nC,D,.6,1');
  const s = c._almLastInco();
  assert.notEqual(s.status, 'refused');
  assert.equal(s.nodeSplit.length, 0);
  assert.equal(s.dbt.Q, 0); assert.equal(s.dbt.df, 0); assert.equal(s.dbt.p, null);
  assert.match(elements.get('dbt').innerHTML, /inconsistency is not testable/);
});

test('P16-R2 R control: ordinary FE network matches native R fixture', () => {
  // Captured from the native R run in pass-2 feedback. The generator and actual
  // R/stats versions accompany the fixture; use the existing 1e-9 contract.
  const reference = JSON.parse(readFileSync(new URL(
    '../../../../nma-inconsistency/tests/fixtures/p16-numerics-reference.json', import.meta.url), 'utf8'));
  const { c } = harness(), rows = c.parse(reference.input);
  const close = (actual, expected, label, probability = false) => {
    assert.ok(Number.isFinite(actual), `${label} must be finite`);
    const scale = probability ? 1 : Math.max(1, Math.abs(expected));
    assert.ok(Math.abs(actual - expected) / scale <= 1e-9,
      `${label}: app=${actual}, R=${expected}`);
  };
  const fit = c.fitNMA(rows);
  assert.equal(fit.beta.length, reference.beta.length);
  assert.equal(fit.cov.length, reference.se.length);
  reference.beta.forEach((value, i) => close(fit.beta[i], value, `beta[${i}]`));
  reference.se.forEach((value, i) => close(Math.sqrt(fit.cov[i][i]), value, `se[${i}]`));
  close(fit.Q, reference.Q, 'Q');
  assert.equal(fit.df, reference.df);
  const global = c.dbt(rows);
  close(global.Q, reference.dbt.Q, 'global Q');
  assert.equal(global.df, reference.dbt.df);
  close(global.p, reference.dbt.p, 'global p', true);
  const splits = new Map(c.nodeSplit(rows).map(row => [row.comparison, row]));
  assert.deepEqual([...splits.keys()].sort(), reference.splits.map(row => row.comparison).sort());
  for (const expected of reference.splits) {
    const actual = splits.get(expected.comparison), label = expected.comparison;
    close(actual.direct.mean, expected.direct, `${label} direct`);
    close(actual.indirect.mean, expected.indirect, `${label} indirect`);
    close(actual.direct.se, expected.directSE, `${label} direct SE`);
    close(actual.indirect.se, expected.indirectSE, `${label} indirect SE`);
    for (const key of ['diff', 'seDiff', 'z', 'p']) {
      close(actual[key], expected[key], `${label} ${key}`, key === 'p');
    }
  }
});
