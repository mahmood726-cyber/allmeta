// node:test — shared/alm-features.js registry: block MERGE across register() calls, revision(app),
// stateHash, AlmFeaturesState initialisation, module registration (incl. modules loaded before the host).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// A module that loaded BEFORE the host (e.g. alm-share.js in <head>) queues itself here.
const early = { render() {} };
globalThis.AlmFeaturesPending = [['share', early]];
const F = require('../../../../shared/alm-features.js');
const BLOCKS = ['paper', 'title', 'entry', 'text', 'verify', 'share'];
let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };

// Gate used below: which blocks registered earlier are no longer present (by identity) after a later call.
function lostBlocks(before, after) {
  return BLOCKS.filter(k => before[k] !== undefined && after[k] === undefined);
}

test('register MERGES: a later call adds/overrides only the blocks it provides', () => {
  const verify = { adapter: () => null, plots: [] }, share = { get() { return {}; }, set() {} };
  F.register('merge-app', { paper: 9, title: 'Proportion', verify, share });
  const snapshot = { ...F.get('merge-app') };
  const text = { results() { return {}; }, templates: {} };
  F.register('merge-app', { text });                // e.g. proportion-ma/alm-features-text.js from the text lane
  const merged = F.get('merge-app');
  eq(lostBlocks(snapshot, merged), [], 'no block lost');
  ok(merged.verify === verify && merged.share === share && merged.text === text, 'blocks kept by identity');
  eq([merged.paper, merged.title], [9, 'Proportion']);
  const verify2 = { adapter: () => null, plots: [{ id: 'funnel' }] };
  F.register('merge-app', { title: 'Proportion MA', verify: verify2 });
  eq(F.get('merge-app').title, 'Proportion MA', 'title overridden');
  ok(F.get('merge-app').verify === verify2, 'verify overridden');
  ok(F.get('merge-app').text === text && F.get('merge-app').share === share, 'untouched blocks survive the override');
  F.register('merge-app', { entry: undefined, unknownKey: 1 });
  ok(F.get('merge-app').entry === undefined && F.get('merge-app').unknownKey === undefined, 'undefined/unknown keys add nothing');
  F.register('other-app', { title: 'Other' });
  eq(F.get('other-app').title, 'Other'); eq(F.get('merge-app').title, 'Proportion MA', 'apps are independent');
  assert.throws(() => F.register('Bad App', {}), /invalid app id/); checks++;
  assert.throws(() => F.register('ok-app', null), /spec must be an object/); checks++;
});

test('PLANTED DEFECT: an overwrite-style register would be caught by the merge gate', () => {
  const store = {};
  const naiveRegister = (app, spec) => { store[app] = spec; };   // the defect: replaces the whole spec
  naiveRegister('p', { verify: {}, share: {} });
  const before = { ...store.p };
  naiveRegister('p', { text: {} });
  eq(lostBlocks(before, store.p), ['verify', 'share'], 'gate reports the lost blocks');
  ok(lostBlocks(before, store.p).length > 0, 'gate FAILS on the planted defect');
});

test('revision(app) = stateHash(liveAdapter.currentState())', () => {
  let state = { rows: [{ x: 12, n: 150 }], tr: 'logit', method: 'PM' };
  const live = { currentState: () => state };
  F.register('rev-app', { verify: { adapter: () => ({ app: 'rev-app', live }) } });
  const r1 = F.revision('rev-app');
  ok(/^rev-[0-9a-f]{16}$/.test(r1), 'format');
  eq(r1, F.stateHash(state), 'same hash Verify in R stores');
  eq(F.revision('rev-app'), r1, 'deterministic');
  state = { ...state, method: 'DL' };
  ok(F.revision('rev-app') !== r1, 'changes with the state');
  F.register('rev-live', { verify: { adapter: () => live } });   // adapter() may return the live object itself
  eq(F.revision('rev-live'), F.stateHash(state));
  F.register('rev-throw', { verify: { adapter: () => ({ live: { currentState() { throw new Error('Need at least 2 studies.'); } } }) } });
  eq(F.revision('rev-throw'), null, 'invalid current state -> null, never a stale hash');
  F.register('rev-none', { title: 'no verify' });
  eq(F.revision('rev-none'), null); eq(F.revision('never-registered'), null);
  ok(F.stateHash({ a: 1 }) !== F.stateHash({ a: 2 }) && F.stateHash('x') !== F.stateHash('y'));
});

test('verifiedCurrent(app): true only for a passed run of THIS app at the CURRENT state', () => {
  let state = { rows: [{ x: 3, n: 30 }], tr: 'logit', method: 'PM' };
  F.register('vc-app', { verify: { adapter: () => ({ live: { currentState: () => state } }) } });
  const st = globalThis.AlmFeaturesState;
  const saved = st.verify;
  st.verify = { revision: null, passed: false, rows: [], versions: {} };
  eq(F.verifiedCurrent('vc-app'), false, 'never verified');
  st.verify = { app: 'vc-app', revision: F.revision('vc-app'), passed: true, stale: false };
  eq(F.verifiedCurrent('vc-app'), true, 'passed run at the current state');
  eq(F.verifiedCurrent('other-app'), false, 'a run of another app does not count');
  st.verify = { ...st.verify, passed: false };
  eq(F.verifiedCurrent('vc-app'), false, 'failed run');
  st.verify = { ...st.verify, passed: true };
  state = { ...state, rows: [{ x: 4, n: 30 }] };                 // one data value changes after the run
  eq(F.verifiedCurrent('vc-app'), false, 'state changed -> not current');
  // PLANTED DEFECT: reading verify.passed alone (the bug this API exists to prevent) is caught.
  const naive = () => st.verify.passed === true;
  eq(naive(), true, 'naive check still says verified after the change');
  ok(naive() !== F.verifiedCurrent('vc-app'), 'gate distinguishes the naive check from the real one');
  state = { rows: [{ x: 3, n: 30 }], tr: 'logit', method: 'PM' };   // change reverted -> current again
  eq(F.verifiedCurrent('vc-app'), true, 'reverting the change makes it current again');
  F.register('vc-throw', { verify: { adapter: () => ({ live: { currentState() { throw new Error('x'); } } }) } });
  st.verify = { app: 'vc-throw', revision: 'rev-0000000000000000', passed: true };
  eq(F.verifiedCurrent('vc-throw'), false, 'invalid current state -> false');
  eq(F.inputsHash('vc-app'), null, 'no document -> no input fingerprint');
  st.verify = saved;
});

test('AlmFeaturesState and module registration', () => {
  const st = globalThis.AlmFeaturesState;
  ok(Array.isArray(st.entryLog) && st.entryLog.length === 0, 'entryLog');
  ok(Array.isArray(st.provenance) && st.provenance.length === 0, 'provenance');
  eq(st.verify, { revision: null, passed: false, rows: [], versions: {} });
  // The pre-host queue was drained and replaced by a live pusher.
  ok(!Array.isArray(globalThis.AlmFeaturesPending), 'pending queue drained');
  globalThis.AlmFeaturesPending.push(['verify', { render() {} }]);
  assert.throws(() => globalThis.AlmFeaturesPending.push(['bogus', { render() {} }]), /unknown tab/); checks++;
  assert.throws(() => F.registerModule('text', {}), /render\(\) required/); checks++;
  eq(F.tabs, ['entry', 'text', 'verify', 'share']); eq(F.blocks, BLOCKS);
  console.log('ALMFEATURES checks ' + checks);
});

// FU3: Data entry / Report text tabs use built-in modules when their UI components are loaded.
test('moduleFor: built-in Data entry / Report text modules appear only when AlmEntryUI / AlmTextUI are loaded', () => {
  const saved = { e: globalThis.AlmEntryUI, t: globalThis.AlmTextUI };
  try {
    delete globalThis.AlmEntryUI; delete globalThis.AlmTextUI;
    eq([F.moduleFor('entry'), F.moduleFor('text')], [null, null], 'no UI component -> no tab module');
    globalThis.AlmEntryUI = { mount() {} }; globalThis.AlmTextUI = { mount() {} };
    const e = F.moduleFor('entry'), t = F.moduleFor('text');
    eq([e && e.label, t && t.label], ['Data entry', 'Report text']);
    ok(F.moduleFor('entry') === e && F.moduleFor('text') === t, 'built-ins are stable objects (renderHost keeps mounted tabs)');
    eq(F.tabs, ['entry', 'text', 'verify', 'share'], 'tab order Data entry, Report text, Verify in R, Share');
    // Lazy: render() mounts nothing; the first onShow() mounts with the spec block's options; later shows do not re-mount.
    const calls = [];
    globalThis.AlmEntryUI = { mount(el, opts) { calls.push(opts); return { destroy() {} }; } };
    const panel = {}, block = { schema: 'proportion', extras: ['subgroup'], apply() { return { ok: true }; }, usedAs: 'proportion' };
    const hooks = F.moduleFor('entry').render(panel, { app: 'x', spec: {}, block });
    eq(calls.length, 0, 'nothing mounted before the tab is shown');
    hooks.onShow(); hooks.onShow();
    eq(calls.length, 1, 'mounted exactly once');
    eq([calls[0].schema, calls[0].extras, calls[0].usedAs, calls[0].apply === block.apply], ['proportion', ['subgroup'], 'proportion', true]);
    const texts = [];
    globalThis.AlmTextUI = { mount(el, spec) { texts.push(spec); return { regenerate() { texts.push('regen'); } }; } };
    const th = F.moduleFor('text').render({}, { app: 'x', spec: {}, block: { results() {}, templates: {} } });
    th.onShow(); th.onShow();
    eq([texts.length, texts[0].app, texts[1]], [2, 'x', 'regen'], 'Report text mounts once, regenerates on later shows');
    // A registered module still wins over the built-in.
    const custom = { render() {} };
    F.registerModule('text', custom);
    ok(F.moduleFor('text') === custom, 'registered module overrides the built-in');
  } finally {
    if (saved.e === undefined) delete globalThis.AlmEntryUI; else globalThis.AlmEntryUI = saved.e;
    if (saved.t === undefined) delete globalThis.AlmTextUI; else globalThis.AlmTextUI = saved.t;
  }
});

test('PLANTED: an eager entry module (mounting in render) is caught by the lazy-mount gate', () => {
  const calls = [];
  const eager = { render(panel, ctx) { calls.push(ctx.block); return { onShow() {} }; } };
  eager.render({}, { block: {} });
  ok(calls.length === 1, 'the eager module mounted before being shown -> the "nothing mounted before shown" gate FAILS');
});
