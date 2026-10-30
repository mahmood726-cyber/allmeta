import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p07-translation.test.mjs';
const input = 'hub/shared/tests/unit/p07-translation-input.json';

// Exercise the existing provenance assertion with real checkout bytes. Keep the
// recorded R oracle unchanged, and keep all test output outside the source tree.
function checkout(lineEnding, tamper = false) {
  const dir = mkdtempSync(join(tmpdir(), 'allmeta-provenance-eol-'));
  for (const file of [suite, input, 'hub/shared/tests/unit/p07-translation-reference.json',
    'shared/multilevel-reml.js']) {
    let source = readFileSync(new URL(file, root), 'utf8');
    if (file === input) {
      source = source.replace(/\r\n/g, '\n').replace(/\n/g, lineEnding);
      // Harmless JSON whitespace still changes provenance bytes and must fail.
      if (tamper) source += ' ';
    }
    const destination = join(dir, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    '--test-name-pattern=P07-R1 control: R fixture records', join(dir, suite)],
  // This standalone child needs no ambient configuration. Inheriting the
  // parent's test-runner context causes Node to skip the child suite entirely.
  { encoding: 'utf8', timeout: 60000, env: {} });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(dir, 'test.tap'), output);
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  // Exit zero is insufficient: the selected assertion must actually execute.
  assert.match(output, /^(?:not ok|ok) \d+ - P07-R1 control: R fixture records the exact input and native package versions\r?$/m);
  assert.doesNotMatch(output, /skipping running files/);
  return { status: result.status, output };
}

test('provenance control: LF checkout matches the unchanged R input digest', () => {
  const result = checkout('\n');
  assert.equal(result.status, 0, result.output);
});

test('provenance plant: CRLF checkout matches the same recorded LF input digest', () => {
  const result = checkout('\r\n');
  assert.equal(result.status, 0, result.output);
});

test('provenance control: a non-line-ending byte change is still rejected', () => {
  const result = checkout('\n', true);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /not ok \d+ - P07-R1 control: R fixture records/);
  assert.match(result.output, /ERR_ASSERTION/);
});
