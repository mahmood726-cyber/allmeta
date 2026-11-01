// Direct adapter regressions for sandboxes that cannot spawn browser processes.
// Run: node --test --test-isolation=none hub/shared/tests/fixtures/features/meta-regression/review-regressions.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
function setup() {
  const nodes = {};
  function element() { return { value: '', checked: false, children: [], textContent: '',
    appendChild(n) { this.children.push(n); return n; }, setAttribute() {}, addEventListener() {},
    click() {}, dispatchEvent() {}, querySelectorAll() { return this.children; } }; }
  const paper = element(); paper.textContent = 'Extract paper text with source confirmation';
  const modules = {};
  const context = {
    document: { getElementById: id => nodes[id] ||= element(), createElement: element,
      querySelectorAll: selector => selector.includes('.stat') ? [
        { querySelector: s => ({ textContent: s === '.k' ? 'β₁ test' : 't(6) = 2.43, p = 0.051' }) }
      ] : [] },
    Event: function () {},
    AlmFeaturesState: {},
    AlmFeatures: { register() {}, registerModule: (k, m) => { modules[k] = m; }, verifiedCurrent: () => false },
    AlmEntryUI: { mount: () => ({ element: { querySelectorAll: () => [paper] } }) },
    _almLastFitted: () => ({}), _almLastHK: () => ({ q: 1 }), _almLastPI: () => null, _almLastPerm: () => null,
    _almLastStudies: () => [{ x: 2e6 }, { x: 5e6 }, { x: 8e6 }],
    __almResults: () => ({ k: 8, slope: 1e-7, slope_se: 2e-8, slope_ci_lb: -1e-9, slope_ci_ub: 2e-7,
      intercept: -0.673, intercept_ci_lb: -1.177, intercept_ci_ub: -0.169,
      hksj_q: 1, hksj_q_df: 6, tau2_pm: 0, R2_tau2: 0, QE: 0.12, QE_df: 6, QE_p: 1 })
  };
  context.window = context;
  vm.createContext(context);
  for (const p of ['shared/alm-text.js', 'shared/alm-validate.js', 'meta-regression/alm-features.js']) {
    const source = p === 'meta-regression/alm-features.js' && process.env.ALM_REVIEW_BASELINE
      ? fs.readFileSync(process.env.ALM_REVIEW_BASELINE, 'utf8') : read(p);
    vm.runInContext(source, context);
  }
  const spec = context.AlmMetaRegressionFeatures;
  function render(overrides = {}) {
    const r = { ...spec.text.results(), ...overrides };
    const text = context.AlmText.render(spec.text.templates, r, {});
    assert.equal(context.AlmText.audit(text, r, {}).ok, true);
    return text;
  }
  return { context, spec, render, modules, nodes, paper, element };
}
test('P1: disable the unsupported paper workflow and explain source-confirmation limits', () => {
  const { modules, spec, paper, element } = setup(), panel = element();
  modules.entry.render(panel, { block: spec.entry });
  assert.equal(paper.disabled, true);
  assert.match(panel.children.map(n => n.textContent).join(' '), /Table entry does not yet provide per-study source confirmation/);
});
test('P1: provenance and conversion log survive sharing without aliases or stale attachment', () => {
  const { context: c, spec } = setup();
  const records = ['A', 'B', 'C'].map((study, i) => ({ study, yi: i / 10, sei: 0.1, moderator: i,
    provenance: { label: study, pastedText: 'verbatim − text', confirmed: true } }));
  spec.entry.apply(records);
  c.AlmFeaturesState.entryLog = [{ text: 'conversion' }];
  const saved = spec.share.get();
  assert.equal(saved.provenance.length, 3);
  c.AlmFeaturesState.entryLog[0].text = 'changed';
  assert.equal(saved.entryLog[0].text, 'conversion');
  spec.share.set(saved);
  assert.equal(c.AlmFeaturesState.entryLog[0].text, 'conversion');
  assert.throws(() => spec.share.set({ ...saved, provenance: {} }));
  c.document.getElementById('f-data').value += '\nChanged';
  assert.equal(spec.share.get().provenance.length, 0);
  assert.equal(spec.share.get().entryLog.length, 0);
  assert.equal(c.AlmFeaturesState.provenance.length, 0, 'shared share codec must not export stale provenance');
  assert.equal(c.AlmFeaturesState.entryLog.length, 0, 'report text must not describe conversions for previous data');
});
test('P2-1 planted: jointly scaling small coefficients cannot pass verification', () => {
  const { context: c, spec } = setup(), live = spec.verify.adapter();
  const state = { rows: c._almLastStudies(), result: spec.text.results() };
  const good = live.appValues(state), reference = Object.fromEntries(good.map(v => [v.key, v.value]));
  const bad = structuredClone(state);
  for (const k of ['slope', 'slope_se', 'slope_ci_lb', 'slope_ci_ub']) bad.result[k] *= 0.2;
  const failed = live.appValues(bad).filter(v => Number.isFinite(v.value) && !c.AlmValidate.compare(v.value, reference[v.key],
    live.compare.kind[v.key], live.compare.tolerance[v.key] ?? live.compare.tolerance.default).pass);
  assert.ok(failed.length > 0);
});
test('P2-2 planted: unavailable and zero-comparison summaries must fail the real-R gate', () => {
  const source = read('hub/shared/tests/features-meta-regression.spec.mjs');
  const fn = source.slice(source.indexOf('function requireVerifiedSummary'), source.indexOf('async function open'));
  const context = { expect: value => ({ toMatch: pattern => assert.match(value, pattern),
    not: { toContain: part => assert.ok(!value.includes(part)) },
    toBeGreaterThan: n => assert.ok(value > n), toBe: n => assert.equal(value, n) }) };
  vm.createContext(context); vm.runInContext(fn, context);
  assert.throws(() => context.requireVerifiedSummary('Not checked in the browser: R package metafor is unavailable.'));
  assert.throws(() => context.requireVerifiedSummary('0 of 0 quantities match R — PASS'));
  assert.equal(context.requireVerifiedSummary('23 of 23 quantities match R — PASS'), true);
});
test('P2-3: undefined R squared is explicitly labelled', () => {
  const { render } = setup();
  assert.match(render().results.text, /R² not estimable \(no between-study variance in the intercept-only model\)/);
});
test('P2-4: lower and upper p endpoints use audited bounds', () => {
  const { render } = setup();
  assert.match(render({ slope_p_display: 0, permP: 0, permutations: 2000, QE_p: 0 }).results.text, /p < 0\.001/);
  assert.match(render({ slope_p_display: 1, permP: 1, permutations: 2000, QE_p: 1 }).results.text, /p > 0\.999/);
});
test('P2-5: the caution is specific to meta-regression and cites its guidance', () => {
  const { render } = setup(), out = render();
  assert.match(out.flags.map(p => p.text).join(' '), /ten studies per characteristic/);
  assert.match(out.cites.map(c => c.full).join(' '), /10\.11\.4/);
});
test('P2-6: attach the correct PI citation to the prediction-interval sentence', () => {
  const { render } = setup();
  assert.match(render().methods.text, /variance of the fitted mean \(Cochrane Handbook v6\.5, §10\.10\.4\.3\)\./);
});
test('P2-7: register the public live adapter', () => {
  const { context: c, spec } = setup();
  assert.equal(c.AlmLiveAdapters?.['meta-regression'], spec.verify.adapter());
});

// Check the committed example independently of browser availability. These are
// editorial requirements from the review, not values copied from a failed run.
const snapshot = () => JSON.parse(read('hub/shared/tests/__snapshots__/text-meta-regression.json'));
test('snapshot P2-3: the zero-null-variance example must not claim a defined R squared', () => {
  assert.match(snapshot().results, /R\u00b2 not estimable \(no between-study variance in the intercept-only model\)/);
  assert.doesNotMatch(snapshot().results, /R\u00b2 = 0\.0%/);
});

test('snapshot P2-6: the prediction-interval citation appears once, in its Methods sentence', () => {
  const { methods } = snapshot();
  assert.ok(methods.includes('variance of the fitted mean (Cochrane Handbook v6.5, \u00a710.10.4.3).'));
  assert.equal(methods.split('10.10.4.3').length - 1, 1);
});

test('snapshot encoding: citations and punctuation retain their Unicode characters', () => {
  const { flags, references } = snapshot();
  const citation = '(Cochrane Handbook v6.5, \u00a7\u00a710.11.4\u201310.11.6).';
  assert.ok(flags[0].endsWith(citation));
  assert.ok(flags[1].endsWith(citation));
  assert.equal(flags[3], 'P-values use the page\u2019s precision; rounded endpoints are reported as bounds.');
  assert.ok(references[1].includes('sections 10.11.4\u201310.11.6'));
});
