import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../rve-meta/index.html', import.meta.url), 'utf8');
function labels(names, p, centred) {
  const source = html.match(/    function coefficientLabels\(names, p, centred\) \{[\s\S]*?\n    \}/);
  assert.ok(source, 'page-owned coefficient label function exists');
  const context = vm.createContext({});
  vm.runInContext(source[0], context);
  return Array.from(context.coefficientLabels(names, p, centred));
}

test('P0-38 plant: moderator intercept states the zero reference and is not pooled', () => {
  assert.deepEqual(labels(['dose_weeks'], 2, false), [
    'Intercept (effect when dose_weeks = 0; not an overall pooled effect)', 'dose_weeks'
  ]);
});

test('P0-38 control: intercept-only fits retain their valid pooled interpretation', () => {
  assert.deepEqual(labels([], 1, false), ['(intercept)']);
});

test('P0-38 control: centred fits refer to predictor means, with all slopes preserved', () => {
  assert.deepEqual(labels(['treatment', 'dose_weeks'], 3, true), [
    'Intercept (effect at predictor means; not an overall pooled effect)', 'treatment', 'dose_weeks'
  ]);
});

test('P0-38 plant: all moderator zero references and unnamed predictors are explicit', () => {
  assert.deepEqual(labels(['treatment', ''], 3, false), [
    'Intercept (effect when treatment = 0 and x2 = 0; not an overall pooled effect)', 'treatment', 'x2'
  ]);
});
