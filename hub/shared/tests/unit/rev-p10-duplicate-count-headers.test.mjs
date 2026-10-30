import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const csvSource = readFileSync(new URL('hub/shared/csv-upload.js', root), 'utf8');
const appSource = readFileSync(new URL('mh-peto/index.html', root), 'utf8');
const columns = [
  { name: 'study', type: 'string' },
  ...['e1', 'n1', 'e2', 'n2'].map(name => ({ name, type: 'int', required: true })),
];
const uniqueCSV = 'study,e1,n1,e2,n2\nA,1,10,2,10\nB,1,10,2,10';
const duplicateCSV = 'study,e1,n1,e2,n2,e1\nA,1,10,2,10,8\nB,1,10,2,10,8';
const expectedRows = [
  { study: 'A', e1: 1, n1: 10, e2: 2, n2: 10 },
  { study: 'B', e1: 1, n1: 10, e2: 2, n2: 10 },
];

function parse(csv) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(csvSource, context);
  return JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse(csv, columns)));
}

function assertRefused(result, column) {
  assert.deepEqual(result.rows, [], `ambiguous counts must not become rows: ${JSON.stringify(result)}`);
  assert.match(result.warnings.join('\n'), /duplicate/i);
  assert.match(result.warnings.join('\n'), new RegExp(`\\b${column}\\b`));
  assert.match(result.warnings.join('\n'), /refus|reject|cannot|unique/i);
}

for (const column of ['e1', 'n1', 'e2', 'n2']) {
  test(`P10-R1 plant: duplicate ${column} count headers refuse the entire CSV`, () => {
    const csv = `study,e1,n1,e2,n2,${column}\nA,1,10,2,10,8\nB,1,10,2,10,8`;
    assertRefused(parse(csv), column);
  });
}

test('P10-R1 plant: quoted and padded duplicate headers are refused after trimming', () => {
  assertRefused(parse(duplicateCSV.replace(',e1\n', '," e1 "\n')), 'e1');
});

test('P10-R1 plant: repeated fuzzy count headers cannot overwrite their mapped count', () => {
  assertRefused(parse(duplicateCSV.replaceAll('e1', 'E1')), 'e1');
});

test('P10-R1 control: unique canonical count headers preserve both studies without warnings', () => {
  const result = parse(uniqueCSV);
  assert.deepEqual(result.rows, expectedRows);
  assert.deepEqual(result.warnings, []);
});

test('P10-R1 control: reordered unique headers retain their count associations', () => {
  const result = parse('n2,e2,study,n1,e1\n10,2,A,10,1\n10,2,B,10,1');
  assert.deepEqual(result.rows, expectedRows);
  assert.deepEqual(result.warnings, []);
});

test('P10-R1 control: one fuzzy count header still imports with its mapping warning', () => {
  const result = parse(uniqueCSV.replace('e1', 'E1'));
  assert.deepEqual(result.rows, expectedRows);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /E1.*e1/);
});

// Execute the real shared upload handlers and mh-peto's registration/loader.
// Only DOM/FileReader and the analysis entry point are replaced; no browser or
// numerical reference values are needed to prove that refused data never runs.
function uploadHarness() {
  function element() {
    return {
      value: '', textContent: '', style: {}, files: [], listeners: {},
      addEventListener(event, handler) { this.listeners[event] = handler; },
    };
  }
  const elements = Object.fromEntries([
    'input[type="file"]', 'textarea', '[data-section="warnings"]',
    '[data-action="parse-paste"]', '[data-action="sample"]',
  ].map(selector => [selector, element()]));
  const mount = { innerHTML: '', querySelector: selector => elements[selector] };
  const source = { value: 'Existing study, 3, 20, 4, 20' };
  const analyses = [];
  let snapshots = 0;
  const context = vm.createContext({
    window: { alm: { resetUndo: { snapshot() { snapshots++; } } } },
    document: {
      head: { appendChild() {} }, createElement: element,
      querySelector(selector) { assert.equal(selector, '#alm-csv-mount'); return mount; },
      getElementById(id) { assert.equal(id, 'src'); return source; },
    },
    FileReader: class {
      readAsText(file) { this.result = file.text; this.onload(); }
    },
    run() { analyses.push(source.value); },
  });
  vm.runInContext(csvSource, context);
  const loader = appSource.match(/window\.__almLoad = function \(rows\) \{[\s\S]*?\n    \};/);
  const registration = appSource.match(/window\.alm\.csvUpload\(\{[\s\S]*?\n    \}\);/);
  assert.ok(loader, 'mh-peto loader must be exercised');
  assert.ok(registration, 'mh-peto CSV registration must be exercised');
  vm.runInContext(loader[0], context);
  vm.runInContext(registration[0], context);
  return {
    source, analyses,
    get snapshots() { return snapshots; },
    get warning() { return elements['[data-section="warnings"]'].textContent; },
    upload(csv, route) {
      if (route === 'file') {
        const input = elements['input[type="file"]'];
        input.files = [{ text: csv }];
        input.listeners.change();
      } else {
        elements.textarea.value = csv;
        elements['[data-action="parse-paste"]'].listeners.click();
      }
    },
  };
}

for (const route of ['paste', 'file']) {
  test(`P10-R1 plant: ${route} displays refusal without loading or analyzing overwritten counts`, () => {
    const h = uploadHarness();
    const originalSource = h.source.value;
    h.upload(duplicateCSV, route);
    assert.equal(h.analyses.length, 0, 'ambiguous upload must not run analysis');
    assert.equal(h.snapshots, 0, 'refused import must not replace the undo snapshot');
    assert.equal(h.source.value, originalSource);
    assert.match(h.warning, /duplicate.*e1/i);
    assert.match(h.warning, /refus|reject|cannot|unique/i);
  });

  test(`P10-R1 control: ${route} imports unique counts and runs analysis once`, () => {
    const h = uploadHarness();
    h.upload(uniqueCSV, route);
    assert.deepEqual(h.analyses, ['A, 1, 10, 2, 10\nB, 1, 10, 2, 10']);
    assert.equal(h.snapshots, 1);
    assert.equal(h.warning, '');
  });

  test(`P10-R1 plant: ${route} can recover from a refused CSV with a unique-header import`, () => {
    const h = uploadHarness();
    h.upload(duplicateCSV, route);
    h.upload(uniqueCSV, route);
    assert.deepEqual(h.analyses, ['A, 1, 10, 2, 10\nB, 1, 10, 2, 10']);
    assert.equal(h.snapshots, 1);
    assert.equal(h.warning, '');
  });
}
