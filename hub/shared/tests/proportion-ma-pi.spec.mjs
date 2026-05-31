/**
 * proportion-ma prediction interval (Phase 3). The PI (t_{k-1}, Cochrane v6.5) is formed
 * on the transform scale via ma-core (R-verified) then back-transformed like the CI, so it
 * stays in [0,1]. Structural guard: PI present, brackets the pooled proportion, wider than
 * the CI, and within [0,1].
 */
import { test, expect } from '@playwright/test';
const BENIGN = /frame-ancestors|ERR_CONNECTION|Schwarzer/;

test('proportion-ma pooled PI present, brackets pooled p, wider than CI, in [0,1]', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8088/proportion-ma/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastPropMA === 'function' && window._almLastPropMA(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastPropMA());
  expect(o, 'results available').toBeTruthy();
  expect(o.poolPiLo, 'PI present').not.toBeNull();
  expect(o.poolPiLo).toBeLessThanOrEqual(o.poolP);
  expect(o.poolPiHi).toBeGreaterThanOrEqual(o.poolP);
  expect(o.poolPiLo).toBeLessThanOrEqual(o.poolLo + 1e-9); // wider than CI
  expect(o.poolPiHi).toBeGreaterThanOrEqual(o.poolHi - 1e-9);
  expect(o.poolPiLo).toBeGreaterThanOrEqual(0);
  expect(o.poolPiHi).toBeLessThanOrEqual(1);
  expect(errs, 'no console errors').toEqual([]);
});
