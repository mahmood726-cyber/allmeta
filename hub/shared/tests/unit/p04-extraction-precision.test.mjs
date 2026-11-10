import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import NM from '../../../../shared/nma-multiarm-v1.js';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma/index.html', root), 'utf8');
const busCode = readFileSync(new URL('shared/ma-comparisons-v1.js', root), 'utf8');
function section(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing page section: ${start}`);
  return html.slice(from, to);
}
// Execute the shipped serializer, parser and compute hook without a browser.
// Only storage is substituted; contrast derivation and fitting use the real modules.
const pageCode = [
  section('    function contrastCells(', '    function clearResults('),
  section('    function busContrastsText(', '    function onLoadBus('),
  section('    window.__almNmaCompute =', '    const loaded = loadSaved();'),
].join('\n');

function harness(env) {
  const stored = env === null ? null : JSON.stringify(env);
  const window = {
    localStorage: { getItem: key => key === 'ma-comparisons-v1' ? stored : null },
    AlmNmaMultiarm: NM,
  };
  const context = vm.createContext({ window });
  vm.runInContext(busCode, context);
  vm.runInContext(pageCode, context);
  return {
    window,
    importText: () => context.busContrastsText(),
    parse: text => structuredClone(context.parseContrasts(text)),
    compute: text => window.__almNmaCompute(text, 'A'),
    directRows: () => window.MaComparisons.toContrasts(window.MaComparisons.read()).map(c => ({
      study: c.study, t1: c.treatment2, t2: c.treatment1, est: c.te, se: c.se,
    })),
  };
}

function mdEnvelope(meanB = 4.9e-7, sd = 1e-5, n = 100) {
  return {
    _schema: 'ma-comparisons-v1', _savedAt: '2026-01-01T00:00:00Z', effectMeasure: 'MD',
    studies: ['S1', 'S2'].map(id => ({ id, arms: [
      { treatment: 'A', mean: 0, sd, n },
      { treatment: 'B', mean: meanB, sd, n },
    ] })),
  };
}

function importedRows(h) {
  const bus = h.importText();
  assert.ok(bus);
  const parsed = h.parse(bus.text);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.rows.length, bus.n);
  return parsed.rows;
}

function near(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-15,
    `${label}: ${actual} versus ${expected} (tolerance 1e-15)`);
}

test('P04-R4 control: full-precision engine retains tiny MD and inverse-variance SE', () => {
  const h = harness(mdEnvelope()), fit = NM.analyse(h.directRows());
  assert.equal(fit.ok, true, fit.error);
  const a = fit.treatments.indexOf('A'), b = fit.treatments.indexOf('B');
  // Analytic control: two identical independent studies, each with two equal arms.
  // Pooled MD = meanB - meanA; pooled SE = sqrt((2 * sd^2 / n) / 2).
  for (const model of ['common', 'random']) {
    near(fit[model].TE[b][a], 4.9e-7, `${model} pooled MD`);
    near(fit[model].seTE[b][a], Math.sqrt((2 * 1e-5 ** 2 / 100) / 2), `${model} pooled SE`);
  }
});

test('P04-R4 plant: extraction preserves tiny signed effects exactly', () => {
  for (const meanB of [4.9e-7, -4.9e-7]) {
    const h = harness(mdEnvelope(meanB)), rows = importedRows(h), direct = h.directRows();
    rows.forEach((r, i) => assert.equal(r.est, direct[i].est, `${r.study} imported MD`));
  }
});

test('P04-R4 plant: extraction preserves contrast standard errors exactly', () => {
  const h = harness(mdEnvelope()), rows = importedRows(h), direct = h.directRows();
  rows.forEach((r, i) => assert.equal(r.se, direct[i].se, `${r.study} imported SE`));
});

for (const [field, pageField] of [['TE', 'd'], ['seTE', 'se']]) {
  test(`P04-R4 plant: imported pooled ${pageField} equals the full-precision fit`, () => {
    const h = harness(mdEnvelope()), direct = NM.analyse(h.directRows());
    assert.equal(direct.ok, true, direct.error);
    const imported = h.compute(h.importText().text);
    assert.equal(imported.error, undefined);
    const a = direct.treatments.indexOf('A'), b = direct.treatments.indexOf('B');
    for (const [model, pageModel] of [['common', 'fe'], ['random', 're']]) {
      near(imported[pageModel].est.B[pageField], direct[model][field][b][a], `${model} pooled ${pageField}`);
    }
  });
}

test('P04-R4 plant: small positive SE survives import without a zero-SE refusal', () => {
  const h = harness(mdEnvelope(4.9e-8, 3e-6));
  const rows = importedRows(h), direct = h.directRows();
  rows.forEach((r, i) => {
    assert.ok(r.se > 0);
    assert.equal(r.se, direct[i].se);
    assert.equal(r.est, direct[i].est);
  });
  assert.equal(h.compute(h.importText().text).error, undefined);
});

test('P04-R4 plant: ordinary OR multi-arm contrasts round-trip without losing digits', () => {
  const env = {
    _schema: 'ma-comparisons-v1', _savedAt: '2026-01-01T00:00:00Z', effectMeasure: 'OR',
    studies: [{ id: 'Three', arms: [
      { treatment: 'A', events: 10, n: 100 },
      { treatment: 'B', events: 20, n: 100 },
      { treatment: 'C', events: 30, n: 100 },
    ] }],
  };
  const h = harness(env), rows = importedRows(h), direct = h.directRows();
  assert.equal(rows.length, 3);
  rows.forEach((r, i) => {
    assert.equal(r.study, direct[i].study);
    assert.equal(r.t1, direct[i].t1);
    assert.equal(r.t2, direct[i].t2);
    assert.equal(r.est, direct[i].est);
    assert.equal(r.se, direct[i].se);
  });
});

test('P04-R4 control: exactly representable MD, zero effects and treatment direction survive import', () => {
  for (const meanB of [0.25, -0.25, 0]) {
    const h = harness(mdEnvelope(meanB, 0.5, 2)), rows = importedRows(h);
    assert.equal(h.importText().measure, 'MD');
    rows.forEach(r => {
      assert.equal(r.t1, 'B');
      assert.equal(r.t2, 'A');
      assert.equal(r.est, 0 - meanB);
      assert.equal(r.se, 0.5);
    });
    const result = h.compute(h.importText().text);
    assert.equal(result.error, undefined);
    for (const model of ['fe', 're']) near(result[model].est.B.d, meanB, `${model} direction`);
  }
});

test('P04-R4 control: missing, empty and unavailable extraction buses return null', () => {
  assert.equal(harness(null).importText(), null);
  assert.equal(harness({ ...mdEnvelope(), studies: [] }).importText(), null);
  const h = harness(mdEnvelope());
  delete h.window.MaComparisons;
  assert.equal(h.importText(), null);
});
