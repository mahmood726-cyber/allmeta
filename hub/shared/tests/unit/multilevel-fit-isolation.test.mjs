import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadPageFunctions } from '../features-helpers.mjs';

const root = new URL('../../../../', import.meta.url);
const pagePath = new URL('multilevel-ma/index.html', root);
const html = readFileSync(pagePath, 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('function fit(rows)'));
const sample = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
const dependencies = ['shared/stats-qt.js', 'shared/ma-core.js']
  .map(path => fileURLToPath(new URL(path, root)));

function pageFit(input) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'src' ? input : '', innerHTML: '',
      setAttribute() {}, addEventListener() {},
    });
    return nodes.get(id);
  };
  const alm = {
    analysisLifecycle: run => run, csvUpload() {}, plotExport() {}, axisControls() {},
    resultsExport() {}, resetUndo() {}, tooltips() {},
    urlState: Object.assign(() => {}, { read: () => null, write() {} }),
  };
  const context = vm.createContext({ alm, document: { getElementById: node } });
  context.window = context;
  for (const path of dependencies) vm.runInContext(readFileSync(path, 'utf8'), context);
  vm.runInContext(script, context);
  return { rows: context.__almMlmaParse(input), result: context._almLastMlma() };
}

function independentPool(rows, within, between) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.study)) groups.set(row.study, []);
    groups.get(row.study).push(row);
  }
  let information = 0, numerator = 0;
  for (const group of groups.values()) {
    const precision = group.reduce((sum, row) => sum + 1 / (row.se ** 2 + within), 0);
    const mean = group.reduce((sum, row) => sum + row.te / (row.se ** 2 + within), 0) / precision;
    const weight = 1 / (1 / precision + between);
    information += weight;
    numerator += weight * mean;
  }
  return { mu: numerator / information, seMu: Math.sqrt(1 / information) };
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${actual} != ${expected}`);
const configurations = [
  ['repeated study effects', sample],
  ['singleton studies', '1,0.1,0.1\n2,0.5,0.12\n3,-0.3,0.15'],
  ['zero study variance', '1,0.2,0.1\n1,0.2,0.12\n2,0.2,0.13\n3,0.2,0.15'],
];

for (const [label, input] of configurations) {
  test(`control: full-page MoM retains covariance-aware inference for ${label}`, () => {
    const { rows, result } = pageFit(input);
    const expected = independentPool(rows, result.tau2_within, result.tau2_study);
    assert.equal(result.method, 'MoM');
    close(result.mu, expected.mu);
    close(result.seMu, expected.seMu);
    assert.ok(Number.isFinite(result.pi_lb) && result.pi_lb < result.mu);
    assert.ok(Number.isFinite(result.pi_ub) && result.pi_ub > result.mu);
  });

  test(`regression: isolated fit runs with declared dependencies for ${label}`, () => {
    const { rows, result } = pageFit(input);
    const engine = loadPageFunctions(fileURLToPath(pagePath), ['fit'], {}, dependencies);
    const isolated = engine.fit(rows);
    for (const key of ['mu', 'seMu', 'seMuHK', 'tau2_study', 'tau2_within']) {
      close(isolated[key], result[key]);
    }
    close(isolated.piLo, result.pi_lb);
    close(isolated.piHi, result.pi_ub);
    assert.equal(isolated.weights.length, rows.length);
  });
}
