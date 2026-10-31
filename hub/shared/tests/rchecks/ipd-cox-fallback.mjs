// R cross-check input for the IPD-Meta-Pro log-rank fallback (PR #459). Rebuilds the seed-87 survival example exactly as
// hub/shared/tests/unit/ipd-survival-diagnostics.test.mjs does, runs the app's runAnalysis(), and writes
//   rchecks-out/ipd-cox-fallback/arctic.csv  (time, event, treatment of the study whose Cox fit is non-finite)
//   rchecks-out/ipd-cox-fallback/app.csv     (the app's per-study effect and variance for that study)
// Run from the repo root: node hub/shared/tests/rchecks/ipd-cox-fallback.mjs ; then Rscript hub/shared/tests/rchecks/ipd-cox-fallback.R
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const modules = 'IPD-Meta-Pro/dev/modules/';
const controls = {
  varStudy: 'study_id', varTreatment: 'treatment', varTime: 'time_months', varEvent: 'event', outcomeType: 'survival',
  analysisApproach: 'two-stage', effectMeasure: 'HR', reMethod: 'REML', confLevel: '.95'
};
const context = {
  APP: { config: { confLevel: .95 } },
  document: {
    body: {}, getElementById: id => id in controls ? { value: controls[id] } : id === 'useHKSJ' ? { checked: false } : null,
    querySelector: () => ({ click() {} }), querySelectorAll: () => [], addEventListener() {}
  },
  MutationObserver: class { observe() {} }, addEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  showNotification() {}, ErrorHandler: { dataError() {} }, computeCurrentDataFingerprint: () => 'synthetic-example', updateResults() {},
  toNumberOrNull: x => x == null || !Number.isFinite(Number(x)) ? null : Number(x)
};
context.window = context;
vm.createContext(context);
for (const file of ['02_06_stats.js', '02_07_confidence-utils.js', '02_08_meta-analysis.js', '02_09_survival-analysis.js',
  '02_10_seeded-rng.js', 'export_schema_module.js']) vm.runInContext(read(modules + file), context, { filename: file });
const datasets = read(modules + '02_15_data-paginator.js');
vm.runInContext(datasets.slice(datasets.indexOf('const EXAMPLE_DATASETS =')), context);
const source = read(modules + '02_17_run-analysis.js');
vm.runInContext(source.slice(source.indexOf('function ipdNormalizeArmToken('), source.indexOf('function computeQProfile()')), context);
vm.runInContext(`
  SeededRNG.patchMathRandom(87);
  APP.data = EXAMPLE_DATASETS.survival.studies.flatMap((study, i) => {
    const hr = .72 * (.85 + i * .03 + Math.sin(i) * .1);
    return Array.from({length: Math.min(study.n, Math.round(study.n * .15))},
      (_, j) => EXAMPLE_DATASETS.survival.generatePatient(study, j + 1, hr));
  });
  SeededRNG.restoreMathRandom();
  runAnalysis();
`, context);
const rows = context.APP.data.filter(r => r.study_id === 'ARCTIC');
const row = context.APP.results.studies.find(s => s.study === 'ARCTIC');
if (!rows.length || !row) throw new Error('ARCTIC study missing');
const out = new URL('hub/shared/tests/rchecks-out/ipd-cox-fallback/', root);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(new URL('arctic.csv', out), 'time,event,treatment\n' +
  rows.map(r => [r.time_months, r.event, r.treatment].map(v => Number(v).toPrecision(17)).join(',')).join('\n') + '\n');
fs.writeFileSync(new URL('app.csv', out), 'effect,variance\n' + [row.effect, row.variance].map(v => Number(v).toPrecision(17)).join(',') + '\n');
console.log('IPD fallback input written: ARCTIC n=' + rows.length + ' effect=' + row.effect + ' variance=' + row.variance);
