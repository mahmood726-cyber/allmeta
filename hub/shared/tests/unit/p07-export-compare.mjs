// Compact old/new evidence for P07-R3. Run from wt/ with node; all temporary
// copies live under the OS temp directory. The regression suite is unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const suite = 'hub/shared/tests/unit/p07-export.test.mjs';
const app = 'multilevel-ma/index.html';
const current = readFileSync(join(root, app), 'utf8').replace(/\r\n/g, '\n');
// Remove only the three added metadata lines. Pin the entire resulting page
// to the SHA-256 recorded before the pass-2 production edit.
const original = current
  .replace("        estimator: 'method-of-moments',\n", '')
  .replace(/^      methods: 'The exported results use[^\n]*\n        'The MoM results include[^\n]*\n/m, '');
const originalSha256 = createHash('sha256').update(original).digest('hex');
assert.equal(originalSha256, '69865669974dd0f6ec9ab6525b74e4ab2793e9005a65c4734a71249aba16e716',
  'Reconstructed original must match the complete pre-fix page (LF-normalized)');

function runSuite(cwd, label, expectedFailures) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite],
    { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  const tests = [...output.matchAll(/^(not )?ok \d+ - (.+)$/gm)]
    .map(match => ({ name: match[2], passed: !match[1] }));
  const failed = tests.filter(test => !test.passed);
  if (tests.length !== 17 || failed.length !== expectedFailures ||
      result.status !== (expectedFailures ? 1 : 0)) console.log(output);
  assert.equal(tests.length, 17, `${label}: all regression assertions ran`);
  assert.equal(failed.length, expectedFailures, `${label}: expected failure count`);
  assert.equal(result.status, expectedFailures ? 1 : 0, `${label}: process exit`);
  for (const test of tests) {
    console.log(`${label} ${test.passed ? 'PASS' : 'FAIL'}: ${test.name}`);
    assert.equal(test.passed, expectedFailures ? test.name.includes(' control:') : true, test.name);
  }
  const fingerprints = [...output.matchAll(/^# (\{"dataset"[^\n]*\})\r?$/gm)]
    .map(match => JSON.parse(match[1]));
  assert.deepEqual(fingerprints.map(item => item.dataset), ['built-in', 'edited']);
  return { tests, fingerprints };
}

const tempRoot = realpathSync(tmpdir());
const scratch = mkdtempSync(join(tempRoot, 'p07-export-'));
try {
  for (const file of [suite, app, 'shared/ma-core.js', 'shared/multilevel-reml.js',
    'shared/stats-qt.js', 'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    const target = join(scratch, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file === app ? original : readFileSync(join(root, file)));
  }
  console.log(`Original page SHA-256 (LF): ${originalSha256}`);
  const before = runSuite(scratch, 'ORIGINAL', 14);
  const after = runSuite(root, 'FIXED', 0);
  assert.deepEqual(after.tests.map(test => test.name), before.tests.map(test => test.name));
  assert.deepEqual(after.fingerprints, before.fingerprints,
    'All 16 MoM values, REML output, summary, table and forest must remain identical');
  for (const fingerprint of after.fingerprints) console.log(JSON.stringify(fingerprint));
  console.log('PASS: original 14 plants fail / 3 controls pass; fixed 17 pass; all old/new fingerprints match.');
} finally {
  assert.equal(dirname(scratch), tempRoot);
  assert.ok(basename(scratch).startsWith('p07-export-'));
  rmSync(scratch, { recursive: true, force: true });
}
