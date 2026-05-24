/**
 * workbench-parity.spec.mjs — MA Workbench canonical Paule-Mandel
 * random-effects pool R-parity.
 *
 * workbench is the ma-studies-v1 *consumer* (forest/funnel/het/TSA/
 * pooled headline). poolAll() = canonical PM (tau2 = root of
 * Q(tau2)=k-1) + IV random-effects pool. Deterministic → tight 1e-6.
 * Oracle: workbench/tests/fixtures/workbench-oracle.R (canonical PM,
 * NOT metafor's iterative method="PM" variant).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/workbench/';
const O = JSON.parse(readFileSync(
  new URL('../../../workbench/tests/fixtures/workbench-oracle.json', import.meta.url), 'utf-8'));
const TOL = 1e-6;

test.describe('workbench', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => typeof window.__almWorkbench === 'function', { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('canonical Paule-Mandel RE pool R-parity', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => typeof window.__almWorkbench === 'function', { timeout: 10_000 });
    const r = await page.evaluate(
      (s) => window.__almWorkbench(s), O.studies);

    const near = (g, e, n, tol = TOL) =>
      expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(tol);

    expect(r.k, 'k').toBe(O.k);
    near(r.tau2, O.tau2, 'Paule-Mandel tau2', 1e-7);
    near(r.mu, O.mu, 'RE pooled estimate');
    near(r.se, O.se, 'RE pooled SE');
    near(r.lo, O.lo, 'CI lower');
    near(r.hi, O.hi, 'CI upper');
    near(r.Q, O.Q, 'fixed-effect Cochran Q');
    near(r.I2, O.I2, 'I^2');
  });
});
