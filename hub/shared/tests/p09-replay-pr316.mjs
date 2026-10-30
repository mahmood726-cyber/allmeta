// Reinstate only the captured PR-head reader in a temporary test tree.
// The original eight tests and all controls must pass; the fifteen R1 plants must fail.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const temporary = mkdtempSync(path.join(tmpdir(), 'p09-pr316-replay-'));
const testFile = 'hub/shared/tests/unit/p09-csv-records.test.mjs';
const files = [testFile, 'hub/shared/tests/fixtures/p09-pr316-csv-records.js',
  'hub/shared/csv-upload.js', 'hub/shared/analysis-lifecycle.js', 'shared/ma-core.js',
  'proportion-ma/index.html', 'proportion-ma/plus-core.js', 'proportion-ma/plus-ui.js',
  'proportion-ma/validate/corpus/corpus.json'];
for (const file of files) {
  let source = read(file);
  if (file === 'proportion-ma/plus-core.js') {
    // Compare/slice normalized source bytes so LF and CRLF checkouts replay identically.
    source = source.replaceAll('\r\n', '\n');
    const fixture = read('hub/shared/tests/fixtures/p09-pr316-csv-records.js').replaceAll('\r\n', '\n');
    const start = source.indexOf('  function csvRecords(text) {');
    const end = source.indexOf('  function csvText(rows) {', start);
    const capturedStart = fixture.indexOf('  function csvRecords(text) {');
    assert.ok(start >= 0 && end > start && capturedStart >= 0);
    source = source.slice(0, start) + fixture.slice(capturedStart) + source.slice(end);
  }
  const target = path.join(temporary, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(temporary, testFile)], {
  cwd: temporary, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60000,
});
assert.ifError(result.error);
const output = result.stdout + result.stderr;
const log = path.join(temporary, 'baseline.tap');
writeFileSync(log, output);
console.log('Captured PR-head reader replay; full TAP log:', log);
const lines = output.split(/\r?\n/);
for (const line of lines.filter(line => /^(?:not ok|ok) \d+ - |^# (?:tests|pass|fail|cancelled|skipped|todo) /.test(line))) console.log(line);
const failures = lines.filter(line => /^not ok \d+ - /.test(line));
assert.equal(result.status, 1, 'the captured defective reader must fail the regression tests');
assert.equal(failures.length, 15, 'all fifteen R1 plants must detect the defective reader');
assert.ok(failures.every(line => line.includes('P09-R1 plant:')), 'no control or original test may fail');
assert.match(output, /^# tests 25$/m);
assert.match(output, /^# pass 10$/m);
assert.match(output, /^# fail 15$/m);
assert.match(output, /^# cancelled 0$/m);
assert.match(output, /^# skipped 0$/m);
assert.match(output, /^# todo 0$/m);
console.log('Replay verified: fifteen expected R1 failures; ten passing tests/controls. This is not a passing production gate.');
