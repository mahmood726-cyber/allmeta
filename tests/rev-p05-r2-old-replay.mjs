import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lf = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const source = lf('shared/ma-core.js');
const start = source.indexOf('  function tau2PM(yi, vi) {');
const end = source.indexOf('\n  // (Restricted) profile log-likelihood', start);
assert.ok(start >= 0 && end > start);
const restored = source.slice(0, start) + lf('tests/fixtures/rev-p05-r2-old-pm.txt') + source.slice(end);
const hash = createHash('sha256').update(restored).digest('hex');
assert.equal(hash, 'bcf0bd43eb0d762060f7d408d9eff9a8c04fe7fbc3fb8e9aee046670ed22b391',
  'the complete reconstructed LF core must equal the supplied PR head');
const temporaryParent = resolve(tmpdir());
const replayRoot = mkdtempSync(join(temporaryParent, 'rev-p05-r2-old-'));
try {
  const testRelative = 'hub/shared/tests/unit/rev-p05-pm-review.test.mjs';
  for (const relative of [testRelative, 'tests/fixtures/rev-p05-r2-reference.json']) {
    const destination = join(replayRoot, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, relative), destination);
    assert.deepEqual(readFileSync(destination), readFileSync(join(root, relative)));
  }
  mkdirSync(join(replayRoot, 'shared'));
  writeFileSync(join(replayRoot, 'shared/ma-core.js'), restored);
  writeFileSync(join(replayRoot, 'package.json'), '{"type":"commonjs"}\n');
  console.log('P05-R2 supplied PR core verified:', hash);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(replayRoot, testRelative)],
    { cwd: replayRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  console.log(result.stdout.split(/\r?\n/).filter(line =>
    /^(ok \d+|not ok \d+|# (tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )|\s+error:)/.test(line)).join('\n'));
  if (result.stderr) process.stderr.write(result.stderr);
  assert.notEqual(result.status, 0, 'unchanged regressions must fail against the supplied PR core');
  process.exitCode = result.status ?? 1;
} finally {
  const target = resolve(replayRoot);
  assert.equal(dirname(target), temporaryParent);
  assert.ok(basename(target).startsWith('rev-p05-r2-old-'));
  rmSync(target, { recursive: true, force: true });
}
