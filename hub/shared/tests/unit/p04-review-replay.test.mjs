import test from 'node:test';
import assert from 'node:assert/strict';
import { engineParent, unguardedPage, readLF, inTempTree, runNode } from '../../../../scripts/p04-replay-support.mjs';

const suite = 'hub/shared/tests/unit/p04-r5-nma.test.mjs';
const files = Object.fromEntries([
  suite, 'shared/nma-multiarm-v1.js', 'nma/index.html', 'hub/shared/analysis-lifecycle.js',
].map(path => [path, readLF(path)]));
const expectedFailures = [
  ...['constructor', 'toString', 'hasOwnProperty'].map(name =>
    `P04-R5 defect: reference named ${name} preserves every numerical analysis field`),
  'P04-R5 defect: constructor input replaces the previous league and remains exportable',
  ...['analysis', 'rendering'].map(phase =>
    `P04-R5 defect: ${phase} exception clears results, diagnoses, blocks export, then recovers`),
];

test('P04 review replay control: all ten unchanged assertions pass on the shipped code', t => {
  const run = inTempTree(files, dir => runNode(dir, ['--test', '--test-reporter=tap', suite]));
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^# pass 10$/m);
  assert.match(run.stdout, /^# fail 0$/m);
  t.diagnostic('Shipped source: 10 passed, 0 failed; the child suite executed.');
});

test('P04 review replay defect: authenticated engine parent and unguarded page fail exactly six cases', t => {
  const old = { ...files,
    'shared/nma-multiarm-v1.js': engineParent(files['shared/nma-multiarm-v1.js']),
    'nma/index.html': unguardedPage(files['nma/index.html']),
  };
  const run = inTempTree(old, dir => runNode(dir, ['--test', '--test-reporter=tap', suite]));
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const failed = [...run.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(failed, expectedFailures, run.stdout + run.stderr);
  assert.match(run.stdout, /^# pass 4$/m, 'all four controls still pass');
  assert.match(run.stdout, /^# fail 6$/m);
  t.diagnostic('Reconstructed source: 4 controls passed; exactly these 6 defect cases failed:');
  for (const name of failed) t.diagnostic(name);
});
