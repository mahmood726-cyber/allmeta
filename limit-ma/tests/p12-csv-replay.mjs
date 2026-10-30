// Replay the unchanged regression suite against the original loader and the fix.
// The original loader was compared exactly with the page before the production edit.
// Temporary copies stay under the OS temp directory; the working tree is read-only.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suite = 'hub/shared/tests/unit/p12-csv-import.test.mjs';
const original = readFileSync(new URL('./fixtures/p12-original-csv-load.txt', import.meta.url), 'utf8').trimEnd();
const page = readFileSync(join(root, 'limit-ma/index.html'), 'utf8');
const region = /    \/\/ ---- CSV load ----[\s\S]*?\n    };/;
assert.ok(region.test(page), 'Locate the single changed production region');
assert.notEqual(page.match(region)[0].replace(/\r\n/g, '\n'), original.replace(/\r\n/g, '\n'));
const oldRoot = mkdtempSync(join(tmpdir(), 'p12-csv-original-'));
for (const file of [suite, 'hub/shared/csv-upload.js', 'hub/shared/analysis-lifecycle.js',
  'shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
  'limit-ma/plus-opt.js', 'limit-ma/plus-selmodel.js', 'limit-ma/plus.js',
  'limit-ma/plus-ui.js', 'limit-ma/loo-limit.js']) {
  const destination = join(oldRoot, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, file), destination);
}
writeFileSync(join(oldRoot, 'limit-ma/index.html'), page.replace(region, () => original));
console.log('Node ' + process.version);
console.log('Current page SHA-256: ' + createHash('sha256').update(page).digest('hex'));

function replay(label, directory, legacy) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
    cwd: directory, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  const output = result.stdout || '';
  const outcomes = [...output.matchAll(/^(not ok|ok) \d+ - (P12-R1[^\r\n]+)$/gm)];
  console.log('\n' + label + ' (exit ' + result.status + ')');
  for (const [, status, name] of outcomes) console.log((status === 'ok' ? 'PASS ' : 'FAIL ') + name);
  console.log(output.split(/\r?\n/).filter(line => /^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
  const expected = outcomes.length === 16 && outcomes.every(([, status, name]) =>
    (status === 'ok') === (!legacy || name.startsWith('P12-R1 control:')));
  if (!expected || result.status !== (legacy ? 1 : 0)) {
    // Keep unexpected diagnostics small enough for wrapper feedback to retain all statuses.
    console.log((result.stderr || '') + output.slice(-5000));
  }
  assert.equal(outcomes.length, 16, label + ': every named test ran');
  assert.equal(result.status, legacy ? 1 : 0, label + ': exit status');
  assert.ok(expected, label + ': all controls pass; defects fail only on the original loader');
  for (const field of ['cancelled', 'skipped', 'todo']) assert.match(output, new RegExp('^# ' + field + ' 0$', 'm'));
}

replay('Original loader', oldRoot, true);
replay('Fixed loader', root, false);
console.log('\nConfirmed: 12 planted defects fail on the original loader and pass on the fix; all 4 controls pass on both.');
