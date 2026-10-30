// Exercise the existing numerical/provenance assertions unchanged under both
// checkout encodings, planting line endings only in temporary read wrappers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const suiteURL = new URL('./p07-translation.test.mjs', import.meta.url);
const suite = readFileSync(suiteURL, 'utf8');
for (const crlf of [false, true]) {
  test(`${crlf ? 'plant' : 'control'} P09 review: P07 provenance hashes LF bytes with ${crlf ? 'CRLF' : 'LF'} input`, () => {
    const scratch = mkdtempSync(join(tmpdir(), 'p09-provenance-'));
    const readImport = "import { readFileSync } from 'node:fs';";
    assert.equal(suite.split(readImport).length, 2);
    const reader = `import { readFileSync as nativeRead } from 'node:fs';
const readFileSync = (path, ...args) => {
  const value = nativeRead(path, ...args);
  if (new URL(path).pathname.endsWith('/p07-translation-input.json')) {
    const text = value.toString().replace(/\\r?\\n/g, ${JSON.stringify(crlf ? '\r\n' : '\n')});
    return Buffer.isBuffer(value) ? Buffer.from(text) : text;
  }
  return value;
};`;
    const file = join(scratch, 'provenance.test.mjs');
    writeFileSync(file, suite.replace(readImport, reader).replaceAll('import.meta.url', JSON.stringify(suiteURL.href)));
    // A nested --test process must not inherit the parent's test-runner context:
    // Node otherwise refuses the recursive run and returns no TAP or test cases.
    // This child uses absolute paths and needs no inherited environment values.
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
      encoding: 'utf8', env: { TEMP: scratch, TMP: scratch }
    });
    assert.ifError(run.error);
    writeFileSync(join(scratch, 'result.tap'), run.stdout + run.stderr);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /# tests 16\b/);
    assert.match(run.stdout, /# fail 0\b/);
  });
}

const replayURL = new URL('./p07-replay.mjs', import.meta.url);
const replay = readFileSync(replayURL, 'utf8');
for (const crlf of [false, true]) {
  test(`${crlf ? 'plant' : 'control'} P09 review: P07 corpus replay hashes LF bytes with ${crlf ? 'CRLF' : 'LF'} input`, () => {
    const scratch = mkdtempSync(join(tmpdir(), 'p09-corpus-provenance-'));
    const readImport = "import { readFileSync } from 'node:fs';";
    assert.equal(replay.split(readImport).length, 2);
    const reader = `import { readFileSync as nativeRead } from 'node:fs';
const readFileSync = (path, ...args) => {
  const value = nativeRead(path, ...args);
  const text = value.toString().replace(/\\r?\\n/g, ${JSON.stringify(crlf ? '\r\n' : '\n')});
  return Buffer.isBuffer(value) ? Buffer.from(text) : text;
};`;
    const file = join(scratch, 'replay.mjs');
    writeFileSync(file, replay.replace(readImport, reader).replaceAll('import.meta.url', JSON.stringify(replayURL.href)));
    const run = spawnSync(process.execPath, [file], { encoding: 'utf8' });
    assert.ifError(run.error);
    writeFileSync(join(scratch, 'result.log'), run.stdout + run.stderr);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.checks, 308);
    assert.equal(result.passed, 308);
    assert.deepEqual(result.failed, []);
    const source = readFileSync(new URL('../../../../shared/multilevel-reml.js', replayURL), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(result.sourceSha256, createHash('sha256').update(source).digest('hex'));
  });
}
