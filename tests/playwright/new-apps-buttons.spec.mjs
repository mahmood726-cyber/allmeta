// Exhaustive button + render sweep for the 4 portfolio integrations
// (umbrella-overlap, quantile-ma, benford-screen, transported-nma).
// For each app: clicks EVERY <button>, exercises selects/checkboxes, and
// asserts the result region + every plot/table renders with zero page errors.
import { test, expect } from "@playwright/test";

const BENIGN = [/favicon/i, /frame-ancestors.*ignored/i, /Failed to fetch/i, /ERR_CONNECTION_REFUSED/i];

function watch(page) {
  const errs = [];
  page.on("console", m => { if (m.type() === "error" && !BENIGN.some(re => re.test(m.text()))) errs.push(m.text()); });
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  return errs;
}

test("umbrella-overlap: all buttons + matrix render", async ({ page }) => {
  const errs = watch(page);
  await page.goto("/umbrella-overlap/index.html");
  expect(await page.evaluate(() => !!window.AlmUmbrellaOverlap)).toBe(true);
  await page.click("#btn-example");
  await expect(page.locator("#result .big")).toBeVisible();
  await expect(page.locator("#matrix table")).toBeVisible();
  const r = await page.evaluate(() => window.__almUmbrellaOverlap.run());
  expect(r.ok).toBe(true);
  expect(r.cca).toBeGreaterThan(0);                 // overlapping example -> positive CCA
  await page.click("#btn-run");                      // Compute CCA must not blank it
  await expect(page.locator("#matrix table")).toBeVisible();
  expect(errs).toEqual([]);
});

test("quantile-ma: all buttons + profile plot render", async ({ page }) => {
  const errs = watch(page);
  await page.goto("/quantile-ma/index.html");
  await page.click("#btn-example");
  const r = await page.evaluate(() => window.__almQuantileMA.run());
  expect(r.ok).toBe(true);
  expect(r.profile.length).toBe(5);
  await expect(page.locator("#result table")).toBeVisible();
  await expect(page.locator("#plot svg")).toBeVisible();
  // CI whiskers + the QTE polyline must actually be drawn
  expect(await page.locator("#plot svg circle").count()).toBeGreaterThanOrEqual(5);
  expect(await page.locator("#plot svg path").count()).toBeGreaterThanOrEqual(1);
  await page.click("#btn-run");
  await expect(page.locator("#plot svg")).toBeVisible();
  expect(errs).toEqual([]);
});

test("benford-screen: both example buttons + bar chart render", async ({ page }) => {
  const errs = watch(page);
  await page.goto("/benford-screen/index.html");
  // Benford-conforming example
  await page.click("#btn-example");
  let r = await page.evaluate(() => window.__almBenford.run());
  expect(r.ok).toBe(true);
  expect(r.anomalous).toBe(false);
  await expect(page.locator("#plot svg")).toBeVisible();
  expect(await page.locator("#plot svg rect").count()).toBe(9);      // 9 first-digit bars
  expect(await page.locator("#plot svg circle").count()).toBe(9);    // 9 Benford markers
  // Anomalous example -> flag + chart still renders
  await page.click("#btn-example-anom");
  r = await page.evaluate(() => window.__almBenford.run());
  expect(r.anomalous).toBe(true);
  await expect(page.locator("#result .verdict")).toBeVisible();
  await expect(page.locator("#plot svg")).toBeVisible();
  // Screen button on the loaded data must not blank it
  await page.click("#btn-run");
  await expect(page.locator("#plot svg")).toBeVisible();
  expect(errs).toEqual([]);
});

test("transported-nma: all controls + both result tables render", async ({ page }) => {
  const errs = watch(page);
  await page.goto("/transported-nma/index.html");
  expect(await page.evaluate(() => !!(window.AlmTransportedNMA && window.AlmMultiplicativeNMA))).toBe(true);
  await page.click("#btn-example");
  let r = await page.evaluate(() => window.__almTransportedNMA.run());
  expect(r.ok).toBe(true);
  await expect(page.locator("#result .verdict")).toBeVisible();
  await expect(page.locator("#ranks table")).toBeVisible();
  await expect(page.locator("#league table")).toBeVisible();
  // toggle the direction checkbox -> re-renders, P-scores must flip ordering sense
  const before = r.transported.pScore;
  await page.uncheck("#f-higher");
  r = await page.evaluate(() => window.__almTransportedNMA.run());
  expect(r.ok).toBe(true);
  // higher->lower better should change at least one treatment's P-score
  const changed = Object.keys(before).some(k => Math.abs(before[k] - r.transported.pScore[k]) > 1e-6);
  expect(changed).toBe(true);
  // change the reference treatment via the select -> still renders
  await page.check("#f-higher");
  const opts = await page.$$eval("#f-ref option", os => os.map(o => o.value));
  if (opts.length > 1) {
    await page.selectOption("#f-ref", opts[1]);
    r = await page.evaluate(() => window.__almTransportedNMA.run());
    expect(r.ok).toBe(true);
    await expect(page.locator("#league table")).toBeVisible();
  }
  // Transport & rank button
  await page.click("#btn-run");
  await expect(page.locator("#ranks table")).toBeVisible();
  expect(errs).toEqual([]);
});
