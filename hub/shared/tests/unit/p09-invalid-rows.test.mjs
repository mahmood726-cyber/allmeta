import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function parseTable('));
assert.ok(app, 'The production application script must be present');
const clean = value => JSON.parse(JSON.stringify(value));
const valid = '12,150,A\n8,90,B';
const malformed = valid + '\n-1,100,Negative\n101,100,Too many\n,100,Missing';

// Execute the production parser, pooling, renderer and lifecycle with a small
// DOM stub. Optional mounts are inert; no browser or statistical mock is used.
function setup() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    id, value: '', innerHTML: '', textContent: '', hidden: true, style: {},
    listeners: {}, attributes: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; }
  }]));
  const el = id => {
    assert.ok(elements.has(id), 'Element exists in production HTML: ' + id);
    return elements.get(id);
  };
  el('src').value = valid;
  el('trans').value = 'logit';
  el('tau-est').value = 'PM';
  const document = {
    getElementById: el,
    querySelectorAll: selector => selector.split(',').map(s => el(s.trim().slice(1))),
    addEventListener() {}
  };
  const noop = () => {};
  const window = { MaStudies: {}, alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, resultsExport: noop,
    tooltips: noop, resetUndo: Object.assign(noop, { snapshot: noop }),
    urlState: Object.assign(() => {}, { read: () => null, write: noop })
  } };
  const context = vm.createContext({ window, document });
  vm.runInContext(read('shared/ma-core.js'), context);
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context);
  let poolCalls = 0;
  const pool = window.AlmMaCore.pool;
  window.AlmMaCore.pool = (...args) => { poolCalls++; return pool(...args); };
  vm.runInContext(app, context);
  const api = window.__almPropValidation;
  return { el, window, api, poolCalls: () => poolCalls, run(text) {
    el('src').value = text;
    el('btn-run').listeners.click();
  } };
}

test('P09-R2 plant: mixed valid and malformed rows refuse the entire fit with line errors', () => {
  const s = setup();
  const before = s.poolCalls();
  s.run(malformed);
  assert.equal(s.api.snapshot(), null, 'No partial fit may survive invalid rows');
  assert.equal(s.poolCalls(), before, 'Malformed input must be refused before pooling');
  assert.equal(s.el('analysis-status').hidden, true, 'Do not announce Analysis updated');
  assert.equal(s.el('k-warn').style.display, 'block');
  for (const line of [3, 4, 5]) assert.match(s.el('k-warn').textContent, new RegExp('Line ' + line + ':'));
});

test('P09-R2 plant: refusing malformed input clears prior display, exports and validation', () => {
  const s = setup();
  assert.ok(s.window._almLastPropMA());
  assert.match(s.el('forest').innerHTML, /polygon/);
  s.run(malformed);
  assert.equal(s.window._almLastPropMA(), null);
  assert.equal(s.api.snapshot(), null);
  assert.doesNotMatch(s.el('res-body').innerHTML, /pooled-row/);
  assert.match(s.el('res-body').innerHTML, /[Ii]nvalid/);
  assert.equal(s.el('het').innerHTML, '');
  assert.equal(s.el('forest').innerHTML, '');
});

test('P09-R2 plant: bus and live-validation parsing cannot export surviving rows', () => {
  const s = setup();
  s.el('src').value = malformed;
  assert.deepEqual(clean(s.window.__propMaBusStudies()), []);
  assert.throws(() => s.api.parse(malformed), /Line 3:/);
});

test('P09-R2 plant: parser returns valid rows and all physical line errors', () => {
  const context = vm.createContext({});
  vm.runInContext(app.slice(app.indexOf('    function parseTable('), app.indexOf('    // --- inverse beta')), context);
  const result = clean(context.parseTable('\n12,150,A\r\n \t\r\n-1,100,B\n101,100,C\n,100,D\n8,90,E\n'));
  assert.deepEqual(result.rows, [{ x: 12, n: 150, label: 'A' }, { x: 8, n: 90, label: 'E' }]);
  assert.deepEqual(result.errors.map(error => error.line), [4, 5, 6]);
  assert.ok(result.errors.every(error => typeof error.message === 'string' && error.message.length > 0));
});

const badRows = [
  ['missing events', ',100,Missing'], ['missing total', '1,,Missing'],
  ['missing both cells', ',,Missing'], ['one column', '12'],
  ['negative events', '-1,100,Negative'], ['events above total', '101,100,Above'],
  ['zero total', '0,0,Zero'], ['negative total', '0,-1,Negative'],
  ['fractional events', '1.5,100,Fraction'], ['fractional total', '1,100.5,Fraction'],
  ['numeric prefix events', '1oops,100,Text'], ['numeric prefix total', '1,100oops,Text'],
  ['nonfinite count', 'Infinity,100,Infinite'], ['unsafe integer', '1,9007199254740993,Unsafe']
];
for (const [name, row] of badRows) {
  test('P09-R2 plant: refuse ' + name + ' even with two valid studies', () => {
    const s = setup();
    s.run(valid + '\n' + row);
    assert.equal(s.window._almLastPropMA(), null);
    assert.equal(s.el('analysis-status').hidden, true);
    assert.match(s.el('k-warn').textContent, /Line 3:/);
  });
}

test('P09-R2 control: valid studies and whitespace-only lines fit and export unchanged', () => {
  const s = setup();
  const expected = clean(s.window._almLastPropMA());
  const studies = clean(s.window.__propMaBusStudies());
  s.run('\r\n  12,150,A\r\n \t\r\n8,90,B\r\n');
  assert.deepEqual(clean(s.window._almLastPropMA()), expected);
  assert.deepEqual(clean(s.window.__propMaBusStudies()), studies);
  assert.equal(s.el('analysis-status').hidden, false);
  assert.equal(s.el('k-warn').style.display, 'none');
  assert.deepEqual(clean(s.api.parse(valid)), [{ x: 12, n: 150, label: 'A' }, { x: 8, n: 90, label: 'B' }]);
});

test('P09-R2 control: zero/all-event boundaries and omitted labels remain valid for all methods', () => {
  const s = setup();
  for (const transform of ['logit', 'ft', 'raw']) for (const method of ['PM', 'DL', 'FE']) {
    s.el('trans').value = transform;
    s.el('tau-est').value = method;
    s.run('0,10\n10,10\n5,10');
    assert.equal(s.window._almLastPropMA().k, 3);
    assert.equal(s.el('analysis-status').hidden, false);
    assert.deepEqual(clean(s.api.snapshot().studies.map(row => row.label)), ['Study 1', 'Study 2', 'Study 3']);
  }
});

test('P09-R2 control: correcting malformed input restores fit, display and success status', () => {
  const s = setup();
  const expected = clean(s.window._almLastPropMA());
  s.run(malformed);
  s.run(valid);
  assert.deepEqual(clean(s.window._almLastPropMA()), expected);
  assert.equal(s.el('k-warn').style.display, 'none');
  assert.equal(s.el('analysis-status').hidden, false);
  assert.match(s.el('res-body').innerHTML, /pooled-row/);
  assert.match(s.el('forest').innerHTML, /polygon/);
});

test('P09-R2 control: published corpus retains every input and all 198 refusal configurations', () => {
  // Read-only compatibility check against the existing archive; no new R
  // reference values, changed tolerances, or regenerated fixtures.
  const corpus = JSON.parse(read('proportion-ma/validate/corpus/corpus.json'));
  const references = JSON.parse(read('proportion-ma/validate/corpus/reference.json'));
  const s = setup();
  let configurations = 0;
  const actualRefusals = [];
  for (const item of corpus) {
    const input = item.rows.map((row, i) => [row.x, row.n, 'row_' + i].join(',')).join('\n');
    assert.deepEqual(clean(s.api.parse(input)).map(({ x, n }) => ({ x, n })), item.rows.map(({ x, n }) => ({ x, n })), item.id);
    for (const transform of ['logit', 'ft', 'raw']) for (const method of ['PM', 'DL', 'FE']) {
      const id = item.id + '|' + transform + '|' + method;
      s.el('trans').value = transform;
      s.el('tau-est').value = method;
      s.run(input);
      const result = s.api.snapshot();
      assert.equal(result ? 'ok' : 'refused', references[id].status, id);
      if (result) assert.equal(result.values.k, item.rows.length, id);
      else actualRefusals.push(id);
      configurations++;
    }
  }
  assert.equal(configurations, 2160);
  const expectedRefusals = Object.entries(references).filter(([, result]) => result.status === 'refused').map(([id]) => id);
  assert.equal(expectedRefusals.length, 198);
  assert.deepEqual(actualRefusals.sort(), expectedRefusals.sort());
});
