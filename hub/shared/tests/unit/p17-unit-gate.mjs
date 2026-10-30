// Invoke every quick-gate unit file without relying on wrapper wildcard support.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const directory = join(root, 'hub/shared/tests/unit');
function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const tests = collect(directory).sort();
assert.ok(tests.length, 'the quick gate must discover unit tests');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.ifError(result.error);
const log = join(mkdtempSync(join(tmpdir(), 'p17-unit-gate-')), 'unit-gate.tap');
writeFileSync(log, result.stdout + result.stderr);
console.log('Unit files:', tests.length);
console.log(result.stdout.split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - |^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(line)).join('\n'));
console.log('Full TAP:', log);
if (result.stderr) console.error(result.stderr);
assert.equal(result.status, 0, 'every quick-gate unit test must pass; see full TAP');
assert.match(result.stdout, /# fail 0\b/);
assert.match(result.stdout, /# cancelled 0\b/);
assert.match(result.stdout, /# skipped 0\b/);
assert.match(result.stdout, /# todo 0\b/);
