import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../../../../shared/ma-core.js');
const html = readFileSync(new URL('../../../../correlation-ma/index.html', import.meta.url), 'utf8');
const exportSource = readFileSync(new URL('../../results-export.js', import.meta.url), 'utf8');
const CI_METHOD = 'Main results CI method: Wald z (metafor test = "z").';
function pageResult(source = html, method = 'REML') {
  const elements = new Map();
  const ready = [];
  let exporter;
  const document = {
    readyState: 'loading',
    addEventListener: (_, fn) => ready.push(fn),
    querySelector(selector) {
      const footer = source.match(/<footer>([\s\S]*?)<\/footer>/);
      return selector === 'footer' && footer ? { textContent: footer[1].replace(/<[^>]+>/g, '') } : null;
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: id === 'f-method' ? method : '', addEventListener() {} });
      return elements.get(id);
    }
  };
  const window = { AlmMaCore: core, alm: { resultsExport: opts => { exporter = opts; } } };
  Object.assign(window, { window, document, matchMedia: () => ({ matches: false }) });
  const context = vm.createContext(window);
  vm.runInContext(source.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  ready.forEach(fn => fn());
  return { window, document, exporter };
}

// Exercise the unchanged shared serializers. Only Playwright writes page evidence.
async function download(opts, action, source = html) {
  const handlers = new Map();
  let blob;
  const target = { querySelector: selector => ({ addEventListener: (_, fn) => handlers.set(selector, fn) }) };
  const document = {
    title: 'Correlation Meta-Analysis',
    querySelector(selector) {
      if (selector === '#alm-export-mount') return target;
      const tag = { h1: 'h1', 'header p': 'p', footer: 'footer' }[selector];
      const match = tag && source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return match ? { textContent: match[1].replace(/<[^>]+>/g, '') } : null;
    },
    createElement: () => ({ click() {} }),
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} }
  };
  const window = {};
  const context = vm.createContext({ window, document, Blob, setTimeout() {},
    URL: { createObjectURL(value) { blob = value; return 'blob:test'; } } });
  vm.runInContext(exportSource, context);
  window.alm.resultsExport(opts);
  await handlers.get(`[data-action="${action}"]`)();
  assert.ok(blob, 'the export action produced a download');
  return blob.text();
}

for (const method of ['REML', 'PM', 'DL', 'FE']) {
  test(`P0-36 schema plant: ${method} JSON, CSV and data Markdown retain exact v1 bytes`, async () => {
    const { window, exporter } = pageResult(html, method);
    const original = window._almLastCorrMA();
    const before = JSON.stringify(original);
    const baseline = { ...exporter, getResults: () => original };
    assert.equal(original._schema, 'corr-ma-results-v1');
    assert.equal(original.ci_method, undefined);
    assert.equal(original.test, undefined);
    for (const action of ['json', 'csv', 'md']) {
      assert.equal(await download(exporter, action), await download(baseline, action));
    }
    assert.equal(JSON.stringify(original), before, 'exporting must not mutate the fit');
  });
}

test('P0-36 report plant: main Methods reports identify Wald without adding result keys', async () => {
  const { exporter } = pageResult();
  for (const action of ['report-md', 'report-txt']) {
    const report = await download(exporter, action);
    assert.ok(report.includes(CI_METHOD));
    assert.ok(!report.includes('ci_method'));
  }
});

test('P0-36 control: export labels preserve every validated result and do not mutate it', () => {
  const { window, exporter } = pageResult();
  const original = window._almLastCorrMA();
  const before = JSON.stringify(original);
  const exported = exporter.getResults();
  for (const key of Object.keys(original)) assert.deepEqual(exported[key], original[key]);
  assert.equal(JSON.stringify(original), before);
  assert.equal(original.ci_method, undefined);
  assert.ok(Math.abs(original.r - 0.37507210) < 1e-6);
});

test('P0-36 plant detector rejects extra v1 keys in every data export', async () => {
  const { window, exporter } = pageResult();
  const baseline = { ...exporter, getResults: () => window._almLastCorrMA() };
  const mutant = { ...exporter, getResults: () => ({ ...window._almLastCorrMA(), ci_method: 'Wald z', test: 'z' }) };
  for (const action of ['json', 'csv', 'md']) {
    const expected = await download(baseline, action), actual = await download(mutant, action);
    assert.throws(() => assert.equal(actual, expected), { code: 'ERR_ASSERTION' });
  }
});

test('P0-36 control: known-good v1 exports and explicit Methods pass; missing-method plant fails', async () => {
  const { window, exporter } = pageResult();
  const baseline = { ...exporter, getResults: () => window._almLastCorrMA() };
  const unlabelled = html.replace(CI_METHOD, '');
  assert.equal(await download(baseline, 'json'), JSON.stringify(window._almLastCorrMA(), null, 2));
  for (const action of ['report-md', 'report-txt']) {
    assert.ok((await download({ ...baseline, methods: CI_METHOD }, action)).includes(CI_METHOD));
    const missing = await download({ ...baseline, methods: '' }, action, unlabelled);
    assert.throws(() => assert.ok(missing.includes(CI_METHOD)), { code: 'ERR_ASSERTION' });
  }
});

test('P0-36 control: a refused input never exports a fabricated estimate', () => {
  const { window, document, exporter } = pageResult();
  document.getElementById('f-data').value = 'One, .2, 30';
  window.__almCorrValidationRun();
  assert.equal(window._almLastCorrMA(), null);
  assert.deepEqual(Object.keys(exporter.getResults()), []);
});
