import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the app's module registration against the real shared host API.
// UI doubles count mounts and preserve drafts; they do not claim browser/layout coverage.
function setup() {
  const calls = { entry: 0, text: 0, regenerate: 0 };
  const paper = { textContent: 'Extract paper text with source confirmation', disabled: false };
  const entry = { element: { querySelectorAll: () => [paper] }, draft: '' };
  const sandbox = {
    AlmEntryUI: { mount() { calls.entry++; return entry; } },
    AlmTextUI: { mount() { calls.text++; return { regenerate() { calls.regenerate++; } }; } },
  };
  vm.createContext(sandbox);
  for (const file of ['../../shared/alm-features.js', '../alm-features.js']) {
    vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), sandbox, { filename: file });
  }
  sandbox.document = { createElement: () => ({ textContent: '' }) };
  const panel = { children: [], appendChild(child) { this.children.push(child); } };
  const spec = sandbox.AlmFeatures.get('meta-regression');
  const render = key => sandbox.AlmFeatures.moduleFor(key).render(panel, {
    app: 'meta-regression', spec, block: spec[key],
  });
  return { calls, paper, entry, panel, render };
}

test('collapsed meta-regression features do not mount entry or report controls', () => {
  const h = setup();
  h.render('entry');
  h.render('text');
  assert.deepEqual(h.calls, { entry: 0, text: 0, regenerate: 0 });
  assert.equal(h.panel.children.length, 0);
});

test('entry mounts on first show, keeps the draft, and retains the unsupported-paper notice', () => {
  const h = setup(), hooks = h.render('entry');
  hooks.onShow?.();
  assert.equal(h.calls.entry, 1);
  assert.equal(h.paper.disabled, true);
  assert.equal(h.panel.children.length, 1);
  assert.match(h.panel.children[0].textContent, /Paper-text extraction is unavailable/);
  assert.match(h.panel.children[0].textContent, /moderator/);
  h.entry.draft = 'Unapplied study rows';
  hooks.onShow?.();
  assert.equal(h.calls.entry, 1);
  assert.equal(h.entry.draft, 'Unapplied study rows');
  assert.equal(h.panel.children.length, 1);
});

test('report text mounts on first show and refreshes when shown again', () => {
  const h = setup(), hooks = h.render('text');
  assert.equal(h.calls.text, 0);
  hooks.onShow();
  assert.equal(h.calls.text, 1);
  hooks.onShow();
  assert.equal(h.calls.text, 1);
  assert.equal(h.calls.regenerate, 1);
});
