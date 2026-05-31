/**
 * gosh-metareg-parity.spec.mjs — meta-regression R-parity vs metafor.
 *
 * After the fix, wls() implements standard meta-regression DL: tau2 from
 * the MODERATED residual Q with the trace denominator (Cochrane Handbook
 * §10.11 / metafor method="DL") — NOT the intercept-only Q. Validated on
 * two fixtures: residual tau2==0 and residual tau2>0.
 * Oracle: gosh-metareg/tests/fixtures/metareg-oracle.json
 *         (metafor::rma(mods=~mod, method="DL")).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/gosh-metareg/';
const O = JSON.parse(readFileSync(
  new URL('../../../gosh-metareg/tests/fixtures/metareg-oracle.json', import.meta.url),
  'utf-8'));
const TOL = 1e-6;

test.describe('gosh-metareg', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almMetareg === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('meta-regression DL R-parity vs metafor (moderated residual tau2)',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almMetareg === 'function',
        { timeout: 10_000 });

      for (const key of ['lowResid', 'heteroResid']) {
        const c = O[key];
        const r = await page.evaluate((s) => window.__almMetareg(s), c.studies);
        expect(r, `${key}: wls() null`).toBeTruthy();
        const near = (g, e, n) =>
          expect(Math.abs(g - e), `${key} ${n}: js=${g} R=${e}`)
            .toBeLessThan(TOL);

        near(r.tau2, c.tau2, 'moderated DL tau2');
        near(r.b0, c.b0, 'intercept b0');
        near(r.b1, c.b1, 'moderator slope b1');
        near(r.seB1, c.se_b1, 'SE(b1)');
        // I2 definition can differ slightly across implementations.
        expect(Math.abs(r.I2 - c.I2),
          `${key} I2: js=${r.I2} R=${c.I2}`).toBeLessThan(1.0);
      }
    });
});
