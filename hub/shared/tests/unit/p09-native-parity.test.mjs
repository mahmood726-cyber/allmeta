import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nma = require('../../../../shared/nma-multiarm-v1.js');
const reml = require('../../../../shared/multilevel-reml.js');
const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const reference = JSON.parse(read('tests/fixtures/p09-review-reference.json'));
const provenance = JSON.parse(read('tests/fixtures/p09-review-provenance.json'));
const close = (actual, expected, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-6,
  `${label}: ${actual} vs ${expected} (tolerance 1e-6)`);

test('P09 native provenance: R output, generating script and input retain LF hashes', () => {
  assert.equal(Object.keys(reference.nma).length, 8);
  assert.equal(Object.keys(reference.reml).length, 2);
  assert.deepEqual(reference.provenance, provenance.provenance);
  for (const [path, expected] of Object.entries(provenance.lf_sha256)) {
    const lf = read(path).replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(lf).digest('hex'), expected, path);
    // The same pin applies after a Windows checkout; no recorded hash is replaced.
    const crlf = lf.replaceAll('\n', '\r\n');
    assert.equal(createHash('sha256').update(crlf.replaceAll('\r\n', '\n')).digest('hex'), expected, path);
  }
});

for (const [id, fixture] of Object.entries(reference.nma)) {
  test(`P09 native NMA ${id.includes('rounded') ? 'regression' : 'control'}: ${id}`, () => {
    const actual = nma.analyse(fixture.rows);
    assert.equal(actual.ok, true, actual.error);
    assert.deepEqual(actual.treatments, fixture.treatments);
    for (const model of ['common', 'random']) for (const field of ['TE', 'seTE'])
      for (let i = 0; i < fixture.treatments.length; i++)
        for (let j = 0; j < fixture.treatments.length; j++)
          close(actual[model][field][i][j], fixture[model][field][i][j], `${model}.${field}[${i}][${j}]`);
    for (const field of ['Q', 'tau2']) close(actual[field], fixture[field], field);
  });
}

for (const [id, fixture] of Object.entries(reference.reml)) for (const offset of [0, 2 ** 20, -(2 ** 20)]) {
  test(`P09 native REML ${offset ? 'regression' : 'control'}: ${id} at ${offset}`, () => {
    const actual = reml.fit(fixture.rows.map(row => ({ ...row, y: row.y + offset })));
    for (const [field, value] of Object.entries(fixture.expected))
      close(actual[field] - (['mu', 'ciLo', 'ciHi'].includes(field) ? offset : 0), value, field);
  });
}
