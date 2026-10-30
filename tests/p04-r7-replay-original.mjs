// Replay byte-identical regression tests against the exact engine saved before
// the pass-2 fix. The isolated source tree and logs stay in the OS temp directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const original = join(tmpdir(), 'p04-r7-original-nma-multiarm-v1.cjs');
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sha = digest(original);
assert.equal(sha, '0616bf2340113630a7fe72f9a12ad678efdfb851934eaf0a0cae4e7ec7458d31');
const root = fileURLToPath(new URL('../', import.meta.url));
const testFile = 'hub/shared/tests/unit/p04-r7-numerical-range.test.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'p04-r7-red-'));
// Do not patch require.cache: that did not replace the test's imported engine
// in the pass-2 run. Copy the exact test and its file dependencies instead.
writeFileSync(join(scratch, 'package.json'), '{"type":"commonjs"}\n');
const sources = [
  [original, 'shared/nma-multiarm-v1.js'],
  ...[testFile, 'tests/fixtures/p04-r7-range-oracle.json',
    'nma/index.html', 'hub/shared/analysis-lifecycle.js'].map(path => [join(root, path), path])
];
for (const [source, relative] of sources) {
  const destination = join(scratch, relative);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source));
  assert.equal(digest(destination), digest(source), `Unchanged replay input: ${relative}`);
}
assert.equal(digest(join(scratch, 'shared/nma-multiarm-v1.js')), sha);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile],
  { cwd: scratch, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.ifError(result.error);
writeFileSync(join(scratch, 'original.tap'), result.stdout + result.stderr);
console.log(`Original engine SHA-256: ${sha}`);
console.log(`Unchanged test SHA-256: ${digest(join(root, testFile))}`);
console.log(`Full original-code log: ${join(scratch, 'original.tap')}`);
const lines = result.stdout.split(/\r?\n/);
console.log(lines.filter(line => /^(?:(?:not )?ok \d+|# (?:tests|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
if (result.stderr) console.error(result.stderr);
assert.equal(result.status, 1, 'The original engine must fail the planted-defect tests');
assert.equal(lines.filter(line => /^not ok \d+ - plant P04-R7:/.test(line)).length, 11);
assert.equal(lines.filter(line => /^ok \d+ - control:/.test(line)).length, 5);
assert.ok(lines.includes('# tests 16'));
assert.ok(lines.includes('# fail 11'));
assert.ok(lines.includes('# pass 5'));
console.log('Verified original-code result: all 11 plants fail and all 5 controls pass.');
