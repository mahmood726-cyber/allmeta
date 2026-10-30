import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('multilevel-ma/index.html', root), 'utf8');
const pageScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('window.__almMlmaParse = parse;'));
assert.ok(pageScript, 'Exercise the actual page parser, renderer and Run handler');
const initialInput = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
const refusals = [
  ['empty', ''],
  ['malformed', 'study, effect, SE\nA, invalid, 0.1\nB, 0.2, 0\nC, 0.3, -0.1'],
  ['one-row', 'A, 0.2, 0.1, first'],
  ['two-row', 'A, 0.2, 0.1, first\nB, 0.4, 0.1, second'],
];

// Minimal DOM for a no-browser integration test. Algorithms, input parsing,
// rendering, Run registration and lifecycle notices all execute production code.
function element(id, tag = '') {
  let markup = '';
  const listeners = {};
  const attributes = {};
  return {
    id, value: '', hidden: /\bhidden(?:\s|>)/.test(tag),
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = String(value); },
    get textContent() { return markup.replace(/<[^>]*>/g, ''); },
    set textContent(value) { markup = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name] ?? null; },
    matches(selector) { return selector === '#' + id; },
    addEventListener(type, callback) { (listeners[type] ??= []).push(callback); },
    dispatch(type) { for (const callback of listeners[type] ?? []) callback({ target: this }); },
  };
}

function setup() {
  const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)]
    .map(match => [match[1], element(match[1], match[0])]));
  const el = id => {
    assert.ok(elements.has(id), `Missing real page element #${id}`);
    return elements.get(id);
  };
  el('src').value = initialInput;
  const events = {};
  const document = {
    getElementById: el,
    querySelectorAll: selector => {
      assert.equal(selector, '#src');
      return [el('src')];
    },
    addEventListener(type, callback) { (events[type] ??= []).push(callback); },
  };
  const modules = {};
  const urlState = Object.assign(() => {}, { read: () => ({}), write: () => {} });
  const resetUndo = Object.assign(options => { modules.resetUndo = options; }, { snapshot() {} });
  const context = vm.createContext({ document });
  context.window = context;
  context.alm = {
    urlState, resetUndo,
    ...Object.fromEntries(['csvUpload', 'plotExport', 'axisControls', 'resultsExport', 'tooltips']
      .map(name => [name, options => { modules[name] = options; }])),
  };
  for (const file of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/multilevel-reml.js',
    'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  vm.runInContext(pageScript, context, { filename: 'multilevel-ma/index.html' });
  return {
    el, context, modules,
    edit(value, type = 'input') {
      el('src').value = value;
      for (const callback of events[type] ?? []) callback({ target: el('src') });
    },
    run() { el('btn-run').dispatch('click'); },
  };
}

function displays(page) {
  return Object.fromEntries(['summary', 'body', 'forest'].map(id => [id, page.el(id).innerHTML]));
}

function results(page) {
  return JSON.stringify([page.context._almLastMlma(), page.context.__almReml()]);
}

function assertCompleted(page, count) {
  assert.equal(page.context._almLastMlma().k, count);
  assert.equal(page.context.__almReml().k, count);
  assert.equal(page.el('analysis-status').hidden, false);
  assert.equal(page.el('analysis-stale').hidden, true);
  assert.match(page.el('summary').innerHTML, /Method of moments/);
  assert.match(page.el('summary').innerHTML, /REML/);
  assert.match(page.el('body').innerHTML, /pooled-row/);
  assert.match(page.el('forest').innerHTML, /<polygon/);
}

for (const [name, input] of refusals) {
  test(`P07-D5 plant: ${name} Run removes previous displays and explains how to recover`, () => {
    const page = setup();
    assertCompleted(page, 13);
    const previous = displays(page);
    page.edit(input);
    assert.equal(page.el('analysis-stale').hidden, false);
    page.run();
    const retained = Object.keys(previous).filter(id => page.el(id).innerHTML === previous[id]);
    assert.deepEqual(retained, [], 'No previous analysis display may survive a refused Run');
    assert.equal(page.el('body').innerHTML, '', 'Clear the old effect-size rows');
    assert.equal(page.el('forest').innerHTML, '', 'Clear the old forest plot');
    assert.doesNotMatch(page.el('summary').innerHTML, /<table\b/);
    assert.match(page.el('summary').textContent, /at least 3 valid rows/i);
    assert.match(page.el('summary').textContent, /study.*effect.*positive SE/i);
    assert.match(page.el('summary').textContent, /Run analysis/i);
    assert.match(page.el('summary').innerHTML, /role=["']alert["']/);
    assert.equal(page.context._almLastMlma(), null);
    assert.equal(page.context.__almReml(), null);
    assert.equal(page.el('analysis-status').hidden, true);
    assert.equal(page.el('analysis-stale').hidden, true);
  });
}

test('P07-D5 control: valid initial input renders both estimators, rows and forest', () => {
  assertCompleted(setup(), 13);
});

test('P07-D5 control: valid rerun preserves results and all displays', () => {
  const page = setup(), before = displays(page), numeric = results(page);
  page.run();
  assertCompleted(page, 13);
  assert.deepEqual(displays(page), before);
  assert.equal(results(page), numeric);
});

test('P07-D5 control: input and change edits retain results with a stale warning until Run', () => {
  for (const type of ['input', 'change']) {
    const page = setup(), before = displays(page), numeric = results(page);
    page.edit(refusals[3][1], type);
    assert.equal(page.el('analysis-status').hidden, true);
    assert.equal(page.el('analysis-stale').hidden, false);
    assert.deepEqual(displays(page), before);
    assert.equal(results(page), numeric);
  }
});

test('P07-D5 control: every insufficient-row refusal still clears both result APIs and exports', () => {
  for (const [, input] of refusals) {
    const page = setup();
    page.edit(input);
    page.run();
    assert.equal(page.context._almLastMlma(), null);
    assert.equal(page.context.__almReml(), null);
    assert.equal(page.modules.resultsExport.getResults(), null);
    assert.equal(page.modules.plotExport.getReceiptInput(), null);
    assert.equal(page.el('analysis-status').hidden, true);
  }
});

test('P07-D5 control: valid recovery after every refusal restores the same results and displays', () => {
  for (const [, input] of refusals) {
    const page = setup(), before = displays(page), numeric = results(page);
    page.edit(input);
    page.run();
    page.edit(initialInput);
    page.run();
    assertCompleted(page, 13);
    assert.deepEqual(displays(page), before);
    assert.equal(results(page), numeric);
  }
});

test('P07-D5 control: exactly three valid rows remain accepted', () => {
  const page = setup();
  page.edit('A, 0.2, 0.1, first\nB, 0.4, 0.1, second\nC, 0.3, 0.1, third');
  page.run();
  assertCompleted(page, 3);
});
