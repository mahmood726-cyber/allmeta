import { test, expect } from '@playwright/test';

// One contrast (Mahmood 2026-10-31: where R fits, fit exactly as R does and warn visibly).
// Reference: R 4.6.0, netmeta 3.7.0 discomb(TE, seTE, treat1, treat2, studlab, inactive = "control", sep.comps = "+",
// common = TRUE, random = TRUE). k = 1 "drug | control | -0.30 | 0.10": drug = -0.3 (SE 0.1), Q = 0, df = 0, tau not
// estimable (NA), with the warning "No treatment contains the component separator '+'.".
const APP = 'component-nma';
async function load(page, src) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  await page.evaluate(src => window.__almCnmaLoad(src), src);
  return page.evaluate(() => window._almLastCnma && window._almLastCnma());
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);

test('SMALLK one contrast is fitted as netmeta::discomb fits it, with a visible warning', async ({ page }) => {
  const r = await load(page, 'drug | control | -0.30 | 0.10');
  expect(r, 'one contrast must not be refused').not.toBeNull();
  close(r.components.drug.est, -0.3, 1e-9); close(r.components.drug.se, 0.1, 1e-9);
  expect(r.df).toBe(0); expect(r.tau2).toBeNull(); close(r.Q, 0, 1e-12);
  const note = page.locator('#smallk-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Only 1 contrast for 1 component');
  await expect(note).toContainText('interpret with great caution');
  expect(r.warnings.join(' ')).toContain('Only 1 contrast for 1 component');
  await expect(page.locator('#comp-body tr')).toHaveCount(1);
});

test('SMALLK one contrast is accepted from a share file too', async ({ page }) => {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  await page.evaluate(a => { const b = AlmFeatures.get(a).share; b.set({ ...b.get(), src: 'drug | control | -0.30 | 0.10' }); }, APP);
  await expect(page.locator('#comp-body tr')).toHaveCount(1);
  await expect(page.locator('#smallk-note')).toBeVisible();
});

test('SMALLK a saturated design (df = 0) warns; a design with residual df does not', async ({ page }) => {
  await load(page, 'drug | control | -0.30 | 0.10\nexercise | control | -0.20 | 0.12');
  await expect(page.locator('#smallk-note')).toContainText('Only 2 contrasts for 2 components');
  const r = await load(page, 'drug | control | -0.30 | 0.10\nexercise | control | -0.20 | 0.12\ndrug+exercise | control | -0.70 | 0.15');
  expect(r.df).toBe(1);
  await expect(page.locator('#smallk-note')).toBeHidden();
});
