/*
 * ma-methods-v1.spec.mjs — guardrail behaviour for shared/ma-methods-v1.js.
 *
 * Asserts the Cochrane Handbook rules fire (and only fire) when they should,
 * keyed on the stable finding `code`s. These are behaviour contracts, not
 * numerical parity — the numbers live in ma-core / ma-comparisons specs.
 *
 * Run: node --test shared/tests/ma-methods-v1.spec.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../ma-methods-v1.js');

function codes(list) { return list.map((f) => f.code); }

test('chooseMeasure follows ch.6 defaults', () => {
  assert.equal(M.chooseMeasure('binary').measure, 'RR');
  assert.equal(M.chooseMeasure('binary', { caseControl: true }).measure, 'OR');
  assert.equal(M.chooseMeasure('continuous').measure, 'MD');
  assert.equal(M.chooseMeasure('continuous', { sameScale: false }).measure, 'SMD');
  assert.equal(M.chooseMeasure('tte').measure, 'HR');
});

test('chooseModel defaults to RE/REML/HK with PI', () => {
  const r = M.chooseModel({ k: 12 });
  assert.equal(r.model, 'RE');
  assert.equal(r.estimator, 'REML');
  assert.equal(r.knha, true);
  assert.equal(r.pi, true);
  assert.ok(M.chooseModel({ k: 3 }).note, 'small-k note present');
});

test('wrong measure for declared data type BLOCKS', () => {
  const r = M.assess({ measure: 'MD', dataType: 'binary', k: 5 });
  assert.ok(codes(r.block).includes('measure-datatype-mismatch'));
  assert.equal(r.ok, false);
});

test('correct measure for data type does NOT block', () => {
  const r = M.assess({ measure: 'RR', dataType: 'binary', k: 5, model: 'RE', estimator: 'REML', hasPI: true });
  assert.equal(r.ok, true, JSON.stringify(r.block));
});

test('mixed effect measures BLOCK (the §10.4 guard)', () => {
  const r = M.assess({ measures: ['OR', 'RR', 'OR'], k: 3 });
  assert.ok(codes(r.block).includes('mixed-measures'));
});

test('single measure across studies does not trip the mixing guard', () => {
  const r = M.assess({ measures: ['OR', 'OR', 'OR'], measure: 'OR', dataType: 'binary', k: 3, model: 'FE' });
  assert.ok(!codes(r.block).includes('mixed-measures'));
});

test('unknown/legacy measure WARNS, never BLOCKS', () => {
  const r = M.assess({ measure: 'WEIRD', k: 5 });
  assert.ok(codes(r.warn).includes('unknown-measure'));
  assert.ok(!codes(r.block).includes('unknown-measure'));
});

test('k<2 BLOCKS', () => {
  assert.ok(codes(M.assess({ k: 1 }).block).includes('k-too-small'));
  assert.ok(codes(M.assess({ k: 0 }).block).includes('no-studies'));
  assert.equal(M.assess({ k: 2, measure: 'OR', dataType: 'binary', model: 'FE' }).ok, true);
});

test('DL with small k WARNS', () => {
  const r = M.assess({ model: 'RE', estimator: 'DL', k: 6, hasPI: true });
  assert.ok(codes(r.warn).includes('dl-small-k'));
  const big = M.assess({ model: 'RE', estimator: 'DL', k: 20, hasPI: true });
  assert.ok(!codes(big.warn).includes('dl-small-k'));
});

test('RE with k>=3 and no PI WARNS', () => {
  const r = M.assess({ model: 'RE', estimator: 'REML', k: 8, hasPI: false });
  assert.ok(codes(r.warn).includes('no-prediction-interval'));
});

test('high I^2 WARNS', () => {
  const r = M.assess({ measure: 'OR', dataType: 'binary', k: 12, model: 'RE', estimator: 'REML', hasPI: true, I2: 88 });
  assert.ok(codes(r.warn).includes('high-heterogeneity'));
});

test('multi-arm uncorrected BLOCKS; corrected only INFOs', () => {
  const studies = [{ id: 'S1', arms: [{ treatment: 'A' }, { treatment: 'B' }, { treatment: 'C' }] }];
  const bad = M.assess({ studies, multiArmCorrected: false });
  assert.ok(codes(bad.block).includes('multi-arm-uncorrected'));
  const good = M.assess({ studies, multiArmCorrected: true });
  assert.ok(!codes(good.block).includes('multi-arm-uncorrected'));
  assert.ok(codes(good.info).includes('multi-arm-present'));
});

test('multi-arm detected from contrast design tags', () => {
  const contrasts = [
    { study: 'S1', treatment1: 'A', treatment2: 'B', design: 'A:B:C' },
    { study: 'S1', treatment1: 'A', treatment2: 'C', design: 'A:B:C' },
    { study: 'S1', treatment1: 'B', treatment2: 'C', design: 'A:B:C' },
    { study: 'S2', treatment1: 'A', treatment2: 'B', design: 'A:B' },
  ];
  const r = M.assess({ contrasts, multiArmCorrected: false });
  assert.ok(codes(r.block).includes('multi-arm-uncorrected'));
  assert.equal(M._detectMultiArm({ contrasts }).count, 1);
});

test('implausible natural-scale ratio BLOCKS', () => {
  const r = M.assess({ measure: 'OR', dataType: 'binary', k: 3, estimates: [1.2, -0.5, 0.8], estimatesAreLog: false });
  assert.ok(codes(r.block).includes('implausible-estimate'));
  // same values read as log-scale are fine
  const ok = M.assess({ measure: 'OR', dataType: 'binary', k: 3, model: 'FE', estimates: [0.2, -0.5, 0.8], estimatesAreLog: true });
  assert.ok(!codes(ok.block).includes('implausible-estimate'));
});

test('non-finite estimate BLOCKS regardless of scale', () => {
  const r = M.assess({ measure: 'MD', dataType: 'continuous', k: 3, estimates: [1, NaN, 3] });
  assert.ok(codes(r.block).includes('implausible-estimate'));
});
