// Re-run the unchanged consumer assertions against the exact supplied PR head.
// Only the two repaired integration blocks are restored, in memory. Hashes
// prevent this evidence run from silently using an approximate historical tree.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const lf = text => text.replace(/\r\n/g, '\n');
const hash = text => createHash('sha256').update(lf(text)).digest('hex');
const baseline = JSON.parse(read('./p12-consumer-baseline.json'));
function restore(source, start, end, original, expectedHash) {
  source = lf(source);
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Integration block markers must exist');
  const restored = source.slice(0, from) + original + source.slice(to);
  assert.equal(hash(restored), expectedHash, 'Reconstructed source must equal the supplied PR head');
  return restored;
}
const html = restore(read('../../../../limit-ma/index.html'),
  '    if (window.MaStudies', '    // ---- module init ----',
  baseline.html_bus, baseline.html_sha256_lf);
const adapter = restore(read('../../../../limit-ma/validate/adapter.js'),
  'function currentState(){', 'function buildScript(s)',
  baseline.adapter_current_state, baseline.adapter_sha256_lf);
assert.equal(hash(read('../../../../shared/ma-studies-v1.js')),
  '416fce0f8ec6432e432c050f9bfc9005d74ac5ad389744198d8530ea6096cb11', 'Use the unchanged shared bus');
const testUrl = new URL('./p12-csv-consumers.test.mjs', import.meta.url);
let suite = readFileSync(testUrl, 'utf8');
assert.equal(hash(suite), '25d563f211409a4ebfe7c225330a28d3529414688f1fc5206c2b8985f56487a8',
  'Use exactly the consumer suite planted before the fixes');
const readDeclaration = "const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');";
assert.equal(suite.split(readDeclaration).length, 2);
const sources = { '../../../../limit-ma/index.html': html, '../../../../limit-ma/validate/adapter.js': adapter };
suite = suite.replace(readDeclaration, () =>
  `const originals = ${JSON.stringify(sources)};\n` +
  `const read = path => Object.hasOwn(originals, path) ? originals[path] : readFileSync(new URL(path, ${JSON.stringify(testUrl.href)}), 'utf8');`);
const directory = mkdtempSync(join(tmpdir(), 'p12-consumer-baseline-'));
const testPath = join(directory, 'baseline.test.mjs');
writeFileSync(testPath, suite);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (result.error) throw result.error;
const output = result.stdout + result.stderr;
const logPath = join(directory, 'baseline.tap');
writeFileSync(logPath, output);
console.log('Baseline page SHA-256 (LF):', hash(html));
console.log('Baseline adapter SHA-256 (LF):', hash(adapter));
console.log('Full TAP output:', logPath);
const outcomes = [...output.matchAll(/^(not )?ok \d+ - (.+)$/gm)]
  .map(match => ({ name: match[2].trim(), failed: !!match[1] }));
for (const row of outcomes) console.log(`OLD ${row.failed ? 'FAIL' : 'PASS'} ${row.name}`);
for (const line of output.split('\n')) if (/^# (tests|pass|fail|skipped|cancelled|todo) /.test(line)) console.log(line);
assert.equal(outcomes.length, 23, 'All original consumer tests must execute');
const expectedFailures = [];
for (const [label, consumers] of [
  ['literal quotes', ['Save']],
  ['comma', ['Save', 'Load']],
  ['numeric newline', ['Save', 'Load', 'live R']],
  ['ordinary multiline label', ['Save', 'Load', 'live R']],
  ['quotes, CRLF and blank lines', ['Save', 'Load', 'live R']],
]) {
  for (const consumer of consumers) {
    const suffix = consumer === 'Save' ? 'preserves exact bus records'
      : consumer === 'Load' ? 'preserves exact page records' : 'exact arrays and count match the page';
    expectedFailures.push(`P12 consumers ${consumer} plant: ${label}: ${suffix}`);
  }
}
expectedFailures.push('P12 consumers plant: malformed quoted record cannot partially overwrite the bus',
  'P12 consumers plant: live R accepts the page header and default-label records');
assert.deepEqual(outcomes.filter(row => row.failed).map(row => row.name).sort(), expectedFailures.sort(),
  'Only the expected defect plants may fail; every control must pass');
assert.equal(result.status, 1, 'The original source must fail the consumer suite');
console.log('Historical calibration PASS: 14 expected plant failures and 9 passing controls/unchanged cases.');

// The existing corpus comparison accepts a page path. Supply the hash-verified
// original from TEMP, without editing a comparison tree or any reference data.
const pagePath = join(directory, 'original-limit-ma.html');
writeFileSync(pagePath, html);
const replayPath = fileURLToPath(new URL('../../../../limit-ma/tests/input-corpus-replay.cjs', import.meta.url));
const replay = spawnSync(process.execPath, [replayPath, pagePath],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (replay.error) throw replay.error;
writeFileSync(join(directory, 'corpus-replay.log'), replay.stdout + replay.stderr);
console.log(replay.stdout + replay.stderr);
assert.equal(replay.status, 0, 'The consumer fixes must preserve every pinned corpus output');
