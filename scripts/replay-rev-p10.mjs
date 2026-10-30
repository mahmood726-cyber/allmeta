// Read-only replay of PR #327 against its authenticated parent, then the unit gate.
// All copied sources and TAP output live in the system temporary directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const suite = 'hub/shared/tests/unit/rev-p10-duplicate-count-headers.test.mjs';
const proof = JSON.parse(readFileSync(join(root, 'hub/shared/tests/fixtures/rev-p10-parent.json'), 'utf8'));
const lf = source => source.replaceAll('\r\n', '\n');
function blob(source) {
  const bytes = Buffer.from(lf(source), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function verify(source, expected, label) {
  assert.equal(blob(source), expected, `LF Git blob mismatch: ${label}`);
}

// These are GitHub blob IDs, not newly fitted expectations or numerical values.
assert.equal(proof.parent, '0dd16ee676da6334b177dce39226e5ffe925bafe');
assert.equal(proof.head, 'b6400e962188d05fbd065b0cda5bc8d28bf0e52a');
verify(proof.parentCsv.source, proof.parentCsv.blob, 'parent CSV');
verify(lf(proof.parentCsv.source).replaceAll('\n', '\r\n'), proof.parentCsv.blob, 'CRLF parent CSV control');
assert.throws(() => verify(proof.parentCsv.source + '// altered\n', proof.parentCsv.blob, 'altered parent CSV'), /LF Git blob mismatch/);
const pinned = [...proof.headFiles, ...proof.unchangedFiles,
  ...proof.parentUnitFiles.map(file => ({ path: `hub/shared/tests/unit/${file.name}`, blob: file.blob }))];
for (const file of pinned) verify(readFileSync(join(root, file.path), 'utf8'), file.blob, file.path);
console.log(`PROVENANCE PASS: parent ${proof.parent}; head ${proof.head}; ${pinned.length} local LF blobs match; CRLF control passes; altered-source plant is rejected.`);

const work = mkdtempSync(join(tmpdir(), 'rev-p10-replay-'));
const parentRoot = join(work, 'parent');
function copy(relativePath, source) {
  const target = join(parentRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, lf(source), 'utf8');
}
copy(suite, readFileSync(join(root, suite), 'utf8'));
copy(proof.parentCsv.path, proof.parentCsv.source);
// The parent/head comparison proves this application file did not change.
copy('mh-peto/index.html', readFileSync(join(root, 'mh-peto/index.html'), 'utf8'));

function run(label, cwd, files) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${label} terminated by signal`);
  writeFileSync(join(work, `${label}.tap`), result.stdout, 'utf8');
  writeFileSync(join(work, `${label}.stderr.txt`), result.stderr, 'utf8');
  const outcomes = [...result.stdout.matchAll(/^(not ok|ok) \d+ - (.+)\r?$/gm)]
    .map(match => ({ pass: match[1] === 'ok', name: match[2].trim() }));
  console.log(`${label}: exit=${result.status}`);
  for (const outcome of outcomes) console.log(`${outcome.pass ? 'PASS' : 'FAIL'} ${outcome.name}`);
  if (result.stderr) process.stderr.write(result.stderr);
  return { ...result, outcomes };
}

const plants = [
  ...['e1', 'n1', 'e2', 'n2'].map(column => `P10-R1 plant: duplicate ${column} count headers refuse the entire CSV`),
  'P10-R1 plant: quoted and padded duplicate headers are refused after trimming',
  'P10-R1 plant: repeated fuzzy count headers cannot overwrite their mapped count',
  ...['paste', 'file'].flatMap(route => [
    `P10-R1 plant: ${route} displays refusal without loading or analyzing overwritten counts`,
    `P10-R1 plant: ${route} can recover from a refused CSV with a unique-header import`,
  ]),
];
const controls = [
  'P10-R1 control: unique canonical count headers preserve both studies without warnings',
  'P10-R1 control: reordered unique headers retain their count associations',
  'P10-R1 control: one fuzzy count header still imports with its mapping warning',
  ...['paste', 'file'].map(route => `P10-R1 control: ${route} imports unique counts and runs analysis once`),
];
console.log(`Replay evidence directory: ${work}`);
const parent = run('parent', parentRoot, [suite]);
assert.equal(parent.status, 1, 'parent must fail assertions, not pass or crash');
assert.equal(parent.outcomes.length, 15, 'all unchanged regression tests must run');
assert.deepEqual(parent.outcomes.filter(outcome => !outcome.pass).map(outcome => outcome.name).sort(), plants.sort());
assert.deepEqual(parent.outcomes.filter(outcome => outcome.pass).map(outcome => outcome.name).sort(), controls.sort());
assert.match(parent.stdout, /^# fail 10\r?$/m);
assert.match(parent.stdout, /^# pass 5\r?$/m);
assert.match(parent.stdout, /^# skipped 0\r?$/m);
assert.match(parent.stdout, /^# cancelled 0\r?$/m);
assert.match(parent.stdout, /^# todo 0\r?$/m);
console.log('PARENT REPLAY PASS: exactly 10 planted-defect failures and 5 passing controls.');

function unitFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? unitFiles(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = unitFiles(join(root, 'hub/shared/tests/unit')).sort();
assert.ok(files.includes(join(root, suite)), 'the focused suite must be included in the combined gate');
const head = run('head-unit-gate', root, files);
assert.equal(head.status, 0, 'combined head unit gate must pass');
for (const name of [...plants, ...controls]) {
  assert.deepEqual(head.outcomes.filter(outcome => outcome.name === name), [{ name, pass: true }]);
}
assert.match(head.stdout, /^# fail 0\r?$/m);
assert.match(head.stdout, /^# skipped 0\r?$/m);
assert.match(head.stdout, /^# cancelled 0\r?$/m);
assert.match(head.stdout, /^# todo 0\r?$/m);
console.log(`HEAD UNIT GATE PASS: ${files.length} files; ${head.outcomes.length} passing tests; no failures or skips.`);
