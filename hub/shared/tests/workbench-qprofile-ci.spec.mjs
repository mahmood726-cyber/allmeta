/**
 * R-parity for the shared Q-profile I²/τ² confidence interval (Viechtbauer 2007),
 * newly surfaced in workbench via shared/heterogeneity-ci.js. Ground truth from
 * metafor::confint on a DL fit:
 *
 *   yi  = c(0.10,0.30,0.50,0.20,0.90,0.40,1.10,0.05)
 *   sei = c(0.20,0.25,0.18,0.30,0.22,0.28,0.35,0.15)
 *   confint(rma(yi=yi, sei=sei, method="DL"))
 *     → τ² CI [0.0038, 0.5144], I² CI [7.09, 91.25]
 *
 * The CI is profiled from the generalised Q statistic against χ²_{k-1} quantiles,
 * so it is independent of which point τ² estimator the app uses (PM here). This
 * also locks the shared module as the single source of truth (it replaced the
 * code previously duplicated inline in heterogeneity + forest-plot).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/workbench/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>|ERR_CONNECTION_REFUSED/;

const STUDIES = [
  { est: 0.10, se: 0.20 }, { est: 0.30, se: 0.25 }, { est: 0.50, se: 0.18 },
  { est: 0.20, se: 0.30 }, { est: 0.90, se: 0.22 }, { est: 0.40, se: 0.28 },
  { est: 1.10, se: 0.35 }, { est: 0.05, se: 0.15 },
];
const META = { tau2Lo: 0.0038, tau2Hi: 0.5144, I2Lo: 7.09, I2Hi: 91.25 };

test('workbench Q-profile I²/τ² CI matches metafor::confint', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  const pool = await page.evaluate((s) => window.__almWorkbench(s), STUDIES);
  console.log('  workbench CI:', JSON.stringify({ tau2Lo: pool.tau2Lo, tau2Hi: pool.tau2Hi, I2Lo: pool.I2Lo, I2Hi: pool.I2Hi }));

  expect(pool.tau2Lo).toBeCloseTo(META.tau2Lo, 3);
  expect(pool.tau2Hi).toBeCloseTo(META.tau2Hi, 3);
  expect(pool.I2Lo).toBeCloseTo(META.I2Lo, 1);   // ≤0.05pp from the τ²→I² mapping
  expect(pool.I2Hi).toBeCloseTo(META.I2Hi, 1);
  expect(errors, 'no console errors').toEqual([]);
});

test('shared AlmHetCI: homogeneous data clamps lower bounds to 0', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => window.AlmHetCI.qProfileCI([
    { est: 0.20, v: 0.04 }, { est: 0.21, v: 0.04 }, { est: 0.19, v: 0.04 },
    { est: 0.205, v: 0.04 }, { est: 0.195, v: 0.04 },
  ]));
  expect(r.tau2Lo).toBe(0);
  expect(r.I2Lo).toBe(0);
  expect(r.I2Hi).toBeGreaterThanOrEqual(r.I2Lo);
});

test('shared AlmHetCI: k<2 returns null', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => window.AlmHetCI.qProfileCI([{ est: 0.2, v: 0.04 }]));
  expect(r).toBeNull();
});
