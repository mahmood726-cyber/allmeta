/**
 * copas-parity.spec.mjs — Copas & Shi (2000) profile-MLE R-parity.
 *
 * The copas app's engine must reproduce metasens's copas.loglik.without.beta
 * profile MLE. Oracle (copas/tests/fixtures/copas-oracle.json) was generated
 * by calling metasens's OWN likelihood + optim(L-BFGS-B) at a reproducible
 * publication-probability path of (gamma0, gamma1) points, so this test is
 * pure engine parity, decoupled from R's contourLines() slope machinery.
 *
 * Feeds the JS engine the identical (gamma0, gamma1) the oracle used and
 * asserts (TE, rho, tau, seTE) match metasens to ~1e-4.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const COPAS_URL = 'http://localhost:8088/copas/';
const ORACLE = JSON.parse(readFileSync(
  'C:/Projects/allmeta/copas/tests/fixtures/copas-oracle.json', 'utf-8'));

// copas-tiny fixture (identical to copas-tiny.csv the oracle was built from).
const FIXTURE = [
  { study: 'S01', yi: 0.25, sei: 0.08 }, { study: 'S02', yi: 0.18, sei: 0.10 },
  { study: 'S03', yi: 0.40, sei: 0.15 }, { study: 'S04', yi: 0.30, sei: 0.09 },
  { study: 'S05', yi: 0.12, sei: 0.07 }, { study: 'S06', yi: 0.55, sei: 0.20 },
  { study: 'S07', yi: 0.22, sei: 0.08 }, { study: 'S08', yi: 0.32, sei: 0.12 },
  { study: 'S09', yi: 0.45, sei: 0.17 }, { study: 'S10', yi: 0.28, sei: 0.10 },
];

const TOL = 1e-4;       // TE / rho / tau parity vs metasens
const SE_TOL = 1e-3;    // seTE via numeric Hessian — looser

test('Copas profile-MLE R-parity vs metasens (copas-tiny publprob path)',
  async ({ page }) => {
    await page.goto(COPAS_URL);
    await page.waitForFunction(() => typeof window.__almCopasLoad === 'function',
      { timeout: 10_000 });
    await page.evaluate((rows) => window.__almCopasLoad(rows), FIXTURE);
    await page.waitForFunction(
      () => typeof window.__almCopasProfileMLE === 'function',
      { timeout: 10_000 });

    for (const pt of ORACLE.points) {
      const got = await page.evaluate(
        ([g0, g1]) => window.__almCopasProfileMLE(g0, g1),
        [pt.gamma0, pt.gamma1]);

      expect(Math.abs(got.TE - pt.TE),
        `publprob=${pt.publprob} TE: js=${got.TE} R=${pt.TE}`)
        .toBeLessThan(TOL);
      // rho is identified only under differential selection (g1>0). At g1=0
      // (no selection) the Copas effect/selection correlation has zero Fisher
      // information; metasens's reported rho there is purely its rho0 start
      // artifact, so a parity assertion would test the optimiser, not the
      // estimator. TE/tau/seTE remain identified and are asserted everywhere.
      if (Math.abs(pt.gamma1) > 1e-12) {
        expect(Math.abs(got.rho - pt.rho),
          `publprob=${pt.publprob} rho: js=${got.rho} R=${pt.rho}`)
          .toBeLessThan(TOL);
      }
      expect(Math.abs(got.tau - pt.tau),
        `publprob=${pt.publprob} tau: js=${got.tau} R=${pt.tau}`)
        .toBeLessThan(TOL);
      // seTE: raw Hessian-based value only (metasens's carry-forward fallback
      // is path-dependent and not reproducible via a stateless call).
      if (Number.isFinite(pt.seTE_hessian)) {
        expect(Math.abs(got.seTE - pt.seTE_hessian),
          `publprob=${pt.publprob} seTE: js=${got.seTE} R=${pt.seTE_hessian}`)
          .toBeLessThan(SE_TOL);
      }
    }
  });
