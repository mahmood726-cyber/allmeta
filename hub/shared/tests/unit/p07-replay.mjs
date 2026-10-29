// Read-only numerical replay of the published corpus, run from wt/.
// This covers the 308 REML checks, not the 220 MoM/DOM checks in the browser replay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('multilevel-ma/validate/MANIFEST.json'));
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(`multilevel-ma/${file.path}`, root));
  assert.equal(bytes.length, file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
const corpus = JSON.parse(read('multilevel-ma/validate/corpus/corpus.json'));
const refs = JSON.parse(read('multilevel-ma/validate/corpus/reference.json'));
assert.equal(Object.keys(corpus).length, 44);
assert.deepEqual(Object.keys(corpus), Object.keys(refs));
const context = vm.createContext({});
const source = read('shared/multilevel-reml.js');
vm.runInContext(source, context);
const fit = rows => context.AlmMultilevelREML.fit(rows);
const keys = ['mu', 'se', 'ciLo', 'ciHi', 'sigma2Between', 'sigma2Within', 'logLik'];
const maxima = Object.fromEntries(keys.map(key => [key, { diff: 0, configuration: null }]));
const failed = [];
let checks = 0;
for (const [name, rows] of Object.entries(corpus)) {
  // Match the page's CSV SE -> variance round-trip without changing the corpus.
  const result = fit(rows.map(row => ({ ...row, v: Math.sqrt(row.v) ** 2 })));
  for (const key of keys) {
    const ref = refs[name].values[key];
    const diff = Math.abs(result[key] - ref) / Math.max(1, Math.abs(ref));
    checks++;
    if (diff > maxima[key].diff) maxima[key] = { diff, configuration: name, app: result[key], reference: ref };
    if (!Number.isFinite(diff) || diff > 1e-6) failed.push({ name, key, app: result[key], reference: ref, diff });
  }
}
const input = JSON.parse(read('hub/shared/tests/unit/p07-translation-input.json'));
console.log(JSON.stringify({
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  checks, passed: checks - failed.length, failed, maxima,
  reproduction: input.offsets.map(offset => ({ offset, result: fit(input.rows.map(row => ({ ...row, y: row.y + offset }))) })),
  konstantopoulos2011: fit(JSON.parse(read('hub/shared/tests/_kon_data.json')).map(row => ({ cluster: row.district, y: row.yi, v: row.vi })))
}, null, 2));
assert.equal(failed.length, 0, 'Published REML comparisons retain the existing 1e-6 tolerance');
