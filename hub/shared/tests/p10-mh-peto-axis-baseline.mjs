// Replay the current regression suite against the byte-verified original app.
// Production stays untouched; all replay files live in the system temp folder.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let original = readFileSync(join(root, 'mh-peto/index.html'), 'utf8').replace(/\r\n/g, '\n');
const start = original.indexOf("    var _axisMeasure = document.getElementById('measure').value;");
const end = original.indexOf('    // ---- results storage for export ----', start);
assert.ok(start >= 0 && end > start, 'Locate the axis synchronization added in pass 2');
original = original.slice(0, start) + '\n' + original.slice(end);
for (const [fixed, old] of [
  ['      syncAxisMeasure(measure);\n', ''],
  ["var nullV = measure === 'RD' ? 0 : 1;", 'var nullV = logScale ? 1 : 0;'],
  ["log: _axisMeasure !== 'RD'", 'log: false'],
  ['if (!_syncingAxis) run();', 'run();'],
]) {
  assert.equal(original.split(fixed).length, 2, `Exactly one fixed fragment: ${fixed}`);
  original = original.replace(fixed, old);
}
original = original.replace(/\n/g, '\r\n');
const hash = createHash('sha256').update(original, 'utf8').digest('hex').toUpperCase();
assert.equal(hash, 'AF9C238F74B07853377D6C248C3E025A6683AE3E54EF2B3EBFE69DE491BE804B',
  'Reconstructed app must match the pre-edit pass-1 source byte for byte');
console.log(`Original app SHA256 verified: ${hash}`);

const tempParent = resolve(tmpdir());
const replay = mkdtempSync(join(tempParent, 'p10-axis-baseline-'));
const testFile = 'hub/shared/tests/unit/p10-mh-peto-axis.test.mjs';
try {
  mkdirSync(join(replay, 'mh-peto'), { recursive: true });
  writeFileSync(join(replay, 'mh-peto/index.html'), original, 'utf8');
  for (const relative of [testFile, 'hub/shared/axis-controls.js', 'hub/shared/analysis-lifecycle.js']) {
    const target = join(replay, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, relative), target);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
    cwd: replay, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  // Keep every named outcome, with short assertion messages, so the wrapper
  // retains the entire baseline instead of truncating a long diagnostic tail.
  for (const line of result.stdout.split(/\r?\n/)) {
    if (/^(?:ok |not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo)\b|\s+error:)/.test(line)) {
      console.log(line);
    }
  }
  if (result.stderr) process.stderr.write(result.stderr);
  assert.match(result.stdout, /^# tests 36\r?$/m, 'All current regression cases must execute');
  console.log(`Baseline test process exit=${result.status}; defect failures are expected.`);
  process.exitCode = result.status ?? 1;
} finally {
  assert.equal(dirname(resolve(replay)), tempParent);
  assert.ok(basename(replay).startsWith('p10-axis-baseline-'));
  rmSync(replay, { recursive: true, force: true });
}
