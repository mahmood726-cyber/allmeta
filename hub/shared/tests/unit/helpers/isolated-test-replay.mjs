import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = new URL('../../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');
export const lf = text => text.replace(/\r\n/g, '\n');
const sha256 = text => createHash('sha256').update(lf(text)).digest('hex');

// Keep import.meta.url-relative reads honest: copy the test AND its inputs,
// retaining their relative paths. Merely changing cwd would test the same page.
// All generated copies and raw TAP output live outside the source tree.
export function replay(t, { label, files, testFile, transform = (_path, text) => text }) {
  const parent = resolve(tmpdir());
  const scratch = mkdtempSync(join(parent, 'allmeta-replay-'));
  assert.equal(dirname(scratch), parent);
  try {
    const sources = {};
    for (const path of files) {
      const original = read(path);
      const copied = transform(path, original);
      const target = join(scratch, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, copied);
      sources[path] = { sourceLfSha256: sha256(original), replayLfSha256: sha256(copied) };
    }
    const args = ['--test', '--test-reporter=tap'];
    args.push(join(scratch, testFile));
    // Do not inherit the enclosing node:test context or inspect environment variables.
    const result = spawnSync(process.execPath, args, {
      cwd: scratch, env: {}, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    });
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    writeFileSync(join(scratch, 'run.tap'), stdout);
    writeFileSync(join(scratch, 'stderr.txt'), stderr);
    t.diagnostic(JSON.stringify({ label, node: process.version, sources }));
    t.diagnostic(`${label}\n${stdout}${stderr}`);
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    const names = prefix => [...stdout.matchAll(new RegExp(`^${prefix} \\d+ - (.+)$`, 'gm'))].map(m => m[1]);
    return { status: result.status, stdout, stderr, passed: names('ok'), failed: names('not ok') };
  } finally {
    // Only remove the unique directory just created immediately beneath tmpdir.
    assert.equal(dirname(resolve(scratch)), parent);
    rmSync(scratch, { recursive: true, force: true });
  }
}
