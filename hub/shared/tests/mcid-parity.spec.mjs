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
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
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
      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

      // At f = 0.5 the margin (1 − f)·M1 equals the wrong f·M1, so the oracle
      // must contain a case that separates them.
      expect(O.cases.some(c => Math.abs(c.input.frac - 0.5) > 1e-9),
        'oracle needs a case with preserved fraction f != 0.5').toBe(true);

      for (const c of O.cases) {
        const r = await page.evaluate((i) => window.__almMcid(i), c.input);
        const at = ` [${JSON.stringify(c.input)}]`;
        near(r.z975, O.z975, 'Z975 == R qnorm(0.975)');
        // Guard against regressing back to the 1.96 literal (Cycle-7.1).
        expect(Math.abs(r.z975 - 1.96),
          `Z975 must be exact qnorm, not 1.96`).toBeGreaterThan(1e-5);
        near(r.halfSD, c.halfSD, '0.5·SD (Norman)' + at);
        near(r.threeSD, c.threeSD, '0.3·SD' + at);
        near(r.oneSEM, c.oneSEM, '1·SEM' + at);
        near(r.semBand95, c.semBand95,
          'qnorm(.975)·SEM: 95% band around ONE measurement (not the SDC)' + at);
        near(r.sdc, c.sdc,
          'SDC must be qnorm(.975)·√2·SEM — change score, two occasions (de Vet 2006)' + at);
        near(r.anchor, c.anchor, 'anchor (Juniper)' + at);
        near(r.niMargin, c.niMargin,
          'NI margin must be M2 = (1 − preserved fraction)·M1 (ICH E10 / FDA 2016)' + at);
      }
    });
});
