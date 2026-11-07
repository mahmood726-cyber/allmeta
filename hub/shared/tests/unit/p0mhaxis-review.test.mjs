import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('    var Z975'), html.indexOf('    var _axisState'));
const ui = html.slice(html.indexOf('    var MEASURE_NAME'), html.indexOf("    document.getElementById('btn-run').addEventListener"));
// Synthetic arithmetic/interaction fixtures, not clinical evidence.
const ordinary = 'A,12,100,20,100\nB,5,80,15,90\nC,2,50,5,60';
const underflow = 'A,1,1000000,1,1\nB,1,1000000,1,1';

function page(src = ordinary, measure = 'OR') {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', textContent: '', hidden: true,
      setAttribute(key, value) { this[key] = value; },
      removeAttribute(key) { delete this[key]; },
    });
    return elements.get(id);
  }
  element('src').value = src;
  element('measure').value = measure;
  const context = createContext({ window: {}, document: {
    getElementById: element, querySelector: () => element('scale'),
  } });
  runInContext(core + '\nvar _axisState = {}, _lastResults = null;\n' + ui, context);
  return { element, context, run: () => runInContext('run()', context) };
}

function finiteForest(p) {
  const svg = p.element('forest').innerHTML;
  assert.match(svg, /class="forest-axis"/);
  assert.match(svg, /<polygon points="/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
}

test('control: ordinary OR/RR/RD analyses retain finite plots and results with custom limits', () => {
  for (const measure of ['OR', 'RR', 'RD']) {
    const p = page(ordinary, measure);
    p.run();
    finiteForest(p);
    const results = JSON.stringify(p.context._lastResults);
    p.context._axisState = { x: measure === 'RD' ? [-1, 1] : [0.1, 10] };
    p.run();
    finiteForest(p);
    assert.equal(JSON.stringify(p.context._lastResults), results);
    assert.equal(p.element('axis-note').hidden, true);
  }
});

test('custom ratio limits preserve the forest when a computed Peto ratio underflows to zero', () => {
  const p = page(underflow);
  p.run();
  assert.equal(p.context.parseInput(underflow).errors.length, 0);
  assert.equal(p.context._lastResults.peto_est, 0);
  assert.equal(p.context._lastResults.peto_lo, 0);
  finiteForest(p); // Automatic-range control already works before the fix.
  const results = JSON.stringify(p.context._lastResults);
  for (const x of [[null, 10], [1e-9, null], [1e-9, 10]]) {
    p.context._axisState = { x };
    p.run();
    finiteForest(p);
    assert.equal(JSON.stringify(p.context._lastResults), results);
    assert.equal(p.element('axis-note').hidden, true);
  }
});

for (const [name, src] of [
  ['invalid count', ordinary + '\nBad,2.5,100,4,100'],
  ['one study', 'A,12,100,20,100'],
  ['empty input', ''],
]) {
  test(`axis advisory is cleared when ${name} clears the analysis`, () => {
    const p = page();
    p.context._axisState = { x: [0, 10] };
    p.run();
    assert.equal(p.element('axis-note').hidden, false);
    assert.match(p.element('axis-note').textContent, /Automatic log limits are shown/);
    finiteForest(p);
    p.element('src').value = src;
    p.run();
    assert.equal(p.context._lastResults, null);
    assert.equal(p.element('forest').innerHTML, '');
    assert.equal(p.element('axis-note').hidden, true);
    assert.equal(p.element('axis-note').textContent, '');
    p.element('src').value = ordinary;
    p.run();
    assert.equal(p.element('axis-note').hidden, false);
    finiteForest(p);
  });
}

test('control: correcting ratio limits clears the advisory while retaining analysis', () => {
  const p = page();
  p.context._axisState = { x: [0, 10] };
  p.run();
  assert.equal(p.element('axis-note').hidden, false);
  const results = JSON.stringify(p.context._lastResults);
  p.context._axisState = { x: [0.1, 10] };
  p.run();
  assert.equal(p.element('axis-note').hidden, true);
  assert.equal(p.element('axis-note').textContent, '');
  assert.equal(JSON.stringify(p.context._lastResults), results);
  finiteForest(p);
});
