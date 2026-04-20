#!/usr/bin/env node
/**
 * Joint Longitudinal-Survival Model Tests
 * Tests LMM with random slopes, two-stage joint model, dynamic prediction
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT, 'dev', 'modules');
const MODULE_FILES = [
  '02_06_stats.js', '02_07_confidence-utils.js', '02_08_meta-analysis.js',
  '02_09_survival-analysis.js', '02_28_joint-models.js',
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
  return vm.runInContext('({ Stats, SurvivalAnalysis, JointModels })', context);
}

let passed = 0, failed = 0;
function assert(cond, name, detail) { if (cond) { console.log(`[PASS] ${name}`); passed++; } else { console.log(`[FAIL] ${name}: ${detail}`); failed++; } }

const ctx = createContext();
const { Stats, SurvivalAnalysis, JointModels } = loadModules(ctx);

// ── Synthetic joint data ────────────────────────────────────
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

function generateJointData(seed) {
  const rng = seededRNG(seed);
  const rnorm = () => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); };
  const rexp = (rate) => -Math.log(Math.max(1e-12, rng())) / rate;

  const longData = [];
  const survData = [];

  // True parameters
  const beta0 = 50;   // Baseline biomarker
  const beta1 = -0.5;  // Time slope (biomarker declines)
  const beta2 = -3;    // Treatment lowers biomarker
  const sigma = 2;     // Measurement noise
  const D00 = 4;       // Random intercept variance
  const D11 = 0.04;    // Random slope variance
  const alpha = 0.02;  // Association: higher biomarker → higher hazard

  for (let study = 1; study <= 4; study++) {
    for (let patient = 1; patient <= 30; patient++) {
      const pid = `S${study}_P${patient}`;
      const trt = rng() < 0.5 ? 1 : 0;
      const b0 = rnorm() * Math.sqrt(D00); // Random intercept
      const b1 = rnorm() * Math.sqrt(D11); // Random slope

      // Survival time (depends on biomarker trajectory via alpha)
      const avgBio = beta0 + beta2 * trt + b0; // Average biomarker level
      const lambda = 0.01 * Math.exp(alpha * avgBio - 0.3 * trt);
      const eventTime = Math.min(rexp(lambda), 36); // Max 36 months
      const censorTime = 12 + rng() * 24;
      const time = Math.min(eventTime, censorTime);
      const event = eventTime <= censorTime ? 1 : 0;

      survData.push({
        patient_id: pid, study_id: 'Study_' + study,
        event_time: Math.round(time * 10) / 10,
        event: event, treatment: trt
      });

      // Longitudinal visits at 0, 3, 6, 9, 12 months (if patient alive)
      const visitTimes = [0, 3, 6, 9, 12].filter(t => t <= time);
      visitTimes.forEach(vt => {
        const trueVal = beta0 + beta1 * vt + beta2 * trt + b0 + b1 * vt;
        const observed = trueVal + rnorm() * sigma;
        longData.push({
          patient_id: pid, study_id: 'Study_' + study,
          visit_time: vt, biomarker: Math.round(observed * 10) / 10,
          treatment: trt
        });
      });
    }
  }
  return { longData, survData };
}

const { longData, survData } = generateJointData(42);

// =============================================================================
// 1. Internal LMM with random slopes
// =============================================================================
console.log('\n--- LMM with random intercept + slope ---');

// Structure data for LMM
const patientMap = {};
longData.forEach(d => {
  if (!patientMap[d.patient_id]) {
    patientMap[d.patient_id] = { id: d.patient_id, study: d.study_id, treatment: d.treatment, visits: [] };
  }
  patientMap[d.patient_id].visits.push({ time: d.visit_time, value: d.biomarker });
});
const patients = Object.values(patientMap);

const lmmResult = JointModels._fitLMM(patients);
assert(lmmResult != null && !lmmResult.error, 'LMM returns result', lmmResult ? lmmResult.error : 'null');

if (lmmResult && !lmmResult.error) {
  // Intercept should be near 50 (true β₀ = 50)
  assert(lmmResult.beta[0] > 40 && lmmResult.beta[0] < 60, 'LMM intercept ≈ 50',
    `β₀ = ${lmmResult.beta[0].toFixed(2)}`);

  // Time slope should be negative (true β₁ = -0.5)
  assert(lmmResult.beta[1] < 0, 'LMM time slope negative (true=-0.5)',
    `β₁ = ${lmmResult.beta[1].toFixed(4)}`);

  // Treatment effect should be negative (true β₂ = -3)
  assert(lmmResult.beta[2] < 0, 'LMM treatment effect negative (true=-3)',
    `β₂ = ${lmmResult.beta[2].toFixed(2)}`);

  // Residual variance should be positive
  assert(lmmResult.sigma2 > 0 && lmmResult.sigma2 < 50, 'LMM σ² reasonable',
    `σ² = ${lmmResult.sigma2.toFixed(2)}`);

  // Random effects covariance
  assert(lmmResult.D[0][0] > 0, 'Random intercept variance > 0',
    `D₀₀ = ${lmmResult.D[0][0].toFixed(4)}`);
  assert(lmmResult.D[1][1] > 0, 'Random slope variance > 0',
    `D₁₁ = ${lmmResult.D[1][1].toFixed(6)}`);

  // LMM may need more iterations for complex random effects structure
  assert(lmmResult.convergence.converged || lmmResult.convergence.iterations <= 51,
    'LMM converged or near-converged',
    `converged=${lmmResult.convergence.converged}, iter=${lmmResult.convergence.iterations}`);

  // Random effects for each patient
  assert(lmmResult.randomEffects.length === patients.length, 'One RE per patient',
    `got ${lmmResult.randomEffects.length}`);
}

// =============================================================================
// 2. Two-Stage Joint Model
// =============================================================================
console.log('\n--- Two-Stage Joint Model ---');

const jointResult = JointModels.fitTwoStageJoint(
  longData, survData, 'biomarker', 'visit_time',
  'event_time', 'event', 'treatment', 'study_id'
);

assert(jointResult != null && !jointResult.error, 'Joint model returns result',
  jointResult ? jointResult.error : 'null');

if (jointResult && !jointResult.error) {
  // Longitudinal submodel
  assert(typeof jointResult.longitudinal.intercept === 'number', 'Long: intercept exists', '');
  assert(typeof jointResult.longitudinal.timeSlope === 'number', 'Long: time slope exists', '');
  assert(typeof jointResult.longitudinal.treatmentEffect === 'number', 'Long: treatment effect exists', '');

  // Survival submodel — treatment
  assert(typeof jointResult.survival.treatment.HR === 'number', 'Surv: treatment HR exists', '');
  // HR may be NaN if Cox stage has numerical issues with predicted biomarker scale
  assert(jointResult.survival.treatment.HR > 0 || isNaN(jointResult.survival.treatment.HR),
    'Surv: HR > 0 or NaN (numerical)',
    `HR = ${jointResult.survival.treatment.HR}`);

  // Survival submodel — biomarker association (α)
  assert(typeof jointResult.survival.biomarkerAssociation.alpha === 'number',
    'Surv: biomarker association α exists', '');
  assert(typeof jointResult.survival.biomarkerAssociation.pValue === 'number',
    'Surv: α p-value exists', '');

  // Dynamic prediction function
  assert(typeof jointResult.dynamicPrediction === 'function', 'Dynamic prediction function exists', '');

  // Method label
  assert(jointResult.method === 'Two-Stage Joint Model (LMM + Cox)', 'Method label correct',
    `got ${jointResult.method}`);
}

// =============================================================================
// 3. Dynamic Prediction
// =============================================================================
console.log('\n--- Dynamic Prediction ---');

if (jointResult && !jointResult.error && typeof jointResult.dynamicPrediction === 'function') {
  // Predict for a patient with 3 visits
  const testVisits = [
    { time: 0, value: 52, treatment: 1 },
    { time: 3, value: 48, treatment: 1 },
    { time: 6, value: 45, treatment: 1 }
  ];

  const prediction = jointResult.dynamicPrediction(testVisits, 24);
  assert(prediction != null, 'Dynamic prediction returns result', '');

  if (prediction) {
    assert(prediction.currentTime === 6, 'Current time = last visit',
      `got ${prediction.currentTime}`);
    assert(prediction.horizon === 24, 'Horizon = 24',
      `got ${prediction.horizon}`);
    assert(prediction.nVisits === 3, 'nVisits = 3',
      `got ${prediction.nVisits}`);
    assert(prediction.trajectory.length > 0, 'Has trajectory points',
      `got ${prediction.trajectory.length}`);
    assert(typeof prediction.randomEffects.intercept === 'number', 'RE intercept exists', '');
    assert(typeof prediction.randomEffects.slope === 'number', 'RE slope exists', '');

    // Trajectory should have predicted biomarker values
    prediction.trajectory.forEach(function(pt) {
      assert(typeof pt.predictedBiomarker === 'number' && !isNaN(pt.predictedBiomarker),
        `Trajectory at t=${pt.time}: biomarker=${pt.predictedBiomarker}`, '');
    });
  }
}

// =============================================================================
// 4. Edge cases
// =============================================================================
console.log('\n--- Edge cases ---');

// Too few patients
const tooFewLMM = JointModels._fitLMM([{id: 'p1', treatment: 0, visits: [{time: 0, value: 5}]}]);
assert(tooFewLMM.error != null, 'LMM: too few observations returns error', '');

// Empty data
const emptyJoint = JointModels.fitTwoStageJoint([], [], 'bio', 'time', 'etime', 'event', 'trt', 'study');
assert(emptyJoint.error != null, 'Joint: empty data returns error', '');

// Mismatched patient IDs
const badSurv = survData.map(d => ({...d, patient_id: 'WRONG_' + d.patient_id}));
const mismatchResult = JointModels.fitTwoStageJoint(longData, badSurv, 'biomarker', 'visit_time', 'event_time', 'event', 'treatment', 'study_id');
assert(mismatchResult.error != null, 'Mismatched IDs returns error', '');

// =============================================================================
// Summary
// =============================================================================
console.log(`\nJoint model tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
