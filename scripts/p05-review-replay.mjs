// Reproduce the P05-R3 defect without a git checkout or modifying the work tree.
// This is an explicit mutation, not a claim to possess the historical base tree.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const suite = 'hub/shared/tests/unit/p05-diagnostic-exports.test.mjs';
const files = [suite, 'heterogeneity/index.html', 'shared/ma-core.js',
  'shared/heterogeneity-ci.js', 'hub/shared/analysis-lifecycle.js',
  'hub/shared/results-export.js'];
const additions = [
  '        out.loo = info.loo.map(function(row){return Object.assign({},row);});',
  '        out.baujat = info.baujat.map(function(point){return {label:point.label,x:point.x,y:point.y};});',
];

for (const mutant of [false, true]) {
  const dir = mkdtempSync(join(tmpdir(), mutant ? 'allmeta-p05-omission-' : 'allmeta-p05-head-'));
  for (const file of files) {
    let source = readFileSync(new URL(file, root), 'utf8');
    if (file === 'heterogeneity/index.html' && mutant) {
      for (const line of additions) {
        assert.equal(source.split(line).length, 2, 'Mutation must remove exactly one diagnostic export assignment');
        source = source.replace(line, '');
      }
    }
    const destination = join(dir, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(dir, suite)],
    { encoding: 'utf8', timeout: 60000 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(dir, 'test.tap'), output);
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const cases = [...output.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)]
    .map(([, status, name]) => ({ passed: status === 'ok', name }));
  assert.equal(cases.length, 15, output);
  const plants = cases.filter(c => c.name.startsWith('plant P05-R3:'));
  const controls = cases.filter(c => c.name.startsWith('control:'));
  assert.equal(plants.length, 13);
  assert.equal(controls.length, 2);
  assert.ok(controls.every(c => c.passed), output);
  assert.ok(plants.every(c => c.passed === !mutant), output);
  assert.equal(result.status, mutant ? 1 : 0, output);
  console.log(JSON.stringify({ variant: mutant ? 'planted diagnostic omission' : 'PR head',
    plantsPassed: plants.filter(c => c.passed).length, plantsFailed: plants.filter(c => !c.passed).length,
    controlsPassed: controls.length, log: join(dir, 'test.tap'), cases }, null, 2));
}
