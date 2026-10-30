// Replay the unmodified diagnostic assertions in an isolated temporary tree.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const diagnosticPath = 'hub/shared/tests/unit/p15-r5-diagnostics.test.mjs';
export const inputPath = 'hub/shared/tests/unit/p15-r5-input.json';
export const readSource = path => readFileSync(join(root, path), 'utf8');

export function runDiagnostics(changes = {}) {
  const work = mkdtempSync(join(tmpdir(), 'p15-r5-'));
  try {
    const files = [diagnosticPath, inputPath,
      'hub/shared/tests/unit/p15-r5-reference.json',
      'shared/stats-qt.js', 'shared/rve.js', 'shared/rve-extras.js', 'shared/rve-eigen.js',
      'rve-meta/index.html', 'rve-meta/tests/fixtures/p15-eigen'];
    for (const path of files) {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      cpSync(join(root, path), join(work, path), { recursive: true });
    }
    for (const [path, text] of Object.entries(changes)) {
      assert.ok(files.includes(path), `Only replay inputs may be replaced: ${path}`);
      writeFileSync(join(work, path), text);
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', diagnosticPath], {
      // A parent node:test worker supplies runner context that makes a nested
      // --test invocation skip its files. This self-contained child uses an
      // absolute executable and needs no inherited environment. Do not inspect
      // the parent's environment or forward its test-runner context.
      env: {},
      cwd: work, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null, result.stderr);
    return { ...result, failures: [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]) };
  } finally {
    // Resolve and verify the exact temporary target before recursive cleanup.
    assert.equal(dirname(resolve(work)), resolve(tmpdir()));
    assert.ok(basename(work).startsWith('p15-r5-'));
    rmSync(work, { recursive: true, force: true });
  }
}
