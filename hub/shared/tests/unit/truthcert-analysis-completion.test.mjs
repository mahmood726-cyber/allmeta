import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const bundle = readFileSync(new URL('Truthcert1/app.min.js', root), 'utf8');
const html = readFileSync(new URL('Truthcert1/TruthCert-PairwisePro-v1.0-production.html', root), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function app({ enhancement = true } = {}) {
  let now = 0;
  const timers = [], rendered = [], alerts = [];
  const button = { innerHTML: 'Run analysis', classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    Blob,
    console: { log() {}, error: (...args) => { throw new Error(args.join(' ')); } },
    alert: message => alerts.push(message),
    document: {
      addEventListener() {},
      getElementById: id => id === 'runAnalysisBtn' ? button : null,
      querySelector: () => ({ click() {} }),
    },
    addEventListener() {},
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout: (fn, delay) => timers.push({ fn, at: now + delay }),
    setInterval() {},
  });
  vm.runInContext('var window = globalThis;', context);
  vm.runInContext(bundle, context);
  if (enhancement) {
    // Execute the actual page enhancement and its analysis wrapper, including timers.
    vm.runInContext(html.slice(html.indexOf('function updateMetaoverfitResults()'),
      html.indexOf('// Fixed Meta-Regression')), context);
  }
  context.getStudyData = () => context.DEMO_DATASETS.SGLT2_ACM.studies.map(s => ({ ...s, valid: true }));
  context.renderResults = () => rendered.push(plain(context.AppState.results));
  context.showToast = context.runTruthCertAnalysis = () => {};
  function advance(to) {
    while (true) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > to) break;
      const timer = timers.shift();
      now = timer.at;
      timer.fn();
    }
    now = to;
  }
  return { context, rendered, alerts, advance };
}

test('PLANTED race: first rendered analysis already contains the metaoverfit assessment', () => {
  const a = app();
  a.context.runAnalysis();
  a.advance(50);
  assert.equal(a.rendered.length, 1);
  assert.equal(a.rendered[0].metaoverfit.risk_level, 'SEVERE');
  assert.equal(a.rendered[0].metaoverfit.k, 5);
  assert.equal(a.rendered[0].metaoverfit.skipped, undefined);
});

test('PLANTED race: saving after delayed callbacks preserves the first rendered results', () => {
  const a = app();
  a.context.runAnalysis();
  a.advance(50);
  const before = plain(a.context.AppState.results);
  a.advance(1500);
  assert.deepEqual(plain(a.context.saveProject().results), before);
});

test('PLANTED race: pending analysis callbacks cannot mutate a reopened saved assessment', async () => {
  const a = app();
  a.context.runAnalysis();
  a.advance(50);
  const saved = plain(a.context.saveProject());
  // An older project may contain an explicitly skipped assessment; restore it verbatim.
  saved.results.metaoverfit = { risk: 'unknown', skipped: true };
  await a.context.loadProject(JSON.stringify({ results: saved.results }));
  a.advance(1500);
  assert.deepEqual(plain(a.context.AppState.results), saved.results);
});

test('CONTROL: completed assessment keeps the existing formula and pooled analysis', () => {
  const a = app(), base = app({ enhancement: false });
  for (const instance of [a, base]) {
    instance.context.runAnalysis();
    instance.advance(1500);
  }
  const r = a.context.AppState.results;
  const weights = Array.from(r.vi, v => 1 / (v + r.tau2));
  const ess = weights.reduce((sum, w) => sum + w, 0) ** 2 / weights.reduce((sum, w) => sum + w * w, 0);
  assert.equal(r.metaoverfit.ESS, ess);
  assert.equal(r.metaoverfit.ESS_per_param, ess / 2);
  assert.equal(r.metaoverfit.ratio, 2.5);
  assert.equal(r.metaoverfit.risk_level, 'SEVERE');
  const { metaoverfit, ...rest } = plain(r);
  const { metaoverfit: original, ...baseline } = plain(base.context.AppState.results);
  assert.deepEqual(rest, baseline);
});

test('CONTROL: rejecting insufficient input preserves the previous saved results', () => {
  const a = app();
  a.context.runAnalysis();
  a.advance(1500);
  const before = plain(a.context.AppState.results);
  a.context.getStudyData = () => [];
  a.context.runAnalysis();
  a.advance(3000);
  assert.equal(a.alerts.length, 1);
  assert.deepEqual(plain(a.context.AppState.results), before);
});
