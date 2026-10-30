// Read-only execution of the unchanged publication adapter in the Node markup harness.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { pageHarness, read } from './p05-qprofile-harness.mjs';
const app = pageHarness(), manifest = JSON.parse(read('heterogeneity/validate/MANIFEST.json'));
const loaded = {};
for (const file of manifest.files) {
  const text = read('heterogeneity/' + file.path);
  assert.equal(Buffer.byteLength(text), file.bytes);
  assert.equal(createHash('sha256').update(text).digest('hex'), file.sha256);
  loaded[file.path] = JSON.parse(text);
}
app.run('A, -0.5, 1\nB, 0, 1\nC, 0.5, 1');
vm.runInContext(read('heterogeneity/validate/adapter.js'), app.context);
const result = await app.context.AlmHetValidationAdapter.corpus.run(loaded, () => {});
const empty = loaded['validate/corpus/corpus.json'].filter(c => app.context.__almHetCompute(c.text, 'pm').qpci.empty).map(c => c.id);
console.log('P05_PUBLICATION_REPLAY', JSON.stringify({ checks: result.checks, passed: result.passed,
  failed: result.failed, maxima: result.maxima, refusals: result.refusals, displayed: result.displayed,
  displayFails: result.displayFails, emptySets: empty }));
assert.equal(result.checks, 131781); assert.equal(result.passed, 131781);
assert.equal(result.failed.length, 0); assert.equal(result.displayed, 121424);
assert.equal(result.displayFails.length, 0);
