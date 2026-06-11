// New (from UmbrellaEngine): umbrella-review overlap via Corrected Covered Area.
import { test, expect } from "@playwright/test";

test("umbrella overlap computes CCA + groove + pairwise matrix", async ({ page }) => {
  await page.goto("/umbrella-overlap/index.html");
  expect(await page.evaluate(() => !!(window.AlmUmbrellaOverlap && window.AlmUmbrellaOverlap.overlap))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almUmbrellaOverlap.run());
  expect(r.ok).toBe(true);
  expect(r.nReviews).toBe(4);
  expect(r.cca).toBeGreaterThan(0);
  expect(["Slight", "Moderate", "High", "Very High"]).toContain(r.groove);
  expect(r.sharedCount).toBeGreaterThan(0);

  await expect(page.locator("#result")).toContainText(/CCA|overlap/i);
  await expect(page.locator("#matrix table")).toBeVisible();

  // a hand-checked case via the engine in-page: CCA = (9-5)/(15-5) = 0.4
  const exact = await page.evaluate(() => window.AlmUmbrellaOverlap.overlap([
    { study_ids: ["s1", "s2", "s3"] }, { study_ids: ["s2", "s3", "s4"] }, { study_ids: ["s3", "s4", "s5"] },
  ]));
  expect(exact.cca).toBeCloseTo(0.4, 6);
  expect(exact.groove).toBe("Very High");
});
