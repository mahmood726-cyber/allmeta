import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPage, loadLocationScale, pageSource, lsSource, replaceOnce, compare, pmExpected } from './p08-meta-regression-harness.mjs';

const inputURL = new URL('../r/p08-meta-regression-input.json', import.meta.url);
const inputBytes = readFileSync(inputURL);
const input = JSON.parse(inputBytes);
const fixtureURL = new URL('../r/p08-meta-regression-reference.json', import.meta.url);
// Exact native-R output from pass 1. Normal replay must not depend on TEMP.
const reference = JSON.parse(readFileSync(fixtureURL, 'utf8'));
const page = loadPage(), ls = loadLocationScale();
const pmInput = id => input.pm.find(c => c.id === id);
const pmRef = id => reference.pm.find(c => c.id === id);

test('P08 provenance control: native R versions, exact inputs and generator hash', () => {
  for (const key of ['R', 'metafor', 'jsonlite', 'numDeriv']) assert.ok(reference.provenance[key]);
  assert.deepEqual(reference.input, input);
  assert.equal(reference.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.equal(reference.provenance.script_md5, createHash('md5').update(readFileSync(new URL('../r/p08-meta-regression-reference.R', import.meta.url))).digest('hex'));
  assert.equal(reference.provenance.pm_control.tol, 1e-12);
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
});

for (const id of ['heterogeneous', 'floor', 'null_tau_zero', 'k3']) {
  test(`P08 PM ${id}: coefficients, SEs, CIs, t/p, QE/p, null tau2 and R2 match R`, () => {
    const r = pmRef(id);
    assert.equal(r.status, 'ok');
    compare(page(pmInput(id)).result, pmExpected(r));
  });
  test(`P08 PI ${id}: mean-covariate prediction and t(k-2) limits match predict(adhoc)`, () => {
    compare(page(pmInput(id)).pi, pmRef(id).pi);
  });
}

for (const id of ['k1', 'k2']) test(`P08 small-k ${id}: app and R refuse PM/HKSJ inference`, () => {
  // R's "refused" records the whole fit/predict workflow. For k=1, R drops x
  // and switches to z, then predict(newmods=...) fails; rma itself need not fail.
  const r = pmRef(id), a = page(pmInput(id));
  assert.equal(r.status, 'refused', r.reason);
  assert.ok(r.reason);
  assert.equal(a.fitted, null);
  assert.equal(a.pi, null);
  assert.deepEqual(a.result, { _schema: 'meta-regression-results-v1', k: pmInput(id).yi.length });
});

test('P08 boundary controls: positive tau2, adhoc floor, zero null tau2 and df=1 are exercised', () => {
  assert.ok(pmRef('heterogeneous').tau2 > 0);
  assert.equal(pmRef('floor').tau2, 0);
  assert.ok(pmRef('floor').knha.q < 1);
  assert.equal(pmRef('floor').q, 1);
  assert.equal(pmRef('null_tau_zero').tau2Null, 0);
  assert.equal(pmRef('null_tau_zero').R2, 0);
  assert.equal(pmRef('k3').df, 1);
});

test('P08 PI convention control: R t(k-2), t(k-1), and z are distinguishable', () => {
  const r = pmRef('heterogeneous');
  assert.ok(Math.abs(r.pi.lo - r.pi_k1.lo) > 1e-6);
  assert.ok(Math.abs(r.pi.lo - r.pi_z.lo) > 1e-6);
  assert.match(pageSource, /df: k - 2/);
});

const mutants = [
  ['HKSJ floor removed', 'floor', 'const q = Math.max(1, q_raw);', 'const q = q_raw;'],
  ['residual QE evaluated with RE weights', 'heterogeneous', 'const qE = feFit ? feFit.rss : 0;', 'const qE = f.rss;'],
  ['slope p uses k-1 degrees of freedom', 'k3', 'return betaInc(df/2, 0.5, x);', 'return betaInc((df+1)/2, 0.5, (df+1)/(df+1+t*t));'],
];
for (const [label, id, from, to] of mutants) test(`P08 planted defect: ${label} is rejected; original control passes`, () => {
  const expected = pmExpected(pmRef(id));
  compare(page(pmInput(id)).result, expected);
  const mutant = loadPage(replaceOnce(pageSource, from, to));
  assert.throws(() => compare(mutant(pmInput(id)).result, expected), assert.AssertionError);
});
test('P08 planted defect: PI uses default t(k-1); original t(k-2) control passes', () => {
  const c = pmInput('heterogeneous'), expected = pmRef(c.id).pi;
  compare(page(c).pi, expected);
  const mutant = loadPage(replaceOnce(pageSource, 'k: k, df: k - 2', 'k: k'));
  assert.throws(() => compare(mutant(c).pi, expected), assert.AssertionError);
});

// CXTASK explicitly requires observed new parity failures to stay executable
// under node:test TODO. These are fixed case IDs, never outcome-based skips.
const scaleTodos = {
  constant_scale: 'P08-R1: native R scale-slope SE/covariance differ by up to 2.2861553687386627e-4; REPORT.md',
  bcg_rounded: 'P08-R2: native R scale coefficients/SE/covariance differ by up to 2.1130625226106758e-4; REPORT.md',
};
for (const c of input.ls) {
  const r = reference.ls.find(r => r.id === c.id);
  for (const keys of [ ['beta', 'betaSE', 'betaVcov'], ['alpha', 'alphaSE', 'alphaVcov'], ['tau2', 'logLik'] ]) {
    const options = keys[0] === 'alpha' && scaleTodos[c.id] ? { todo: scaleTodos[c.id] } : {};
    test(`P08 LS ${c.id}: ${keys.join(', ')} match metafor ML at 1e-6`, options, () => {
      compare(ls(c), Object.fromEntries(keys.map(k => [k, r[k]])));
    });
  }
}
test('P08 planted defect: location SE inflated by 1%; original constant-scale control passes', () => {
  const c = input.ls.find(c => c.id === 'constant_scale'), r = reference.ls.find(r => r.id === c.id);
  compare(ls(c).betaSE, r.betaSE);
  const mutant = loadLocationScale(replaceOnce(lsSource, 'betaSE: betaSE,', 'betaSE: betaSE.map(s => s * 1.01),'));
  assert.throws(() => compare(mutant(c).betaSE, r.betaSE), assert.AssertionError);
});
