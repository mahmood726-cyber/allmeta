// Reproduce review evidence without a checkout, network, or changes to the tree.
// The only reconstructed source is pinned to the parent blob in the PR review.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
const source = read('shared/nma-multiarm-v1.js');
const blobHash = text => createHash('sha1')
  .update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, 'Reconstruction hunk must occur exactly once');
  return text.replace(before, after);
};
assert.ok(blobHash(source).startsWith('d3ec4a7'), 'Current engine must match the reviewed PR blob');
let parent = replaceOnce(source,
  'var n = A.length, M = zeros(n, 2 * n), scale = 0, i, j, r;',
  'var n = A.length, M = zeros(n, 2 * n), i, j, r;');
parent = replaceOnce(parent,
  'for (i = 0; i < n; i++) { for (j = 0; j < n; j++) { M[i][j] = A[i][j]; scale = Math.max(scale, Math.abs(A[i][j])); } M[i][n + i] = 1; }',
  'for (i = 0; i < n; i++) { for (j = 0; j < n; j++) M[i][j] = A[i][j]; M[i][n + i] = 1; }');
parent = replaceOnce(parent,
  '      // Covariance and information matrices scale oppositely with outcome units.\n' +
  '      // Check numerical rank relative to the input scale; a zero matrix also\n' +
  '      // fails this comparison. Keep elimination arithmetic unchanged for fits\n' +
  '      // that already passed, including the published validation corpus.\n' +
  '      if (!(Math.abs(pivot) / scale >= 1e-13)) return null;',
  '      if (Math.abs(pivot) < 1e-13) return null;');
const parentHash = blobHash(parent);
assert.ok(parentHash.startsWith('b57de1c'), `Reconstructed parent must match review provenance: ${parentHash}`);
console.log(JSON.stringify({ provenance: { algorithm: 'SHA-1 blob header plus LF UTF-8 source',
  parent: parentHash, current: blobHash(source), expectedPrefixesFromReview: ['b57de1c', 'd3ec4a7'] } }));

const testFile = 'hub/shared/tests/unit/p04-unit-scaling.test.mjs';
const expectedFailures = new Set();
for (const scale of [0.000001, 100000000]) {
  for (const model of ['fe', 're']) for (const kind of ['two-arm', 'multi-arm'])
    expectedFailures.add(`P04-R3 ${kind} ${model} analytic fit at outcome scale ${scale}`);
  for (const ci of ['classic', 't-dist'])
    expectedFailures.add(`P04-R3 analyse ${ci} preserves inference at outcome scale ${scale}`);
}
expectedFailures.add('P04-R3 invert well-conditioned matrix at matrix scale 1e-20');
expectedFailures.add('P04-R3 singular and numerically rank-deficient matrices stay refused at matrix scale 100000000000000000000');
assert.equal(expectedFailures.size, 14);

const scratch = mkdtempSync(join(tmpdir(), 'nma-p04-review-'));
try {
  function put(tree, file, text) {
    const target = join(scratch, tree, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  const manifest = JSON.parse(read('nma/validate/MANIFEST.json'));
  for (const [tree, engine] of [['parent', parent], ['current', source]]) {
    put(tree, 'shared/nma-multiarm-v1.js', engine);
    // Keep the submitted test source identical in both temporary trees.
    for (const file of [testFile, 'scripts/nma-p04-replay.mjs',
      'nma/validate/adapter.js', 'nma/validate/MANIFEST.json',
      ...manifest.files.map(({ path }) => `nma/${path}`)]) put(tree, file, read(file));
  }
  function run(tree, args, logName) {
    const result = spawnSync(process.execPath, args,
      { cwd: join(scratch, tree), encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(result.error);
    put(tree, logName, result.stdout + result.stderr);
    return result;
  }
  const results = {};
  for (const tree of ['parent', 'current']) {
    const runResult = run(tree, ['--test', '--test-reporter=tap', testFile], 'scaling.tap');
    assert.equal(runResult.status, tree === 'parent' ? 1 : 0, runResult.stdout + runResult.stderr);
    const cases = [...runResult.stdout.matchAll(/^(not ok|ok) \d+ - (.+)\r?$/gm)]
      .map(([, status, name]) => ({ name: name.trim(), passed: status === 'ok' }));
    assert.equal(cases.length, 27, 'All original scaling cases must execute');
    assert.equal(new Set(cases.map(c => c.name)).size, 27, 'Case names must be unique');
    const failures = cases.filter(c => !c.passed).map(c => c.name);
    assert.deepEqual(new Set(failures), tree === 'parent' ? expectedFailures : new Set());
    results[tree] = cases;
  }
  assert.deepEqual(results.current.map(c => c.name), results.parent.map(c => c.name));
  console.log(JSON.stringify({ regressionEvidence: results.parent.map((old, i) => ({
    name: old.name, parent: old.passed ? 'PASS' : 'FAIL', current: results.current[i].passed ? 'PASS' : 'FAIL',
  })), parentFailed: 14, parentControlsPassed: 13, currentPassed: 27 }, null, 2));

  const before = run('parent', ['scripts/nma-p04-replay.mjs'], 'paper-replay.json');
  const after = run('current', ['scripts/nma-p04-replay.mjs'], 'paper-replay.json');
  assert.equal(before.status, 0, before.stdout + before.stderr);
  assert.equal(after.status, 0, after.stdout + after.stderr);
  assert.equal(after.stdout, before.stdout, 'All reported maxima and full-precision example values must be exactly unchanged');
  console.log('Exact parent/current publication replay output equality: PASS');
  console.log(after.stdout);
} finally {
  // Only delete the exact temporary directory allocated above.
  rmSync(scratch, { recursive: true, force: true });
}
