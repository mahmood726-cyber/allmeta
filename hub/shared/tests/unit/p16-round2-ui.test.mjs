import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './p16-ui-harness.mjs';

const accepted = 'A,B,.2,.1,s1\nB,C,.3,.2,s2\nA,C,.6,.15,s3\nA,B,.25,.12,s4';
const twoArm = {
  _schema: 'ma-comparisons-v1', effectMeasure: 'OR',
  studies: [
    { id: 'ab', arms: [{ treatment: 'A', events: 10, n: 100 }, { treatment: 'B', events: 20, n: 100 }] },
    { id: 'ac', arms: [{ treatment: 'A', events: 10, n: 100 }, { treatment: 'C', events: 30, n: 100 }] },
    { id: 'bc', arms: [{ treatment: 'B', events: 20, n: 100 }, { treatment: 'C', events: 30, n: 100 }] },
  ],
};
const refusals = [
  { name: 'empty bus', seed: null, reason: /shared network bus is empty/ },
  { name: 'multi-arm bus', seed: { ...twoArm, studies: [{ id: 'Tri', arms: [
    { treatment: 'A', events: 10, n: 100 }, { treatment: 'B', events: 20, n: 100 },
    { treatment: 'C', events: 30, n: 100 },
  ] }] }, reason: /Multi-arm studies are unsupported/ },
  { name: 'unsupported contrasts', seed: { ...twoArm, effectMeasure: 'HR' }, reason: /no supported contrasts/ },
];
const get = (h, id) => h.document.getElementById(id);
async function ready(model = 'FE') {
  const h = harness();
  get(h, 'f-model').value = model;
  h.c.__almIncoLoad(accepted);
  await h.advance(100);
  assert.equal(h.c.AlmIncoPlus.state().base.status, 'ok');
  assert.equal(h.c.AlmIncoPlus.state().loo.status, 'ok');
  assert.match(h.c.AlmIncoPlus.methodsText(), /Results\. The global/);
  return h;
}
function rejectBus(h, scenario) {
  if (scenario.seed) assert.equal(h.c.MaComparisons.write(scenario.seed), true);
  get(h, 'btn-bus-load').click();
  assert.equal(get(h, 'src').value, accepted, 'refused imports retain the previous input');
  assert.equal(h.c._almLastInco().status, 'refused');
  assert.match(h.c._almLastInco().reason, scenario.reason);
  assert.equal(get(h, 'ns-body').innerHTML, '');
}
function assertCleared(h) {
  const plus = h.c.AlmIncoPlus, state = plus.state();
  assert.equal(state.base.status, 'refused', 'plus must honor the authoritative base refusal');
  assert.equal(state.base.reason, h.c._almLastInco().reason, 'preserve the exact refusal reason');
  assert.equal(state.compare, null); assert.equal(state.loo, null);
  assert.equal(state.selected, null); assert.equal(state.busy, false);
  assert.equal(plus.methodsText(), '');
  assert.equal(get(h, 'plus-methods-text').textContent, 'Run an accepted analysis to generate the text.');
  for (const id of ['plus-interpret-list', 'plus-cmp-body', 'plus-cmp-summary', 'plus-loo-body', 'plus-loo-summary']) {
    assert.equal(get(h, id).innerHTML, '', `${id} must clear`);
  }
  for (const id of ['plus-graph', 'plus-dq']) assert.match(get(h, id).innerHTML, /Not available/);
  assert.doesNotMatch(get(h, 'plus-detail').innerHTML, /<table/);
  assert.equal(get(h, 'plus-loo-status').textContent, 'Sensitivity analysis not available: ' + state.base.reason);
  assert.throws(() => plus.rScript(false), /Run an accepted analysis first/);
  assert.throws(() => plus.rScript(true), /not finished yet/);
}
async function report(h, action) {
  const before = h.downloads.length;
  get(h, 'alm-export-mount').querySelector(`[data-action="${action}"]`).click();
  assert.equal(h.downloads.length, before + 1);
  return h.downloads.at(-1).text();
}

for (const scenario of refusals) {
  test(`P16-R2 plant: ${scenario.name} clears plus analysis and sensitivity`, async () => {
    const h = await ready(), plus = h.c.AlmIncoPlus;
    // Exercise a selected study detail, not just the default empty detail view.
    const row = h.document.createElement('button'); row.className = 'plus-row'; row.dataset.index = '0';
    get(h, 'alm-plus').append(row); row.click();
    assert.equal(plus.state().selected, 0);
    assert.match(get(h, 'plus-detail').innerHTML, /<table/);
    rejectBus(h, scenario);
    await h.advance(100);
    await plus.whenIdle();
    assertCleared(h);
    // A later explicit refresh cannot revive the accepted input either.
    plus.refresh(); await h.advance(100); assertCleared(h);
  });
  test(`P16-R2 plant: ${scenario.name} report excludes previous Methods and Results`, async () => {
    const h = await ready();
    for (const action of ['report-md', 'report-txt']) {
      assert.ok((await report(h, action)).includes(h.c.AlmIncoPlus.methodsText()), 'accepted report contains generated analysis');
    }
    rejectBus(h, scenario); await h.advance(100);
    for (const action of ['report-md', 'report-txt']) {
      const text = await report(h, action);
      assert.ok(text.includes(h.c._almLastInco().reason), 'export includes exact refusal');
      assert.doesNotMatch(text, /Methods\. Inconsistency in the network|Results\. The global|The global design-by-treatment test gave Q/);
      assert.doesNotMatch(text, /dbt\.Q|nodeSplit|estimates\./);
    }
  });
}

test('P16-R2 plant: refusal cancels a pending leave-one-out refresh without refitting prior input', async () => {
  const h = await ready(), plus = h.c.AlmIncoPlus, P = h.c.AlmIncoPlusCore;
  plus.refresh(); // Leave its sensitivity timer queued while the import is refused.
  assert.equal(plus.state().busy, true);
  rejectBus(h, refusals[0]);
  const waiting = plus.whenIdle();
  let fits = 0;
  const fitAll = P.fitAll;
  P.fitAll = (...args) => { fits++; return fitAll(...args); };
  plus.refresh();
  await h.advance(100); await waiting;
  assert.equal(fits, 0, 'a refused base state must never refit the unchanged input');
  assertCleared(h);
});

test('P16-R2 control: rejected text still clears results and reports', async () => {
  const h = await ready();
  get(h, 'src').value = 'A,B,.1,.1';
  get(h, 'src').dispatchEvent(new h.c.Event('input'));
  await h.advance(600);
  assert.match(h.c._almLastInco().reason, /At least 3 valid contrasts/);
  assertCleared(h);
  assert.doesNotMatch(await report(h, 'report-md'), /Results\. The global/);
});

for (const model of ['FE', 'DL', 'PM']) {
  test(`P16-R2 control: accepted ${model} analysis and explicit rerun after refusal agree`, async () => {
    const h = await ready(model), plus = h.c.AlmIncoPlus;
    const before = JSON.stringify({ base: plus.state().base, compare: plus.state().compare, loo: plus.state().loo });
    const methods = plus.methodsText();
    assert.equal(plus.state().base.model, model);
    assert.equal(plus.state().base.k, 4);
    assert.match(plus.rScript(false), /allmeta check/);
    rejectBus(h, refusals[0]); await h.advance(100);
    get(h, 'btn-run').click(); await h.advance(100);
    assert.equal(JSON.stringify({ base: plus.state().base, compare: plus.state().compare, loo: plus.state().loo }), before);
    assert.equal(plus.methodsText(), methods);
  });
}

test('P16-R2 control: accepted two-arm bus import replaces refused input and repopulates plus/report', async () => {
  const h = await ready();
  rejectBus(h, refusals[0]); await h.advance(100);
  assert.equal(h.c.MaComparisons.write(twoArm), true);
  get(h, 'btn-bus-load').click(); await h.advance(600);
  assert.notEqual(get(h, 'src').value, accepted);
  const state = h.c.AlmIncoPlus.state();
  assert.equal(state.base.status, 'ok'); assert.equal(state.base.k, 3);
  assert.equal(state.loo.status, 'ok'); assert.equal(state.compare.status, 'ok');
  assert.ok((await report(h, 'report-md')).includes(h.c.AlmIncoPlus.methodsText()));
  assert.doesNotMatch(await report(h, 'report-txt'), /Load from bus refused/);
});
