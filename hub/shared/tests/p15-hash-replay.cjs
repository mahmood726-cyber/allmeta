// Reconstruct ONLY the old hash filter described in CXTASK; no base tree is
// supplied. Run the unchanged PR tests in a temporary tree, preserving their
// failures. The replay succeeds only if all ten plants fail and nine controls
// pass. This is a planted-defect replay, not a claim to have a historical tree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p15-hash-replay-'));
try {
  const relative = 'hub/shared/tests/unit/p15-hash-rows.test.mjs';
  for (const file of [relative, 'shared/rve-extras.js', 'shared/rve.js', 'shared/rve-eigen.js', 'shared/stats-qt.js']) {
    const destination = path.join(temp, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  const extras = path.join(temp, 'shared/rve-extras.js');
  const source = fs.readFileSync(extras, 'utf8');
  const current = 'if (!raw.trim()) continue;';
  assert.equal(source.split(current).length, 2, 'one exact input-filter mutation point');
  fs.writeFileSync(extras, source.replace(current, 'if (!raw.trim() || raw.trim().charAt(0) === "#") continue;'));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', relative], {
    cwd: temp, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, 'the unchanged suite must reject the planted data-loss defect');
  const outcomes = [...result.stdout.matchAll(/^(not ok|ok) \d+ - (P15-R1 (plant|control): .+)$/gm)];
  assert.equal(outcomes.length, 19, 'every existing P15 test must run');
  assert.equal(outcomes.filter(([, , , kind]) => kind === 'plant').length, 10);
  assert.equal(outcomes.filter(([, , , kind]) => kind === 'control').length, 9);
  for (const [, status, name, kind] of outcomes)
    assert.equal(status, kind === 'plant' ? 'not ok' : 'ok', name);
  console.log('Replay verified: all 10 planted-defect tests FAIL; all 9 controls PASS.');
} finally {
  // Delete only the unique directory created above, under the OS temp directory.
  assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('p15-hash-replay-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
