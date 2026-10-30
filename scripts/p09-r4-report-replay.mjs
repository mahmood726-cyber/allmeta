// Reconstruct the pre-fix report wiring without git or changes to the source tree.
// The historical commit/tree is not supplied: this removes only the reviewed
// 17-line report configuration, then runs the ORIGINAL assertions in both modes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const html = read('proportion-ma/index.html');
const suite = read('hub/shared/tests/unit/p09-r4-report-methods.test.mjs');
const start = html.indexOf("      description: 'Proportion meta-analysis of single-arm studies.',\n");
assert.ok(start >= 0, 'the reviewed report configuration must be present');
const end = html.indexOf('      getResults:', start);
const insertion = html.slice(start, end);
assert.equal(insertion.split('\n').length - 1, 17, 'remove exactly the reviewed 17 lines');
assert.match(insertion, /methods: function \(\)/);
const before = html.slice(0, start) + html.slice(end);
const scratch = mkdtempSync(join(tmpdir(), 'p09-report-replay-'));
const hash = text => createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({ kind: 'reconstructed pre-fix wiring; not a historical checkout',
  sourceLF: hash(html), preFixLF: hash(before), removedLF: hash(insertion),
  unchangedAssertionsLF: hash(suite), logs: scratch }));

const observed = new Map();
for (const [name, source, expectedPlantsPass] of [['before', before, false], ['after', html, true]]) {
  const rootLine = "const root = new URL('../../../../', import.meta.url);";
  const htmlLine = "const html = read('proportion-ma/index.html');";
  assert.equal(suite.split(rootLine).length, 2);
  assert.equal(suite.split(htmlLine).length, 2);
  const script = suite.replace(rootLine, `const root = new URL(${JSON.stringify(root.href)});`)
    .replace(htmlLine, `const html = ${JSON.stringify(source)};`);
  const file = join(scratch, `${name}.test.mjs`);
  writeFileSync(file, script);
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8' });
  assert.ifError(run.error);
  writeFileSync(join(scratch, `${name}.tap`), run.stdout + run.stderr);
  const outcomes = [...run.stdout.matchAll(/^(not ok|ok) \d+ - ((?:plant|control) P09-R4: .+)$/gm)];
  assert.equal(outcomes.length, 16, 'all original tests must execute');
  const plants = outcomes.filter(match => match[2].startsWith('plant'));
  const controls = outcomes.filter(match => match[2].startsWith('control'));
  assert.equal(plants.length, 14);
  assert.equal(controls.length, 2);
  for (const [, outcome, title] of plants) assert.equal(outcome, expectedPlantsPass ? 'ok' : 'not ok', title);
  for (const [, outcome, title] of controls) assert.equal(outcome, 'ok', title);
  assert.equal(run.status, expectedPlantsPass ? 0 : 1);
  observed.set(name, new Map(outcomes.map(([, outcome, title]) => [title, outcome])));
}

// The wrapper keeps only the end of long output. Keep every test name and its
// observed transition visible, with full TAP retained in the temporary logs.
assert.deepEqual([...observed.get('before').keys()], [...observed.get('after').keys()]);
for (const [title, outcome] of observed.get('before')) {
  console.log(`${outcome === 'ok' ? 'PASS' : 'FAIL'} -> PASS | ${title}`);
}
console.log('VERIFIED: before 14 failed / 2 passed; after 16 passed / 0 failed; unchanged assertions.');
