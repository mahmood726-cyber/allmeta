import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../../../../shared/ma-core.js');
const html = readFileSync(new URL('../../../../correlation-ma/index.html', import.meta.url), 'utf8');
function pageResult(source = html) {
  const elements = new Map();
  const ready = [];
  let exporter;
  const document = {
    readyState: 'loading',
    addEventListener: (_, fn) => ready.push(fn),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: id === 'f-method' ? 'REML' : '', addEventListener() {} });
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

test('P0-36 plant: main downloads explicitly identify their actual Wald CI', () => {
  const { exporter } = pageResult();
  const result = exporter.getResults();
  assert.equal(result.ci_method, 'Wald z');
  assert.equal(result.test, 'z');
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

test('P0-36 plant detector rejects an exporter with the original missing method metadata', () => {
  const { window } = pageResult();
  assert.throws(() => assert.equal(window._almLastCorrMA().ci_method, 'Wald z'));
});

test('P0-36 control: a refused input never exports a fabricated estimate', () => {
  const { window, document, exporter } = pageResult();
  document.getElementById('f-data').value = 'One, .2, 30';
  window.__almCorrValidationRun();
  assert.equal(window._almLastCorrMA(), null);
  assert.deepEqual(Object.keys(exporter.getResults()), []);
});
