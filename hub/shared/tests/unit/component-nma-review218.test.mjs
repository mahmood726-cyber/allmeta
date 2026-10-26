import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../component-nma/index.html', import.meta.url), 'utf8');
const engine = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('var Z975'));
const adapter = readFileSync(new URL('../../../../component-nma/alm-features.js', import.meta.url), 'utf8');
const initial = 'drug | control | -0.3 | 0.1\ndrug | control | -0.2 | 0.1';
const changed = 'drug | control | -0.6 | 0.1\ndrug | control | -0.4 | 0.1';
function setup() {
  const nodes = Object.fromEntries(['src', 'btn-run', 'comp-body', 'int-body', 'forest'].map(id => [id, {
    value: initial, innerHTML: '', addEventListener() {}, dispatchEvent() {}, setAttribute() {}
  }]));
  const context = vm.createContext({
    document: { getElementById: id => nodes[id], querySelectorAll: () => [] },
    Event: class {}, AlmFeaturesState: {}
  });
  context.window = context;
  vm.runInContext(engine, context);
  vm.runInContext(adapter, context);
  return { context, spec: context.AlmComponentFeatures, nodes };
}

test('component NMA rejects malformed shared conversion-log entries atomically', () => {
  for (const entry of [null, false, 42, 'SE from CI', []]) {
    const { context, spec, nodes } = setup();
    const before = JSON.stringify([spec.share.get(), context._almLastCnma(), context.AlmFeaturesState]);
    assert.throws(() => spec.share.set({ src: changed, entryLog: [entry] }), /Invalid conversion log/);
    assert.equal(JSON.stringify([spec.share.get(), context._almLastCnma(), context.AlmFeaturesState]), before);
    assert.equal(nodes.src.value, initial);
    assert.equal(spec.text.results().entryCI, 0);
  }
});

test('component NMA restores valid conversion logs and omitted logs', () => {
  const { context, spec, nodes } = setup();
  const entryLog = [{ method: 'SE from CI', text: 'Converted interval' }, { method: 'sanity check', flags: [] }];
  spec.share.set({ src: changed, entryLog });
  assert.equal(nodes.src.value, changed);
  assert.equal(context._almLastCnma().components.drug.est, -0.5);
  assert.deepEqual(spec.share.get().entryLog, entryLog);
  assert.equal(spec.text.results().entryCI, 1);
  spec.share.set({ src: initial });
  assert.equal(spec.text.results().entryCI, 0);
  assert.equal(spec.share.get().entryLog.length, 0);
});
