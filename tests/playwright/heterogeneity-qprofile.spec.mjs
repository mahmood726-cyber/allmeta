/**
 * R-parity regression for the Q-profile confidence interval on I² and τ²
 * (Viechtbauer 2007 — the method metafor::confint.rma.uni uses, prescribed by
 * advanced-stats.md for small k). Ground truth captured from:
 *
 *   r <- rma.uni(yi, vi, method="REML"); confint(r)
 *
 * Two cases: a homogeneous set (τ²=0, lower bounds clamp to 0) and a
 * heterogeneous set (both bounds strictly positive). Tolerance is set to
 * metafor's own uniroot resolution (~1e-4 on τ²); a wrong χ² tail, a dropped
 * s² term, or a swapped bound would miss by orders of magnitude more.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/heterogeneity/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

const CASES = [
  {
    name: 'heterogeneous (k=8, τ²>0)',
    yi: [0.80, 0.20, 0.95, -0.10, 0.55, 0.70, 0.05, 0.40],
    vi: [0.02, 0.03, 0.015, 0.04, 0.025, 0.02, 0.05, 0.03],
    expect: { tau2_lb: 0.031707203, tau2_ub: 0.545204664, I2_lb: 55.3285272, I2_ub: 95.5151118 },
  },
  {
    name: 'homogeneous (k=5, τ²=0)',
    yi: [0.20, -0.10, 0.15, 0.05, -0.02],
    vi: [0.040, 0.030, 0.025, 0.020, 0.015],
    expect: { tau2_lb: 0, tau2_ub: 0.092356136, I2_lb: 0, I2_ub: 79.4243114 },
  },
];

for (const c of CASES) {
  test(`heterogeneity Q-profile CI matches metafor::confint — ${c.name}`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(URL, { waitUntil: 'load' });
    const r = await page.evaluate((cc) => {
      const rows = cc.yi.map((yi, i) => ({ study: 'S' + i, yi, vi: cc.vi[i] }));
      window.__almLoad(rows);
      return window.__almResults();
    }, c);
    console.log('  ', c.name, JSON.stringify(r));

    expect(r.k).toBe(c.yi.length);
    expect(r.tau2_ci_lb, 'τ² lower bound present').toBeCloseTo(c.expect.tau2_lb, 3);
    expect(r.tau2_ci_ub, 'τ² upper bound').toBeCloseTo(c.expect.tau2_ub, 3);
    expect(r.I2_ci_lb, 'I² lower bound').toBeCloseTo(c.expect.I2_lb, 1);
    expect(r.I2_ci_ub, 'I² upper bound').toBeCloseTo(c.expect.I2_ub, 1);
    // CI must bracket the point estimate.
    expect(r.I2_ci_lb).toBeLessThanOrEqual(r.I2 + 1e-6);
    expect(r.I2_ci_ub).toBeGreaterThanOrEqual(r.I2 - 1e-6);
    expect(errors, 'no console errors').toEqual([]);
  });
}
