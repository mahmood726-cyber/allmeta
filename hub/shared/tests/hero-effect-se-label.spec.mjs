// One-click "Try with: BCG" example for the two apps whose textarea reads `effect, SE, label`
// (gosh, limit-ma). Before the "effect-se-label" hero adapter these pages were attached with the
// "forest" adapter, which writes `label, effect, SE`: limit-ma refused the example and gosh showed a
// blank result. Each test fails on that layout and passes once the example is readable and runs.
//
// Pinned R provenance (lane P13w2, 19 Oct 2026; R 4.6.0, metafor 5.2.1, meta 8.5.0, metasens 1.5.3,
// metadat 1.6.0; script hub/shared/tests/fixtures/hero-bcg-reference.R, input = the exact text the
// hero writes: yi to 4 dp as stored in shared/canonical-datasets.js, SE = sqrt(vi) rounded to 4 dp):
//   HERO  gosh(rma(yi, sei, method="FE")):  8191 subsets, median estimate -0.43184141599691045,
//         median I2 87.707424143742912, min -1.6209, max 0.4459
//   HERO  gosh(rma(..., method="DL")):      median estimate -0.71049262611276243
//   HERO  metasens::limitmeta(metagen(yi, sei, method.tau="DL"), method.adjust="beta0"):
//         FE -0.43184141599691045, RE -0.7141045794365618, tau2 0.30854732116972217,
//         limit -0.62911486742867584 (SE 0.23290410168942008)
//   EXACT dat.bcg (escalc RR, unrounded) for orientation: gosh FE median -0.43028516365409103,
//         DL median -0.7104913430856058, RE -0.71411722207322714, limit -0.62911490616766186.
// The hero data are rounded, so the app is held to the HERO values at 1e-9 and to the unrounded
// dat.bcg values only within 0.005 (the rounding effect, stated rather than hidden).
import { test, expect } from '@playwright/test';

const HERO = {
  goshFE: { n: 8191, median: -0.43184141599691045, i2: 87.707424143742912, min: -1.6209, max: 0.4459 },
  goshDL: { median: -0.71049262611276243 },
  limit: { fe: -0.43184141599691045, re: -0.7141045794365618, tau2: 0.30854732116972217,
    limit: -0.62911486742867584, limitSe: 0.23290410168942008 },
};
const EXACT = { goshFE: -0.43028516365409103, goshDL: -0.7104913430856058, re: -0.71411722207322714, limit: -0.62911490616766186 };
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));

async function pickBcg(page) {
  const select = page.locator('#alm-hero-mount select[data-alm-hero]');
  await expect(select).toBeVisible();
  await select.selectOption('bcg');
}

test.describe('one-click BCG example (effect, SE, label apps)', () => {
  test('gosh: choosing BCG alone runs the analysis with k=13 and the metafor::gosh values', async ({ page }) => {
    await page.goto('/gosh/index.html');
    await pickBcg(page); // the only click
    await expect(page.locator('#m-n')).toHaveText('8,191');
    const r = await page.evaluate(() => window._almLastGosh());
    expect(r).not.toBeNull();
    expect(r.k).toBe(13);
    expect(r.model).toBe('FE');
    expect(r.n_subsets).toBe(HERO.goshFE.n);
    expect(rel(r.median_est, HERO.goshFE.median)).toBeLessThan(1e-9);
    expect(Math.abs(r.median_i2 - HERO.goshFE.i2) / 100).toBeLessThan(1e-9);
    expect(rel(r.min_est, HERO.goshFE.min)).toBeLessThan(1e-9);
    expect(rel(r.max_est, HERO.goshFE.max)).toBeLessThan(1e-9);
    expect(Math.abs(r.median_est - EXACT.goshFE)).toBeLessThan(0.005);
    expect(r.studies[0]).toEqual({ label: 'Aronson 1948', te: -0.8893, se: 0.5706 });
    await expect(page.locator('#m-est')).toHaveText('-0.432');
    await expect(page.locator('#plot circle')).toHaveCount(8191);
    await expect(page.locator('#plot-error')).toHaveText('');
  });

  test('gosh: BCG under the DL model matches metafor::gosh(method="DL")', async ({ page }) => {
    await page.goto('/gosh/index.html');
    await page.selectOption('#model', 'DL');
    await pickBcg(page);
    await expect(page.locator('#m-n')).toHaveText('8,191');
    const r = await page.evaluate(() => window._almLastGosh());
    expect(r.model).toBe('DL');
    expect(rel(r.median_est, HERO.goshDL.median)).toBeLessThan(1e-9);
    expect(Math.abs(r.median_est - EXACT.goshDL)).toBeLessThan(0.005);
  });

  test('limit-ma: choosing BCG alone runs the analysis with k=13 and the metasens::limitmeta values', async ({ page }) => {
    await page.goto('/limit-ma/index.html');
    await pickBcg(page); // the only click
    await expect(page.locator('#body tr')).toHaveCount(3);
    await expect(page.locator('#limit-error')).toHaveText('');
    const r = await page.evaluate(() => window._almLastLimit());
    expect(r).not.toBeNull();
    expect(r.k).toBe(13);
    expect(rel(r.fe_est, HERO.limit.fe)).toBeLessThan(1e-9);
    expect(rel(r.re_est, HERO.limit.re)).toBeLessThan(1e-9);
    expect(rel(r.tau2_dl, HERO.limit.tau2)).toBeLessThan(1e-9);
    expect(rel(r.limit_est, HERO.limit.limit)).toBeLessThan(1e-9);
    expect(rel(r.limit_se, HERO.limit.limitSe)).toBeLessThan(1e-9);
    expect(Math.abs(r.re_est - EXACT.re)).toBeLessThan(0.005);
    expect(Math.abs(r.limit_est - EXACT.limit)).toBeLessThan(0.005);
    await expect(page.locator('#body tr').nth(2)).toContainText('-0.629');
  });

  // The same example followed by an explicit Run: isolates readability of the loaded text from the auto-run.
  for (const [app, last, ok] of [['gosh', '_almLastGosh', '#m-n'], ['limit-ma', '_almLastLimit', '#body tr']]) {
    test(`${app}: the BCG text the example writes is readable (choose, then Run analysis)`, async ({ page }) => {
      await page.goto(`/${app}/index.html`);
      await pickBcg(page);
      await page.click('#btn-run');
      const r = await page.evaluate((fn) => window[fn](), last);
      expect(r, `${app} produced no result from the example text`).not.toBeNull();
      expect(r.k).toBe(13);
      await expect(page.locator(ok).first()).toBeVisible();
    });
  }

  test('the shared "forest" adapter output is unchanged for other apps (label first)', async ({ page }) => {
    await page.goto('/gosh/index.html');
    const out = await page.evaluate(() => {
      const d = AlmDatasets.get('bcg');
      return { forest: AlmDatasets.toForestPlotText(d).split('\n')[0], esl: AlmDatasets.toEffectSeLabelText(d).split('\n')[0] };
    });
    expect(out.forest).toBe('Aronson 1948, -0.8893, 0.5706');
    expect(out.esl).toBe('-0.8893, 0.5706, Aronson 1948');
  });
});
