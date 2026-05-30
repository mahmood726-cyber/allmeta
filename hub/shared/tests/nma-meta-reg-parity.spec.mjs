/**
 * R-parity for the network meta-regression engine vs
 * netmeta::netmetareg(assumption="independent") — the separate-slopes
 * (Cooper 2009 / NICE TSD3 independent treatment×covariate) model the app fits.
 *
 * On the app's example (ref=A, treatments A/B/C, τ²≈0), netmetareg gives:
 *   d[B]=+0.3775860, d[C]=+0.4106535 (at covariate=0)
 *   beta[B:cov]=-0.0009636, beta[C:cov]=+0.0012448
 *
 * The app and netmetareg produce the IDENTICAL fit to 7 dp, differing only by two
 * documented conventions: (1) sign — the app reports treatment2−treatment1 while
 * netmeta reports the reverse contrast, so every app coefficient is the exact
 * NEGATIVE of netmetareg's; (2) centring — the app centres the covariate at its
 * mean (=58) and predicts at any x, netmetareg reports at covariate=0. So the
 * app's prediction at x=0 must equal −d, and the app's slopes must equal −beta[:cov].
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/nma-meta-reg/index.html';

const RAW = [
  ['A', 'B', -0.30, 0.10, 50], ['A', 'B', -0.25, 0.12, 55], ['A', 'B', -0.40, 0.11, 45],
  ['A', 'B', -0.35, 0.10, 65], ['A', 'C', -0.45, 0.13, 50], ['A', 'C', -0.50, 0.12, 60],
  ['A', 'C', -0.48, 0.11, 70], ['B', 'C', -0.15, 0.14, 55], ['B', 'C', -0.20, 0.13, 60],
  ['A', 'B', -0.32, 0.10, 70],
];
// netmetareg coefficients (covariate=0); the app's values are the negatives.
const NMR = { dB: 0.3775860, dC: 0.4106535, bBcov: -0.0009636, bCcov: 0.0012448 };

test('nma-meta-reg matches netmeta::netmetareg (independent slopes; sign+centring)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((raw) => {
    const rows = raw.map(x => ({ trtA: x[0], trtB: x[1], yi: x[2], sei: x[3], covariate: x[4] }));
    const res = window.AlmNmaMetaReg.fit(rows, ['A', 'B', 'C'], { predictAt: [0] });
    const p0 = res.predictions[0].perTreatment;
    return {
      tau2: res.tau2,
      bAtZero: { B: p0.B.estimate, C: p0.C.estimate },
      gamma: { B: res.gamma.B.estimate, C: res.gamma.C.estimate },
    };
  }, RAW);
  console.log('  nma-meta-reg:', JSON.stringify(r));

  expect(r.tau2).toBeLessThan(1e-6);
  // App treatment effect at covariate=0 = −(netmetareg d).
  expect(r.bAtZero.B).toBeCloseTo(-NMR.dB, 5);
  expect(r.bAtZero.C).toBeCloseTo(-NMR.dC, 5);
  // App interaction slopes = −(netmetareg beta[:cov]).
  expect(r.gamma.B).toBeCloseTo(-NMR.bBcov, 6);
  expect(r.gamma.C).toBeCloseTo(-NMR.bCcov, 6);
});
