import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real shared CSV decoder, page import callback, parser and engine.
// Only DOM nodes and unrelated shared UI widgets are stubbed; no browser needed.
const html = readFileSync(new URL('../../../../limit-ma/index.html', import.meta.url), 'utf8');
const csvSource = readFileSync(new URL('../../csv-upload.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const studies = [
  { yi: 0.1, sei: 0.1, study: 'A' },
  { yi: 0.2, sei: 0.2, study: 'B' },
  { yi: -0.1, sei: 0.15, study: 'C' },
  { yi: 0.3, sei: 0.25, study: 'D' },
];
const csvCell = value => '"' + String(value).replace(/"/g, '""') + '"';
const csvText = rows => 'yi,sei,study\r\n' + rows.map(r =>
  [r.yi, r.sei, csvCell(r.study)].join(',')).join('\r\n');

function load() {
  const nodes = {};
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    nodes[match[1]] = { value: '', innerHTML: '', textContent: '', parentNode: {},
      addEventListener(event, fn) { this[event] = fn; }, setAttribute() {} };
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const noop = () => {};
  const window = { alm: { analysisLifecycle: run => run, plotExport: noop,
    axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null }) } };
  const document = { getElementById: id => nodes[id], querySelectorAll: () => [] };
  const context = vm.createContext({ window, document, structuredClone });
  vm.runInContext(csvSource, context);
  const decode = window.alm.csvUpload.parse;
  let csvOptions;
  window.alm.csvUpload = Object.assign(options => { csvOptions = options; }, { parse: decode });
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { window, nodes,
    importCSV(text) {
      const decoded = decode(text, csvOptions.columns);
      assert.deepEqual(plain(decoded.warnings), []);
      csvOptions.onParse(decoded);
      return plain(decoded.rows);
    },
    run(text) { nodes.src.value = text; nodes['btn-run'].click(); return plain(window._almLastLimit()); },
  };
}

function checkImport(rows, t) {
  const h = load();
  const expected = h.run(studies.map(r => `${r.yi}, ${r.sei}, ${r.study}`).join('\n'));
  assert.equal(expected.k, 4);
  assert.deepEqual(h.importCSV(csvText(rows)), rows, 'shared decoder preserves four records');
  const actual = plain(h.window._almLastLimit());
  t.diagnostic(JSON.stringify({ expectedK: expected.k, actualK: actual?.k,
    expectedRE: expected.re_est, actualRE: actual?.re_est, error: h.nodes['limit-error'].textContent }));
  assert.equal(actual?.k, rows.length, 'label content must not create or remove studies');
  assert.deepEqual(actual, expected, 'all numerical results must be invariant to labels');
  const expectedRows = rows.map(r => ({ te: r.yi, se: r.sei, label: r.study }));
  assert.deepEqual(plain(h.window.__almLimitParse(h.nodes.src.value)), expectedRows,
    'the parser shared by core and sensitivity analysis preserves complete labels');
  assert.deepEqual(plain(h.window.AlmLimitEngine.parse(h.nodes.src.value)), expectedRows);
  const saved = h.window.__almLimitValidationSnapshot();
  assert.deepEqual(h.run(h.nodes.src.value), expected, 'Run reuses the same records');
  h.run('0.1, 0.2');
  h.window.__almLimitValidationRestore(saved);
  assert.deepEqual(h.run(h.nodes.src.value), expected, 'restored input retains record boundaries');
  assert.deepEqual(plain(h.window.__almLimitParse(h.nodes.src.value)), expectedRows);
}

test('P12-R2 control: quoted simple CSV labels preserve four studies and results', t => {
  checkImport(studies, t);
});

for (const index of [0, 2, 3]) {
  test(`P12-R2 plant: newline in CSV label at record ${index + 1} cannot inject a study`, t => {
    checkImport(studies.map((r, i) => i === index ? { ...r, study: 'A\n9,0.2,Injected' } : r), t);
  });
}

for (const [name, label] of [
  ['comma', 'Trial A, subgroup B'],
  ['quotes and CRLF', 'Trial "A"\r\n9,0.2,"Injected"'],
  ['blank lines', 'Trial A\n\n9,0.2,Injected\nend'],
]) {
  test(`P12-R2 plant: ${name} in a CSV label round-trips without changing the analysis`, t => {
    checkImport(studies.map((r, i) => i === 0 ? { ...r, study: label } : r), t);
  });
}

test('P12-R2 control: unquoted input, literal quotes, headers, blanks and default labels still work', () => {
  const h = load();
  const text = '\r\n effect, SE, label\r\n+.1e1, 2.e-1, Trial "A"\r\n\r\n-.2, +.3\r\n3., .4, C\r\n';
  assert.equal(h.run(text).k, 3);
  assert.deepEqual(plain(h.window.__almLimitParse(text)), [
    { te: 1, se: 0.2, label: 'Trial "A"' },
    { te: -0.2, se: 0.3, label: 'Study 4' },
    { te: 3, se: 0.4, label: 'C' },
  ]);
});

for (const [name, label] of [
  ['unterminated quote', '"A\n9,0.2,Injected'],
  ['text after closing quote', '"A"suffix'],
]) {
  test(`P12-R2 plant: ${name} in a quoted label is refused`, () => {
    const h = load();
    const good = studies.map(r => `${r.yi}, ${r.sei}, ${r.study}`).join('\n');
    assert.equal(h.run(good).k, 4);
    assert.equal(h.run(good + '\n0.4, 0.3, ' + label), null);
    assert.match(h.nodes['limit-error'].textContent, /Line 5:/);
    assert.equal(h.nodes.body.innerHTML, '');
    assert.equal(h.nodes.plot.innerHTML, '');
  });
}

test('P12-R2 control: extra fields and invalid numbers remain refused after a multiline label', () => {
  const h = load();
  const good = 'effect, SE, label\n0.1, 0.1, "A\n9,0.2,Injected"\n0.2,0.2,B\n-0.1,0.15,C\n0.3,0.25,D';
  for (const bad of ['0.4,0.3,A,B', '0.4O,0.3', '0.4,0', '0.4,0.3,"A",B']) {
    assert.equal(h.run(good + '\n' + bad), null);
    assert.match(h.nodes['limit-error'].textContent, /Line 7:/);
  }
});
