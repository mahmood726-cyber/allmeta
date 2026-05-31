/**
 * R-parity for the dta-sroc Moses-Littenberg SROC regression (the prior spec only
 * checked UI mounting — the statistics were unverified). The app fits unweighted OLS
 * of D = logit(Se) − logit(FPR) on S = logit(Se) + logit(FPR), reporting the SROC
 * intercept α and slope β, plus the Spearman threshold-effect correlation between
 * logit(Se) and logit(FPR). Ground truth from R lm()/cor():
 *
 *   Default example (7 studies, no zero cells):
 *     α=4.30850244  β=0.46400383  ρ=−0.75000000
 *   Zero-cell study (+0.5 added to ALL 4 cells of any study with a zero cell):
 *     TP=c(50,40,60,30) FP=c(5,0,8,4) FN=c(10,8,12,15) TN=c(80,75,90,70)
 *     → α=3.02612719  β=−0.84761628  ρ=0.73786479
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/dta-sroc/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('dta-sroc default example: SROC α/β + Spearman ρ match R lm()/cor()', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE:' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => window.__almResults());
  console.log('  default:', JSON.stringify({ alpha: r.alpha, beta: r.beta, rho: r.spearman_rho, k: r.k }));
  expect(r.k).toBe(7);
  expect(r.alpha).toBeCloseTo(4.30850244, 6);
  expect(r.beta).toBeCloseTo(0.46400383, 6);
  expect(r.spearman_rho).toBeCloseTo(-0.75, 6);
  expect(errors, 'no console errors').toEqual([]);
});

test('dta-sroc zero-cell study: +0.5 continuity correction matches R', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const data = 'S1, 50, 5, 10, 80\nS2, 40, 0, 8, 75\nS3, 60, 8, 12, 90\nS4, 30, 4, 15, 70';
    document.getElementById('f-data').value = data;
    return window.__almResults();
  });
  console.log('  zero-cell:', JSON.stringify({ alpha: r.alpha, beta: r.beta, rho: r.spearman_rho, k: r.k }));
  expect(r.k).toBe(4);
  expect(r.alpha).toBeCloseTo(3.02612719, 6);
  expect(r.beta).toBeCloseTo(-0.84761628, 6);
  expect(r.spearman_rho).toBeCloseTo(0.73786479, 6);
  // The zero-cell study (S2, FP=0) must be flagged corrected.
  const s2 = r.rows.find(x => x.study === 'S2');
  expect(s2.corrected).toBe(1);
});
