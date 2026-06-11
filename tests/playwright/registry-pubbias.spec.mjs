// New differentiator (from glp1-obesity-mbnma): registry-aware publication bias
// — measure the missing-evidence shift directly + disambiguate Egger asymmetry.
import { test, expect } from "@playwright/test";

test("registry pubbias measures the ghost shift and flags spurious asymmetry", async ({ page }) => {
  await page.goto("/registry-pubbias/index.html");
  const ready = await page.evaluate(() => !!(window.AlmRegistryPubbias && window.AlmMaCore && window.AlmEgger));
  expect(ready).toBe(true);

  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almRegistryPubbias.run());
  expect(r.ok).toBe(true);
  // Egger flags asymmetry but the observed ghost barely moves the pool -> spurious
  expect(r.eggerAsymmetry).toBe(true);
  expect(r.classification).toBe("spurious-asymmetry");
  expect(Math.abs(r.measuredShift)).toBeLessThan(0.5);
  await expect(page.locator("#result")).toContainText(/spurious/i);
  await expect(page.locator("#result")).toContainText("Measured shift");

  // remove the ghost -> inference-only
  const inf = await page.evaluate(() => { document.getElementById("f-ghost").value = ""; return window.__almRegistryPubbias.run(); });
  expect(inf.classification).toBe("inference-only");
  expect(inf.hasGhostData).toBe(false);
});
