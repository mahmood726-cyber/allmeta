// Reuse the existing browser parity corpus, assertions and tolerances in Node.
// This verifies the engine; it does not claim browser/UI coverage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { jobsOf, runAll, checkDataset } from '../hub/shared/tests/_nma_parity_check.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const fixture = JSON.parse(read('hub/shared/tests/_nma_parity_fixture.json'));
const fixed = read('shared/nma-multiarm-v1.js');
const replay = JSON.parse(read('tests/fixtures/p09-protection-replay.json')).files
  .find(file => file.path === 'shared/nma-multiarm-v1.js');
let original = fixed;
for (const hunk of replay.hunks) {
  assert.equal(original.split(hunk.fixed).length, 2);
  original = original.replace(hunk.fixed, () => hunk.original);
}
assert.equal(createHash('sha256').update(original).digest('hex'), replay.original_lf_sha256);
for (const [label, source] of [['supplied-head', original], ['repaired', fixed]]) {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  globalThis.AlmNmaMultiarm = context.AlmNmaMultiarm;
  let checks = 0;
  const failures = [];
  for (const dataset of fixture.datasets) {
    const result = checkDataset(dataset, runAll(jobsOf(dataset)));
    checks += result.n;
    failures.push(...result.bad);
    console.log(JSON.stringify({ source: label, dataset: dataset.dataset, ...result }));
  }
  console.log(JSON.stringify({ source: label, datasets: fixture.datasets.length, checks, failed: failures.length }));
  if (label === 'repaired') assert.deepEqual(failures, [], 'existing full NMA parity assertions remain unchanged');
}
