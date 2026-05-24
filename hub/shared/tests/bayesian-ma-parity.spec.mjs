/**
 * bayesian-ma-parity.spec.mjs — conjugate normal-normal R-parity.
 *
 * bayesian-ma is a DETERMINISTIC closed-form conjugate posterior (no
 * MCMC), so exact analytic parity is the correct validation (R-hat/ESS
 * are inapplicable to a closed-form posterior). Oracle
 * (bayesian-ma/tests/fixtures/bma-oracle.R): metafor PM tau2 + the exact
 * conjugate posterior + R's exact pnorm for tail/ROPE probabilities.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/bayesian-ma/';
const O = JSON.parse(readFileSync(
  new URL('../../../bayesian-ma/tests/fixtures/bma-oracle.json', import.meta.url), 'utf-8'));
const TOL = 1e-9;        // exact closed-form posterior
// Canonical Paule-Mandel = root of Q(tau2)=k-1 (NOT metafor's iterative
// "PM" variant, which is ~1e-5 different). App bisection matches to ~3e-10.
const PM_TOL = 1e-7;

test.describe('bayesian-ma', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almBayesMA === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('conjugate posterior + PM tau2 + tail/ROPE R-parity',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almBayesMA === 'function',
        { timeout: 10_000 });

      const call = (opts) => page.evaluate(
        ([s, o]) => window.__almBayesMA(s, o), [O.studies, opts]);
      const near = (g, e, n, tol = TOL) =>
        expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(tol);

      // (1) Fixed tau2=0 — fully exact.
      const a = await call({ mu0: O.mu0, tau0: O.tau0, tau2: 0,
        threshold: O.threshold, rope: O.rope });
      near(a.post.mu, O.fixed0.mu, 'fixed0 postMean');
      near(a.post.sd, O.fixed0.sd, 'fixed0 postSD');
      near(a.post.lo, O.fixed0.lo, 'fixed0 CrI lo');
      near(a.post.hi, O.fixed0.hi, 'fixed0 CrI hi');
      near(a.pLess, O.fixed0.pLess, 'fixed0 P(theta<thr)');
      near(a.pInside, O.fixed0.pInside, 'fixed0 P(ROPE)');

      // (2) Paule-Mandel tau2 vs metafor rma(method="PM").
      const b = await call({ mu0: O.mu0, tau0: O.tau0,
        threshold: O.threshold, rope: O.rope });
      near(b.tau2PM, O.tau2_pm, 'Paule-Mandel tau2 vs metafor', PM_TOL);
      near(b.tau2, O.tau2_pm, 'tau2 used (=PM)', PM_TOL);

      // (3) Conjugate posterior at metafor's PM tau2 — isolates the
      //     posterior algebra from the tau2-root tolerance (exact).
      const c = await call({ mu0: O.mu0, tau0: O.tau0, tau2: O.tau2_pm,
        threshold: O.threshold, rope: O.rope });
      near(c.post.mu, O.pm.mu, 'PM postMean');
      near(c.post.sd, O.pm.sd, 'PM postSD');
      near(c.post.lo, O.pm.lo, 'PM CrI lo');
      near(c.post.hi, O.pm.hi, 'PM CrI hi');
      near(c.pLess, O.pm.pLess, 'PM P(theta<thr)');
      near(c.pInside, O.pm.pInside, 'PM P(ROPE)');
    });
});
