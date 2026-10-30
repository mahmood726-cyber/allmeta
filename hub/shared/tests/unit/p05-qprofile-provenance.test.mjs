import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { root } from './p05-qprofile-harness.mjs';

const unit = 'hub/shared/tests/unit/';
const syntheticPath = 'validate/p05-synthetic-newlines.json';
const syntheticText = '{\n  "kind": "synthetic line-ending control"\n}\n';
const paths = [
  ...['empty.test.mjs', 'harness.mjs', 'input.json', 'input.csv', 'prepare.mjs',
    'reference.R', 'reference.json', 'replay.mjs'].map(name => unit + 'p05-qprofile-' + name),
  'shared/ma-core.js', 'shared/heterogeneity-ci.js', 'shared/alm-validate.js',
  'heterogeneity/index.html', 'hub/shared/results-export.js',
  'heterogeneity/validate/MANIFEST.json', 'heterogeneity/validate/corpus/corpus.json',
  'heterogeneity/validate/corpus/reference.json'
];
function checkout(eol) {
  const dir = mkdtempSync(join(tmpdir(), 'p05-provenance-'));
  for (const path of paths) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    const text = readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(target, text.replace(/\n/g, eol));
  }
  // Both retained publication JSON files have zero physical newlines, so they
  // cannot expose raw-byte hashing after a CRLF checkout. Add a separate,
  // synthetic multiline entry only to this disposable manifest. Every retained
  // entry and recorded digest/byte count is still checked without modification.
  const manifestPath = join(dir, 'heterogeneity/validate/MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.files.push({ path: syntheticPath, bytes: Buffer.byteLength(syntheticText),
    sha256: createHash('sha256').update(syntheticText).digest('hex') });
  writeFileSync(join(dir, 'heterogeneity', syntheticPath), syntheticText.replace(/\n/g, eol));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2).replace(/\n/g, eol));
  return dir;
}
function provenance(dir, failures = []) {
  // Run the actual 41-test suite, including its numerical and semantic controls.
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', unit + 'p05-qprofile-empty.test.mjs'],
    // An inherited Node test-runner context suppresses nested --test execution.
    // This child needs no environment settings; do not inspect the parent environment.
    { cwd: dir, env: {}, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(dir, 'provenance.log'), output);
  assert.ifError(result.error);
  assert.equal(result.status, failures.length ? 1 : 0, 'Full log: ' + join(dir, 'provenance.log'));
  assert.match(output, /# tests 41\b/);
  assert.match(output, /# cancelled 0\b/);
  assert.match(output, /# skipped 0\b/);
  const actual = [...output.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1].trim());
  assert.deepEqual(actual, failures);
}
async function loadManifest(dir) {
  const replay = await import(pathToFileURL(join(dir, unit + 'p05-qprofile-replay.mjs')).href);
  const loaded = replay.loadPublicationInputs();
  assert.deepEqual(loaded[syntheticPath], JSON.parse(syntheticText));
  return loaded;
}

test('P05 provenance control: LF checkout preserves every recorded hash and byte count', async () => {
  const dir = checkout('\n');
  provenance(dir);
  await loadManifest(dir);
});
test('P05 provenance plant: CRLF checkout preserves every recorded hash and byte count', async () => {
  const dir = checkout('\r\n');
  provenance(dir);
  await loadManifest(dir);
});
test('P05 provenance control: changed input content still fails the exact hash', () => {
  const dir = checkout('\n'), target = join(dir, unit + 'p05-qprofile-input.json');
  writeFileSync(target, readFileSync(target, 'utf8') + ' ');
  provenance(dir, ['P05-R5 control: native R provenance and inputs are exact']);
});
test('P05 provenance control: changed publication content still fails the manifest', async () => {
  const dir = checkout('\n'), target = join(dir, 'heterogeneity/validate/corpus/reference.json');
  const text = readFileSync(target, 'utf8');
  // Change a digit without changing the length, so the hash must catch it.
  writeFileSync(target, text.replace(/[0-9]/, digit => digit === '9' ? '8' : '9'));
  await assert.rejects(loadManifest(dir), { code: 'ERR_ASSERTION' });
});
