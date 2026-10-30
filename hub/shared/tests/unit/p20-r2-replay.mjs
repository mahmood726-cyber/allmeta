// Run from the repository root: node hub/shared/tests/unit/p20-r2-replay.mjs
// Reconstruct only the reviewed defect; no historical checkout is available.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p20-r2-missing-evalue-ci.test.mjs';
const engine = readFileSync(new URL('shared/evalue.js', root), 'utf8');
assert.equal(engine.split('var eCI = null;').length, 2, 'exactly one reviewed default to plant');
const scratch = mkdtempSync(join(tmpdir(), 'p20-r2-replay-'));
console.log(`Replay artifacts: ${scratch}`);
for (const [variant, source, expectedFailures] of [
  ['old-default', engine.replace('var eCI = null;', 'var eCI = 1;'), 7],
  ['fixed', engine, 0],
]) {
  const tree = join(scratch, variant);
  for (const file of [suite, 'shared/evalue.js', 'effect-size-converter/index.html']) {
    const target = join(tree, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file === 'shared/evalue.js' ? source : readFileSync(new URL(file, root)));
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(tree, suite)], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  writeFileSync(join(scratch, `${variant}.tap`), output);
  const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
  const passes = [...output.matchAll(/^ok \d+ - (.+)$/gm)].map(match => match[1]);
  console.log(`${variant}: ${passes.length} pass, ${failures.length} fail; exit ${result.status}`);
  for (const name of failures) console.log(`  FAIL ${name}`);
  for (const name of passes) console.log(`  PASS ${name}`);
  assert.equal(result.status, expectedFailures ? 1 : 0, output);
  assert.equal(failures.length, expectedFailures, output);
  assert.equal(passes.length, 11 - expectedFailures, output);
  assert.equal(passes.filter(name => name.startsWith('control P20-R2:')).length, 4, output);
  assert.ok(failures.every(name => name.startsWith('plant P20-R2:')), output);
  assert.match(output, /# skipped 0\b/);
}
