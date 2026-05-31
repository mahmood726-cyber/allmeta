/**
 * km-reconstructor-parity.spec.mjs — KM IPD reconstruction validation.
 *
 * The app is explicitly a SIMPLIFIED Guyot-style heuristic (events at
 * curve-point midpoints), NOT full iterative product-limit Guyot — and
 * advanced-stats.md says never claim IPD-level accuracy from
 * reconstructed data. So this validates:
 *   1. TIGHT: the reconstructed KM tracks the digitized input curve
 *      (the heuristic's actual objective).
 *   2. TIGHT: total events hits the forced/reported value; n == N0.
 *   3. DOCUMENTED BAND (not IPD parity): median & total events are
 *      close to R IPDfromKM's full Guyot 2012 reconstruction.
 * Oracle: km-reconstructor/tests/fixtures/km-oracle.json (IPDfromKM).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/km-reconstructor/';
const O = JSON.parse(readFileSync(
  new URL('../../../km-reconstructor/tests/fixtures/km-oracle.json', import.meta.url), 'utf-8'));

test.describe('km-reconstructor', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almKM === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('tracks digitized input (tight) + close to full-Guyot (band)',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almKM === 'function',
        { timeout: 10_000 });
      const r = await page.evaluate(
        ([c, k, te]) => window.__almKM(c, k, te),
        [O.curve_txt, O.risk_txt, O.tot_events]);

      // 1. Reconstructed KM tracks the digitized input — the heuristic's
      //    actual fitting objective (tight: observed max dev 0.0038).
      const maxDev = Math.max(...r.reconAt.map(
        x => Math.abs(x.sRecon - x.sDigit)));
      expect(maxDev, `max|S_recon - S_digitized| = ${maxDev}`)
        .toBeLessThan(0.02);

      // 2. n == N0; total events hits the forced/reported value.
      expect(r.n, 'reconstructed N == N0').toBe(200);
      expect(Math.abs(r.events - O.tot_events),
        `events ${r.events} vs forced ${O.tot_events}`)
        .toBeLessThanOrEqual(3);

      // 3. Median / events CLOSE to IPDfromKM full Guyot — a documented
      //    heuristic band, NOT IPD-level parity (curve step = 2 units).
      expect(Math.abs(r.median - O.guyot.median),
        `median ${r.median} vs Guyot ${O.guyot.median}`)
        .toBeLessThanOrEqual(3);
      expect(Math.abs(r.median - O.true_median),
        `median ${r.median} vs true ${O.true_median}`)
        .toBeLessThanOrEqual(3);
      expect(Math.abs(r.events - O.guyot.events),
        `events ${r.events} vs Guyot ${O.guyot.events}`)
        .toBeLessThanOrEqual(20);
    });
});
