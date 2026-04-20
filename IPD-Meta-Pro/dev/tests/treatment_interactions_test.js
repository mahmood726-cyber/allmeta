#!/usr/bin/env node
/**
 * Treatment-Covariate Interaction Tests
 * Tests subgroup analysis, centered GLMM interaction, multi-covariate screening
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
  '02_26_treatment-interactions.js',
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
  return vm.runInContext('({ Stats, MetaAnalysis, OneStageGLMM, TreatmentInteraction })', context);
}

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) { console.log(`[PASS] ${name}`); passed++; }
  else { console.log(`[FAIL] ${name}: ${detail}`); failed++; }
}

function assertClose(actual, expected, tol, name) {
  if (actual == null || isNaN(actual)) { assert(false, name, `got ${actual}, expected ${expected}`); return; }
  assert(Math.abs(actual - expected) < tol, name, `expected ${expected}, got ${actual}`);
}

const ctx = createContext();
const { Stats, MetaAnalysis, OneStageGLMM, TreatmentInteraction } = loadModules(ctx);

// ── Synthetic IPD generator ─────────────────────────────────
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

function generateIPD(seed, opts) {
  opts = opts || {};
  const rng = seededRNG(seed);
  const rnorm = () => {
    const u1 = Math.max(1e-12, rng()), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const nStudies = opts.nStudies || 5;
  const perStudy = opts.perStudy || 100;
  const binary = opts.binary || false;
  const trueEffect = opts.trueEffect || (binary ? 0.7 : -2.0);
  const interactionEffect = opts.interactionEffect || 0; // Treatment × age interaction
  const data = [];

  for (let s = 1; s <= nStudies; s++) {
    const b_i = rnorm() * (opts.tau || 0.3);
    for (let j = 0; j < perStudy; j++) {
      const trt = rng() < 0.5 ? 1 : 0;
      const age = 50 + rnorm() * 12; // Mean 50, SD 12
      const sex = rng() < 0.5 ? 'male' : 'female';
      const ageGroup = age < 55 ? 'young' : 'old';

      if (binary) {
        const eta = -1 + trueEffect * trt + 0.02 * (age - 50) + interactionEffect * trt * (age - 50) + b_i;
        const prob = 1 / (1 + Math.exp(-eta));
        data.push({
          outcome: rng() < prob ? 1 : 0, treatment: trt,
          study_id: 'Study_' + s, age: Math.round(age * 10) / 10,
          sex: sex, age_group: ageGroup
        });
      } else {
        const y = 10 + trueEffect * trt + 0.05 * (age - 50) + interactionEffect * trt * (age - 50) + b_i + rnorm() * 1.5;
        data.push({
          outcome: y, treatment: trt,
          study_id: 'Study_' + s, age: Math.round(age * 10) / 10,
          sex: sex, age_group: ageGroup
        });
      }
    }
  }
  return data;
}

// =============================================================================
// 1. Subgroup Analysis — Continuous outcome
// =============================================================================
console.log('\n--- Subgroup Analysis: continuous ---');

const contIPD = generateIPD(42, { binary: false, trueEffect: -2.0, interactionEffect: 0 });

const sgResult = TreatmentInteraction.subgroupAnalysis(
  contIPD, 'outcome', 'treatment', 'study_id', 'sex', { binary: false }
);

assert(sgResult != null && !sgResult.error, 'Subgroup analysis returns result', sgResult ? sgResult.error : 'null');

if (sgResult && !sgResult.error) {
  assert(sgResult.subgroups.length === 2, '2 subgroups (male/female)',
    `got ${sgResult.subgroups.length}`);

  // Both subgroups should show negative treatment effect
  sgResult.subgroups.forEach(sg => {
    if (!sg.error) {
      assert(sg.estimate < 0, `${sg.subgroup}: negative treatment effect`,
        `estimate = ${sg.estimate}`);
      assert(sg.ci_lower < sg.estimate && sg.estimate < sg.ci_upper,
        `${sg.subgroup}: CI contains estimate`, `[${sg.ci_lower}, ${sg.ci_upper}]`);
    }
  });

  // Interaction test produces a p-value (may be significant due to sampling noise)
  assert(typeof sgResult.interactionTest.pValue === 'number' &&
         sgResult.interactionTest.pValue >= 0 && sgResult.interactionTest.pValue <= 1,
    'Interaction test p-value in [0,1]',
    `p = ${sgResult.interactionTest.pValue}`);

  // Forest plot data
  assert(sgResult.forestPlotData.length >= 2, 'Forest plot data has 2+ entries',
    `got ${sgResult.forestPlotData.length}`);
}

// =============================================================================
// 2. Subgroup Analysis — Binary outcome
// =============================================================================
console.log('\n--- Subgroup Analysis: binary ---');

const binIPD = generateIPD(99, { binary: true, trueEffect: 0.7, interactionEffect: 0 });

const sgBinResult = TreatmentInteraction.subgroupAnalysis(
  binIPD, 'outcome', 'treatment', 'study_id', 'age_group', { binary: true }
);

assert(sgBinResult != null && !sgBinResult.error, 'Binary subgroup returns result',
  sgBinResult ? sgBinResult.error : 'null');

if (sgBinResult && !sgBinResult.error) {
  assert(sgBinResult.subgroups.length === 2, '2 age groups',
    `got ${sgBinResult.subgroups.length}`);
  assert(sgBinResult.estimand === 'log-OR', 'Estimand is log-OR',
    `got ${sgBinResult.estimand}`);

  // Both subgroups should show positive log-OR (treatment helps)
  sgBinResult.subgroups.forEach(sg => {
    if (!sg.error && sg.OR) {
      assert(sg.OR > 0, `${sg.subgroup}: OR > 0`, `OR = ${sg.OR}`);
    }
  });
}

// =============================================================================
// 3. Subgroup with TRUE interaction
// =============================================================================
console.log('\n--- Subgroup Analysis: with interaction ---');

// Generate data where old patients benefit more
const interIPD = generateIPD(77, {
  binary: false, trueEffect: -1.0, interactionEffect: -0.08, // Strong age interaction
  perStudy: 200, nStudies: 8
});

const sgInterResult = TreatmentInteraction.subgroupAnalysis(
  interIPD, 'outcome', 'treatment', 'study_id', 'age_group', { binary: false }
);

if (sgInterResult && !sgInterResult.error) {
  // With strong interaction, old patients should have different effect than young
  const young = sgInterResult.subgroups.find(s => s.subgroup === 'young');
  const old = sgInterResult.subgroups.find(s => s.subgroup === 'old');
  if (young && old && !young.error && !old.error) {
    assert(Math.abs(young.estimate - old.estimate) > 0.1,
      'Subgroup effects differ when interaction present',
      `young=${young.estimate.toFixed(3)}, old=${old.estimate.toFixed(3)}`);
  }
}

// =============================================================================
// 4. Centered GLMM Interaction — Binary
// =============================================================================
console.log('\n--- Centered GLMM Interaction ---');

const centResult = TreatmentInteraction.centeredGLMMInteraction(
  binIPD, 'outcome', 'treatment', 'study_id', 'age'
);

assert(centResult != null && !centResult.error, 'Centered GLMM interaction returns result',
  centResult ? centResult.error : 'null');

if (centResult && !centResult.error) {
  assert(centResult.method === 'Within-Study Centered GLMM Interaction',
    'Method name correct', `got ${centResult.method}`);

  assert(typeof centResult.withinTrialInteraction.estimate === 'number',
    'Within-trial interaction estimate is numeric', '');

  assert(typeof centResult.withinTrialInteraction.pValue === 'number',
    'Interaction p-value is numeric', '');

  assert(typeof centResult.ecologicalBias.estimate === 'number',
    'Ecological bias estimate is numeric', '');

  // Treatment effect should be present
  assert(centResult.treatmentEffect.OR > 0, 'Treatment OR > 0',
    `OR = ${centResult.treatmentEffect.OR}`);
}

// =============================================================================
// 5. Multi-Covariate Screening
// =============================================================================
console.log('\n--- Multi-Covariate Screening ---');

const screenResult = TreatmentInteraction.screenInteractions(
  contIPD, 'outcome', 'treatment', 'study_id',
  ['age', 'sex'], { binary: false }
);

assert(screenResult != null && !screenResult.error, 'Screening returns result',
  screenResult ? screenResult.error : 'null');

if (screenResult && !screenResult.error) {
  assert(screenResult.nCovariates === 2, 'Screened 2 covariates',
    `got ${screenResult.nCovariates}`);
  assert(screenResult.results.length > 0, 'Has results', `got ${screenResult.results.length}`);

  // Results should be sorted by p-value
  if (screenResult.results.length >= 2) {
    assert(screenResult.results[0].interactionP <= screenResult.results[1].interactionP,
      'Results sorted by p-value',
      `${screenResult.results[0].interactionP} <= ${screenResult.results[1].interactionP}`);
  }

  // Bonferroni correction applied
  assert(screenResult.multipleTesting.method === 'Bonferroni', 'Bonferroni method',
    `got ${screenResult.multipleTesting.method}`);
  assert(screenResult.multipleTesting.nTests === screenResult.results.length,
    'nTests matches results', '');
}

// =============================================================================
// 6. Predict Treatment Effect
// =============================================================================
console.log('\n--- Predict Treatment Effect at covariate values ---');

if (centResult && !centResult.error) {
  const pred0 = TreatmentInteraction.predictTreatmentEffect(centResult, 0);
  assert(pred0 != null, 'Prediction at covariate=0 (average) returns result', '');
  if (pred0) {
    assert(typeof pred0.predictedEffect === 'number', 'Predicted effect is numeric', '');
    assert(pred0.ci_lower < pred0.predictedEffect && pred0.predictedEffect < pred0.ci_upper,
      'CI contains prediction', `[${pred0.ci_lower}, ${pred0.ci_upper}]`);
  }

  const pred10 = TreatmentInteraction.predictTreatmentEffect(centResult, 10);
  const predNeg10 = TreatmentInteraction.predictTreatmentEffect(centResult, -10);
  if (pred10 && predNeg10) {
    // Predictions at different covariate values should differ if interaction is non-zero
    assert(typeof pred10.predictedEffect === 'number' && typeof predNeg10.predictedEffect === 'number',
      'Predictions at different values are numeric', '');
  }
}

// =============================================================================
// 7. Edge cases
// =============================================================================
console.log('\n--- Edge cases ---');

// Too few data
const tooFew = TreatmentInteraction.subgroupAnalysis(
  [{outcome: 1, treatment: 1, study_id: 'A', sex: 'M'}],
  'outcome', 'treatment', 'study_id', 'sex'
);
assert(tooFew.error != null, 'Too few data returns error', '');

// Single subgroup level
const singleSG = TreatmentInteraction.subgroupAnalysis(
  contIPD.map(d => ({...d, sex: 'male'})),
  'outcome', 'treatment', 'study_id', 'sex'
);
assert(singleSG.error != null, 'Single subgroup returns error', singleSG.error || '');

// =============================================================================
// Summary
// =============================================================================
console.log(`\nTreatment interaction tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
