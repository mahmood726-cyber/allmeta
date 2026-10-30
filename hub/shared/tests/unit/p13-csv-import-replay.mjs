// Keep every named result visible in the wrapper's bounded FEEDBACK output.
// The real assertions remain in the quick-gate test file. No output is saved here.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, [
  '--test', '--test-reporter=tap',
  fileURLToPath(new URL('./p13-csv-import.test.mjs', import.meta.url)),
], { encoding: 'utf8' });
if (result.error) throw result.error;
const lines = result.stdout.split(/\r?\n/);
for (const line of lines) {
  if (/^(not ok |ok |# (tests|pass|fail|cancelled|skipped|todo) )/.test(line) ||
      /^\s+(error:|code:|name:|failureType:)/.test(line) ||
      line.includes('invalid imports must explain whole-analysis refusal; observed')) {
    console.log(line);
  }
}
if (result.stderr) console.error(result.stderr);
if (!lines.some(line => /^# tests /.test(line))) console.log(result.stdout);
process.exitCode = result.status ?? 1;
