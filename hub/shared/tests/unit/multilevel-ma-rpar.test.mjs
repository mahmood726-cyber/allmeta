import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const fixture = 'hub/shared/tests/fixtures/multilevel-ma-rpar/';
const input = JSON.parse(read(fixture + 'input.json'));
const reference = JSON.parse(read(fixture + 'reference.json'));
const tolerance = 1e-6; // Absolute; no optimizer-specific relaxation.
// Observed in the first native run. CXTASK requires live TODO assertions for
// mismatches: retain the recorded R values, tolerance and full test bodies.
const remlTodos = {
  boundary_between: 'P07-RPAR-01: within variance differs by 2.2118724125608225e-6; boundary optimizer discrepancy under investigation',
  single_cluster: 'P07-RPAR-02: unidentifiable between-cluster component is not fixed to zero; SE and CI differ from metafor'
};
const remlSource = read('shared/multilevel-reml.js');
const context = vm.createContext({});
context.window = context;
for (const path of ['shared/multilevel-reml.js', 'multilevel-ma/plus-engine.js', 'shared/stats-qt.js', 'shared/ma-core.js']) {
  vm.runInContext(read(path), context, { filename: path });
}
// Execute the page's own fit bytes without DOM or copied estimator logic.
// These stable declarations bracket the whole function, including nested helpers.
const html = read('multilevel-ma/index.html');
const start = html.indexOf('    function fit(rows) {');
const end = html.indexOf('    // ---- axis state', start);
assert.ok(start >= 0 && end > start, 'page fit extraction markers');
vm.runInContext(html.slice(start, end), context, { filename: 'multilevel-ma/index.html:fit' });
const rowsForPage = rows => rows.map(r => ({ study: r.cluster, te: r.y, se: Math.sqrt(r.v), label: '' }));
function momValues(rows, engine = context) {
  const f = engine.fit(rowsForPage(rows));
  return { ...f, ciLoZ: f.mu - 1.959963984540054 * f.seMu, ciHiZ: f.mu + 1.959963984540054 * f.seMu,
    ciLoHK: f.mu - f.tCrit * f.seMuHK, ciHiHK: f.mu + f.tCrit * f.seMuHK };
}
function compare(actual, expected, label) {
  const failures = [];
  for (const [key, r] of Object.entries(expected)) {
    const a = actual[key], error = Math.abs(a - r);
    if (!Number.isFinite(a) || !Number.isFinite(r) || error > tolerance) failures.push({ key, app: a, R: r, error });
  }
  assert.deepEqual(failures, [], `${label}: absolute tolerance ${tolerance}`);
}

test('P07 parity provenance: native R versions, script, input and case coverage', () => {
  assert.match(reference.provenance.R, /^R version /);
  for (const p of ['metafor', 'clubSandwich', 'jsonlite']) assert.ok(reference.provenance.packages[p], p);
  const md5 = path => createHash('md5').update(readFileSync(new URL(path, root))).digest('hex');
  assert.equal(reference.provenance.input_md5, md5(fixture + 'input.json'));
  assert.equal(reference.provenance.script_md5, md5('hub/shared/tests/r/multilevel-ma-parity.R'));
  assert.deepEqual(reference.cases.map(c => c.id), input.cases.map(c => c.id));
  for (const c of input.cases) {
    const r = reference.cases.find(x => x.id === c.id);
    assert.equal(r.k, c.rows.length);
    assert.equal(r.J, new Set(c.rows.map(row => row.cluster)).size);
    assert.equal(Boolean(r.reml), Boolean(c.reml));
    assert.equal(Boolean(r.mom), Boolean(c.mom));
    assert.equal(Boolean(r.cr2), Boolean(c.cr2));
  }
});

for (const c of input.cases) {
  const r = reference.cases.find(x => x.id === c.id);
  if (c.reml) test(`P07 REML vs metafor: ${c.id}`, { todo: remlTodos[c.id] }, () => {
    const actual = context.AlmMultilevelREML.fit(c.rows);
    compare(actual, r.reml, c.id);
    assert.equal(actual.k, r.k);
    assert.equal(actual.nClusters, r.J);
  });
  if (c.mom) test(`P07 MoM canonical reduction and cluster-t PI: ${c.id}`, () => {
    compare(momValues(c.rows), r.mom, c.id);
  });
  if (c.cr2) test(`P07 CR2 vs clubSandwich conditional on R components: ${c.id}`, () => {
    compare(context.AlmMultilevelPlusEngine.cr2(c.rows, ...r.cr2Sigma2), r.cr2, c.id);
  });
}

test('P07 parity controls: every numeric assertion rejects a planted error and nonfinite result', () => {
  for (const c of reference.cases) for (const section of ['reml', 'mom', 'cr2']) {
    const expected = c[section];
    if (!expected) continue;
    compare(expected, expected, `${c.id}/${section} control`);
    for (const key of Object.keys(expected)) {
      for (const planted of [expected[key] + 1e-4, NaN, Infinity, undefined]) {
        assert.throws(() => compare({ ...expected, [key]: planted }, expected, `${c.id}/${section}/${key}`), assert.AssertionError);
      }
    }
  }
});

test('P07 REML planted defect: dropping between-cluster covariance is detected', () => {
  const c = input.cases.find(c => c.id === 'few_three_interior');
  const r = reference.cases.find(r => r.id === c.id);
  compare(context.AlmMultilevelREML.fit(c.rows), r.reml, 'unmodified control');
  const needle = 'var denom = 1 + s2b * S1;';
  assert.equal(remlSource.split(needle).length, 2);
  const mutant = vm.createContext({});
  vm.runInContext(remlSource.replace(needle, 'var denom = 1;'), mutant);
  assert.throws(() => compare(mutant.AlmMultilevelREML.fit(c.rows), r.reml, 'removed covariance'), assert.AssertionError);
});

test('P07 PI planted defects: normal quantile and row-count degrees of freedom are detected', () => {
  const c = input.cases.find(c => c.id === 'mom_two_clusters_pi');
  const r = reference.cases.find(r => r.id === c.id);
  const actual = momValues(c.rows);
  compare(actual, r.mom, 'two-cluster control');
  for (const critical of [1.959963984540054, context.AlmStats.qt(.975, c.rows.length - 1)]) {
    assert.throws(() => compare({ ...actual, piLo: actual.mu - critical * actual.seMuHK }, r.mom, 'wrong PI critical'), assert.AssertionError);
  }
});

test('P07 MoM planted defect: removing the residual-scale floor is detected', () => {
  const c = input.cases.find(c => c.id === 'mom_singletons_floor');
  const r = reference.cases.find(r => r.id === c.id);
  compare(momValues(c.rows), r.mom, 'floored control');
  const source = html.slice(start, end), needle = 'Math.max(1, qStar)';
  assert.equal(source.split(needle).length, 2);
  const mutant = vm.createContext({});
  mutant.window = mutant;
  vm.runInContext(read('shared/stats-qt.js'), mutant);
  vm.runInContext(read('shared/ma-core.js'), mutant);
  vm.runInContext(source.replace(needle, 'qStar'), mutant);
  assert.throws(() => compare(momValues(c.rows, mutant), r.mom, 'removed floor'), assert.AssertionError);
});
