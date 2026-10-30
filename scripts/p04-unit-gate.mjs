// File-based entry point for runners that refuse shell globs. No tests are filtered out.
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function testsIn(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? testsIn(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const tests = testsIn('hub/shared/tests/unit').sort();
if (!tests.length) throw new Error('No unit tests found');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
  cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
});
// The wrapper retains only the output tail. Keep every result in that tail and
// retain complete TAP under the OS temporary directory for detailed inspection.
const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';
const log = join(mkdtempSync(join(tmpdir(), 'p04-unit-gate-')), 'unit.tap');
writeFileSync(log, stdout + stderr);
console.log(`NODE ${process.version}; UNIT_FILES ${tests.length}; FULL_TAP ${log}`);
const failures = [];
let failure;
for (const line of stdout.split(/\r?\n/)) {
  if (/^(?:# Subtest: |(?:not )?ok \d+|1\.\.)/.test(line)) {
    if (failure) failures.push(failure.join('\n'));
    failure = line.startsWith('not ok ') ? [line] : undefined;
  } else if (failure) failure.push(line);
  if (/^(?:(?:not )?ok \d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line)) {
    console.log(line);
  }
}
if (failure) failures.push(failure.join('\n'));
// One escaped line per failure prevents later passing tests hiding diagnostics.
for (const detail of failures) console.log(`FAILURE_DETAIL ${JSON.stringify(detail)}`);
if (stderr) console.error(`STDERR ${JSON.stringify(stderr)}`);
if (result.error) throw result.error;
if (result.signal) throw new Error(`Unit gate terminated by ${result.signal}`);
if (!/^# tests [1-9]\d*$/m.test(stdout)) throw new Error('Unit gate executed no tests');
process.exitCode = result.status;
