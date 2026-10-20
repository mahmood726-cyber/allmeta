'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const app = path.resolve(__dirname, '..');
function page() {
  const { window, document } = parseHTML(fs.readFileSync(path.join(app, 'index.html'), 'utf8'));
  window.matchMedia = () => ({ matches: false });
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  const ctx = vm.createContext({ window, document, console, matchMedia: window.matchMedia,
    setTimeout, clearTimeout, URL, Blob, navigator: {}, performance: { now: () => Date.now() } });
  for (const s of document.querySelectorAll('script')) {
    const src = s.getAttribute('src');
    if (src && /alm-validate\.js$|a11y-landmarks\.js$/.test(src)) continue;
    vm.runInContext(src ? fs.readFileSync(path.join(app, src), 'utf8') : s.textContent, ctx);
  }
  return { window, document };
}
const clone = x => JSON.parse(JSON.stringify(x));
function exactFixture(w) {
  const c = { id: 'identical-zero', outcomes: ['A', 'B'], rows: [
    { source_row: 1, label: 'a', y: [0, 0], v: [2, 2], cov: 0 },
    { source_row: 2, label: 'b', y: [0, 0], v: [2, 2], cov: 0 }
  ] };
  const fit = { status: 'ok', k: 2, mu: [0, 0], muSE: [1, 1], muVcov: [[1, 0], [0, 1]],
    G: [[0, 0], [0, 0]], rho: null, logLik: -Math.log(4 * Math.PI), z: [0, 0], p: [1, 1],
    adjudication: 'two-study exact zero' };
  const uni = { status: 'ok', k: 2, mu: 0, se: 1, tau2: 0, logLik: fit.logLik / 2, z: 0, p: 1 };
  return {
    corpus: { schema: 'multivariate-ma-plus-corpus-v1', grid: [0], configurations: [c] },
    ref: { schema: 'multivariate-ma-plus-reference-v1', grid: [0],
      configurations: [{ id: c.id, supplied: fit, sweep: [{ ...clone(fit), rhoW: 0 }], univariate: [uni, clone(uni)] }],
      pnormGrid: [{ z: 0, p: 1 }], metaforBerkeySweep: [{ ...clone(fit), rhoW: 0 }] }
  };
}
function replay(w, mutate, display) {
  const { corpus, ref } = exactFixture(w), P = w.AlmMvPlus;
  const alter = res => { mutate(res); return res; };
  const fake = { ...P, compute: p => alter(P.compute(p)), sweep: (p, grid) => P.sweep(p, grid).map(alter) };
  return w.AlmMvPlusContract.replay(corpus, ref, fake, display ? { display: w.AlmMvPlusDisplay } : {});
}

test('P1-1 malformed sweep clears prior results, prose, plots and exports', () => {
  const { window: w, document: d } = page(), ui = w.AlmMvPlusUI;
  assert.equal(ui.runSweep().length, 19);
  assert.ok(d.getElementById('plus-sweep-plot').innerHTML);
  d.getElementById('plus-step').value = '0';
  assert.equal(ui.runSweep(), null);
  assert.match(d.getElementById('plus-status').textContent, /Step must be positive/);
  assert.equal(ui.resultsJSON().sweep, null);
  assert.equal(ui.state().grid, null);
  for (const id of ['plus-sweep-plot', 'plus-sweep-head', 'plus-sweep-body']) assert.equal(d.getElementById(id).innerHTML, '');
  const texts = w.AlmMvPlus.texts(ui.state().parsed, ui.state().res, null);
  assert.equal(d.getElementById('plus-results').value, texts.results);
  assert.equal(d.getElementById('plus-methods').value, texts.methods);
  assert.equal(d.getElementById('plus-interpretation').textContent, texts.interpretation);
  assert.match(ui.rScript(), /grid <- c\(\)/);
  let downloads = 0;
  w.AlmMvPage.download = w.AlmMvPage.svgPng = () => downloads++;
  d.getElementById('plus-dl-sweep-svg').click(); d.getElementById('plus-dl-sweep-png').click();
  assert.equal(downloads, 0);
});
test('P1-2 incomplete first study is disclosed in parser, notice and methods', () => {
  const { window: w, document: d } = page();
  d.getElementById('f-data').value = 'missing,,,,,\na,.1,.2,.3,.4,0\nb,.2,.2,.4,.4,0';
  w.AlmMvPage.run();
  const p = w.AlmMvPage.current().parsed;
  assert.equal(p.rows.length, 2);
  assert.deepEqual(clone(p.omitted), [{ line: 1, label: 'missing', reason: 'missing or non-numeric value' }]);
  assert.match(d.getElementById('omitted').textContent, /1 row omitted: line 1/);
  assert.match(d.getElementById('plus-methods').value, /1 input row was omitted/);
  for (const mode of ['cov', 'r', 'rhoW']) {
    const header = 'label,y1,v1,y2,v2' + (mode === 'rhoW' ? '' : ',' + mode);
    const row = 'a,.1,.2,.3,.4' + (mode === 'rhoW' ? '' : ',0');
    const parsed = w.AlmMvPage.parse(header + '\n' + row, mode, .5);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.omitted.length, 0);
    const incomplete = w.AlmMvPage.parse('missing' + ','.repeat(mode === 'rhoW' ? 4 : 5) + '\n' + row, mode, .5);
    assert.equal(incomplete.omitted.length, 1);
    assert.equal(w.AlmMvPage.parse(row + '\n' + header, mode, .5).omitted.length, 1);
  }
});
test('P1-3 boundary contract rejects corrupted p values in supplied and sweep fits', () => {
  const { window: w } = page();
  assert.equal(replay(w, () => {}).failedChecks, 0);
  const r = replay(w, res => res.tests.forEach(t => { t.p = .01; }));
  assert.equal(r.failed.filter(f => f.quantity === 'p').length, 4, JSON.stringify(r));
});
test('P1-3 display audit independently rejects corrupted p text', () => {
  const { window: w } = page();
  const r = replay(w, res => res.tests.forEach(t => { t.p = .01; }), true);
  assert.equal(r.failed.filter(f => /^display:mv\.\d\.p$/.test(f.quantity)).length, 2);
});
test('P1-3 boundary contract rejects G corruption with an unchanged reported likelihood', () => {
  const { window: w } = page();
  const r = replay(w, res => { res.fit.G[0][0] = 100; });
  assert.ok(r.failed.some(f => f.id === 'identical-zero#supplied' && f.quantity === 'G'), JSON.stringify(r));
});
test('P1-3 boundary contract rejects corrupted z values', () => {
  const { window: w } = page();
  const r = replay(w, res => res.tests.forEach(t => { t.z = 7; }));
  assert.equal(r.failed.filter(f => f.quantity === 'z').length, 4);
});
test('P1-3 roundtrip comparator rejects corrupted p values', () => {
  const { window: w } = page(), { corpus, ref } = exactFixture(w);
  const parsed = w.AlmMvPlusContract.parsedFrom(corpus.configurations[0]);
  const result = { ...clone(ref.configurations[0].supplied), p: [.01, .01] };
  const Rfit = { ...clone(ref.configurations[0].supplied), se: [1, 1] };
  const pageExport = { input: parsed, result, univariate: ref.configurations[0].univariate,
    sweep: [{ ...result, rhoW: 0 }] };
  const R = { k: 2, main: Rfit, 'rma.mv': { error: 'not in synthetic fixture' },
    univariate: ref.configurations[0].univariate, sweep: [{ ...Rfit, rhoW: 0 }] };
  let output, exitCode;
  const fakeFs = { existsSync: () => true, readFileSync: p => JSON.stringify(
    p.endsWith('index.json') ? [{ n: '001', id: 'identical-zero', k: 2 }] : p.includes(path.sep + 'page' + path.sep) ? pageExport : R),
    writeFileSync: (p, data) => { output = JSON.parse(data); } };
  vm.runInNewContext(fs.readFileSync(path.join(app, 'validate/roundtrip-compare.cjs'), 'utf8'), {
    require: id => id === 'fs' ? fakeFs : id.startsWith('.') ? require(path.resolve(app, 'validate', id)) : require(id),
    __dirname: path.join(app, 'validate'), console: { log() {} },
    process: { argv: ['node', 'compare', path.join(app, 'synthetic-roundtrip')], exit: c => { exitCode = c; } }
  });
  assert.equal(output.failed.filter(f => f.q === 'p').length, 4, JSON.stringify(output));
  assert.equal(exitCode, 1);
});
