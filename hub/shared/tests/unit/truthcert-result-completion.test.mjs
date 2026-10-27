import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const app = readFileSync(new URL('Truthcert1/app.min.js', root), 'utf8');
const html = readFileSync(new URL('Truthcert1/TruthCert-PairwisePro-v1.0-production.html', root), 'utf8');
const analysis = app.slice(app.indexOf('function runAnalysis(){'), app.indexOf('function formatEffect('));
const enhancement = html.slice(html.indexOf('function updateMetaoverfitResults()'), html.indexOf('// Fixed Meta-Regression'));
const persistence = app.slice(app.indexOf('function saveProject('), app.indexOf('function checkAutosave('));
const snapshot = value => JSON.parse(JSON.stringify(value));

function harness({ enhanced = true, valid = true } = {}) {
  const timers = [], renders = [], alerts = [];
  const rows = [0.2, 0.4, 0.6, 0.8].map((yi, i) => ({
    name: `Study ${i}`, valid, yi, vi: 0.1, sei: Math.sqrt(0.1)
  }));
  const button = { innerHTML: 'Run', classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    AppState: { settings: { effectMeasure: 'OR', tau2Method: 'DL' }, results: null },
    document: { getElementById: id => id === 'runAnalysisBtn' ? button : { innerHTML: '' },
      querySelector: () => ({ click() {} }) },
    setTimeout: (fn, delay) => timers.push({ fn, delay }),
    console: { log() {}, error: e => { throw e; } },
    log: { error: (...args) => { throw new Error(args.join(' ')); } },
    alert: message => alerts.push(message),
    getStudyData: () => rows,
    convertToEffectSizes: rows => rows,
    estimateTau2: () => ({ tau2: 0.05 }),
    calculateTau2_CI_QProfile: () => ({ lower: 0, upper: 0.2 }),
    calculatePooledEstimate: () => ({ theta: 0.5, se: 0.2, ci_lower: 0.1, ci_upper: 0.9 }),
    calculateHeterogeneity: () => ({ I2: 20 }),
    predictionInterval_Standard: () => ({ lower: -0.1, upper: 1.1 }),
    eggersTest: () => ({}),
    renderResults: () => renders.push(snapshot(context.AppState.results)),
    Blob, localStorage: { setItem() {} }, showToast() {},
    updateEffectMeasures() {}, updateTableHeaders() {}, addStudyRow() {}
  });
  context.window = context;
  vm.runInContext(analysis + '\n' + persistence + (enhanced ? '\n' + enhancement : ''), context);
  return {
    context, renders, alerts,
    run() { context.runAnalysis(); timers.splice(timers.findIndex(t => t.delay === 50), 1)[0].fn(); },
    drain() { while (timers.length) timers.shift().fn(); }
  };
}

test('TruthCert publishes the complete metaoverfit assessment before rendering or saving', () => {
  const h = harness();
  h.run();
  const before = snapshot(h.context.AppState.results);
  assert.equal(before.metaoverfit.risk_level, 'SEVERE');
  assert.equal(before.metaoverfit.ESS, 4);
  assert.equal(before.metaoverfit.ESS_per_param, 2);
  assert.deepEqual(h.renders[0], before);
  h.drain();
  assert.deepEqual(snapshot(h.context.saveProject().results), before);
});

test('pending analysis callbacks cannot overwrite a restored project assessment', async () => {
  const h = harness();
  h.run();
  const saved = snapshot(h.context.saveProject());
  // A saved project can legitimately contain a skipped assessment from an older version.
  saved.results.metaoverfit = { risk: 'unknown', skipped: true };
  await h.context.loadProject(JSON.stringify(saved));
  h.drain();
  assert.deepEqual(snapshot(h.context.AppState.results), saved.results);
});

test('control: completed results and input rows survive save/reopen without a refit', async () => {
  const h = harness();
  h.run();
  h.drain();
  const saved = snapshot(h.context.saveProject());
  h.context.runAnalysis = () => assert.fail('Restoring a project must not refit');
  await h.context.loadProject(JSON.stringify(saved));
  assert.deepEqual(snapshot(h.context.AppState.results), saved.results);
  assert.deepEqual(snapshot(h.context.getStudyData()), saved.data);
  assert.deepEqual(h.renders.at(-1), saved.results);
});

test('control: core analysis still works without the production-page enhancement', () => {
  const h = harness({ enhanced: false });
  h.run();
  h.drain();
  assert.equal(h.renders.length, 1);
  assert.equal(h.context.AppState.results.pooled.theta, 0.5);
  assert.deepEqual(snapshot(h.context.AppState.results.metaoverfit), { risk: 'unknown', skipped: true });
});

test('invalid analysis cannot schedule a mutation of the previous assessment', () => {
  const h = harness({ valid: false });
  const previous = { yi: [0.2, 0.3], vi: [0.1, 0.1], metaoverfit: { risk: 'unknown', skipped: true } };
  h.context.AppState.results = snapshot(previous);
  h.run();
  h.drain();
  assert.equal(h.alerts.length, 1);
  assert.equal(h.renders.length, 0);
  assert.deepEqual(snapshot(h.context.AppState.results), previous);
});
