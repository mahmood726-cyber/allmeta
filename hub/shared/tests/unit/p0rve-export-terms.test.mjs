import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('rve-meta/index.html', root), 'utf8');
const eigen = createRequire(import.meta.url)('../../../../shared/rve-eigen.js');
await eigen.ready;

// Execute the page's rendering/state code with real fits and export helpers.
// This is a DOM-free plumbing test; only Playwright writes browser evidence.
function render(centred = false, interceptOnly = false) {
  const nodes = new Map();
  const context = vm.createContext({
    AlmRVEEigen: eigen,
    $: id => {
      if (id === 'btn-centre') return null;
      if (!nodes.has(id)) nodes.set(id, { hidden: true, innerHTML: '', addEventListener() {} });
      return nodes.get(id);
    },
    setExportsEnabled() {},
    centred,
    interceptOnly
  });
  vm.runInContext('var window = globalThis;', context);
  for (const file of ['stats-qt.js', 'rve.js', 'rve-extras.js']) {
    vm.runInContext(readFileSync(new URL(`shared/${file}`, root), 'utf8'), context);
  }
  const example = html.match(/var SMALL_EXAMPLE = ("[^\n]+?");/);
  assert.ok(example, 'existing page example');
  vm.runInContext(`
    var E = AlmRVEExtras, parsed = E.parseStudies(${example[1]});
    var names = interceptOnly ? [] : ['intervention', 'dose_weeks'];
    if (interceptOnly) parsed.rows.forEach(r => { r.X = [1]; });
    var nPred = names.length, warnings = [], rho = 0.8, means = null;
    var fitRows = parsed.rows;
    if (centred) { var c = E.centreRows(fitRows); fitRows = c.rows; means = c.means; }
    var fit = AlmRVE.fitCORR(fitRows, { rho }), summary = AlmRVE.summary(fit);
  `, context);
  const helpers = html.slice(html.indexOf('    function esc('), html.indexOf('    function setExportsEnabled('));
  const rendering = html.slice(html.indexOf('      var kappa = E.kappaXtWX'), html.indexOf('      setExportsEnabled(true);'));
  assert.ok(rendering.includes('lastResult = E.buildResult'), 'actual result construction is exercised');
  vm.runInContext(helpers + rendering, context);
  return { context, nodes };
}

for (const centred of [false, true]) {
  test(`R1 plant: ${centred ? 'centred' : 'raw'} exports retain canonical coefficient and rho CSV terms`, () => {
    const { context } = render(centred);
    // Main's unchanged helper defines export names, including its centred name.
    const expected = vm.runInContext('E.coefficientNames(names, fit.p, centred)', context);
    const actual = vm.runInContext('lastResult.coefficients.map(c => c.term)', context);
    assert.deepEqual(Array.from(actual), Array.from(expected));
    assert.deepEqual(Array.from(context.lastState.coefNames), Array.from(expected));
    assert.deepEqual(Array.from(context.lastResult.coefficients, c => c.estimate), Array.from(context.fit.beta));
    const coefficientCsv = vm.runInContext('E.toCoefficientCSV(lastResult)', context);
    assert.deepEqual(coefficientCsv.trim().split(/\r?\n/).slice(1).map(line => line.split(',')[0]), Array.from(expected));
    const rhoCsv = vm.runInContext('E.toRhoSensitivityCSV(E.rhoSensitivity(fitRows), lastState.coefNames)', context);
    const rhoTerms = rhoCsv.trim().split(/\r?\n/).slice(1).map(line => line.split(',')[1]);
    assert.ok(rhoTerms.length > expected.length);
    assert.deepEqual([...new Set(rhoTerms)], Array.from(expected));
    const report = vm.runInContext('E.toReportMarkdown(lastResult)', context);
    for (const term of expected) assert.ok(report.includes(`| ${term} |`));
    assert.ok(!report.includes('not an overall pooled effect'), 'display wording stays out of exported warnings too');
  });
}

test('R1 control: moderator table and low-df warning retain explanatory display labels', () => {
  const { nodes } = render();
  const label = 'Intercept (effect when intervention = 0 and dose_weeks = 0; not an overall pooled effect)';
  assert.ok(nodes.get('coef-body').innerHTML.includes(label));
  assert.ok(nodes.get('meta-row').innerHTML.includes(label));
  assert.ok(nodes.get('meta-row').innerHTML.includes('Centre predictors at their means'));
});

test('R1 control: intercept-only export name and table stay canonical', () => {
  const { context, nodes } = render(false, true);
  assert.equal(context.lastResult.coefficients[0].term, '(intercept)');
  assert.ok(nodes.get('coef-body').innerHTML.includes('(intercept)'));
  assert.ok(!nodes.get('meta-row').innerHTML.includes('id="intercept-note"'));
});
