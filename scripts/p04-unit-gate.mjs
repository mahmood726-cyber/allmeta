// The wrapper accepts a script path but refuses a quoted test glob. Discover
// the same recursive *.test.mjs set and run it together in one Node invocation.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? discover(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const dir = fileURLToPath(new URL('../hub/shared/tests/unit/', import.meta.url));
const files = discover(dir).sort();
assert.ok(files.length, 'The complete unit-test directory must contain tests');
console.log(`P04_UNIT_GATE: running all ${files.length} unit-test files together`);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
assert.equal(result.signal, null, 'The unit gate must finish normally');
process.exitCode = result.status;
