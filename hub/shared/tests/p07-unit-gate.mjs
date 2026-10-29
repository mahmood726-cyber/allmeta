// File-based entry point for the wrapper, which rejects a glob in RUN.txt.
// Recursively run every *.test.mjs under unit with Node's normal test isolation.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = collect(fileURLToPath(new URL('./unit/', import.meta.url))).sort();
assert.ok(files.length > 0, 'the full unit gate must not be empty');
console.log('P07-R4 full unit gate files: ' + JSON.stringify(files.map(path => relative(root, path))));
const run = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (run.error) throw run.error;
assert.equal(run.signal, null, 'the unit gate must finish without a signal');
process.exitCode = run.status ?? 1;
