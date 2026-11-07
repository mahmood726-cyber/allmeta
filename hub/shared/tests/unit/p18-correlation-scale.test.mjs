import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import MV from '../../../../shared/multivariate-ma.js';

// Execute the shipped pure parser without a browser or a copy of its arithmetic.
const html = readFileSync(new URL('../../../../multivariate-ma/index.html', import.meta.url), 'utf8');
const parserStart = html.indexOf('    function number(s)');
const parserEnd = html.indexOf('    // The mode is kept', parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart, 'Locate the shipped parser');
const parse = vm.runInNewContext(`${html.slice(parserStart, parserEnd)}\nparse;`, {
  window: { AlmMultivariate: MV }
});

// Analytical identities, not R-parity fixtures: for equal variances v, cov = r*v.
// Compare relatively with no absolute floor: zero must not pass for tiny covariances.
function near(actual, expected, label) {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite result ${actual}`);
  if (expected === 0) assert.equal(actual, 0, label);
  else assert.ok(Math.abs((actual - expected) / expected) <= 2e-15,
    `${label}: got ${actual}, expected ${expected}`);
}

const correlations = [-0.5, 0, 0.5];
const scales = [
  { name: 'ordinary', v: 4, kind: 'control' },
  { name: 'underflowed variance product', v: 1e-200, kind: 'plant' },
  { name: 'overflowed variance product', v: 1e200, kind: 'plant' },
  { name: 'subnormal variance product', v: 1e-160, kind: 'plant' }
];

test('P18-R2 control: ordinary unequal variances preserve positive, negative and zero correlations', () => {
  for (const r of correlations) near(MV.covFromR(4, 9, r), 6 * r, `r=${r}`);
});

for (const { name, v, kind } of scales) {
  test(`P18-R2 ${kind}: covFromR with ${name}`, () => {
    for (const r of correlations) near(MV.covFromR(v, v, r), r * v, `r=${r}`);
  });

  for (const mode of ['r', 'rhoW']) {
    test(`P18-R2 ${kind}: ${mode} input with ${name}`, () => {
      for (const r of correlations) {
        const text = `study, 1, ${v}, 2, ${v}` + (mode === 'r' ? `, ${r}` : '');
        const parsed = parse(text, mode, r);
        assert.equal(parsed.omitted.length, 0);
        assert.equal(parsed.rows.length, 1);
        near(parsed.rows[0].cov, r * v, `covariance for r=${r}`);
        assert.equal(parsed.rows[0].r, r);
        assert.equal(parsed.rhoW, mode === 'rhoW' ? r : null);
      }
    });
  }

  test(`P18-R2 ${kind}: covariance input recovers correlations with ${name}`, () => {
    for (const r of correlations) {
      const cov = r * v;
      const parsed = parse(`study, 1, ${v}, 2, ${v}, ${cov}`, 'cov');
      assert.equal(parsed.omitted.length, 0);
      assert.equal(parsed.rows.length, 1);
      assert.equal(parsed.rows[0].cov, cov);
      near(parsed.rows[0].r, r, `derived correlation for r=${r}`);
      assert.ok(Math.abs(parsed.rows[0].r) < 1, 'Valid covariance must not receive an invalid-r flag');
    }
  });
}

test('P18-R2 plant: representable covariances near both finite variance limits', () => {
  for (const v of [2 ** -1070, Number.MAX_VALUE]) {
    for (const r of correlations) near(MV.covFromR(v, v, r), r * v, `v=${v}, r=${r}`);
  }
});

test('P18-R2 control: opposite variance scales and tiny correlations are symmetric', () => {
  for (const r of [...correlations, -1e-200, 1e-200]) {
    near(MV.covFromR(1e-300, 1e300, r), r, `forward r=${r}`);
    near(MV.covFromR(1e300, 1e-300, r), r, `reversed r=${r}`);
    near(parse(`study, 1, 1e-300, 2, 1e300, ${r}`, 'cov').rows[0].r, r, `inverse r=${r}`);
  }
});

test('P18-R2 control: parser retains variance and per-study correlation refusals', () => {
  for (const r of [-1, 1, 2]) {
    const parsed = parse(`study, 1, 4, 2, 9, ${r}`, 'r');
    assert.equal(parsed.rows.length, 0);
    assert.match(parsed.omitted[0].reason, /within-study r must satisfy/);
  }
  for (const v of [-1, 0]) {
    const parsed = parse(`study, 1, ${v}, 2, 9, 0.5`, 'r');
    assert.equal(parsed.rows.length, 0);
    assert.equal(parsed.omitted[0].reason, 'variance must be > 0');
  }
  near(parse('study, 1, 4, 2, 9, 12', 'cov').rows[0].r, 2,
    'Invalid covariance retains its out-of-range derived correlation');
});
