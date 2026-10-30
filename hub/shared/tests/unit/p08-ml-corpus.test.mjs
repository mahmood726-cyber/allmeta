import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lfBytes } from '../p08-lf-bytes.mjs';
const base = new URL('../../../../meta-regression/', import.meta.url);
await import(new URL('plus-engine.js', base));
await import(new URL('validate/contract.js', base));
const read = path => JSON.parse(readFileSync(new URL(path, base), 'utf8'));
const manifest = read('validate/MANIFEST-plus.json');

test('control P08-R3: published pinned corpus retains all numerical and structural checks', () => {
  for (const file of manifest.files) {
    const bytes = lfBytes(readFileSync(new URL(file.path, base)));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  const corpus = read('validate/plus/corpus.json'), refs = read('validate/plus/reference.json');
  assert.equal(corpus.length, manifest.configurations);
  const failures = [];
  let checks = 0;
  for (let i = 0; i < corpus.length; i++) {
    assert.equal(corpus[i].id, refs[i].id);
    const rows = AlmMetaPlusContract.audit(AlmMetaPlus.compute(corpus[i]), refs[i].result);
    checks += rows.length;
    for (const row of rows) if (!row.pass) failures.push({ id: corpus[i].id, ...row });
  }
  console.log(JSON.stringify({ configurations: corpus.length, checks, passed: checks - failures.length, failures }));
  assert.deepEqual(failures, []);
  assert.equal(checks, manifest.numericChecks);
});
test('control P08-R3: documented mixed-scale design comparisons retain their original tolerances', () => {
  const divergences = read('validate/plus/divergences.json');
  let checks = 0;
  for (const config of divergences.configs) {
    const rows = AlmMetaPlusContract.audit(AlmMetaPlus.compute(config.input), config.gate_disabled);
    checks += rows.length;
    assert.deepEqual(rows.filter(r => !r.pass), [], config.id);
  }
  assert.equal(checks, 874);
});
