// Keep every test outcome visible when the task wrapper retains only the output tail.
// Run the original assertions unchanged; forward their process exit status.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(new URL('../../hub/shared/tests/unit/p13-gosh-lifecycle.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

for (const line of (result.stdout || '').split(/\r?\n/)) {
  if (/^(?:(?:not )?ok \d+ - |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b|# \{)/.test(line)) {
    process.stdout.write(line + '\n');
  }
}
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) process.stderr.write(result.error.message + '\n');
if (result.signal) process.stderr.write('Test process terminated by ' + result.signal + '\n');
process.exitCode = result.status ?? 1;
