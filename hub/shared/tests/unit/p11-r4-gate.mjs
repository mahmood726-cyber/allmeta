// Run the complete required gate through the job wrapper's node <file> form.
// The glob and assertions are unchanged; only output reporting is controlled.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'p11-r4-gate-'));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: new URL('../../../../', import.meta.url),
  encoding: 'utf8', windowsHide: true, timeout: 900000, maxBuffer: 16*1024*1024
});
const output = (run.stdout || '') + (run.stderr || '');
const path = join(dir, 'output.txt');
writeFileSync(path, output);
for (const line of output.split(/\r?\n/)) {
  if (/^(?:(?:not )?ok \d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line) ||
      /\b(?:ALL|FAIL) \d+\/\d+|Error:|error:|ENOENT|Cannot find/.test(line)) console.log(line);
}
console.log(`Full gate output: ${path}`);
if (run.error) console.error(run.error);
process.exitCode = run.error ? 1 : (run.status ?? 1);
