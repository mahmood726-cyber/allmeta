import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('influence/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const plainCsv = 'study,yi,vi\nA,0.2,0.04\nB,0.4,0.09\nC,0.6,0.16';
const plainInput = '0.2, 0.2, A\n0.4, 0.3, B\n0.6, 0.4, C';
const json = value => JSON.parse(JSON.stringify(value));

// Run the actual CSV parser, app scripts, lifecycle and numerical engines.
// Only DOM plumbing and unrelated shared UI widgets are replaced; no browser needed.
function harness() {
  const elements = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    let value = '';
    const listeners = new Map();
    elements.set(id, {
      id, hidden: false, disabled: false, innerHTML: '', textContent: '',
      get value() { return value; },
      // The HTML textarea API normalizes CR and CRLF to LF.
      set value(next) { value = String(next).replace(/\r\n?/g, '\n'); },
      addEventListener(type, fn) { listeners.set(type, fn); },
      click() { if (!this.disabled) listeners.get('click')?.call(this); },
      setAttribute() {},
    });
  }
  const document = {
    getElementById: id => elements.get(id) || null,
    querySelector: selector => /^#[\w-]+$/.test(selector) ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: selector => selector === '#src' ? [elements.get('src')] : [],
    addEventListener() {},
  };
  const context = vm.createContext({ document, window: {}, console, structuredClone });
  for (const path of ['hub/shared/csv-upload.js', 'hub/shared/analysis-lifecycle.js',
    'shared/ma-core.js', 'shared/diagnostic-plots.js', 'influence/influence-extra.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  const win = context.window;
  const parseCsv = win.alm.csvUpload.parse;
  let csvOptions;
  win.alm.csvUpload = options => { csvOptions = options; };
  const noop = () => {};
  for (const name of ['axisControls', 'plotExport', 'resultsExport', 'tooltips']) win.alm[name] = noop;
  win.alm.urlState = Object.assign(() => {}, { read: () => ({}) });
  win.alm.resetUndo = Object.assign(() => {}, { snapshot: noop });
  for (const marker of ['const LS_KEY = "influence-v1"', '// Cycle 2.5 shared UX modules.']) {
    const script = scripts.find(source => source.includes(marker));
    assert.ok(script, `Missing influence script: ${marker}`);
    vm.runInContext(script, context, { filename: 'influence/index.html' });
  }
  return {
    win, elements,
    importCsv(text) {
      const parsed = parseCsv(text, csvOptions.columns);
      assert.equal(parsed.rows.length, 3, 'CSV parser must return exactly three records');
      assert.deepEqual(json(parsed.warnings), []);
      csvOptions.onParse(parsed);
    },
  };
}

for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
  test(`plant P11-R2: quoted ${name} label cannot inject an analysis study`, () => {
    const h = harness();
    h.importCsv(plainCsv);
    assert.equal(h.win.__almResults().k, 3, 'seed a previous successful analysis');
    assert.equal(h.elements.get('analysis-status').hidden, false);
    const csv = `study,yi,vi\r\n"A${newline}9, 0.1, phantom",0.2,0.04\r\nB,0.4,0.09\r\nC,0.6,0.16`;
    h.importCsv(csv);
    assert.equal(h.win.__almResults().k, 0,
      `Multiline import must be refused; analysed rows: ${JSON.stringify(h.win._almStudies())}`);
    assert.deepEqual(json(h.win._almStudies()), []);
    assert.equal(h.win._almLastInfluence(), null);
    assert.equal(h.win._almLastDiag(), null);
    assert.equal(h.win._almLastExclusion(), null);
    assert.equal(h.win.__almBaujat, null);
    assert.equal(h.win.__almRadial, null);
    assert.deepEqual(json(h.win.__almResults()), { _schema: 'influence-results-v1', k: 0 });
    assert.throws(() => h.win.__almInfluenceStudyCsv(), /Run the analysis first/);
    for (const id of ['body', 'model-body', 'loo-plot', 'influence-plot', 'baujat-plot', 'radial-plot']) {
      assert.equal(h.elements.get(id).innerHTML, '', `${id} must not retain stale results`);
    }
    const error = h.elements.get('input-error');
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /CSV.*refused/i);
    assert.match(error.textContent, /label.*line break/i);
    assert.equal(h.elements.get('analysis-status').hidden, true);
    assert.doesNotMatch(h.elements.get('src').value, /phantom/);
    h.elements.get('btn-run').click();
    assert.equal(h.win.__almResults().k, 0, 'Run must not resurrect rejected rows');
    h.importCsv(plainCsv);
    assert.equal(h.win.__almResults().k, 3, 'corrected input must still run');
    assert.equal(error.hidden, true);
    assert.equal(h.elements.get('analysis-status').hidden, false);
  });
}

test('control P11-R2: quoted comma and escaped quote preserve three studies and numerical results', () => {
  const h = harness();
  h.win.__almRestore({ data: plainInput });
  const expected = json(h.win._almLastInfluence());
  const expectedDiag = json(h.win._almLastDiag()).map(({ label, ...values }) => values);
  h.importCsv('study,yi,vi\r\n"North, site ""A""",0.2,0.04\r\nB,0.4,0.09\r\nC,0.6,0.16');
  assert.equal(h.win.__almResults().k, 3);
  assert.deepEqual(json(h.win._almStudies()), [
    { te: 0.2, se: 0.2, label: 'North, site "A"' },
    { te: 0.4, se: 0.3, label: 'B' },
    { te: 0.6, se: 0.4, label: 'C' },
  ]);
  assert.deepEqual(json(h.win._almLastInfluence()), expected);
  assert.deepEqual(json(h.win._almLastDiag()).map(({ label, ...values }) => values), expectedDiag);
  assert.equal(h.elements.get('input-error').hidden, true);
  assert.equal(h.elements.get('analysis-status').hidden, false);
});

test('control P11-R2: literal backslash-n in a single-line label remains accepted', () => {
  const h = harness();
  h.importCsv('study,yi,vi\n"A\\n9, 0.1, phantom",0.2,0.04\nB,0.4,0.09\nC,0.6,0.16');
  assert.equal(h.win.__almResults().k, 3);
  assert.equal(h.win._almStudies()[0].label, 'A\\n9, 0.1, phantom');
  assert.equal(h.elements.get('input-error').hidden, true);
});
