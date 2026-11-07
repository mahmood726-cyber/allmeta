// Reproduce P08's reviewed export omission without a historical checkout.
// Run from the repository root: node hub/shared/tests/unit/p08-replay.mjs
// The test and its relative source tree are copied together into OS TEMP.
// No assertions, production files, references or recorded evidence are edited.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const testPath = 'hub/shared/tests/unit/p08-results-export.test.mjs';
const pagePath = 'meta-regression/index.html';
const paths = [testPath, pagePath, 'hub/shared/results-export.js', 'shared/ma-core.js', 'shared/permutest.js'];
const inputs = new Map(paths.map(path => [path, readFileSync(new URL(path, root))]));
const lf = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const source = lf(inputs.get(pagePath));

// Reverse only the additions identified in the review. This is a planted
// reconstruction of the old defect, NOT an authenticated historical revision.
const additions = [
  ', _lastSlopeTest = null',
  '    window._almLastSlopeTest = function () { return _lastSlopeTest; };\n',
  '        _lastSlopeTest = { t: tB1, p: pB1 };\n',
  ' _lastSlopeTest = null;',
  '      var slopeTest = window._almLastSlopeTest ? window._almLastSlopeTest() : null;\n',
  '      var perm    = window._almLastPerm    ? window._almLastPerm()    : null;\n',
  '      var pi      = window._almLastPI      ? window._almLastPI()      : null;\n',
  '        if (slopeTest) {\n          out.slope_t = slopeTest.t;\n          out.slope_p = slopeTest.p;\n        }\n',
  '        if (perm) {\n          out.perm_p = perm.p;\n          out.perm_exact = perm.exact;\n          out.perm_nperm = perm.nperm;\n        }\n',
  '        if (pi) {\n          out.pred_x = pi.xbar;\n          out.pred = pi.pred;\n          out.pi_lb = pi.lo;\n          out.pi_ub = pi.hi;\n        }\n',
];
let defective = source;
for (const addition of additions) {
  assert.equal(defective.split(addition).length - 1, 1, `Expected exactly one reviewed addition: ${addition}`);
  defective = defective.replace(addition, '');
}
assert.equal(defective.includes('_lastSlopeTest'), false);

const expected = new Map();
for (const label of ['exact', 'Monte Carlo / negative slope']) {
  for (const format of ['json', 'csv', 'md', 'report-md', 'report-txt']) {
    expected.set(`P08-R1 plant: ${label} ${format} includes displayed slope test, permutation and prediction interval`, 'plant');
  }
}
expected.set('P08-R1 control: JSON and CSV retain coefficients, confidence intervals, variance and QE', 'control');
expected.set('P08-R1 control: unavailable optional inference is omitted and invalid input clears results', 'control');
expected.set('P08-R1 plant: rerender refreshes inference including a zero slope and prediction', 'plant');

const output = mkdtempSync(join(tmpdir(), 'p08-replay-'));
const evidence = {
  node: process.version,
  kind: 'review-described defect reconstruction; historical base not supplied',
  inputSha256LF: Object.fromEntries([...inputs].map(([path, bytes]) => [path, sha256(lf(bytes))])),
  removedAdditions: additions,
  runs: [],
};
console.log(`Replay artifacts: ${output}`);
for (const [label, page] of [['reviewed-omission', defective], ['current', source]]) {
  const tree = join(output, label);
  for (const [path, bytes] of inputs) {
    const destination = join(tree, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, path === pagePath ? page : bytes);
  }
  assert.deepEqual(readFileSync(join(tree, testPath)), inputs.get(testPath), 'Tests must be byte-identical');
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath], {
    cwd: tree, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(output, `${label}.tap`), child.stdout || '');
  writeFileSync(join(output, `${label}.stderr`), child.stderr || '');
  if (child.error) throw child.error;
  const outcomes = [...child.stdout.matchAll(/^(not )?ok \d+ - (.+)$/gm)]
    .map(m => ({ name: m[2].replace(/\r$/, ''), pass: !m[1] }));
  const run = { label, sourceSha256LF: sha256(page), exitCode: child.status, outcomes };
  evidence.runs.push(run);
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`\n${label}: exit ${child.status}`);
  for (const result of outcomes) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
  assert.deepEqual(outcomes.map(r => r.name).sort(), [...expected.keys()].sort(), 'Every plant and control must execute exactly once');
  for (const result of outcomes) {
    assert.equal(result.pass, label === 'current' || expected.get(result.name) === 'control', `${label}: ${result.name}`);
  }
  assert.equal(child.status, label === 'current' ? 0 : 1);
}
console.log('\nVerified: reviewed omission = 11 failing plants / 2 passing controls; current = 13 passing tests.');
