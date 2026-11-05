// RUN.txt accepts a single script, not a quoted glob. Enumerate the same unit
// gate recursively and pass every test file directly to Node's test runner.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const directory = fileURLToPath(new URL('./', import.meta.url));
function collect(path) {
  return readdirSync(path, {withFileTypes: true}).flatMap(entry => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? collect(file) : entry.name.endsWith('.test.mjs') ? [file] : [];
  });
}
const files = collect(directory).sort();
assert.ok(files.length > 0, 'the unit gate must discover tests');
console.log('P07 unit gate:', files.length, 'test files');
const run = spawnSync(process.execPath, ['--test', ...files], {stdio: 'inherit', timeout: 600000});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
