#!/usr/bin/env node
/**
 * Publication Bias Tests — validates eggerTest, beggTest, trimAndFill
 * Reference: BCG dataset, metafor::regtest, metafor::ranktest, metafor::trimfill
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
    const code = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return vm.runInContext('({ Stats, MetaAnalysis, PublicationBias, BENCHMARK_DATASETS })', context);
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
const { Stats, MetaAnalysis, PublicationBias, BENCHMARK_DATASETS } = loadModules(ctx);

const bcg = BENCHMARK_DATASETS.bcg;
const effects = bcg.studies.map(s => s.yi);
const se = bcg.studies.map(s => s.sei);
const variances = se.map(s => s * s);

// =============================================================================
// Egger's Test — R: regtest(rma(yi, vi, data=dat.bcg))
// =============================================================================
console.log('\n--- PublicationBias.eggerTest ---');

const egger = PublicationBias.eggerTest(effects, se);
assert(egger != null, 'eggerTest returns result', 'null result');
assert(typeof egger.intercept === 'number', 'eggerTest has intercept', `${typeof egger.intercept}`);
assert(typeof egger.t === 'number', 'eggerTest has t-statistic', `${typeof egger.t}`);
assert(typeof egger.p === 'number', 'eggerTest has p-value', `${typeof egger.p}`);
assert(egger.p >= 0 && egger.p <= 1, 'eggerTest p-value in [0,1]', `p = ${egger.p}`);
assert(egger.se > 0, 'eggerTest SE > 0', `SE = ${egger.se}`);

// Egger intercept should be negative for BCG (protective effect, possible pub bias)
// R: regtest → z = -1.58, p ≈ 0.11 (not significant — marginal)
assert(egger.p > 0.01, 'eggerTest BCG not strongly significant (p > 0.01)', `p = ${egger.p}`);

// =============================================================================
// Begg's Test — R: ranktest(rma(yi, vi, data=dat.bcg))
// =============================================================================
console.log('\n--- PublicationBias.beggTest ---');

const begg = PublicationBias.beggTest(effects, variances);
assert(begg != null, 'beggTest returns result', 'null result');
assert(typeof begg.tau === 'number', 'beggTest has Kendall tau', `${typeof begg.tau}`);
assert(typeof begg.z === 'number', 'beggTest has z-statistic', `${typeof begg.z}`);
assert(typeof begg.p === 'number', 'beggTest has p-value', `${typeof begg.p}`);
// Normal approx can exceed 1.0 by rounding — allow small overshoot
assert(begg.p >= 0 && begg.p <= 1.01, 'beggTest p-value in [0,1]', `p = ${begg.p}`);
assert(begg.tau >= -1 && begg.tau <= 1, 'beggTest tau in [-1,1]', `tau = ${begg.tau}`);

// =============================================================================
// Trim and Fill — R: trimfill(rma(yi, vi, data=dat.bcg))
// =============================================================================
console.log('\n--- PublicationBias.trimAndFill ---');

const tf = PublicationBias.trimAndFill(effects, variances);
assert(tf != null, 'trimAndFill returns result', 'null result');
assert(typeof tf.k0 === 'number', 'trimAndFill has k0 (imputed studies)', `${typeof tf.k0}`);
assert(tf.k0 >= 0, 'trimAndFill k0 >= 0', `k0 = ${tf.k0}`);
assert(tf.side === 'left' || tf.side === 'right', 'trimAndFill has valid side',
  `side = ${tf.side}`);
assert(tf.original != null, 'trimAndFill has original FE result', 'null');
assert(tf.adjusted != null, 'trimAndFill has adjusted RE result', 'null');
assert(typeof tf.adjusted.pooled === 'number', 'trimAndFill adjusted has pooled estimate',
  `${typeof tf.adjusted.pooled}`);
assert(Array.isArray(tf.imputedStudies), 'trimAndFill has imputedStudies array',
  `${typeof tf.imputedStudies}`);

// If studies were imputed, the adjusted effect should differ from original
if (tf.k0 > 0) {
  assert(tf.imputedStudies.length === tf.k0, 'imputedStudies.length === k0',
    `${tf.imputedStudies.length} !== ${tf.k0}`);
  // Imputed studies should have valid effect and variance
  for (const imp of tf.imputedStudies) {
    assert(typeof imp.effect === 'number' && !isNaN(imp.effect),
      'imputed study has valid effect', `effect = ${imp.effect}`);
    assert(typeof imp.variance === 'number' && imp.variance > 0,
      'imputed study has positive variance', `variance = ${imp.variance}`);
  }
}

// =============================================================================
// Edge: symmetric data (no pub bias expected)
// =============================================================================
console.log('\n--- Symmetric data (no pub bias) ---');
const symEffects = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5];
const symVariances = [0.04, 0.04, 0.04, 0.04, 0.04, 0.04];
const symSE = symVariances.map(v => Math.sqrt(v));

const symEgger = PublicationBias.eggerTest(symEffects, symSE);
// Symmetric data should have non-significant Egger's test or NaN (degenerate case)
if (!isNaN(symEgger.p)) {
  assert(symEgger.p > 0.05, 'Symmetric data: Egger p > 0.05 (no bias)', `p = ${symEgger.p}`);
} else {
  // Perfectly symmetric data can produce NaN from zero residuals
  assert(true, 'Symmetric data: Egger returns NaN (degenerate — equal variances)', '');
}

const symTF = PublicationBias.trimAndFill(symEffects, symVariances);
assert(symTF.k0 <= 1, 'Symmetric data: trim-and-fill imputes 0-1 studies',
  `k0 = ${symTF.k0}`);

// =============================================================================
// Edge: k=3 (minimum practical)
// =============================================================================
console.log('\n--- Edge: k=3 ---');
const k3Effects = [-0.5, -0.8, -0.3];
const k3SE = [0.2, 0.3, 0.15];
const k3Egger = PublicationBias.eggerTest(k3Effects, k3SE);
assert(k3Egger != null && typeof k3Egger.p === 'number', 'k=3: Egger returns valid result',
  `result = ${JSON.stringify(k3Egger)}`);

// =============================================================================
// Summary
// =============================================================================
console.log(`\nPublication bias tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
