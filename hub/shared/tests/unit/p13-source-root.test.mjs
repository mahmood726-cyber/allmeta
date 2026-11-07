import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = fileURLToPath(new URL('./p13-review-defects.test.mjs', import.meta.url));
const run = sourceRoot => spawnSync(process.execPath, ['--test-reporter=tap', suite, '--p13-source-root', sourceRoot], {
  // Start a standalone TAP process, without inheriting the parent test runner's
  // internal serialization mode. No environment values are read or logged.
  env: {}, encoding: 'utf8', timeout: 60000,
});

test('control P13 source root: the unchanged 24 assertions pass on the current tree', () => {
  const result = run(fileURLToPath(root));
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 24\b/);
  assert.match(result.stdout, /# pass 24\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test('plant P13 source root: all 18 arithmetic plants fail and six controls pass in the selected defect copy', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'p13-source-root-'));
  try {
    mkdirSync(join(temporary, 'gosh'));
    mkdirSync(join(temporary, 'hub/shared'), { recursive: true });
    const page = readFileSync(new URL('gosh/index.html', root), 'utf8');
    const guard = /    function fitNumber\(value, positive\) \{[\s\S]*?\n    \}/g;
    assert.equal([...page.matchAll(guard)].length, 1, 'one arithmetic guard to disable');
    // A mutation probe of source routing, NOT a reconstructed historical page.
    writeFileSync(join(temporary, 'gosh/index.html'), page.replace(guard,
      '    function fitNumber(value, positive) { return value; }'));
    writeFileSync(join(temporary, 'hub/shared/analysis-lifecycle.js'),
      readFileSync(new URL('hub/shared/analysis-lifecycle.js', root)));
    const result = run(temporary);
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /# tests 24\b/);
    assert.match(result.stdout, /# pass 6\b/);
    assert.match(result.stdout, /# fail 18\b/);
    assert.equal((result.stdout.match(/^not ok \d+ - plant P13-R2 /gm) || []).length, 18);
    assert.equal((result.stdout.match(/^ok \d+ - control P13-R2 /gm) || []).length, 6);
  } finally {
    assert.equal(dirname(temporary), resolve(tmpdir()), 'cleanup stays in the temporary directory');
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('plant P13 source root: a missing selected tree must fail instead of testing the current tree', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'p13-missing-root-'));
  try {
    const result = run(join(temporary, 'absent'));
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /ENOENT/);
  } finally {
    assert.equal(dirname(temporary), resolve(tmpdir()), 'cleanup stays in the temporary directory');
    rmSync(temporary, { recursive: true, force: true });
  }
});
