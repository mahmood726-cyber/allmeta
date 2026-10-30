import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const start = html.indexOf('    var Z975 =');
const end = html.indexOf('    function drawLabbe(', start);
assert.ok(start >= 0 && end > start, 'the production parser, engine and run function are present');
const code = html.slice(start, end);

// Execute the actual parser and run path without a browser. Only drawing and
// the shared lifecycle wrapper are stubbed; parsing, pooling and errors are real.
function app() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', textContent: '', hidden: true, disabled: false,
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
    });
    return elements.get(id);
  };
  const ctx = vm.createContext({
    document: { getElementById: element },
    window: { alm: { analysisLifecycle: fn => fn } },
    drawForest() {}, drawLabbe() {},
  });
  vm.runInContext(code, ctx, { filename: 'mh-peto/index.html' });
  element('measure').value = 'OR';
  return { ctx, element, run(text) { element('src').value = text; ctx.run(); } };
}

const valid = 'A,1,10,2,10\nB,2,20,3,20\nC,3,30,4,30';
const plain = value => JSON.parse(JSON.stringify(value));
const expected = [
  { label: 'A', e1: 1, n1: 10, e2: 2, n2: 10 },
  { label: 'B', e1: 2, n1: 20, e2: 3, n2: 20 },
  { label: 'C', e1: 3, n1: 30, e2: 4, n2: 30 },
];

test('plant P10-R6: a first study with blank counts blocks pooling and clears prior results', () => {
  const a = app();
  a.run(valid);
  assert.equal(a.ctx._lastResults.k, 3, 'control input creates results before the invalid rerun');
  const input = 'MissingTrial,,,,\n' + valid;
  a.run(input);
  assert.equal(a.ctx._lastResults, null, 'an incomplete first study must prevent partial pooling');
  assert.equal(a.element('pooled-body').innerHTML, '');
  assert.equal(a.element('per-body').innerHTML, '');
  assert.equal(a.element('k-note').textContent, '');
  assert.equal(a.element('input-errors').hidden, false);
  assert.match(a.element('input-errors').innerHTML, /No analysis was run/);
  assert.match(a.element('input-errors').innerHTML, /Line 1 \(MissingTrial\)/);
  for (const field of ['e1', 'n1', 'e2', 'n2']) {
    assert.ok(a.element('input-errors').innerHTML.includes(field + ' is empty'));
  }
  assert.equal(a.element('src').attributes['aria-invalid'], 'true');
  assert.deepEqual(plain(a.ctx.parse(input)), []);
  assert.deepEqual(plain(a.ctx.parseInput(input).notes), []);
});

for (const [name, first, message] of [
  ['blank counts under a header-like study label', 'study,,,,', /e1 is empty/],
  ['all nonnumeric counts', 'MissingTrial,NA,NA,NA,NA', /e1 = "NA" is not a whole number/],
  ['empty study label and counts', ',,,,', /e1 is empty/],
  ['too few blank fields', 'MissingTrial,,,', /expected 5 values .* found 4/],
  ['too many blank fields', 'MissingTrial,,,,,', /expected 5 values .* found 6/],
  ['unknown textual header', 'trial,events,total,events,total', /e1 = "events" is not a whole number/],
  ['misordered header', 'study,n1,e1,e2,n2', /e1 = "n1" is not a whole number/],
  ['header with extra column', 'study,e1,n1,e2,n2,extra', /expected 5 values .* found 6/],
]) {
  test('plant P10-R6: first row with ' + name + ' is validated', () => {
    const a = app(), input = first + '\n' + valid;
    const parsed = a.ctx.parseInput(input);
    assert.equal(parsed.errors.length, 1, 'unrecognized first rows must not be discarded as headers');
    assert.equal(parsed.errors[0].line, 1);
    assert.match(parsed.errors[0].message, message);
    assert.deepEqual(plain(parsed.notes), []);
    assert.deepEqual(plain(a.ctx.parse(input)), []);
  });
}

test('control: explicit headers preserve all valid studies across supported delimiters', () => {
  const a = app();
  for (const delimiter of [',', '\t', ';']) {
    for (const [header, rows] of [
      ['study,e1,n1,e2,n2', valid],
      ['e1,n1,e2,n2,label', '1,10,2,10,A\n2,20,3,20,B\n3,30,4,30,C'],
      ['e1,n1,e2,n2,study', '1,10,2,10,A\n2,20,3,20,B\n3,30,4,30,C'],
      ['e1,n1,e2,n2', '1,10,2,10\n2,20,3,20\n3,30,4,30'],
    ]) {
      const normalizedHeader = header.split(',').map(field => ' "' + field.toUpperCase() + '" ').join(delimiter);
      const input = '\r\n' + normalizedHeader + '\r\n' + rows.replaceAll(',', delimiter);
      const parsed = a.ctx.parseInput(input);
      assert.deepEqual(plain(parsed.errors), [], input);
      assert.deepEqual(plain(parsed.notes), ['Line 2 looks like a header row and was ignored.']);
      const labels = header === 'e1,n1,e2,n2' ? expected.map((r, i) => ({ ...r, label: 'Study ' + (i + 1) })) : expected;
      assert.deepEqual(plain(a.ctx.parse(input)), labels);
      a.run(input);
      assert.equal(a.ctx._lastResults.k, 3);
      assert.equal(a.element('input-errors').hidden, true);
    }
  }
});

test('control: headerless label-first and legacy numeric-first data preserve every row', () => {
  const a = app();
  for (const input of [valid, '1,10,2,10,A\n2,20,3,20,B\n3,30,4,30,C']) {
    assert.deepEqual(plain(a.ctx.parse(input)), expected);
    assert.deepEqual(plain(a.ctx.parseInput(input).notes), []);
    a.run(input);
    assert.equal(a.ctx._lastResults.k, 3);
  }
  assert.deepEqual(plain(a.ctx.parse('"Smith, 2001",1,10,2,10\nB,2,20,3,20')), [
    { ...expected[0], label: 'Smith, 2001' }, expected[1],
  ]);
});

test('control: later blank studies and repeated headers still block the whole analysis', () => {
  const a = app();
  for (const [input, line] of [
    [valid + '\nMissingTrial,,,,', 4],
    ['study,e1,n1,e2,n2\nMissingTrial,,,,\n' + valid, 2],
    ['study,e1,n1,e2,n2\nstudy,e1,n1,e2,n2\n' + valid, 2],
  ]) {
    const parsed = a.ctx.parseInput(input);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].line, line);
    assert.deepEqual(plain(a.ctx.parse(input)), []);
    a.run(input);
    assert.equal(a.ctx._lastResults, null);
    assert.equal(a.element('input-errors').hidden, false);
  }
});

test('control: repairing a blank first study restores all four studies and clears errors', () => {
  const a = app();
  a.run('study,e1,n1,e2,n2\nMissingTrial,,,,\n' + valid);
  assert.equal(a.element('input-errors').hidden, false);
  a.run('MissingTrial,1,10,2,10\n' + valid);
  assert.equal(a.ctx._lastResults.k, 4);
  assert.equal(a.element('input-errors').hidden, true);
  assert.equal(a.element('src').attributes['aria-invalid'], undefined);
  assert.match(a.element('per-body').innerHTML, /MissingTrial/);
});
