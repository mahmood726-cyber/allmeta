/**
 * R-parity for the E-value (shared/evalue.js) vs the EValue R package. Ground truth:
 *   RR=2.0 [1.5,2.7]      → E=3.414214, CI 2.366025
 *   RR=0.6 [0.4,0.9]      → E=2.720759, CI 1.462475
 *   OR=2.0 common [1.5,2.7] → E=2.179580, CI 1.749392 (approx RR √OR=1.414214)
 *   HR=1.6 common [1.2,2.1] → E=2.112944, CI 1.525531
 * Surfaced as a widget in effect-size-converter.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/effect-size-converter/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('E-value matches the EValue R package (RR/OR/HR)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => ({
    rrPos: window.AlmEValue.eValues('RR', 2.0, 1.5, 2.7),
    rrNeg: window.AlmEValue.eValues('RR', 0.6, 0.4, 0.9),
    or: window.AlmEValue.eValues('OR', 2.0, 1.5, 2.7, { rare: false }),
    hr: window.AlmEValue.eValues('HR', 1.6, 1.2, 2.1, { rare: false }),
  }));
  expect(r.rrPos.point).toBeCloseTo(3.414214, 5); expect(r.rrPos.ci).toBeCloseTo(2.366025, 5);
  expect(r.rrNeg.point).toBeCloseTo(2.720759, 5); expect(r.rrNeg.ci).toBeCloseTo(1.462475, 5);
  expect(r.or.point).toBeCloseTo(2.179580, 5); expect(r.or.ci).toBeCloseTo(1.749392, 5);
  expect(r.or.rr.point).toBeCloseTo(1.414214, 5);
  expect(r.hr.point).toBeCloseTo(2.112944, 5); expect(r.hr.ci).toBeCloseTo(1.525531, 5);
  expect(errs, 'no console errors').toEqual([]);
});

test('effect-size-converter E-value widget renders + exposes accessor', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => window.__almLastEValue && window.__almLastEValue());
  expect(o, 'widget computed default RR=2').toBeTruthy();
  expect(o.point).toBeCloseTo(3.414214, 4);
  const txt = await page.textContent('#ev-out');
  expect(txt).toContain('E-value');
});
