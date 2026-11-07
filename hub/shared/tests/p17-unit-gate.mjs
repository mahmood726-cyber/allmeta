// File-based entry point for wrappers that reject wildcard command arguments.
// Node receives the task's exact quick-gate pattern; no tests are enumerated,
// filtered, skipped or otherwise selected by this launcher.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(join(tmpdir(), 'p17-unit-gate-'));
const args = ['--test', 'hub/shared/tests/unit/**/*.test.mjs'];
console.log('Unit gate evidence: ' + directory);
const result = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  env: {}, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
writeFileSync(join(directory, 'stdout.txt'), result.stdout || '');
writeFileSync(join(directory, 'stderr.txt'), result.stderr || '');
writeFileSync(join(directory, 'summary.json'), JSON.stringify({
  node: process.version, args, status: result.status, signal: result.signal, error: result.error?.message,
}, null, 2) + '\n');
if (result.stdout) console.log(result.stdout.trimEnd());
if (result.stderr) console.error(result.stderr.trimEnd());
if (result.error) throw result.error;
assert.equal(result.status, 0, 'The exact wildcard unit gate failed; see temporary logs');
