import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const app = readFileSync(new URL('Truthcert1/app.min.js', root), 'utf8');
const page = readFileSync(new URL('Truthcert1/TruthCert-PairwisePro-v1.0-production.html', root), 'utf8');
const analysis = app.slice(app.indexOf('function runAnalysis(){'), app.indexOf('function formatEffect('));
const extension = page.slice(page.indexOf('// Metaoverfit Assessment -'), page.indexOf('// Fixed Meta-Regression'));
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the shipped analysis and its page wrapper with a deterministic clock.
// The statistics are fixed inputs here: the regression is completion/save timing.
function harness(count = 4) {
  let now = 0;
  const timers = [], rendered = [], alerts = [];
  const button = { innerHTML: 'Run', classList: { add() {}, remove() {} } };
  const rows = Array.from({ length: count }, (_, i) => ({ valid: true, yi: i / 10, vi: .04, sei: .2, name: `Study ${i}` }));
  const context = vm.createContext({
    AppState: { results: null, settings: { effectMeasure: 'OR', tau2Method: 'DL' } },
    document: { getElementById: id => id === 'runAnalysisBtn' ? button : null, querySelector: () => ({ click() {} }) },
    setTimeout(fn, delay) { timers.push({ fn, at: now + delay }); },
    getStudyData: () => rows,
    convertToEffectSizes: data => data,
    estimateTau2: () => ({ tau2: .01 }),
    calculateTau2_CI_QProfile: () => ({ lower: 0, upper: .02 }),
    calculatePooledEstimate: () => ({ theta: .15, se: .1, ci_lower: -.05, ci_upper: .35 }),
    calculateHeterogeneity: () => ({ I2: 20 }),
    predictionInterval_Standard: () => ({ lower: -.2, upper: .5 }),
    eggersTest: () => ({ skipped: true }),
    renderResults() { rendered.push(plain(context.AppState.results)); },
    alert: message => alerts.push(message),
    log: { error: error => { throw error; } },
    console: { log() {}, error: error => { throw error; } }
  });
  context.window = context;
  vm.runInContext(analysis + '\n' + extension, context);
  function advance(until) {
    timers.sort((a, b) => a.at - b.at);
    while (timers.length && timers[0].at <= until) {
      const timer = timers.shift(); now = timer.at; timer.fn();
      timers.sort((a, b) => a.at - b.at);
    }
    now = until;
  }
  return { context, advance, rendered, alerts };
}

test('TruthCert completes metaoverfit before results can be rendered or saved', () => {
  const h = harness();
  h.context.runAnalysis(); h.advance(50);
  const saved = plain(h.context.AppState.results);
  assert.equal(saved.metaoverfit.ESS, 4);
  assert.equal(saved.metaoverfit.risk_level, 'SEVERE');
  assert.deepEqual(h.rendered, [saved]);
  h.advance(1500);
  assert.deepEqual(plain(h.context.AppState.results), saved, 'completion timers must not alter the saved result');
});

test('TruthCert pending callbacks cannot recompute a reopened project', () => {
  const h = harness();
  h.context.runAnalysis(); h.advance(50);
  const restored = { yi: [.1, .2], vi: [.03, .04], tau2: .02, metaoverfit: { archived: true } };
  h.context.AppState.results = structuredClone(restored);
  h.advance(1500);
  assert.deepEqual(plain(h.context.AppState.results), restored);
});

test('TruthCert control: rejected input produces no results or assessment', () => {
  const h = harness(1);
  h.context.runAnalysis(); h.advance(1500);
  assert.equal(h.context.AppState.results, null);
  assert.deepEqual(h.rendered, []);
  assert.deepEqual(h.alerts, ['At least 2 valid studies are required for meta-analysis.']);
});
