import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p07-translation.test.mjs';
const inputPath = 'hub/shared/tests/unit/p07-translation-input.json';

function replay(transform) {
  const scratch = mkdtempSync(join(tmpdir(), 'p07-provenance-'));
  try {
    for (const path of [suite, inputPath, 'hub/shared/tests/unit/p07-translation-reference.json',
      'shared/multilevel-reml.js']) {
      let source = readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
      if (path === inputPath) source = transform(source);
      const target = join(scratch, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
      // Do not inherit the parent node:test context: it suppresses nested runs.
      // This self-contained child needs no inherited environment variables.
      env: {}, cwd: scratch, encoding: 'utf8', timeout: 120_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('P07 provenance control: LF checkout retains the recorded R input hash', () => {
  const result = replay(source => source);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 16\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test('P07 provenance plant: CRLF checkout retains the recorded R input hash', () => {
  const result = replay(source => source.replace(/\n/g, '\r\n'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 16\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test('P07 provenance control: non-newline byte changes still fail the recorded hash', () => {
  // Even JSON-equivalent whitespace must remain covered by the original pin.
  const result = replay(source => ' ' + source);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /not ok \d+ - P07-R1 control: R fixture records the exact input and native package versions/);
  assert.match(result.stdout, /# pass 15\b/);
  assert.match(result.stdout, /# fail 1\b/);
});
