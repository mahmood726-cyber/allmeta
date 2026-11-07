import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('mh-peto/index.html', root), 'utf8');
const csvCode = readFileSync(new URL('hub/shared/csv-upload.js', root), 'utf8');
const pageCode = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('window.__almLoad ='));
assert.ok(pageCode, 'the real page engine and CSV loader must be exercised');

// Run the complete application script, including its parser, pooling engine,
// rendering and CSV onParse callback. Only DOM and unrelated widget APIs are stubs.
function harness(measure = 'OR') {
  const elements = new Map();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    const attributes = new Map();
    elements.set(match[1], {
      value: '', innerHTML: '', textContent: '', hidden: true,
      addEventListener() {},
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
    });
  }
  const get = id => {
    assert.ok(elements.has(id), `missing page element: ${id}`);
    return elements.get(id);
  };
  get('src').value = 'Previous A, 1, 100, 4, 100\nPrevious B, 2, 100, 6, 100';
  get('measure').value = measure;
  const context = vm.createContext({
    window: {},
    document: { getElementById: get, querySelectorAll: () => [] },
  });
  vm.runInContext(csvCode, context, { filename: 'hub/shared/csv-upload.js' });
  const alm = context.window.alm;
  const parseCSV = alm.csvUpload.parse;
  let uploadOptions, runs = 0;
  alm.csvUpload = options => { uploadOptions = options; };
  alm.csvUpload.parse = parseCSV;
  alm.analysisLifecycle = run => function (...args) { runs++; return run.apply(this, args); };
  for (const name of ['plotExport', 'axisControls', 'resultsExport', 'tooltips']) alm[name] = () => {};
  alm.urlState = Object.assign(() => {}, { read: () => ({}), write() {} });
  alm.resetUndo = Object.assign(() => {}, { snapshot() {} });
  vm.runInContext(pageCode, context, { filename: 'mh-peto/index.html' });
  return {
    get, window: context.window,
    get runs() { return runs; },
    parseCSV(text) { return parseCSV(text, uploadOptions.columns); },
    importCSV(text) {
      const result = this.parseCSV(text);
      uploadOptions.onParse(result);
      return result;
    },
  };
}

const plain = value => JSON.parse(JSON.stringify(value));
const ordinaryCSV = 'study,e1,n1,e2,n2\nTrial A,3,100,5,100\nTrial B,2,80,6,80';

function assertRejected(h, csv, t) {
  const parsed = h.parseCSV(csv);
  assert.equal(parsed.rows.length, 2, 'CSV contains exactly two records');
  assert.deepEqual(plain(parsed.warnings), [], 'the shared CSV parser accepts this valid CSV');
  const before = {
    src: h.get('src').value,
    result: h.window._almLastMhPeto(),
    pooled: h.get('pooled-body').innerHTML,
    forest: h.get('forest').innerHTML,
    runs: h.runs,
  };
  h.importCSV(csv);
  const after = h.window._almLastMhPeto();
  t.diagnostic(`CSV records=${parsed.rows.length}; exported k after import=${after?.k ?? 'null'}; analysis runs added=${h.runs - before.runs}`);
  assert.equal(after?.k, before.result.k, 'an unsupported label must not add studies or clear the current analysis');
  assert.equal(h.get('src').value, before.src, 'reject the whole import before replacing any input');
  assert.equal(h.runs, before.runs, 'do not analyse any part of the rejected import');
  assert.equal(after, before.result, 'keep results belonging to the unchanged input');
  assert.equal(h.get('pooled-body').innerHTML, before.pooled);
  assert.equal(h.get('forest').innerHTML, before.forest);
  const notice = h.get('input-errors');
  assert.equal(notice.hidden, false, 'rejection must be visible');
  const message = notice.textContent + notice.innerHTML;
  assert.match(message, /CSV.*not (?:loaded|imported)/i);
  assert.match(message, /(?:row|record) 2/i, 'identify the CSV record, not a physical line');
  assert.match(message, /(?:line break|multiline|multiple lines)/i);
  assert.match(message, /(?:single line|one line|remove.*line break)/i, 'explain how to repair the label');
  assert.match(message, /(?:unchanged|kept)/i, 'explain that existing input and results still apply');
}

for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
  test(`P10-R2 plant: ${name} inside a CSV label cannot inject an analysed study`, t => {
    const csv = `study,e1,n1,e2,n2\nOrdinary,2,100,4,100\n"Injected,8,100,1,100${newline}Real",3,100,5,100`;
    for (const measure of ['OR', 'RR', 'RD']) assertRejected(harness(measure), csv, t);
  });
}

test('P10-R2 plant: a plain multiline label is visibly rejected without clearing previous results', t => {
  assertRejected(harness(), 'study,e1,n1,e2,n2\nOrdinary,2,100,4,100\n"Trial\ncontinuation",3,100,5,100', t);
});

for (const measure of ['OR', 'RR', 'RD']) {
  test(`P10-R2 control: ordinary CSV preserves two studies, labels and ${measure} results`, () => {
    const h = harness(measure);
    const beforeRuns = h.runs;
    const parsed = h.importCSV(ordinaryCSV);
    assert.deepEqual(plain(parsed.warnings), []);
    assert.equal(h.runs, beforeRuns + 1);
    assert.equal(h.window._almLastMhPeto().k, 2);
    assert.equal(h.get('input-errors').hidden, true);
    assert.deepEqual(plain(h.window.__mhValidation.parse(h.get('src').value)), [
      { label: 'Trial A', e1: 3, n1: 100, e2: 5, n2: 100 },
      { label: 'Trial B', e1: 2, n1: 80, e2: 6, n2: 80 },
    ]);
    const manual = harness(measure);
    manual.get('src').value = 'Trial A,3,100,5,100\nTrial B,2,80,6,80';
    manual.window.__mhValidation.run();
    assert.deepEqual(plain(h.window._almLastMhPeto()), plain(manual.window._almLastMhPeto()));
  });
}

test('P10-R2 control: optional blank study labels still load', () => {
  const h = harness();
  h.importCSV('study,e1,n1,e2,n2\n,3,100,5,100\n,2,80,6,80');
  assert.equal(h.window._almLastMhPeto().k, 2);
  assert.deepEqual(plain(h.window.__mhValidation.parse(h.get('src').value)).map(row => row.label), ['Study 1', 'Study 2']);
  assert.equal(h.get('input-errors').hidden, true);
});

test('P10-R2 plant: a corrected CSV loads after a rejected import and clears the notice', t => {
  const h = harness();
  assertRejected(h, 'study,e1,n1,e2,n2\nOrdinary,2,100,4,100\n"Injected,8,100,1,100\nReal",3,100,5,100', t);
  const beforeRuns = h.runs;
  h.importCSV(ordinaryCSV);
  assert.equal(h.runs, beforeRuns + 1);
  assert.equal(h.window._almLastMhPeto().k, 2);
  assert.equal(h.get('input-errors').hidden, true);
  assert.equal(h.get('src').value, 'Trial A, 3, 100, 5, 100\nTrial B, 2, 80, 6, 80');
});
