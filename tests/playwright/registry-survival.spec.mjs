// New differentiator (from registry-ipd): registry-native pseudo-IPD —
// reconstruct survival IPD from CT.gov/AACT tables, no figure, tiered + fail-closed.
import { test, expect } from "@playwright/test";

test("registry-native survival reconstructs tiers and fails closed at Tier C", async ({ page }) => {
  await page.goto("/registry-survival/index.html");
  const ready = await page.evaluate(() => ({
    eng: !!(window.RIPD && window.RIPD.reconstruct),
    ex: !!(window.RIPD_EXAMPLES && window.RIPD_EXAMPLES.tierA),
  }));
  expect(ready).toEqual({ eng: true, ex: true });

  // Tier A → exportable pseudo-IPD + a reconstructed KM curve
  await page.click("#btn-ex-a");
  const a = await page.evaluate(() => window.__almRegistryIpd.run());
  expect(a.tier).toBe("A");
  expect(a.exportable).toBe(true);
  expect(a.arms.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#verdict-box")).toContainText("Tier A");
  await expect(page.locator("#km svg").first()).toBeVisible();
  // survival summary (RMST + median + RMST difference) from the pseudo-IPD
  await expect(page.locator("#surv-summary")).toContainText(/RMST/);
  await expect(page.locator("#surv-summary")).toContainText(/RMST difference/);

  // Tier C → refused, fail-closed (no fabricated IPD)
  await page.click("#btn-ex-c");
  const c = await page.evaluate(() => window.__almRegistryIpd.run());
  expect(c.tier).toBe("C");
  expect(c.exportable).toBe(false);
  await expect(page.locator("#verdict-box")).toContainText(/Refused|insufficient/i);

  // Competing-risks mode → Aalen-Johansen CIF panel, naive 1−KM over-estimates
  await page.click("#btn-ex-cr");
  const cr = await page.evaluate(() => window.__almRegistryIpd.run());
  expect(cr.competing_risks).toBe(true);
  expect(cr.arms[0].cif.length).toBeGreaterThan(0);
  await expect(page.locator("#cif-panel")).toBeVisible();
  await expect(page.locator("#cif")).toContainText("Aalen-Johansen");
  await expect(page.locator("#cif svg").first()).toBeVisible();
});
