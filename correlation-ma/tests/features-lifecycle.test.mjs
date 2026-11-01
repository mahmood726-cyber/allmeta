import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = 'correlation-ma';
const hostSource = readFileSync(new URL('../../shared/alm-features.js', import.meta.url), 'utf8');
const adapterSource = readFileSync(new URL('../alm-features.js', import.meta.url), 'utf8');

function load() {
  const calls = [];
  let revision = 'initial';
  const context = vm.createContext({
    AlmEntryUI: { mount(panel, options) {
      calls.push({ type: 'entry', panel, options });
      return { destroy() { calls.push({ type: 'destroy' }); } };
    } },
    AlmTextUI: { mount(panel, options) {
      calls.push({ type: 'text', panel, options, revision });
      return { regenerate() { calls.push({ type: 'regenerate', revision }); } };
    } },
  });
  vm.runInContext(hostSource, context);
  vm.runInContext(adapterSource, context);
  return { context, calls, change() { revision = 'edited'; } };
}

function closedPanel(harness, key) {
  const host = harness.context.AlmFeatures, spec = host.get(app), panel = {};
  const module = host.moduleFor(key);
  const hooks = module.render(panel, { app, spec, block: spec[key] });
  assert.equal(harness.calls.length, 0, 'a hidden tab must not mount a UI or its analysis listeners');
  return { module, hooks, panel, spec };
}

test('correlation entry mounts only when shown and retains its apply contract', () => {
  const harness = load(), { module, hooks, panel, spec } = closedPanel(harness, 'entry');
  hooks.onShow();
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].panel, panel);
  assert.equal(harness.calls[0].options.schema, 'correlation');
  assert.equal(harness.calls[0].options.apply, spec.entry.apply);
  hooks.onShow();
  assert.equal(harness.calls.length, 1, 'reopening entry preserves the existing editor');
  module.destroy(panel);
  assert.equal(harness.calls.at(-1).type, 'destroy');
});

test('correlation report text mounts only when shown and refreshes on reopening', () => {
  const harness = load(), { hooks, panel, spec } = closedPanel(harness, 'text');
  hooks.onShow();
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].panel, panel);
  assert.equal(harness.calls[0].options.app, app);
  assert.equal(harness.calls[0].options.text, spec.text);
  assert.equal(harness.calls[0].revision, 'initial');
  harness.change();
  hooks.onShow();
  assert.deepEqual(harness.calls.slice(1), [{ type: 'regenerate', revision: 'edited' }]);
});

for (const key of ['entry', 'text']) {
  test(`PLANTED: an eager ${key} override fails the hidden-panel gate`, () => {
    const harness = load();
    const component = key === 'entry' ? harness.context.AlmEntryUI : harness.context.AlmTextUI;
    harness.context.AlmFeatures.registerModule(key, {
      render(panel, ctx) { return component.mount(panel, ctx.block); },
    });
    assert.throws(() => closedPanel(harness, key), /a hidden tab must not mount/);
  });
}
