import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import NM from '../../../../shared/nma-multiarm-v1.js';

const inputs = JSON.parse(readFileSync(new URL('../../../../nma/tests/fixtures/p04-design-labels-input.json', import.meta.url), 'utf8'));
const oraclePath = new URL('../../../../nma/tests/fixtures/p04-design-labels-oracle.json', import.meta.url);
// Read inside the parity assertions so an unavailable R fixture cannot mask
// the independent analytical plants and controls during the baseline run.
const readOracle = () => JSON.parse(readFileSync(existsSync(oraclePath) ? oraclePath :
  join(tmpdir(), 'p04-r2-design-labels-oracle.json'), 'utf8'));
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12,
  `${label}: ${actual} versus ${expected}`);
function analyse(rows) {
  const a = NM.analyse(rows);
  assert.equal(a.ok, true, a.error);
  assert.deepEqual(a.treatments, [...new Set(rows.flatMap(r => [r.t1, r.t2]))].sort(), 'original treatment names are preserved');
  return a;
}
function cycle(a, within = 0) {
  // Four-edge cycle: loop discrepancy 4, variance 1/2 + 1/2 + 1 + 1 = 3.
  // The repeated pairs have 2 within-design df; the loop has 1 between-design df.
  [16 / 3 + within, within, 16 / 3].forEach((v, i) => near(a.decomp.Q[i], v, `Q[${i}]`));
  assert.deepEqual(a.decomp.df, [3, 2, 1]);
  assert.ok(a.decomp.pval.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
}

test('P04-R2 plant: colon-containing treatment sets retain separate design Q and df', () => {
  const a = analyse(inputs.colon);
  cycle(a);
});

test('P04-R2 plant: bijective treatment renaming preserves decomposition and p-values', () => {
  const rename = { A: 'A', 'A:B': 'B', 'B:C': 'C', C: 'D' };
  const renamed = inputs.colon.map(r => ({ ...r, t1: rename[r.t1], t2: rename[r.t2] }));
  assert.deepEqual(renamed, inputs.ordinary);
  const a = analyse(inputs.colon), b = analyse(renamed);
  assert.deepEqual(a.decomp, b.decomp);
});

test('P04-R2 control: ordinary treatment labels match the analytical cycle', () => {
  cycle(analyse(inputs.ordinary));
});

test('P04-R2 control: repeated designs pool heterogeneous studies with reversed contrasts', () => {
  // Each repeated pair has residuals -1 and +1 with unit variance: within Q = 4.
  cycle(analyse(inputs.heterogeneous), 4);
});

test('P04-R2 control: fresh R oracle records exact inputs and package versions', () => {
  const oracle = readOracle();
  for (const key of ['R', 'netmeta', 'meta']) assert.ok(oracle.provenance[key], key);
  assert.equal(oracle.provenance.generator, 'p04-design-labels-reference.R');
  assert.equal(oracle.provenance.serialization, 'base R; 17 significant digits');
  const inputBytes = readFileSync(new URL('../../../../nma/tests/fixtures/p04-design-labels-input.json', import.meta.url));
  assert.equal(oracle.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.deepEqual(Object.keys(oracle.cases).sort(), Object.keys(inputs).sort());
  for (const [name, rows] of Object.entries(inputs)) assert.deepEqual(oracle.cases[name].rows, rows, name);
});

for (const [name, rows] of Object.entries(inputs)) {
  test(`P04-R2 R parity: ${name} design decomposition matches fresh netmeta`, () => {
    const a = analyse(rows), ref = readOracle().cases[name];
    assert.deepEqual(ref.rows, rows, name);
    for (const key of ['Q', 'pval']) {
      assert.equal(a.decomp[key].length, ref.decomp[key].length);
      ref.decomp[key].forEach((v, i) => near(a.decomp[key][i], v, `${name} ${key}[${i}]`));
    }
    assert.deepEqual(a.decomp.df, ref.decomp.df);
  });
}
