/**
 * R-parity for the RoBMA-style robust Bayesian MA (shared/robma.js) vs R's numerical
 * integration of the identical four effect×heterogeneity models (priors μ~N(0,1),
 * τ~Half-N(0,1)) on yi=c(.10,.30,.50,.20,.90,.40,1.10,.05), sei=c(.20,.25,.18,.30,.22,.28,.35,.15):
 *   marginal: H0FE=3.0263936e-7, H1FE=8.7430312e-4, H0RE=4.1773407e-4, H1RE=1.9427874e-3
 *   BF_effect=6.738859, BF_hetero=2.698955, E[μ|H1FE]=0.3520793.
 * (This is RoBMA's effect/heterogeneity sub-ensemble computed by quadrature; the full
 *  package adds publication-bias models via MCMC — offered as a downloadable R script.)
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/robma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const YI = [0.10, 0.30, 0.50, 0.20, 0.90, 0.40, 1.10, 0.05];
const SEI = [0.20, 0.25, 0.18, 0.30, 0.22, 0.28, 0.35, 0.15];

test('RoBMA-style model-averaging matches R numerical integration', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ yi, sei }) => window.AlmRoBMA.analysis(yi, sei), { yi: YI, sei: SEI });
  expect(r.marginal.H1FE).toBeCloseTo(8.7430312e-4, 9);
  expect(r.marginal.H0RE).toBeCloseTo(4.1773407e-4, 9);
  expect(r.marginal.H1RE).toBeCloseTo(1.9427874e-3, 8);
  expect(r.bfEffect).toBeCloseTo(6.738859, 3);
  expect(r.bfHetero).toBeCloseTo(2.698955, 3);
  expect(r.muH1FE).toBeCloseTo(0.3520793, 5);
  expect(r.pInclEffect).toBeGreaterThan(0);
  expect(r.pInclEffect).toBeLessThan(1);
  expect(errs, 'no console errors').toEqual([]);
});

test('robma app renders + R-deep-link script is well-formed', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastRoBMA === 'function' && window._almLastRoBMA(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastRoBMA());
  expect(o.k).toBe(8);
  const code = await page.evaluate(() => window.AlmRoBMA.buildRCode([0.1, 0.3], [0.2, 0.25]));
  expect(code).toContain('library(RoBMA)');
  expect(code).toContain('RoBMA(y = y, se = se');
});
