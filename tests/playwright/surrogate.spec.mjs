// New differentiator (from glp1-obesity-mbnma): trial-level surrogate validation.
import { test, expect } from "@playwright/test";

test("surrogate validation computes adjusted R², STE, and a scatter", async ({ page }) => {
  await page.goto("/surrogate-validation/index.html");
  expect(await page.evaluate(() => !!(window.AlmSurrogate && window.AlmSurrogate.analyze))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almSurrogate.run());
  expect(r.ok).toBe(true);
  expect(r.k).toBe(6);
  expect(r.pearson).toBeGreaterThan(0);     // weight loss tracks MACE benefit
  expect(typeof r.ste).toBe("number");

  await expect(page.locator("#result")).toContainText(/R²/);
  await expect(page.locator("#plot svg")).toBeVisible();

  // degenerate case (final effects don't vary) → adjusted R² refused
  const deg = await page.evaluate(() => {
    document.getElementById("f-data").value =
      "a,-12,-0.21,0.1\nb,-8,-0.20,0.1\nc,-15,-0.22,0.1\nd,-5,-0.19,0.1\ne,-10,-0.205,0.1";
    return window.__almSurrogate.run();
  });
  expect(deg.adj_degenerate).toBe(true);
  expect(deg.r2_adj).toBe(null);
  await expect(page.locator("#result")).toContainText(/UNDETERMINED|refused/i);
});
