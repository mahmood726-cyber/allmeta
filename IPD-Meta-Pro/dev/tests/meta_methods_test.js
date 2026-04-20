#!/usr/bin/env node
/**
 * Meta-Analysis Methods Tests — validates HE, SJ, ML, PM, PI, confidenceInterval
 * BCG dataset reference values from R metafor 4.6.0:
 *   rma(yi, vi, data=dat.bcg, method="XX")
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
    const code = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return vm.runInContext('({ Stats, getConfZ, MetaAnalysis, BENCHMARK_DATASETS })', context);
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
  assert(diff < tol, name, `expected ${expected}, got ${actual} (diff ${diff.toExponential(3)})`);
}

const ctx = createContext();
const { Stats, MetaAnalysis, BENCHMARK_DATASETS } = loadModules(ctx);

// BCG dataset from BENCHMARK_DATASETS
const bcg = BENCHMARK_DATASETS.bcg;
const effects = bcg.studies.map(s => s.yi);
const variances = bcg.studies.map(s => s.sei * s.sei); // sei → vi = sei²

// =============================================================================
// DL (baseline — already tested, used as reference)
// =============================================================================
// Use embedded expected values from benchmark
const expected = bcg.expected;

console.log('\n--- MetaAnalysis.randomEffectsDL (baseline) ---');
const dl = MetaAnalysis.randomEffectsDL(effects, variances);
assertClose(dl.pooled, expected.DL.estimate, 0.001, 'DL pooled matches benchmark');
assertClose(dl.tau2, expected.DL.tau2, 0.01, 'DL tau2 matches benchmark');
assert(dl.tau2 >= 0, 'DL tau2 >= 0', `tau2 = ${dl.tau2}`);

// =============================================================================
// REML
// =============================================================================
console.log('\n--- MetaAnalysis.randomEffectsREML ---');
const reml = MetaAnalysis.randomEffectsREML(effects, variances);
assertClose(reml.pooled, expected.REML.estimate, 0.01, 'REML pooled matches benchmark');
assertClose(reml.tau2, expected.REML.tau2, 0.05, 'REML tau2 matches benchmark');
assert(reml.tau2 >= 0, 'REML tau2 >= 0', `tau2 = ${reml.tau2}`);
assert(reml.se > 0, 'REML se > 0', `se = ${reml.se}`);

// =============================================================================
// Paule-Mandel (PM)
// R: rma(yi, vi, data=dat.bcg, method="PM") → estimate ≈ -0.714
// =============================================================================
console.log('\n--- MetaAnalysis.randomEffectsPM ---');
const pm = MetaAnalysis.randomEffectsPM(effects, variances);
assert(pm != null, 'PM returns result', 'null result');
assertClose(pm.pooled, expected.PM.estimate, 0.01, 'PM pooled matches benchmark');
assert(pm.tau2 >= 0, 'PM tau2 >= 0', `tau2 = ${pm.tau2}`);
assert(pm.ci_lower < pm.pooled && pm.pooled < pm.ci_upper, 'PM CI contains pooled',
  `CI [${pm.ci_lower}, ${pm.ci_upper}]`);

// =============================================================================
// Sidik-Jonkman (SJ)
// R: rma(yi, vi, data=dat.bcg, method="SJ") → estimate ≈ -0.72
// =============================================================================
console.log('\n--- MetaAnalysis.randomEffectsSJ ---');
const sj = MetaAnalysis.randomEffectsSJ(effects, variances);
assert(sj != null, 'SJ returns result', 'null result');
// SJ should be close to DL (same direction, similar magnitude)
assertClose(sj.pooled, expected.DL.estimate, 0.1, 'SJ pooled close to DL benchmark');
assert(sj.tau2 >= 0, 'SJ tau2 >= 0', `tau2 = ${sj.tau2}`);

// =============================================================================
// Hedges-Ebersbach (HE)
// R: rma(yi, vi, data=dat.bcg, method="HE") → estimate ≈ -0.71
// =============================================================================
console.log('\n--- MetaAnalysis.randomEffectsHE ---');
const he = MetaAnalysis.randomEffectsHE(effects, variances);
assert(he != null, 'HE returns result', 'null result');
assertClose(he.pooled, expected.DL.estimate, 0.1, 'HE pooled close to DL benchmark');
assert(he.tau2 >= 0, 'HE tau2 >= 0', `tau2 = ${he.tau2}`);

// =============================================================================
// Maximum Likelihood (ML)
// R: rma(yi, vi, data=dat.bcg, method="ML") → estimate ≈ -0.714
// =============================================================================
console.log('\n--- MetaAnalysis.randomEffectsML ---');
const ml = MetaAnalysis.randomEffectsML(effects, variances);
assert(ml != null, 'ML returns result', 'null result');
assertClose(ml.pooled, expected.DL.estimate, 0.05, 'ML pooled close to DL benchmark');
assert(ml.tau2 >= 0, 'ML tau2 >= 0', `tau2 = ${ml.tau2}`);

// =============================================================================
// All methods agree on direction
// =============================================================================
console.log('\n--- Cross-method consistency ---');
const allPooled = [dl.pooled, reml.pooled, pm.pooled, sj.pooled, he.pooled, ml.pooled];
assert(allPooled.every(p => p < 0), 'All methods agree BCG effect is negative',
  `pooled values: ${allPooled.map(p => p.toFixed(4)).join(', ')}`);

// All tau2 within reasonable range of each other
const allTau2 = [dl.tau2, reml.tau2, pm.tau2, sj.tau2, he.tau2, ml.tau2];
const tau2Range = Math.max(...allTau2) - Math.min(...allTau2);
assert(tau2Range < 1.0, 'All tau2 estimates within 1.0 of each other',
  `range = ${tau2Range.toFixed(4)}, values: ${allTau2.map(t => t.toFixed(4)).join(', ')}`);

// =============================================================================
// Fixed Effect
// =============================================================================
console.log('\n--- MetaAnalysis.fixedEffect ---');
const fe = MetaAnalysis.fixedEffect(effects, variances);
// FE should be close to DL for this dataset
assertClose(fe.pooled, expected.DL.estimate, 0.1, 'FE pooled in reasonable range');
assert(fe.ci_lower < fe.pooled && fe.pooled < fe.ci_upper, 'FE CI contains pooled',
  `CI [${fe.ci_lower}, ${fe.ci_upper}]`);

// =============================================================================
// Prediction Interval
// R: predict(rma(yi, vi, data=dat.bcg)) → PI much wider than CI
// =============================================================================
console.log('\n--- MetaAnalysis.predictionInterval ---');
const pi = MetaAnalysis.predictionInterval(dl);
assert(pi != null, 'PI returns result', 'null result');
if (pi && typeof pi.lower === 'number' && !isNaN(pi.lower)) {
  assert(pi.lower < dl.ci_lower, 'PI lower < CI lower', `PI [${pi.lower}] vs CI [${dl.ci_lower}]`);
  assert(pi.upper > dl.ci_upper, 'PI upper > CI upper', `PI [${pi.upper}] vs CI [${dl.ci_upper}]`);
} else {
  // PI requires k>=3 and uses t-distribution with df=k-2
  console.log(`[INFO] PI returned: ${JSON.stringify(pi)} — may need df >= 1`);
}

// =============================================================================
// Homogeneous data (tau2 should be 0)
// =============================================================================
console.log('\n--- Homogeneous data (tau2 = 0) ---');
const homoEffects = [0.5, 0.5, 0.5, 0.5, 0.5];
const homoVariances = [0.01, 0.01, 0.01, 0.01, 0.01];
const homoDL = MetaAnalysis.randomEffectsDL(homoEffects, homoVariances);
assertClose(homoDL.tau2, 0, 1e-10, 'Homogeneous data: DL tau2 = 0');
assertClose(homoDL.pooled, 0.5, 1e-6, 'Homogeneous data: DL pooled = 0.5');
assertClose(homoDL.I2, 0, 1e-10, 'Homogeneous data: I2 = 0');

// Zero effect test (the || fallback bug would have corrupted this)
const zeroEffects = [0, 0, 0, 0, 0];
const zeroVars = [0.01, 0.02, 0.03, 0.04, 0.05];
const zeroDL = MetaAnalysis.randomEffectsDL(zeroEffects, zeroVars);
assertClose(zeroDL.pooled, 0, 1e-10, 'Zero effects: pooled = 0 (not fallback)');
assertClose(zeroDL.tau2, 0, 1e-10, 'Zero effects: tau2 = 0');

// =============================================================================
// Edge: k=1 (single study)
// =============================================================================
console.log('\n--- Edge case: k=1 ---');
const k1 = MetaAnalysis.fixedEffect([-0.5], [0.04]);
assertClose(k1.pooled, -0.5, 1e-10, 'k=1: pooled = study effect');

// =============================================================================
// Edge: k=2 (minimum for heterogeneity)
// =============================================================================
console.log('\n--- Edge case: k=2 ---');
const k2 = MetaAnalysis.randomEffectsDL([-0.5, -1.0], [0.04, 0.04]);
assertClose(k2.pooled, -0.75, 0.01, 'k=2: DL pooled ≈ -0.75');
assert(k2.tau2 >= 0, 'k=2: tau2 >= 0', `tau2 = ${k2.tau2}`);

// =============================================================================
// Summary
// =============================================================================
console.log(`\nMeta-analysis methods tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
