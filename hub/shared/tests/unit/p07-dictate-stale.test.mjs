import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual page's parser, engines, render path, click handler and
// shared lifecycle. Only the DOM and unrelated widget initializers are stubbed.
const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('window.__almMlmaRun = run;'));
assert.ok(app, 'actual multilevel-ma application script found');
const defaultInput = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];

function element(id) {
  let markup = '';
  const events = new Map();
  return {
    id, value: '', hidden: false, attributes: {},
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = String(value); },
    get textContent() { return markup.replace(/<[^>]*>/g, ''); },
    set textContent(value) { markup = String(value); },
    matches(selector) { return selector === '#' + id; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, callback) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(callback);
    },
    dispatch(type) {
      for (const callback of events.get(type) || []) callback({ target: this });
    },
  };
}

function harness(initialInput = defaultInput, application = app) {
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, element(id)]));
  nodes.src.value = initialInput;
  nodes['analysis-status'].hidden = nodes['analysis-stale'].hidden = true;
  const listeners = new Map();
  const document = {
    getElementById(id) {
      assert.ok(nodes[id], 'page element exists: ' + id);
      return nodes[id];
    },
    querySelectorAll(selector) {
      assert.equal(selector, '#src');
      return [nodes.src];
    },
    addEventListener(type, callback, capture) {
      assert.equal(capture, true);
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
  };
  const noop = () => {};
  const context = vm.createContext({ document });
  context.window = context;
  context.alm = {
    csvUpload: noop, plotExport: noop, axisControls: noop,
    resultsExport: noop, tooltips: noop,
    resetUndo: Object.assign(() => {}, { snapshot: noop }),
    urlState: Object.assign(() => {}, { read: () => ({}), write: noop }),
  };
  for (const path of ['shared/ma-core.js', 'shared/multilevel-reml.js',
    'shared/stats-qt.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(application, context, { filename: 'multilevel-ma/index.html' });
  return {
    nodes, context,
    run() { nodes['btn-run'].dispatch('click'); },
    event(type) {
      for (const callback of listeners.get(type) || []) callback({ target: nodes.src });
    },
  };
}

function assertSuccessful(h) {
  const { nodes, context } = h;
  assert.ok(Number.isFinite(context._almLastMlma()?.mu), 'real MoM fit completed');
  assert.ok(Number.isFinite(context.__almReml()?.mu), 'real REML fit completed');
  assert.match(nodes.summary.innerHTML, /Method of moments/);
  assert.match(nodes.summary.innerHTML, /REML/);
  assert.match(nodes.body.innerHTML, /pooled-row/);
  assert.match(nodes.forest.innerHTML, /<polygon/);
  assert.equal(nodes['analysis-status'].hidden, false);
  assert.equal(nodes['analysis-stale'].hidden, true);
}

function assertRefused(h) {
  const { nodes, context } = h;
  // These cache and lifecycle assertions already pass before the fix.
  assert.equal(context._almLastMlma(), null, 'export cache invalidated');
  assert.equal(context.__almReml(), null, 'REML cache invalidated');
  assert.equal(nodes['analysis-status'].hidden, true);
  assert.equal(nodes['analysis-stale'].hidden, true, 'retain hide-on-refusal contract');
  assert.deepEqual({
    oldSummaryRemoved: !/<table\b/.test(nodes.summary.innerHTML),
    oldRowsRemoved: nodes.body.innerHTML === '',
    oldForestRemoved: nodes.forest.innerHTML === '',
    refusalExplained: /analysis refused/i.test(nodes.summary.textContent)
      && /at least (?:3|three) valid (?:effect-size )?rows/i.test(nodes.summary.textContent),
  }, {
    oldSummaryRemoved: true,
    oldRowsRemoved: true,
    oldForestRemoved: true,
    refusalExplained: true,
  }, 'a refused fit must remove prior output and explain the minimum-row requirement');
}

const oneRow = 'A, 0.35, 0.12, first';
const twoRows = oneRow + '\nB, 0.28, 0.11, second';
const threeRows = twoRows + '\nC, 0.50, 0.15, third';
for (const [name, input, acceptedRows] of [
  ['empty input', '', 0],
  ['one valid row', oneRow, 1],
  ['two valid rows', twoRows, 2],
  ['three lines with one rejected row', twoRows + '\nC, 0.50, 0, rejected', 2],
]) {
  test('P07-D5: refusal clears prior results for ' + name, () => {
    const h = harness();
    assertSuccessful(h);
    assert.equal(h.context.__almMlmaParse(input).length, acceptedRows);
    h.nodes.src.value = input;
    h.event('input');
    assert.equal(h.nodes['analysis-stale'].hidden, false, 'edit first flags old output');
    h.run();
    assertRefused(h);
  });
}

test('P07-D5: same-input change after refusal cannot expose unflagged prior output', () => {
  const h = harness();
  assertSuccessful(h);
  h.nodes.src.value = twoRows;
  h.event('input');
  h.run();
  h.event('change'); // Blur commits the same input recorded by the refused run.
  assertRefused(h);
});

test('P07-D5 control: three valid rows render successfully and a commit stays current', () => {
  const h = harness(threeRows);
  assertSuccessful(h);
  assert.equal(h.context._almLastMlma().k, 3);
  h.event('change');
  assertSuccessful(h);
});

test('P07-D5 control: editing input retains visible results with a stale warning', () => {
  const h = harness();
  assertSuccessful(h);
  const before = [h.nodes.summary.innerHTML, h.nodes.body.innerHTML, h.nodes.forest.innerHTML];
  h.nodes.src.value = '';
  h.event('input');
  assert.equal(h.nodes['analysis-status'].hidden, true);
  assert.equal(h.nodes['analysis-stale'].hidden, false);
  assert.deepEqual([h.nodes.summary.innerHTML, h.nodes.body.innerHTML, h.nodes.forest.innerHTML], before);
});

test('P07-D5 control: correcting refused input restores the same results and render', () => {
  const h = harness();
  assertSuccessful(h);
  const beforeResults = JSON.stringify([h.context._almLastMlma(), h.context.__almReml()]);
  const beforeRender = [h.nodes.summary.innerHTML, h.nodes.body.innerHTML, h.nodes.forest.innerHTML];
  h.nodes.src.value = '';
  h.run();
  assert.equal(h.context._almLastMlma(), null);
  h.nodes.src.value = defaultInput;
  h.event('input');
  h.run();
  assertSuccessful(h);
  assert.doesNotMatch(h.nodes.summary.textContent, /analysis refused/i);
  assert.equal(JSON.stringify([h.context._almLastMlma(), h.context.__almReml()]), beforeResults);
  assert.deepEqual([h.nodes.summary.innerHTML, h.nodes.body.innerHTML, h.nodes.forest.innerHTML], beforeRender);
});

// Reconstruct just the pre-fix defect in memory: the refusal clears caches but
// returns without touching visible output. No historical checkout is required.
const refusalOutput = /        document\.getElementById\('summary'\)\.textContent = 'Analysis refused: enter at least 3 valid effect-size rows\.';\r?\n        document\.getElementById\('body'\)\.innerHTML = '';\r?\n        document\.getElementById\('forest'\)\.innerHTML = '';\r?\n/;
assert.equal([...app.matchAll(new RegExp(refusalOutput, 'g'))].length, 1,
  'plant removes exactly the refusal output update');
const oldRefusal = app.replace(refusalOutput, '');

for (const [name, input] of [
  ['empty input', ''],
  ['one valid row', oneRow],
  ['two valid rows', twoRows],
  ['three lines with one rejected row', twoRows + '\nC, 0.50, 0, rejected'],
  ['same-input change after refusal', twoRows],
]) {
  test('P07-D5 planted old refusal is caught: ' + name, t => {
    for (const [label, application] of [['old refusal plant', oldRefusal], ['current page', app]]) {
      const h = harness(defaultInput, application);
      assertSuccessful(h);
      h.nodes.src.value = input;
      h.event('input');
      h.run();
      if (name === 'same-input change after refusal') h.event('change');
      if (label === 'old refusal plant') {
        assert.throws(() => assertRefused(h), {
          name: 'AssertionError',
          message: /a refused fit must remove prior output and explain the minimum-row requirement/,
        });
        t.diagnostic('Observed FAIL on the planted old refusal: prior output remains visible.');
      } else {
        assertRefused(h);
        t.diagnostic('Observed PASS on the current page for the same refusal assertion.');
      }
    }
  });
}

test('P07-D5 planted old refusal control: valid fit is identical', () => {
  for (const input of [threeRows, defaultInput]) {
    const old = harness(input, oldRefusal), current = harness(input);
    assertSuccessful(old);
    assertSuccessful(current);
    assert.equal(JSON.stringify([old.context._almLastMlma(), old.context.__almReml()]),
      JSON.stringify([current.context._almLastMlma(), current.context.__almReml()]));
    for (const id of ['summary', 'body', 'forest']) {
      assert.equal(old.nodes[id].innerHTML, current.nodes[id].innerHTML);
    }
  }
});
