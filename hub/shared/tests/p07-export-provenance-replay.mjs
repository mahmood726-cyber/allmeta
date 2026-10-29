// Reproduce the VM setup issue and rerun the unchanged assertions against the
// pre-fix serialization code in a disposable copy. Never modify the work tree.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

// Observe both sides of the exact external deletion used by the old harness.
const sandbox = {};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(read('shared/build-info.js'), context);
const deleted = delete context.AlmBuildInfo;
const inside = vm.runInContext('window.AlmBuildInfo', context);
console.log('P07-R4 VM deletion diagnostic: ' + JSON.stringify({
  node: process.version, deleted, outsideType: typeof context.AlmBuildInfo,
  insideType: typeof inside, insideVersion: inside?.version,
}));

const files = [
  'multilevel-ma/index.html', 'multilevel-ma/plus-engine.js', 'multilevel-ma/plus-ui.js',
  'shared/build-info.js', 'shared/ma-core.js', 'shared/multilevel-reml.js', 'shared/stats-qt.js',
  'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js',
  'hub/shared/tests/unit/p07-export-provenance.test.mjs',
];
const tempRoot = realpathSync(tmpdir());
const scratch = mkdtempSync(join(tempRoot, 'p07-r4-'));
try {
  for (const path of files) {
    let source = read(path);
    if (path === 'multilevel-ma/index.html') {
      const addition = /^[ \t]*producedBy: window\.AlmBuildInfo \|\| null,\r?\n/gm;
      assert.equal([...source.matchAll(addition)].length, 1, 'remove exactly the main provenance addition');
      source = source.replace(addition, '');
    } else if (path === 'multilevel-ma/plus-ui.js') {
      const addition = ',producedBy:window.AlmBuildInfo||null';
      assert.equal(source.split(addition).length, 2, 'remove exactly the extras provenance addition');
      source = source.replace(addition, '');
    }
    const target = join(scratch, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  const run = spawnSync(process.execPath, [
    '--test', '--test-reporter=tap', join(scratch, files.at(-1)),
  ], { cwd: scratch, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  if (run.error) throw run.error;
  assert.equal(run.signal, null);
  assert.equal(run.status, 1, 'old serialization must fail the provenance plants');
  const outcomes = [...run.stdout.matchAll(/^(not ok|ok) \d+ - (P07-R4 .+)\r?$/gm)];
  assert.equal(outcomes.length, 9, 'all nine existing tests must run');
  const plants = outcomes.filter(([, , name]) => name.startsWith('P07-R4 plant:'));
  const controls = outcomes.filter(([, , name]) => name.startsWith('P07-R4 control:'));
  assert.equal(plants.length, 4);
  assert.equal(controls.length, 5);
  for (const [_, result, name] of plants) assert.equal(result, 'not ok', name);
  for (const [_, result, name] of controls) assert.equal(result, 'ok', name);
  console.log('P07-R4 old-code replay verified: 4 plants FAIL; 5 controls PASS.');
} finally {
  // Verify the absolute target is our own direct child of TEMP before removal.
  assert.equal(dirname(scratch), tempRoot);
  assert.ok(basename(scratch).startsWith('p07-r4-'));
  rmSync(scratch, { recursive: true, force: true });
}
