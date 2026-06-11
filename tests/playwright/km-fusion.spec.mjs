// NAR fusion (integrated from registry-ipd): km-reconstructor accepts exact
// registry anchors, fuses them with the digitized curve, and shows the
// provenance-aware reliability tier.
import { test, expect } from "@playwright/test";

test("km-reconstructor fuses registry anchors + at-risk table and tiers the regime", async ({ page }) => {
  await page.goto("/km-reconstructor/index.html");
  expect(await page.evaluate(() => !!(window.AlmKmFusion && window.AlmKmFusion.fuseCurve))).toBe(true);

  // default (digitized + at-risk) → Tier B
  await page.click("#btn-run");
  await expect(page.locator("#km-tier")).toContainText("tier B");

  // switch to fusion → anchors input appears, Tier A
  await page.selectOption("#curve-source", "fusion");
  await expect(page.locator("#anchors-wrap")).toBeVisible();
  await expect(page.locator("#km-tier")).toContainText("tier A");
  await expect(page.locator("#km-tier")).toContainText("FUSION");

  const r1 = await page.evaluate(() => window.__almLastKM());
  expect(r1.curve_source).toBe("fusion");
  expect(r1.reconstruction_tier).toBe("A");
  expect(r1.n_reconstructed).toBeGreaterThan(0);

  // registry anchors but emptying the at-risk table → Tier C flag (censoring unidentified)
  await page.selectOption("#curve-source", "registry");
  await page.fill("#risk", "0, 200");          // <2 points → no at-risk identification
  await page.click("#btn-run");
  await expect(page.locator("#km-tier")).toContainText("tier C");
  await expect(page.locator("#km-tier")).toContainText(/censoring/i);
});
