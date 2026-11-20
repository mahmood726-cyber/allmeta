// Lane low607 (independent review rrev2): review-project crashed on load when the saved
// state (localStorage "review-project-v1") had no `outputs` field, e.g. a legacy
// {"title":"Legacy review","activeTab":"overview"}. Root cause: the page defaulted
// outputs only when load() returned null (`var state = load() || {...outputs: {}}`), so a
// truthy state without outputs reached `state.outputs[st.id]` and threw
// "Cannot read properties of undefined (reading 'protocol')" -- reproduced in Chrome
// (scratch js/rp.cjs) for outputs missing, outputs null, and a title-only state.
// Fix: normalizeState() fills missing fields and keeps every field that was saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('review-project/index.html', ROOT), 'utf8');

function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found');
  let depth = 0, j = html.indexOf('{', i);
  for (let p = j; p < html.length; p++) {
    if (html[p] === '{') depth++;
    else if (html[p] === '}' && --depth === 0) return html.slice(i, p + 1);
  }
  throw new Error('unbalanced ' + name);
}
function normalize(s) {
  const c = { JSON, Array, Object, String };
  vm.createContext(c);
  vm.runInContext(grab('normalizeState'), c);
  return JSON.parse(JSON.stringify(c.normalizeState(s)));
}

test('the loaded state is passed through normalizeState (not only the null case)', () => {
  assert.match(html, /var state = normalizeState\(load\(\)\);/);
  assert.doesNotMatch(html, /var state = load\(\) \|\|/);
});

test('missing / null outputs default to {} and nothing saved is dropped', () => {
  const legacy = { title: 'Legacy review', activeTab: 'methods', extra: 42, story: { on: true, case: 'x' } };
  assert.deepEqual(normalize(legacy), { ...legacy, outputs: {} });
  assert.deepEqual(normalize({ title: 'L', outputs: null }).outputs, {});
  const t = normalize({ title: 'T' });
  assert.deepEqual(t.outputs, {});
  assert.equal(t.title, 'T');
  assert.equal(t.activeTab, 'overview');
  assert.deepEqual(t.story, { on: false, case: 'cortico' });
});

test('existing outputs are kept untouched', () => {
  const s = { title: 'K', outputs: { protocol: { a: 1 }, search: [1, 2] }, activeTab: 'overview' };
  assert.deepEqual(normalize(s).outputs, s.outputs);
});

test('an outputs value that is not an object is preserved aside, not discarded', () => {
  const n = normalize({ title: 'B', outputs: 'corrupt' });
  assert.deepEqual(n.outputs, {});
  assert.equal(n._unreadableOutputs, 'corrupt');
});

test('no saved state / non-object state gives the fresh default', () => {
  for (const s of [null, undefined, 7, 'x', []])
    assert.deepEqual(normalize(s), { title: '', outputs: {}, activeTab: 'overview', story: { on: false, case: 'cortico' } });
});
