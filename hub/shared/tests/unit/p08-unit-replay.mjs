// Single-file entry point for runners that reject a quoted node --test glob.
// Discover every unit test recursively; do not filter tests or change assertions.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const directory = fileURLToPath(new URL('./', import.meta.url));
function discover(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? discover(child) : entry.isFile() && entry.name.endsWith('.test.mjs') ? [child] : [];
  });
}
const tests = discover(directory).sort();
assert.ok(tests.length, 'The complete unit suite must contain tests');
const output = mkdtempSync(join(tmpdir(), 'p08-unit-'));
writeFileSync(join(output, 'selection.json'), JSON.stringify({ node: process.version, tests: tests.map(path => relative(root, path)) }, null, 2) + '\n');
console.log(`Unit artifacts: ${output}`);
for (const path of tests) console.log(`Selected: ${relative(root, path)}`);
const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
  cwd: root, encoding: 'utf8', timeout: 300_000, maxBuffer: 16 * 1024 * 1024,
});
writeFileSync(join(output, 'unit.tap'), child.stdout || '');
writeFileSync(join(output, 'unit.stderr'), child.stderr || '');
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
if (child.error) throw child.error;
assert.notEqual(child.status, null, `Unit runner terminated by ${child.signal}`);
process.exitCode = child.status;
