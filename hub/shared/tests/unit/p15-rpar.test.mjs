import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
require('../../../../shared/stats-qt.js');
const RVE = require('../../../../shared/rve.js');
const extras = require('../../../../shared/rve-extras.js');
const eigen = require('../../../../shared/rve-eigen.js');
const fixtureURL = new URL('../fixtures/p15-rpar-reference.json', import.meta.url);
const reference = JSON.parse(readFileSync(fixtureURL, 'utf8'));
const inputURL = new URL('../fixtures/p15-rpar-input.json', import.meta.url);
const input = JSON.parse(readFileSync(inputURL, 'utf8'));
const scriptURL = new URL('../r/p15-rpar-reference.R', import.meta.url);
const engineSource = readFileSync(new URL('../../../../shared/rve.js', import.meta.url), 'utf8');
const tolerance = 1e-6; // Absolute, for every quantity; no iterative-method exception.
const fields = ['estimate', 'se', 't', 'df', 'p', 'ci_lo', 'ci_hi'];
const rowsFor = id => input.datasets.find(d => d.id === id).rows.map(
  ([cluster, yi, vi, ...x]) => ({ cluster, yi, vi, X: [1, ...x] }));
const fitRef = (id, method = 'CR2', centred = false, rho = 0.8) => {
  const found = reference.fits.find(f => f.dataset === id && f.method === method && f.centred === centred && f.rho === rho);
  assert.ok(found, `missing R case ${id}/${method}/${centred}/${rho}`);
  return found;
};
function close(actual, expected, label, failures) {
  const delta = Math.abs(actual - expected);
  if (typeof actual !== 'number' || typeof expected !== 'number' ||
      !Number.isFinite(actual) || !Number.isFinite(expected) || delta > tolerance)
    failures.push(`${label}: app=${actual}, R=${expected}, abs_diff=${delta}`);
}
function compareTable(actual, expected, label, failures) {
  assert.equal(actual.length, expected.length, `${label}: coefficient count`);
  actual.forEach((row, j) => fields.forEach(key => close(row[key], expected[j][key], `${label}[${j}].${key}`, failures)));
}
function compareFit(engine, f, rows) {
  assert.equal(f.R.status, 'ok', `R oracle failed: ${f.R.message}`);
  const actual = engine.fitCORR(rows, {rho: f.rho, method: f.method});
  assert.equal(actual.method, f.method);
  assert.equal(actual.m_clusters, f.R.m);
  assert.equal(actual.k_total, f.R.k);
  assert.equal(actual.p, f.R.p);
  const failures = [];
  close(actual.tau2, f.R.tau2, 'tau2', failures);
  close(actual.rho, f.rho, 'rho', failures);
  assert.equal(actual.weights.length, f.R.weights.length);
  actual.weights.forEach((w, i) => close(w, f.R.weights[i], `weight[${i}]`, failures));
  assert.equal(actual.cov_robust.length, f.R.covariance.length);
  actual.cov_robust.forEach((row, i) => {
    assert.equal(row.length, f.R.covariance[i].length);
    row.forEach((v, j) => close(v, f.R.covariance[i][j], `covariance[${i}][${j}]`, failures));
  });
  const summary = engine.summary(actual);
  compareTable(summary, f.R.table, 'robumeta/CR1S', failures);
  if (f.method === 'CR2') {
    assert.ok(f.R.club, 'independent clubSandwich inference is present');
    compareTable(summary, f.R.club, 'clubSandwich', failures);
  }
  assert.deepEqual(failures, [], f.id);
}

test('P15 R-parity control: oracle provenance, exact inputs and complete case matrix', () => {
  for (const key of ['R', 'platform', 'robumeta', 'clubSandwich', 'jsonlite'])
    assert.ok(reference.provenance[key], key);
  assert.equal(reference.provenance.LC_COLLATE, 'C');
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
  for (const [key, url] of [['input_md5', inputURL], ['script_md5', scriptURL]])
    assert.equal(reference.provenance[key], createHash('md5').update(readFileSync(url)).digest('hex'), key);
  assert.deepEqual(reference.input, input);
  const ids = input.datasets.flatMap(d => d.rho.flatMap(rho => d.methods.flatMap(method =>
    d.centred.map(centred => `${d.id}/${method}/${centred ? 'centred' : 'raw'}/${rho}`))));
  assert.deepEqual(reference.fits.map(f => f.id), ids);
});

// Every new parity case is initially run as an ordinary test. Only observed
// discrepancies may receive a specific, documented node:test TODO annotation.
for (const f of reference.fits) {
  if (f.refusal) {
    test(`P15 R-parity refusal: ${f.id}`, () => {
      const rows = rowsFor(f.dataset);
      // The app explicitly refuses m<=p. Record R's native error/nonfinite
      // outcome rather than inventing finite reference inference for k=1.
      assert.ok(f.R.status === 'error' || f.R.table.some(row => fields.some(key => row[key] === null)),
        'R must also lack finite inference for this design');
      assert.throws(() => RVE.fitCORR(rows, {rho: f.rho}), /m<=p|eigen|singular|complex|infinite|NaN/i);
    });
    continue;
  }
  test(`P15 R-parity full fit: ${f.id}`, () => {
    let rows = rowsFor(f.dataset);
    if (f.centred) rows = extras.centreRows(rows).rows;
    compareFit(RVE, f, rows);
  });
}

test('P15 R-parity control: tau2 boundary and small-cluster cases exercise distinct regimes', () => {
  assert.equal(fitRef('ds1-zero-tau').R.tau2, 0);
  assert.ok(fitRef('ds2-rho-grid').R.tau2 > 0);
  assert.equal(fitRef('two-effects').R.k, 2);
  assert.equal(fitRef('two-effects').R.m, 2);
  assert.equal(fitRef('two-clusters').R.m, 2);
  assert.ok(fitRef('two-clusters').R.k > 2);
  assert.ok(fitRef('ds1-zero-tau').R.table.some(s => s.df < 2));
});

test('P15 R-parity rho sensitivity: all six refits, full inference and conclusion flags', () => {
  const actual = extras.rhoSensitivity(rowsFor('ds2-rho-grid'));
  assert.deepEqual(actual.grid, input.rho_grid);
  assert.equal(actual.fits.length, input.rho_grid.length);
  const refs = input.rho_grid.map(rho => fitRef('ds2-rho-grid', 'CR2', false, rho));
  const failures = [];
  actual.fits.forEach((f, i) => {
    assert.equal(f.rho, refs[i].rho);
    assert.equal(f.error, undefined);
    close(f.tau2, refs[i].R.tau2, `rho=${f.rho}: tau2`, failures);
    compareTable(f.summary, refs[i].R.table, `rho=${f.rho}`, failures);
  });
  assert.deepEqual(failures, []);
  const flags = refs[0].R.table.map((_, j) => {
    const estimates = refs.map(f => f.R.table[j].estimate);
    const significant = refs.map(f => f.R.table[j].p < 0.05);
    return {coef_index: j,
      sign_changes: estimates.some(x => x > 0) && estimates.some(x => x < 0),
      significance_changes: significant.some(Boolean) && significant.some(x => !x)};
  });
  assert.deepEqual(actual.flags, flags);
});

for (const id of ['ds1-zero-tau', 'ds2-rho-grid']) {
  test(`P15 R-parity centring and condition number: ${id}`, () => {
    const original = rowsFor(id);
    const centred = extras.centreRows(original);
    const ref = fitRef(id, 'CR2', true);
    const failures = [];
    centred.means.forEach((x, j) => close(x, ref.R.predictor_means[j], `mean[${j}]`, failures));
    centred.rows.forEach((r, i) => r.X.forEach((x, j) => close(x, ref.R.design[i][j], `X[${i}][${j}]`, failures)));
    for (const centre of [false, true]) {
      const f = fitRef(id, 'CR2', centre), rows = centre ? centred.rows : original;
      const fit = RVE.fitCORR(rows, {rho: f.rho});
      close(extras.kappaXtWX(rows, fit.weights), f.R.kappa, `centred=${centre}: kappa`, failures);
    }
    assert.deepEqual(failures, []);
  });
}

// Mutants exist only in isolated VM contexts; production files are never changed.
// Each plant has the unchanged engine as a passing control against the same R data.
function mutant(before, after) {
  assert.equal(engineSource.split(before).length, 2, 'mutation must target exactly one source location');
  const context = vm.createContext({AlmStats: globalThis.AlmStats, AlmRVEEigen: eigen});
  vm.runInContext(engineSource.replace(before, after), context);
  return context.AlmRVE;
}
for (const plant of [
  {name: 'normal instead of Student-t CI', before: 'var crit = qt(0.975, dfj);', after: 'var crit = 1.959963984540054;', dataset: 'two-effects', rho: 0.8},
  {name: 'CR1 substituted for CR2', before: 'var method = (opts.method === "CR1") ? "CR1" : "CR2";', after: 'var method = "CR1";', dataset: 'ds1-zero-tau', rho: 0.8},
  {name: 'rho ignored by tau2 estimator', before: 'term1 + rho * term2', after: 'term1 + 0.8 * term2', dataset: 'ds2-rho-grid', rho: 0}
]) {
  test(`P15 R-parity planted defect detected: ${plant.name}`, () => {
    const f = fitRef(plant.dataset, 'CR2', false, plant.rho), rows = rowsFor(plant.dataset);
    compareFit(RVE, f, rows);
    assert.throws(() => compareFit(mutant(plant.before, plant.after), f, rows), assert.AssertionError);
  });
}
