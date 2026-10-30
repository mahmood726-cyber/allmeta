// Read-only replay of every published per-study CI (no DOM/pooling claims).
// Output goes to the OS temporary directory, never to the validation corpus.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { kernel, kernelSource, read } from './p09-beta-harness.mjs';

const corpusText = read('proportion-ma/validate/corpus/corpus.json');
const refsText = read('proportion-ma/validate/corpus/reference.json');
const corpus = JSON.parse(corpusText), refs = JSON.parse(refsText);
const app = kernel(), cache = new Map();
const maxima = {study_lo: 0, study_hi: 0};
let checks = 0, failures = 0;
const values = {};
for (const ca of corpus) for (const tr of ['logit', 'ft', 'raw']) for (const method of ['PM', 'DL', 'FE']) {
  const id = `${ca.id}|${tr}|${method}`, ref = refs[id];
  assert.ok(ref, id);
  if (ref.status !== 'ok') continue;
  assert.equal(ref.studies.length, ca.rows.length);
  ca.rows.forEach((row, i) => {
    const key = `${row.x}/${row.n}`;
    if (!cache.has(key)) cache.set(key, Array.from(app.clopperPearson(row.x, row.n)));
    const cp = cache.get(key);
    for (const [j, field] of ['lo', 'hi'].entries()) {
      const diff = Math.abs(cp[j] - ref.studies[i][field]);
      maxima[`study_${field}`] = Math.max(maxima[`study_${field}`], diff);
      values[`${id}#${i}:${field}`] = cp[j];
      checks++;
      if (!Number.isFinite(diff) || diff > 1e-9) failures++;
    }
  });
}
const result = { checks, failures, uniqueRows: cache.size, maxima,
  sourceSHA256: createHash('sha256').update(kernelSource).digest('hex'),
  corpusSHA256: createHash('sha256').update(corpusText).digest('hex'),
  referenceSHA256: createHash('sha256').update(refsText).digest('hex') };
const baselinePath = join(tmpdir(), 'rev2-p09-f5-beta-baseline.json');
if (!existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify({ ...result, values }));
  result.baselineCreated = true;
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  assert.equal(result.corpusSHA256, baseline.corpusSHA256);
  assert.equal(result.referenceSHA256, baseline.referenceSHA256);
  result.baselineMaxima = baseline.maxima;
  result.changedLimits = Object.keys(values).filter(k => values[k] !== baseline.values[k]).length;
  result.maximumChange = Math.max(...Object.keys(values).map(k => Math.abs(values[k] - baseline.values[k])));
}
writeFileSync(join(tmpdir(), 'rev2-p09-f5-beta-replay.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
assert.equal(checks, 85572);
assert.equal(failures, 0);
