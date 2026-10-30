import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../../shared/dose-response.js', import.meta.url), 'utf8');
const context = vm.createContext({});
// Expose the actual reconstruction in this VM only; keep the production API unchanged.
const anchor = '_internal: { nmmin:';
assert.ok(source.includes(anchor));
vm.runInContext(source.replace(anchor, '_internal: { hamlingCounts: hamlingCounts, nmmin:'), context);
const DR = context.AlmDoseResponse;
const levels = [
  { dose: 0, cases: 101, n: 100, y: 0, v: 0 },
  { dose: 1, cases: 101, n: 100, y: 0, v: .25 }
];

test('P02-R3 plant: one-contrast IR Hamling reconstructs positive counts above person-time', () => {
  const counts = DR._internal.hamlingCounts(levels, 'ir');
  for (const p of counts) {
    assert.ok(Number.isFinite(p.A) && p.A > 0, 'reconstructed cases must be finite and positive');
    assert.ok(Number.isFinite(p.N) && p.N > 0, 'reconstructed person-time must be finite and positive');
    assert.ok(p.A > p.N, 'person-time is not a participant count');
  }
});

test('P02-R3 control: one-contrast IR reconstruction satisfies risk, variance and margin equations', () => {
  for (const cases of [10, 101]) for (const y of [-.6, 0, .4]) for (const reverse of [false, true]) {
    const L = levels.map((l, i) => ({ ...l, cases: cases + i * 3, n: i ? 80 : 100, y: i ? y : 0 }));
    if (reverse) L.reverse();
    const ref = L.findIndex(l => l.v === 0), other = 1 - ref;
    const P = DR._internal.hamlingCounts(L, 'ir');
    const near = (a, b, label) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), label);
    near(Math.log((P[other].A / P[other].N) / (P[ref].A / P[ref].N)), L[other].y, 'reported log rate ratio');
    near(1 / P[ref].A + 1 / P[other].A, L[other].v, 'reported rate-ratio variance');
    near(P[ref].N / (P[0].N + P[1].N), L[ref].n / (L[0].n + L[1].n), 'reference person-time fraction');
    near((P[0].N + P[1].N) / (P[0].A + P[1].A),
      (L[0].n + L[1].n) / (L[0].cases + L[1].cases), 'total person-time/cases ratio');
    const S = DR._internal.covarLogRR(L, 'ir', 'h');
    assert.equal(S[0][0], L[other].v);
  }
});

test('P02-R3 plant: one-contrast IR Hamling still rejects non-finite reconstructed counts', () => {
  for (const logrr of [-1000, 1000]) {
    const studies = ['A', 'B', 'C'].map(id => ({ id, rows: levels.map((l, i) =>
      ({ ...l, logrr: i ? logrr : 0, se: i ? .5 : 0, type: 'ir' })) }));
    const r = DR.fitDR(studies, { method: 'fixed', covariance: 'h' });
    assert.equal(r.ok, false);
    assert.match(r.error, /study A.*reconstruct.*row/i);
  }
});

test('P02-R3 R controls: one-contrast IR Hamling matches four real R fits', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/rev-p02-r3-ir-r.json', import.meta.url), 'utf8'));
  assert.ok(fixture.R && fixture.dosresmeta && fixture.mixmeta);
  assert.deepEqual(fixture.cases.map(f => f.name).sort(), [
    'above-person-time/reference-first', 'above-person-time/reference-last',
    'below-person-time/reference-first', 'below-person-time/reference-last'
  ]);
  for (const f of fixture.cases) {
    const grouped = new Map();
    for (const row of f.rows) {
      if (!grouped.has(row.id)) grouped.set(row.id, { id: row.id, rows: [] });
      grouped.get(row.id).rows.push(row);
    }
    const r = DR.fitDR([...grouped.values()], { method: 'fixed', covariance: 'h' });
    assert.equal(r.ok, true, `${f.name}: ${r.error}`);
    assert.equal(r.k, 3);
    assert.equal(r.excluded.length, 0);
    assert.ok(Math.abs(r.coef[0] - f.coef[0]) / Math.sqrt(f.vcov[0]) <= 1e-6, `${f.name}: coefficient parity`);
    assert.ok(Math.abs(r.vcov[0][0] - f.vcov[0]) / f.vcov[0] <= 1e-6, `${f.name}: variance parity`);
  }
});
