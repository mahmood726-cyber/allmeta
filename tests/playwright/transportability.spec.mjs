// New differentiator (from glp1-obesity-mbnma): transport a meta-analytic
// effect to a target population via effect-modifier standardisation.
import { test, expect } from "@playwright/test";

test("transportability predicts the effect at a target modifier value", async ({ page }) => {
  await page.goto("/transportability/index.html");

  const ready = await page.evaluate(() => !!(window.AlmTransport && window.AlmTransport.transport && window.AlmMaCore));
  expect(ready).toBe(true);

  // load the example and read the computed transport
  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almTransport.run());
  expect(r.ok).toBe(true);
  expect(r.k).toBe(8);
  // effect modification by BMI: higher BMI -> more weight loss (slope < 0 on % change)
  expect(r.slope.est).toBeLessThan(0);
  // transporting to a LOWER BMI (31) attenuates the effect vs the trial mean (~36)
  expect(r.transported.est).toBeGreaterThan(r.atTrialMean.est);

  // the result + plot render
  await expect(page.locator("#result")).toContainText("Transported to");
  await expect(page.locator("#result")).toContainText(/slope/i);
  await expect(page.locator("#plot svg")).toBeVisible();

  // fail-closed UI: constant modifier is rejected
  const flat = await page.evaluate(() => {
    document.getElementById("f-data").value = "a,-0.2,0.1,5\nb,-0.1,0.1,5\nc,0,0.1,5";
    document.getElementById("f-target").value = "7";
    return window.__almTransport.run();
  });
  expect(flat).toBe(null); // run() returns null when transport not ok (no __lastTransport set)
  await expect(page.locator("#result")).toContainText(/constant/i);
});
