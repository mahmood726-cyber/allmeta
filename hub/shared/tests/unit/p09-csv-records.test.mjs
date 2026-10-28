import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const engine = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parseTable(text)'));
assert.ok(engine, 'exercise the complete application script');
const plainCSV = 'events,total,label\n10,100,A\n20,100,B';
const copy = value => JSON.parse(JSON.stringify(value));

// Run the real parser, import callback, engine and renderer without a browser.
// Only module mounts and the DOM surface are substitutes.
function app(restored = null) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', innerHTML: '', textContent: '', style: {}, hidden: false,
      listeners: {}, setAttribute(name, value) { this[name] = value; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    });
    return elements.get(id);
  }
  element('src').value = '10,100,A\n20,100,B';
  element('trans').value = 'logit';
  element('tau-est').value = 'PM';
  const context = vm.createContext({ console, document: {
    getElementById: element, addEventListener() {},
    querySelectorAll: () => ['src', 'trans', 'tau-est'].map(element),
  } });
  context.window = context;
  context.MaStudies = {};
  for (const path of ['hub/shared/csv-upload.js', 'shared/ma-core.js',
    'hub/shared/analysis-lifecycle.js', 'proportion-ma/plus-core.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  let csvOptions, undoOptions, written;
  const csvUpload = context.alm.csvUpload;
  context.alm.csvUpload = Object.assign(options => { csvOptions = options; }, csvUpload);
  context.alm.urlState = Object.assign(() => {}, {
    read: () => restored, write: state => { written = copy(state); },
  });
  context.alm.resetUndo = Object.assign(options => { undoOptions = options; }, { snapshot() {} });
  for (const name of ['plotExport', 'axisControls', 'resultsExport', 'tooltips']) context.alm[name] = () => {};
  vm.runInContext(engine, context, { filename: 'proportion-ma/index.html' });
  return {
    context, element, get written() { return written; },
    result: () => copy(context._almLastPropMA()),
    details: () => copy(context.__almPropValidation.snapshot()),
    parse: text => copy(context.__almPropValidation.parse(text)),
    bus: () => copy(context.__propMaBusStudies()),
    plusRows: () => copy(context.AlmPropPlusCore.parse(element('src').value)),
    run: () => element('btn-run').listeners.click(),
    snapshot: () => copy(undoOptions.snapshot()),
    restore: state => undoOptions.restore(state),
    importCSV(text) {
      const parsed = csvUpload.parse(text, csvOptions.columns);
      assert.deepEqual(copy(parsed.warnings), []);
      assert.equal(parsed.rows.length, 2, 'CSV input contains exactly two records');
      csvOptions.onParse(parsed);
      return copy(parsed.rows);
    },
  };
}

for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`P09-R3 plant: quoted ${name} label cannot inject a pooled study`, t => {
    const control = app();
    control.importCSV(plainCSV);
    const actual = app();
    const label = 'A' + newline + '90,100,Injected';
    actual.importCSV('events,total,label' + newline + '10,100,"' + label + '"' + newline + '20,100,B');
    t.diagnostic(JSON.stringify({ control: control.result(), imported: actual.result() }));
    assert.equal(actual.result().k, 2, 'label text must not become a third study');
    assert.deepEqual(actual.result(), control.result(), 'labels cannot alter any pooled result');
    assert.deepEqual(actual.details().studies.map(({ x, n, label }) => ({ x, n, label })),
      [{ x: 10, n: 100, label }, { x: 20, n: 100, label: 'B' }]);
    assert.deepEqual(actual.bus().map(({ est, se }) => ({ est, se })),
      control.bus().map(({ est, se }) => ({ est, se })));
    assert.equal(actual.bus()[0].label, label);
    assert.equal((actual.element('res-body').innerHTML.match(/<tr/g) || []).length, 3);
  });
}

test('P09-R3 plant: commas and escaped quotes survive the import round trip', () => {
  const h = app();
  h.importCSV('events,total,label\n10,100,"A, ""quoted"""\n20,100,B');
  assert.equal(h.details().studies[0].label, 'A, "quoted"');
  assert.equal(h.bus()[0].label, 'A, "quoted"');
  assert.match(h.element('res-body').innerHTML, /A, &quot;quoted&quot;/);
  assert.match(h.element('forest').innerHTML, /A, &quot;quoted&quot;/);
});

test('P09-R3 plant: rerun, restore and manual edits preserve CSV record boundaries', () => {
  const control = app();
  control.importCSV(plainCSV);
  const h = app();
  h.importCSV('events,total,label\n10,100,"A\n90,100,Injected"\n20,100,B');
  const snapshot = h.snapshot();
  h.run();
  assert.deepEqual(h.result(), control.result());
  assert.deepEqual(app(h.written).result(), control.result(), 'URL restoration');
  h.element('src').value = '30,100,Edited\n40,100,B';
  h.run();
  assert.deepEqual(h.details().studies.map(row => row.x), [30, 40]);
  h.restore(snapshot);
  assert.deepEqual(h.result(), control.result(), 'undo restoration');
  assert.equal(h.details().studies[0].label, 'A\n90,100,Injected');
});

test('P09-R3 plant: pasted CSV study syntax preserves a quoted multiline label', () => {
  const h = app();
  assert.deepEqual(h.parse('10,100,"A\n90,100,Injected"\n20,100,B'),
    [{ x: 10, n: 100, label: 'A\n90,100,Injected' }, { x: 20, n: 100, label: 'B' }]);
});

test('P09-R3 plant: GLMM input uses the same imported record boundaries', () => {
  const h = app();
  h.importCSV('events,total,label\n10,100,"A\n90,100,Injected"\n20,100,B');
  assert.deepEqual(h.plusRows(),
    [{ x: 10, n: 100, label: 'A\n90,100,Injected' }, { x: 20, n: 100, label: 'B' }]);
});

test('P09-R3 control: plain CSV equals manual input for every transform and estimator', () => {
  for (const trans of ['logit', 'ft', 'raw']) for (const tau of ['PM', 'DL', 'FE']) {
    const manual = app();
    manual.element('trans').value = trans;
    manual.element('tau-est').value = tau;
    manual.run();
    const imported = app();
    imported.element('trans').value = trans;
    imported.element('tau-est').value = tau;
    imported.importCSV(plainCSV);
    assert.equal(imported.result().k, 2);
    assert.deepEqual(imported.details(), manual.details());
    assert.deepEqual(imported.plusRows(), [{ x: 10, n: 100, label: 'A' }, { x: 20, n: 100, label: 'B' }]);
  }
});

test('P09-R3 control: optional labels, aliases and count validation stay intact', () => {
  const h = app();
  h.context.__almLoad([{ x: 10, n: 100, study: 'A' }, { x: 20, n: 100 }]);
  assert.deepEqual(h.parse(h.element('src').value),
    [{ x: 10, n: 100, label: 'A' }, { x: 20, n: 100, label: 'Study 2' }]);
  assert.deepEqual(h.parse(''), []);
  assert.deepEqual(h.parse('-1,10,A\n11,10,B\n1,0,C\nno,100,D'), []);
  assert.deepEqual(h.parse(' 10, 100, A\n20,100,B '),
    [{ x: 10, n: 100, label: 'A' }, { x: 20, n: 100, label: 'B' }]);
  for (const text of ['1.5,100,A', '-1,100,A', '101,100,A', '1,0,A', 'bad,100,A']) {
    h.element('src').value = text;
    assert.throws(h.plusRows, /Invalid/);
  }
});
