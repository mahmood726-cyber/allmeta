// New differentiator (from glp1-obesity-mbnma literature arm): registry-vs-
// literature search completeness — what a literature-only search misses.
import { test, expect } from "@playwright/test";

test("search completeness computes miss rate and categorises misses", async ({ page }) => {
  await page.goto("/search-completeness/index.html");
  expect(await page.evaluate(() => !!(window.AlmSearchCompleteness && window.AlmSearchCompleteness.assess))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almSearchCompleteness.run());
  expect(r.ok).toBe(true);
  expect(r.n).toBe(6);
  expect(r.found).toBe(3);                 // 3 of the 6 linked PMIDs are in the search hits
  expect(r.missed).toBe(3);
  expect(r.sensitivity).toBeCloseTo(0.5, 6);
  expect(r.breakdown.ghost).toBe(1);       // NCT06041217 marked ghost
  expect(r.denominatorFactor).toBeCloseTo(2, 6);

  await expect(page.locator("#result")).toContainText("misses");
  await expect(page.locator("#result")).toContainText("Sensitivity");
  await expect(page.locator("#per-trial table")).toBeVisible();
  await expect(page.locator("#per-trial")).toContainText("ghost");
});
