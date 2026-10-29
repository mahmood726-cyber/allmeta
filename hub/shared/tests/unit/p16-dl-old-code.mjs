// Re-run the unchanged regression suite against the exact historical source.
// All reconstructed source and test output stay in the OS temporary directory.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { appSource } from './p16-dl-harness.mjs';

const fixed = [
  '      // C and sumW both scale as inverse squared measurement units. Judge',
  '      // cancellation relative to sumW, so a change of units cannot zero tau2.',
  '      if (denom <= Number.EPSILON * sumW) return 0;',
].join('\r\n');
assert.equal(appSource.split(fixed).length, 2, 'Reverse exactly one production patch');
const oldSource = appSource.replace(fixed, '      if (denom <= 1e-12) return 0;');
const oldHash = createHash('sha256').update(oldSource).digest('hex');
assert.equal(oldHash, 'ce9a05a6bcd468f1b8d5ce655bd7e793f50e0d20084e5f36fa7cc9b386b43d54',
  'Reconstructed source must match the recorded pre-fix app byte for byte');

const root = new URL('../../../../', import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), 'p16-dl-old-code-'));
const unitDir = 'hub/shared/tests/unit/';
const testPath = unitDir + 'p16-dl-scale.test.mjs';
const files = ['nma-inconsistency/plus-core.js', testPath,
  ...['p16-dl-harness.mjs', 'p16-dl-input.json', 'p16-dl-input.R',
    'p16-dl-reference.R', 'p16-dl-reference.json'].map(file => unitDir + file)];
for (const file of files) {
  const target = join(temporaryRoot, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(new URL(file, root), target);
}
writeFileSync(join(temporaryRoot, 'nma-inconsistency/index.html'), oldSource);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(temporaryRoot, testPath)],
  { cwd: temporaryRoot, encoding: 'utf8' });
if (result.error) throw result.error;
const output = result.stdout + result.stderr;
writeFileSync(join(temporaryRoot, 'old-code.tap'), output);
process.stdout.write(output);
assert.equal(result.status, 1, 'The historical defect must fail the unchanged tests');
const failures = [...output.matchAll(/^not ok \d+ - (.+)\r?$/gm)].map(match => match[1].trim()).sort();
assert.deepEqual(failures, [
  'P16-R1 plant: DL tau2 scales with squared measurement units at 11000000',
  'P16-R1 plant: global Q, p and verdict are unit invariant at 11000000',
  'P16-R1 plant: node-split estimates, p and verdicts are unit invariant at 11000000',
  'P16-R1 plant: native R generalized DL parity for triangle at 11000000',
].sort(), 'Exactly the four planted assertions must fail; all controls must pass');
for (const summary of ['tests 16', 'pass 12', 'fail 4', 'cancelled 0', 'skipped 0', 'todo 0']) {
  assert.ok(output.includes(`# ${summary}\n`) || output.includes(`# ${summary}\r\n`), summary);
}
console.log('PASS: exact historical source reproduced four planted failures and passed all 12 controls; SHA-256=' + oldHash);
