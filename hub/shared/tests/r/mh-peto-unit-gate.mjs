// File-based entry point for the wrapper, which refuses a wildcard RUN.txt line.
// Discover every *.test.mjs under unit/, run Node's real test runner, preserve its
// exit status, and put full output in temporary storage so FEEDBACK stays readable.
import { readdirSync, mkdtempSync, openSync, closeSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
function testFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? testFiles(path) : entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = testFiles(join(root, 'hub/shared/tests/unit')).sort();
if (!files.length) throw new Error('No unit tests discovered');
const logDir = mkdtempSync(join(tmpdir(), 'rpar-P10-unit-gate-'));
const stdoutPath = join(logDir, 'stdout.tap');
const stderrPath = join(logDir, 'stderr.txt');
const stdout = openSync(stdoutPath, 'w'), stderr = openSync(stderrPath, 'w');
let result;
try {
  result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: root, stdio: ['ignore', stdout, stderr], windowsHide: true,
  });
} finally {
  closeSync(stdout);
  closeSync(stderr);
}
console.log(`UNIT_FILES=${files.length}`);
for (const file of files) console.log(relative(root, file));
console.log(`FULL_STDOUT=${stdoutPath}`);
console.log(`FULL_STDERR=${stderrPath}`);
const output = readFileSync(stdoutPath, 'utf8');
const lines = output.split(/\r?\n/);
// Include complete unexpected-failure diagnostics, but only headers for known
// TODOs. The saved TAP contains every assertion and stack trace without filtering.
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^not ok \d+ /.test(line)) {
    console.log(line);
    if (!/ # TODO\b/.test(line)) {
      let j = i + 1;
      while (j < lines.length && !/^(?:# Subtest:|(?:not )?ok \d+ |1\.\.|# tests )/.test(lines[j])) {
        console.log(lines[j++]);
      }
      i = j - 1;
    }
  } else if (/^ok \d+ .*P10 (?:control:|planted defect:|Peto count parity:)/.test(line) ||
             /^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line)) {
    console.log(line);
  }
}
const errors = readFileSync(stderrPath, 'utf8');
if (errors) console.log(errors);
if (result.error) console.error(result.error.message);
console.log(`NODE_EXIT=${result.status}; SIGNAL=${result.signal}`);
// Missing or nonzero failure totals cannot be reported as a successful gate.
process.exitCode = result.status ?? 1;
if (!/^# fail 0\s*$/m.test(output) && process.exitCode === 0) process.exitCode = 1;
