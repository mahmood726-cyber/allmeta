import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Generated only by rev-p02-r3-reference.R through a requested real R run.
const fixture = JSON.parse(readFileSync(new URL('../fixtures/rev-p02-r3-r.json', import.meta.url), 'utf8'));
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../../../shared/dose-response.js', import.meta.url), 'utf8'), context);

test('P02-R3 R controls: reference includes all six combinations and runtime versions', () => {
  assert.ok(fixture.R && fixture.dosresmeta && fixture.mixmeta);
  assert.deepEqual(fixture.cases.map(f => `${f.type}/${f.covariance}`).sort(),
    ['cc/gl', 'cc/h', 'ci/gl', 'ci/h', 'ir/gl', 'ir/h']);
});

for (const f of fixture.cases) {
  test(`P02-R3 R control: ${f.type}/${f.covariance} matches the real R fit or refusal`, () => {
    const grouped = new Map();
    for (const row of f.rows) {
      if (!grouped.has(row.id)) grouped.set(row.id, { id: row.id, rows: [] });
      grouped.get(row.id).rows.push(row);
    }
    const r = context.AlmDoseResponse.fitDR([...grouped.values()], { method: 'fixed', covariance: f.covariance });
    assert.equal(r.ok, f.ok, r.error || f.error);
    if (!f.ok) { assert.ok(f.error && r.error); return; }
    assert.equal(r.k, 3);
    assert.equal(r.excluded.length, 0);
    assert.equal(r.coef.length, 1);
    // Same SE/variance scales and direct-fit tolerance as the published comparator.
    assert.ok(Math.abs(r.coef[0] - f.coef[0]) / Math.sqrt(f.vcov[0]) <= 1e-6, 'coefficient parity');
    assert.ok(Math.abs(r.vcov[0][0] - f.vcov[0]) / f.vcov[0] <= 1e-6, 'variance parity');
  });
}
