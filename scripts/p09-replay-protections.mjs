// Allow-listed old-code replay with fingerprints recorded before this job's fixes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const replay = JSON.parse(read('tests/fixtures/p09-protection-replay.json'));
const suites = ['p09-limit-ready', 'p09-numerical-protections', 'p09-native-parity']
  .map(name => 'hub/shared/tests/unit/' + name + '.test.mjs');
const dependencies = ['tests/fixtures/p09-review-reference.json', 'tests/fixtures/p09-review-provenance.json',
  'tests/fixtures/p09-review-reference.R', 'hub/shared/tests/_kon_data.json'];
const temporary = mkdtempSync(join(tmpdir(), 'p09-protection-replay-'));
const tempRoot = resolve(tmpdir()) + sep;
assert.ok(resolve(temporary).startsWith(tempRoot), 'replay must stay in the temporary directory');
function write(path, source) {
  const target = join(temporary, path);
  assert.ok(resolve(target).startsWith(resolve(temporary) + sep), 'fixture path stays in the replay directory');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}
try {
  for (const file of [...suites, ...dependencies]) write(file, read(file));
  for (const file of replay.files) {
    let source = read(file.path);
    for (const hunk of file.hunks) {
      assert.equal(source.split(hunk.fixed).length, 2, 'unique repair block: ' + file.path);
      source = source.replace(hunk.fixed, () => hunk.original);
    }
    assert.equal(createHash('sha256').update(source).digest('hex'), file.original_lf_sha256, file.path);
    write(file.path, source);
    console.log('Verified supplied-head LF fingerprint:', file.path, file.original_lf_sha256);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...suites],
    { cwd: temporary, encoding: 'utf8' });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  assert.equal(result.status, 1, 'the supplied old code must fail its planted regressions');
  assert.match(result.stdout, /# tests 27\b/);
  assert.match(result.stdout, /# pass 12\b/);
  assert.match(result.stdout, /# fail 15\b/);
  console.log('REPLAY VERIFIED: 15 regressions fail; 12 controls/provenance checks pass.');
  console.log('Fingerprints authenticate the supplied PR head, not the absent base tree.');
} finally {
  assert.ok(resolve(temporary).startsWith(tempRoot), 'cleanup stays in the temporary directory');
  rmSync(temporary, { recursive: true, force: true });
}
