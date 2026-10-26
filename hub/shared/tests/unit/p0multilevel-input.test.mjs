import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('multilevel-ma/index.html', root), 'utf8');
const appCode = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parse(text)'));
assert.ok(appCode, 'test must execute the real app script');
const parserCode = appCode.slice(appCode.indexOf('    function parse(text)'), appCode.indexOf('    function fmt('));
const parser = vm.createContext({});
vm.runInContext(parserCode, parser);
const parse = text => JSON.parse(JSON.stringify(parser.parse(text)));

// Synthetic parser inputs only; no research results or source identifiers.
const valid = 'study-a, 0.35, 0.12, first\nstudy-a, 0.28, 0.11\nstudy-b, -0.18, 0.09';

for (const [field, index] of [['effect', 1], ['SE', 2]]) {
  for (const token of ['0.0O', '0.1junk', '1e', '1e+', '0x10', 'NaN', 'Infinity', '1e309', '']) {
    test(`P0-8: reject the entire input for ${field} token ${JSON.stringify(token)}`, () => {
      const row = ['study-c', '0.2', '0.1'];
      row[index] = token;
      assert.throws(() => parse(valid + '\n' + row.join(', ')), new RegExp(`Line 4:.*${field}`, 'i'));
    });
  }
}

test('P0-8: missing SE is a line error, never a silently dropped row', () => {
  assert.throws(() => parse(valid + '\nstudy-c, 0.2'), /Line 4:.*SE/i);
});

test('P0-8: missing study, nonpositive SE, and excess columns are refused', () => {
  for (const row of [', 0.2, 0.1', 'study-c, 0.2, 0', 'study-c, 0.2, -0.1', 'study-c, 0.2, 0.1, label, extra']) {
    assert.throws(() => parse(valid + '\n' + row), /Line 4:/);
  }
});

test('P0-8: errors retain physical line numbers across blank lines and CRLF', () => {
  assert.throws(() => parse('\r\n  \r\n' + valid.replaceAll('\n', '\r\n') + '\r\n\r\nstudy-c, 0.0O, 0.1'), /Line 7:.*effect/i);
});

test('control: signed decimals, zero, exponent notation, whitespace and optional labels', () => {
  assert.deepEqual(parse('\n study-a, +.35, 1.2e-1, first \r\n\n study-a, 0, +0.11\r\nstudy-b, -2., 9E-2, \n'), [
    { study: 'study-a', te: 0.35, se: 0.12, label: 'first' },
    { study: 'study-a', te: 0, se: 0.11, label: '' },
    { study: 'study-b', te: -2, se: 0.09, label: '' },
  ]);
  assert.deepEqual(parse(' \r\n\t'), []);
});

// Execute the entire app and real lifecycle/estimators; stub only the DOM and
// unrelated widget mounts. This exercises the actual Run click and load paths.
function app() {
  const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(match => {
    const id = match[1];
    return [id, { id, hidden: /\bhidden\b/.test(match[0]), value: '', innerHTML: '', textContent: '',
      handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; },
      setAttribute(name, value) { this[name] = value; }, matches(selector) { return selector === '#' + id; } }];
  }));
  const src = elements.get('src');
  src.value = html.match(/<textarea[^>]+id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: selector => selector === '#src' ? [src] : [],
    addEventListener() {},
  };
  const noop = () => {};
  const context = vm.createContext({ document, console });
  context.window = context;
  context.alm = { csvUpload: noop, plotExport: noop, axisControls: noop, resultsExport: noop,
    urlState: Object.assign(noop, { read: () => ({}), write: noop }),
    resetUndo: Object.assign(noop, { snapshot: noop }), tooltips: noop };
  for (const file of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/multilevel-reml.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  vm.runInContext(appCode, context, { filename: 'multilevel-ma/index.html' });
  return { elements, context, run(text) { src.value = text; elements.get('btn-run').handlers.click(); } };
}

for (const row of ['study-c, 0.0O, 0.1', 'study-c, 0.2']) {
  test(`P0-8 Run: visible line error and no partial analysis for ${row}`, () => {
    const h = app();
    assert.ok(h.context._almLastMlma());
    let fits = 0;
    const fit = h.context.AlmMultilevelREML.fit;
    h.context.AlmMultilevelREML.fit = (...args) => { fits++; return fit(...args); };
    assert.doesNotThrow(() => h.run(valid + '\n' + row));
    assert.equal(fits, 0, 'malformed input must never reach REML');
    assert.equal(h.context._almLastMlma(), null);
    assert.equal(h.context.__almReml(), null);
    const error = h.elements.get('input-error');
    assert.ok(error, 'the input needs a visible error element');
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /Line 4:/);
    assert.equal(h.elements.get('analysis-status').hidden, true);
    for (const id of ['summary', 'body', 'forest']) assert.equal(h.elements.get(id).innerHTML, '');

    h.run(valid);
    assert.equal(h.context._almLastMlma().k, 3);
    assert.equal(fits, 1);
    assert.equal(error.hidden, true);
    assert.equal(error.textContent, '');
    assert.equal(h.elements.get('analysis-status').hidden, false);
    assert.match(h.elements.get('forest').innerHTML, /polygon/);
  });
}

test('control: existing fixture stays numerically identical through Run', () => {
  const fixture = readFileSync(new URL('multilevel-ma/tests/fixtures/mlma-tiny.csv', root), 'utf8');
  const h = app();
  h.run(fixture.split(/\r?\n/).slice(1).join('\n'));
  const result = h.context._almLastMlma();
  // Existing MoM R reference: multilevel-ma/tests/test_against_metafor.py.
  assert.equal(result.k, 6);
  assert.equal(result.J, 3);
  assert.ok(Math.abs(result.mu - 0.3130836394161561) < 1e-6);
  assert.ok(Math.abs(result.seMu - 0.06607061847114695) < 1e-6);
  assert.ok(Math.abs(result.tau2_study - 0.01266049129297928) < 1e-6);
  assert.equal(result.tau2_within, 0);
});

test('P0-8 load control: numeric zero effect and study survive CSV serialization', () => {
  const h = app();
  h.context.__almLoad([
    { study: 0, effect: 0, SE: 0.12 },
    { study: 0, effect: 0.28, SE: 0.11 },
    { study: 'study-b', te: -0.18, se: 0.09 },
  ]);
  assert.equal(h.context._almLastMlma()?.k, 3);
  assert.equal(h.context.__almMlmaParse(h.elements.get('src').value)[0].te, 0);
  assert.equal(h.context.__almMlmaParse(h.elements.get('src').value)[0].study, '0');
});

test('P0-8 load: missing SE remains invalid instead of falling back to a different column', () => {
  const h = app();
  h.context.__almLoad([
    { study: 'study-a', effect: 0.35, SE: 0.12 },
    { study: 'study-a', effect: 0.28, SE: 0.11 },
    { study: 'study-b', effect: -0.18, SE: 0.09 },
    { study: 'study-c', effect: 0.2, SE: '', se: 0.15 },
  ]);
  assert.equal(h.context._almLastMlma(), null);
  assert.match(h.elements.get('input-error').textContent, /Line 4:.*SE/i);
});
