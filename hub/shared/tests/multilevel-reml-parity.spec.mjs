/**
 * R-parity for the three-level (multilevel) REML engine (shared/multilevel-reml.js) vs
 * metafor::rma.mv(yi, vi, random = ~ 1 | district/school, method="REML") on
 * dat.konstantopoulos2011 (56 effect sizes, 11 districts). The marginal covariance is
 * block-diagonal by cluster (σ²₃·11ᵀ + diag(σ²₂+v_i)); μ by GLS, (σ²₂,σ²₃) by REML,
 * each block inverted in closed form via Sherman-Morrison. metafor references:
 *   μ=0.1847131637  SE=0.0845559188
 *   σ²(district)=0.0650619443  σ²(school)=0.0327365170   REML logLik=-7.9587240337
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = 'http://localhost:8088/multilevel-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const KON = JSON.parse(readFileSync(new URL('./_kon_data.json', import.meta.url), 'utf-8'));
const ROWS = KON.map(r => ({ cluster: r.district, y: r.yi, v: r.vi }));

test('three-level REML matches metafor::rma.mv (Konstantopoulos 2011)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmMultilevelREML, { timeout: 10000 });
  const f = await page.evaluate((rows) => window.AlmMultilevelREML.fit(rows), ROWS);
  expect(f.k).toBe(56); expect(f.nClusters).toBe(11);
  expect(f.mu).toBeCloseTo(0.1847131637, 5);
  expect(f.se).toBeCloseTo(0.0845559188, 5);
  expect(f.sigma2Between).toBeCloseTo(0.0650619443, 5);
  expect(f.sigma2Within).toBeCloseTo(0.0327365170, 5);
  expect(f.logLik).toBeCloseTo(-7.9587240337, 4);
  expect(errs, 'no console errors').toEqual([]);
});

test('multilevel-ma app surfaces the exact REML block', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almReml === 'function', { timeout: 10000 });
  await page.click('#btn-run');
  await page.waitForFunction(() => window.__almReml() && typeof window.__almReml().sigma2Between === 'number', { timeout: 8000 });
  const r = await page.evaluate(() => window.__almReml());
  expect(r.sigma2Between).toBeGreaterThanOrEqual(0);
  expect(r.sigma2Within).toBeGreaterThanOrEqual(0);
  expect(await page.locator('#summary').textContent()).toMatch(/REML/);
});
