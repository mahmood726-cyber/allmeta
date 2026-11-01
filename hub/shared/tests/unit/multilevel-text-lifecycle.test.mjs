import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../../multilevel-ma/alm-features.js', import.meta.url), 'utf8');

function setup() {
  function target() {
    const listeners = {};
    return {
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      dispatch(type, event = {}) { for (const fn of listeners[type] || []) fn(event); },
      count(type) { return (listeners[type] || []).length; }
    };
  }
  const src = target(), run = target(), doc = target(), modules = {};
  let mounts = 0, regenerations = 0;
  doc.getElementById = id => ({ src, 'btn-run': run })[id];
  const context = vm.createContext({ document: doc,
    AlmFeatures: { register() {}, registerModule(key, module) { modules[key] = module; } },
    AlmTextUI: { mount() { mounts++; return { regenerate() { regenerations++; } }; } }
  });
  context.window = context;
  vm.runInContext(source, context);
  const hooks = modules.text.render({});
  return { src, run, doc, hooks, counts: () => ({ mounts, regenerations }) };
}

test('multilevel text PLANTED: a collapsed panel must not mount freshness listeners', () => {
  const app = setup();
  // AlmTextUI.mount installs global keyup/input listeners. Its freshness check
  // asks the live adapter for a revision, which reruns this app. Installing it
  // while collapsed makes Tab run edited data before the user reaches Run.
  assert.deepEqual(app.counts(), { mounts: 0, regenerations: 0 });
  assert.equal(app.doc.count('input'), 0);
  assert.equal(app.run.count('click'), 0);
});

test('multilevel text CONTROL: first opening mounts once; reopening and edits refresh the report', () => {
  const app = setup();
  app.hooks.onShow();
  assert.equal(app.counts().mounts, 1);
  const first = app.counts().regenerations;
  app.hooks.onShow();
  assert.deepEqual(app.counts(), { mounts: 1, regenerations: first + 1 });
  app.doc.dispatch('input', { target: app.src });
  app.run.dispatch('click');
  assert.deepEqual(app.counts(), { mounts: 1, regenerations: first + 3 });
  app.doc.dispatch('input', { target: {} });
  assert.equal(app.counts().regenerations, first + 3);
  assert.equal(app.doc.count('input'), 1);
  assert.equal(app.run.count('click'), 1);
});
