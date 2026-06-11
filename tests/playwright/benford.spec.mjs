// New (from BenfordMA): first-digit data-integrity screen.
import { test, expect } from "@playwright/test";

test("Benford screen flags near-uniform first digits and passes Benford-like data", async ({ page }) => {
  await page.goto("/benford-screen/index.html");
  expect(await page.evaluate(() => !!window.AlmBenford)).toBe(true);

  // anomalous (near-uniform first digits) -> nonconformity flag
  await page.click("#btn-example-anom");
  const a = await page.evaluate(() => window.__almBenford.run());
  expect(a.ok).toBe(true);
  expect(a.anomalous).toBe(true);
  expect(a.chi2p).toBeLessThan(0.05);
  await expect(page.locator("#result")).toContainText(/DEVIATES/i);
  await expect(page.locator("#plot svg")).toBeVisible();

  // Benford-conforming example -> not anomalous
  await page.click("#btn-example");
  const b = await page.evaluate(() => window.__almBenford.run());
  expect(b.ok).toBe(true);
  expect(b.n).toBeGreaterThan(100);
  expect(b.anomalous).toBe(false);
  await expect(page.locator("#result")).toContainText(/consistent with Benford/i);
});
