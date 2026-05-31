/**
 * multilevel-ma 3-level prediction interval (Phase 4). PI for a new study's effect:
 * μ ± t_{J-1}·√(τ²_study + τ²_within + seHK²) via ma-core (the PI math is R-verified in
 * ma-core-parity). Structural guard: present, brackets μ, wider than the HKSJ CI (since it
 * adds the total between-study heterogeneity). Descriptive when J<10 (footer caveat).
 */
import { test, expect } from '@playwright/test';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('multilevel-ma PI present, brackets μ, wider than HKSJ CI', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8088/multilevel-ma/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastMlma === 'function' && window._almLastMlma(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastMlma());
  expect(o.pi_lb, 'PI present').not.toBeNull();
  expect(o.pi_lb).toBeLessThan(o.mu);
  expect(o.pi_ub).toBeGreaterThan(o.mu);
  expect(o.pi_lb).toBeLessThanOrEqual(o.ci_lb_hk + 1e-9);
  expect(o.pi_ub).toBeGreaterThanOrEqual(o.ci_ub_hk - 1e-9);
  expect(errs, 'no console errors').toEqual([]);
});
