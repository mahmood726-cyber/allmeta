// New (from IPD-QMA): quantile meta-analysis — HTE across the outcome distribution.
import { test, expect } from "@playwright/test";

test("quantile MA pools QTE per quantile and Wald-tests a flat profile", async ({ page }) => {
  await page.goto("/quantile-ma/index.html");
  expect(await page.evaluate(() => !!(window.AlmQuantileMA && window.AlmMaCore))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almQuantileMA.run());
  expect(r.ok).toBe(true);
  expect(r.profile.length).toBe(5);
  // the example QTE grows across quantiles -> non-flat profile -> HTE
  expect(r.hte).toBe(true);
  expect(r.wald.p).toBeLessThan(0.05);

  await expect(page.locator("#result")).toContainText(/HTE|profile/i);
  await expect(page.locator("#result table")).toBeVisible();
  await expect(page.locator("#plot svg")).toBeVisible();
});
