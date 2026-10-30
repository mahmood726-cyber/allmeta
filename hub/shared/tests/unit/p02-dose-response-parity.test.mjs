import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/p02-dose-response-reference.json', import.meta.url), 'utf8'));
const context = vm.createContext({});
for (const file of ['ma-core.js', 'dose-response.js']) {
  vm.runInContext(readFileSync(new URL(`../../../../shared/${file}`, import.meta.url), 'utf8'), context, { filename: file });
}
const engine = context.AlmDoseResponse;
const tolerance = 1e-6; // Absolute, including iterative fits. Never enlarged after observing results.
// Observed in the native pass-3 run. CXTASK requires these assertions to keep
// executing as TODOs; neither the recorded R values nor the tolerance changes.
const knownDiscrepancies = new Map([
  ['pool-heterogeneous-PM', 'P02-PARITY-001: native PM solver precision differs; CI absolute error exceeds 1e-6'],
  ['pool-k2-PM', 'P02-PARITY-001: metafor PM uses control.tol, not the generator control.threshold'],
  ['pool-k2-FE', 'P02-PARITY-002: legacy GL reconstruction differs from dosresmeta; lower CI error is 1.089e-6'],
  ['k1-2stage-fixed', 'P02-PARITY-003: app requires at least two studies; dosresmeta fits one'],
  ['k1-1stage-fixed', 'P02-PARITY-003: app requires at least two studies; dosresmeta fits one'],
  ['zero-cell-gl', 'P02-PARITY-004: app excludes the zero-count study and fits; native R refuses the full input'],
  ['zero-cell-h', 'P02-PARITY-005: app excludes the zero-count study; native Hamling retains it and the slope changes sign'],
]);

function differences(actual, expected, path = '') {
  if (expected === null) return actual == null ? [] : [`${path}: app=${actual}, R=null`];
  if (typeof expected === 'number') {
    const delta = Math.abs(actual - expected);
    return typeof actual === 'number' && Number.isFinite(actual) && delta <= tolerance
      ? [] : [`${path}: app=${actual}, R=${expected}, absDiff=${delta}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return [`${path}: array shape differs`];
    return expected.flatMap((value, i) => differences(actual[i], value, `${path}[${i}]`));
  }
  return Object.entries(expected).flatMap(([key, value]) => differences(actual?.[key], value, path ? `${path}.${key}` : key));
}
function compare(actual, expected) {
  assert.deepEqual(differences(actual, expected), [], 'Native R parity at absolute tolerance 1e-6');
}
function run(c) {
  const result = c.api === 'fit' ? engine.fit(c.studies.map(s => s.rows), c.options) : engine.fitDR(c.studies, c.options);
  if (c.api === 'fit') return { ok: Number.isFinite(result.slope) && Number.isFinite(result.se), ...result };
  if (!result.ok) return result;
  return { ...result,
    waldNonlin: result.waldNonlin ?? null,
    gof: { ...result.gof, residuals: result.gof.residuals.map(r => r.resid) },
    predictions: c.reference.predictions ? result.predict(c.prediction.doses, c.prediction.xref) : null };
}
test('P02 control: native R provenance and five gap families are recorded', () => {
  assert.equal(fixture.schema, 'p02-dose-response-r-parity-v1');
  assert.match(fixture.provenance.R, /^R version /);
  for (const name of ['dosresmeta', 'mixmeta', 'metafor']) {
    assert.ok(fixture.provenance.packages.find(p => p.package === name)?.version);
  }
  assert.equal(fixture.provenance.serialization, 'base R; 17 significant digits');
  assert.equal(new Set(fixture.cases.map(c => c.gap)).size, 5);
  assert.equal(new Set(fixture.cases.map(c => c.id)).size, fixture.cases.length);
});

for (const c of fixture.cases) {
  test(`P02 R parity: ${c.id}`, { todo: knownDiscrepancies.get(c.id) }, () => {
    const actual = run(c);
    assert.equal(actual.ok, c.reference.ok, `${c.id}: app=${actual.ok} (${actual.error ?? ''}), R=${c.reference.ok} (${c.reference.error ?? ''})`);
    if (!c.reference.ok) return; // Matched refusal; numeric outputs do not exist.
    const { ok, warnings, ...expected } = c.reference;
    compare(actual, expected);
  });
}

// These plants exercise the same comparison used above. They do not mutate the
// engine or fixture, and cannot turn a real discrepancy into a passing test.
for (const [id, key] of [
  ['pool-heterogeneous-PM', 'tau2'],
  ['pool-k2-DL', 'ciLo'],
  ['boundary-2stage-fixed', 'coef'],
  ['positive-control-gl', 'vcov'],
  ['quadratic-2stage-gl', 'predictions'],
]) {
  test(`P02 planted-defect sensitivity: ${id}/${key}`, () => {
    const c = fixture.cases.find(c => c.id === id);
    assert.equal(c.reference.ok, true, 'Control must be an R fit');
    const { ok, warnings, ...reference } = c.reference;
    compare(reference, reference);
    const planted = structuredClone(reference);
    if (key === 'coef') planted.coef[0] += 1e-4;
    else if (key === 'vcov') planted.vcov[0][0] += 1e-4;
    else if (key === 'predictions') planted.predictions[0].ciHi += 1e-4;
    else planted[key] += 1e-4;
    assert.throws(() => compare(planted, reference), /Native R parity/);
  });
}
