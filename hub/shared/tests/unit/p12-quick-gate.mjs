// Run the complete unit gate through a single wrapper-accepted file command.
// Discover every *.test.mjs recursively; do not maintain a selective suite list.
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('.', import.meta.url));
function discover(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? discover(child)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [child] : [];
  });
}
const files = discover(directory).sort();
assert.ok(files.length > 0, 'The unit gate must discover test files');
for (const file of files) console.log('UNIT', relative(directory, file));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (result.error) throw result.error;
const output = result.stdout + result.stderr;
const log = join(mkdtempSync(join(tmpdir(), 'p12-quick-gate-')), 'gate.tap');
writeFileSync(log, output);
console.log('Full TAP output:', log);
for (const line of output.split('\n')) {
  if (/^(not ok |# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) )/.test(line)) console.log(line);
}
assert.match(output, /^# tests [1-9]\d*\r?$/m, 'The unit gate must execute tests');
assert.equal(result.signal, null, 'The unit gate must not be terminated');
assert.equal(result.status, 0, 'Every discovered unit test must pass; inspect the TAP log for failures');
