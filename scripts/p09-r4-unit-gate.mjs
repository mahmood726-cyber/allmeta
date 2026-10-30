// Run the complete supplied unit tree through the wrapper's node <file> form.
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function unitFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? unitFiles(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = unitFiles(join(root, 'hub/shared/tests/unit')).sort();
assert.ok(files.length > 0);
const scratch = mkdtempSync(join(tmpdir(), 'p09-unit-gate-'));
console.log(JSON.stringify({ files, logs: scratch }));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: root, encoding: 'utf8', env: { TEMP: scratch, TMP: scratch }, maxBuffer: 8 * 1024 * 1024
});
writeFileSync(join(scratch, 'gate.tap'), (run.stdout ?? '') + (run.stderr ?? ''));
assert.ifError(run.error);
if (run.status !== 0) console.log(run.stdout + run.stderr);
else console.log(run.stdout.split('\n').filter(line => /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line)).join('\n'));
assert.equal(run.status, 0, 'All supplied unit files must pass; see temporary TAP log');
assert.match(run.stdout, /# tests 75\b/);
for (const count of ['fail', 'cancelled', 'skipped', 'todo']) {
  assert.match(run.stdout, new RegExp('# ' + count + ' 0\\b'));
}
