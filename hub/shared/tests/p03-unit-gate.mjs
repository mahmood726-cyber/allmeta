// The job wrapper accepts a literal script path, but rejects quoted test globs.
// Discover the same unit/*.test.mjs tree and pass every file to one Node run.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const unitDirectory = fileURLToPath(new URL('unit/', import.meta.url));

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}

const files = testFiles(unitDirectory).sort();
if (files.length === 0) throw new Error('No unit-test files found');
console.log(`Running all ${files.length} unit-test files:`);
for (const file of files) console.log(relative(root, file));

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit'
});
if (result.error) throw result.error;
if (result.signal) console.error(`Unit-test process terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
