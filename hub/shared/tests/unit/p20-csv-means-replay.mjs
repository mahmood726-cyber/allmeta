// Run from wt/: node hub/shared/tests/unit/p20-csv-means-replay.mjs
// Reconstruct defects only in an OS temporary directory; never edit the source tree.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const unit = 'hub/shared/tests/unit/';
const suite = `${unit}p20-csv-means.test.mjs`;
const fixture = `${unit}p20-csv-means-input.csv`;
const converter = 'effect-size-converter/index.html';
const files = [suite, fixture, converter, `${unit}p20-csv-means-reference.json`,
  'shared/effect-size-accuracy.js', 'hub/shared/csv-upload.js'];
const sources = new Map(files.map(file => [file, readFileSync(new URL(file, root))]));
const html = sources.get(converter).toString('utf8');
const guard = /        \/\/ Validate before coercion: Number\(null\) would turn a missing mean into zero\.\r?\n[\s\S]*?        \}\);\r?\n/g;
const guards = [...html.matchAll(guard)];
assert.equal(guards.length, 1, 'remove exactly the existing P20 validation guard');
assert.equal(guards[0][0].trimEnd().split(/\r?\n/).length, 8);
assert.ok(guards[0][0].includes("throw new Error(field + ' must be a finite number.');"));

const expectedPlanted = ['m1', 'm2'].flatMap(field =>
  ['blank', 'NA', 'nonnumeric', 'overflow', 'whitespace'].map(label =>
    `planted P20-R1: CSV ${field} ${label} is rejected`));
expectedPlanted.push('planted P20-R1: direct missing or blank means are rejected',
  'planted P20-R1: invalid first row does not fall through to a valid row');
const provenanceTest = 'control P20-R1: R fixture records versions and the exact input file';
const temp = mkdtempSync(join(tmpdir(), 'p20-replay-'));

function run(label, edits, expectedFailures) {
  const dir = join(temp, label);
  for (const [file, bytes] of sources) {
    const target = join(dir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, edits.get(file) ?? bytes);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite],
    { cwd: dir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const output = result.stdout + result.stderr;
  const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
  const passes = [...output.matchAll(/^ok \d+ - (.+)$/gm)].map(match => match[1]);
  console.log(JSON.stringify({ scenario: label, exitCode: result.status,
    passed: passes.length, failed: failures.length, failures, passingTests: passes }, null, 2));
  assert.equal(result.status, expectedFailures.length ? 1 : 0, output);
  assert.deepEqual(failures.sort(), [...expectedFailures].sort(), output);
  assert.equal(passes.length + failures.length, 39, output);
}

try {
  run('guard-removed', new Map([[converter, html.replace(guard, '')]]), expectedPlanted);
  const lf = sources.get(fixture).toString('utf8').replace(/\r\n/g, '\n');
  run('crlf-input', new Map([[fixture, lf.replace(/\n/g, '\r\n')]]), [provenanceTest]);
  run('unchanged-head', new Map(), []);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
