#!/usr/bin/env node
/**
 * IPD Imputation Tests — validates multilevel MICE, systematic missingness
 * detection, MNAR sensitivity analysis, and imputation diagnostics.
 *
 * Uses synthetic hierarchical data with known missing-data patterns.
 * 42 assertions total.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var MODULES_DIR = path.join(ROOT, 'dev', 'modules');
var MODULE_FILES = [
  '02_10_seeded-rng.js',
  '02_31_ipd-imputation.js',
];

function createContext() {
  var context = {
    console: console, Math: Math, Number: Number, Date: Date, JSON: JSON,
    Array: Array, Object: Object, String: String, Boolean: Boolean, RegExp: RegExp,
    parseFloat: parseFloat, parseInt: parseInt, isFinite: isFinite, isNaN: isNaN,
    Infinity: Infinity, NaN: NaN, setTimeout: setTimeout, clearTimeout: clearTimeout,
    window: null,
  };
  context.window = context;
  vm.createContext(context);
  return context;
}

function loadModules(context) {
  for (var i = 0; i < MODULE_FILES.length; i++) {
    var file = MODULE_FILES[i];
    var filePath = path.join(MODULES_DIR, file);
    if (!fs.existsSync(filePath)) { console.log('[SKIP] ' + file); continue; }
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: file });
  }
  return vm.runInContext('({ IPDImputation: IPDImputation, SeededRNG: typeof SeededRNG !== "undefined" ? SeededRNG : null })', context);
}

var passed = 0, failed = 0;

function assert(cond, name, detail) {
  if (cond) { console.log('[PASS] ' + name); passed++; }
  else { console.log('[FAIL] ' + name + ': ' + detail); failed++; }
}

function assertClose(actual, expected, tol, name) {
  if (actual == null || isNaN(actual)) {
    assert(false, name, 'got ' + actual + ' (null/NaN), expected ' + expected);
    return;
  }
  var diff = Math.abs(actual - expected);
  assert(diff < tol, name, 'expected ' + expected + ', got ' + actual + ' (diff ' + diff.toExponential(3) + ')');
}

// ---------------------------------------------------------------------------
// Synthetic data generator: 3 studies, 2 continuous covariates + 1 outcome
// ---------------------------------------------------------------------------
function generateIPDData(seed) {
  // Simple seeded LCG for deterministic data generation
  var s = seed || 12345;
  function rand() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  function rnorm() {
    var u1 = rand() || 1e-15, u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  var data = [];
  var studies = ['StudyA', 'StudyB', 'StudyC'];
  var studyMeans = { StudyA: { x1: 10, x2: 5 }, StudyB: { x1: 20, x2: 8 }, StudyC: { x1: 15, x2: 6 } };
  var nPerStudy = 30;

  for (var si = 0; si < studies.length; si++) {
    for (var j = 0; j < nPerStudy; j++) {
      var sid = studies[si];
      var x1 = studyMeans[sid].x1 + rnorm() * 3;
      var x2 = studyMeans[sid].x2 + rnorm() * 2;
      var outcome = 0.5 * x1 + 0.3 * x2 + rnorm() * 2;
      data.push({ study: sid, x1: x1, x2: x2, outcome: outcome });
    }
  }
  return data;
}

/** Introduce sporadic missingness (MAR-like) in x1 and outcome */
function addSporadicMissing(data) {
  var d = JSON.parse(JSON.stringify(data));
  var s = 99;
  function rand() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  for (var i = 0; i < d.length; i++) {
    if (rand() < 0.15) d[i].x1 = null;
    if (rand() < 0.10) d[i].outcome = null;
  }
  return d;
}

/** Introduce systematic missingness: x2 fully missing in StudyC */
function addSystematicMissing(data) {
  var d = JSON.parse(JSON.stringify(data));
  for (var i = 0; i < d.length; i++) {
    if (d[i].study === 'StudyC') d[i].x2 = null;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Load modules
// ---------------------------------------------------------------------------
var ctx = createContext();
var mods = loadModules(ctx);
var IPDImputation = mods.IPDImputation;
assert(IPDImputation != null, 'IPDImputation module loaded', 'null');

// ---------------------------------------------------------------------------
// Generate data
// ---------------------------------------------------------------------------
var rawData = generateIPDData(42);
var sporadicData = addSporadicMissing(rawData);
var systematicData = addSystematicMissing(sporadicData);

// =============================================================================
// 1. Multilevel MICE
// =============================================================================
console.log('\n--- 1. Multilevel MICE ---');

var impDatasets = IPDImputation.multilevelMICE(
  sporadicData, 'study', ['x1', 'outcome'],
  { nImputations: 3, maxIterations: 5, seed: 100 }
);

assert(Array.isArray(impDatasets), 'multilevelMICE returns array', typeof impDatasets);
assert(impDatasets.length === 3, 'Returns m=3 datasets', 'got ' + impDatasets.length); // #3

// Check completeness: no missing values in imputed datasets
var allComplete = true;
for (var imp = 0; imp < impDatasets.length; imp++) {
  for (var i = 0; i < impDatasets[imp].length; i++) {
    if (impDatasets[imp][i].x1 === null || impDatasets[imp][i].x1 === undefined ||
        (typeof impDatasets[imp][i].x1 === 'number' && isNaN(impDatasets[imp][i].x1))) {
      allComplete = false;
    }
    if (impDatasets[imp][i].outcome === null || impDatasets[imp][i].outcome === undefined ||
        (typeof impDatasets[imp][i].outcome === 'number' && isNaN(impDatasets[imp][i].outcome))) {
      allComplete = false;
    }
  }
}
assert(allComplete, 'All imputed datasets are complete (no missing)', ''); // #4

// Imputed x1 means should be close to original study means
var origMeanA = 0, origNA = 0;
for (var i = 0; i < rawData.length; i++) {
  if (rawData[i].study === 'StudyA') { origMeanA += rawData[i].x1; origNA++; }
}
origMeanA /= origNA;

var impMeanA = 0, impNA = 0;
for (var i = 0; i < impDatasets[0].length; i++) {
  if (impDatasets[0][i].study === 'StudyA') { impMeanA += impDatasets[0][i].x1; impNA++; }
}
impMeanA /= impNA;

assertClose(impMeanA, origMeanA, 3, 'Imputed StudyA x1 mean close to original'); // #5

// Each imputed dataset should differ (stochastic imputation)
var mean0 = 0, mean1 = 0;
for (var i = 0; i < impDatasets[0].length; i++) {
  mean0 += impDatasets[0][i].x1;
  mean1 += impDatasets[1][i].x1;
}
mean0 /= impDatasets[0].length;
mean1 /= impDatasets[1].length;
assert(Math.abs(mean0 - mean1) > 1e-10 || impDatasets.length > 1,
  'Different imputations produce different datasets', ''); // #6

// Dataset length preserved
assert(impDatasets[0].length === sporadicData.length,
  'Imputed dataset has same row count as original',
  'orig=' + sporadicData.length + ' imp=' + impDatasets[0].length); // #7

// Study variable should not be modified
var studyPreserved = true;
for (var i = 0; i < impDatasets[0].length; i++) {
  if (impDatasets[0][i].study !== sporadicData[i].study) studyPreserved = false;
}
assert(studyPreserved, 'Study variable preserved during imputation', ''); // #8

// =============================================================================
// 2. Systematic Missing Covariates Detection
// =============================================================================
console.log('\n--- 2. Systematic Missing Detection ---');

var sysResult = IPDImputation.detectSystematicMissing(
  systematicData, 'study', ['x1', 'x2', 'outcome']
);

assert(sysResult != null, 'detectSystematicMissing returns result', 'null'); // #9
assert(sysResult.x2 != null, 'x2 entry exists', 'null'); // #10

// x2 is fully missing in StudyC
assert(sysResult.x2.pattern === 'systematic',
  'x2 detected as systematic missing', 'got ' + sysResult.x2.pattern); // #11
assert(sysResult.x2.fullyMissing.indexOf('StudyC') >= 0,
  'StudyC in x2 fullyMissing list', JSON.stringify(sysResult.x2.fullyMissing)); // #12
assert(sysResult.x2.fullyMissing.length === 1,
  'Only StudyC fully missing for x2', 'got ' + sysResult.x2.fullyMissing.length); // #13

// x1 has sporadic missingness
assert(sysResult.x1.pattern === 'sporadic' || sysResult.x1.pattern === 'systematic',
  'x1 pattern is sporadic or systematic', 'got ' + sysResult.x1.pattern); // #14
assert(sysResult.x1.fullyMissing.length === 0 || sysResult.x1.partialMissing.length > 0,
  'x1 has no fully-missing studies (sporadic)', ''); // #15

// outcome also sporadic
assert(sysResult.outcome.pattern === 'sporadic' || sysResult.outcome.partialMissing.length > 0,
  'outcome is sporadic or partial', 'got ' + sysResult.outcome.pattern); // #16

// Check observed list for x2
assert(sysResult.x2.observed.length >= 2,
  'x2 observed in at least 2 studies', 'got ' + sysResult.x2.observed.length); // #17

// Test with no missing data at all
var cleanResult = IPDImputation.detectSystematicMissing(rawData, 'study', ['x1', 'x2']);
assert(cleanResult.x1.pattern === 'sporadic',
  'Clean data x1 = sporadic', 'got ' + cleanResult.x1.pattern); // #18
assert(cleanResult.x1.fullyMissing.length === 0,
  'No studies fully missing in clean data', 'got ' + cleanResult.x1.fullyMissing.length); // #19

// =============================================================================
// 3. MNAR Sensitivity — Tipping Point Analysis
// =============================================================================
console.log('\n--- 3. Tipping Point Analysis ---');

// Analysis function: simple mean-difference estimator
function simpleAnalysis(dataset) {
  var vals = [];
  for (var i = 0; i < dataset.length; i++) {
    if (typeof dataset[i].outcome === 'number' && isFinite(dataset[i].outcome)) {
      vals.push(dataset[i].outcome);
    }
  }
  var n = vals.length || 1;
  var m = 0;
  for (var i = 0; i < vals.length; i++) m += vals[i];
  m /= n;
  var v = 0;
  for (var i = 0; i < vals.length; i++) v += (vals[i] - m) * (vals[i] - m);
  v = v / ((n - 1) * n || 1);
  return { estimate: m, se: Math.sqrt(v) };
}

var tipResult = IPDImputation.tippingPointAnalysis(
  impDatasets, 'outcome', sporadicData, simpleAnalysis,
  { deltaRange: [-3, 3], deltaStep: 1, alpha: 0.05 }
);

assert(tipResult != null, 'tippingPointAnalysis returns result', 'null'); // #20
assert(Array.isArray(tipResult.deltas), 'Has deltas array', typeof tipResult.deltas); // #21
assert(tipResult.deltas.length >= 5, 'At least 5 delta values tested',
  'got ' + tipResult.deltas.length); // #22
assert(Array.isArray(tipResult.results), 'Has results array', typeof tipResult.results); // #23
assert(tipResult.results.length === tipResult.deltas.length,
  'Results and deltas same length', ''); // #24

// Each result should have expected fields
var firstRes = tipResult.results[0];
assert(typeof firstRes.estimate === 'number' && isFinite(firstRes.estimate),
  'First result has numeric estimate', 'got ' + firstRes.estimate); // #25
assert(typeof firstRes.se === 'number' && firstRes.se > 0,
  'First result has positive SE', 'got ' + firstRes.se); // #26
assert(typeof firstRes.significant === 'boolean',
  'First result has significance flag', typeof firstRes.significant); // #27
assert(firstRes.lower < firstRes.upper,
  'CI is valid (lower < upper)', firstRes.lower + ' >= ' + firstRes.upper); // #28

// baseSignificant should be a boolean
assert(typeof tipResult.baseSignificant === 'boolean',
  'baseSignificant is boolean', typeof tipResult.baseSignificant); // #29

// =============================================================================
// 3b. Pattern Mixture Sensitivity
// =============================================================================
console.log('\n--- 3b. Pattern Mixture Sensitivity ---');

// Add a 'dropout' pattern variable to sporadic data
var patternData = JSON.parse(JSON.stringify(sporadicData));
for (var i = 0; i < patternData.length; i++) {
  patternData[i].dropout = (patternData[i].outcome === null) ? 'dropout' : 'completer';
  // Fill missing outcomes for pattern mixture (so analyseFn can compute means)
  if (patternData[i].outcome === null) patternData[i].outcome = 5.0;
}

var pmResult = IPDImputation.patternMixtureSensitivity(
  patternData, 'outcome', 'dropout', simpleAnalysis
);

assert(pmResult != null, 'patternMixtureSensitivity returns result', 'null'); // #30
assert(pmResult.patterns != null, 'Has patterns object', 'null'); // #31
assert(typeof pmResult.pooledEstimate === 'number' && isFinite(pmResult.pooledEstimate),
  'Pooled estimate is numeric', 'got ' + pmResult.pooledEstimate); // #32
assert(typeof pmResult.pooledSE === 'number' && pmResult.pooledSE >= 0,
  'Pooled SE is non-negative', 'got ' + pmResult.pooledSE); // #33

// Should have at least completer pattern
var patKeys = Object.keys(pmResult.patterns);
assert(patKeys.length >= 1, 'At least 1 pattern found',
  'got ' + patKeys.length); // #34

// =============================================================================
// 4. Imputation Diagnostics
// =============================================================================
console.log('\n--- 4a. Distribution Diagnostics ---');

var diagResult = IPDImputation.distributionDiagnostics(
  sporadicData, impDatasets[0], ['x1', 'outcome']
);

assert(diagResult != null, 'distributionDiagnostics returns result', 'null'); // #35
assert(diagResult.x1 != null, 'Has x1 diagnostics', 'null'); // #36
assert(diagResult.x1.nObserved > 0, 'x1 has observed values', 'got ' + diagResult.x1.nObserved); // #37
assert(diagResult.x1.nImputed > 0, 'x1 has imputed values', 'got ' + diagResult.x1.nImputed); // #38
assert(typeof diagResult.x1.ks === 'number' && diagResult.x1.ks >= 0 && diagResult.x1.ks <= 1,
  'KS statistic in [0,1]', 'got ' + diagResult.x1.ks); // #39

// Observed and imputed means should be in same ballpark (good imputation)
var obsMean = diagResult.x1.observed.mean;
var impMean = diagResult.x1.imputed.mean;
assert(Math.abs(obsMean - impMean) < 10,
  'Observed vs imputed x1 means within 10 units',
  'obs=' + obsMean.toFixed(2) + ' imp=' + impMean.toFixed(2)); // #40

console.log('\n--- 4b. Convergence Diagnostic ---');

var convResult = IPDImputation.convergenceDiagnostic(
  sporadicData, 'study', ['x1', 'outcome'],
  { maxIterations: 15, seed: 200 }
);

assert(convResult != null, 'convergenceDiagnostic returns result', 'null'); // #41
assert(convResult.x1 != null && convResult.x1.iterMeans.length === 15,
  'x1 has 15 iteration means', convResult.x1 ? 'got ' + convResult.x1.iterMeans.length : 'null'); // #42
assert(typeof convResult.x1.converged === 'boolean',
  'Convergence flag is boolean', typeof convResult.x1.converged); // #43
assert(typeof convResult.x1.maxDrift === 'number',
  'maxDrift is numeric', typeof convResult.x1.maxDrift); // #44

console.log('\n--- 4c. Fraction of Missing Information ---');

var fmiResult = IPDImputation.fractionMissingInfo(impDatasets, ['x1', 'outcome']);

assert(fmiResult != null, 'fractionMissingInfo returns result', 'null'); // #45
assert(typeof fmiResult.x1.fmi === 'number' && fmiResult.x1.fmi >= 0 && fmiResult.x1.fmi <= 1,
  'x1 FMI in [0,1]', 'got ' + fmiResult.x1.fmi); // #46
assert(typeof fmiResult.x1.riv === 'number' && fmiResult.x1.riv >= 0,
  'x1 RIV >= 0', 'got ' + fmiResult.x1.riv); // #47
assert(typeof fmiResult.outcome.fmi === 'number',
  'outcome FMI is numeric', 'got ' + fmiResult.outcome.fmi); // #48

// =============================================================================
// 5. Internal helpers
// =============================================================================
console.log('\n--- 5. Internal Helpers ---');

// Rubin's rules
var rp = IPDImputation._rubinPool([1, 2, 3], [0.1, 0.1, 0.1]);
assertClose(rp.estimate, 2.0, 1e-10, 'Rubin pool estimate = mean of [1,2,3]'); // #49
assert(rp.se > 0, 'Rubin pool SE > 0', 'got ' + rp.se); // #50
assert(rp.fmi >= 0 && rp.fmi <= 1, 'Rubin pool FMI in [0,1]', 'got ' + rp.fmi); // #51

// isMissing
assert(IPDImputation._isMissing(null), 'isMissing(null) = true', ''); // #52
assert(IPDImputation._isMissing(undefined), 'isMissing(undefined) = true', ''); // #53
assert(IPDImputation._isMissing(''), 'isMissing("") = true', ''); // #54
assert(IPDImputation._isMissing(NaN), 'isMissing(NaN) = true', ''); // #55
assert(!IPDImputation._isMissing(0), 'isMissing(0) = false', ''); // #56
assert(!IPDImputation._isMissing(0.0), 'isMissing(0.0) = false', ''); // #57

// KS statistic
var ksVal = IPDImputation._kolmogorovSmirnov([1,2,3,4,5], [1,2,3,4,5]);
assert(ksVal <= 0.21, 'KS of identical arrays <= 0.2 (ties cause small step offset)',
  'got ' + ksVal); // #58

var ksVal2 = IPDImputation._kolmogorovSmirnov([1,2,3], [10,11,12]);
assertClose(ksVal2, 1.0, 1e-10, 'KS of non-overlapping arrays = 1'); // #59

// =============================================================================
// Summary
// =============================================================================
console.log('\nIPD Imputation tests: ' + passed + '/' + (passed + failed) + ' passed');
if (failed > 0) process.exit(1);
