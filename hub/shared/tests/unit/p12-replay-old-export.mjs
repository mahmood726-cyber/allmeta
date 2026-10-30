// Reconstruct the reviewed pre-guard export handlers in memory, then run the
// unchanged P12 assertions against them. No base tree or historical file is
// supplied with this job: this is a planted-defect replay, not an authenticated
// checkout of the PR parent. Only source resolution changes in the temporary test.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('../../../../', import.meta.url);
const source = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8').replace(/\r\n/g, '\n');
const tests = readFileSync(new URL('./p12-refused-export.test.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const statusLine = '        <span data-export-status role="status" aria-live="polite"></span>\n';
const snapshotBlock = `    const status = target.querySelector('[data-export-status]');
    function _snapshot() {
      const r = getResults();
      status.textContent = r == null ? 'No results yet - run the analysis first, then export.' : '';
      return r;
    }
`;
assert.equal(source.split(statusLine).length - 1, 1);
assert.equal(source.split(snapshotBlock).length - 1, 1);
const guard = '      const r = _snapshot();\n      if (r == null) return;\n';
assert.equal(source.split(guard).length - 1, 5, 'all five guarded actions must be present');
let old = source.replace(statusLine, '').replace(snapshotBlock, '');
old = old.replaceAll(guard, '      const r = getResults();\n');
// Restore the old direct serializer calls, including the JSON signing path.
for (const call of ['_toReport(r, opts, false)', '_toReport(r, opts, true)', '_toCSV(r)', '_toMD(r)']) {
  const handler = '      const r = getResults();\n      _download(new Blob([' + call;
  assert.equal(old.split(handler).length - 1, 1);
  old = old.replace(handler, '      _download(new Blob([' + call.replace('(r', '(getResults()'));
}
assert.ok(!old.includes('_snapshot') && !old.includes('data-export-status'));

const rootLine = "const root = new URL('../../../../', import.meta.url);";
const sourceLine = "const exporter = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8');";
assert.equal(tests.split(rootLine).length - 1, 1);
assert.equal(tests.split(sourceLine).length - 1, 1);
const replay = tests.replace(rootLine, `const root = new URL(${JSON.stringify(root.href)});`)
  .replace(sourceLine, `const exporter = ${JSON.stringify(old)};`);
const hash = text => createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({ kind: 'reconstructed pre-guard behavior', currentExporterLF: hash(source),
  reconstructedExporterLF: hash(old), unchangedAssertionsLF: hash(tests) }));

const dir = mkdtempSync(join(tmpdir(), 'p12-old-export-'));
try {
  const file = join(dir, 'p12-refused-export.test.mjs');
  writeFileSync(file, replay);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8' });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status, 1, 'the planted old exporter must fail');
  const controls = [...result.stdout.matchAll(/^ok \d+ - control P12-R3: (.+)$/gm)].map(m => m[1]);
  const failures = [...result.stdout.matchAll(/^not ok \d+ - plant P12-R3: (.+)$/gm)].map(m => m[1]);
  const formats = ['csv', 'md', 'report-md', 'report-txt', 'json'];
  assert.deepEqual(controls, formats.map(action => `${action} exports the successful limit-ma snapshot`));
  assert.deepEqual(failures, formats.flatMap(action => [
    `${action} explains k=2 refusal without download and recovers`,
    `${action} explains an undefined snapshot without download`,
  ]));
  assert.match(result.stdout, /^# tests 15$/m);
  assert.match(result.stdout, /^# pass 5$/m);
  assert.match(result.stdout, /^# fail 10$/m);
  console.log('PASS: unchanged assertions reject all ten old-behavior plants; all five successful-export controls pass.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
