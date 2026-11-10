// Run the exact combined gate through a file accepted by the job wrapper.
// Capture output in the OS temporary directory, never in the source tree.
import { mkdtempSync, openSync, closeSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const log = join(mkdtempSync(join(tmpdir(), 'p08-unit-gate-')), 'gate.log');
const fd = openSync(log, 'w');
let result;
try {
  result = spawnSync(process.execPath, ['--test', 'hub/shared/tests/unit/**/*.test.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', fd, fd]
  });
} finally {
  closeSync(fd);
}
console.log('Command: node --test "hub/shared/tests/unit/**/*.test.mjs"');
console.log('Node: ' + process.version);
console.log('Full output: ' + log);
const output = readFileSync(log, 'utf8');
console.log(result.status === 0 ? output.trimEnd().split(/\r?\n/).slice(-12).join('\n') : output);
if (result.error) console.error(result.error.message);
if (result.signal) console.error('Signal: ' + result.signal);
process.exitCode = result.status ?? 1;
