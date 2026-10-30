// Wrapper-compatible entrypoint: run every unit file without shell glob expansion.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'hub/shared/tests/unit');
const files = readdirSync(directory, { recursive: true })
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => resolve(directory, name));
if (!files.length) throw new Error('No unit tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
