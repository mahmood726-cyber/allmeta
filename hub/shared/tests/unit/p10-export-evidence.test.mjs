import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../', import.meta.url);
const lf = text => text.replace(/\r\n/g, '\n');
const source = lf(readFileSync(new URL('hub/shared/results-export.js', root), 'utf8'));
const suite = lf(readFileSync(new URL('./p10-results-export.test.mjs', import.meta.url), 'utf8'));
const guard = `        if (r == null) {
          status.textContent = 'Run a successful analysis before exporting results.';
          return;
        }
`;
const sha = text => createHash('sha256').update(lf(text)).digest('hex');
const actions = ['csv', 'json', 'md', 'report-md', 'report-txt'];
const plants = actions.flatMap(action => [
  `P10-R3 plant: ${action} refuses results cleared by an invalid mh-peto run`,
  `P10-R3 plant: ${action} refuses undefined before signing or downloading`,
]).concat([
  'P10-R3 plant: CSV refuses a run with fewer than two studies',
  'P10-R3 plant: a successful retry clears the explanation and exports fresh results',
]);
const controls = [
  'P10-R3 control: an invalid mh-peto run clears previous results',
  ...actions.map(action => `P10-R3 control: ${action} preserves valid content and download metadata`),
  'P10-R3 control: valid mh-peto CSV and JSON contain current results',
  'P10-R3 control: valid JSON still obtains a TruthCert receipt',
  'P10-R3 control: an empty object retains its existing CSV behavior',
];

function replay(exporter, label, t) {
  const dir = mkdtempSync(join(tmpdir(), 'p10-export-' + label + '-'));
  const exporterURL = pathToFileURL(join(dir, 'results-export.js')).href;
  const rootLine = "const root = new URL('../../../../', import.meta.url);";
  const load = "source('hub/shared/results-export.js')";
  assert.equal(suite.split(rootLine).length, 2, 'exactly one test root');
  assert.equal(suite.split(load).length, 2, 'exactly one exporter load');
  // Relocate only the two source paths. All 21 tests and assertions stay intact.
  const relocated = suite.replace(rootLine, `const root = new URL(${JSON.stringify(root.href)});`)
    .replace(load, `readFileSync(new URL(${JSON.stringify(exporterURL)}), 'utf8')`);
  writeFileSync(join(dir, 'results-export.js'), exporter);
  const entry = join(dir, 'p10-results-export.test.mjs');
  writeFileSync(entry, relocated);
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', entry], {
    // Inheriting the parent test runner's context makes Node skip this suite
    // as a recursive run. Absolute paths need no inherited environment.
    env: {},
    encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  });
  const log = join(dir, 'replay.tap');
  writeFileSync(log, (run.stdout || '') + (run.stderr || ''));
  t.diagnostic(`${label}: LF source SHA-256 ${sha(exporter)}; raw log ${log}`);
  if (run.error) throw run.error;
  assert.equal(run.signal, null, run.stdout + run.stderr);
  const passed = [...run.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map(m => m[1]);
  const failed = [...run.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  for (const name of passed) t.diagnostic('PASS ' + name);
  for (const name of failed) t.diagnostic('FAIL ' + name);
  return { status: run.status, passed, failed };
}

test('P10 evidence: removing the null guard fails all twelve plants and preserves all nine controls', t => {
  assert.equal(source.split(guard).length, 2, 'mutate exactly the reviewed null guard');
  // A reconstructed defect, NOT a claimed historical checkout: no base tree was supplied.
  const run = replay(source.replace(guard, ''), 'missing-null-guard', t);
  assert.equal(run.status, 1);
  assert.deepEqual(run.failed.sort(), [...plants].sort());
  assert.deepEqual(run.passed.sort(), [...controls].sort());
});

test('P10 evidence control: the unchanged exporter passes all twenty-one original assertions', t => {
  const run = replay(source, 'current', t);
  assert.equal(run.status, 0);
  assert.deepEqual(run.failed, []);
  assert.deepEqual(run.passed.sort(), [...plants, ...controls].sort());
});
