// Replay the config regression against identical tests in isolated TEMP trees.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const runnerName = 'p08-browser-replay.mjs';
const testName = 'p08-browser-config.test.mjs';
const source = readFileSync(new URL(runnerName, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tests = readFileSync(new URL(testName, import.meta.url));
const currentImport = 'import playwrightTest from ${JSON.stringify(pathToFileURL(playwright).href)};\nconst { defineConfig } = playwrightTest;';
const oldImport = 'import { defineConfig } from ${JSON.stringify(pathToFileURL(playwright).href)};';
assert.equal(source.split(currentImport).length - 1, 1, 'Exactly one repaired config import must exist');
const output = mkdtempSync(join(tmpdir(), 'p08-config-replay-'));
console.log(`Config replay artifacts: ${output}`);
const expected = [
  'P08 runner plant: generated config loads the resolved CommonJS Playwright entry',
  'P08 runner control: config preserves all four suites and execution settings',
];
for (const [label, runner] of [['old-import', source.replace(currentImport, oldImport)], ['current', source]]) {
  const tree = join(output, label);
  mkdirSync(tree);
  writeFileSync(join(tree, runnerName), runner);
  writeFileSync(join(tree, testName), tests);
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testName], {
    cwd: tree, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  writeFileSync(join(output, label + '.tap'), child.stdout || '');
  writeFileSync(join(output, label + '.stderr'), child.stderr || '');
  if (child.error) throw child.error;
  const outcomes = [...child.stdout.matchAll(/^(not )?ok \d+ - (.+)$/gm)]
    .map(match => ({ name: match[2].replace(/\r$/, ''), pass: !match[1] }));
  console.log(`${label}: exit ${child.status}`);
  for (const result of outcomes) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
  assert.deepEqual(outcomes.map(result => result.name), expected, 'Both tests must execute exactly once');
  assert.deepEqual(outcomes.map(result => result.pass), label === 'current' ? [true, true] : [false, true]);
  assert.equal(child.status, label === 'current' ? 0 : 1);
}
console.log('Verified: original config import = failing plant / passing control; current = both PASS.');
