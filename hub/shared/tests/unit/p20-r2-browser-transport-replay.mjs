// Replay the fixed-port setup defect without installing or launching a browser.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../p20-r2-browser-transport.mjs', import.meta.url), 'utf8');
const assignment = 'const port = listener.address().port;';
assert.equal(source.split(assignment).length, 2, 'exactly one port selection to plant');
const scratch = mkdtempSync(join(tmpdir(), 'p20-r2-transport-replay-'));
console.log(`Transport replay artifacts: ${scratch}`);
for (const [variant, transport, expectedFailures] of [
  ['fixed-port', source.replace(assignment, 'const port = 8088;'), 1],
  ['dynamic-port', source, 0],
]) {
  const tree = join(scratch, variant);
  mkdirSync(join(tree, 'unit'), { recursive: true });
  writeFileSync(join(tree, 'p20-r2-browser-transport.mjs'), transport);
  writeFileSync(join(tree, 'evalue-parity.spec.mjs'), readFileSync(new URL('../evalue-parity.spec.mjs', import.meta.url)));
  const suite = join(tree, 'unit/p20-r2-browser-transport.test.mjs');
  writeFileSync(suite, readFileSync(new URL('./p20-r2-browser-transport.test.mjs', import.meta.url)));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
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
  assert.equal(passes.length, 3 - expectedFailures, output);
  assert.equal(passes.filter(name => name.startsWith('control P20-R2 runner:')).length, 2, output);
  assert.ok(failures.every(name => name.startsWith('plant P20-R2 runner:')), output);
  assert.match(output, /# skipped 0\b/);
}
