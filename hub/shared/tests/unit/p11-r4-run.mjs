// Preserve the full test output in TEMP and emit a concise, untruncated summary
// for the job wrapper. Assertions and the test runner's exit code are unchanged.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'p11-r4-suite-'));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'hub/shared/tests/unit/p11-r4-export.test.mjs'], {
  encoding: 'utf8', windowsHide: true, timeout: 900000, maxBuffer: 16*1024*1024
});
const output = (run.stdout || '') + (run.stderr || '');
const path = join(dir, 'output.txt');
writeFileSync(path, output);
for (const line of output.split(/\r?\n/)) {
  if (/^(?:(?:not )?ok \d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line) ||
      /\b(?:ALL|FAIL) \d+\/\d+|Error:|error:|ENOENT|Cannot find/.test(line)) console.log(line);
}
console.log(`Full test output: ${path}`);
if (run.error) console.error(run.error);
process.exitCode = run.error ? 1 : (run.status ?? 1);
