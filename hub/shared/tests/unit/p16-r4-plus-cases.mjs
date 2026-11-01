import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorInput } from './p16-r4-plus-harness.mjs';

function continuous(measure) {
  return {
    _schema: 'ma-comparisons-v1', effectMeasure: measure,
    studies: [['A', 'B', 0], ['B', 'C', 0], ['A', 'C', 0], ['A', 'C', 2]].map(([a, b, mean], i) => ({
      id: `study${i + 1}`,
      arms: [{ treatment: a, mean, sd: 1, n: 40 }, { treatment: b, mean: 0, sd: 1, n: 40 }]
    }))
  };
}
const el = (h, id) => h.document.getElementById(id);
function publish(h, measure, partial = true) {
  const env = continuous(measure);
  if (partial) delete env.studies[3].arms[1].n;
  assert.equal(h.c.MaComparisons.write(env), true);
  el(h, 'btn-bus-load').click();
}
function assertPanelRefused(h) {
  const state = h.c.AlmIncoPlus.state();
  assert.equal(h.c._almLastInco().status, 'refused');
  assert.equal(el(h, 'src').value, priorInput);
  assert.equal(state.base.status, 'refused', 'plus must honor the main refusal');
  assert.equal(state.base.reason, h.c._almLastInco().reason);
  assert.equal(state.rows.length, 0);
  assert.equal(state.loo, null); assert.equal(state.compare, null);
  assert.equal(state.selected, null); assert.equal(state.busy, false);
  for (const id of ['ns-body', 'ns-plot', 'plus-interpret-list', 'plus-cmp-body', 'plus-loo-body']) assert.equal(el(h, id).innerHTML, '', id);
  for (const id of ['plus-cmp-summary', 'plus-loo-summary', 'plus-graph-status']) assert.equal(el(h, id).textContent, '', id);
  for (const id of ['plus-graph', 'plus-dq']) assert.match(el(h, id).innerHTML, /Not available/);
  assert.doesNotMatch(el(h, 'plus-detail').innerHTML, /Node-splits without/);
  assert.match(el(h, 'plus-loo-status').textContent, /Load from bus refused/);
  assert.doesNotMatch(el(h, 'plus-methods-text').textContent, /Inconsistency in the network/);
}
function assertExportsRefused(h) {
  assert.equal(h.c.AlmIncoPlus.methodsText(), '', 'no accepted prose after refusal');
  assert.throws(() => h.c.AlmIncoPlus.rScript(false));
  assert.throws(() => h.c.AlmIncoPlus.rScript(true));
  const count = h.downloads.length;
  el(h, 'plus-r').click(); el(h, 'plus-r-loo').click();
  assert.equal(h.downloads.length, count, 'neither R button downloads stale results');
}
async function accepted(h, k) {
  await h.advance(600);
  await h.c.AlmIncoPlus.whenIdle();
  assert.ok(h.c._almLastInco().dbt);
  const state = h.c.AlmIncoPlus.state();
  assert.equal(state.base.status, 'ok'); assert.equal(state.base.k, k);
  assert.equal(state.loo.status, 'ok'); assert.equal(state.compare.status, 'ok');
  assert.match(h.c.AlmIncoPlus.methodsText(), new RegExp(`network of ${k} independent`));
  for (const loo of [false, true]) assert.match(h.c.AlmIncoPlus.rScript(loo), /self-verifying R reproduction/);
  const count = h.downloads.length;
  el(h, 'plus-r').click(); el(h, 'plus-r-loo').click();
  assert.equal(h.downloads.length, count + 2);
  for (const action of ['report-md', 'report-txt']) {
    const before = h.downloads.length;
    el(h, 'alm-export-mount').querySelector(`[data-action="${action}"]`).click();
    assert.equal(h.downloads.length, before + 1, 'shared report click must download a new report');
    assert.match(await h.downloads.at(-1).text(), new RegExp(`network of ${k} independent`));
  }
}
export function defineTests(makeHarness) {
  async function ready() {
    const h = makeHarness();
    h.c.__almIncoLoad(priorInput);
    await accepted(h, 3);
    return h;
  }
  for (const measure of ['MD', 'SMD']) {
    test(`plant P16-R4 plus: ${measure} refusal clears the panel synchronously`, async () => {
      const h = await ready();
      publish(h, measure); assertPanelRefused(h);
    });
    test(`plant P16-R4 plus: ${measure} asynchronous observer cannot refit preserved input`, async () => {
      const h = await ready();
      publish(h, measure); await h.advance(600);
      assertPanelRefused(h); assertExportsRefused(h);
      let idle = false;
      h.c.AlmIncoPlus.whenIdle().then(() => { idle = true; });
      await Promise.resolve(); assert.equal(idle, true, 'refused panel settles idle waiters');
      h.c.AlmIncoPlus.refresh(); await h.advance(600); assertPanelRefused(h);
    });
    test(`plant P16-R4 plus: ${measure} immediate Methods and R exports honor refusal`, async () => {
      const h = await ready(); publish(h, measure); assertExportsRefused(h);
      el(h, 'plus-copy').click(); await Promise.resolve();
      assert.doesNotMatch(h.clipboard.at(-1) || '', /Inconsistency in the network/);
    });
    test(`plant P16-R4 plus: ${measure} shared reports never mix refused results with accepted prose`, async () => {
      const h = await ready(); publish(h, measure);
      for (const action of ['report-md', 'report-txt']) {
        const before = h.downloads.length;
        el(h, 'alm-export-mount').querySelector(`[data-action="${action}"]`).click();
        assert.equal(h.downloads.length, before + 1, 'inspect the newly downloaded shared report');
        const text = await h.downloads.at(-1).text();
        assert.match(text, /Load from bus refused/);
        assert.doesNotMatch(text, /Inconsistency in the network|The global design-by-treatment test gave Q/);
      }
    });
    test(`plant P16-R4 plus: ${measure} refusal cancels an already scheduled refresh`, async () => {
      const h = await ready();
      h.c.run(); await Promise.resolve(); // observer schedules the 30 ms refresh
      publish(h, measure); await h.advance(600);
      assertPanelRefused(h); assertExportsRefused(h);
    });
    test(`plant P16-R4 plus: ${measure} refusal invalidates queued leave-one-out refits`, async () => {
      const h = await ready();
      h.c.AlmIncoPlus.refresh();
      assert.equal(h.c.AlmIncoPlus.state().busy, true);
      let idle = false;
      h.c.AlmIncoPlus.whenIdle().then(() => { idle = true; });
      let drops = 0;
      const old = h.c.AlmIncoPlusCore.looDrop;
      h.c.AlmIncoPlusCore.looDrop = (...args) => { drops++; return old(...args); };
      publish(h, measure); await h.advance(600);
      assert.equal(drops, 0, 'no queued refit may execute after refusal');
      assert.equal(idle, true); assertPanelRefused(h); assertExportsRefused(h);
    });
    test(`plant P16-R4 plus: ${measure} pending input debounce cannot undo import refusal`, async () => {
      const h = await ready();
      el(h, 'src').value = priorInput + '\nA,C,0.4,0.2,pending';
      el(h, 'src').dispatchEvent(new h.c.Event('input', { bubbles: true }));
      publish(h, measure); await h.advance(600);
      assert.equal(h.c._almLastInco().status, 'refused');
      assert.equal(h.c.AlmIncoPlus.state().base.status, 'refused');
      assertExportsRefused(h);
    });
    test(`control P16-R4 plus: ${measure} complete import retains all studies and exports`, async () => {
      const h = await ready(); publish(h, measure, false); await accepted(h, 4);
      assert.deepEqual(Array.from(h.c.AlmIncoPlus.state().rows, r => r.study), ['study1', 'study2', 'study3', 'study4']);
    });
    test(`control P16-R4 plus: ${measure} corrected import recovers from refusal with pending work`, async () => {
      const h = await ready(); h.c.AlmIncoPlus.refresh();
      publish(h, measure); publish(h, measure, false); await accepted(h, 4);
      assert.doesNotMatch(h.c.AlmIncoPlus.rScript(true), /prior1/);
    });
    test(`control P16-R4 plus: ${measure} explicit Run recovers the preserved input`, async () => {
      const h = await ready(); publish(h, measure); await h.advance(600);
      el(h, 'btn-run').click(); await accepted(h, 3);
    });
  }
}
