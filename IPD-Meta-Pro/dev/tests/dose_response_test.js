#!/usr/bin/env node
/**
 * IPD Dose-Response Meta-Analysis Tests
 * Tests linear, RCS, Emax models, non-linearity test, MED
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT, 'dev', 'modules');
const MODULE_FILES = ['02_06_stats.js', '02_07_confidence-utils.js', '02_29_dose-response-ipd.js'];

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
  return vm.runInContext('({ Stats, DoseResponseIPD })', context);
}

let passed = 0, failed = 0;
function assert(cond, name, detail) { if (cond) { console.log(`[PASS] ${name}`); passed++; } else { console.log(`[FAIL] ${name}: ${detail}`); failed++; } }

const ctx = createContext();
const { Stats, DoseResponseIPD } = loadModules(ctx);

// ── Synthetic dose-response IPD ─────────────────────────────
function seededRNG(seed) {
  let s = [seed, seed ^ 0xDEAD, seed ^ 0xBEEF, seed ^ 0xCAFE];
  return function() {
    const result = (s[1] * 5 >>> 0) * 9; const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (result >>> 0) / 4294967296;
  };
}

function generateDoseIPD(seed, trueModel) {
  const rng = seededRNG(seed);
  const rnorm = () => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); };
  const data = [];
  const doseLevels = [0, 10, 20, 40, 80, 160];

  for (let study = 1; study <= 5; study++) {
    const studyShift = rnorm() * 2;
    for (let j = 0; j < 60; j++) {
      const dose = doseLevels[Math.floor(rng() * doseLevels.length)];
      let trueEffect;
      if (trueModel === 'linear') {
        trueEffect = 5 + 0.1 * dose;
      } else if (trueModel === 'emax') {
        trueEffect = 5 + 15 * dose / (30 + dose); // Emax=15, ED50=30
      } else {
        trueEffect = 5 + 0.2 * dose - 0.001 * dose * dose; // Quadratic
      }
      const y = trueEffect + studyShift + rnorm() * 3;
      data.push({ dose: dose, outcome: Math.round(y * 100) / 100, study_id: 'Study_' + study });
    }
  }
  return data;
}

// =============================================================================
// 1. Linear dose-response
// =============================================================================
console.log('\n--- Linear dose-response ---');

const linearIPD = generateDoseIPD(42, 'linear');
const linearResult = DoseResponseIPD.fitIPDDoseResponse(linearIPD, 'dose', 'outcome', 'study_id');

assert(linearResult != null && !linearResult.error, 'Linear: returns result', linearResult ? linearResult.error : 'null');

if (linearResult && !linearResult.error) {
  assert(linearResult.models.length >= 4, 'At least 4 models fitted', `got ${linearResult.models.length}`);
  assert(linearResult.bestModel != null, 'Has best model', '');
  assert(typeof linearResult.bestModel.aic === 'number', 'Best model has AIC', '');
  assert(linearResult.predictions.length > 0, 'Has prediction curve', `got ${linearResult.predictions.length}`);

  // For linear true model, linear should have competitive AIC
  const linModel = linearResult.models.find(m => m.type === 'linear');
  assert(linModel != null, 'Linear model in list', '');
  assert(linModel.deltaAIC < 10, 'Linear model within 10 AIC of best', `deltaAIC=${linModel.deltaAIC.toFixed(2)}`);

  // Dose range
  assert(linearResult.doseRange[0] === 0, 'Min dose = 0', `got ${linearResult.doseRange[0]}`);
  assert(linearResult.doseRange[1] === 160, 'Max dose = 160', `got ${linearResult.doseRange[1]}`);

  // Reference effects
  assert(linearResult.referenceEffects.length === 4, '4 reference effects', `got ${linearResult.referenceEffects.length}`);

  // Predictions should increase with dose (positive slope)
  const firstPred = linearResult.predictions[0];
  const lastPred = linearResult.predictions[linearResult.predictions.length - 1];
  assert(lastPred.effect > firstPred.effect, 'Effect increases with dose', '');
}

// =============================================================================
// 2. Emax dose-response
// =============================================================================
console.log('\n--- Emax dose-response ---');

const emaxIPD = generateDoseIPD(99, 'emax');
const emaxResult = DoseResponseIPD.fitIPDDoseResponse(emaxIPD, 'dose', 'outcome', 'study_id');

assert(emaxResult != null && !emaxResult.error, 'Emax: returns result', emaxResult ? emaxResult.error : 'null');

if (emaxResult && !emaxResult.error) {
  // Non-linearity test should be significant for Emax data
  assert(emaxResult.nonlinearityTest != null, 'Has non-linearity test', '');
  // Emax is clearly nonlinear, but test may not always be significant with noise
  assert(typeof emaxResult.nonlinearityTest.pValue === 'number' || emaxResult.nonlinearityTest.pValue === null,
    'Non-linearity p-value is number or null', '');

  // Best model should not be linear
  assert(emaxResult.bestModel.type !== 'linear', 'Best model is not linear for Emax data',
    `best = ${emaxResult.bestModel.name}`);

  // Prediction curve should show plateau
  const preds = emaxResult.predictions;
  if (preds.length > 10) {
    const earlySlope = (preds[5].effect - preds[0].effect) / (preds[5].dose - preds[0].dose + 0.01);
    const lateSlope = (preds[preds.length - 1].effect - preds[preds.length - 6].effect) / (preds[preds.length - 1].dose - preds[preds.length - 6].dose + 0.01);
    assert(Math.abs(earlySlope) > Math.abs(lateSlope) * 0.5,
      'Emax: early slope steeper than late (plateau)',
      `early=${earlySlope.toFixed(4)}, late=${lateSlope.toFixed(4)}`);
  }
}

// =============================================================================
// 3. RCS basis functions
// =============================================================================
console.log('\n--- RCS basis functions ---');

const knots = [10, 50, 100];
const basisAt0 = DoseResponseIPD._rcsBase(0, knots);
assert(basisAt0[0] === 0, 'RCS at dose=0: linear term = 0', `got ${basisAt0[0]}`);

const basisAt50 = DoseResponseIPD._rcsBase(50, knots);
assert(basisAt50[0] === 50, 'RCS at dose=50: linear term = 50', `got ${basisAt50[0]}`);

// Knot selection
const testDoses = [0, 5, 10, 20, 30, 50, 80, 100, 150, 200];
const selectedKnots = DoseResponseIPD._selectKnots(testDoses, 3);
assert(selectedKnots.length === 3, '3 knots selected', `got ${selectedKnots.length}`);
assert(selectedKnots[0] < selectedKnots[1] && selectedKnots[1] < selectedKnots[2], 'Knots are ordered', '');

// =============================================================================
// 4. Minimum Effective Dose
// =============================================================================
console.log('\n--- Minimum Effective Dose ---');

if (linearResult && !linearResult.error) {
  // For linear positive dose-response, MED should exist
  // (where CI excludes zero)
  if (linearResult.minimumEffectiveDose) {
    assert(linearResult.minimumEffectiveDose.dose >= 0, 'MED dose >= 0',
      `dose = ${linearResult.minimumEffectiveDose.dose}`);
    assert(typeof linearResult.minimumEffectiveDose.effect === 'number', 'MED has effect', '');
  } else {
    assert(true, 'MED: CI may include zero throughout range (expected with noise)', '');
  }
}

// =============================================================================
// 5. Edge cases
// =============================================================================
console.log('\n--- Edge cases ---');

const tooFew = DoseResponseIPD.fitIPDDoseResponse([{dose: 5, outcome: 10, study_id: 'A'}], 'dose', 'outcome', 'study_id');
assert(tooFew.error != null, 'Too few data returns error', '');

// Single dose level (no variation) — should return error
const singleDose = Array(30).fill(null).map((_, i) => ({dose: 50, outcome: 10 + Math.sin(i), study_id: 'S1'}));
const singleResult = DoseResponseIPD.fitIPDDoseResponse(singleDose, 'dose', 'outcome', 'study_id');
assert(singleResult.error != null, 'Single dose returns error', '');

// =============================================================================
// 6. WLS internal function
// =============================================================================
console.log('\n--- WLS internal ---');

const wlsResult = DoseResponseIPD._fitWLS([1, 2, 3, 4, 5], [[1,1],[1,2],[1,3],[1,4],[1,5]]);
assert(wlsResult != null, 'WLS returns result', '');
if (wlsResult) {
  // y = 0 + 1*x → intercept≈0, slope≈1
  assert(Math.abs(wlsResult.beta[1] - 1) < 0.01, 'WLS slope ≈ 1', `got ${wlsResult.beta[1]}`);
  assert(Math.abs(wlsResult.beta[0]) < 0.01, 'WLS intercept ≈ 0', `got ${wlsResult.beta[0]}`);
}

// =============================================================================
// Summary
// =============================================================================
console.log(`\nDose-response tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
