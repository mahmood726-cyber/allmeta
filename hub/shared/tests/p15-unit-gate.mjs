// The job wrapper accepts a single script path, not a quoted test glob.
// Enumerate exactly the recursive unit/**/*.test.mjs gate; preserve isolation
// and the child test runner's exit status. No test output files are written.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const unit = fileURLToPath(new URL('./unit/', import.meta.url));
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return discover(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = discover(unit).sort();
assert.ok(files.length, 'the shared unit gate must not be empty');
assert.ok(files.includes(join(unit, 'p15-rpar.test.mjs')), 'include P15 R parity');
console.log(`Shared unit gate: ${files.length} files; Node ${process.version}`);
for (const path of files) console.log(relative(root, path));
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root, stdio: 'inherit', shell: false
});
if (result.error) throw result.error;
if (result.signal) console.error(`Unit gate terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
