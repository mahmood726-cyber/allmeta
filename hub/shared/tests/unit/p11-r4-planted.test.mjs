import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, cases, stateFor } from './p11-r4-cases.mjs';
import { definitions, runR } from './p11-r4-review-support.mjs';

function localOptimizer(script) {
  // Plant a single-start local search at the boundary, not an unavailable
  // historical checkout. An unspecified start reaches the correct interior
  // mode for these inputs in metafor 5.2.1, so it does not plant the defect.
  // Here the boundary score is negative even though a higher interior mode
  // exists. Keep tight convergence settings: this tests mode choice, not
  // precision. The ordinary control has a positive boundary score.
  const start = script.indexOf('refit <- function(...) {\n');
  const end = script.indexOf('fit <- function(y, v, slab)', start);
  assert.ok(start >= 0 && end > start, 'fitter mutation markers');
  return script.slice(0, start) + `refit <- function(...) {
  args <- list(...)
  args$control <- list(tau2.init=0, threshold=1e-12, maxiter=10000)
  do.call(metafor::rma.uni, args)
}
` + script.slice(end);
}

for (const [id, field] of [
  ['shallow-interior-beats-boundary', 'full.tau2'],
  ['shallow-interior-beats-boundary-deletion-exclusion', 'excl.tau2']
]) {
  test(`P11-R4 mode plant: local optimizer fails ${id} app-value assertions`, () => {
    const c = cases.find(c => c.id === id);
    const run = runR(localOptimizer(build(stateFor(c))));
    assert.equal(run.status, 1, run.output);
    assert.ok(run.output.includes(`FAIL ${field}[1]`), run.output);
    assert.match(run.output, /FAIL \d+\/\d+ app values differ beyond tolerance/);
  });
}

test('P11-R4 mode control: local optimizer still reproduces the ordinary case', () => {
  const c = cases.find(c => c.id === 'ordinary');
  const run = runR(localOptimizer(build(stateFor(c))));
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /ALL 176\/176 app values reproduced/);
});

test('P11-R4 metadata plant: returning the uncorrected fixed-tau2 object fails the parameter-count assertion', () => {
  const c = cases.find(c => c.id === 'ordinary');
  const script = definitions(build(stateFor(c)));
  const start = script.indexOf('  model <- do.call(metafor::rma.uni, args)\n');
  const end = script.indexOf('  model\n', start);
  assert.ok(start >= 0 && end > start, 'metadata mutation markers');
  const planted = script.slice(0, start) + '  do.call(metafor::rma.uni, args)\n' + script.slice(end + '  model\n'.length);
  const run = runR(planted + `
res <- fit(dat$yi, dat$vi, dat$study)
stopifnot(res$parms == 2L)
`);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /res\$parms == 2L is not TRUE/);
});
