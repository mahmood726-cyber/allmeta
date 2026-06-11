// CMA-style leave-one-out sensitivity in the Forest-plot app: click a study to
// drop it, the pooled estimate recomputes live; a per-study leave1out table.
import { test, expect } from "@playwright/test";

const APP = "/forest-plot/index.html";

test("leave-one-out: drop a study and the pooled estimate updates live", async ({ page }) => {
  await page.goto(APP);
  await page.click("#btn-example");                         // 6-study logOR demo

  // open the panel
  await page.click("#btn-loo");
  await expect(page.locator("#btn-loo")).toHaveText(/Hide leave-one-out/);
  const before = await page.evaluate(() => window.__almLOO());
  expect(before.open).toBe(true);
  expect(before.kBase).toBe(6);
  expect(before.keptK).toBe(6);                             // nothing dropped yet
  // current == baseline before any drop
  expect(Math.abs(before.currentMu - before.baselineMu)).toBeLessThan(1e-9);

  // the leave1out table has one clickable row per study
  await expect(page.locator("#loo-host table.loo-table tbody tr.study")).toHaveCount(6);

  // click the first study row -> it drops, pooled recomputes on k=5
  await page.locator('#loo-host tr.study[data-loo-idx="0"]').click();
  await expect(page.locator('#loo-host tr.study[data-loo-idx="0"]')).toHaveClass(/dropped/);
  const after = await page.evaluate(() => window.__almLOO());
  expect(after.dropped).toEqual([0]);
  expect(after.keptK).toBe(5);
  expect(Math.abs(after.currentMu - before.baselineMu)).toBeGreaterThan(1e-9);   // estimate moved
  await expect(page.locator("#loo-host .loo-summary")).toContainText("dropping 1");

  // Reset restores all studies
  await page.locator("#loo-reset").click();
  const reset = await page.evaluate(() => window.__almLOO());
  expect(reset.keptK).toBe(6);
  expect(reset.dropped).toEqual([]);
});

test("leave-one-out drops reset when the study data changes, and don't touch the main bus result", async ({ page }) => {
  await page.goto(APP);
  await page.click("#btn-example");
  await page.click("#btn-loo");
  await page.locator('#loo-host tr.study[data-loo-idx="0"]').click();
  expect((await page.evaluate(() => window.__almLOO())).keptK).toBe(5);

  // the main results (exports/bus) are computed on ALL studies, unaffected by the LOO drop
  const main = await page.evaluate(() => window.__almResults());
  expect(main.k).toBe(6);

  // editing the data resets the drop set (indices would otherwise be stale)
  await page.fill("#f-data", "A, -0.2, 0.1\nB, -0.3, 0.12\nC, 0.05, 0.15");
  const afterEdit = await page.evaluate(() => window.__almLOO());
  expect(afterEdit.kBase).toBe(3);
  expect(afterEdit.dropped).toEqual([]);                   // reset on data change
});
