import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p07-translation.test.mjs';
const input = 'hub/shared/tests/unit/p07-translation-input.json';
const reference = 'hub/shared/tests/unit/p07-translation-reference.json';
const engine = 'shared/multilevel-reml.js';
const rawHash = "createHash('md5').update(inputBytes).digest('hex')";
const lfHash = "createHash('md5').update(inputBytes.toString('utf8').replace(/\\r\\n/g, '\\n')).digest('hex')";
const provenanceTest = 'P07-R1 control: R fixture records the exact input and native package versions';

function replay(eol, raw) {
  const directory = mkdtempSync(join(tmpdir(), 'p07-lf-provenance-'));
  for (const path of [suite, input, reference, engine]) {
    let source = readFileSync(new URL(path, root), 'utf8');
    if (path === input) source = source.replace(/\r\n/g, '\n').replace(/\n/g, eol);
    if (path === suite) {
      assert.equal(source.split(rawHash).length + source.split(lfHash).length - 2, 1,
        'replay must identify exactly one provenance hash assertion');
      // Reconstruct only the pre-fix raw-byte hash; preserve every assertion,
      // reference value and numerical test in the supplied suite.
      if (raw) source = source.replace(lfHash, rawHash);
    }
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
    cwd: directory, encoding: 'utf8', timeout: 30000, env: {}
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, 'provenance replay must finish normally');
  assert.equal(result.stderr, '', 'provenance replay must not fail to load');
  writeFileSync(join(directory, 'unit.tap'), result.stdout);
  return { ...result, directory };
}

function verify(result, failed) {
  const outcomes = [...result.stdout.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)];
  assert.equal(outcomes.length, 16, result.stdout);
  assert.deepEqual(outcomes.filter(([, status]) => status === 'not ok').map(([, , name]) => name),
    failed ? [provenanceTest] : [], result.stdout);
  assert.equal(result.status, failed ? 1 : 0, result.stdout);
  assert.match(result.stdout, /^# tests 16$/m);
  assert.match(result.stdout, failed ? /^# pass 15$/m : /^# pass 16$/m);
  assert.match(result.stdout, failed ? /^# fail 1$/m : /^# fail 0$/m);
  assert.match(result.stdout, /^# skipped 0$/m);
  if (failed) assert.match(result.stdout, /operator: 'strictEqual'/);
}

test('plant P07 LF provenance: CRLF checkout retains the recorded LF hash', t => {
  const before = replay('\r\n', true);
  verify(before, true);
  const after = replay('\r\n', false);
  verify(after, false);
  t.diagnostic(`Raw hash: 15 pass, 1 provenance failure (${before.directory}); supplied hash: 16 pass (${after.directory}).`);
});

test('control P07 LF provenance: LF checkout preserves all existing assertions', t => {
  const before = replay('\n', true);
  verify(before, false);
  const after = replay('\n', false);
  verify(after, false);
  t.diagnostic(`Raw and supplied hashes: 16 pass each (${before.directory}; ${after.directory}).`);
});
