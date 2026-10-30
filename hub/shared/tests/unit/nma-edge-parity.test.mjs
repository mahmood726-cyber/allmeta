import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TOL, readOracle, appRows, runCase, comparisons, assertChecks } from '../r/nma-edge-parity-helper.mjs';

const oracle = readOracle();
test('NMA edge parity: reference provenance and five gap families', () => {
  for (const key of ['R', 'netmeta', 'meta', 'metafor']) assert.ok(oracle.provenance[key], key);
  assert.equal(oracle.provenance.method_tau, 'DL');
  assert.equal(oracle.provenance.generator_md5, createHash('md5').update(readFileSync(new URL('../r/nma-edge-parity.R', import.meta.url))).digest('hex'));
  assert.deepEqual([...new Set(oracle.cases.map(c => c.family))].sort(), ['k1', 'k2', 'prediction', 'tau_boundary', 'zero_cells']);
  assert.equal(oracle.cases.length, 21);
  assert.equal(TOL, 1e-6);
});

test('NMA edge parity control: R NULL stays null and contrast-only inputs reach the engine', () => {
  for (const c of oracle.cases.filter(c => c.family !== 'zero_cells')) {
    assert.equal(c.arms, null, `${c.id}: R NULL must not serialize as []`);
    assert.deepEqual(appRows(c), c.rows);
    assert.ok(appRows(c).length > 0);
  }
  const binary = oracle.cases.find(c => c.id === 'or_nonzero');
  assert.equal(appRows(binary).length, binary.rows.length);
});

// Explicitly enumerated discrepancies observed in pass 1. The assertions still run.
// New failures outside these groups remain hard failures; no automatic TODO on failure.
const knownDifferences = new Map([
  ['or_double_zero', 'P04-P2: converter retains a double-zero study omitted by pairwise(allstudies=FALSE)'],
  ['rr_double_zero', 'P04-P2: converter retains a double-zero study omitted by pairwise(allstudies=FALSE)'],
  ['rr_single_zero', 'P04-P1: RR continuity-correction denominators differ from pairwise defaults'],
  ['rr_multiarm_zero', 'P04-P1: RR continuity-correction denominators differ from pairwise defaults'],
]);
const affectedGroups = new Set(['effects', 'inference', 'heterogeneity', 'prediction', 'decomposition', 'ranking', 'contrasts']);
for (const c of oracle.cases) for (const ref of c.fits) {
  const checks = comparisons(c, ref, runCase(c, ref.ci));
  for (const group of [...new Set(checks.map(x => x.group))]) {
    const todo = affectedGroups.has(group) ? knownDifferences.get(c.id) : undefined;
    test(`NMA R parity: ${c.id} / ${ref.ci} / ${group}`, { todo }, () => assertChecks(checks.filter(x => x.group === group)));
  }
}

test('NMA edge parity control: unavailable PI is null or an all-null R matrix, never a finite bound', () => {
  const c = oracle.cases.find(c => c.id === 'two_pair_tau0'), ref = c.fits[0];
  const actual = runCase(c, ref.ci);
  assert.equal(actual.desirable.predict, null);
  assert.ok(ref.predict.lower.flat().every(x => x === null));
  assertChecks(comparisons(c, ref, actual).filter(x => x.group === 'prediction'));
  actual.desirable.predict = { lower: [[null, -1], [-1, null]], upper: [[null, 1], [1, null]] };
  assert.throws(() => assertChecks(comparisons(c, ref, actual).filter(x => x.group === 'prediction')), { code: 'ERR_ASSERTION' });
});

test('NMA edge parity control: df.Q PI agrees with t_(k-1) for two treatments', () => {
  const c = oracle.cases.find(c => c.id === 'pi_pair_df2');
  for (const f of c.fits) {
    assert.equal(f.ok, true);
    assert.equal(f.df, f.k - 1);
    assert.equal(f.pi_q_df.critical, f.pi_k_minus_1.critical);
    for (const field of ['lower', 'upper']) assert.ok(Math.abs(f.predict[field][0][1] - f.pi_k_minus_1[field][0][1]) <= TOL);
  }
});
test('NMA edge parity control: network PI uses documented df.Q when it differs from k-1', () => {
  const c = oracle.cases.find(c => c.id === 'pi_df2');
  for (const f of c.fits) {
    assert.equal(f.ok, true);
    assert.notEqual(f.df, f.k - 1);
    for (const field of ['lower', 'upper']) {
      assert.ok(Math.abs(f.predict[field][0][1] - f.pi_q_df[field][0][1]) <= TOL);
      assert.ok(Math.abs(f.predict[field][0][1] - f.pi_k_minus_1[field][0][1]) > .1);
    }
  }
});
test('NMA edge parity control: fixtures straddle DL truncation and include a P-score tie', () => {
  const get = id => oracle.cases.find(c => c.id === id).fits[0];
  for (const id of ['boundary_zero', 'boundary_below', 'boundary_at']) assert.equal(get(id).tau2, 0);
  assert.ok(get('boundary_above').tau2 > TOL);
  for (const x of get('boundary_zero').pscore.desirable.common) assert.equal(x, .5);
});

// Deliberate in-memory corruptions prove each new comparator rejects an incorrect engine output.
// The unchanged engine is the positive control; no source file is modified for these plants.
for (const [name, mutate] of [
  ['effect sign', a => { a.desirable.random.TE[0][1] *= -1; }],
  ['standard error', a => { a.desirable.common.seTE[0][1] += .01; }],
  ['tau2 truncation', a => { a.desirable.tau2 = 0; }],
  ['normal instead of t CI', a => { a.desirable.random.lower[0][1] = a.desirable.random.TE[0][1] - 1.959963984540054 * a.desirable.random.seTE[0][1]; }],
  ['normal instead of t PI', a => { const x = a.desirable; x.predict.lower[0][1] = x.random.TE[0][1] - 1.959963984540054 * Math.sqrt(x.random.seTE[0][1] ** 2 + x.tau2); }],
  ['ranking direction', a => { a.desirable.pscore.random[0] = a.undesirable.pscore.random[0]; }],
  ['nonfinite statistic', a => { a.desirable.pvalQ = NaN; }],
]) {
  test(`NMA parity planted defect: ${name}; unchanged-engine control passes`, () => {
    const c = oracle.cases.find(c => c.id === 'pi_df2'), ref = c.fits.find(f => f.ci === 't-dist');
    const actual = runCase(c, ref.ci);
    assertChecks(comparisons(c, ref, actual));
    mutate(actual);
    assert.throws(() => assertChecks(comparisons(c, ref, actual)), { code: 'ERR_ASSERTION' });
  });
}
