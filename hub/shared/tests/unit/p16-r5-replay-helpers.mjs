import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
export const suite = 'hub/shared/tests/unit/p16-r5-export-provenance.test.mjs';
export const read = path => readFileSync(new URL(path, root), 'utf8');

export function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'replay target must occur exactly once');
  return source.replace(before, after);
}

// Run the real export suite against an isolated copy. Never edit the loaded
// build, application or tests in the checkout; all replay files stay in TEMP.
export function replay(overrides = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'p16-r5-'));
  try {
    for (const path of [suite, 'nma-inconsistency/index.html', 'shared/build-info.js', 'hub/shared/results-export.js']) {
      const destination = join(temporary, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, overrides[path] ?? read(path), 'utf8');
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
      cwd: temporary, encoding: 'utf8', timeout: 30000,
      // Do not inherit node:test's recursive-run context. The executable is
      // absolute and this isolated suite needs no environment variables.
      env: {},
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'replay must finish normally');
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()), 'cleanup stays in TEMP');
    assert.ok(temporary.split(/[\\/]/).at(-1).startsWith('p16-r5-'));
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function refreshedBuild({ version, sha } = {}) {
  let source = read('shared/build-info.js');
  if (version !== undefined) source = source.replace(/version: "[^"]*"/, `version: "${version}"`);
  if (sha !== undefined) {
    source = source.replace(/sha: "[^"]*"/, `sha: "${sha}"`);
    source = source.replace(/shortSha: "[^"]*"/, `shortSha: "${sha.slice(0, 7)}"`);
  }
  return source;
}
