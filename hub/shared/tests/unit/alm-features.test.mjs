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
