// Regression for shared/bma-tau.js against R bayesmeta 3.5 (exact tau posterior, cond.moment, quadrature).
// Run: node --test hub/shared/tests/bma-tau-exact.node.cjs
// Defects this guards against (all present at 72fe82d):
//  1. Simpson rule on a tau^2 grid dropped the integrable 1/(2 tau) singularity at tau^2 = 0 and truncated the
//     support at 25 var(y) + 0.5, biasing weights, per-prior means and SDs by up to ~1e-1 relative;
//  2. the "posterior mode" of tau^2 was the first non-zero grid node when the true mode is 0;
//  3. the 95% CrI was mean +/- 1.96 SD of the mixture, not its 2.5% / 97.5% quantiles;
//  4. with k = 2 and a half-Cauchy or inverse-gamma prior the posterior SD of mu does not exist (flat mu prior),
//     but a finite number was reported.
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const BMA = require(path.resolve(__dirname, '../../../shared/bma-tau.js'));

const TOL = 1e-6;
const near = (got, want, what) =>
  assert.ok(Math.abs(got - want) <= TOL * Math.max(1, Math.abs(want)), `${what}: got ${got}, bayesmeta ${want}`);

// Reference values: R 4.6.0, bayesmeta 3.5 (see the P47 validation archive, refs/oracle.json, B_k5 and B_k2).
const K5 = { y: [0.42, 0.18, 0.55, 0.30, 0.12], vi: [0.01, 0.0196, 0.04, 0.0081, 0.0049],
  models: {
    'halfNormal(0.5)':    { w: 0.343236224940232, mu: 0.28516490904264, sd: 0.1083822665111, mode: 0 },
    'halfNormal(1.0)':    { w: 0.184999278977879, mu: 0.286382770024026, sd: 0.120547944659047, mode: 0 },
    'halfCauchy(0.5)':    { w: 0.259641112479359, mu: 0.28452883211912, sd: 0.10753201500195, mode: 0 },
    'halfCauchy(1.0)':    { w: 0.144379905820743, mu: 0.286050421465106, sd: 0.118658183342818, mode: 0 },
    'invGamma(0.1, 0.1)': { w: 0.019849423315766, mu: 0.30228580077292, sd: 0.18247343732957, mode: 0.0498537323589018 },
    'uniform(5)':         { w: 0.0478940544660216, mu: 0.28695330066532, sd: 0.134597995957425, mode: 0 } },
  bma: { mu: 0.285778404079486, sd: 0.115282504821498, lo: 0.0727912366070544, hi: 0.52898780209152 } };

test('bma-tau k = 5: per-prior weights, moments, tau^2 modes and BMA summary match bayesmeta', () => {
  const r = BMA.fit(K5.y, K5.vi, BMA.defaultModels());
  assert.equal(r.ok, true);
  for (const m of r.perModel) {
    const R = K5.models[m.name];
    near(m.weight, R.w, m.name + ' weight'); near(m.muHat, R.mu, m.name + ' mean');
    near(m.sePost, R.sd, m.name + ' sd'); near(m.tau2_mode, R.mode, m.name + ' tau2 mode');
  }
  near(r.muHat, K5.bma.mu, 'BMA mean'); near(r.sePost, K5.bma.sd, 'BMA sd');
  near(r.ci_lo, K5.bma.lo, 'BMA 2.5%'); near(r.ci_hi, K5.bma.hi, 'BMA 97.5%');
});

test('bma-tau k = 2: posterior SD does not exist for heavy-tailed priors; quantile CrI still exact', () => {
  const r = BMA.fit([0.10, 0.60], [0.0225, 0.04], BMA.defaultModels());
  const by = Object.fromEntries(r.perModel.map((m) => [m.name, m]));
  for (const n of ['halfCauchy(0.5)', 'halfCauchy(1.0)', 'invGamma(0.1, 0.1)'])
    assert.ok(!Number.isFinite(by[n].sePost), n + ' sd must be non-finite, got ' + by[n].sePost);
  near(by['halfNormal(0.5)'].sePost, 0.353487815910888, 'halfNormal(0.5) sd');
  near(by['uniform(5)'].sePost, 1.46459965064714, 'uniform(5) sd');
  near(by['halfCauchy(0.5)'].weight, 0.201567527238228, 'halfCauchy(0.5) weight');
  near(by['invGamma(0.1, 0.1)'].tau2_mode, 0.0914818841942651, 'invGamma tau2 mode');
  assert.ok(!Number.isFinite(r.sePost), 'BMA sd must be non-finite');
  near(r.muHat, 0.333774937694641, 'BMA mean');
  near(r.ci_lo, -1.19639788889891, 'BMA 2.5%'); near(r.ci_hi, 1.89419110435536, 'BMA 97.5%');
});

test('bma-tau k = 3, inverse-gamma(0.1, 0.1): slowly decaying tail (tau^-1.2) of the second moment is integrated', () => {
  // E[tau^2] converges only slowly; nodes with negligible posterior weight but huge tau^2 still carry the variance.
  const r = BMA.fit([0.05, 0.40, 0.25], [0.0144, 0.0324, 0.01], BMA.defaultModels());
  const ig = r.perModel.find((m) => m.name === 'invGamma(0.1, 0.1)');
  near(ig.sePost, 0.686834685371311, 'invGamma sd (k = 3)');
  near(r.sePost, 0.283572619836554, 'BMA sd (k = 3)');
});

test('bma-tau: uniform prior keeps the tau^2 = 0 guard (2026-05-29 regression)', () => {
  assert.equal(BMA.uniform(5)(0), 0);
});

test('bma-tau: posterior mode of tau^2 is not capped at the search ceiling (review finding)', () => {
  // y = -100, 100, v = 1, 1, invGamma(0.1, 0.1) on tau^2: the tau^2-scale posterior mode is 6248.375 (R optimize of
  // the same flat-mu marginal posterior, tol 1e-12: 6248.37522135). The scan used to stop at tau^2 = 100.
  const f = BMA.fitModel([-100, 100], [1, 1], BMA.invGamma(0.1, 0.1));
  assert.ok(Math.abs(f.tau2_post_mode - 6248.37522135) < 1e-4 * 6248.37522135, 'mode ' + f.tau2_post_mode);
});
