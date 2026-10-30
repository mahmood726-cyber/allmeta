// File-based entry point for the job wrapper, which refuses wildcard commands.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}

const files = testFiles(fileURLToPath(new URL('./unit/', import.meta.url))).sort();
if (!files.length) throw new Error('No unit test files found.');
console.log(`Unit gate: ${files.length} files; Node ${process.version}`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status === null) throw new Error(`Unit gate terminated: ${result.signal}`);
process.exitCode = result.status;
