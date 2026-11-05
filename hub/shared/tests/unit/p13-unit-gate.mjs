// RUN.txt accepts an existing file, but rejects the quoted quick-gate glob.
// Pass the same recursively discovered test files as explicit Node arguments.
// Keep complete TAP in the system temporary directory and print every result
// compactly so the wrapper's output limit cannot hide earlier test outcomes.
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const unit = fileURLToPath(new URL('./', import.meta.url));
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = collect(unit).sort();
assert.ok(files.length, 'the quick gate must discover test files');
console.log('UNIT FILES', JSON.stringify(files.map(path => relative(root, path))));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024,
});
const directory = mkdtempSync(join(tmpdir(), 'p13-unit-gate-'));
const log = join(directory, 'unit.tap');
writeFileSync(log, result.stdout || '');
if (result.stderr) {
  writeFileSync(join(directory, 'unit.stderr.txt'), result.stderr);
  process.stderr.write(result.stderr);
}
console.log('COMPLETE TAP', log);
const outcomes = (result.stdout || '').split(/\r?\n/).filter(line =>
  /^(?:(?:not )?ok \d+ - |1\.\.\d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) )/.test(line));
console.log(outcomes.join('\n'));
assert.ifError(result.error);
assert.equal(result.signal, null, 'the quick gate must complete normally');
assert.ok(outcomes.some(line => /^# tests [1-9]/.test(line)), 'the quick gate must report executed tests');
console.log('UNIT EXIT', result.status);
process.exitCode = result.status ?? 1;
