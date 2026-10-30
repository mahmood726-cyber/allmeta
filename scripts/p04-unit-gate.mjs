// Run the complete quick gate through a single wrapper-allowlisted file.
// Expand paths here because the job wrapper rejects the shell glob command.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path) :
      entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = discover(join(root, 'hub/shared/tests/unit')).sort();
assert.ok(files.length > 0, 'the quick gate must discover tests');
console.log('P04_UNIT_GATE', JSON.stringify({
  node: process.version, files: files.map(path => relative(root, path)),
}));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
assert.ifError(result.error);
assert.equal(result.signal, null, 'the quick gate must complete without a signal');
assert.notEqual(result.status, null, 'the quick gate must return an exit status');
process.exitCode = result.status;
