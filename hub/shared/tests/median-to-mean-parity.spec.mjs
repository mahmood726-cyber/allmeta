/**
 * median-to-mean-parity.spec.mjs — Wan/Luo/Shi R-parity.
 *
 * Oracle = the published closed-form estimators evaluated with R's EXACT
 * qnorm (median-to-mean/tests/fixtures/m2m-oracle.R): Wan 2014 (mean+SD),
 * Luo 2018 (refined mean), Shi 2020 (refined SD). Means are pure arithmetic
 * (exact); SDs divide by 2·qnorm((n-0.375)/(n+0.25)) so they expose any
 * inaccuracy in the app's normal-quantile function.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/median-to-mean/';
const O = JSON.parse(readFileSync(
  new URL('../../../median-to-mean/tests/fixtures/m2m-oracle.json', import.meta.url), 'utf-8'));
const TOL = 1e-6;

test.describe('median-to-mean', () => {
  test('loads, renders plot, no console errors', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almM2M === 'function',
      { timeout: 10_000 });
    await expect(page.locator('#plot')).toBeVisible();
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('Wan 2014 / Luo 2018 / Shi 2020 R-parity (exact qnorm)',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almM2M === 'function',
        { timeout: 10_000 });

      for (const c of O) {
        const r = await page.evaluate(
          ([s, n, a, q1, m, q3, b]) => window.__almM2M(s, n, a, q1, m, q3, b),
          [c.scenario, c.n, c.a, c.q1, c.m, c.q3, c.b]);
        const near = (g, e, name) =>
          expect(Math.abs(g - e), `${c.id} ${name}: js=${g} R=${e}`)
            .toBeLessThan(TOL);

        near(r.wan.mean, c.wan_mean, 'Wan mean');
        near(r.wan.sd, c.wan_sd, 'Wan SD');
        near(r.luoMean, c.luo_mean, 'Luo mean');
        if (c.shi_sd != null) near(r.shiSD, c.shi_sd, 'Shi SD');
        else expect(r.shiSD, `${c.id} Shi SD should be null (C2)`).toBeNull();
      }
    });
});
