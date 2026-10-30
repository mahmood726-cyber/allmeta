import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const start = html.indexOf('// ---- engine (unchanged from pre-retrofit) ----');
const end = html.indexOf('// ---- module init ----', start);
assert.ok(start >= 0 && end > start, 'mh-peto engine and UI markers must exist');

// Execute the page's actual parser, pooling, rendering and export hooks without a
// browser. Only DOM storage/events and the shared lifecycle wrapper are stubbed.
function page() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const attributes = new Map();
      elements.set(id, {
        value: '', innerHTML: '', textContent: '', hidden: false, disabled: false,
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        removeAttribute(name) { attributes.delete(name); },
        addEventListener() {},
      });
    }
    return elements.get(id);
  }
  const window = { alm: { analysisLifecycle: run => run } };
  const context = vm.createContext({ window, document: { getElementById: element, querySelectorAll: () => [] } });
  vm.runInContext(html.slice(start, end), context, { filename: 'mh-peto/index.html' });
  element('measure').value = 'OR';
  return {
    window, element,
    parseInput: text => JSON.parse(JSON.stringify(window.__mhValidation.parseInput(text))),
    parse: text => JSON.parse(JSON.stringify(window.__mhValidation.parse(text))),
    run(text) { element('src').value = text; window.__mhValidation.run(); return window._almLastMhPeto(); },
  };
}

const good = '"1",10,20,100,200\nB,2,50,3,50';
const missing = '"1",10,20,100,\nB,2,50,3,50';
const firstRow = { e1: 10, n1: 20, e2: 100, n2: 200, label: '1' };
const secondRow = { e1: 2, n1: 50, e2: 3, n2: 50, label: 'B' };

for (const [name, delimiter] of [['comma', ','], ['tab', '\t'], ['semicolon', ';']]) {
  test(`plant P10-R1: ${name} input refuses missing n2 after a quoted numeric label`, () => {
    const app = page();
    const raw = ['"1"', '10', '20', '100', ''].join(delimiter);
    const text = raw + '\nB,2,50,3,50';
    const parsed = app.parseInput(text);
    assert.deepEqual(parsed.errors, [{ line: 1, label: '1', text: raw, message: 'n2 is empty.' }]);
    assert.deepEqual(parsed.rows, [{ ...secondRow, line: 2 }]);
    assert.deepEqual(app.parse(text), [], 'one invalid row must prevent all pooling');
  });
}

test('plant P10-R1: whitespace and quoted-empty n2 retain the numeric study label', () => {
  const app = page();
  for (const last of ['   ', '""']) {
    const raw = '  "001" ,10,20,100,' + last;
    const text = 'study,e1,n1,e2,n2\r\n\r\n' + raw + '\r\nB,2,50,3,50';
    const parsed = app.parseInput(text);
    assert.deepEqual(parsed.errors, [{ line: 3, label: '001', text: raw, message: 'n2 is empty.' }]);
    assert.equal(parsed.notes.length, 1);
    assert.deepEqual(app.parse(text), []);
  }
});

test('plant P10-R1: rejected input clears prior results and blocks R export until repaired', () => {
  const app = page();
  assert.equal(app.run(good).k, 2);
  assert.ok(app.element('pooled-body').innerHTML.length > 0);
  app.window.__mhPetoLoo.restore({ stale: true });
  app.element('loo-body').innerHTML = '<tr>previous analysis</tr>';
  app.element('btn-loo-csv').disabled = false;

  const result = app.run(missing);
  assert.equal(result, null, 'missing n2 must not produce a different valid table: ' + JSON.stringify(result));
  assert.equal(app.element('input-errors').hidden, false);
  assert.match(app.element('input-errors').innerHTML, /No analysis was run/);
  assert.match(app.element('input-errors').innerHTML, /Line 1 \(1\): n2 is empty/);
  assert.equal(app.element('src').getAttribute('aria-invalid'), 'true');
  for (const id of ['pooled-body', 'per-body', 'forest', 'het-body', 'loo-body']) {
    assert.equal(app.element(id).innerHTML, '', id);
  }
  assert.equal(app.window.__mhPetoLoo.last(), null);
  assert.equal(app.element('btn-loo-csv').disabled, true);
  assert.equal(app.window.__mhPetoRScript(), null);

  assert.equal(app.run(good).k, 2);
  assert.equal(app.element('input-errors').hidden, true);
  assert.equal(app.element('src').getAttribute('aria-invalid'), null);
  assert.equal(typeof app.window.__mhPetoRScript(), 'string');
});

test('control: complete quoted and unquoted numeric labels preserve counts and pooling', () => {
  const app = page();
  assert.deepEqual(app.parse(good), [firstRow, secondRow]);
  const expected = JSON.parse(JSON.stringify(app.run(good)));
  assert.equal(expected.k, 2);
  assert.ok(Number.isFinite(expected.mh_est));
  assert.ok(Number.isFinite(expected.peto_est));
  for (const label of ['1', '"1"', '001', '"001"']) {
    const text = label + ',10,20,100,200\nB,2,50,3,50';
    assert.deepEqual(app.parse(text), [{ ...firstRow, label: label.replaceAll('"', '') }, secondRow]);
    assert.deepEqual(JSON.parse(JSON.stringify(app.run(text))), expected);
  }
});

test('control: legacy rows preserve optional labels and quotes outside the first field', () => {
  const app = page();
  for (const [raw, label] of [
    ['10,20,100,200', 'Study 1'],
    ['10,20,100,200,', 'Study 1'],
    ['10,20,100,200,""', 'Study 1'],
    ['10,20,100,200,Legacy', 'Legacy'],
    ['10,20,100,200,"Legacy, trial"', 'Legacy, trial'],
    ['10,"20",100,200,Legacy', 'Legacy'],
    ['"10",20,100,200', 'Study 1'],
  ]) {
    assert.deepEqual(app.parseInput(raw).errors, [], raw);
    assert.deepEqual(app.parse(raw), [{ ...firstRow, label }], raw);
    const text = raw + '\nB,2,50,3,50';
    assert.deepEqual(JSON.parse(JSON.stringify(app.run(text))), JSON.parse(JSON.stringify(app.run(good))), raw);
  }
});

test('control: missing n2 after a text label is refused and clears outputs', () => {
  const app = page();
  const raw = 'Trial,10,20,100,';
  const text = raw + '\nB,2,50,3,50';
  assert.deepEqual(app.parseInput(text).errors, [{ line: 1, label: 'Trial', text: raw, message: 'n2 is empty.' }]);
  assert.deepEqual(app.parse(text), []);
  assert.equal(app.run(good).k, 2);
  assert.equal(app.run(text), null);
  assert.match(app.element('input-errors').innerHTML, /Line 1 \(Trial\): n2 is empty/);
  assert.equal(app.element('pooled-body').innerHTML, '');
});
