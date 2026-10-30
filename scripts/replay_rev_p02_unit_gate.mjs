// Expand the required unit-test glob into file arguments for the task wrapper,
// which accepts `node <file>` but rejects a wildcard in RUN.txt.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const unitDir = path.join(root, 'hub/shared/tests/unit');
function discover(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...discover(name));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(name);
  }
  return files;
}

const files = discover(unitDir).sort();
if (files.length === 0) throw new Error('Unit gate discovered no .test.mjs files');
console.log(`Unit gate: ${files.length} files matching hub/shared/tests/unit/**/*.test.mjs`);
for (const file of files) console.log(path.relative(root, file).split(path.sep).join('/'));
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
if (result.signal) console.error(`Unit gate terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
