import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

function setup() {
  const nodes = {}, modules = {};
  let runs = 0, mounts = 0;
  const element = () => ({ value: '', checked: false, children: [], textContent: '',
    appendChild(child) { this.children.push(child); },
    click() { runs++; }, dispatchEvent() {}, querySelectorAll() { return []; } });
  const paper = element();
  paper.textContent = 'Extract paper text with source confirmation';
  const context = {
    document: { getElementById: id => nodes[id] ||= element(), createElement: element,
      querySelectorAll: () => [] },
    Event: function () {},
    AlmFeaturesState: {},
    AlmFeatures: { register() {}, registerModule: (key, value) => { modules[key] = value; } },
    AlmEntryUI: { mount() { mounts++; return { element: { querySelectorAll: () => [paper] } }; } },
    _almLastFitted: () => ({})
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('meta-regression/alm-features.js'), context);
  return { spec: context.AlmMetaRegressionFeatures, context, modules, paper, element,
    runs: () => runs, mounts: () => mounts };
}

const records = () => ['A', 'B', 'C'].map((study, i) => ({ study, yi: i / 10, sei: 0.1,
  moderator: i, provenance: { label: study, confirmed: true } }));

for (const [label, moderator] of [
  ['true', true], ['false', false], ['numeric array', [7]],
  ['coercible object', { toString: () => '7' }]
]) {
  test(`entry rejects a ${label} moderator without changing data or metadata`, () => {
    const h = setup();
    h.spec.entry.apply(records());
    h.context.AlmFeaturesState.entryLog = [{ text: 'existing conversion' }];
    const before = JSON.stringify(h.spec.share.get()), runs = h.runs();
    const bad = records();
    bad[0].moderator = moderator;
    assert.throws(() => h.spec.entry.apply(bad), /numeric moderator/);
    assert.equal(JSON.stringify(h.spec.share.get()), before);
    assert.equal(h.runs(), runs);
  });
}

test('entry accepts finite numbers and numeric table strings, including zero and scientific notation', () => {
  const h = setup(), rows = records();
  rows[0].moderator = 0;
  rows[1].moderator = ' -2.5 ';
  rows[2].moderator = '3e2';
  assert.equal(JSON.stringify(h.spec.entry.apply(rows)), JSON.stringify({ ok: true, n: 3 }));
  const state = h.spec.share.get();
  assert.equal(state.data, 'A, 0, 0.1, 0\nB, 0.1, 0.1, -2.5\nC, 0.2, 0.1, 300');
  assert.equal(state.provenance.length, 3);
  assert.equal(h.runs(), 1);
});

test('entry still rejects missing, non-finite and constant moderators atomically', () => {
  const h = setup();
  h.spec.entry.apply(records());
  const before = JSON.stringify(h.spec.share.get());
  for (const moderator of [null, undefined, '', ' ', 'unknown', NaN, Infinity]) {
    const bad = records();
    bad[0].moderator = moderator;
    assert.throws(() => h.spec.entry.apply(bad), /numeric moderator/);
    assert.equal(JSON.stringify(h.spec.share.get()), before);
  }
  assert.throws(() => h.spec.entry.apply(records().map(r => ({ ...r, moderator: 1 }))), /must vary/);
  assert.equal(JSON.stringify(h.spec.share.get()), before);
});

test('paper workflow is disabled when the lazy entry panel is shown, and mounts only once', () => {
  const h = setup(), panel = h.element();
  const lifecycle = h.modules.entry.render(panel, { block: h.spec.entry });
  assert.equal(h.mounts(), 0);
  lifecycle.onShow();
  assert.equal(h.paper.disabled, true);
  assert.match(panel.children.map(n => n.textContent).join(' '), /Table entry does not yet provide per-study source confirmation/);
  lifecycle.onShow();
  assert.equal(h.mounts(), 1);
});

test('real-R summary gate accepts the current complete format and rejects incomplete verification', () => {
  const source = read('hub/shared/tests/features-meta-regression.spec.mjs');
  const fn = source.slice(source.indexOf('function requireVerifiedSummary'), source.indexOf('async function open'));
  const context = { expect: value => ({ toMatch: pattern => assert.match(value, pattern),
    not: { toContain: part => assert.ok(!value.includes(part)) },
    toBeGreaterThan: n => assert.ok(value > n), toBe: n => assert.equal(value, n) }) };
  vm.createContext(context);
  vm.runInContext(fn, context);
  assert.equal(context.requireVerifiedSummary('28 of 28 computed quantities match R; 0 not computed — PASS'), true);
  for (const summary of [
    '23 of 23 quantities match R — PASS',
    'Not checked in the browser: R package metafor is unavailable.',
    '0 of 0 computed quantities match R; 0 not computed — PASS',
    '27 of 28 computed quantities match R; 0 not computed — PASS',
    '28 of 28 computed quantities match R; 1 not computed — PASS'
  ]) assert.throws(() => context.requireVerifiedSummary(summary));
});
