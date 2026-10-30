// Read-only source replay. All reconstructed trees and child output stay in TEMP.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
export const readLF = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
export function blobId(text) {
  const bytes = Buffer.from(text);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

export function engineParent(source) {
  const fixed = 'var ix = Object.create(null); f.nonref.forEach';
  assert.equal(source.split(fixed).length, 2, 'exactly one reviewed league-index hunk');
  const parent = source.replace(fixed, 'var ix = {}; f.nonref.forEach');
  // Full object ID computed from the supplied source, matching the review's b57de1c prefix.
  assert.equal(blobId(parent), 'b57de1c02ec304fa7448b7a804b4d75f52ae5386');
  return parent;
}

export function unguardedPage(source) {
  const guard = `    function render() {
      try {
        return renderResults();
      } catch (error) {
        clearResults();
        showWarnings(["Analysis could not be completed: " + ((error && error.message) || String(error))]);
      }
    }

    function renderResults() {`;
  assert.equal(source.split(guard).length, 2, 'exactly one reviewed render guard');
  // This restores the reviewed behavior; no historical page hash was supplied.
  return source.replace(guard, '    function render() {');
}

export function inTempTree(files, action) {
  const prefix = join(resolve(tmpdir()), 'p04-replay-');
  const dir = mkdtempSync(prefix);
  try {
    for (const [path, text] of Object.entries(files)) {
      const target = resolve(dir, path);
      assert.ok(target.startsWith(dir + sep), 'copy stays in the temporary tree');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    return action(dir);
  } finally {
    assert.ok(resolve(dir).startsWith(prefix), 'cleanup stays in the allocated TEMP tree');
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runNode(dir, args) {
  // A child test runner must not inherit node:test's recursion marker. These
  // self-contained replays need only the temp location, not the caller's environment.
  const run = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8',
    env: { TEMP: tmpdir(), TMP: tmpdir() }, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(run.error);
  assert.equal(run.signal, null, 'replay process was not terminated');
  return run;
}
