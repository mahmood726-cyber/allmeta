import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const app = readFileSync(new URL('Truthcert1/app.min.js', root), 'utf8');
const html = readFileSync(new URL('Truthcert1/TruthCert-PairwisePro-v1.0-production.html', root), 'utf8');
const analysis = app.slice(app.indexOf('function runAnalysis(){'), app.indexOf('function formatEffect('));
const enhancement = html.slice(html.indexOf('function updateMetaoverfitResults()'), html.indexOf('// Fixed Meta-Regression'));
const clone = value => JSON.parse(JSON.stringify(value));

function harness() {
  const timers = [];
  let now = 0;
  const button = { innerHTML: 'Run', classList: { add() {}, remove() {} } };
  const rows = [1, 2, 3, 4].map(n => ({ valid: true, name: `Study ${n}`, yi: n / 10, vi: n / 100, sei: Math.sqrt(n / 100) }));
  const rendered = [];
  const context = vm.createContext({
    AppState: { settings: { effectMeasure: 'OR', tau2Method: 'REML' }, results: null },
    console: { log() {}, warn() {}, error(error) { throw error; } },
    log: { error(...args) { throw new Error(args.join(' ')); } },
    alert() {},
    document: {
      getElementById: id => id === 'runAnalysisBtn' ? button : null,
      querySelector: () => ({ click() {} }),
    },
    setTimeout(fn, delay) { timers.push({ fn, time: now + delay }); },
    getStudyData: () => rows,
    convertToEffectSizes: data => data,
    estimateTau2: () => ({ tau2: 0.02, converged: true }),
    calculateTau2_CI_QProfile: () => ({ lower: 0, upper: 0.1 }),
    calculatePooledEstimate: () => ({ theta: 0.25, se: 0.1, ci_lower: 0.05, ci_upper: 0.45 }),
    calculateHeterogeneity: () => ({ I2: 20 }),
    predictionInterval_Standard: () => ({ lower: -0.1, upper: 0.6 }),
    eggersTest: () => ({ p_value: 0.5 }),
    renderResults() { rendered.push(clone(context.AppState.results)); },
  });
  context.window = context;
  vm.runInContext(analysis + '\n' + enhancement, context);
  function advance(time) {
    while (true) {
      timers.sort((a, b) => a.time - b.time);
      if (!timers.length || timers[0].time > time) break;
      const timer = timers.shift();
      now = timer.time;
      timer.fn();
    }
    now = time;
  }
  return { context, rows, rendered, advance, run: () => context.runAnalysis() };
}

test('TruthCert publishes completed metaoverfit before results can be rendered or saved', () => {
  const h = harness();
  h.run();
  h.advance(50);
  const result = h.rendered[0];
  assert.equal(result.metaoverfit.k, 4);
  assert.equal(result.metaoverfit.risk_level, 'SEVERE');
  const weights = [0.03, 0.04, 0.05, 0.06].map(v => 1 / v);
  const expectedESS = weights.reduce((a, b) => a + b, 0) ** 2 / weights.reduce((a, b) => a + b * b, 0);
  assert.ok(Math.abs(result.metaoverfit.ESS - expectedESS) < 1e-12);
  h.advance(1500);
  assert.deepEqual(clone(h.context.AppState.results), result);
});

test('TruthCert cannot mutate a restored project through a pending metaoverfit callback', () => {
  const h = harness();
  h.run();
  h.advance(50);
  // A saved project owns its results, including deliberately skipped diagnostics.
  const restored = { yi: [1, 2], vi: [0.1, 0.2], tau2: 0, metaoverfit: { skipped: true, risk: 'unknown' } };
  h.context.AppState.results = clone(restored);
  h.advance(1500);
  assert.deepEqual(clone(h.context.AppState.results), restored);
});

test('TruthCert control: rerunning uses the new dataset and preserves pooled values', () => {
  const h = harness();
  h.run();
  h.advance(1500);
  const pooled = clone(h.context.AppState.results.pooled);
  h.rows.pop();
  h.run();
  h.advance(3000);
  assert.equal(h.context.AppState.results.metaoverfit.k, 3);
  assert.equal(h.context.AppState.results.metaoverfit.ratio, 1.5);
  assert.deepEqual(clone(h.context.AppState.results.pooled), pooled);
});

test('TruthCert control: a refused analysis leaves existing results unchanged', () => {
  const h = harness();
  h.run();
  h.advance(1500);
  const before = clone(h.context.AppState.results);
  h.rows.splice(1);
  h.run();
  h.advance(3000);
  assert.equal(h.rendered.length, 1);
  assert.deepEqual(clone(h.context.AppState.results), before);
});
