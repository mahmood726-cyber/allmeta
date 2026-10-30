// Compare every generated value without stopping at the first discrepant case.
// Read only the fresh native-R output in TEMP; never rewrite references.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nma = require('../shared/nma-multiarm-v1.js');
const reml = require('../shared/multilevel-reml.js');
const reference = JSON.parse(readFileSync(join(tmpdir(), 'rev-P09-f7-reference.json'), 'utf8'));
console.log('Native R provenance:', JSON.stringify(reference.provenance));
assert.equal(Object.keys(reference.nma).length, 8);
let failures = 0;
const differences = (actual, expected) => expected.flatMap((row, i) =>
  row.map((value, j) => Math.abs(actual[i][j] - value)));
for (const [id, fixture] of Object.entries(reference.nma)) {
  const actual = nma.analyse(fixture.rows);
  assert.equal(actual.ok, true, actual.error);
  assert.deepEqual(actual.treatments, fixture.treatments);
  const errors = {};
  for (const model of ['common', 'random']) for (const field of ['TE', 'seTE'])
    errors[model + '.' + field] = Math.max(...differences(actual[model][field], fixture[model][field]));
  for (const field of ['Q', 'tau2']) errors[field] = Math.abs(actual[field] - fixture[field]);
  const pass = Object.values(errors).every(value => Number.isFinite(value) && value <= 1e-6);
  if (!pass) failures++;
  console.log(JSON.stringify({ case: id, pass, absoluteDifferences: errors,
    actualQ: actual.Q, referenceQ: fixture.Q, actualTau2: actual.tau2, referenceTau2: fixture.tau2 }));
}
assert.equal(Object.keys(reference.reml ?? {}).length, 2, 'both R fits must converge before accepting the oracle');
for (const [id, fixture] of Object.entries(reference.reml)) for (const offset of [0, 2 ** 20, -(2 ** 20)]) {
  const actual = reml.fit(fixture.rows.map(row => ({ ...row, y: row.y + offset })));
  const errors = {};
  for (const [field, value] of Object.entries(fixture.expected))
    errors[field] = Math.abs(actual[field] - (['mu', 'ciLo', 'ciHi'].includes(field) ? offset : 0) - value);
  const pass = Object.values(errors).every(value => Number.isFinite(value) && value <= 1e-6);
  if (!pass) failures++;
  console.log(JSON.stringify({ case: id, offset, pass, absoluteDifferences: errors }));
}
assert.equal(failures, 0, 'native-R comparisons (all fields retain the 1e-6 tolerance)');
