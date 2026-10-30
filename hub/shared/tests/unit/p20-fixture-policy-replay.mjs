// Run from wt/: node hub/shared/tests/unit/p20-fixture-policy-replay.mjs
// Replay the pre-revision missing policy and the delivered policy in temporary trees.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const suite = 'p20-fixture-provenance.test.mjs';
const files = [suite, 'p20-csv-means-input.csv', 'p20-csv-means-reference.json'];
const sources = new Map([...files, '.gitattributes'].map(file =>
  [file, readFileSync(new URL(file, import.meta.url))]));
const planted = 'planted P20-R2: the hashed CSV has an explicit LF checkout policy';
const control = 'control P20-R2: the recorded raw-byte hash accepts LF and detects changed bytes';

function replay(label, includePolicy) {
  const directory = mkdtempSync(join(tmpdir(), 'p20-policy-replay-'));
  try {
    for (const file of includePolicy ? [...files, '.gitattributes'] : files) {
      writeFileSync(join(directory, file), sources.get(file));
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite],
      { cwd: directory, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    const output = result.stdout + result.stderr;
    const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
    const passes = [...output.matchAll(/^ok \d+ - (.+)$/gm)].map(match => match[1]);
    console.log(JSON.stringify({ scenario: label, exitCode: result.status,
      passed: passes.length, failed: failures.length, failures, passingTests: passes }, null, 2));
    assert.equal(result.status, includePolicy ? 0 : 1, output);
    assert.deepEqual(failures, includePolicy ? [] : [planted], output);
    assert.deepEqual(passes, includePolicy ? [planted, control] : [control], output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

replay('missing-policy', false);
replay('delivered-policy', true);
for (const [file, bytes] of sources) {
  assert.deepEqual(readFileSync(new URL(file, import.meta.url)), bytes,
    `replay must not change ${file}`);
}
