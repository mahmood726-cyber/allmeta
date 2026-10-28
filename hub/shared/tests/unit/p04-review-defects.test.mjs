import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import NM from '../../../../shared/nma-multiarm-v1.js';

const inputs = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/p04-rounded-effects-input.json', import.meta.url), 'utf8'));
const fixture = new URL('../../../../tests/fixtures/p04-rounded-effects-oracle.json', import.meta.url);
// The initial RED run uses the fresh R output; subsequent runs use the retained fixture.
// Load inside parity assertions so a missing oracle cannot prevent the
// independent relabelling and refusal assertions from running.
const readOracle = () => JSON.parse(readFileSync(existsSync(fixture) ? fixture : join(tmpdir(), 'p04-f1-oracle.json'), 'utf8'));
const near = (a, b, label, tol = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol,
  `${label}: ${a} versus ${b} (tolerance ${tol})`);
const rename = rows => rows.map(r => ({ ...r, t1: r.t1 === 'A' ? 'Z' : r.t1, t2: r.t2 === 'A' ? 'Z' : r.t2 }));

test('control: fresh netmeta oracle records matching inputs and R/package versions', () => {
  const oracle = readOracle();
  for (const key of ['R', 'netmeta', 'meta', 'metafor']) assert.ok(oracle.provenance[key]);
  for (const [name, rows] of Object.entries(inputs)) {
    assert.deepEqual(oracle.cases[name].rows, rows, name);
    assert.deepEqual(oracle.cases[`${name}_renamed`].rows, rename(rows), `${name} renamed`);
  }
});

for (const [name, rows] of Object.entries(inputs)) {
  const kind = name.endsWith('_exact') ? 'control' : 'plant P04-R1';
  test(`${kind}: ${name} common and random effects match fresh netmeta`, () => {
    const a = NM.analyse(rows), ref = readOracle().cases[name];
    assert.equal(a.ok, true, a.error);
    for (const model of ['common', 'random']) for (const field of ['TE', 'seTE']) {
      for (let i = 0; i < ref.treatments.length; i++) for (let j = 0; j < ref.treatments.length; j++) {
        const ai = a.treatments.indexOf(ref.treatments[i]), aj = a.treatments.indexOf(ref.treatments[j]);
        near(a[model][field][ai][aj], ref[model][field][i][j], `${name} ${model}.${field} ${ref.treatments[i]} vs ${ref.treatments[j]}`);
      }
    }
  });
  test(`${kind}: ${name} Q, tau2 and design decomposition match fresh netmeta`, () => {
    const a = NM.analyse(rows), ref = readOracle().cases[name];
    assert.equal(a.ok, true, a.error);
    for (const k of ['Q', 'tau2', 'df']) near(a[k], ref[k], `${name} ${k}`);
    for (const k of ['Q', 'df']) ref.decomp[k].forEach((v, i) => near(a.decomp[k][i], v, `${name} decomp.${k}[${i}]`));
  });
  test(`${kind}: ${name} treatment rename, row order and direction preserve results`, () => {
    const a = NM.analyse(rows);
    assert.equal(a.ok, true, a.error);
    for (const variant of [rename(rows), rename(rows).reverse().map(r => ({ ...r, t1: r.t2, t2: r.t1, est: -r.est }))]) {
      const b = NM.analyse(variant);
      assert.equal(b.ok, true, b.error);
      const perm = a.treatments.map(t => b.treatments.indexOf(t === 'A' ? 'Z' : t));
      for (const model of ['common', 'random']) for (const field of ['TE', 'seTE']) {
        for (let i = 0; i < perm.length; i++) for (let j = 0; j < perm.length; j++) {
          near(a[model][field][i][j], b[model][field][perm[i]][perm[j]], `${name} rename ${model}.${field}`);
        }
      }
      for (const k of ['Q', 'tau2', 'df']) near(a[k], b[k], `${name} rename ${k}`);
    }
  });
}

test('control: above-tolerance effects, duplicated and incomplete multi-arm studies remain refused', () => {
  const rows = inputs.three_exact;
  const bad = rows.map((r, i) => i === 2 ? { ...r, est: r.est + 0.01 } : r);
  assert.match(NM.analyse(bad).error, /inconsistent treatment effects/);
  assert.match(NM.analyse(rows.concat(rows[0])).error, /duplicated comparison/);
  assert.match(NM.analyse(rows.filter((_, i) => i !== 2)).error, /incomplete set/);
});

test('control: a two-arm network remains invariant to labels and row direction', () => {
  const rows = inputs.heterogeneous_rounded.filter(r => r.study !== 'Three');
  const a = NM.analyse(rows), b = NM.analyse(rename(rows));
  assert.equal(a.ok, true, a.error); assert.equal(b.ok, true, b.error);
  for (const model of ['common', 'random']) {
    const at = a.treatments.indexOf('C'), ar = a.treatments.indexOf('A');
    const bt = b.treatments.indexOf('C'), br = b.treatments.indexOf('Z');
    near(a[model].TE[at][ar], b[model].TE[bt][br], model);
  }
});
