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

// Negative-control/mutation: never make all pinned plots pass by erasing
// SVG subtree differences. The shipped plot must have genuinely empty line
// and rectangle shapes, and planting a child must change the exact tree.
c.__almIncoLoad('A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15');
const plot = c.document.getElementById('ns-plot');
const shapes = [...plot.querySelectorAll('line,rect')];
assert.ok(shapes.length >= 3, 'the shipped network plot must render its shapes');
assert.ok(shapes.every(shape => shape.childNodes.length === 0),
  'SVG line/rect children are not browser-compatible; refuse nested plot DOM');
const cleanPlot = JSON.stringify(a.display()[2]);
const planted = c.document.createElement('text');
planted.textContent = 'PLANTED_INVALID_PLOT_CHILD';
shapes[0].appendChild(planted);
assert.notEqual(JSON.stringify(a.display()[2]), cleanPlot,
  'a planted SVG subtree mutation must not pass the plot-tree comparator');
shapes[0].removeChild(planted);
assert.equal(JSON.stringify(a.display()[2]), cleanPlot,
  'restored plot tree must match after removal of planted mutation');
console.log('P16_SVG_MUTATION detected nested-child tamper; clean plot restored');
