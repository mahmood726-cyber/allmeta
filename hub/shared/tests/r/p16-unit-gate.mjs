// The wrapper accepts `node <file>` but rejected its wildcard --test command.
// Enumerate exactly the recursive *.test.mjs set used by the final quick gate.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = collect(fileURLToPath(new URL('../unit/', import.meta.url))).sort();
assert.ok(files.length > 0, 'quick-gate discovery must not be empty');
console.log(`P16 quick-gate launcher: ${files.length} test files`);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
