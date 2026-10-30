// Replay the three unchanged PR test files against untouched production sources.
// Default baseline: sibling base/. An optional first argument supplies another
// original tree. The caller must establish its provenance; no reverse patching.
// All test copies, TAP logs and result records are written under system TEMP.
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = resolve(process.argv[2] || join(root, '../base'));
assert.notEqual(baseline, resolve(root), 'The current PR tree is not an original baseline');
const work = mkdtempSync(join(tmpdir(), 'rev-p02-original-'));
const production = ['shared/dose-response.js', 'dose-response-ma/index.html'];
const tests = [
  'dose-response-count-domain.test.mjs',
  'dose-response-count-domain-r-parity.test.mjs',
  'dose-response-hamling-ir-counts.test.mjs'
].map(name => 'hub/shared/tests/unit/' + name);
const fixtures = ['rev-p02-r3-r.json', 'rev-p02-r3-ir-r.json']
  .map(name => 'hub/shared/tests/fixtures/' + name);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const records = [];

function replay(label, source) {
  const tree = join(work, label);
  const provenance = [];
  for (const relative of [...production, ...tests, ...fixtures]) {
    const from = join(production.includes(relative) ? source : root, relative);
    const to = join(tree, relative);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    const bytes = readFileSync(from);
    assert.deepEqual(readFileSync(to), bytes, `Unchanged replay copy: ${relative}`);
    provenance.push({ path: relative, source: from,
      sha256LF: digest(bytes.toString('utf8').replace(/\r\n/g, '\n')) });
  }
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', ...tests.map(file => join(tree, file))],
    { cwd: tree, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(work, label + '.tap'), output);
  if (result.error) throw result.error;
  const outcomes = [...output.matchAll(/^(not ok|ok) \d+ - (P02-R3 .+)$/gm)]
    .map(([, status, name]) => ({ name: name.trim(), passed: status === 'ok' }));
  const total = Number(output.match(/^# tests (\d+)\s*$/m)?.[1]);
  assert.equal(total, 41, `${label}: all 41 assertions must execute; see ${work}`);
  assert.equal(outcomes.length, total, `${label}: missing individual outcomes`);
  assert.doesNotMatch(output, /# (?:SKIP|TODO)\b/, `${label}: assertions may not be skipped`);
  const plants = outcomes.filter(test => /(?:page )?plant:/.test(test.name));
  const controls = outcomes.filter(test => /controls?:/.test(test.name));
  assert.equal(plants.length, 22);
  assert.equal(controls.length, 19);
  const record = { label, source, node: process.version, exit: result.status, provenance, plants, controls };
  records.push(record);
  console.log(JSON.stringify({ label, exit: result.status, plants, controls }));
  writeFileSync(join(work, 'results.json'), JSON.stringify(records, null, 2) + '\n');
  return record;
}

console.log(`Replay artifacts: ${work}`);
const current = replay('current-control', root);
assert.equal(current.exit, 0, 'The unchanged tests must pass on current production');
assert.ok([...current.plants, ...current.controls].every(test => test.passed));
const missing = production.filter(file => !existsSync(join(baseline, file)));
if (missing.length) {
  console.error(JSON.stringify({ status: 'original-baseline-unavailable', baseline, missing,
    message: 'Current-tree harness control passed; no original-code failure is claimed.' }));
  process.exitCode = 2;
} else {
  const original = replay('original', baseline);
  // Report controls separately; their original outcomes are evidence, not assumed.
  const nonDetecting = original.plants.filter(test => test.passed);
  console.log(JSON.stringify({ originalPlantsFailed: 22 - nonDetecting.length,
    originalPlantsPassed: nonDetecting, originalControlsPassed: original.controls.filter(test => test.passed).length }));
  process.exitCode = nonDetecting.length ? 1 : 0;
}
