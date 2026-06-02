/**
 * heterogeneity: the τ² estimator dropdown now offers PM, REML, ML, EB, SJ, HE,
 * HS, DL — all delegating to shared/ma-core.js (validated vs metafor::rma).
 * This spec confirms each new option selects cleanly (no console error, τ² stat
 * renders) and that AlmMaCore exposes the new estimators returning finite τ².
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/heterogeneity/';
const NEW = ['ml', 'eb', 'sj', 'he', 'hs'];

test.describe('heterogeneity τ² estimator menu', () => {

  test('AlmMaCore exposes the new estimators (finite τ² on a k=8 set)', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => window.AlmMaCore && typeof window.AlmMaCore.tau2SJ === 'function', { timeout: 10_000 });
    const r = await page.evaluate(() => {
      const yi = [0.20, 0.50, -0.10, 0.80, 0.30, 0.60, 0.10, 0.45];
      const vi = [0.020, 0.030, 0.015, 0.050, 0.025, 0.040, 0.018, 0.030];
      const C = window.AlmMaCore;
      return { ml: C.tau2ML(yi, vi), he: C.tau2HE(yi, vi), hs: C.tau2HS(yi, vi), sj: C.tau2SJ(yi, vi) };
    });
    // Sanity vs metafor 4.6.0 captured values.
    expect(r.ml).toBeCloseTo(0.04404704, 5);
    expect(r.he).toBeCloseTo(0.05538393, 5);
    expect(r.hs).toBeCloseTo(0.04368853, 5);
    expect(r.sj).toBeCloseTo(0.05989549, 5);
  });

  test('each new estimator option selects without error and renders τ²', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/frame-ancestors|ERR_CONNECTION_REFUSED/.test(t)) errors.push(t); } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => document.getElementById('f-tau2') && window.AlmMaCore, { timeout: 10_000 });
    for (const opt of NEW) {
      await page.selectOption('#f-tau2', opt);
      await page.waitForTimeout(150);
      // The stats panel should contain a τ² card after re-render.
      await expect(page.locator('.stats')).toContainText('τ²');
    }
    expect(errors, 'console errors: ' + errors.join('; ')).toEqual([]);
  });

});
