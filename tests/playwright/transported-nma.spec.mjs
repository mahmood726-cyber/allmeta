// New (from nmatransport): population-transported network meta-analysis.
import { test, expect } from "@playwright/test";

test("transported NMA reweights to a target population and reports ESS + ranking shift", async ({ page }) => {
  await page.goto("/transported-nma/index.html");
  expect(await page.evaluate(() => !!(window.AlmTransportedNMA && window.AlmMultiplicativeNMA && window.AlmMaCore))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almTransportedNMA.run());
  expect(r.ok).toBe(true);
  expect(r.transport.converged).toBe(true);
  // target age=72 sits at the older extreme -> some ESS loss (< full information)
  expect(r.transport.essRatio).toBeLessThan(1.0);
  expect(r.shifts.length).toBe(3);
  // achieved weighted mean matches the target exactly
  expect(Math.abs(r.transport.achieved.age - 72)).toBeLessThan(1e-4);

  await expect(page.locator("#result")).toContainText(/Effective sample size/i);
  await expect(page.locator("#ranks table")).toBeVisible();
  await expect(page.locator("#league table")).toBeVisible();
});
