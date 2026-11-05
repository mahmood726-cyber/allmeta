// Wrapper-compatible entry point for the complete **/*.test.mjs unit gate.
// Discover every suite recursively and preserve node:test's exit status.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const unitRoot = fileURLToPath(new URL('./', import.meta.url));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const suites = discover(unitRoot).sort();
assert.ok(suites.length > 0, 'The unit gate must discover test suites');
console.log(`Unit gate: ${suites.length} suites`);
for (const suite of suites) console.log(relative(root, suite));
const run = spawnSync(process.execPath, ['--test', ...suites], {
  cwd: root, stdio: 'inherit', shell: false
});
if (run.error) throw run.error;
process.exitCode = run.status === null ? 1 : run.status;
