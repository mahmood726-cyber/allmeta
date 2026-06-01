/**
 * R-parity for the PURE-JS bivariate random-effects DTA MLE (shared/dta-bivariate.js) vs
 * mada::reitsma(method="ml") on the AuditC dataset (14 studies, 2 with FN=0). mada applies
 * a +0.5 continuity correction to ALL studies (correction.control="all") when any cell is 0.
 *   μ_logitSe = 2.07625908, μ_logitFPR = -1.26244709,
 *   Σ = [[1.22384177, 0.58323292],[0.58323292, 0.37488242]].
 * This is a genuine iterative ML fit (GLS-profiled μ, Cholesky Σ, Nelder-Mead) — NO R/WASM.
 * Surfaced in dta-sroc alongside the Moses SROC; the app also reports LR± (delta-method CIs),
 * the diagnostic OR, and the Spearman threshold-effect correlation.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/dta-sroc/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const TP = [47,126,19,36,130,84,68,752,59,142,137,57,34,152], FN = [9,51,10,3,19,2,0,0,5,50,24,3,1,51];
const FP = [101,272,12,78,211,68,112,3226,55,571,107,103,21,88], TN = [738,1543,192,276,959,89,423,2977,136,2788,358,437,56,264];
const ROWS = TP.map((_, i) => ({ tp: TP[i], fp: FP[i], fn: FN[i], tn: TN[i] }));

test('bivariate ML matches mada::reitsma(method="ml")', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const f = await page.evaluate((rows) => window.AlmDTABivariate.fit(rows), ROWS);
  expect(f.muLogitSe).toBeCloseTo(2.07625908, 4);
  expect(f.muLogitFPR).toBeCloseTo(-1.26244709, 4);
  expect(f.Sigma[0][0]).toBeCloseTo(1.22384177, 4);
  expect(f.Sigma[0][1]).toBeCloseTo(0.58323292, 4);
  expect(f.Sigma[1][1]).toBeCloseTo(0.37488242, 4);
  // summary point + LR are positive/sane
  expect(f.sens).toBeCloseTo(0.8886, 3);
  expect(f.spec).toBeCloseTo(0.7794, 3);
  expect(f.lrPos).toBeGreaterThan(1);
  expect(f.lrNeg).toBeLessThan(1);
  expect(f.lrPosCI[0]).toBeLessThan(f.lrPos);
  expect(errs, 'no console errors').toEqual([]);
});

test('threshold Spearman + dta-sroc wires the bivariate fit', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const rho = await page.evaluate((rows) => window.AlmDTABivariate.thresholdSpearman(rows), ROWS);
  expect(Math.abs(rho)).toBeLessThanOrEqual(1);
  await page.waitForFunction(() => typeof window.__almBivariate === 'function', { timeout: 10000 });
  const b = await page.evaluate(() => window.__almBivariate());
  expect(b).toBeTruthy();
  expect(typeof b.dor).toBe('number');
});
