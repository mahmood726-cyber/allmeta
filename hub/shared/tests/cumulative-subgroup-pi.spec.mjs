/**
 * cumulative-subgroup overall prediction interval (Phase 3 of universal PIs). The PI
 * math (t_{k-1}, Cochrane v6.5) is R-verified in ma-core-parity.spec.mjs; here we guard
 * that the app wires AlmMaCore.predictionInterval correctly into its overall pool: the
 * PI is present, brackets the point estimate, and is strictly WIDER than the 95% CI
 * (since √(τ²+SE²) ≥ SE and t_{k-1} ≥ z).
 */
import { test, expect } from '@playwright/test';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('cumulative-subgroup overall PI present, brackets μ, wider than CI', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8088/cumulative-subgroup/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastCumSub === 'function', { timeout: 10000 });
  // Switch to the subgroup view (which reports the overall pool + PI) and re-render.
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => window._almLastCumSub());
  expect(o.overall_pi_lo, 'PI present').not.toBeNull();
  expect(o.overall_pi_lo).toBeLessThan(o.overall_mu);
  expect(o.overall_pi_hi).toBeGreaterThan(o.overall_mu);
  expect(o.overall_pi_lo).toBeLessThan(o.overall_lo); // wider than CI lower
  expect(o.overall_pi_hi).toBeGreaterThan(o.overall_hi); // wider than CI upper
  expect(errs, 'no console errors').toEqual([]);
});
