/**
 * R-parity regression for forest-plot's 95% prediction interval. It previously
 * used t_{k-2} (superseded IntHout-2016 — ~3x too wide at k=3); now uses t_{k-1}
 * per Cochrane Handbook v6.5, matching metafor::predict. Ground truth:
 *
 *   r <- rma.uni(yi=c(0.40,-0.20,0.55,0.10), vi=c(0.05,0.06,0.04,0.05),
 *                method="PM", test="knha"); predict(r)
 *   → μ=0.22957, τ²=0.05930, PI=[-0.70650, 1.16564]  (t_{k-1}=qt(.975,3)=3.1824)
 *
 * The old t_{k-2} would have given the too-wide [-1.036, 1.495].
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/forest-plot/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('forest-plot 95% PI matches metafor::predict (t_{k-1})', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const yi = [0.40, -0.20, 0.55, 0.10], vi = [0.05, 0.06, 0.04, 0.05];
    window.__almLoad(yi.map((y, i) => ({ study: 'S' + i, yi: y, vi: vi[i] })));
    return window.__almResults();
  });
  console.log('  forest-plot PI:', JSON.stringify({ mu: r.re_mu, tau2: r.tau2, pi: [r.pi_lb, r.pi_ub] }));

  expect(r.k).toBe(4);
  expect(r.re_mu).toBeCloseTo(0.22957, 4);
  expect(r.tau2).toBeCloseTo(0.05930, 4);
  expect(r.pi_lb).toBeCloseTo(-0.70650, 3);
  expect(r.pi_ub).toBeCloseTo(1.16564, 3);
  // Guard against the old t_{k-2} width (would be ~[-1.036, 1.495]).
  expect(r.pi_lb).toBeGreaterThan(-0.85);
  expect(errors, 'no console errors').toEqual([]);
});

test('forest-plot Q-profile I²/τ² CI matches metafor::confint', async ({ page }) => {
  // Heterogeneous k=8 set; metafor confint → I² CI [55.33, 95.52], τ² CI [0.0317, 0.5452].
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const yi = [0.80, 0.20, 0.95, -0.10, 0.55, 0.70, 0.05, 0.40];
    const vi = [0.02, 0.03, 0.015, 0.04, 0.025, 0.02, 0.05, 0.03];
    window.__almLoad(yi.map((y, i) => ({ study: 'S' + i, yi: y, vi: vi[i] })));
    return window.__almResults();
  });
  console.log('  forest-plot I² CI:', JSON.stringify({ I2: r.I2, I2ci: [r.I2_ci_lb, r.I2_ci_ub], tau2ci: [r.tau2_ci_lb, r.tau2_ci_ub] }));

  expect(r.I2_ci_lb).toBeCloseTo(55.3285272, 1);
  expect(r.I2_ci_ub).toBeCloseTo(95.5151118, 1);
  expect(r.tau2_ci_lb).toBeCloseTo(0.031707203, 3);
  expect(r.tau2_ci_ub).toBeCloseTo(0.545204664, 3);
  // CI brackets the point estimate.
  expect(r.I2_ci_lb).toBeLessThanOrEqual(r.I2 + 1e-6);
  expect(r.I2_ci_ub).toBeGreaterThanOrEqual(r.I2 - 1e-6);
  expect(errors, 'no console errors').toEqual([]);
});
