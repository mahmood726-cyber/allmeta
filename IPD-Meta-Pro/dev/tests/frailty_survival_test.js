#!/usr/bin/env node
/**
 * Frailty & Stratified Cox Model Tests
 * Reference: R coxph(Surv(time,event) ~ trt + frailty(study))
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
  '02_27_frailty-survival.js',
];

function createContext() {
  const context = {
    console, Math, Number, Date, JSON, Array, Object, String, Boolean, RegExp,
    parseFloat, parseInt, isFinite, isNaN, Infinity, NaN, setTimeout, clearTimeout,
    APP: { config: { confLevel: 0.95 } },
    document: {
      createElement() { return { style: {}, classList: { add(){}, remove(){} }, appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, remove(){}, innerHTML: '', textContent: '' }; },
      body: { appendChild(){} }, getElementById(){ return null; },
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
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: file });
  }
  return vm.runInContext('({ Stats, FrailtySurvival })', context);
}

let passed = 0, failed = 0;
function assert(cond, name, detail) { if (cond) { console.log(`[PASS] ${name}`); passed++; } else { console.log(`[FAIL] ${name}: ${detail}`); failed++; } }
function assertClose(actual, expected, tol, name) {
  if (actual == null || isNaN(actual)) { assert(false, name, `got ${actual}, expected ${expected}`); return; }
  assert(Math.abs(actual - expected) < tol, name, `expected ${expected}, got ${actual}`);
}

const ctx = createContext();
const { Stats, FrailtySurvival } = loadModules(ctx);

// ── Synthetic survival IPD ──────────────────────────────────
function seededRNG(seed) {
  let s = [seed, seed ^ 0xDEAD, seed ^ 0xBEEF, seed ^ 0xCAFE];
  return function() {
    const result = (s[1] * 5 >>> 0) * 9;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (result >>> 0) / 4294967296;
  };
}

function generateSurvivalIPD(seed, opts) {
  opts = opts || {};
  const rng = seededRNG(seed);
  const rnorm = () => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); };
  const rexp = (rate) => -Math.log(Math.max(1e-12, rng())) / rate;

  const nStudies = opts.nStudies || 6;
  const perStudy = opts.perStudy || 80;
  const trueLogHR = opts.trueLogHR || -0.3; // Protective treatment
  const trueFrailtyVar = opts.trueFrailtyVar || 0.15;
  const data = [];

  for (let s = 1; s <= nStudies; s++) {
    const b_i = rnorm() * Math.sqrt(trueFrailtyVar); // Study frailty (log scale)
    for (let j = 0; j < perStudy; j++) {
      const trt = rng() < 0.5 ? 1 : 0;
      const age = 50 + rnorm() * 10;
      // Exponential survival: h(t) = λ₀ * exp(β*trt + b_i)
      const lambda = 0.05 * Math.exp(trueLogHR * trt + b_i);
      const eventTime = rexp(lambda);
      const censorTime = rexp(0.02); // Administrative censoring
      const time = Math.min(eventTime, censorTime);
      const event = eventTime <= censorTime ? 1 : 0;

      data.push({
        time: Math.round(time * 100) / 100,
        event: event,
        treatment: trt,
        study_id: 'Study_' + s,
        age: Math.round(age * 10) / 10
      });
    }
  }
  return data;
}

// =============================================================================
// 1. Shared Frailty Cox Model
// =============================================================================
console.log('\n--- Shared Frailty Cox Model ---');

const survIPD = generateSurvivalIPD(42, { nStudies: 6, perStudy: 80, trueLogHR: -0.3, trueFrailtyVar: 0.15 });
assert(survIPD.length === 480, `Generated ${survIPD.length} survival IPD rows`, `expected 480`);

const frailtyResult = FrailtySurvival.fitSharedFrailty(
  survIPD, 'time', 'event', 'treatment', 'study_id'
);

assert(frailtyResult != null && !frailtyResult.error, 'Shared frailty returns result',
  frailtyResult ? frailtyResult.error : 'null');

if (frailtyResult && !frailtyResult.error) {
  // Treatment HR should be < 1 (protective, true logHR = -0.3)
  assert(frailtyResult.treatment.HR < 1, 'Treatment HR < 1 (protective)',
    `HR = ${frailtyResult.treatment.HR}`);

  // log-HR should be in reasonable range [-1.0, 0.2]
  assert(frailtyResult.treatment.beta > -1.0 && frailtyResult.treatment.beta < 0.2,
    'log-HR in reasonable range',
    `beta = ${frailtyResult.treatment.beta}`);

  // SE should be positive and reasonable
  assert(frailtyResult.treatment.se > 0.05 && frailtyResult.treatment.se < 0.5,
    'Treatment SE reasonable',
    `SE = ${frailtyResult.treatment.se}`);

  // CI should contain HR
  assert(frailtyResult.treatment.CI[0] < frailtyResult.treatment.HR &&
         frailtyResult.treatment.HR < frailtyResult.treatment.CI[1],
    'CI contains HR',
    `CI [${frailtyResult.treatment.CI[0].toFixed(3)}, ${frailtyResult.treatment.CI[1].toFixed(3)}]`);

  // Frailty variance should be positive
  assert(frailtyResult.frailty.variance > 0, 'Frailty variance > 0',
    `theta = ${frailtyResult.frailty.variance}`);

  // Should have 6 study effects
  assert(frailtyResult.frailty.studyEffects.length === 6, '6 study frailty effects',
    `got ${frailtyResult.frailty.studyEffects.length}`);

  // Study frailties should be centered around 1 (exp(0))
  const meanFrailty = frailtyResult.frailty.studyEffects.reduce((s, e) => s + e.frailty, 0) / 6;
  assert(meanFrailty > 0.5 && meanFrailty < 2.0, 'Mean study frailty ≈ 1',
    `mean = ${meanFrailty.toFixed(3)}`);

  // nStudies and nPatients
  assert(frailtyResult.nStudies === 6, 'nStudies = 6', `got ${frailtyResult.nStudies}`);
  assert(frailtyResult.nPatients === 480, 'nPatients = 480', `got ${frailtyResult.nPatients}`);

  // Convergence
  assert(frailtyResult.convergence.converged, 'Model converged',
    `converged=${frailtyResult.convergence.converged}, iter=${frailtyResult.convergence.iterations}`);

  // Prediction interval wider than CI
  assert(frailtyResult.predictionInterval.lower < frailtyResult.treatment.CI[0],
    'PI lower < CI lower', '');
  assert(frailtyResult.predictionInterval.upper > frailtyResult.treatment.CI[1],
    'PI upper > CI upper', '');

  // Compatibility fields
  assert(typeof frailtyResult.pooled_effect === 'number', 'pooled_effect exists', '');
  assert(typeof frailtyResult.I2 === 'number', 'I2 exists', '');
  assert(typeof frailtyResult.tau2 === 'number', 'tau2 exists', '');
}

// =============================================================================
// 2. Shared Frailty with Covariate
// =============================================================================
console.log('\n--- Shared Frailty with covariate ---');

const frailtyWithCov = FrailtySurvival.fitSharedFrailty(
  survIPD, 'time', 'event', 'treatment', 'study_id', ['age']
);

assert(frailtyWithCov != null && !frailtyWithCov.error, 'Frailty + covariate returns result',
  frailtyWithCov ? frailtyWithCov.error : 'null');

if (frailtyWithCov && !frailtyWithCov.error) {
  assert(frailtyWithCov.covariates.length === 1, '1 covariate', `got ${frailtyWithCov.covariates.length}`);
  assert(frailtyWithCov.covariates[0].name === 'age', 'Covariate name = age', '');
  assert(typeof frailtyWithCov.covariates[0].HR === 'number', 'Covariate HR is numeric', '');
}

// =============================================================================
// 3. Stratified Cox Model
// =============================================================================
console.log('\n--- Stratified Cox Model ---');

const stratResult = FrailtySurvival.fitStratifiedCox(
  survIPD, 'time', 'event', 'treatment', 'study_id'
);

assert(stratResult != null && !stratResult.error, 'Stratified Cox returns result',
  stratResult ? stratResult.error : 'null');

if (stratResult && !stratResult.error) {
  // Treatment HR should be < 1 (same data)
  assert(stratResult.treatment.HR < 1, 'Stratified: HR < 1',
    `HR = ${stratResult.treatment.HR}`);

  assert(stratResult.treatment.se > 0, 'Stratified: SE > 0',
    `SE = ${stratResult.treatment.se}`);

  assert(stratResult.nStrata === 6, 'Stratified: 6 strata',
    `got ${stratResult.nStrata}`);

  // Strata counts should sum to total
  const totalN = stratResult.strataCounts.reduce((s, c) => s + c.n, 0);
  assert(totalN === stratResult.nPatients, 'Strata counts sum to total',
    `sum=${totalN}, total=${stratResult.nPatients}`);

  // HR from stratified should be similar to frailty
  if (frailtyResult && !frailtyResult.error) {
    const hrDiff = Math.abs(stratResult.treatment.HR - frailtyResult.treatment.HR);
    assert(hrDiff < 0.3, 'Stratified HR ≈ Frailty HR (within 0.3)',
      `strat=${stratResult.treatment.HR.toFixed(3)}, frailty=${frailtyResult.treatment.HR.toFixed(3)}`);
  }
}

// =============================================================================
// 4. Edge cases
// =============================================================================
console.log('\n--- Edge cases ---');

// Too few data
const tooFew = FrailtySurvival.fitSharedFrailty(
  [{time: 5, event: 1, treatment: 1, study_id: 'A'}],
  'time', 'event', 'treatment', 'study_id'
);
assert(tooFew.error != null, 'Too few data returns error', '');

// Single study
const singleStudy = survIPD.filter(d => d.study_id === 'Study_1');
const singleResult = FrailtySurvival.fitSharedFrailty(
  singleStudy, 'time', 'event', 'treatment', 'study_id'
);
assert(singleResult.error != null, 'Single study returns error', singleResult.error || '');

// No events in a study (all censored) — should handle gracefully
const noEvents = survIPD.map(d => d.study_id === 'Study_1' ? {...d, event: 0} : d);
const noEvResult = FrailtySurvival.fitSharedFrailty(
  noEvents, 'time', 'event', 'treatment', 'study_id'
);
assert(noEvResult != null, 'Handles study with no events', '');

// =============================================================================
// 5. Homogeneous data (frailty variance should be near 0)
// =============================================================================
console.log('\n--- Homogeneous data ---');

const homoIPD = generateSurvivalIPD(88, { nStudies: 4, perStudy: 100, trueLogHR: -0.5, trueFrailtyVar: 0.001 });
const homoResult = FrailtySurvival.fitSharedFrailty(
  homoIPD, 'time', 'event', 'treatment', 'study_id'
);

if (homoResult && !homoResult.error) {
  // Frailty variance should be small for homogeneous data
  assert(homoResult.frailty.variance < 0.5, 'Homogeneous: small frailty variance',
    `theta = ${homoResult.frailty.variance}`);
}

// =============================================================================
// Summary
// =============================================================================
console.log(`\nFrailty survival tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
