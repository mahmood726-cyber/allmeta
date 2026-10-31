import { test, expect } from '@playwright/test';

// One or two contrasts (Mahmood 2026-10-31: where R fits, fit exactly as R does and warn visibly).
// Reference: R 4.6.0, netmeta 3.7.0 netmeta(TE, seTE, treat1, treat2, studlab, sm = "MD", common = TRUE, random = TRUE,
// method.tau = "DL", reference.group = "A") + netsplit() + decomp.design(). netmeta fits k = 1 and k = 2:
//   k = 2 star (A-B, A-C): B = 0.2, C = 0.3 vs A (SE 0.1, 0.12), Q = 0, df = 0, tau2 NA; netsplit has no comparison with
//         both direct and indirect evidence; decomp.design: between designs Q = 0, df = 0, p NA (not testable).
//   k = 1 (A-B): B = 0.2 (SE 0.1), df = 0; "No decomposition possible for network meta-analysis with only two treatments."
//   k = 2 pair (A-B twice): B = 0.261475409836066 (SE 0.0768221279597376), Q = 0.922131147540983, df = 1.
const APP = 'nma-inconsistency';
async function load(page, src, model = 'FE') {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  await page.evaluate(({ src, model }) => { document.getElementById('f-model').value = model; window.__almIncoLoad(src); }, { src, model });
  return page.evaluate(() => window._almLastInco && window._almLastInco());
}
const close = (a, b, tol) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), a + ' vs ' + b).toBeLessThan(tol);

test('SMALLK two contrasts (star) are fitted as netmeta fits them; inconsistency is not testable and a warning says so', async ({ page }) => {
  for (const model of ['FE', 'DL']) {
    const r = await load(page, 'A, B, 0.20, 0.10, S1\nA, C, 0.30, 0.12, S2', model);
    expect(r.status, 'two contrasts must not be refused').not.toBe('refused');
    close(Math.abs(r.estimates.B.est), 0.2, 1e-9); close(r.estimates.B.se, 0.1, 1e-9);
    close(Math.abs(r.estimates.C.est), 0.3, 1e-9); close(r.estimates.C.se, 0.12, 1e-9);
    expect(r.df).toBe(0); expect(r.nodeSplit).toEqual([]); expect(r.dbt.df).toBe(0); expect(r.dbt.p).toBeNull();
    await expect(page.locator('#dbt')).toContainText('inconsistency is not testable');
    const note = page.locator('#smallk-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Only 2 contrasts');
    await expect(note).toContainText('no closed loop');
  }
});

test('SMALLK the extras panel keeps its three-contrast minimum and says so visibly', async ({ page }) => {
  await load(page, 'A, B, 0.20, 0.10, S1\nA, C, 0.30, 0.12, S2');
  await page.evaluate(() => window.AlmIncoPlus.whenIdle());
  const s = page.locator('#plus-loo-status');
  await expect(s).toBeVisible();
  await expect(s).toHaveText('Sensitivity analysis not available: At least 3 valid contrasts are required.');
});

test('SMALLK one contrast is fitted (k = 1), with the warning', async ({ page }) => {
  const r = await load(page, 'A, B, 0.20, 0.10, S1');
  expect(r.status).not.toBe('refused');
  close(Math.abs(r.estimates.B.est), 0.2, 1e-9); close(r.estimates.B.se, 0.1, 1e-9);
  await expect(page.locator('#smallk-note')).toContainText('Only 1 contrast');
});

test('SMALLK two contrasts of one comparison match netmeta (df = 1)', async ({ page }) => {
  const r = await load(page, 'A, B, 0.20, 0.10, S1\nA, B, 0.35, 0.12, S2');
  close(Math.abs(r.estimates.B.est), 0.261475409836066, 1e-9); close(r.estimates.B.se, 0.0768221279597376, 1e-9);
  close(r.Q, 0.922131147540983, 1e-9); expect(r.df).toBe(1);
  await expect(page.locator('#smallk-note')).toContainText('Only 2 contrasts');
});

test('SMALLK share files with one contrast are accepted; three contrasts carry no small-k note', async ({ page }) => {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, APP);
  await page.evaluate(a => { const b = AlmFeatures.get(a).share; b.set({ ...b.get(), src: 'A, B, 0.20, 0.10, S1' }); }, APP);
  await expect(page.locator('#smallk-note')).toBeVisible();
  await load(page, 'A, B, 0.20, 0.10, S1\nA, C, 0.45, 0.12, S2\nB, C, 0.10, 0.11, S3');
  await expect(page.locator('#smallk-note')).toBeHidden();
});
