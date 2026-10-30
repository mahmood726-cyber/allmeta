// File-only launcher for runners that refuse a wildcard command in RUN.txt.
// Execute exactly the node:test files matched by the required quick-gate glob.
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

const files = collect(fileURLToPath(new URL('./', import.meta.url))).sort();
if (!files.length) throw new Error('Quick gate found no unit tests');
console.log(`Quick gate: ${files.length} unit-test files`);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
