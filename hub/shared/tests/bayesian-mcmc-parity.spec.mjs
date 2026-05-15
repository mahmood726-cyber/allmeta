/**
 * bayesian-mcmc-parity.spec.mjs — Gibbs sampler validation (done right).
 *
 * A real Gibbs/Metropolis sampler for the normal-normal RE model
 *   y_i ~ N(theta_i, s_i^2), theta_i ~ N(mu, tau^2),
 *   mu ~ N(0,1000^2), tau ~ half-normal(scale=tauPrior).
 * Correct validation paradigm (NOT fake tight parity on a stochastic
 * sampler):
 *   1. SEEDED REPRODUCIBILITY — same seed => bitwise-identical summaries
 *      (proves the seed fix; previously the seed arg was ignored).
 *   2. vs R `bayesmeta` (exact deterministic posterior) within a
 *      Monte-Carlo band (seeded => deterministic; tol >> observed
 *      deviation, << wrong-magnitude).
 *   3. Convergence diagnostics: R-hat ~ 1, ESS healthy, sane acceptance.
 * Oracle: bayesian-mcmc/tests/fixtures/mcmc-oracle.json (bayesmeta).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const URL = 'http://localhost:8088/bayesian-mcmc/';
const O = JSON.parse(readFileSync(
  'C:/Projects/allmeta/bayesian-mcmc/tests/fixtures/mcmc-oracle.json', 'utf-8'));
const OPTS = { iter: 15000, burn: 3000, tauPrior: O.tauPrior, seed: 12345, chains: 2 };

test.describe('bayesian-mcmc', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almMCMC === 'function',
      { timeout: 15_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('seeded reproducibility + bayesmeta MC-band + R-hat/ESS',
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(URL);
      await page.waitForFunction(() => typeof window.__almMCMC === 'function',
        { timeout: 15_000 });

      const r1 = await page.evaluate(([s, o]) => window.__almMCMC(s, o),
        [O.studies, OPTS]);
      const r2 = await page.evaluate(([s, o]) => window.__almMCMC(s, o),
        [O.studies, OPTS]);

      // 1. Seeded reproducibility — exact (deterministic given seed).
      expect(r2.mu.mean, 'repro mu.mean').toBe(r1.mu.mean);
      expect(r2.mu.sd, 'repro mu.sd').toBe(r1.mu.sd);
      expect(r2.tau.mean, 'repro tau.mean').toBe(r1.tau.mean);
      expect(r2.tau.sd, 'repro tau.sd').toBe(r1.tau.sd);

      // 2. vs bayesmeta exact posterior (Monte-Carlo band).
      const near = (g, e, tol, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} bayesmeta=${e}`)
          .toBeLessThan(tol);
      near(r1.mu.mean, O.mu.mean, 0.010, 'mu posterior mean');
      near(r1.mu.sd, O.mu.sd, 0.010, 'mu posterior sd');
      near(r1.mu.lo, O.mu.lo, 0.020, 'mu 2.5%');
      near(r1.mu.hi, O.mu.hi, 0.020, 'mu 97.5%');
      near(r1.tau.mean, O.tau.mean, 0.015, 'tau posterior mean');
      near(r1.tau.sd, O.tau.sd, 0.020, 'tau posterior sd');

      // 3. Convergence diagnostics.
      expect(r1.rhatMu, `R-hat mu=${r1.rhatMu}`).toBeGreaterThan(0.97);
      expect(r1.rhatMu).toBeLessThan(1.05);
      expect(r1.rhatTau, `R-hat tau=${r1.rhatTau}`).toBeLessThan(1.05);
      expect(r1.essMu, `ESS mu=${r1.essMu}`).toBeGreaterThan(1000);
      expect(r1.essTau, `ESS tau=${r1.essTau}`).toBeGreaterThan(300);
      expect(r1.acceptance, `acceptance=${r1.acceptance}`).toBeGreaterThan(0.10);
      expect(r1.acceptance).toBeLessThan(0.60);
    });
});
