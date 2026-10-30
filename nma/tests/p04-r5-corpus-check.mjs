// Read-only replay of the existing publication corpus and adapter; no references regenerated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
// Recorded corpus hashes describe LF bytes, independent of checkout line endings.
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const context = createContext({ document: { getElementById: () => ({}) } });
context.window = context;
runInContext(read('shared/nma-multiarm-v1.js'), context);
runInContext(read('nma/validate/adapter.js'), context);
const adapter = context.AlmNmaValidateAdapter;
const files = {};
for (const file of adapter.corpus.files) {
  const text = read('nma/' + file.path);
  assert.equal(createHash('sha256').update(text).digest('hex'), file.sha256, file.path);
  files[file.path] = text;
}
const result = await adapter.corpus.run(files);
assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
const expected = JSON.parse(files['validate/corpus/paper-values.json']).values;
assert.equal(result.checks, expected.checks_total.value);
assert.equal(result.passed, expected.checks_passed.value);
assert.equal(result.analyses, expected.analyses.value);
assert.equal(result.fitted, expected.netmeta_fitted.value);
assert.equal(result.refusals.matched, expected.refusals_matched.value);
const raw = JSON.parse(files['validate/corpus/reference.json']).datasets.flatMap(ds => {
  const rows = ds.contrasts.map(c => ({ study: c.studlab, t1: c.treat2, t2: c.treat1, est: c.TE, se: c.seTE }));
  return ds.fits.flatMap(f => ['desirable', 'undesirable'].map(smallValues =>
    context.AlmNmaMultiarm.analyse(rows, { randomCi: f.method_random_ci, smallValues })));
});
console.log(JSON.stringify({ checks: result.checks, passed: result.passed, analyses: result.analyses,
  fitted: result.fitted, within: result.within, refusals: result.refusals.matched, maxima: result.maxima,
  analysisSha256: createHash('sha256').update(JSON.stringify(raw)).digest('hex') }, null, 2));
