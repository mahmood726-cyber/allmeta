// Run from wt/: node hub/shared/tests/unit/p13-results-export-replay.mjs
// The historical exporter is NOT supplied. This is a narrowly planted mutant:
// remove only the null-result guard to reproduce the reviewed old forwarding
// behavior. Execute the unchanged 22 assertions, preserving all seven controls.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = readFileSync(new URL('./p13-results-export.test.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const source = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8').replace(/\r\n/g, '\n');
const guard = `        if (result == null) {
          status.textContent = 'No results available. Run the analysis successfully, then export.';
          return;
        }
`;
assert.equal(source.split(guard).length, 2, 'exactly one production null-result guard must be present');
const mutant = source.replace(guard, '');
const rootDeclaration = "const root = new URL('../../../../', import.meta.url);";
const sourceDeclaration = "const exporterSource = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8');";
assert.equal(suite.split(rootDeclaration).length, 2);
assert.equal(suite.split(sourceDeclaration).length, 2);
const directory = mkdtempSync(join(tmpdir(), 'p13-export-replay-'));
try {
  const file = join(directory, 'exporter-mutant.test.mjs');
  writeFileSync(file, suite.replace(rootDeclaration, `const root = new URL(${JSON.stringify(root.href)});`)
    .replace(sourceDeclaration, `const exporterSource = ${JSON.stringify(mutant)};`));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  console.log('P13 PLANTED MUTANT ONLY; NOT AN AUTHENTICATED HISTORICAL SOURCE REPLAY');
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  const evidence = mkdtempSync(join(tmpdir(), 'p13-export-evidence-'));
  writeFileSync(join(evidence, 'exporter-mutant.tap'), result.stdout || '');
  if (result.stderr) writeFileSync(join(evidence, 'exporter-mutant.stderr.txt'), result.stderr);
  assert.ifError(result.error);
  assert.equal(result.status, 1, 'the mutant suite must fail');
  const failed = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  const passed = [...result.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map(m => m[1]);
  const expected = ['report-txt', 'report-md', 'csv', 'md', 'json'].flatMap(action => [
    `plant P13-R3: ${action} explains fresh GOSH k=1 refusal without a download`,
    `plant P13-R3: ${action} blocks a refused rerun and exports again after recovery`,
    `plant P13-R3: ${action} handles an undefined result once without requesting a receipt`,
  ]);
  assert.deepEqual(failed.sort(), expected.sort(), 'all 15 plants must fail individually');
  assert.equal(passed.length, 7, 'all seven controls must pass');
  assert.ok(passed.every(name => name.startsWith('control P13-R3:')));
  // Twelve text exports reach Object.entries(null/undefined); three JSON
  // exports wrongly download. Reject unrelated harness or initialization errors.
  assert.equal((result.stdout.match(/error: 'Cannot convert undefined or null to object'/g) || []).length, 12);
  assert.equal((result.stdout.match(/no result must not create a download/g) || []).length, 3);
  console.log('P13 MUTATION VERIFIED: 15 intended failures; seven unchanged controls passed.');
  // Retain every named outcome in the wrapper's truncated output tail.
  for (const name of failed) console.log('VERIFIED FAIL:', name);
  for (const name of passed) console.log('VERIFIED PASS:', name);
  console.log('COMPLETE TAP:', join(evidence, 'exporter-mutant.tap'));
} finally {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('p13-export-replay-'));
  rmSync(directory, { recursive: true, force: true });
}
