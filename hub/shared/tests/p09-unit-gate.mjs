// Single-file entry point for wrappers that do not accept a --test glob.
// Discover the entire unit gate; retain full TAP output outside the source tree.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const unitDirectory = fileURLToPath(new URL('./unit/', import.meta.url));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return discover(file);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [file] : [];
  });
}
const files = discover(unitDirectory).sort();
assert.ok(files.length > 0, 'the unit gate must discover tests');
console.log('Node', process.version);
console.log('Combined unit gate; all discovered test files:');
for (const file of files) console.log(path.relative(root, file).replaceAll('\\', '/'));

const temporary = mkdtempSync(path.join(tmpdir(), 'p09-unit-gate-'));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
});
const output = (result.stdout || '') + (result.stderr || '');
const log = path.join(temporary, 'unit-gate.tap');
writeFileSync(log, output);
console.log('Full TAP log:', log);
// Preserve failing diagnostics while keeping successful output short enough
// for the wrapper feedback to retain every test name and the final totals.
let failure = false;
for (const line of output.split(/\r?\n/)) {
  if (/^(?:not ok|ok) \d+ - /.test(line)) failure = line.startsWith('not ok');
  else if (/^# (?:Subtest:|tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )/.test(line)) failure = false;
  if (failure || /^(?:not ok|ok) \d+ - |^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) |^# Replayed /.test(line)) {
    console.log(line);
  }
}
assert.ifError(result.error);
assert.equal(result.signal, null, 'the unit test process must finish normally');
assert.equal(result.status, 0, 'every unit test must pass; inspect the TAP log on failure');
assert.match(output, /^# tests [1-9]\d*$/m);
for (const count of ['fail', 'cancelled', 'skipped', 'todo']) {
  assert.match(output, new RegExp('^# ' + count + ' 0$', 'm'));
}
console.log('Combined unit gate passed with no failures, skips or cancellations.');
