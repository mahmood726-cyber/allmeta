import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('nma/validate/MANIFEST.json'));

// Exercise the real replay entrypoint against temporary checkout copies. The
// recorded manifest, reference values and production files remain untouched.
function replay(lineEnding, tamper = false) {
  const scratch = mkdtempSync(join(tmpdir(), 'nma-p04-eol-'));
  try {
    const put = (file, text) => {
      const target = join(scratch, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    };
    for (const file of ['scripts/nma-p04-replay.mjs', 'shared/nma-multiarm-v1.js',
      'nma/validate/adapter.js', 'nma/validate/MANIFEST.json']) put(file, read(file));
    for (const { path } of manifest.files) {
      let text = read(`nma/${path}`);
      if (tamper && path === 'validate/corpus/reference.json') text += ' ';
      put(`nma/${path}`, text.replace(/\n/g, lineEnding));
    }
    const result = spawnSync(process.execPath, [join(scratch, 'scripts/nma-p04-replay.mjs')],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    assert.ifError(result.error);
    return result;
  } finally {
    // scratch is the exact directory returned by mkdtempSync, never a caller path.
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('P04 replay LF checkout preserves all published checks (control)', () => {
  const result = replay('\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"passed": 410/);
  assert.match(result.stdout, /"paperExample":/);
});

test('P04 replay CRLF checkout verifies the unchanged LF manifest (regression)', () => {
  const result = replay('\r\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"passed": 410/);
  assert.match(result.stdout, /"paperExample":/);
});

test('P04 replay still rejects changed corpus bytes after CRLF conversion (control)', () => {
  const result = replay('\r\n', true);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AssertionError/);
  assert.match(result.stderr, /validate\/corpus\/reference\.json/);
  assert.doesNotMatch(result.stdout, /"corpus":/);
});
