import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load, replaceOnce, near, compareFit, comparePlot } from './p16-nma-inconsistency-harness.mjs';

const root = new URL('../../../../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('../fixtures/p16-nma-inconsistency-input.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(readFileSync(new URL('../fixtures/p16-nma-inconsistency-reference.json', import.meta.url), 'utf8'));
const models = ['FE', 'DL', 'PM'];
// CXTASK requires observed R disagreements to remain executable TODOs.
// Pass 2: both tests below failed at tree_k3 DL (app tau2=0, R=null).
// Keep their assertions, inputs and 1e-6 tolerance unchanged.
const saturatedDLTodo = 'P16-R1: saturated tree DL tau2 is 0 in the app, unavailable in netmeta 3.7.0; see REPORT.md';
const rowsFor = (id, h) => {
  const ref = oracle.cases[id];
  return ref.studies ? h.contrasts(ref.studies, ref.measure) : input.networks.find(c => c.id === id).rows;
};

test('P16 control: fresh R fixture records exact inputs, script and package versions', () => {
  assert.equal(Object.keys(oracle.cases).length, 12);
  for (const p of ['netmeta', 'metafor', 'meta']) assert.ok(oracle.provenance.packages[p]);
  assert.match(oracle.provenance.R, /^R version /);
  for (const key of ['input', 'script', 'prepare']) {
    const md5 = createHash('md5').update(readFileSync(new URL(oracle.provenance[key], root))).digest('hex');
    assert.equal(md5, oracle.provenance[`${key}_md5`], `${key} must match the actual R run`);
  }
  for (const c of input.networks) assert.deepEqual(oracle.cases[c.id].rows, c.rows, c.id);
  for (const c of input.binary) for (const measure of ['OR', 'RR']) {
    assert.deepEqual(oracle.cases[`${c.id}_${measure}`].studies, c.studies);
  }
  for (const ref of Object.values(oracle.cases)) assert.deepEqual(Object.keys(ref.fits), models);
});

// Five coverage areas: signed full fits; plotted CIs; zero tau; small networks;
// binary zero-cell conversion followed by full network fits. No production
// behaviour changes; original corpus, tolerances and reference values untouched.
for (const id of Object.keys(oracle.cases)) for (const model of models) {
  test(`P16 R parity: ${id} ${model} signed estimates, tau2, Q, splits and tests`,
    id === 'tree_k3' && model === 'DL' ? { todo: saturatedDLTodo } : {}, () => {
    const h = load(), rows = rowsFor(id, h), ref = oracle.cases[id];
    if (ref.studies) {
      assert.equal(rows.length, ref.rows.length, 'all binary rows retained');
      rows.forEach((r, i) => {
        for (const key of ['A', 'B', 'study']) assert.equal(r[key], ref.rows[i][key]);
        near(r.te, ref.rows[i].te, `escalc ${r.study}.te`);
        near(r.se, ref.rows[i].se, `escalc ${r.study}.se`);
      });
    }
    const actual = h.run(rows, model);
    compareFit(actual, ref.fits[model]);
    // Exact direct-study membership includes kDirect=1 and kDirect=2 cases.
    const raw = Array.from(h.c.nodeSplit(rows, undefined, actual.tau2));
    for (const s of ref.fits[model].nodeSplit) assert.equal(raw.find(x => x.comparison === s.comparison).kDirect, s.kDirect);
  });
  if (oracle.cases[id].fits[model].nodeSplit.length) {
    test(`P16 R CI parity: ${id} ${model} plotted direct and indirect 95% limits`, () => {
      const h = load(), actual = h.run(rowsFor(id, h), model);
      comparePlot(h, actual, oracle.cases[id].fits[model]);
    });
  }
}

for (const model of models) {
  test(`P16 boundary control: ${model} zero heterogeneity and no-loop inference`,
    model === 'DL' ? { todo: saturatedDLTodo } : {}, () => {
    const h = load();
    for (const id of ['tau_zero', 'zero_effect', 'tree_k3']) {
      assert.equal(oracle.cases[id].fits[model].tau2, 0, `${id} R boundary`);
      assert.equal(h.run(rowsFor(id, h), model).tau2, 0, `${id} app boundary`);
    }
    for (const id of ['tree_k3', 'tree_replicated']) {
      const actual = h.run(rowsFor(id, h), model);
      assert.deepEqual(actual.nodeSplit, []);
      assert.deepEqual(actual.dbt, { Q: 0, df: 0, p: null });
      assert.deepEqual(oracle.cases[id].fits[model].dbt, { Q: 0, df: 0, p: null });
    }
    assert.ok(oracle.cases.heterogeneous.fits[model].dbt.df > 1, 'global multi-df control');
    if (model !== 'FE') assert.ok(oracle.cases.heterogeneous.fits[model].tau2 > 0, 'positive-tau control');
  });
  test(`P16 policy control: ${model} k=1 and k=2 refused; k=3 triangle accepted`, () => {
    const h = load(), rows = rowsFor('triangle_k3', h);
    for (const k of [1, 2]) {
      h.run(rows, model); // seed an accepted fit, then check stale output clears
      assert.deepEqual(h.run(rows.slice(0, k), model), { status: 'refused', reason: 'At least 3 valid contrasts are required.' });
      assert.equal(h.elements.get('ns-body').innerHTML, '');
      assert.equal(h.elements.get('ns-plot').innerHTML, '');
    }
    compareFit(h.run(rows, model), oracle.cases.triangle_k3.fits[model]);
  });
}

test('P16 planted defect: intercept-only DL denominator fails R; FE control passes', () => {
  const h = load({ engine: replaceOnce('const denom = sumW - trCW2;', 'const denom = sumW - w.reduce((s, x) => s + x*x, 0) / sumW;') });
  const rows = rowsFor('heterogeneous', h), ref = oracle.cases.heterogeneous.fits;
  compareFit(h.run(rows, 'FE'), ref.FE);
  assert.throws(() => compareFit(h.run(rows, 'DL'), ref.DL), /tau2: app=/);
});
test('P16 planted defect: substituting DL for PM fails R; DL control passes', () => {
  const h = load({ engine: replaceOnce('return tau2_PM(rows);', 'return tau2_DL(rows);') });
  const rows = rowsFor('heterogeneous', h), ref = oracle.cases.heterogeneous.fits;
  compareFit(h.run(rows, 'DL'), ref.DL);
  assert.throws(() => compareFit(h.run(rows, 'PM'), ref.PM), /tau2: app=/);
});
test('P16 planted defect: indirect sign flip fails signed R; zero-effect control passes', () => {
  const h = load({ engine: replaceOnce('ind = { mean: -est, se };', 'ind = { mean: est, se };') });
  compareFit(h.run(rowsFor('zero_effect', h), 'FE'), oracle.cases.zero_effect.fits.FE);
  assert.throws(() => compareFit(h.run(rowsFor('triangle_k3', h), 'FE'), oracle.cases.triangle_k3.fits.FE), /indirect.mean: app=/);
});
test('P16 planted defect: rounded 1.96 whiskers fail R CI; numeric-fit control passes', () => {
  const h = load({ engine: replaceOnce('var Z975 = 1.959963984540054;', 'var Z975 = 1.96;') });
  const actual = h.run(rowsFor('triangle_k3', h), 'FE'), ref = oracle.cases.triangle_k3.fits.FE;
  compareFit(actual, ref);
  assert.throws(() => comparePlot(h, actual, ref), /CI\.(lower|upper): app=/);
});
test('P16 planted defect: positive tau floor fails zero-tau R; FE control passes', () => {
  const h = load({ engine: replaceOnce('return Math.max(0, (fit0.Q - fit0.df) / denom);', 'return Math.max(0.001, (fit0.Q - fit0.df) / denom);') });
  const rows = rowsFor('tau_zero', h), ref = oracle.cases.tau_zero.fits;
  compareFit(h.run(rows, 'FE'), ref.FE);
  assert.throws(() => compareFit(h.run(rows, 'DL'), ref.DL), /tau2: app=/);
});
test('P16 planted defect: reporting p=1 without loops fails R; loop control passes', () => {
  const h = load({ engine: replaceOnce('return { Q: 0, df: 0, p: NaN, note:', 'return { Q: 0, df: 0, p: 1, note:') });
  compareFit(h.run(rowsFor('triangle_k3', h), 'FE'), oracle.cases.triangle_k3.fits.FE);
  assert.throws(() => compareFit(h.run(rowsFor('tree_k3', h), 'FE'), oracle.cases.tree_k3.fits.FE), /dbt.p unavailable/);
});
test('P16 planted defect: disabling zero-cell correction loses rows; ordinary-cell control passes', () => {
  // This pairwise-loop anchor is unique to toContrasts; the correction block
  // itself also occurs in the unrelated dose-response adapter.
  const h = load({ bus: replaceOnce('var x = s.arms[a], y = s.arms[b], te, se;',
    'cc = 0; var x = s.arms[a], y = s.arms[b], te, se;') });
  for (const measure of ['OR', 'RR']) {
    const id = `binary_control_${measure}`;
    compareFit(h.run(rowsFor(id, h), 'FE'), oracle.cases[id].fits.FE);
    assert.throws(() => assert.equal(rowsFor(`binary_zero_${measure}`, h).length,
      oracle.cases[`binary_zero_${measure}`].rows.length, 'all binary rows retained'), /all binary rows retained/);
  }
});
