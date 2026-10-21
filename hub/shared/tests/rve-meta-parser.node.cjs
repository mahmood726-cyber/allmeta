// Run from the repo root: node --test hub/shared/tests/rve-meta-parser.node.cjs
// DOM checks need linkedom (via node_modules or NODE_PATH). They execute the
// real fit/export handlers; they do not provide browser/layout evidence.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const root = path.resolve(__dirname, '../../..');
require(path.join(root, 'shared/stats-qt.js'));
const RVE = require(path.join(root, 'shared/rve.js'));
const E = require(path.join(root, 'shared/rve-extras.js'));

// Deliberately artificial parser fixtures, not research observations.
const QUOTED = '"A",0.2,0.03\n"A" ,0.4,0.04\nB,0.1,0.02';
const MALFORMED = 'a,oops,bad\nb,0.4,0.04\nc,0.1,0.02\nd,0.6,0.05';

test('P0: whitespace outside closing quotes must not create a new cluster', () => {
  const parsed = E.parseStudies(QUOTED);
  assert.deepEqual(parsed.rows.map(r => r.cluster), ['A', 'A', 'B']);
  const fit = RVE.fitCORR(parsed.rows, { rho: 0.8 });
  const canonical = RVE.fitCORR(E.parseStudies('A,0.2,0.03\nA,0.4,0.04\nB,0.1,0.02').rows, { rho: 0.8 });
  assert.equal(fit.m_clusters, 2);
  assert.equal(fit.k_total, 3);
  assert.deepEqual(fit, canonical);
});

for (const [name, delim] of [['comma', ','], ['semicolon', ';'], ['tab', '\t']]) {
  test(`P0: ${name} input preserves internal quoted whitespace and escaped quotes`, () => {
    const input = ['  " A "  ', '.2', '.03'].join(delim) + '\n' +
      ['" A "', '.4', '.04'].join(delim) + '\n' +
      ['"A"', '.1', '.02'].join(delim) + '\n' +
      ['"B""C"  ', '.3', '.05'].join(delim);
    assert.deepEqual(E.parseStudies(input).rows.map(r => r.cluster), [' A ', ' A ', 'A', 'B"C']);
    assert.deepEqual(E.splitLine('"A"  ', delim, 1), ['A']);
  });
}

test('P0: closing quotes cannot be followed by text or reopened', () => {
  for (const label of ['"A" x', '"" ""', '" " "A"']) {
    assert.throws(() => E.parseStudies(`${label},.2,.03`),
      e => e.userFacing === true && /Line 1: text after a closing quote/.test(e.message), label);
  }
});

test('P1: malformed first observation is refused rather than dropped as a header', () => {
  assert.throws(() => E.parseStudies(MALFORMED),
    e => e.userFacing === true && /Line 1: effect size yi 'oops' is not a number/.test(e.message));
});

test('P1: partially recognized headers and missing first values are refused', () => {
  for (const first of ['study,oops,vi', 'a,yi,bad', 'a,oops,se', 'NA,NA,NA', 'a,,']) {
    assert.throws(() => E.parseStudies(`${first}\nb,.4,.04\nc,.1,.02\nd,.6,.05`),
      e => e.userFacing === true && /Line 1: effect size yi .*is not a number/.test(e.message), first);
  }
  assert.throws(() => E.parseStudies(`# comment\n\n${MALFORMED}`), /Line 3: effect size yi 'oops'/);
});

test('P1: recognized headers keep aliases, reordered columns, predictors and SE conversion', () => {
  const parsed = E.parseStudies('dose;standard_error;study_id;effect_size\n1;.2;A;.1\n2;.5;B;.3');
  assert.equal(parsed.header, true);
  assert.equal(parsed.seColumn, true);
  assert.deepEqual(parsed.predictorNames, ['dose']);
  assert.deepEqual(parsed.rows, [
    { cluster: 'A', yi: .1, vi: .2 * .2, X: [1, 1] },
    { cluster: 'B', yi: .3, vi: .5 * .5, X: [1, 2] },
  ]);
  const headerless = E.parseStudies('study,.1,.04\na,.2,.05');
  assert.equal(headerless.header, false);
  assert.equal(headerless.rows.length, 2);
  assert.throws(() => E.parseStudies('cluster,yi,vi'), /Only a header row/);
});

async function app() {
  const html = fs.readFileSync(path.join(root, 'rve-meta/index.html'), 'utf8');
  const { document, window } = parseHTML(html);
  const downloads = [];
  const c = { document, console, Blob, atob, setTimeout: () => 0,
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:node'; }, revokeObjectURL() {} } };
  c.window = c;
  vm.createContext(c);
  // Scope to the app's real parser/engine/export dependencies and main UI script.
  // Autosave, hub navigation and accessibility decoration are outside this check.
  // rve-eigen compiles asynchronously outside Node, as on the page; wait for it.
  for (const src of ['stats-qt', 'rve-eigen', 'rve', 'rve-extras', 'build-info']) {
    vm.runInContext(fs.readFileSync(path.join(root, `shared/${src}.js`), 'utf8'), c,
      { filename: `${src}.js`, timeout: 10000 });
  }
  await c.AlmRVEEigen.ready;
  const scripts = [...document.querySelectorAll('script:not([src])')]
    .filter(s => s.textContent.includes('function run()'));
  assert.equal(scripts.length, 1, 'one real app fit handler');
  vm.runInContext(scripts[0].textContent, c, { filename: 'rve-meta/index.html:inline', timeout: 10000 });
  const el = id => document.getElementById(id);
  function fit(text) {
    el('src').value = text;
    el('f-rho').value = '0.8';
    el('f-names').value = '';
    el('f-centre').checked = false;
    el('fit-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  }
  return { c, document, downloads, el, fit };
}

test('P0 DOM: displayed and exported cluster counts agree after quoted input', async () => {
  const h = await app();
  h.fit(QUOTED);
  assert.match(h.el('meta-row').textContent, /m = 2 clusters/);
  assert.equal(h.c.__almLastRVE().model.m_clusters, 2);
  assert.equal(h.document.querySelectorAll('#coef-body tr').length, 1);
  h.document.querySelector('[data-action="json"]').click();
  assert.equal(h.downloads.length, 1);
  const exported = JSON.parse(await h.downloads[0].text());
  assert.equal(exported.model.m_clusters, 2);
  assert.deepEqual(exported.inputs.rows.map(r => r.cluster), ['A', 'A', 'B']);
});

test('P1 DOM: malformed refit clears prior sensitivity, results and all exports', async () => {
  const h = await app();
  h.fit('a,.2,.03\nb,.4,.04\nc,.1,.02\nd,.6,.05');
  assert.equal(typeof h.c.__almLastRVE, 'function');
  h.el('btn-rho-sens').click();
  assert.equal(h.document.querySelectorAll('#rho-sens-table tbody tr').length, 6);
  const oldSensitivityExport = h.el('btn-rho-csv');
  const exports = [...h.document.querySelectorAll('#alm-export-mount button')];
  assert.equal(exports.length, 5);
  assert.ok(exports.every(b => b.disabled === false));
  h.fit(MALFORMED);
  assert.match(h.document.querySelector('#meta-row [role="alert"]')?.textContent || '',
    /Line 1: effect size yi 'oops' is not a number/);
  assert.equal(h.c.__almLastRVE, null);
  assert.equal(h.document.querySelectorAll('#coef-body tr').length, 0);
  assert.equal(h.el('rho-sens').hidden, true);
  assert.equal(h.el('rho-sens').innerHTML, '');
  assert.equal(h.el('btn-rho-sens').disabled, true);
  assert.ok(exports.every(b => b.disabled === true));
  // Even stale/detached or programmatically clicked buttons cannot export.
  for (const b of [...exports, oldSensitivityExport]) b.click();
  assert.equal(h.downloads.length, 0);
  h.fit('a,.2,.03\nb,.4,.04\nc,.1,.02\nd,.6,.05');
  assert.equal(typeof h.c.__almLastRVE, 'function');
  assert.ok(exports.every(b => b.disabled === false));
});

// R 4.6.0 read.csv: a column of numbers is numeric (also hex and "+5"), so
// "007" and "7" are one study and as.factor() orders levels numerically.
test('M2: an all-numeric cluster column is typed as R read.csv would', () => {
  const parsed = E.parseStudies('7,.1,.04\n007,.2,.05\n10,.3,.04\n2,.4,.05\n0x1A,.5,.04\n+5,.6,.05');
  assert.equal(parsed.clusterNumeric, true);
  assert.deepEqual(parsed.rows.map(r => r.cluster), [7, 7, 10, 2, 26, 5]);
  const text = E.parseStudies('s7,.1,.04\n7,.2,.05\n10,.3,.04');
  assert.equal(text.clusterNumeric, false);
  assert.deepEqual(text.rows.map(r => r.cluster), ['s7', '7', '10']);
  for (const bad of ['Inf', 'NaN', 'NA'])
    assert.throws(() => E.parseStudies(`1,.1,.04\n${bad},.2,.05\n3,.3,.04`),
      e => e.userFacing === true && new RegExp(`Line 2: cluster label '${bad}' is not a finite number`).test(e.message), bad);
});

test('M2: the exported R script keeps a numeric cluster column numeric', () => {
  const rows = E.parseStudies('2,.1,.04\n10,.2,.05\n1,.3,.04').rows;
  const script = E.toRScript({ rows, names: [], rho: 0.8, centred: false, version: 'test', generated: 'fixed' });
  assert.match(script, /^ {2}cluster = c\(2, 10, 1\),$/m);
  const labels = E.toRScript({ rows: E.parseStudies('b,.1,.04\na,.2,.05').rows, names: [], rho: 0.8, centred: false, generated: 'fixed' });
  assert.match(labels, /^ {2}cluster = c\("b", "a"\),$/m);
});
