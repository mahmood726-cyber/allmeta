// proportion-ma degenerate inputs (edge-case R sweep, 2026-10-31). k = 1 must refuse with a reason and leave NO numbers from
// the previous analysis on the page (heterogeneity line, forest plot); identical studies (tau2 = 0, Q = 0) must give a
// t_{k-1} prediction interval that is wider than the z confidence interval (a PI equal to the CI is always wrong).
// The k = 2..3, identical, huge-weight, zero-cell and all-zero/all-full cases were run through validate/adapter.js's R script
// (metafor 5.2-1) and matched at the adapter tolerance; they are covered by the validate corpus and need no extra pins.
// Run: npx playwright test -c playwright.features.config.mjs features-edge-proportion-ma.spec.mjs
import { test, expect } from '@playwright/test';

const PAGE = '/proportion-ma/index.html';

test('EDGE: k = 1 refuses and clears every number of the previous analysis', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await expect(page.locator('#het')).toContainText('Q =');
  await page.locator('#src').fill('5,40,A');
  await page.locator('#btn-run').click();
  await expect(page.locator('#res-body')).toContainText('Need at least 2 studies.');
  await expect(page.locator('#het')).toHaveText('');
  expect(await page.locator('#forest').evaluate(svg => svg.children.length)).toBe(0);
  expect(await page.evaluate(() => window._almLastPropMA())).toBeNull();
  // A valid analysis afterwards renders again.
  await page.locator('#src').fill('5,40,A\n9,60,B\n14,75,C');
  await page.locator('#btn-run').click();
  await expect(page.locator('#het')).toContainText('Q =');
  expect(await page.locator('#forest').evaluate(svg => svg.children.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('EDGE: identical studies give tau2 = 0 and a prediction interval wider than the CI', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('#src').fill('10,100,A\n10,100,B\n10,100,C\n10,100,D');
  await page.locator('#btn-run').click();
  const v = await page.evaluate(() => window._almLastPropMA());
  expect(v.tau2).toBe(0);
  expect(v.Q).toBeLessThan(1e-12);
  expect(v.poolPiLo).toBeLessThan(v.poolLo - 1e-6);
  expect(v.poolPiHi).toBeGreaterThan(v.poolHi + 1e-6);
});
