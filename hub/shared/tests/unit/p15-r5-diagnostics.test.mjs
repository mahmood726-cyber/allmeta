import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import '../../../../shared/stats-qt.js';
import RVE from '../../../../shared/rve.js';
import E from '../../../../shared/rve-extras.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const inputs = JSON.parse(read('./p15-r5-input.json'));
const reference = () => JSON.parse(read('./p15-r5-reference.json'));
const eigenFixture = name => JSON.parse(read(`../../../../rve-meta/tests/fixtures/p15-eigen/${name}.json`));
const csv = rows => rows.map(r => [r.cluster, r.yi, r.vi, ...r.X.slice(1)].join(',')).join('\n');
function refusal(rows, opts) {
  try { RVE.fitCORR(rows, opts); } catch (e) { return e; }
  assert.fail('The fit must be refused');
}

// Execute the real page controller with a minimal DOM, real parser and engine.
// This is a Node unit test of the fit handler, not a rendered-browser test.
function page() {
  const html = read('../../../../rve-meta/index.html');
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', checked: false, hidden: false, disabled: false, innerHTML: '', textContent: '',
    addEventListener() {}
  }]));
  const exports = Array.from({ length: 5 }, () => ({ disabled: false, addEventListener() {} }));
  const document = {
    getElementById: id => nodes.get(id) || null,
    querySelectorAll: selector => selector === '#alm-export-mount button' ? exports : []
  };
  nodes.get('src').value = csv(inputs.intercept);
  nodes.get('f-rho').value = '0.8';
  const context = vm.createContext({ document, AlmRVE: RVE, AlmRVEExtras: E });
  context.window = context;
  const controller = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function friendlyEngineError'));
  assert.ok(controller, 'real page controller found');
  vm.runInContext(controller, context);
  assert.equal(typeof context.__almLastRVE, 'function', 'control fit initially succeeds');
  return {
    run(rows, rho = 0.8) {
      nodes.get('src').value = csv(rows);
      nodes.get('f-rho').value = String(rho);
      context.__almRveRun();
      assert.equal(context.__almLastRVE, null, 'failed fit clears the prior result');
      assert.equal(nodes.get('coef-body').innerHTML, '');
      assert.ok(exports.every(b => b.disabled), 'failed fit disables exports');
      assert.equal(nodes.get('btn-rho-sens').disabled, true);
      return nodes.get('meta-row').innerHTML;
    }
  };
}

test('plant P15-R5: one effect reports insufficient clusters with the fitted count', () => {
  const e = refusal(inputs.single);
  assert.match(e.message, /m<=p.*insufficient clusters/i);
  assert.equal(e.m_clusters, 1);
  assert.doesNotMatch(e.message, /singular/i);
});

test('plant P15-R5: one-effect page explains the cluster requirement without predictor-removal advice', () => {
  const message = page().run(inputs.single);
  assert.match(message, /1 cluster cannot support 1 coefficient/);
  assert.match(message, /more clusters than coefficients/);
  assert.match(message, /add.*clusters/i);
  assert.doesNotMatch(message, /collinear|remove.*predictor|undefined/i);
});

for (const method of ['CR1', 'CR2']) {
  test(`control: ${method} single-effect refusal with finite overridden weights retains m=1`, () => {
    const e = refusal(inputs.single, { method, tau2: 0 });
    assert.match(e.message, /m<=p/);
    assert.equal(e.m_clusters, 1);
  });

  test(`plant P15-R5: ${method} overflowing initial weights are not called collinearity`, () => {
    const rows = inputs.intercept.map(r => ({ ...r, vi: 1e-310 }));
    const e = refusal(rows, { method });
    assert.match(e.message, /non-finite.*weights/i);
    assert.doesNotMatch(e.message, /singular|m<=p/i);
  });

  test(`plant P15-R5: ${method} zero reweighted weights are not called collinearity`, () => {
    const rows = inputs.intercept.map(r => ({ ...r, vi: 1e308 }));
    const e = refusal(rows, { method, tau2: 1e308 });
    assert.match(e.message, /non-positive.*weights/i);
    assert.doesNotMatch(e.message, /singular|m<=p/i);
  });
}

test('plant P15-R5: page identifies unusable weights and sampling variances', () => {
  const message = page().run(inputs.intercept.map(r => ({ ...r, vi: 1e-310 })));
  assert.match(message, /weights/i);
  assert.match(message, /sampling variances/i);
  assert.doesNotMatch(message, /collinear|remove.*predictor/i);
});

test('control: genuinely collinear predictors retain the engine and page diagnosis', () => {
  assert.match(refusal(inputs.collinear).message, /singular/i);
  const message = page().run(inputs.collinear);
  assert.match(message, /predictors are collinear/);
  assert.match(message, /Remove or recode a predictor/);
});

test('control: finite full-rank m=p fit retains the cluster guard', () => {
  const rows = inputs.intercept.map((r, i) => ({ ...r, cluster: i < 3 ? 'A' : 'B', X: [1, i < 3 ? 1 : 0] }));
  const e = refusal(rows, { tau2: 0 });
  assert.match(e.message, /m<=p/);
  assert.equal(e.m_clusters, 2);
});

for (const name of ['minimal-complex', 'complex']) {
  test(`control: ${name} eigen refusal still precedes the cluster guard`, () => {
    const f = eigenFixture(name);
    assert.ok(new Set(f.input.rows.map(r => r.cluster)).size <= f.input.rows[0].X.length);
    assert.equal(refusal(f.input.rows, { rho: f.input.rho }).message, f.R.reason);
    assert.match(page().run(f.input.rows, f.input.rho), /complex eigenvalues/);
  });
}

test('control: fresh R fixture records the inputs, versions and refused designs', () => {
  const ref = reference();
  for (const key of ['R', 'robumeta', 'jsonlite']) assert.ok(ref.provenance[key]);
  assert.equal(ref.provenance.input_md5, createHash('md5').update(read('./p15-r5-input.json').replace(/\r\n/g, '\n')).digest('hex'));
  for (const [name, rows] of Object.entries(inputs)) assert.deepEqual(ref.cases[name].input.rows, rows);
  for (const name of ['single', 'collinear', 'minimal-complex', 'complex']) {
    assert.equal(ref.cases[name].result.status, 'refused', name);
    assert.ok(ref.cases[name].result.reason);
  }
  for (const name of ['minimal-complex', 'complex']) {
    assert.equal(refusal(ref.cases[name].input.rows, { rho: ref.cases[name].input.rho }).message,
      ref.cases[name].result.reason);
  }
});

for (const name of ['intercept', 'eigen']) {
  test(`control: accepted ${name} CR2 fit matches fresh robumeta at the unchanged 1e-9 gate`, () => {
    const ref = reference().cases[name];
    assert.equal(ref.result.status, 'accepted');
    const fit = RVE.fitCORR(ref.input.rows, { rho: ref.input.rho });
    const near = (a, b, label, absolute = false) => assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
      Math.abs(a - b) <= 1e-9 * (absolute ? 1 : Math.max(1, Math.abs(b))), `${label}: JS=${a}, R=${b}`);
    near(fit.tau2, ref.result.tau2, 'tau2');
    const summary = RVE.summary(fit);
    assert.equal(summary.length, ref.result.table.length);
    summary.forEach((s, i) => {
      for (const [js, r] of Object.entries({ estimate: 'b.r', se: 'SE', t: 't', df: 'dfs', p: 'prob', ci_lo: 'CI.L', ci_hi: 'CI.U' })) {
        near(s[js], ref.result.table[i][r], `${js}[${i}]`, ['p', 'ci_lo', 'ci_hi'].includes(js));
      }
    });
  });
}
