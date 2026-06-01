/**
 * R-parity for two-stage linear dose-response MA (shared/dose-response.js) vs
 * dosresmeta(formula=logrr~dose, method="reml") on the alcohol_cvd dataset (6 studies:
 * 4 case-control + 2 cumulative-incidence — PER-STUDY design type). dosresmeta:
 *   pooled slope = -0.00436541, se = 0.00588923, tau2 = 0.00010057.
 * The engine reconstructs the Greenland-Longnecker within-study covariance per design
 * type, fits a per-study GLS slope, and REML-pools — matching dosresmeta to ~1e-6.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = 'http://localhost:8088/dose-response-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const STUDIES = JSON.parse(readFileSync(new URL('./_dr_data.json', import.meta.url), 'utf-8'));

test('dose-response matches dosresmeta (alcohol_cvd, mixed cc/ci)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(APP, { waitUntil: 'load' });
  const r = await page.evaluate((studies) => window.AlmDoseResponse.fit(studies, { method: 'REML' }), STUDIES);
  expect(r.k).toBe(6);
  expect(r.slope).toBeCloseTo(-0.00436541, 5);
  expect(r.se).toBeCloseTo(0.00588923, 5);
  expect(r.tau2).toBeCloseTo(0.00010057, 5);
  expect(errs, 'no console errors').toEqual([]);
});

test('dose-response-ma app renders + exposes accessor', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastDoseResponse === 'function' && window._almLastDoseResponse(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastDoseResponse());
  expect(o.k).toBeGreaterThanOrEqual(2);
  expect(typeof o.slope).toBe('number');
});
