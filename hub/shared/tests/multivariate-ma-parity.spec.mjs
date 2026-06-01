/**
 * R-parity for multivariate / multiple-outcome meta-analysis (shared/multivariate-ma.js) vs
 * metafor::rma.mv(yi, V, mods=~outcome-1, random=~outcome|trial, struct="UN", method="REML")
 * on dat.berkey1998 (5 periodontal trials, 2 correlated outcomes PD & AL, with within-study
 * covariance). Outcomes ordered [AL, PD] to match metafor's alphabetical factor levels:
 *   μ = (-0.3567543553, 0.3567947972)  SE = (0.0817510871, 0.0597050546)
 *   G diag (τ²) = (0.0311744793, 0.0121786270)  between-study ρ = 0.4567653812
 *   REML logLik = 3.7518022064
 * Pure-JS mvmeta: μ by GLS, unstructured G by Cholesky-parameterised Nelder-Mead REML.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/multivariate-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

// Berkey rows per trial: PD then AL. v1=variance of that outcome; cov is on the PD row.
const PD_y = [0.47, 0.20, 0.40, 0.26, 0.56], PD_v = [0.0075, 0.0057, 0.0021, 0.0029, 0.0148];
const AL_y = [-0.32, -0.60, -0.12, -0.31, -0.39], AL_v = [0.0030, 0.0009, 0.0007, 0.0009, 0.0072];
const COV = [0.0030, 0.0009, 0.0007, 0.0009, 0.0072];
// order [AL, PD]
const STUDIES = PD_y.map((_, t) => ({ y: [AL_y[t], PD_y[t]], S: [[AL_v[t], COV[t]], [COV[t], PD_v[t]]] }));

test('multivariate MA matches metafor::rma.mv (Berkey 1998)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmMultivariate, { timeout: 10000 });
  const f = await page.evaluate((studies) => window.AlmMultivariate.fit(studies), STUDIES);

  expect(f.k).toBe(5); expect(f.m).toBe(2);
  expect(f.mu[0]).toBeCloseTo(-0.3567543553, 5);
  expect(f.mu[1]).toBeCloseTo(0.3567947972, 5);
  expect(f.muSE[0]).toBeCloseTo(0.0817510871, 5);
  expect(f.muSE[1]).toBeCloseTo(0.0597050546, 5);
  expect(f.G[0][0]).toBeCloseTo(0.0311744793, 5);
  expect(f.G[1][1]).toBeCloseTo(0.0121786270, 5);
  expect(f.rho).toBeCloseTo(0.4567653812, 4);
  expect(f.logLik).toBeCloseTo(3.7518022064, 4);
  expect(errs, 'no console errors').toEqual([]);
});

test('multivariate-ma app renders + exposes accessor', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastMultivariate === 'function' && window._almLastMultivariate(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastMultivariate());
  expect(o.mu).toHaveLength(2);
  expect(o.rho).toBeGreaterThan(0);
  expect(await page.locator('#plot-host svg').count()).toBe(1);
});
