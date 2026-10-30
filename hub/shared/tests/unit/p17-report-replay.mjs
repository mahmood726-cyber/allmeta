import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const testPath = 'hub/shared/tests/unit/p17-report-methods.test.mjs';
const files = ['correlation-ma/index.html', 'correlation-ma/plus-ui.js',
  'correlation-ma/plus-core.js', 'shared/ma-core.js', 'hub/shared/results-export.js', testPath];
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');

// A controlled reconstruction of the reviewed defect, not a historical checkout.
// Only the two methods callbacks are removed. Original assertions stay intact.
export function replayReports(plant = false) {
  const directory = mkdtempSync(join(tmpdir(), 'p17-report-replay-'));
  const provenance = [];
  for (const path of files) {
    const original = readFileSync(new URL(path, root));
    let bytes = original;
    if (plant && ['correlation-ma/index.html', 'correlation-ma/plus-ui.js'].includes(path)) {
      const source = original.toString('utf8');
      const callback = /,\r?\n[ \t]+methods: function \(\) \{[\s\S]*?\r?\n[ \t]+\}(?=\r?\n[ \t]+\}\);)/g;
      assert.equal([...source.matchAll(callback)].length, 1, path + ': exactly one callback to remove');
      bytes = Buffer.from(source.replace(callback, ''));
      assert.notEqual(hash(bytes), hash(original));
    }
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    provenance.push({ path, original_sha256: hash(original), replay_sha256: hash(bytes) });
  }
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath], {
    cwd: directory, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
    // Inheriting the parent test-runner context makes Node skip this child run.
    // An absolute executable and an empty environment need no host variables.
    env: {}, windowsHide: true,
  });
  if (run.error) throw run.error;
  writeFileSync(join(directory, 'results.tap'), run.stdout);
  writeFileSync(join(directory, 'stderr.txt'), run.stderr);
  writeFileSync(join(directory, 'provenance.json'), JSON.stringify({
    mode: plant ? 'reconstructed missing-methods defect' : 'unchanged PR head',
    hash_encoding: 'UTF-8 with CRLF normalized to LF',
    node: process.version, status: run.status, files: provenance,
  }, null, 2) + '\n');
  return { ...run, directory };
}

export function assertReplay(run, plant = false) {
  const diagnostic = 'Replay evidence: ' + run.directory + '\n' + run.stdout + '\n' + run.stderr;
  assert.equal(run.status, plant ? 1 : 0, diagnostic);
  const outcomes = [...run.stdout.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)];
  assert.equal(outcomes.length, 15, diagnostic);
  assert.equal(outcomes.filter(([, state]) => state === 'not ok').length, plant ? 10 : 0, diagnostic);
  for (const [, state, name] of outcomes) {
    assert.match(name, /^(plant P17-R2:|control:)/, diagnostic);
    assert.equal(state, plant && name.startsWith('plant P17-R2:') ? 'not ok' : 'ok', diagnostic);
  }
  for (const key of ['cancelled', 'skipped', 'todo']) assert.match(run.stdout, new RegExp('^# ' + key + ' 0$', 'm'), diagnostic);
}
