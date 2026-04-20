#!/usr/bin/env node
/**
 * Determinism Tests — verifies that seeded analysis produces identical results.
 * Also tests that zero-valued tau2/I2/effect display correctly (|| fallback regression).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT, 'dev', 'modules');
const MODULE_FILES = [
  '02_06_stats.js',
  '02_07_confidence-utils.js',
  '02_08_meta-analysis.js',
  '02_09_survival-analysis.js',
  '02_10_seeded-rng.js',
  '02_12_publication-bias.js',
  '02_21_benchmark-datasets.js',
];

function createContext() {
  const context = {
    console, Math, Number, Date, JSON, Array, Object, String, Boolean, RegExp,
    parseFloat, parseInt, isFinite, isNaN, Infinity, NaN, setTimeout, clearTimeout,
    APP: { config: { confLevel: 0.95 } },
    document: {
      createElement() {
        return {
          style: {}, classList: { add() {}, remove() {} },
          appendChild() {}, querySelector() { return null; },
          querySelectorAll() { return []; }, remove() {},
          innerHTML: '', textContent: '',
        };
      },
      body: { appendChild() {} },
      getElementById() { return null; },
    },
    window: null,
  };
  context.window = context;
  vm.createContext(context);
  return context;
}

function loadModules(context) {
  for (const file of MODULE_FILES) {
    const filePath = path.join(MODULES_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] Module not found: ${file}`);
      continue;
    }
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return vm.runInContext('({ Stats, MetaAnalysis, PublicationBias, BENCHMARK_DATASETS, SeededRNG: typeof SeededRNG !== "undefined" ? SeededRNG : null })', context);
}

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}: ${detail}`);
    failed++;
  }
}

function assertClose(actual, expected, tol, name) {
  if (actual == null || isNaN(actual)) {
    assert(false, name, `got ${actual} (null/NaN), expected ${expected}`);
    return;
  }
  const diff = Math.abs(actual - expected);
  assert(diff < tol, name, `expected ${expected}, got ${actual}`);
}

function assertExact(actual, expected, name) {
  // Handle NaN comparison (NaN === NaN is false in JS)
  if (typeof expected === 'number' && isNaN(expected)) {
    assert(false, name, `expected value is NaN — computation failed`);
    return;
  }
  assert(actual === expected, name, `expected ${expected}, got ${actual}`);
}

const ctx = createContext();
const { Stats, MetaAnalysis, PublicationBias, BENCHMARK_DATASETS, SeededRNG } = loadModules(ctx);

// =============================================================================
// Zero-value regression tests (|| fallback bug would corrupt these)
// =============================================================================
console.log('\n--- Zero-value regression tests (|| fallback safety) ---');

// tau2 = 0: homogeneous data
const homoEffects = [0.5, 0.5, 0.5, 0.5, 0.5];
const homoVars = [0.01, 0.01, 0.01, 0.01, 0.01];
const homoDL = MetaAnalysis.randomEffectsDL(homoEffects, homoVars);

assertExact(homoDL.tau2, 0, 'Homogeneous: tau2 is exactly 0 (not fallback)');
assertExact(homoDL.I2, 0, 'Homogeneous: I2 is exactly 0 (not fallback)');
assertClose(homoDL.pooled, 0.5, 1e-10, 'Homogeneous: pooled = 0.5');

// effect = 0: no treatment difference
const zeroEffects = [0, 0, 0, 0, 0];
const zeroVars = [0.01, 0.02, 0.03, 0.04, 0.05];
const zeroDL = MetaAnalysis.randomEffectsDL(zeroEffects, zeroVars);

assertClose(zeroDL.pooled, 0, 1e-10, 'Zero effects: pooled = 0 (not NaN or fallback)');
assertExact(zeroDL.tau2, 0, 'Zero effects: tau2 = 0');

// Mixed: some zero, some non-zero effects
const mixedEffects = [0, -0.5, 0, -0.3, 0];
const mixedVars = [0.01, 0.02, 0.01, 0.03, 0.01];
const mixedDL = MetaAnalysis.randomEffectsDL(mixedEffects, mixedVars);

assert(typeof mixedDL.pooled === 'number' && !isNaN(mixedDL.pooled),
  'Mixed zero/nonzero: pooled is valid number', `pooled = ${mixedDL.pooled}`);
assert(mixedDL.pooled < 0, 'Mixed: pooled should be negative (more negative studies)',
  `pooled = ${mixedDL.pooled}`);

// FE with zero effect
const zeroFE = MetaAnalysis.fixedEffect([0], [0.04]);
assertClose(zeroFE.pooled, 0, 1e-10, 'FE zero effect: pooled = 0');

// =============================================================================
// SeededRNG determinism
// =============================================================================
console.log('\n--- SeededRNG determinism ---');

if (SeededRNG) {
  // Patch, generate numbers, restore, repeat — should be identical
  SeededRNG.patchMathRandom(42);
  const run1 = [];
  for (let i = 0; i < 10; i++) run1.push(Math.random());
  SeededRNG.restoreMathRandom();

  SeededRNG.patchMathRandom(42);
  const run2 = [];
  for (let i = 0; i < 10; i++) run2.push(Math.random());
  SeededRNG.restoreMathRandom();

  assert(run1.length === run2.length, 'SeededRNG: same length', `${run1.length} vs ${run2.length}`);
  let allMatch = true;
  for (let i = 0; i < run1.length; i++) {
    if (run1[i] !== run2[i]) { allMatch = false; break; }
  }
  assert(allMatch, 'SeededRNG: seed=42 produces identical sequences', 'sequences differ');

  // Different seed should produce different sequence
  SeededRNG.patchMathRandom(99);
  const run3 = [];
  for (let i = 0; i < 10; i++) run3.push(Math.random());
  SeededRNG.restoreMathRandom();

  let anyDiff = false;
  for (let i = 0; i < run1.length; i++) {
    if (run1[i] !== run3[i]) { anyDiff = true; break; }
  }
  assert(anyDiff, 'SeededRNG: different seeds produce different sequences', 'sequences identical');

  // Verify restore works — after restore, Math.random should be non-deterministic
  // (or at least different from seeded)
  SeededRNG.patchMathRandom(42);
  SeededRNG.restoreMathRandom();
  const afterRestore = Math.random();
  assert(typeof afterRestore === 'number' && afterRestore >= 0 && afterRestore < 1,
    'SeededRNG: restore produces valid Math.random', `got ${afterRestore}`);
} else {
  console.log('[SKIP] SeededRNG not available in test context');
}

// =============================================================================
// Analysis determinism (same inputs → same outputs)
// =============================================================================
console.log('\n--- Analysis determinism ---');

const bcg = BENCHMARK_DATASETS.bcg;
const bcgEffects = bcg.studies.map(s => s.yi);
const bcgVars = bcg.studies.map(s => s.sei * s.sei);

// Run DL twice
const dl1 = MetaAnalysis.randomEffectsDL(bcgEffects, bcgVars);
const dl2 = MetaAnalysis.randomEffectsDL(bcgEffects, bcgVars);
assertExact(dl1.pooled, dl2.pooled, 'DL deterministic: pooled identical across runs');
assertExact(dl1.tau2, dl2.tau2, 'DL deterministic: tau2 identical across runs');
assertExact(dl1.I2, dl2.I2, 'DL deterministic: I2 identical across runs');

// Run REML twice
const reml1 = MetaAnalysis.randomEffectsREML(bcgEffects, bcgVars);
const reml2 = MetaAnalysis.randomEffectsREML(bcgEffects, bcgVars);
assertExact(reml1.pooled, reml2.pooled, 'REML deterministic: pooled identical');
assertExact(reml1.tau2, reml2.tau2, 'REML deterministic: tau2 identical');

// Egger twice
const bcgSE = bcg.studies.map(s => s.sei);
const egger1 = PublicationBias.eggerTest(bcgEffects, bcgSE);
const egger2 = PublicationBias.eggerTest(bcgEffects, bcgSE);
assertExact(egger1.intercept, egger2.intercept, 'Egger deterministic: intercept identical');
assertExact(egger1.p, egger2.p, 'Egger deterministic: p-value identical');

// =============================================================================
// Nullish coalescing correctness (?? vs ||)
// =============================================================================
console.log('\n--- Nullish coalescing correctness ---');

// Verify that 0 ?? fallback = 0 (not fallback)
const testNull = vm.runInContext('(function() { const x = 0; return x ?? 99; })()', ctx);
assertExact(testNull, 0, '0 ?? 99 = 0 (nullish coalescing preserves zero)');

const testUndef = vm.runInContext('(function() { const x = undefined; return x ?? 99; })()', ctx);
assertExact(testUndef, 99, 'undefined ?? 99 = 99');

const testNullVal = vm.runInContext('(function() { const x = null; return x ?? 99; })()', ctx);
assertExact(testNullVal, 99, 'null ?? 99 = 99');

// =============================================================================
// Summary
// =============================================================================
console.log(`\nDeterminism tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
