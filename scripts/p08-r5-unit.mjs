// Run the exact final gate through a wrapper-compatible file entry point.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = mkdtempSync(join(tmpdir(), 'p08-r5-unit-'));
const run = spawnSync(process.execPath, ['--test', 'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { TEMP: scratch, TMP: scratch, TMPDIR: scratch }, encoding: 'utf8',
  windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024
});
const output = (run.stdout || '') + (run.stderr || '');
writeFileSync(join(scratch, 'unit.log'), output);
console.log(output);
console.log('Full unit gate log: ' + join(scratch, 'unit.log'));
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
