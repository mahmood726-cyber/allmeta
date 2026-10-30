// Replay the unchanged archived checker in a temporary tree with exact pinned
// LF evidence bytes. Refuse anything that cannot reproduce the existing pins.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validation = 'correlation-ma/validate/';
const manifest = JSON.parse(read(validation + 'MANIFEST-plus.json'));
const tempParent = realpathSync(tmpdir());
const replayRoot = mkdtempSync(join(tempParent, 'p17-correlation-replay-'));
const sourceHashes = new Map();
try {
  for (const path of ['shared/ma-core.js', 'correlation-ma/plus-core.js',
    validation + 'plus-check.cjs', validation + 'MANIFEST-plus.json']) {
    sourceHashes.set(path, sha256(read(path)));
    const target = join(replayRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(new URL(path, root), target);
  }
  for (const file of manifest.files) {
    const path = validation + file.path;
    const original = read(path);
    sourceHashes.set(path, sha256(original));
    const bytes = sha256(original) === file.sha256 ? original :
      Buffer.from(original.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(sha256(bytes), file.sha256, `${path}: exact existing SHA-256 pin`);
    assert.equal(bytes.length, file.bytes, `${path}: existing byte-count pin`);
    assert.equal(bytes.includes(13), false, `${path}: pinned LF bytes`);
    const target = join(replayRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    console.log(`${file.path}: ${original.equals(bytes) ? 'already pinned' : 'CRLF restored to exact existing LF pin in temporary copy'}`);
  }
  const args = [join(replayRoot, validation, 'plus-check.cjs'), '--rjson',
    join(replayRoot, validation, 'plus-corpus/rscript-results.json')];
  const run = extra => spawnSync(process.execPath, [...args, ...extra], {
    cwd: replayRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  });
  const control = run([]);
  if (control.error) throw control.error;
  process.stdout.write(control.stdout);
  process.stderr.write(control.stderr);
  assert.equal(control.status, 0, 'unchanged archived checker control');
  const count = manifest.plus_check.checks;
  assert.ok(control.stdout.includes(`PLUS-CHECK: ${count}/${count} checks pass`),
    'retain the exact archived check count');
  const mutant = run(['--tamper']);
  if (mutant.error) throw mutant.error;
  assert.equal(mutant.status, 1, 'archived built-in planted defect must fail');
  assert.match(mutant.stdout, /^FAIL /m);
  console.log('Archived planted-defect control: ' + mutant.stdout.split(/\r?\n/).find(s => s.startsWith('PLUS-CHECK: ')));
  console.log(mutant.stdout.split(/\r?\n/).find(s => s.startsWith('FAIL ')));
  for (const [path, hash] of sourceHashes) assert.equal(sha256(read(path)), hash, `${path}: source unchanged`);
} finally {
  // Verify the exact absolute temporary target before recursive removal.
  assert.equal(dirname(realpathSync(replayRoot)), tempParent);
  rmSync(replayRoot, { recursive: true, force: true });
}
