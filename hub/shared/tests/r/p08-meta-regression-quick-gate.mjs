// Named entry point for RUN.txt, whose command parser rejects the gate's glob.
// Run the complete recursive *.test.mjs set, with no exclusions or status changes.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = collect(join(root, 'hub/shared/tests/unit')).sort();
assert.ok(files.length > 0, 'The quick gate must discover unit tests');
console.log(`Full quick gate: ${files.length} files`);
for (const file of files) console.log(relative(root, file));
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
if (result.signal) console.error(`Quick gate terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
