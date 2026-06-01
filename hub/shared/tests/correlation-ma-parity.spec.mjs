/**
 * R-parity for the correlation meta-analysis app (Fisher-z pooling via ma-core) vs
 * metafor::escalc(measure="ZCOR") |> rma(method="REML") on the built-in example
 * (r=c(.45,.30,.55,.20,.38,.62,.28,.50), n=c(40,55,30,80,65,25,90,45)):
 *   mu_z=0.39431258 se=0.05696240 tau2=0.00545528 I2=21.234129
 *   back r=0.37507210, CI(r)=[0.27537287, 0.46678898]
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/correlation-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('correlation-ma matches metafor escalc(ZCOR)+rma(REML)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastCorrMA === 'function' && window._almLastCorrMA(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastCorrMA());
  expect(o.k).toBe(8);
  expect(o.mu_z).toBeCloseTo(0.39431258, 5);
  expect(o.se_z).toBeCloseTo(0.05696240, 5);
  expect(o.tau2_z).toBeCloseTo(0.00545528, 5);
  expect(o.I2).toBeCloseTo(21.234129, 2);
  expect(o.r).toBeCloseTo(0.37507210, 5);
  expect(o.r_lo).toBeCloseTo(0.27537287, 5);
  expect(o.r_hi).toBeCloseTo(0.46678898, 5);
  // PI present on r-scale, brackets the pooled r, within (-1,1).
  expect(o.r_pi_lo).toBeLessThan(o.r); expect(o.r_pi_hi).toBeGreaterThan(o.r);
  expect(o.r_pi_lo).toBeGreaterThan(-1); expect(o.r_pi_hi).toBeLessThan(1);
  expect(errs, 'no console errors').toEqual([]);
});
