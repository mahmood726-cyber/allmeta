#!/usr/bin/env node
/* Fast DOM-free smoke tests for the extracted Stats/MetaAnalysis core. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const moduleDir = path.join(repoRoot, 'dev', 'modules');

globalThis.window = globalThis;
globalThis.APP = {
  config: {
    confLevel: 0.95,
    useHKSJ: false,
  },
};

function loadModule(filename, exposes) {
  const filePath = path.join(moduleDir, filename);
  let code = fs.readFileSync(filePath, 'utf8');
  if (exposes && exposes.length) {
    code += '\n' + exposes.map((name) => `globalThis.${name} = ${name};`).join('\n');
  }
  vm.runInThisContext(code, { filename: filePath });
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message} expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`[PASS] ${name}`);
  } catch (error) {
    results.push({ name, pass: false, detail: error.message });
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

loadModule('02_06_stats.js', ['Stats']);
loadModule('02_07_confidence-utils.js', ['getConfZ']);
loadModule('02_08_meta-analysis.js', ['MetaAnalysis']);
loadModule('02_21_benchmark-datasets.js', ['BENCHMARK_DATASETS']);

test('Stats exposes population and sample SD semantics explicitly', () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9];
  assertClose(Stats.sd(values), 2.0, 1e-9, 'population sd mismatch');
  assertClose(Stats.sd(values, 1), Math.sqrt(32 / 7), 1e-9, 'sample sd mismatch');
});

test('Stats normal quantile remains aligned with standard confidence thresholds', () => {
  assertClose(Stats.normalQuantile(0.975), 1.959963984540054, 1e-3, '0.975 quantile mismatch');
  assertClose(getConfZ(), 1.959963984540054, 1e-3, 'confidence helper mismatch');
});

test('MetaAnalysis fixed effect matches canonical homogeneous benchmark', () => {
  const benchmark = BENCHMARK_DATASETS.homogeneous;
  const effects = benchmark.studies.map((study) => study.yi);
  const variances = benchmark.studies.map((study) => study.sei * study.sei);
  const result = MetaAnalysis.fixedEffect(effects, variances);
  assertClose(result.effect, benchmark.expected.FE.estimate, 5e-4, 'fixed-effect estimate mismatch');
  assertClose(result.se, benchmark.expected.FE.se, 5e-4, 'fixed-effect se mismatch');
  assertTrue(Array.isArray(result.ci) && result.ci.length === 2, 'fixed-effect CI fields missing');
});

test('MetaAnalysis DL matches canonical BCG benchmark', () => {
  const benchmark = BENCHMARK_DATASETS.bcg;
  const effects = benchmark.studies.map((study) => study.yi);
  const variances = benchmark.studies.map((study) => study.sei * study.sei);
  const result = MetaAnalysis.randomEffectsDL(effects, variances);
  assertClose(result.effect, benchmark.expected.DL.estimate, 5e-4, 'DL estimate mismatch');
  assertClose(result.se, benchmark.expected.DL.se, 5e-4, 'DL se mismatch');
  assertClose(result.tau2, benchmark.expected.DL.tau2, 5e-4, 'DL tau2 mismatch');
  assertClose(result.I2, benchmark.expected.DL.I2, 0.05, 'DL I2 mismatch');
});

test('MetaAnalysis REML matches canonical BCG benchmark', () => {
  const benchmark = BENCHMARK_DATASETS.bcg;
  const effects = benchmark.studies.map((study) => study.yi);
  const variances = benchmark.studies.map((study) => study.sei * study.sei);
  const result = MetaAnalysis.randomEffectsREML(effects, variances);
  assertClose(result.effect, benchmark.expected.REML.estimate, 5e-4, 'REML estimate mismatch');
  assertClose(result.se, benchmark.expected.REML.se, 5e-4, 'REML se mismatch');
  assertClose(result.tau2, benchmark.expected.REML.tau2, 1e-3, 'REML tau2 mismatch');
  assertTrue(Number.isFinite(result.lower) && Number.isFinite(result.upper), 'REML CI fields missing');
});

test('HKSJ exposes widened interval fields without DOM dependencies', () => {
  const benchmark = BENCHMARK_DATASETS.bcg;
  const effects = benchmark.studies.map((study) => study.yi);
  const variances = benchmark.studies.map((study) => study.sei * study.sei);
  const base = MetaAnalysis.randomEffectsREML(effects, variances);
  const adjusted = MetaAnalysis.applyHKSJ(base, effects, variances);
  const baseWidth = base.upper - base.lower;
  const hksjWidth = adjusted.upperHKSJ - adjusted.lowerHKSJ;
  assertTrue(Number.isFinite(adjusted.seHKSJ), 'HKSJ adjusted SE missing');
  assertTrue(Number.isFinite(adjusted.lowerHKSJ) && Number.isFinite(adjusted.upperHKSJ), 'HKSJ interval fields missing');
  assertTrue(hksjWidth >= baseWidth, 'HKSJ interval should not shrink below base CI');
});

const passed = results.filter((result) => result.pass).length;
const total = results.length;
console.log(`\n${passed} / ${total} core smoke tests passed`);
if (passed !== total) {
  process.exit(1);
}
