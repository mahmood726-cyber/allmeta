import { test, expect } from '@playwright/test';

// Degenerate but legal inputs (small k, constant moderator, extreme weights). Reference values: R 4.6.0, metafor 5.2.1,
// rma(yi, vi, mods = ~x, method = "PM", test = "adhoc", control = list(tol = 1e-12, threshold = 1e-12, maxiter = 1000)).
// Where metafor warns "Ratio of largest to smallest sampling variance extremely large" its fit is not usable as a
// reference (it returned tau2 = 0 and QE = 0 for clearly heterogeneous data); those values come from a 50-digit
// (mpmath) evaluation of the same PM / Knapp-Hartung formulas instead.
const APP = 'meta-regression';
async function run(page, data) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  await page.evaluate(({ a, data }) => { const b = AlmFeatures.get(a).share; b.set({ ...b.get(), data }); }, { a: APP, data });
  return page.evaluate(a => AlmFeatures.get(a).text.results(), APP);
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);

test('EDGE constant moderator: refuses with a reason instead of showing k alone', async ({ page }) => {
  const r = await run(page, 'A, -0.30, 0.10, 40\nB, 0.10, 0.12, 40\nC, 0.45, 0.09, 40\nD, -0.05, 0.15, 40\nE, 0.20, 0.11, 40');
  expect(r).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('The moderator has the same value (40) in every study, so its slope cannot be estimated.');
  await expect(page.locator('#stats-wrap')).not.toContainText('β₁');
});

test('EDGE nearly constant moderator still fits (only an exactly constant moderator is refused)', async ({ page }) => {
  const r = await run(page, 'A, -0.30, 0.10, 40\nB, 0.10, 0.12, 40\nC, 0.45, 0.09, 40\nD, -0.05, 0.15, 40\nE, 0.20, 0.11, 40.5');
  expect(r).not.toBeNull();
  await expect(page.locator('#warn-banner')).not.toContainText('same value');
});

test('EDGE k = 3 (df = 1) matches metafor', async ({ page }) => {
  const r = await run(page, 'A, -0.30, 0.10, 30\nB, 0.10, 0.12, 50\nC, 0.45, 0.09, 40');
  const R = { intercept: -0.722181818181818, slope: 0.0202, slope_ci_lb: -0.385993339366346, tau2_pm: 0.1922, QE: 21.3028169014085,
    piLo: -6.39150045665119, piHi: 6.56313682028755 };
  for (const [k, v] of Object.entries(R)) close(r[k], v, 1e-6);
  expect(r.hksj_q_df).toBe(1);
});

test('EDGE identical studies: tau2 = 0, QE = 0, t-based PI matches metafor', async ({ page }) => {
  const r = await run(page, 'A, 0.20, 0.10, 30\nB, 0.20, 0.10, 40\nC, 0.20, 0.10, 50\nD, 0.20, 0.10, 60\nE, 0.20, 0.10, 70');
  expect(r.tau2_pm).toBe(0);
  close(r.QE, 0, 1e-9);
  close(r.piLo, 0.0576766745328513, 1e-9); close(r.piHi, 0.342323325467148, 1e-9);
});

test('EDGE one tiny SE (variance ratio 1e14): matches the 50-digit reference', async ({ page }) => {
  const r = await run(page, 'A, -0.30, 1e-8, 30\nB, 0.10, 0.12, 50\nC, 0.45, 0.09, 40\nD, -0.05, 0.15, 60\nE, 0.20, 0.11, 45');
  close(r.tau2_pm, 0.0944360161220925, 1e-6); close(r.slope, 0.00555135254205231, 1e-6);
  close(r.QE, 43.9498338282883, 1e-6); close(r.permP, 0.8, 1e-12);
});
