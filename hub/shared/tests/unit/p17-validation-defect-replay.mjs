// Reconstruct the reviewed adapter defect and run the unchanged regression suite.
// Keep complete TAP output and the temporary source copy outside the working tree.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const temp = mkdtempSync(join(tmpdir(), 'p17-validation-defect-'));
const testFile = 'hub/shared/tests/unit/p17-validation-identity.test.mjs';
const contract = /  \/\/ Validate provenance within the existing field check to retain the pinned count\.\r?\n[\s\S]*?  check\('output\.fields',serial\(actual\),serial\(expected\),'exact'\);/;
const original = "  check('output.fields',serial(a ? Object.keys(a).sort():[]),serial(FIELDS.slice().sort()),'exact');";
for (const path of [testFile, 'correlation-ma/index.html', 'shared/ma-core.js',
  'shared/build-info.js', 'shared/alm-validate.js', 'correlation-ma/validate/pins.js',
  'correlation-ma/validate/MANIFEST.json', 'correlation-ma/validate/adapter.js',
  'correlation-ma/validate/corpus/corpus.json', 'correlation-ma/validate/corpus/reference.json']) {
  let source = readFileSync(new URL(path, root), 'utf8');
  if (path === 'correlation-ma/validate/adapter.js') {
    assert.equal((source.match(new RegExp(contract.source, 'g')) || []).length, 1,
      'replace exactly the provenance contract block with the reviewed original line');
    source = source.replace(contract, original);
  }
  mkdirSync(dirname(join(temp, path)), { recursive: true });
  writeFileSync(join(temp, path), source);
}
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(temp, testFile)],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
assert.ifError(result.error);
const log = join(temp, 'old-adapter.tap');
writeFileSync(log, result.stdout + result.stderr);
// Full assertion diffs are large; print every named outcome so wrapper truncation
// cannot hide the plants or controls. The assertions themselves remain unchanged.
console.log(result.stdout.split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - |^# (?:tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
console.log('Full TAP:', log);
if (result.stderr) console.error(result.stderr);
assert.equal(result.status, 1, 'the reviewed adapter must fail the unchanged suite');
assert.match(result.stdout, /# tests 15\b/);
assert.match(result.stdout, /# pass 11\b/);
assert.match(result.stdout, /# fail 4\b/);
assert.deepEqual([...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1].trim()), [
  'plant P17-R4: replay accepts exact loaded provenance (shipped build)',
  'plant P17-R4: replay accepts exact loaded provenance (alternate build)',
  'control P17-R4: metadata property insertion order does not change the contract',
  'control P17-R4: strict replay rejects missing provenance',
]);
console.log('CONFIRMED: four named regressions fail and eleven controls pass with only the original adapter field check restored.');
