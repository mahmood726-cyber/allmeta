/**
 * R-parity regression for proportion-ma's Freeman-Tukey double-arcsine pooling.
 * FT (transform + Miller variance + the Barendregt inverse back-transform with the
 * harmonic-mean n) was the one transform NOT covered by the existing R-parity test
 * (only logit was). Verified end-to-end against meta::metaprop(sm="PFT", method.tau="PM").
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/proportion-ma/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

// meta::metaprop(event, n, sm="PFT", method.tau="PM") on the prop-tiny fixture:
const MP = { p: 0.08495040, lo: 0.06492339, hi: 0.10725119 };
const FIXTURE = [
  { study: 'Study A', events: 12, total: 150 },
  { study: 'Study B', events: 8, total: 90 },
  { study: 'Study C', events: 20, total: 220 },
  { study: 'Study D', events: 5, total: 60 },
  { study: 'Study E', events: 15, total: 180 },
];

test('proportion-ma: Freeman-Tukey pooled proportion + CI match meta::metaprop(sm="PFT")', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almLoad === 'function' && typeof window._almLastPropMA === 'function', { timeout: 10000 });

  const r = await page.evaluate((fixture) => {
    const t = document.getElementById('trans'); t.value = 'ft'; t.dispatchEvent(new Event('change', { bubbles: true }));
    const tau = document.getElementById('tau-est'); tau.value = 'PM'; tau.dispatchEvent(new Event('change', { bubbles: true }));
    window.__almLoad(fixture);
    return window._almLastPropMA();
  }, FIXTURE);

  expect(r.transform).toBe('ft');
  expect(r.poolP).toBeCloseTo(MP.p, 6);
  expect(r.poolLo).toBeCloseTo(MP.lo, 6);
  expect(r.poolHi).toBeCloseTo(MP.hi, 6);

  expect(errors, 'no console errors').toEqual([]);
});
