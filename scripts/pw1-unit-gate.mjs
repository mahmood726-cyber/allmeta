// File entry point for the job wrapper, which rejects a wildcard RUN.txt line.
// Run every quick-gate test with Node's normal per-file isolation and exit code.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? testFiles(path)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = testFiles(join(root, 'hub/shared/tests/unit')).sort();
if (!files.length) throw new Error('No quick-gate test files found');
console.log(`PW1 quick gate: ${files.length} test files`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root, stdio: 'inherit', shell: false,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
