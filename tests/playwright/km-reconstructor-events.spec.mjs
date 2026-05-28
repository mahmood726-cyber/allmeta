/**
 * Regression for the km-reconstructor total-events bug: an impossible totEvents
 * (> cohort) used to inflate the reconstructed cohort (totEvents=99999, N0=200 ->
 * N=111190). The constraint now redistributes events<->censoring within the fixed
 * cohort and clamps totEvents to [0, N0].
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/km-reconstructor/index.html';

test('total-events constraint never inflates the cohort', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almKM === 'function', { timeout: 10000 });

  const r = await page.evaluate(() => {
    const curve = document.getElementById('curve').value;
    const risk = document.getElementById('risk').value;
    const N0 = parseInt(risk.split(/\r?\n/)[0].split(',')[1], 10); // first risk row's n
    return {
      N0,
      none:  window.__almKM(curve, risk, NaN),
      huge:  window.__almKM(curve, risk, 99999),  // impossible: > cohort
      valid: window.__almKM(curve, risk, 50),     // plausible
    };
  });
  console.log('  km:', JSON.stringify(r));

  // No-constraint baseline reconstructs the full cohort.
  expect(r.none.n).toBe(r.N0);
  // Impossible totEvents must NOT inflate the cohort (was 111190).
  expect(r.huge.n, 'cohort not inflated by impossible totEvents').toBeLessThanOrEqual(r.N0);
  expect(r.huge.events, 'events cannot exceed cohort').toBeLessThanOrEqual(r.N0);
  // A valid constraint preserves cohort size and (closely) hits the requested events.
  expect(r.valid.n, 'cohort preserved under valid constraint').toBe(r.N0);
  expect(Math.abs(r.valid.events - 50), 'events ~ requested total').toBeLessThanOrEqual(5);
});
