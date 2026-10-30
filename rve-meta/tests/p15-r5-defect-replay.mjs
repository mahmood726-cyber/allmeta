// No historical snapshot is supplied. Plant the former missing-weight-guard
// defect in a temporary copy; do not describe this as an exact base checkout.
import assert from 'node:assert/strict';
import { readSource, runDiagnostics } from './p15-r5-test-copy.mjs';

const source = readSource('shared/rve.js');
const guard = /      var weightProblem = !weights\.every\(Number\.isFinite\)[\s\S]*?throw new Error\("RVE: " \+ weightProblem \+ " weights"\);\r?\n      }\r?\n/g;
assert.equal([...source.matchAll(guard)].length, 1, 'The exact weight guard must be present once');
const expected = [
  'plant P15-R5: one effect reports insufficient clusters with the fitted count',
  'plant P15-R5: one-effect page explains the cluster requirement without predictor-removal advice',
  ...['CR1', 'CR2'].flatMap(method => [
    `plant P15-R5: ${method} overflowing initial weights are not called collinearity`,
    `plant P15-R5: ${method} zero reweighted weights are not called collinearity`
  ]),
  'plant P15-R5: page identifies unusable weights and sampling variances'
];
const broken = runDiagnostics({ 'shared/rve.js': source.replace(guard, '') });
console.log('PLANTED MISSING-GUARD REPLAY (not a historical checkout)\n' + broken.stdout);
assert.equal(broken.status, 1, broken.stderr);
assert.deepEqual(broken.failures, expected);
assert.match(broken.stdout, /# pass 9\b/);
assert.match(broken.stdout, /# fail 7\b/);
const fixed = runDiagnostics();
console.log('DELIVERED ENGINE CONTROL\n' + fixed.stdout);
assert.equal(fixed.status, 0, fixed.stderr);
assert.match(fixed.stdout, /# pass 16\b/);
assert.match(fixed.stdout, /# fail 0\b/);
console.log('Verified: all seven planted diagnostic failures disappear; all nine controls pass in both copies.');
