// New differentiator (from glp1-obesity-mbnma): benefit-risk MCDA + SMAA + EVPI.
import { test, expect } from "@playwright/test";

test("benefit-risk MCDA computes SMAA rank-acceptability and EVPI", async ({ page }) => {
  await page.goto("/benefit-risk/index.html");
  expect(await page.evaluate(() => !!(window.AlmBenefitRisk && window.AlmBenefitRisk.analyze))).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almBenefitRisk.run());
  expect(r.ok).toBe(true);

  // P(best) is a probability distribution over treatments
  const sumP = r.smaa.reduce((a, s) => a + s.pBest, 0);
  expect(Math.abs(sumP - 1)).toBeLessThan(1e-9);
  expect(r.evpi).toBeGreaterThanOrEqual(0);
  // 3 treatments, tirzepatide (highest weight loss) should win most often
  expect(r.smaa.length).toBe(3);
  expect(r.smaa[0].id).toBe("Tirzepatide");

  // determinism: same seed -> identical EVPI on re-run
  const r2 = await page.evaluate(() => window.__almBenefitRisk.run());
  expect(r2.evpi).toBe(r.evpi);

  // UI renders the decision + bars
  await expect(page.locator("#summary")).toContainText("P(best)");
  await expect(page.locator("#summary")).toContainText("EVPI");
  expect(await page.locator("#smaa-bars .bar-row").count()).toBe(3);
  expect(await page.locator("#det-bars .bar-row").count()).toBe(3);
});
