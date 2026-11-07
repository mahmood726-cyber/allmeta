import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('influence/index.html');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const input = '0.20, 0.20, Alpha\n-0.10, 0.18, Beta\n0.15, 0.16, Gamma\n0.05, 0.14, Delta\n0.80, 0.13, Epsilon';

// Run the actual analysis, exclusion logic, row/CSV serializers and JSON adapter.
// Only DOM surfaces and unrelated shared-widget initializers are stubbed.
function harness() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], {
    id: m[1], value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { this.listeners.click?.call(this); },
    setAttribute(name, value) { this[name] = value; },
  }]));
  const document = {
    getElementById(id) { assert.ok(elements.has(id), `Unexpected element: ${id}`); return elements.get(id); },
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === '#src' ? [elements.get('src')] : []; },
    addEventListener() {},
  };
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, axisControls: noop, plotExport: noop, resultsExport: noop,
    urlState: Object.assign(noop, { read: () => null }), resetUndo: noop, tooltips: noop,
  } };
  const context = vm.createContext({ window, document });
  elements.get('src').value = input;
  for (const path of ['shared/ma-core.js', 'influence/influence-extra.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  for (const marker of ['const LS_KEY = "influence-v1"', 'window.__almResults = function']) {
    const block = inline.find(code => code.includes(marker));
    assert.ok(block, `Missing application script: ${marker}`);
    vm.runInContext(block, context, { filename: 'influence/index.html' });
  }
  return { window, elements };
}

const plain = value => JSON.parse(JSON.stringify(value));
// The controlled fixture has no commas, quotes or newlines inside cells.
function csvRows(window) {
  const csv = window.__almInfluenceStudyCsv();
  assert.ok(csv.endsWith('\r\n'));
  const [header, ...lines] = csv.trimEnd().split('\r\n');
  const columns = header.split(',');
  assert.equal(new Set(columns).size, columns.length);
  return lines.map(line => {
    const cells = line.split(',');
    assert.equal(cells.length, columns.length);
    return Object.fromEntries(columns.map((column, i) => [column, cells[i]]));
  });
}

function assertOutcome(window, requested, refused) {
  const rows = csvRows(window);
  assert.equal(rows.length, 5, 'Standalone CSV keeps every study');
  rows.forEach((row, i) => {
    assert.equal(row.exclusion_refused, String(refused), `${row.study}: request refusal must be explicit`);
    assert.equal(row.exclusion_requested, String(requested.includes(i)), `${row.study}: requested exclusion`);
    assert.equal(row.exclusion_applied, String(requested.includes(i) && !refused), `${row.study}: applied exclusion`);
    assert.equal(row.excluded, String(requested.includes(i)), 'Legacy excluded column retains checkbox semantics');
  });
  const objects = plain(window.__almInfluenceStudyRows());
  objects.forEach((row, i) => {
    for (const field of ['exclusion_requested', 'exclusion_applied', 'exclusion_refused']) {
      assert.equal(typeof row[field], 'boolean', field);
      assert.equal(String(row[field]), rows[i][field], field);
    }
  });
  assert.deepEqual(plain(window.__almResults().studies), objects, 'JSON study records use the same outcome metadata');
}

test('plant P11-R5: refused exclusion is explicit in every standalone CSV row', () => {
  const { window, elements } = harness();
  const original = plain(window._almLastInfluence());
  for (const requested of [[0, 1, 2], [0, 1, 2, 3, 4]]) {
    window.__almInfluenceSetExcluded(requested);
    assert.match(elements.get('excl-msg').textContent, /Cannot re-pool/);
    assert.equal(window.__almResults().exclusion.refused, true);
    assert.equal(window.__almResults().exclusion.refit, null);
    assert.deepEqual(plain(window._almLastInfluence()), original);
    assertOutcome(window, requested, true);
  }
});

test('plant P11-R5: successful exclusions distinguish requested and applied study rows', () => {
  const { window } = harness();
  for (const requested of [[4], [0, 4]]) {
    window.__almInfluenceSetExcluded(requested);
    assert.equal(window.__almResults().exclusion.refused, false);
    assert.equal(window.__almResults().exclusion.refit.k, 5 - requested.length);
    assertOutcome(window, requested, false);
  }
});

test('plant P11-R5: refusal metadata resets after a successful request, clear and rerun', () => {
  const { window, elements } = harness();
  assertOutcome(window, [], false);
  window.__almInfluenceSetExcluded([0, 1, 2]);
  assertOutcome(window, [0, 1, 2], true);
  window.__almInfluenceSetExcluded([0, 1]);
  assertOutcome(window, [0, 1], false);
  elements.get('btn-excl-clear').click();
  assertOutcome(window, [], false);
  window.__almInfluenceSetExcluded([0, 1, 2]);
  elements.get('btn-run').click();
  assertOutcome(window, [], false);
});

test('control: successful exclusion preserves refit, diagnostics and existing CSV fields', () => {
  const { window, elements } = harness();
  const originalFull = plain(window._almLastInfluence());
  const originalDiagnostics = plain(window._almLastDiag());
  const originalCsv = csvRows(window);
  window.__almInfluenceSetExcluded([4]);
  const results = plain(window.__almResults());
  assert.equal(results.k, 5);
  assert.equal(results.exclusion.refused, false);
  assert.equal(results.exclusion.refit.k, 4);
  assert.deepEqual(results.exclusion.excluded_studies, ['Epsilon']);
  assert.match(elements.get('excl-msg').textContent, /Re-pooled without 1 study/);
  assert.equal(elements.get('btn-excl-apply').disabled, false);
  assert.deepEqual(plain(window._almLastInfluence()), originalFull);
  assert.deepEqual(plain(window._almLastDiag()), originalDiagnostics);
  csvRows(window).forEach((row, i) => {
    assert.equal(row.excluded, String(i === 4));
    for (const key of Object.keys(originalCsv[i])) {
      if (key !== 'excluded' && !key.startsWith('exclusion_')) assert.equal(row[key], originalCsv[i][key], key);
    }
  });
});

test('control: refused request remains refused in UI and JSON with the full five-study fit', () => {
  const { window, elements } = harness();
  const original = plain(window.__almResults());
  window.__almInfluenceSetExcluded([0, 1, 2]);
  const results = plain(window.__almResults());
  assert.match(elements.get('excl-msg').textContent, /Cannot re-pool: only 2 studies would remain/);
  assert.equal(elements.get('btn-excl-apply').disabled, true);
  assert.equal(results.k, 5);
  assert.deepEqual(results.exclusion, { excluded_studies: ['Alpha', 'Beta', 'Gamma'], refused: true, refit: null });
  for (const key of Object.keys(original)) {
    if (key !== 'studies') assert.deepEqual(results[key], original[key], key);
  }
});

test('control: no exclusions and invalid input retain existing export behavior', () => {
  const { window, elements } = harness();
  assert.equal(window.__almResults().exclusion, undefined);
  assert.ok(csvRows(window).every(row => row.excluded === 'false'));
  elements.get('src').value = '';
  elements.get('btn-run').click();
  assert.deepEqual(plain(window.__almInfluenceStudyRows()), []);
  assert.throws(() => window.__almInfluenceStudyCsv(), /Run the analysis first/);
});
