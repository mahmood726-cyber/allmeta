import { test, expect } from '@playwright/test';

// Degenerate but legal inputs. Reference: R 4.6.0, mada 0.5.12 reitsma() (mvmeta 1.0.3), correction 0.5.
const APP = 'dta-sroc';
async function run(page, rows, method = 'reml', cc = 'all') {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  const data = rows.map((r, i) => 'S' + (i + 1) + ', ' + r.join(', ')).join('\n');
  await page.evaluate(({ a, data, method, cc }) => { const b = AlmFeatures.get(a).share; b.set({ ...b.get(), data, method, cc, cov: '' }); }, { a: APP, data, method, cc });
  return page.evaluate(() => window.__almResults());
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);
const cards = page => page.locator('#stats-wrap .stat').allInnerTexts();

test('EDGE identical studies: Deeks test not estimable is said, not shown as "--"', async ({ page }) => {
  const r = await run(page, Array(5).fill([80, 12, 20, 138]));
  expect(r.bivariate.Psi.flat().every(v => Math.abs(v) < 1e-8)).toBe(true);
  expect((await cards(page)).filter(t => /--/.test(t))).toEqual([]);
  await expect(page.locator('#warn-banner')).toContainText("Deeks' funnel-plot asymmetry test is not estimable");
  expect(r.errors.join(' ')).toContain("Deeks' funnel-plot asymmetry test is not estimable");
});

test('EDGE a usual dataset keeps the Deeks card and has no such note', async ({ page }) => {
  await run(page, [[80, 12, 20, 138], [60, 14, 19, 105], [115, 22, 37, 205], [50, 6, 9, 95], [128, 44, 31, 290]]);
  expect((await cards(page)).some(t => t.startsWith("Deeks' test p"))).toBe(true);
  await expect(page.locator('#warn-banner')).not.toContainText('Deeks');
});

test('EDGE k = 4 and an all-TP = 0 network match mada::reitsma (REML)', async ({ page }) => {
  let r = await run(page, [[80, 12, 20, 138], [60, 14, 19, 105], [115, 22, 37, 205], [50, 6, 9, 95]]);
  close(r.bivariate.mu_logit_se, 1.2804045663225059, 1e-6); close(r.bivariate.mu_logit_fpr, -2.3045805801756605, 1e-6);
  close(r.bivariate.sens, 0.7825186346923961, 1e-6);
  r = await run(page, [[0, 12, 20, 138], [0, 14, 19, 105], [0, 22, 37, 205], [0, 6, 9, 95], [0, 44, 31, 290]]);
  close(r.bivariate.mu_logit_se, -3.762089379043363, 1e-6); close(r.bivariate.sens, 0.02270752990740934, 1e-6);
  await expect(page.locator('#warn-banner')).toContainText('0.5 was added to every cell of every study');
});

test('EDGE k = 3 refuses the bivariate fit with the reason', async ({ page }) => {
  const r = await run(page, [[80, 12, 20, 138], [60, 14, 19, 105], [115, 22, 37, 205]]);
  expect(r.bivariate).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('The bivariate model needs at least 4 studies');
});
