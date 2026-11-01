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

// Extras (plus) panel, leave-one-study-out. Rewritten 2026-10-31 from "the extras panel keeps its three-contrast minimum"
// to the requirement (fit as netmeta fits, warn visibly). Reference: the plus oracle's own fit()
// (validate/generate-plus.R) with only its input gate lowered, R 4.6.0, netmeta 3.7.0, metafor 5.2.1:
//   A-B x3 (S1 0.20/0.10, S2 0.35/0.12, S3 0.10/0.15); every drop leaves 2 contrasts and is fitted:
//     DL tau2 without S1 0.012799999999999916, without S2 0, without S3 0; PM 0.012800000000000434, 0, 0; FE 0.
//     Every drop: decomp.design Q = 0, df = 0, p NA ("No decomposition possible ... only two treatments"); no split.
//   A-B, A-C (2 contrasts): each drop leaves 1 contrast and is fitted (Q = 0, df = 0, p NA; DL tau2 NA: no residual df).
//   A-B (1 contrast): the only drop leaves no contrast; netmeta cannot fit an empty network, so the drop is refused.
const plus = async page => { await page.evaluate(() => window.AlmIncoPlus.whenIdle()); return page.evaluate(() => JSON.parse(JSON.stringify(window.AlmIncoPlus.state().loo))); };
const PAIR3 = 'A, B, 0.20, 0.10, S1\nA, B, 0.35, 0.12, S2\nA, B, 0.10, 0.15, S3';
const R_TAU2 = { FE: [0, 0, 0], DL: [0.012799999999999916, 0, 0], PM: [0.012800000000000434, 0, 0] };

test('PLUSK leave-one-out drops that leave 2 contrasts are fitted with netmeta values and a visible small-k warning', async ({ page }) => {
  for (const model of ['FE', 'DL', 'PM']) {
    await load(page, PAIR3, model);
    const L = await plus(page);
    expect(L.status, model).toBe('ok');
    expect(L.drops.map(d => d.status), model + ': drops leaving 2 contrasts must not be refused').toEqual(['ok', 'ok', 'ok']);
    L.drops.forEach((d, i) => {
      close(d.tau2, R_TAU2[model][i], model === 'PM' ? 1e-6 : 1e-9);
      expect(d.dbt).toEqual({ Q: 0, df: 0, p: null }); expect(d.nSplits).toBe(0);
    });
    await expect(page.locator('#plus-loo-status')).toHaveText(/Leave-one-study-out complete: 3 refits/);
    const sum = page.locator('#plus-loo-summary');
    await expect(sum).toBeVisible();
    await expect(sum).toContainText('Each removal leaves only 2 contrasts');
    await expect(sum).toContainText('Interpret these refits with great caution.');
    expect(await page.evaluate(() => window.AlmIncoPlus.methodsText())).toContain('Each removal leaves only 2 contrasts');
    await expect(page.locator('#plus-loo-body tr')).toHaveCount(3);
  }
});

test('PLUSK the extras panel fits two contrasts (drops leave 1) and refuses, with its reason, only a drop that leaves none', async ({ page }) => {
  await load(page, 'A, B, 0.20, 0.10, S1\nA, C, 0.30, 0.12, S2', 'DL');
  const L = await plus(page);
  expect(L.status).toBe('ok');
  expect(L.drops.map(d => [d.study, d.status, d.dbt.df, d.dbt.p, d.nSplits])).toEqual([['S1', 'ok', 0, null, 0], ['S2', 'ok', 0, null, 0]]);
  await expect(page.locator('#plus-loo-status')).toHaveText(/Leave-one-study-out complete: 2 refits/);
  await expect(page.locator('#plus-loo-summary')).toContainText('Each removal leaves only 1 contrast:');
  await load(page, 'A, B, 0.20, 0.10, S1');
  const one = await plus(page);
  expect(one.status).toBe('ok');
  expect(one.drops.map(d => [d.study, d.status, d.reason])).toEqual([['S1', 'refused', 'Enter at least one valid contrast.']]);
  await expect(page.locator('#plus-loo-summary')).toContainText('Not analysable after removing: S1 (Enter at least one valid contrast).');
  await expect(page.locator('#plus-loo-body')).toContainText('Not analysable: Enter at least one valid contrast.');
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
