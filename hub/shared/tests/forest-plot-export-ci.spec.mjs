/**
 * Regression for the 2026-05-31 fix: _almForestState() built its exported `pool`
 * object with `ci_lb: re.ci_lb, ci_ub: re.ci_ub`, but poolRE_PM returns the RE CI
 * as `lo`/`hi` and never defines ci_lb/ci_ub. So the reproducibility report
 * (AlmReport) printed "95% CI: NA" and the live R-vs-JS verify compared undefined
 * CI bounds — even though a CI was computed and drawn on the diamond.
 * Fixed by reading re.lo/re.hi. This pins the exported CI bounds as real numbers
 * that match the RE HKSJ interval and bracket the pooled estimate.
 */
import { test, expect } from '@playwright/test';

test('forest-plot exported pool CI bounds are populated (not undefined)', async ({ page }) => {
  await page.goto('http://localhost:8088/forest-plot/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000); // example renders on load
  const p = await page.evaluate(() => {
    const s = window._almForestState();
    return s && s.pool ? { ci_lb: s.pool.ci_lb, ci_ub: s.pool.ci_ub, mu: s.pool.mu, lo: s.re && s.re.lo, hi: s.re && s.re.hi } : null;
  });
  expect(p, 'forest state present').not.toBeNull();
  expect(typeof p.ci_lb, 'ci_lb is a number').toBe('number');
  expect(typeof p.ci_ub, 'ci_ub is a number').toBe('number');
  expect(p.ci_lb).toBeCloseTo(p.lo, 9);     // equals the RE HKSJ CI poolRE_PM computed
  expect(p.ci_ub).toBeCloseTo(p.hi, 9);
  expect(p.ci_lb).toBeLessThan(p.mu);       // brackets the pooled estimate
  expect(p.ci_ub).toBeGreaterThan(p.mu);
});
