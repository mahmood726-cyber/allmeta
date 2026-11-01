import { test, expect } from '@playwright/test';

// k <= 2 (Mahmood 2026-10-31: match R; where R cannot fit, refuse visibly and say why, never silently).
// Reference: R 4.6.0, metafor 5.2.1, rma(yi, vi, mods = ~x, method = "PM", test = "adhoc",
// control = list(tol = 1e-12, threshold = 1e-12, maxiter = 1000)), the settings the page documents:
//   k = 2: error "Number of parameters to be estimated is larger than the number of observations."
//   k = 1: no meta-regression: warnings "Setting argument test="z" since k=1." and "Redundant predictors dropped from
//          the model.", i.e. metafor drops the moderator, exactly as for a constant moderator (refused with a reason).
//   k = 3: fits (df = 1); the page fits it too (features-meta-regression-edge.spec.mjs checks the numbers).
const APP = 'meta-regression';
async function run(page, data) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  await page.evaluate(({ a, data }) => { const b = AlmFeatures.get(a).share; b.set({ ...b.get(), data }); }, { a: APP, data });
  return page.evaluate(a => AlmFeatures.get(a).text.results(), APP);
}

test('SMALLK k = 2 is not fitted, and the page says why (metafor refuses it too)', async ({ page }) => {
  const r = await run(page, 'A, -0.20, 0.10, 30\nB, 0.10, 0.12, 50');
  expect(r).toBeNull();
  const w = page.locator('#warn-banner');
  await expect(w).toBeVisible();
  await expect(w).toContainText('k = 2: not fitted');
  await expect(w).toContainText('no residual degrees of freedom');
  await expect(w).toContainText('metafor::rma refuses this too');
  await expect(page.locator('#stats-wrap')).not.toContainText('β₁');
});

test('SMALLK k = 1 is not fitted, and the page says what metafor does instead', async ({ page }) => {
  const r = await run(page, 'A, -0.20, 0.10, 30');
  expect(r).toBeNull();
  const w = page.locator('#warn-banner');
  await expect(w).toBeVisible();
  await expect(w).toContainText('k = 1: not fitted');
  await expect(w).toContainText('Redundant predictors dropped from the model');
  await expect(page.locator('#stats-wrap')).not.toContainText('β₁');
});

test('SMALLK k = 3 still fits and carries no not-fitted note', async ({ page }) => {
  const r = await run(page, 'A, -0.30, 0.10, 30\nB, 0.10, 0.12, 50\nC, 0.45, 0.09, 40');
  expect(r).not.toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('needs k ≥ 4 to be informative');
  await expect(page.locator('#warn-banner')).not.toContainText('not fitted');
});
