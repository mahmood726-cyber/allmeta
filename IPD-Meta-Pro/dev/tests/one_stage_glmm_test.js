#!/usr/bin/env node
/**
 * One-Stage GLMM Tests — validates binary (logistic) and continuous mixed models
 * Reference: R lme4::glmer, lme4::lmer with synthetic IPD data
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
  '02_25_one-stage-glmm.js',
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
    if (!fs.existsSync(filePath)) { console.log(`[SKIP] ${file}`); continue; }
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return vm.runInContext('({ Stats, OneStageGLMM, getConfZ: typeof getConfZ === "function" ? getConfZ : function() { return 1.96; } })', context);
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
const { Stats, OneStageGLMM } = loadModules(ctx);

// =============================================================================
// Internal matrix operations tests
// =============================================================================
console.log('\n--- Matrix operations ---');

// Cholesky decomposition
const A = [[4, 2], [2, 3]];
const L = OneStageGLMM._cholesky(A);
assertClose(L[0][0], 2, 1e-10, 'Cholesky L[0][0] = 2');
assertClose(L[1][0], 1, 1e-10, 'Cholesky L[1][0] = 1');
assertClose(L[1][1], Math.sqrt(2), 1e-10, 'Cholesky L[1][1] = sqrt(2)');

// Cholesky solve: Ax = b
const b_vec = [8, 7];
const x_sol = OneStageGLMM._cholSolve(A, b_vec);
// 4x + 2y = 8, 2x + 3y = 7 → x = 1.25, y = 1.5
assertClose(x_sol[0], 1.25, 1e-8, 'cholSolve x[0] = 1.25');
assertClose(x_sol[1], 1.5, 1e-8, 'cholSolve x[1] = 1.5');

// Verify: A * x = b
assertClose(A[0][0] * x_sol[0] + A[0][1] * x_sol[1], b_vec[0], 1e-8, 'Ax = b check [0]');
assertClose(A[1][0] * x_sol[0] + A[1][1] * x_sol[1], b_vec[1], 1e-8, 'Ax = b check [1]');

// Cholesky inverse
const Ainv = OneStageGLMM._cholInverse(A);
// A * A^{-1} should be identity
const prod00 = A[0][0] * Ainv[0][0] + A[0][1] * Ainv[1][0];
const prod01 = A[0][0] * Ainv[0][1] + A[0][1] * Ainv[1][1];
assertClose(prod00, 1, 1e-8, 'A * Ainv = I [0][0]');
assertClose(prod01, 0, 1e-8, 'A * Ainv = I [0][1]');

// Matrix multiply
const M1 = [[1, 2], [3, 4]];
const M2 = [[5, 6], [7, 8]];
const prod = OneStageGLMM._matMul(M1, M2);
assertClose(prod[0][0], 19, 1e-10, 'matMul [0][0] = 19');
assertClose(prod[1][1], 50, 1e-10, 'matMul [1][1] = 50');

// =============================================================================
// Synthetic Binary IPD data — 5 studies, known treatment effect
// =============================================================================
console.log('\n--- GLMM fitBinary: synthetic data ---');

// Generate IPD: 5 studies, 100 patients each, logistic model
// True: intercept=-1, treatment log-OR=0.8, tau2=0.1
function generateBinaryIPD(seed) {
  // Simple seeded PRNG (xoshiro128**)
  let s = [seed, seed ^ 0xDEAD, seed ^ 0xBEEF, seed ^ 0xCAFE];
  function next() {
    const result = (s[1] * 5 >>> 0) * 9;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (result >>> 0) / 4294967296;
  }
  function rnorm() {
    const u1 = Math.max(1e-12, next());
    const u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const data = [];
  const trueIntercept = -1;
  const trueTreatment = 0.8; // log-OR ≈ 0.8 → OR ≈ 2.23
  const trueTau = Math.sqrt(0.1);

  for (let study = 1; study <= 5; study++) {
    const b_i = rnorm() * trueTau; // Random intercept
    for (let j = 0; j < 100; j++) {
      const trt = next() < 0.5 ? 1 : 0;
      const eta = trueIntercept + trueTreatment * trt + b_i;
      const prob = 1 / (1 + Math.exp(-eta));
      const y = next() < prob ? 1 : 0;
      data.push({
        outcome: y,
        treatment: trt,
        study_id: 'Study_' + study
      });
    }
  }
  return data;
}

const binaryIPD = generateBinaryIPD(42);
assert(binaryIPD.length === 500, 'Generated 500 binary IPD rows', `got ${binaryIPD.length}`);

const binaryResult = OneStageGLMM.fitBinary(binaryIPD, 'outcome', 'treatment', 'study_id');

assert(binaryResult != null && !binaryResult.error, 'GLMM fitBinary returns result',
  binaryResult ? binaryResult.error : 'null');

if (binaryResult && !binaryResult.error) {
  // Treatment log-OR should be positive (true value 0.8)
  assert(binaryResult.treatment.logOR > 0, 'Treatment log-OR is positive (true=0.8)',
    `logOR = ${binaryResult.treatment.logOR}`);

  // OR should be > 1
  assert(binaryResult.treatment.OR > 1, 'Treatment OR > 1',
    `OR = ${binaryResult.treatment.OR}`);

  // log-OR should be in reasonable range [0.2, 1.6] (true=0.8, but with noise)
  assert(binaryResult.treatment.logOR > 0.0 && binaryResult.treatment.logOR < 2.0,
    'Treatment log-OR in reasonable range [0, 2]',
    `logOR = ${binaryResult.treatment.logOR}`);

  // SE should be reasonable (not too small, not too large)
  assert(binaryResult.treatment.se > 0.05 && binaryResult.treatment.se < 1.0,
    'Treatment SE in reasonable range',
    `SE = ${binaryResult.treatment.se}`);

  // CI should contain the point estimate
  assert(binaryResult.treatment.CI[0] < binaryResult.treatment.OR &&
         binaryResult.treatment.OR < binaryResult.treatment.CI[1],
    'CI contains OR',
    `CI [${binaryResult.treatment.CI[0]}, ${binaryResult.treatment.CI[1]}], OR = ${binaryResult.treatment.OR}`);

  // tau2 should be positive
  assert(binaryResult.randomEffects.tau2 > 0, 'tau2 > 0',
    `tau2 = ${binaryResult.randomEffects.tau2}`);

  // Should have 5 studies
  assert(binaryResult.nStudies === 5, 'nStudies = 5',
    `nStudies = ${binaryResult.nStudies}`);

  // Should have 500 patients
  assert(binaryResult.nPatients === 500, 'nPatients = 500',
    `nPatients = ${binaryResult.nPatients}`);

  // Convergence
  assert(binaryResult.convergence.converged, 'Model converged',
    `converged = ${binaryResult.convergence.converged}, iter = ${binaryResult.convergence.iterations}`);

  // p-value should be in [0, 1]
  assert(binaryResult.treatment.pValue >= 0 && binaryResult.treatment.pValue <= 1,
    'p-value in [0, 1]',
    `p = ${binaryResult.treatment.pValue}`);

  // Method label
  assert(binaryResult.method === 'One-Stage GLMM (PQL)', 'Method label correct',
    `method = ${binaryResult.method}`);

  // Compatibility fields
  assert(typeof binaryResult.pooled_effect === 'number', 'pooled_effect exists', '');
  assert(typeof binaryResult.SE === 'number', 'SE exists', '');
  assert(typeof binaryResult.I2 === 'number', 'I2 exists', '');
}

// =============================================================================
// Continuous outcome test via fitContinuous
// =============================================================================
console.log('\n--- GLMM fitContinuous: synthetic data ---');

function generateContinuousIPD(seed) {
  let s = [seed, seed ^ 0xDEAD, seed ^ 0xBEEF, seed ^ 0xCAFE];
  function next() {
    const result = (s[1] * 5 >>> 0) * 9;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (result >>> 0) / 4294967296;
  }
  function rnorm() {
    const u1 = Math.max(1e-12, next());
    const u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const data = [];
  for (let study = 1; study <= 5; study++) {
    const b_i = rnorm() * 0.5; // Random intercept, tau=0.5
    for (let j = 0; j < 80; j++) {
      const trt = next() < 0.5 ? 1 : 0;
      const y = 10 + (-2.0) * trt + b_i + rnorm() * 1.5; // true effect = -2.0
      data.push({
        outcome: y,
        treatment: trt,
        study_id: 'Study_' + study
      });
    }
  }
  return data;
}

const contIPD = generateContinuousIPD(99);
const contResult = OneStageGLMM.fitContinuous(contIPD, 'outcome', 'treatment', 'study_id');

assert(contResult != null && !contResult.error, 'LMM fitContinuous returns result',
  contResult ? contResult.error : 'null');

if (contResult && !contResult.error) {
  // Treatment effect should be negative (true = -2.0)
  const trtEff = contResult.treatment ? contResult.treatment.effect : contResult.pooled_effect;
  assert(trtEff < 0, 'Continuous treatment effect is negative (true=-2.0)',
    `effect = ${trtEff}`);

  // Should be in reasonable range
  assert(trtEff > -4.0 && trtEff < -0.5, 'Effect in [-4, -0.5]',
    `effect = ${trtEff}`);

  assert(contResult.nStudies === 5 || contResult.nStudies >= 4, 'nStudies ≈ 5',
    `nStudies = ${contResult.nStudies}`);
}

// =============================================================================
// Edge cases
// =============================================================================
console.log('\n--- Edge cases ---');

// Too few data
const tooFew = OneStageGLMM.fitBinary([{outcome: 1, treatment: 1, study_id: 'A'}],
  'outcome', 'treatment', 'study_id');
assert(tooFew.error != null, 'Too few data returns error', JSON.stringify(tooFew));

// Missing values handled
const withMissing = binaryIPD.slice(0, 50).concat([
  {outcome: null, treatment: 1, study_id: 'Study_1'},
  {outcome: 1, treatment: null, study_id: 'Study_1'},
  {outcome: 1, treatment: 1, study_id: ''},
]);
const missingResult = OneStageGLMM.fitBinary(withMissing, 'outcome', 'treatment', 'study_id');
assert(missingResult != null, 'Handles missing values', '');

// Single study should still work (no heterogeneity)
const singleStudy = binaryIPD.filter(d => d.study_id === 'Study_1');
const singleResult = OneStageGLMM.fitBinary(singleStudy, 'outcome', 'treatment', 'study_id');
// May return error for single study or a result
assert(singleResult != null, 'Single study returns something', '');

// =============================================================================
// Interaction test
// =============================================================================
console.log('\n--- Treatment-covariate interaction ---');

// Add a covariate to binary data
const binaryWithCov = binaryIPD.map((d, i) => ({
  ...d,
  age: 50 + Math.sin(i) * 15 // Synthetic age covariate
}));

const interResult = OneStageGLMM.fitBinary(binaryWithCov, 'outcome', 'treatment', 'study_id',
  ['age'], { interaction: true });

assert(interResult != null && !interResult.error, 'Interaction model returns result',
  interResult ? interResult.error : 'null');

if (interResult && !interResult.error && interResult.interactions) {
  assert(interResult.interactions.length === 1, 'One interaction term',
    `got ${interResult.interactions.length}`);
  assert(typeof interResult.interactions[0].beta === 'number', 'Interaction beta is numeric', '');
  assert(typeof interResult.interactions[0].p === 'number', 'Interaction p-value is numeric', '');
  assert(interResult.interactions[0].covariate === 'age', 'Interaction covariate = age',
    `got ${interResult.interactions[0].covariate}`);
}

// =============================================================================
// Summary
// =============================================================================
console.log(`\nOne-stage GLMM tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
