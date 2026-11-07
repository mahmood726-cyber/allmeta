// Re-run the unchanged test file on verified pre-fix sources, in OS temporary storage.
// Keep concise TAP outcomes because the wrapper truncates long failure output.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { read, oldEngine, oldHtml } from './p18-correlation-sources.mjs';

const temporaryRoot = resolve(tmpdir());
const work = mkdtempSync(join(temporaryRoot, 'p18-correlation-baseline-'));
const testPath = 'hub/shared/tests/unit/p18-correlation-scale.test.mjs';
try {
  for (const [path, text] of [
    ['shared/multivariate-ma.js', oldEngine],
    ['multivariate-ma/index.html', oldHtml],
    [testPath, read(testPath)]
  ]) {
    const destination = join(work, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(work, testPath)],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const lines = result.stdout.split(/\r?\n/);
  console.log('PRE-FIX SOURCES VERIFIED; EXPECTED RED RUN; Node ' + process.version);
  console.log(lines.filter(line => /^(ok |not ok |# (tests|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
  if (result.stderr) console.error(result.stderr);
  assert.equal(lines.filter(line => /^not ok \d+ - P18-R2 plant:/.test(line)).length, 13);
  assert.equal(lines.filter(line => /^ok \d+ - P18-R2 control:/.test(line)).length, 7);
  assert.equal(result.status, 1, 'Original code must fail these regression assertions');
  process.exitCode = result.status;
} finally {
  assert.ok(resolve(work).startsWith(temporaryRoot + sep), 'Cleanup stays inside temporary storage');
  rmSync(work, { recursive: true, force: true });
}
