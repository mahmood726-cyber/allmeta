'use strict';
// The CXTASK wrapper accepts a script path, but rejected the quoted gate glob.
// Discover every matching test recursively and preserve Node's exit status.
const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '../..');
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discover(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = discover(join(root, 'hub/shared/tests/unit')).sort();
if (!files.length) throw new Error('No unit tests found for the required quick gate');
console.log(`Running the complete quick gate: ${files.length} unit test files`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  shell: false
});
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
