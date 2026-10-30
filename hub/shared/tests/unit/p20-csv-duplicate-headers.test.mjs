import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const csvSource = readFileSync(new URL('hub/shared/csv-upload.js', root), 'utf8');
const accuracySource = readFileSync(new URL('shared/effect-size-accuracy.js', root), 'utf8');
const html = readFileSync(new URL('effect-size-converter/index.html', root), 'utf8');
const adapterStart = html.indexOf('window.__almLoadCSV = function');
const adapterEnd = html.indexOf('window.alm.axisControls(', adapterStart);
assert.ok(adapterStart >= 0 && adapterEnd > adapterStart, 'locate the real CSV adapter');
const adapterSource = html.slice(adapterStart, adapterEnd);
const headers = 'm1,sd1,n1,m2,sd2,n2';
const values = '52.5,8.2,30,47.1,7.9,30';
const cleanCSV = headers + '\n' + values;
const duplicateCSV = headers + ',m1\n' + values + ',99';
const expectedRow = { m1: 52.5, sd1: 8.2, n1: 30, m2: 47.1, sd2: 7.9, n2: 30 };

function parser() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(csvSource, context);
  // Capture the actual app schema, without mounting its UI.
  let options;
  const parse = context.window.alm.csvUpload.parse;
  context.window.alm.csvUpload = opts => { options = opts; };
  vm.runInContext(adapterSource, context);
  return (text, columns = options.columns) =>
    JSON.parse(JSON.stringify(parse(text, columns)));
}

function assertRejected(result, header) {
  assert.equal(result.rows.length, 0, 'ambiguous headers must yield no importable rows');
  const warning = result.warnings.find(w => /CSV rejected/i.test(w));
  assert.ok(warning, 'rejection must be visible through the existing warnings UI');
  assert.match(warning, /duplicate|ambiguous/i);
  assert.ok(warning.includes('"' + header + '"'), 'identify the conflicting header');
}

test('P20-R2 plant: duplicate m1 cannot replace 52.5 with 99', () => {
  assertRejected(parser()(duplicateCSV), 'm1');
});

test('P20-R2 plant: quoted and trimmed duplicates are rejected', () => {
  assertRejected(parser()(headers + '," m1 "\n' + values + ',99'), 'm1');
});

test('P20-R2 plant: repeated fuzzy headers cannot overwrite their mapped destination', () => {
  assertRejected(parser()('M1,sd1,n1,m2,sd2,n2,M1\n' + values + ',99'), 'M1');
});

test('P20-R2 plant: repeated unrelated headers are also ambiguous', () => {
  assertRejected(parser()(headers + ',annotation,annotation\n' + values + ',first,second'), 'annotation');
});

test('P20-R2 plant: duplicate headers are rejected even without data rows', () => {
  assertRejected(parser()(headers + ',m1'), 'm1');
});

test('P20-R2 control: distinct unrelated columns preserve all values', () => {
  const result = parser()(headers + ',annotation,source\n' + values + ',first,second');
  assert.deepEqual(result.rows, [{ ...expectedRow, annotation: 'first', source: 'second' }]);
  assert.deepEqual(result.warnings, []);
});

test('P20-R2 control: a unique fuzzy header still maps with a warning', () => {
  const result = parser()('M1,sd1,n1,m2,sd2,n2\n' + values);
  assert.deepEqual(result.rows, [expectedRow]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /"M1" mapped to "m1"/);
});

test('P20-R2 control: exact destinations take priority over nearby unrelated columns', () => {
  for (const text of ['sd,se\n8.2,0.1', 'se,sd\n0.1,8.2']) {
    const result = parser()(text, [{ name: 'se', type: 'float' }]);
    assert.deepEqual(result.rows, [{ sd: '8.2', se: 0.1 }]);
    assert.deepEqual(result.warnings, []);
  }
});

test('P20-R2 control: quoting and multiple rows still parse normally', () => {
  const result = parser()('label,note\n"Smith, 2024","line1\nline2"\nB,"He said ""hi"""', []);
  assert.deepEqual(result.rows, [
    { label: 'Smith, 2024', note: 'line1\nline2' },
    { label: 'B', note: 'He said "hi"' },
  ]);
  assert.deepEqual(result.warnings, []);
});

function mountedConverter() {
  function element() {
    return {
      value: '', textContent: '', style: {}, handlers: {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
    };
  }
  const file = element(), textarea = element(), warning = element();
  const paste = element(), sample = element();
  const controls = new Map([
    ['input[type="file"]', file], ['textarea', textarea],
    ['[data-section="warnings"]', warning],
    ['[data-action="parse-paste"]', paste], ['[data-action="sample"]', sample],
  ]);
  const target = { querySelector: selector => controls.get(selector) };
  const fields = new Map();
  let conversions = 0;
  const context = vm.createContext({
    window: {},
    document: {
      head: { appendChild() {} },
      createElement: element,
      querySelector: selector => selector === '#alm-csv-mount' ? target : null,
      getElementById(id) {
        if (!fields.has(id)) fields.set(id, element());
        return fields.get(id);
      },
    },
    FileReader: class {
      readAsText(file) { this.result = file.text; this.onload(); }
    },
    runConvert() { conversions++; },
    render() {},
    setWarn() {},
  });
  vm.runInContext(csvSource, context);
  vm.runInContext(accuracySource, context);
  context.AlmEffectAccuracy = context.window.AlmEffectAccuracy;
  vm.runInContext(adapterSource, context);
  return {
    warning, fields,
    get conversions() { return conversions; },
    expectedG: context.AlmEffectAccuracy.fromMeans(52.5, 8.2, 30, 47.1, 7.9, 30).g,
    submit(text, route) {
      if (route === 'paste') {
        textarea.value = text;
        paste.handlers.click();
      } else {
        file.files = [{ text }];
        file.handlers.change();
      }
    },
  };
}

for (const route of ['paste', 'upload']) {
  test('P20-R2 ' + route + ': visible rejection prevents converter import and permits recovery', t => {
    const app = mountedConverter();
    app.submit(headers + ',annotation\n' + values + ',keep', route);
    assert.equal(app.conversions, 1, 'valid extra-column control imports');
    assert.equal(Number(app.fields.get('in-est').value), app.expectedG);
    assert.equal(app.warning.textContent, '');
    const original = app.fields.get('in-est').value;

    app.submit(duplicateCSV, route);
    t.diagnostic('After duplicate m1: estimate=' + app.fields.get('in-est').value +
      ', conversions=' + app.conversions + ', warning=' + JSON.stringify(app.warning.textContent));
    assert.match(app.warning.textContent, /CSV rejected:.*(?:duplicate|ambiguous).*"m1"/i);
    assert.equal(app.conversions, 1, 'rejected input must not reach conversion');
    assert.equal(app.fields.get('in-est').value, original);

    app.submit(cleanCSV, route);
    assert.equal(app.conversions, 2, 'correcting headers permits the next import');
    assert.equal(app.warning.textContent, '', 'valid input clears the rejection');
    assert.equal(app.fields.get('in-est').value, original);
  });
}
