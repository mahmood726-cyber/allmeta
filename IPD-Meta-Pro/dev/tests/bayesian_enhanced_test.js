#!/usr/bin/env node
/**
 * Enhanced Bayesian Meta-Analysis Tests
 * Tests prior sensitivity, DIC/WAIC, meta-regression, shrinkage, posterior predictive
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT, 'dev', 'modules');
const MODULE_FILES = [
  '02_06_stats.js', '02_07_confidence-utils.js', '02_08_meta-analysis.js',
  '02_10_seeded-rng.js', '02_11_bayesian-mcmc.js',
  '02_21_benchmark-datasets.js', '02_30_bayesian-enhanced.js',
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
  return vm.runInContext('({ Stats, MetaAnalysis, BayesianMCMC, BayesianEnhanced, BENCHMARK_DATASETS, createSeededRNG })', context);
}

let passed = 0, failed = 0;
function assert(cond, name, detail) { if (cond) { console.log(`[PASS] ${name}`); passed++; } else { console.log(`[FAIL] ${name}: ${detail}`); failed++; } }

const ctx = createContext();
const { Stats, MetaAnalysis, BayesianMCMC, BayesianEnhanced, BENCHMARK_DATASETS } = loadModules(ctx);

// BCG benchmark data
const bcg = BENCHMARK_DATASETS.bcg;
const effects = bcg.studies.map(s => s.yi);
const variances = bcg.studies.map(s => s.sei * s.sei);

// Run base MCMC once (used by multiple tests)
console.log('\n--- Running base MCMC (may take a moment) ---');
const baseMCMC = BayesianMCMC.runMCMC(effects, variances, { iterations: 5000, burnin: 1000, chains: 2, seed: 42 });
assert(baseMCMC != null && baseMCMC.converged !== undefined, 'Base MCMC completed', '');

// =============================================================================
// 1. Prior Sensitivity
// =============================================================================
console.log('\n--- Prior Sensitivity Analysis ---');

const sensResult = BayesianEnhanced.priorSensitivity(effects, variances, { iterations: 3000, burnin: 500 });

assert(sensResult != null && !sensResult.error, 'Prior sensitivity returns result',
  sensResult ? sensResult.error : 'null');

if (sensResult && !sensResult.error) {
  assert(sensResult.results.length >= 4, 'At least 4 prior specs tested',
    `got ${sensResult.results.length}`);

  // All results should have mu estimates
  sensResult.results.forEach(r => {
    assert(typeof r.mu.mean === 'number' && !isNaN(r.mu.mean),
      `${r.prior}: mu.mean is numeric`, `got ${r.mu.mean}`);
  });

  // Sensitivity assessment
  assert(typeof sensResult.sensitivity.muRange === 'number', 'Has muRange', '');
  assert(typeof sensResult.sensitivity.robust === 'boolean', 'Has robust flag', '');
  assert(sensResult.sensitivity.interpretation.length > 0, 'Has interpretation', '');

  // All results should agree on direction (BCG is protective)
  const allNeg = sensResult.results.every(r => r.mu.mean < 0);
  assert(allNeg, 'All priors agree BCG effect is negative', '');
}

// =============================================================================
// 2. DIC
// =============================================================================
console.log('\n--- DIC ---');

const dicResult = BayesianEnhanced.computeDIC(effects, variances, baseMCMC);
assert(dicResult != null, 'DIC returns result', '');

if (dicResult) {
  assert(typeof dicResult.DIC === 'number' && !isNaN(dicResult.DIC), 'DIC is numeric', `got ${dicResult.DIC}`);
  assert(typeof dicResult.pD === 'number', 'pD is numeric', `got ${dicResult.pD}`);
  assert(dicResult.pD > 0 && dicResult.pD < effects.length + 2, 'pD in reasonable range',
    `pD = ${dicResult.pD.toFixed(2)}`);
}

// =============================================================================
// 3. WAIC
// =============================================================================
console.log('\n--- WAIC ---');

const waicResult = BayesianEnhanced.computeWAIC(effects, variances, baseMCMC);
assert(waicResult != null, 'WAIC returns result', '');

if (waicResult) {
  assert(typeof waicResult.WAIC === 'number' && !isNaN(waicResult.WAIC), 'WAIC is numeric', `got ${waicResult.WAIC}`);
  assert(typeof waicResult.pWAIC === 'number', 'pWAIC is numeric', `got ${waicResult.pWAIC}`);
  assert(waicResult.pWAIC > 0, 'pWAIC > 0', `pWAIC = ${waicResult.pWAIC}`);
}

// =============================================================================
// 4. Bayesian Meta-Regression
// =============================================================================
console.log('\n--- Bayesian Meta-Regression ---');

// Use study year as covariate
const years = bcg.studies.map(s => s.year || 1970);
const regResult = BayesianEnhanced.bayesianMetaRegression(effects, variances, years,
  { iterations: 5000, burnin: 1000, seed: 42 });

assert(regResult != null && !regResult.error, 'Meta-regression returns result',
  regResult ? regResult.error : 'null');

if (regResult && !regResult.error) {
  assert(typeof regResult.intercept.mean === 'number', 'Intercept mean is numeric', '');
  assert(typeof regResult.slope.mean === 'number', 'Slope mean is numeric', '');
  assert(typeof regResult.slope.probPositive === 'number', 'Slope probPositive exists', '');
  assert(regResult.slope.probPositive >= 0 && regResult.slope.probPositive <= 1,
    'probPositive in [0,1]', `got ${regResult.slope.probPositive}`);
  assert(typeof regResult.tau.mean === 'number' && regResult.tau.mean >= 0,
    'Residual tau >= 0', `got ${regResult.tau.mean}`);
}

// =============================================================================
// 5. Shrinkage Estimates
// =============================================================================
console.log('\n--- Shrinkage Estimates ---');

const shrinkResult = BayesianEnhanced.computeShrinkage(effects, variances, baseMCMC);
assert(shrinkResult != null, 'Shrinkage returns result', '');

if (shrinkResult) {
  assert(shrinkResult.studies.length === effects.length, 'One estimate per study',
    `got ${shrinkResult.studies.length}`);

  shrinkResult.studies.forEach((s, i) => {
    // Shrunken estimate should be between observed and pooled
    const obsSign = Math.sign(s.observed - shrinkResult.pooledMean);
    const shrSign = Math.sign(s.shrunken - shrinkResult.pooledMean);
    // They should be on the same side of the pooled mean (or very close)
    assert(typeof s.shrunken === 'number' && !isNaN(s.shrunken),
      `Study ${i+1}: shrunken estimate is numeric`, '');
    assert(s.shrinkageFactor >= 0 && s.shrinkageFactor <= 1,
      `Study ${i+1}: shrinkage factor in [0,1]`, `got ${s.shrinkageFactor}`);
  });
}

// =============================================================================
// 6. Posterior Predictive
// =============================================================================
console.log('\n--- Posterior Predictive ---');

const predResult = BayesianEnhanced.posteriorPredictive(baseMCMC);
assert(predResult != null, 'Posterior predictive returns result', '');

if (predResult) {
  assert(typeof predResult.mean === 'number', 'Predictive mean is numeric', '');
  assert(predResult.lower95 < predResult.upper95, 'Predictive CI is valid',
    `[${predResult.lower95.toFixed(3)}, ${predResult.upper95.toFixed(3)}]`);
  // Predictive interval should be wider than pooled CI
  assert(predResult.lower95 < baseMCMC.mu.lower, 'Predictive lower < pooled lower',
    `pred=${predResult.lower95.toFixed(3)}, pooled=${baseMCMC.mu.lower.toFixed(3)}`);
  assert(predResult.upper95 > baseMCMC.mu.upper, 'Predictive upper > pooled upper',
    `pred=${predResult.upper95.toFixed(3)}, pooled=${baseMCMC.mu.upper.toFixed(3)}`);
  assert(predResult.probNegative >= 0 && predResult.probNegative <= 1,
    'probNegative in [0,1]', `got ${predResult.probNegative}`);
}

// =============================================================================
// 7. Bayesian Forest Plot
// =============================================================================
console.log('\n--- Bayesian Forest Plot ---');

const fpResult = BayesianEnhanced.bayesianForestPlot(effects, variances, baseMCMC,
  bcg.studies.map(s => s.study));

assert(fpResult != null, 'Forest plot returns result', '');

if (fpResult) {
  assert(fpResult.studies.length === effects.length, 'Correct study count', '');
  assert(fpResult.pooled != null, 'Has pooled estimate', '');
  assert(fpResult.prediction != null, 'Has prediction interval', '');

  // First study label
  assert(fpResult.studies[0].label === bcg.studies[0].study, 'First study label matches',
    `got ${fpResult.studies[0].label}`);

  // Each study has observed and shrunken
  fpResult.studies.forEach(s => {
    assert(typeof s.observed === 'number' && typeof s.shrunken === 'number',
      `${s.label}: has observed and shrunken`, '');
  });
}

// =============================================================================
// Summary
// =============================================================================
console.log(`\nBayesian enhanced tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
