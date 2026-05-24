/**
 * mcid-parity.spec.mjs — MCID rule-arithmetic + exact-qnorm guard.
 *
 * mcid is deterministic formula arithmetic (no estimator). This is a
 * proportionate regression guard, NOT a deep statistical parity: it pins
 * the Z975 constant to R's qnorm(0.975) (the Cycle-7.1 fix away from
 * 1.96) and the documented distribution/anchor/NI multiples.
 * Oracle: mcid/tests/fixtures/mcid-oracle.json.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/mcid/';
const O = JSON.parse(readFileSync(
  new URL('../../../mcid/tests/fixtures/mcid-oracle.json', import.meta.url), 'utf-8'));
// Tolerant of the benign ~2-ULP rounding of the hardcoded Z975 literal.
const TOL = 1e-12;

test.describe('mcid', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almMcid === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('exact qnorm(0.975) + distribution/anchor/NI rule arithmetic',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almMcid === 'function',
        { timeout: 10_000 });
      const r = await page.evaluate((i) => window.__almMcid(i), O.input);

      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

      near(r.z975, O.z975, 'Z975 == R qnorm(0.975)');
      // Guard against regressing back to the 1.96 literal (Cycle-7.1).
      expect(Math.abs(r.z975 - 1.96),
        `Z975 must be exact qnorm, not 1.96`).toBeGreaterThan(1e-5);
      near(r.halfSD, O.halfSD, '0.5·SD (Norman)');
      near(r.threeSD, O.threeSD, '0.3·SD');
      near(r.oneSEM, O.oneSEM, '1·SEM');
      near(r.sdc, O.sdc, '1.96·SEM (SDC)');
      near(r.anchor, O.anchor, 'anchor (Juniper)');
      near(r.niMargin, O.niMargin, 'NI margin');
    });
});
