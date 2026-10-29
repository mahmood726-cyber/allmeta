import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

// Replay from a separate temporary tree. A preload that recompiles a cached
// CommonJS module did not establish that ESM tests received the old exports.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(join(root, 'shared/ma-core.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('  function tau2PM(yi, vi) {');
const end = source.indexOf('\n  // (Restricted) profile log-likelihood', start);
assert.ok(start >= 0 && end > start, 'PM source boundaries');
const originalPM = `  function tau2PM(yi, vi) {
    var k = yi.length, df = k - 1; if (df < 1) return 0;
    if (_wsums(yi, vi, 0).Q <= df) return 0;
    var lo = 0, hi = 1, guard = 0;
    while (_wsums(yi, vi, hi).Q > df && guard++ < 200) { hi *= 2; if (hi > 1e9) break; }
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (_wsums(yi, vi, m).Q > df) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
`;
const restored = source.slice(0, start) + originalPM + source.slice(end);
const hash = createHash('sha256').update(restored).digest('hex');
assert.equal(hash, 'ec80f783258b3d49eaa6cabdd19bb794ddeead3db891602f694861188a303058',
  'reconstructed core must match the complete original source (LF-normalized)');

const temporaryParent = resolve(tmpdir());
const replayRoot = mkdtempSync(join(temporaryParent, 'rev-p05-old-'));
try {
  const testRelative = 'hub/shared/tests/unit/rev-p05-pm-bracket.test.mjs';
  const copies = [testRelative, 'tests/rev-p05-page-harness.mjs',
    'tests/fixtures/rev-p05-pm-input.json', 'tests/fixtures/rev-p05-pm-reference.json',
    'hub/shared/tests/_heterogeneity_parity_fixture.json', 'heterogeneity/index.html'];
  for (const relative of copies) {
    const destination = join(replayRoot, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, relative), destination);
    assert.deepEqual(readFileSync(destination), readFileSync(join(root, relative)),
      `replay must not alter ${relative}`);
  }
  const corePath = join(replayRoot, 'shared/ma-core.js');
  mkdirSync(dirname(corePath), { recursive: true });
  writeFileSync(corePath, restored);
  // Pin the package mode independently of any package.json above the temp path.
  writeFileSync(join(replayRoot, 'package.json'), '{"type":"commonjs"}\n');
  const require = createRequire(import.meta.url);
  const oldCore = require(corePath);
  const ceiling = oldCore.tau2PM([-1000000, 0, 1000000], [1e10, 1e10, 1e10]);
  assert.equal(ceiling, 1073741824, 'replay must actually expose the historical ceiling');
  assert.ok(Math.abs(oldCore.tau2PM([-1, 0, 1], [0.01, 0.01, 0.01]) - 0.99) < 1e-12,
    'ordinary control must still solve the root');
  console.log('P05 original core verified:', hash);
  console.log('P05 replay sentinel: old tau2 =', ceiling, '; ordinary control passed');
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', join(replayRoot, testRelative)],
    { cwd: replayRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  // Keep each outcome, assertion message and total visible within wrapper limits.
  const lines = result.stdout.split(/\r?\n/).filter(line =>
    /^(ok \d+|not ok \d+|# (P05|tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )|\s+error:)/.test(line));
  console.log(lines.length ? lines.join('\n') : result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.notEqual(result.status, 0, 'unchanged defect tests must fail against the verified original core');
  process.exitCode = result.status ?? 1;
} finally {
  // Restrict recursive cleanup to the directory created above, under OS temp.
  const target = resolve(replayRoot);
  assert.equal(dirname(target), temporaryParent);
  assert.ok(basename(target).startsWith('rev-p05-old-'));
  rmSync(target, { recursive: true, force: true });
}
