// Classify the current Node DOM discrepancies without changing its strict gate.
// This cannot establish old/new equivalence: no historical tree is available.
import './p16-test-deps.cjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { harness, root } = require('../nma-inconsistency-dom.cjs');
const { c } = harness(), a = c.AlmIncoValidationAdapter;
const before = JSON.stringify(a.snapshot());
const files = Object.fromEntries(a.contract.files.map(f => [f.path,
  readFileSync(join(root, 'nma-inconsistency', f.path))]));
const result = await a.corpus.run(files);
const groups = {}, examples = {};
for (const failure of result.failed) {
  groups[failure.quantity] = (groups[failure.quantity] || 0) + 1;
  if (!examples[failure.quantity]) examples[failure.quantity] = failure;
}
const report = { checks: result.checks, passed: result.passed, refusals: result.refusals,
  restored: JSON.stringify(a.snapshot()) === before, groups, failed: result.failed };
writeFileSync(join(tmpdir(), 'p16-w1-current-dom.json'), JSON.stringify(report, null, 2));
console.log('P16_CURRENT_DOM ' + JSON.stringify({ ...report, failed: undefined }));
for (const [quantity, failure] of Object.entries(examples)) {
  const actual = JSON.stringify(failure.app) ?? 'undefined', expected = JSON.stringify(failure.ref) ?? 'undefined';
  let first = 0;
  while (first < Math.min(actual.length, expected.length) && actual[first] === expected[first]) first++;
  console.log('P16_CURRENT_DOM_EXAMPLE ' + JSON.stringify({ quantity, id: failure.id, first,
    actual: actual.slice(Math.max(0, first - 60), first + 200),
    expected: expected.slice(Math.max(0, first - 60), first + 200) }));
}
assert.equal(result.checks, 4627);
assert.equal(result.passed, 4627);
assert.equal(result.failed.length, 0);
assert.equal(result.refusals.expected, 54);
assert.equal(result.refusals.matched, 54);
assert.equal(report.restored, true);
