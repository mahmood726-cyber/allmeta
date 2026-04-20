const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT, 'dev', 'modules');
const ARTIFACT_PATH = path.join(ROOT, 'dev', 'benchmarks', 'latest_core_stats_meta_test.json');
const MODULE_FILES = [
  '02_06_stats.js',
  '02_07_confidence-utils.js',
  '02_08_meta-analysis.js',
  '02_09_survival-analysis.js',
  '02_21_benchmark-datasets.js',
];

function createContext() {
  const context = {
    console,
    Math,
    Number,
    Date,
    JSON,
    Array,
    Object,
    String,
    Boolean,
    RegExp,
    parseFloat,
    parseInt,
    isFinite,
    Infinity,
    NaN,
    setTimeout,
    clearTimeout,
    APP: { config: { confLevel: 0.95 } },
    document: {
      createElement() {
        return {
          style: {},
          classList: { add() {}, remove() {} },
          appendChild() {},
          querySelector() { return null; },
          querySelectorAll() { return []; },
          remove() {},
          innerHTML: '',
          textContent: '',
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
  return vm.runInContext('({ Stats, getConfZ, MetaAnalysis, SurvivalAnalysis, BENCHMARK_DATASETS })', context);
}

function extractFunctionSource(source, functionName) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`missing function ${functionName}`);
  }
  let braceIndex = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unterminated function ${functionName}`);
}

const tests = [];

function recordTest(name, status, detail = '') {
  tests.push({ name, status, detail });
  const prefix = status === 'PASS' ? '[PASS]' : '[FAIL]';
  console.log(`${prefix} ${name}${detail ? ` - ${detail}` : ''}`);
}

function assertClose(name, actual, expected, tolerance) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`expected ${expected}, got ${actual}, tolerance ${tolerance}`);
  }
  recordTest(name, 'PASS');
}

function assertTrue(name, condition, detail) {
  if (!condition) {
    throw new Error(detail || 'assertion failed');
  }
  recordTest(name, 'PASS');
}

function run() {
  const context = createContext();
  const api = loadModules(context);
  const { Stats, getConfZ, MetaAnalysis, SurvivalAnalysis, BENCHMARK_DATASETS } = api;

  assertClose('Stats.mean returns arithmetic mean', Stats.mean([1, 2, 3, 4, 5]), 3, 1e-12);
  assertClose('Stats.sd default matches population SD', Stats.sd([2, 4, 4, 4, 5, 5, 7, 9]), 2, 1e-9);
  assertClose('Stats.sd sample mode remains available', Stats.sd([2, 4, 4, 4, 5, 5, 7, 9], 1), 2.138089935, 1e-6);

  context.APP.config.confLevel = 0.95;
  assertClose('getConfZ honors 95% confidence', getConfZ(), 1.959963986, 1e-6);
  context.APP.config.confLevel = 0.99;
  assertClose('getConfZ honors 99% confidence', getConfZ(), 2.575829304, 1e-6);
  context.APP.config.confLevel = 0.95;

  const kmTerminal = SurvivalAnalysis.kaplanMeier([1, 1], [1, 1]);
  const terminalPoint = kmTerminal[kmTerminal.length - 1];
  assertClose('SurvivalAnalysis.kaplanMeier preserves terminal zero survival', terminalPoint.survival, 0, 1e-12);
  assertTrue(
    'SurvivalAnalysis.kaplanMeier avoids null CI/SE when the final risk set is exhausted',
    Number.isFinite(terminalPoint.se)
      && terminalPoint.se === 0
      && terminalPoint.ciLower === 0
      && terminalPoint.ciUpper === 0,
    JSON.stringify(terminalPoint),
  );

  const logRankNoEvents = SurvivalAnalysis.logRankTest([1], [0], [1], [0]);
  assertTrue(
    'SurvivalAnalysis.logRankTest returns a neutral result when variance is zero',
    logRankNoEvents.V === 0 && logRankNoEvents.chiSq === 0 && logRankNoEvents.p === 1,
    JSON.stringify(logRankNoEvents),
  );

  const runAnalysisSource = fs.readFileSync(path.join(MODULES_DIR, '02_17_run-analysis.js'), 'utf8');
  const armHelperContext = createContext();
  vm.runInContext(
    [
      extractFunctionSource(runAnalysisSource, 'ipdNormalizeArmToken'),
      extractFunctionSource(runAnalysisSource, 'ipdResolveBinaryArmMapping'),
      extractFunctionSource(runAnalysisSource, 'ipdSplitBinaryArms'),
      'this.__armHelpers = { ipdNormalizeArmToken, ipdResolveBinaryArmMapping, ipdSplitBinaryArms };',
    ].join('\n'),
    armHelperContext,
    { filename: '02_17_run-analysis.js' },
  );
  const armHelpers = armHelperContext.__armHelpers;
  const numericStringMapping = armHelpers.ipdResolveBinaryArmMapping([
    { arm: '1' },
    { arm: '0' },
    { arm: '1' },
  ], 'arm');
  assertTrue(
    'ipdResolveBinaryArmMapping accepts string 1/0 treatment labels',
    !numericStringMapping.error && numericStringMapping.treatmentToken === '1' && numericStringMapping.controlToken === '0',
    JSON.stringify(numericStringMapping),
  );
  const placeboMapping = armHelpers.ipdResolveBinaryArmMapping([
    { arm: 'Intervention' },
    { arm: 'Placebo' },
    { arm: 'Intervention' },
  ], 'arm');
  const splitArms = armHelpers.ipdSplitBinaryArms([
    { arm: 'Intervention', id: 1 },
    { arm: 'Placebo', id: 2 },
    { arm: 'Intervention', id: 3 },
  ], 'arm', placeboMapping);
  assertTrue(
    'ipdResolveBinaryArmMapping preserves intervention/placebo arm splits',
    !placeboMapping.error
      && placeboMapping.treatmentLabel === 'Intervention'
      && placeboMapping.controlLabel === 'Placebo'
      && splitArms.treat1.length === 2
      && splitArms.treat0.length === 1,
    JSON.stringify({ placeboMapping, splitArms }),
  );
  const ambiguousMapping = armHelpers.ipdResolveBinaryArmMapping([
    { arm: 'A' },
    { arm: 'B' },
  ], 'arm');
  assertTrue(
    'ipdResolveBinaryArmMapping rejects ambiguous arm coding',
    !!ambiguousMapping.error && ambiguousMapping.error.includes('ambiguous'),
    JSON.stringify(ambiguousMapping),
  );

  const virtualScrollerSource = fs.readFileSync(path.join(MODULES_DIR, '02_20_virtual-scroller.js'), 'utf8');
  const prismaHelperContext = createContext();
  vm.runInContext(
    [
      extractFunctionSource(virtualScrollerSource, 'ipdHashString'),
      extractFunctionSource(virtualScrollerSource, 'ipdCreateDeterministicSampler'),
      extractFunctionSource(virtualScrollerSource, 'ipdResolvePrismaStudyLabels'),
      extractFunctionSource(virtualScrollerSource, 'ipdResolvePrismaOutcomeField'),
      extractFunctionSource(virtualScrollerSource, 'ipdCountAnalyzedParticipants'),
      extractFunctionSource(virtualScrollerSource, 'ipdBuildPrismaFlowSummary'),
      extractFunctionSource(virtualScrollerSource, 'ipdFormatRobJudgment'),
      'this.__prismaHelpers = { ipdCreateDeterministicSampler, ipdResolvePrismaStudyLabels, ipdBuildPrismaFlowSummary, ipdFormatRobJudgment };',
    ].join('\n'),
    prismaHelperContext,
    { filename: '02_20_virtual-scroller.js' },
  );
  const prismaHelpers = prismaHelperContext.__prismaHelpers;
  const prismaStudies = prismaHelpers.ipdResolvePrismaStudyLabels(
    [
      { trial_label: 'Study A', outcome_flag: 1 },
      { trial_label: 'Study B', outcome_flag: '' },
      { trial_label: 'Study A', outcome_flag: 0 },
    ],
    { studyVar: 'trial_label', eventVar: 'outcome_flag' },
    {},
  );
  const flowSummary = prismaHelpers.ipdBuildPrismaFlowSummary(
    prismaStudies,
    [
      { trial_label: 'Study A', outcome_flag: 1 },
      { trial_label: 'Study B', outcome_flag: '' },
      { trial_label: 'Study A', outcome_flag: 0 },
    ],
    { studyVar: 'trial_label', eventVar: 'outcome_flag' },
  );
  assertTrue(
    'PRISMA-IPD flow summary is dataset-derived and deterministic',
    prismaStudies.length === 2
      && flowSummary.identified === 2
      && flowSummary.ipdObtained === 2
      && flowSummary.analyzed === 2
      && flowSummary.note.includes('not recoverable'),
    JSON.stringify({ prismaStudies, flowSummary }),
  );
  assertTrue(
    'PRISMA-IPD risk of bias labels fall back to not assessed instead of random values',
    prismaHelpers.ipdFormatRobJudgment('high') === 'High'
      && prismaHelpers.ipdFormatRobJudgment('some') === 'Some concerns'
      && prismaHelpers.ipdFormatRobJudgment('') === 'Not assessed',
    JSON.stringify({
      high: prismaHelpers.ipdFormatRobJudgment('high'),
      some: prismaHelpers.ipdFormatRobJudgment('some'),
      empty: prismaHelpers.ipdFormatRobJudgment(''),
    }),
  );
  const samplerA = prismaHelpers.ipdCreateDeterministicSampler(12345);
  const samplerB = prismaHelpers.ipdCreateDeterministicSampler(12345);
  const samplerSeqA = [samplerA(), samplerA(), samplerA()];
  const samplerSeqB = [samplerB(), samplerB(), samplerB()];
  assertTrue(
    'ipdCreateDeterministicSampler produces reproducible sequences',
    samplerSeqA.every((value, index) => Math.abs(value - samplerSeqB[index]) < 1e-12),
    JSON.stringify({ samplerSeqA, samplerSeqB }),
  );
  const prismaSection = virtualScrollerSource.slice(
    virtualScrollerSource.indexOf('const PRISMAIPDGenerator = {'),
    virtualScrollerSource.indexOf('generateChecklist: function()'),
  );
  assertTrue(
    'PRISMAIPDGenerator avoids Math.random placeholders',
    !/Math\.random\(/.test(prismaSection),
    prismaSection.match(/Math\.random\(/g),
  );
  const goshSection = virtualScrollerSource.slice(
    virtualScrollerSource.indexOf('function runGOSHPlot()'),
    virtualScrollerSource.indexOf('// AUTOMATED PRISMA-IPD REPORT GENERATOR'),
  );
  assertTrue(
    'runGOSHPlot uses deterministic subset sampling',
    /ipdCreateDeterministicSampler/.test(goshSection) && !/studies\.filter\(\(\) => Math\.random\(\) > 0\.3\)/.test(goshSection),
    goshSection.match(/Math\.random/g),
  );

  const homogeneous = BENCHMARK_DATASETS.homogeneous.studies;
  const homogeneousEffects = homogeneous.map((study) => study.yi);
  const homogeneousVariances = homogeneous.map((study) => study.sei * study.sei);
  const fe = MetaAnalysis.fixedEffect(homogeneousEffects, homogeneousVariances);
  assertClose('MetaAnalysis.fixedEffect estimate matches reference', fe.effect, BENCHMARK_DATASETS.homogeneous.expected.FE.estimate, 5e-4);
  assertClose('MetaAnalysis.fixedEffect SE matches reference', fe.se, BENCHMARK_DATASETS.homogeneous.expected.FE.se, 5e-4);
  assertTrue('MetaAnalysis.fixedEffect exposes summary aliases', Number.isFinite(fe.lower) && Number.isFinite(fe.upper) && fe.effect === fe.pooled, 'missing summary aliases');

  const bcg = BENCHMARK_DATASETS.bcg.studies;
  const effects = bcg.map((study) => study.yi);
  const variances = bcg.map((study) => study.sei * study.sei);
  const dl = MetaAnalysis.randomEffectsDL(effects, variances);
  assertClose('MetaAnalysis.randomEffectsDL estimate matches benchmark', dl.effect, BENCHMARK_DATASETS.bcg.expected.DL.estimate, 5e-4);
  assertClose('MetaAnalysis.randomEffectsDL tau2 matches benchmark', dl.tau2, BENCHMARK_DATASETS.bcg.expected.DL.tau2, 5e-4);
  assertClose('MetaAnalysis.randomEffectsDL I2 matches benchmark', dl.I2, BENCHMARK_DATASETS.bcg.expected.DL.I2, 5e-2);
  assertTrue('MetaAnalysis.randomEffectsDL exposes CI aliases', Array.isArray(dl.ci) && dl.ci.length === 2 && Number.isFinite(dl.lower) && Number.isFinite(dl.upper), 'random-effects CI aliases missing');

  const reml = MetaAnalysis.randomEffectsREML(effects, variances);
  assertClose('MetaAnalysis.randomEffectsREML estimate matches benchmark', reml.effect, BENCHMARK_DATASETS.bcg.expected.REML.estimate, 5e-4);
  assertClose('MetaAnalysis.randomEffectsREML tau2 matches benchmark tolerance', reml.tau2, BENCHMARK_DATASETS.bcg.expected.REML.tau2, 5e-2);
  assertClose('MetaAnalysis.randomEffectsREML SE matches benchmark tolerance', reml.se, BENCHMARK_DATASETS.bcg.expected.REML.se, 3e-2);

  const hksj = MetaAnalysis.applyHKSJ(dl, effects, variances);
  const baseWidth = dl.upper - dl.lower;
  const hksjWidth = hksj.upperHKSJ - hksj.lowerHKSJ;
  assertTrue('MetaAnalysis.applyHKSJ widens or preserves CI width', hksjWidth >= baseWidth - 1e-12, `base=${baseWidth}, hksj=${hksjWidth}`);

  const pi = MetaAnalysis.predictionInterval(dl);
  const piWidth = pi.upper - pi.lower;
  assertTrue('MetaAnalysis.predictionInterval is wider than CI', piWidth > baseWidth, `pi=${piWidth}, ci=${baseWidth}`);
}

let status = 'PASS';
let error = null;

try {
  run();
} catch (err) {
  status = 'FAIL';
  error = err && err.message ? err.message : String(err);
  recordTest('Core stats/meta suite aborted', 'FAIL', error);
}

const passed = tests.filter((test) => test.status === 'PASS').length;
const failed = tests.filter((test) => test.status === 'FAIL').length;
const artifact = {
  timestamp: new Date().toISOString(),
  status,
  summary: {
    passed,
    failed,
    total: tests.length,
  },
  tests,
};

fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

if (error) {
  console.error(`Core stats/meta module test failed: ${error}`);
  process.exit(1);
}

console.log(`Core stats/meta module test passed (${passed}/${tests.length})`);
