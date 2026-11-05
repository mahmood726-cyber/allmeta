// Compact before/after evidence: retain full Node TAP output only in the OS temp directory.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const testFile = 'hub/shared/tests/unit/p09-log-axis.test.mjs';
const original = readFileSync(join(tmpdir(), 'rev2-P09-f2-original-index.html'));
assert.equal(createHash('sha256').update(original).digest('hex'),
  '05e579f07d9e1939e3ed7dd70773c4387807171bf4b70f5bf02ca290b41bbb66',
  'baseline must be the exact pre-fix page saved in pass 2');
const scratch = mkdtempSync(join(tmpdir(), 'p09-r2-replay-'));
const baselineRoot = join(scratch, 'original');
for (const file of [testFile, 'shared/ma-core.js', 'hub/shared/axis-controls.js', 'proportion-ma/index.html']) {
  const target = join(baselineRoot, file);
  mkdirSync(dirname(target), { recursive: true });
  if (file === 'proportion-ma/index.html') writeFileSync(target, original);
  else copyFileSync(join(root, file), target);
}

function run(label, cwd) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  const log = join(scratch, `${label}.tap`);
  writeFileSync(log, output);
  console.log(`${label}: exit=${result.status}; full output: ${log}`);
  console.log(output.split(/\r?\n/).filter(line =>
    /^(?:ok |not ok |# (?:tests|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
  return { status: result.status, output };
}

const before = run('original', baselineRoot);
const after = run('fixed', root);
assert.equal(before.status, 1, 'the unchanged tests must expose the original defect');
assert.equal((before.output.match(/^not ok \d+ - P09-R2 plant:/gm) || []).length, 15);
assert.equal((before.output.match(/^ok \d+ - P09-R2 control:/gm) || []).length, 5);
assert.equal(after.status, 0, 'the fixed code must pass every unchanged regression and control');
assert.equal((after.output.match(/^ok \d+ - P09-R2 /gm) || []).length, 20);
