/**
 * powerma-parity.spec.mjs — pre-MA sample size / RIS R-parity.
 *
 * Oracle = the documented formulas evaluated with R's EXACT qnorm
 * (powerma/tests/fixtures/powerma-oracle.R): continuous
 * nPerArm = 2*(z_{1-a/2}+z_{1-b})^2/(MD/SD)^2; binary arcsine
 * nPerArm = (z..)^2/d^2*(1+1/ratio). Deterministic -> tight (1e-6 on
 * raw, exact on the ceil'd integers + eventsTarget).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/powerma/';
const O = JSON.parse(readFileSync(
  new URL('../../../powerma/tests/fixtures/powerma-oracle.json', import.meta.url), 'utf-8'));
const TOL = 1e-6;

test.describe('powerma', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almPowerMA === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('sample size / RIS R-parity (exact qnorm)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almPowerMA === 'function',
      { timeout: 10_000 });

    for (const c of O) {
      const p = c.params;
      const inputs = {
        alpha: p.alpha, power: p.power, ratio: p.ratio,
        md: p.md, sdC: p.sdC, p0: p.p0, rrr: p.rrr,
      };
      const r = await page.evaluate(
        ([o, inp]) => window.__almPowerMA(o, inp), [p.outcome, inputs]);
      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${c.id} ${n}: js=${g} R=${e}`)
          .toBeLessThan(TOL);

      near(r.za, c.za, 'z_{1-alpha/2}');
      near(r.zb, c.zb, 'z_{power}');
      near(r.nPerArmRaw, c.nPerArmRaw, 'nPerArm (raw)');
      near(r.totalNRaw, c.totalNRaw, 'totalN (raw)');
      expect(r.nPerArm, `${c.id} nPerArm (ceil)`).toBe(c.nPerArm);
      expect(r.totalN, `${c.id} totalN (ceil)`).toBe(c.totalN);
      if (c.eventsTarget != null)
        expect(r.eventsTarget, `${c.id} eventsTarget`).toBe(c.eventsTarget);
    }
  });
});
