// Read-only execution of the unchanged publication adapter in the Node markup harness.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageHarness, read } from './p05-qprofile-harness.mjs';
export function loadPublicationInputs() {
  const manifest = JSON.parse(read('heterogeneity/validate/MANIFEST.json'));
  const loaded = {};
  for (const file of manifest.files) {
    const text = read('heterogeneity/' + file.path).replace(/\r\n/g, '\n');
    assert.equal(Buffer.byteLength(text), file.bytes);
    assert.equal(createHash('sha256').update(text).digest('hex'), file.sha256);
    loaded[file.path] = JSON.parse(text);
  }
  return loaded;
}
export async function replayPublication(loaded = loadPublicationInputs(), progress = console.log) {
  const app = pageHarness();
  app.run('A, -0.5, 1\nB, 0, 1\nC, 0.5, 1');
  vm.runInContext(read('heterogeneity/validate/adapter.js'), app.context);
  const result = await app.context.AlmHetValidationAdapter.corpus.run(loaded, progress);
  const empty = loaded['validate/corpus/corpus.json'].filter(c => app.context.__almHetCompute(c.text, 'pm').qpci.empty).map(c => c.id);
  return { ...result, emptySets: empty };
}
export function checkPublicationResult(result) {
  console.log('P05_PUBLICATION_REPLAY', JSON.stringify({ checks: result.checks, passed: result.passed,
    failed: result.failed, maxima: result.maxima, refusals: result.refusals, displayed: result.displayed,
    displayFails: result.displayFails, emptySets: result.emptySets }));
  assert.equal(result.checks, 131781); assert.equal(result.passed, 131781);
  assert.equal(result.failed.length, 0); assert.equal(result.displayed, 121424);
  assert.equal(result.displayFails.length, 0);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkPublicationResult(await replayPublication());
}
