// Launch the required recursive unit gate through RUN.txt's named-file interface.
// Keep the full TAP log in the OS temporary directory, never in wt/.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
  'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
});
if (result.error) throw result.error;
const output = result.stdout + result.stderr;
const log = join(mkdtempSync(join(tmpdir(), 'rev-P02-f4-unit-gate-')), 'unit-gate.tap');
writeFileSync(log, output);
console.log('Full recursive unit gate; Node ' + process.version + '; exit=' + result.status);
console.log('Full TAP log: ' + log);
console.log(result.status === 0
  ? output.split(/\r?\n/).filter(line => /^(?:ok |not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) )/.test(line)).join('\n')
  : output);
process.exitCode = result.status ?? 1;
