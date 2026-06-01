/**
 * R-parity for RMST meta-analysis (pooling RMST differences via ma-core) vs
 * metafor::rma(yi = rmst_diff, sei, method="REML") on
 * yi=c(1.2,0.8,2.1,0.5,1.5,1.0), sei=c(.40,.50,.60,.45,.55,.30):
 *   pooled=1.08304945 se=0.17573202 ci=[0.73862102,1.42747788] tau2=6.11e-6.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/rmst-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('RMST pooling matches metafor::rma(REML)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastRMST === 'function' && window._almLastRMST(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastRMST());
  expect(o.k).toBe(6);
  expect(o.mu).toBeCloseTo(1.08304945, 5);
  expect(o.se).toBeCloseTo(0.17573202, 5);
  // CI bounds to ~1e-4: τ²≈6e-6 sits on the REML boundary where ma-core vs metafor differ ~1e-5.
  expect(o.ciLo).toBeCloseTo(0.73862102, 4);
  expect(o.ciHi).toBeCloseTo(1.42747788, 4);
  expect(o.piLo).toBeLessThan(o.mu); expect(o.piHi).toBeGreaterThan(o.mu);
  expect(errs, 'no console errors').toEqual([]);
});
