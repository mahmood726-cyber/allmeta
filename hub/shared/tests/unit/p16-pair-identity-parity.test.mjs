import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P, E, key, json } from './p16-pair-identity-support.mjs';

const reference = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/p16-pair-identity-reference.json', import.meta.url), 'utf8'));
const near = (actual, expected, label, tolerance) => {
  if (expected === null) return assert.equal(actual, null, label);
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: app ${actual}, R ${expected}, tolerance ${tolerance}`);
};
// Match unambiguous legacy records as well, so the relabelled controls run on
// the original production sources. New fits retain their structural keys.
const splitFor = (fit, a, b) => fit.nodeSplit.find(s => s.pairKey
  ? s.pairKey === key(a, b) : s.comparison === [a, b].sort().join(' vs '));

for (const [name, ref] of Object.entries(reference.cases)) {
  const model = name.split('-').at(-1), relTol = model === 'PM' ? 1e-6 : 1e-9;
  const pair = id => id.split(':').map(i => ref.treatments[Number(i) - 1]);
  const relative = (actual, expected, label) => near(actual, expected, label, relTol * Math.max(1, Math.abs(expected)));
  function checkFit(fit, expected, label) {
    assert.equal(fit.status, expected.status, label);
    relative(fit.tau2, expected.tau2, label + ' tau2');
    relative(fit.dbt.Q, expected.global.Q, label + ' Q');
    assert.equal(fit.dbt.df, expected.global.df, label + ' df');
    near(fit.dbt.p, expected.global.p, label + ' global p', 1e-9);
    assert.equal(fit.nodeSplit.length, Object.keys(expected.splits).length, label + ' split membership');
    for (const [id, r] of Object.entries(expected.splits)) {
      const s = splitFor(fit, ...pair(id));
      assert.ok(s, label + ' missing ' + id);
      const values = { direct: s.direct.mean, 'direct.se': s.direct.se,
        indirect: s.indirect.mean, 'indirect.se': s.indirect.se,
        diff: s.diff, 'diff.se': s.seDiff, z: s.z };
      for (const [field, value] of Object.entries(values)) relative(value, r[field], `${label} ${id} ${field}`);
      near(s.p, r.p, `${label} ${id} p`, 1e-9);
    }
  }
  test(`P16-R3 R parity ${name}: graph, model triples and every LOO fit match native R`, () => {
    assert.match(reference.versions.R, /4\.6\.0/);
    assert.equal(reference.versions.netmeta, '3.7.0');
    assert.equal(reference.versions.metafor, '5.2.1');
    const L = P.loo(E, ref.rows, model), edges = P.graphEdges(L.base, ref.rows);
    assert.equal(edges.length, Object.keys(ref.full.splits).length);
    for (const [id, r] of Object.entries(ref.full.splits)) {
      const [a, b] = pair(id), edge = edges.find(e => e.a === a && e.b === b);
      assert.ok(edge, `graph missing ${id}`);
      assert.equal(edge.k, 1);
      near(edge.p, r.p, `graph ${id} p`, 1e-9);
    }
    checkFit(L.base, ref.full, 'full');
    assert.equal(L.drops.length, ref.drops.length);
    L.drops.forEach((drop, i) => {
      const expected = ref.drops[i];
      checkFit(drop, expected, 'without ' + ref.rows[i].study);
      const flips = [], lost = [];
      for (const s of L.base.nodeSplit) {
        const id = Object.keys(ref.full.splits).find(k => splitFor(L.base, ...pair(k)) === s);
        const p = expected.splits[id]?.p ?? null;
        near(drop.splitP[s.pairKey || s.comparison], p, `drop ${i} ${id} p`, 1e-9);
        if (p === null) lost.push(s.comparison);
        else if ((p < 0.05) !== (ref.full.splits[id].p < 0.05)) flips.push(s.comparison);
      }
      assert.deepEqual(json(drop.splitFlips), flips);
      assert.deepEqual(json(drop.splitLost), lost);
      assert.equal(drop.globalFlip, ref.full.global.p !== null && expected.global.p !== null &&
        (ref.full.global.p < 0.05) !== (expected.global.p < 0.05));
    });
    const comparison = P.compare3(E, ref.rows);
    assert.equal(comparison.splits.length, Object.keys(ref.full.splits).length);
    // Sorting by this model's p compares all six records even when labels collide.
    const actual = comparison.splits.map(s => s.p[model]).sort((a, b) => a - b);
    const expected = Object.values(ref.full.splits).map(s => s.p).sort((a, b) => a - b);
    actual.forEach((p, i) => near(p, expected[i], `model ${model} p ${i}`, 1e-9));
  });
}
