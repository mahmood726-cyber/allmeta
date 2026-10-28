import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadPageFunctions } from '../features-helpers.mjs';

const root = new URL('../../../../', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('../fixtures/multilevel-ci/reference.json', import.meta.url), 'utf8'));
const engine = loadPageFunctions(fileURLToPath(new URL('multilevel-ma/index.html', root)), ['fit'], {},
  ['shared/stats-qt.js', 'shared/ma-core.js'].map(path => fileURLToPath(new URL(path, root))));
const ctx = vm.createContext({});
ctx.window = ctx;
vm.runInContext(readFileSync(new URL('shared/multilevel-reml.js', root), 'utf8'), ctx);
const near = (actual, expected, key) => {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), key + ': finite values required');
  assert.ok(Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) < 1e-6,
    `${key}: ${actual} != ${expected}`);
};
function values(rows, fit = engine.fit) {
  const f = fit(rows);
  return { mu: f.mu, seMu: f.seMu, seMuHK: f.seMuHK,
    tau2_study: f.tau2_study, tau2_within: f.tau2_within,
    ci_lb_hk: f.mu - f.tCrit * f.seMuHK, ci_ub_hk: f.mu + f.tCrit * f.seMuHK,
    pi_lb: f.piLo, pi_ub: f.piHi };
}

// Execute the historical pooling defect, rather than only comparing saved R
// numbers. This is an in-memory plant, not a checkout of the unavailable base.
// The two substituted expressions are mlma_mom.R:51 and :54; all moment
// components, quantiles and prediction-interval code remain the shipped code.
const fitSource = engine.fit.toString();
const diagonalWeights = fitSource.replace(
  'var wFinal = covarianceWeights(tau2_within, tau2_study);',
  'var wFinal = rows.map(function (r) { return 1 / (r.se * r.se + tau2_within + tau2_study); });');
assert.notEqual(diagonalWeights, fitSource, 'diagonal-weight plant applied');
const diagonalSource = diagonalWeights.replace(
  /var qResidual = 0;[\s\S]*?var qStar = qResidual \/ dfHK;/,
  'var qStar = rows.reduce(function (sum, r, i) { return sum + wFinal[i] * (r.te - mu) * (r.te - mu); }, 0) / dfHK;');
assert.notEqual(diagonalSource, diagonalWeights, 'diagonal-residual plant applied');
const diagonalContext = vm.createContext({});
diagonalContext.window = diagonalContext;
for (const path of ['shared/stats-qt.js', 'shared/ma-core.js']) {
  vm.runInContext(readFileSync(new URL(path, root), 'utf8'), diagonalContext);
}
const diagonalFit = vm.runInContext('(' + diagonalSource + ')', diagonalContext);

for (const cfg of reference.configs) {
  const repeated = cfg.id === 'bundled' || cfg.id === 'tiny' || cfg.id === 'konstantopoulos';
  test(`multilevel R ${repeated ? 'plant: executable diagonal pooling is rejected' : 'control: executable diagonal pooling agrees'} / ${cfg.id}`, () => {
    const historical = values(cfg.rows, diagonalFit);
    for (const key of Object.keys(cfg.gls)) near(historical[key], cfg.legacy[key], key);
    if (repeated) {
      // Exactly the same finite-value/tolerance assertion used by the current
      // engine's R controls must fail on the planted historical uncertainty.
      assert.throws(() => near(historical.seMu, cfg.gls.seMu, 'seMu'), /seMu:/);
    } else {
      for (const key of Object.keys(cfg.gls)) near(historical[key], cfg.gls[key], key);
    }
  });
}

for (const cfg of reference.configs) {
  test(`multilevel R control: dense-covariance MoM / ${cfg.id}`, () => {
    const actual = values(cfg.rows);
    for (const [key, expected] of Object.entries(cfg.gls)) near(actual[key], expected, key);
    // The supplementary prediction interval must bracket its own MoM estimate and CI.
    assert.ok(actual.pi_lb < actual.mu && actual.pi_ub > actual.mu);
    assert.ok(actual.pi_lb <= actual.ci_lb_hk && actual.pi_ub >= actual.ci_ub_hk);
  });
  if (cfg.reml) {
    test(`multilevel R control: recommended REML / ${cfg.id}`, () => {
      const actual = ctx.AlmMultilevelREML.fit(cfg.rows.map(r => ({ cluster: r.study, y: r.te, v: r.se ** 2 })));
      for (const [key, expected] of Object.entries(cfg.reml)) near(actual[key], expected, key);
    });
    test(`multilevel R plant: diagonal MoM uncertainty is rejected / ${cfg.id}`, () => {
      assert.throws(() => near(cfg.legacy.seMu, cfg.gls.seMu, 'seMu'), /seMu:/);
    });
  } else {
    test(`multilevel R control: diagonal and covariance-aware pooling coincide / ${cfg.id}`, () => {
      for (const key of Object.keys(cfg.gls)) near(cfg.legacy[key], cfg.gls[key], key);
    });
  }
}
