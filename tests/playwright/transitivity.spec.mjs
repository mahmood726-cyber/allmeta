// New differentiator (from glp1-obesity-mbnma): transitivity screen +
// representativeness map for NMA generalisability.
import { test, expect } from "@playwright/test";

test("transitivity screens the network and maps representativeness", async ({ page }) => {
  await page.goto("/transitivity/index.html");
  expect(await page.evaluate(() => !!(window.AlmTransitivity && window.AlmTransitivity.assessTransitivity))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almTransitivity.run());

  // transitivity: BMI balanced, HbA1c flags the obesity/T2D mixing
  const byT = Object.fromEntries(r.transit.modifiers.map((m) => [m.name, m]));
  expect(byT["Baseline BMI"].status).toBe("ok");
  expect(byT["HbA1c (%)"].status).toBe("flag");
  expect(r.transit.flags).toBeGreaterThanOrEqual(1);

  // representativeness: % female (70 vs 52, sd 8 → std 2.25) flags
  const byR = Object.fromEntries(r.rep.modifiers.map((m) => [m.name, m]));
  expect(byR["% female"].status).toBe("flag");
  expect(byR["% female"].direction).toBe("over");

  // UI renders both verdicts + tables
  await expect(page.locator("#transit-out")).toContainText("transitivity");
  await expect(page.locator("#transit-out table")).toBeVisible();
  await expect(page.locator("#rep-out")).toContainText(/representative/i);
});
