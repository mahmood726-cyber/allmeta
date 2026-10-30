// Wrapper-compatible combined gate; run every quick-gate test without a shell.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function tests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? tests(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = tests(fileURLToPath(new URL('../unit/', import.meta.url))).sort();
if (!files.length) throw new Error('No quick-gate tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
