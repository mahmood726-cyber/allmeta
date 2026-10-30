// Re-run the unmodified regression suite with the supplied PR-head parser.
// Only temporary files are written; this is not a reconstruction of main/base.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const snapshot = JSON.parse(readFileSync(new URL('tests/fixtures/p10-pr396-parser-before.json', root), 'utf8'));
const before = snapshot.parser.replace(/\r\n/g, '\n');
assert.equal(snapshot.lineEndings, 'LF');
assert.equal(createHash('sha256').update(before, 'utf8').digest('hex'), snapshot.sha256);
const html = readFileSync(new URL('mh-peto/index.html', root), 'utf8').replace(/\r\n/g, '\n');
const start = html.indexOf('    function parseInput(text) {');
const end = html.indexOf('    // Rows only when the whole input is valid;', start);
assert.ok(start >= 0 && end > start, 'parser boundaries must exist');
const tests = readFileSync(new URL('unit/p10-review-defects.test.mjs', import.meta.url));
const temporaryParent = realpathSync(tmpdir());
const temporaryRoot = mkdtempSync(join(temporaryParent, 'p10-pr396-before-'));
try {
  const pageDirectory = join(temporaryRoot, 'mh-peto');
  const testDirectory = join(temporaryRoot, 'hub', 'shared', 'tests', 'unit');
  mkdirSync(pageDirectory, { recursive: true });
  mkdirSync(testDirectory, { recursive: true });
  writeFileSync(join(pageDirectory, 'index.html'), html.slice(0, start) + before + html.slice(end));
  const testPath = join(testDirectory, 'p10-review-defects.test.mjs');
  writeFileSync(testPath, tests);
  console.log(`Before-fix parser SHA-256 (LF): ${snapshot.sha256}; Node ${process.version}`);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath], {
    cwd: temporaryRoot, encoding: 'utf8', timeout: 120000,
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status, 1, 'the supplied pre-fix parser must fail the regression suite');
  const failures = Array.from(result.stdout.matchAll(/^not ok \d+ - (.+)\r?$/gm), match => match[1].trim());
  const expectedFailures = ['comma', 'tab', 'semicolon'].flatMap(delimiter => [
    `plant P10-R2: ${delimiter} named legacy rows preserve a quoted first count`,
    `plant P10-R2: ${delimiter} explicit legacy header determines column order`,
  ]);
  assert.deepEqual(failures, expectedFailures, 'exactly the six planted regressions must fail');
  assert.match(result.stdout, /^# tests 17\r?$/m);
  assert.match(result.stdout, /^# pass 11\r?$/m);
  assert.match(result.stdout, /^# fail 6\r?$/m);
  assert.match(result.stdout, /^# skipped 0\r?$/m);
  console.log('BEFORE REPLAY PASS: six planted defects fail; all eleven existing tests and controls pass.');
} finally {
  assert.equal(dirname(realpathSync(temporaryRoot)), temporaryParent, 'cleanup must stay inside the temporary directory');
  rmSync(temporaryRoot, { recursive: true, force: true });
}
