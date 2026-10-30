import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const unit = 'hub/shared/tests/unit/';
const files = ['nma-inconsistency/index.html', 'nma-inconsistency/plus-core.js',
  ...['p16-dl-harness.mjs', 'p16-dl-scale.test.mjs', 'p16-dl-old-code.mjs',
    'p16-dl-replay.mjs', 'p16-dl-input.json', 'p16-dl-input.R', 'p16-dl-reference.R',
    'p16-dl-reference.json'].map(f => unit + f)];

function checkout(t, newline, replay = false) {
  const dir = mkdtempSync(join(tmpdir(), 'p16-clean-checkout-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const names = [...files];
  // Keep the fixture compatible with the delivered helpers and their repair.
  for (const file of ['p16-dl-source.mjs', 'p16-dl-provenance.mjs']) {
    try { readFileSync(new URL(unit + file, root)); names.push(unit + file); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (replay) names.push('nma-inconsistency/validate/corpus/corpus.json',
    'nma-inconsistency/validate/plus/corpus.json');
  for (const name of names) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    const content = readFileSync(new URL(name, root), 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(target, content.replace(/\n/g, newline));
  }
  return dir;
}

function run(dir, file) {
  const r = spawnSync(process.execPath, [join(dir, unit + file)],
    { cwd: dir, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error) throw r.error;
  writeFileSync(join(dir, file + '.log'), r.stdout + r.stderr);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
}

for (const [label, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`plant P16-R4: ${label} checkout reproduces exactly four DL failures and twelve passing controls`, t => {
    assert.match(run(checkout(t, newline), 'p16-dl-old-code.mjs'),
      /four planted failures and passed all 12 controls/);
  });
}

test('plant P16-R5: a fresh checkout creates and compares its own verified old/new snapshots', t => {
  const output = run(checkout(t, '\n', true), 'p16-dl-replay.mjs');
  assert.match(output, /PASS: available numerical results unchanged/);
  assert.match(output, /"coreTextCases":77/);
  assert.match(output, /"plusCases":153/);
});

test('control P16-R4: recorded hashes and numerical tolerance remain unchanged', () => {
  const ref = JSON.parse(readFileSync(new URL(unit + 'p16-dl-reference.json', root), 'utf8'));
  assert.equal(ref.provenance.input_md5, '43b55a329fefce35615798fd79ee8c9e');
  assert.equal(ref.provenance.input_r_md5, '112507478f579933b4bb2dad92585d2e');
  assert.equal(ref.provenance.script_md5, 'd295606cd03a6bd218e33dbac1ce17a7');
  assert.match(readFileSync(new URL(unit + 'p16-dl-scale.test.mjs', root), 'utf8'), /const tolerance = 1e-9;/);
});
