// Replay the unchanged regression assertions against the pre-fix source in TEMP.
// Hashes were captured before editing either production file in pass 2.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const testFile = 'hub/shared/tests/unit/p18-r3-correlation-inputs.test.mjs';
const originalHashes = {
  'multivariate-ma/index.html': '521b768d4bb3b7c3054c2d08ccec376acd29e469a844cc9cd1a9ac45f98f87ee',
  'multivariate-ma/plus-ui.js': 'e67e5bfa1f4674948e3c53030a113f82ef34a8c93aeee368556c049b8f1394d5'
};
function replaceExactly(source, before, after, count) {
  assert.equal(source.split(before).length - 1, count, `replay source anchor: ${before}`);
  return source.split(before).join(after);
}
const temporaryRoot = resolve(tmpdir());
const scratch = mkdtempSync(join(temporaryRoot, 'p18-r3-baseline-'));
assert.equal(dirname(resolve(scratch)), temporaryRoot);
try {
  for (const name of [testFile, 'shared/multivariate-ma.js', 'multivariate-ma/plus.js',
    'multivariate-ma/index.html', 'multivariate-ma/plus-ui.js']) {
    let source = readFileSync(new URL(name, root), 'utf8');
    if (name === 'multivariate-ma/index.html') {
      source = replaceExactly(source, 'rw = number(el("f-rhow").value)',
        'rw = Number(el("f-rhow").value)', 1);
    } else if (name === 'multivariate-ma/plus-ui.js') {
      source = replaceExactly(source,
        '  function number(s) { return s.trim() ? Number(s) : NaN; }\r\n', '', 1);
      for (const id of ['plus-from', 'plus-to', 'plus-step']) {
        source = replaceExactly(source, `number(el('${id}').value)`, `Number(el('${id}').value)`, 2);
      }
    }
    if (originalHashes[name]) {
      assert.equal(createHash('sha256').update(source).digest('hex'), originalHashes[name],
        `byte-identical pre-fix source: ${name}`);
      console.log(`Verified original SHA-256: ${name}`);
    }
    const target = join(scratch, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
    cwd: scratch, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  console.log('Pre-fix replay: failure is expected; assertions and controls are unchanged.');
  for (const line of (result.stdout || '').split(/\r?\n/)) {
    if (/^(?:not ok |ok |# (?:tests |suites |pass |fail |cancelled |skipped |todo ))/.test(line)) {
      console.log(line);
    }
  }
  if (result.stderr) console.error(result.stderr);
  if (result.error) throw result.error;
  console.log(`Original-code test process exit: ${result.status}`);
  process.exitCode = result.status ?? 1;
} finally {
  // Only remove this newly created directory, whose parent was verified above.
  assert.equal(dirname(resolve(scratch)), temporaryRoot);
  rmSync(scratch, { recursive: true, force: true });
}
