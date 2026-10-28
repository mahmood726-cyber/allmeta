// Run the unchanged planted tests against the production files saved before the fix.
// The snapshot and full TAP log live in the OS temporary directory, never in wt/.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const snapshot = join(tmpdir(), 'rev-P02-f4-before-fix');
for (const [path, expected] of [
  ['shared/dose-response.js', 'bbce05234597d11347daf63900c96b45b0e34c39bf381fbb686790f54f6874b4'],
  ['dose-response-ma/index.html', 'd192903b8c4f0c9992a6840b5989ad5b8ec8ca61ac3fcc846562c9d957fab82f']
]) {
  assert.equal(createHash('sha256').update(readFileSync(join(snapshot, path))).digest('hex'), expected, path);
}
for (const name of ['p02-prediction-overflow.test.mjs', 'p02-prediction-reference.json']) {
  assert.deepEqual(readFileSync(join(snapshot, 'hub/shared/tests/unit', name)),
    readFileSync(new URL('unit/' + name, import.meta.url)), `${name} must match the new-code test`);
}
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
  'hub/shared/tests/unit/p02-prediction-overflow.test.mjs'], { cwd: snapshot, encoding: 'utf8' });
if (result.error) throw result.error;
const output = result.stdout + result.stderr;
writeFileSync(join(snapshot, 'baseline-tap.txt'), output);
console.log('Verified exact pre-fix production snapshots; baseline test exit=' + result.status);
console.log(output.split(/\r?\n/).filter(line => /^(?:ok |not ok |# (?:tests|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
// Failure is expected, but retain the original nonzero status for the feedback.
process.exitCode = result.status ?? 1;
