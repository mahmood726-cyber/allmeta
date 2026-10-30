import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real calculation and reporting APIs without a browser or shared globals.
const context = vm.createContext({});
for (const file of ['shared/multivariate-ma.js', 'multivariate-ma/plus.js']) {
  vm.runInContext(readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
}
const P = context.AlmMvPlus;
function input(cov = 2) {
  return {
    mode: 'cov', rhoW: null, outcomes: ['Outcome A', 'Outcome B'],
    rows: [
      { line: 1, label: 'Study A', y: [1, -2], v: [1, 1], cov },
      { line: 2, label: 'Study B', y: [1, -2], v: [1, 1], cov }
    ],
    omitted: [{ line: 3, label: 'Incomplete', reason: 'missing or non-numeric value' }]
  };
}
function refusedWithSweep(grid = [0]) {
  const parsed = input(), res = P.compute(parsed), sw = P.sweep(parsed, grid);
  assert.equal(res.status, 'refused');
  assert.match(res.reason, /positive definite/i);
  assert.ok(res.univariate.every(u => u.status === 'ok'));
  assert.equal(sw.filter(s => s.status === 'ok').length, grid.filter(r => Math.abs(r) < 1).length);
  return { parsed, res, sw, text: P.texts(parsed, res, sw) };
}
// These are narrative assertions against actual fit outputs, not R-parity references.
function assertSummary(text, parsed, sw) {
  const ok = sw.filter(s => s.status === 'ok');
  for (let j = 0; j < parsed.outcomes.length; j++) {
    const mus = ok.map(s => s.fit.mu[j]);
    assert.ok(text.includes(`Across ρw from ${ok[0].rhoW} to ${ok.at(-1).rhoW} (${ok.length} fits)`), text);
    assert.ok(text.includes(`the pooled ${parsed.outcomes[j]} ranged from ${Math.min(...mus).toFixed(3)} to ${Math.max(...mus).toFixed(3)}`), text);
  }
  assert.match(text, /95% CI excluded 0/);
}
function assertMainRefusal(text, reason) {
  assert.match(text, /main bivariate model.*refused/i);
  assert.ok(text.includes(reason), text);
  assert.doesNotMatch(text, /No model was fitted/);
}

test('P18-R4 plant: interpretation retains a successful replacement-correlation fit after main refusal', () => {
  const { parsed, res, sw, text } = refusedWithSweep();
  assertSummary(text.interpretation, parsed, sw);
  assertMainRefusal(text.interpretation, res.reason);
  assert.match(text.interpretation, /within-study covariances/);
  assert.match(text.interpretation, /1 input row was omitted \(line 3: missing or non-numeric value\)/);
});

test('P18-R4 plant: methods describe the replacement-correlation analysis after main refusal', () => {
  const { res, text } = refusedWithSweep();
  assert.match(text.methods, /Sensitivity/);
  assert.match(text.methods, /REML/);
  assert.match(text.methods, /unstructured between-study covariance/);
  assert.match(text.methods, /Outcome A and Outcome B/);
  assert.match(text.methods, /2 studies/);
  assert.match(text.methods, /replac.*within-study covariances/i);
  assert.match(text.methods, /common within-study correlation/);
  assert.match(text.methods, /1 values from 0 to 0/);
  assertMainRefusal(text.methods, res.reason);
  assert.match(text.methods, /1 input row was omitted/);
});

test('P18-R4 plant: results report successful sensitivity estimates after main refusal', () => {
  const { parsed, res, sw, text } = refusedWithSweep();
  assertSummary(text.results, parsed, sw);
  assertMainRefusal(text.results, res.reason);
  assert.doesNotMatch(text.results, /REML log-likelihood|Across k =/);
});

test('P18-R4 plant: mixed sensitivity outcomes retain successful fits and refused grid counts', () => {
  const { parsed, res, sw, text } = refusedWithSweep([-1, 0, 0.5, 1]);
  for (const field of ['interpretation', 'results']) {
    assertSummary(text[field], parsed, sw);
    assertMainRefusal(text[field], res.reason);
    assert.match(text[field], /2 grid value\(s\) were refused/);
  }
  assert.match(text.methods, /4 values from -1 to 1/);
});

test('P18-R4 plant: an entirely refused sweep is disclosed separately from main refusal', () => {
  const { res, sw, text } = refusedWithSweep([1]);
  assert.equal(sw[0].status, 'refused');
  for (const field of ['interpretation', 'results']) {
    assertMainRefusal(text[field], res.reason);
    assert.match(text[field], /sensitivity analysis produced no fits/);
    assert.ok(text[field].includes(sw[0].reason));
    assert.doesNotMatch(text[field], /the pooled .* ranged from/);
  }
  assert.match(text.methods, /1 values from 1 to 1/);
});

test('P18-R4 control: successful main and sensitivity fits both remain reported', () => {
  const parsed = input(0), res = P.compute(parsed), sw = P.sweep(parsed, [0, 0.5]);
  assert.equal(res.status, 'ok');
  assert.ok(sw.every(s => s.status === 'ok'));
  const text = P.texts(parsed, res, sw);
  assertSummary(text.interpretation, parsed, sw);
  assertSummary(text.results, parsed, sw);
  assert.match(text.interpretation, /pooled jointly from the same 2 studies/);
  for (let j = 0; j < parsed.outcomes.length; j++) {
    assert.ok(text.interpretation.includes(`Pooled ${parsed.outcomes[j]}: ${res.fit.mu[j].toFixed(3)}`));
    assert.ok(text.results.includes(`the pooled ${parsed.outcomes[j]} was ${res.fit.mu[j].toFixed(3)}`));
  }
  assert.match(text.methods, /was fitted by restricted maximum likelihood \(REML\)/);
  assert.match(text.methods, /2 values from 0 to 0.5/);
  assert.match(text.results, /REML log-likelihood/);
  assert.doesNotMatch(text.interpretation + text.methods + text.results, /was refused|No model was fitted/);
});

test('P18-R4 control: successful main fit without a sweep has no sensitivity claims', () => {
  const parsed = input(0), res = P.compute(parsed);
  assert.equal(res.status, 'ok');
  for (const sw of [undefined, null, []]) {
    const text = P.texts(parsed, res, sw);
    assert.match(text.results, /Across k = 2 studies/);
    assert.match(text.methods, /REML/);
    assert.doesNotMatch(text.interpretation + text.methods + text.results, /Sensitivity|sensitivity|Across ρw/);
  }
});

test('P18-R4 control: refused main fit without a sweep preserves reason and omissions', () => {
  const parsed = input(), res = P.compute(parsed);
  assert.equal(res.status, 'refused');
  for (const sw of [undefined, null, []]) {
    const text = P.texts(parsed, res, sw);
    assert.ok(text.interpretation.includes(res.reason));
    assert.match(text.interpretation, /1 input row was omitted/);
    assert.doesNotMatch(text.interpretation, /Across ρw|sensitivity analysis/);
    assert.equal(text.methods, '');
    assert.equal(text.results, '');
  }
});

test('P18-R4 control: too few studies still explains the main-fit requirement', () => {
  const parsed = input();
  parsed.rows.length = 1;
  const res = P.compute(parsed);
  assert.equal(res.status, 'refused');
  const text = P.texts(parsed, res, null);
  assert.match(text.interpretation, /at least two studies with both outcomes/);
  assert.ok(text.interpretation.includes(res.reason));
  assert.equal(text.methods, '');
  assert.equal(text.results, '');
});
