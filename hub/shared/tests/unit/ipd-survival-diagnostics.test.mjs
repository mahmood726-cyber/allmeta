import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const modules = 'IPD-Meta-Pro/dev/modules/';

function fixture(artifact, seed) {
  const controls = {
    varStudy: 'study_id', varTreatment: 'treatment', varTime: 'time_months',
    varEvent: 'event', outcomeType: 'survival', analysisApproach: 'two-stage',
    effectMeasure: 'HR', reMethod: 'REML', confLevel: '.95'
  };
  const context = {
    APP: { config: { confLevel: .95 } },
    document: {
      body: {},
      getElementById: id => id in controls ? { value: controls[id] } :
        id === 'useHKSJ' ? { checked: false } : null,
      querySelector: () => ({ click() {} }), querySelectorAll: () => [], addEventListener() {}
    },
    MutationObserver: class { observe() {} }, addEventListener() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    showNotification() {}, ErrorHandler: { dataError() {} },
    computeCurrentDataFingerprint: () => 'synthetic-example', updateResults() {},
    toNumberOrNull: x => x == null || !Number.isFinite(Number(x)) ? null : Number(x)
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['02_06_stats.js', '02_07_confidence-utils.js', '02_08_meta-analysis.js',
    '02_09_survival-analysis.js', '02_10_seeded-rng.js', 'export_schema_module.js']) {
    vm.runInContext(read(modules + file), context, { filename: file });
  }
  const datasets = read(modules + '02_15_data-paginator.js');
  vm.runInContext(datasets.slice(datasets.indexOf('const EXAMPLE_DATASETS =')), context);
  const source = read(artifact ? 'IPD-Meta-Pro/ipd-meta-pro.html' : modules + '02_17_run-analysis.js');
  vm.runInContext(source.slice(source.indexOf('function ipdNormalizeArmToken('),
    source.indexOf('function computeQProfile()')), context);
  vm.runInContext(read('IPD-Meta-Pro/src/diagnostic-plots.js'), context);
  vm.runInContext(`
    SeededRNG.patchMathRandom(${seed});
    APP.data = EXAMPLE_DATASETS.survival.studies.flatMap((study, i) => {
      const hr = .72 * (.85 + i * .03 + Math.sin(i) * .1);
      return Array.from({length: Math.min(study.n, Math.round(study.n * .15))},
        (_, j) => EXAMPLE_DATASETS.survival.generatePatient(study, j + 1, hr));
    });
    SeededRNG.restoreMathRandom();
    // Capture the unmodified Cox and log-rank answers for independent checks of
    // the analysis dispatch. These are generated examples, not patient records.
    globalThis.expected = EXAMPLE_DATASETS.survival.studies.map(study => {
      const rows = APP.data.filter(r => r.study_id === study.id);
      const cox = SurvivalAnalysis.coxPH(rows.map(r => r.time_months),
        rows.map(r => r.event), rows.map(r => [r.treatment]));
      const treated = rows.filter(r => r.treatment === 1), control = rows.filter(r => r.treatment === 0);
      const lr = SurvivalAnalysis.logRankTest(treated.map(r => r.time_months), treated.map(r => r.event),
        control.map(r => r.time_months), control.map(r => r.event));
      return {study: study.id, effect: cox.beta[0], se: cox.se[0], lr};
    });
  `, context);
  return context;
}

for (const artifact of [false, true]) {
  const label = artifact ? 'shipped HTML' : 'source module';
  test(`${label}: non-finite Cox result uses the existing log-rank fallback and yields diagnostics`, () => {
    const c = fixture(artifact, 87);
    const failed = c.expected.filter(s => !Number.isFinite(s.effect) || !Number.isFinite(s.se));
    assert.equal(failed.length, 1);
    assert.equal(failed[0].study, 'ARCTIC');
    assert.ok(failed[0].lr.V > 0);
    vm.runInContext('runAnalysis()', c);
    const row = c.APP.results.studies.find(s => s.study === 'ARCTIC');
    assert.equal(row.effect, (failed[0].lr.O1 - failed[0].lr.E1) / failed[0].lr.V);
    assert.equal(row.variance, 1 / failed[0].lr.V);
    const before = JSON.stringify({results: c.APP.results, settings: c.APP.analysisSettings});
    const diagnostics = c.IPDPlotCompletion.computeDiagnostics(c.APP.results, c.APP.analysisSettings);
    assert.equal(diagnostics.rows.length, 12);
    for (const r of diagnostics.rows) {
      assert.ok(Number.isFinite(r.influence));
      assert.ok(Number.isFinite(r.pearsonSquared));
      assert.ok(r.omitted.lower < r.omitted.upper);
    }
    assert.equal(JSON.stringify({results: c.APP.results, settings: c.APP.analysisSettings}), before);
    assert.equal(c.APP.analysisRunning, false);
  });

  test(`${label}: finite Cox fits keep their original effects and variances`, () => {
    const c = fixture(artifact, 1);
    assert.ok(c.expected.every(s => Number.isFinite(s.effect) && s.se > 0));
    vm.runInContext('runAnalysis()', c);
    c.APP.results.studies.forEach((row, i) => {
      assert.equal(row.effect, c.expected[i].effect);
      assert.equal(row.variance, c.expected[i].se ** 2);
    });
    assert.equal(c.IPDPlotCompletion.computeDiagnostics(c.APP.results, c.APP.analysisSettings).rows.length, 12);
  });
}
