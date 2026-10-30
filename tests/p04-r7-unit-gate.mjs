// The RUN.txt wrapper accepts a script path but refused the quoted glob command.
// Run the same full unit gate directly, retaining all output outside the tree.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'p04-r7-unit-gate-'));
const args = ['--test', '--test-reporter=tap', 'hub/shared/tests/unit/**/*.test.mjs'];
console.log(`Gate: node ${args.join(' ')}`);
console.log(`Engine SHA-256: ${createHash('sha256').update(readFileSync(join(root, 'shared/nma-multiarm-v1.js'))).digest('hex')}`);
const result = spawnSync(process.execPath, args,
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.ifError(result.error);
const log = join(scratch, 'unit-gate.tap');
writeFileSync(log, result.stdout + result.stderr);
console.log(`Full unit-gate log: ${log}`);
const lines = result.stdout.split(/\r?\n/);
console.log(lines.filter(line => /^(?:(?:not )?ok \d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
if (result.stderr) console.error(result.stderr);
if (result.status !== 0) {
  // Show assertion details as well as names, while keeping wrapper output small.
  const details = result.stdout.match(/^not ok \d+[^\n]*\r?\n(?:[ \t]+[^\n]*\r?\n)*/gm) || [];
  console.log(details.join('\n').slice(0, 16000));
}
assert.equal(result.status, 0, 'The full unit gate must pass');
assert.match(result.stdout, /^# tests [1-9]\d*$/m, 'The gate must execute tests');
for (const name of ['fail', 'cancelled', 'skipped', 'todo']) {
  assert.ok(lines.includes(`# ${name} 0`), `No ${name} tests`);
}
