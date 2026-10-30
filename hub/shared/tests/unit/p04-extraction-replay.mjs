// Read-only replay through the published NMA corpus adapter; no browser or R run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import NM from '../../../../shared/nma-multiarm-v1.js';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('nma/validate/MANIFEST.json'));
const files = {};
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(`nma/${file.path}`, root));
  assert.equal(createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex'), file.sha256, file.path);
  files[file.path] = JSON.parse(bytes.toString('utf8'));
}
const context = vm.createContext({
  window: {}, AlmNmaMultiarm: NM, document: { getElementById: () => ({}) },
});
vm.runInContext(read('nma/validate/adapter.js'), context);
const result = await context.window.AlmNmaValidateAdapter.corpus.run(files);
console.log(JSON.stringify(result, null, 2));
const expected = files['validate/corpus/paper-values.json'].values;
assert.equal(result.checks, expected.checks_total.value);
assert.equal(result.passed, expected.checks_passed.value);
assert.equal(result.analyses, expected.analyses.value);
assert.equal(result.refusals.matched, expected.refusals_matched.value);
assert.equal(result.failed.length, 0);
