/**
 * R-parity for the RVE (Hedges-Tipton-Johnson CORR) meta-regression engine vs
 * robumeta::robu(model="CORR") on the app's built-in example (5 clusters, 13
 * effects, predictors p1,p2 + intercept):
 *
 *   robu(yi~p1+p2, studynum, var.eff.size=vi, modelweights="CORR")
 *   → β = [0.76693135, -0.14444423, -0.02675033]   (matches to ~1e-7)
 *   → SE (CR2, small=TRUE) = [0.22222, 0.15533, 0.01016]
 *
 * The engine reproduces the COEFFICIENTS essentially exactly (the working-model
 * weights match robumeta), but uses a CR1 correction, so its robust SEs run
 * ~20-30% BELOW robumeta's CR2 at this small m=5 (anticonservative — documented
 * in the app footer; CR2 is roadmapped). This test pins the verified β parity and
 * asserts the SEs sit below the CR2 reference (guarding against silent drift and
 * recording the known gap).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/rve-meta/index.html';

const ROWS = [
  ['s1', 0.45, 0.04, 1, 6], ['s1', 0.38, 0.05, 1, 6], ['s1', 0.55, 0.06, 1, 6],
  ['s2', 0.22, 0.03, 1, 12], ['s2', 0.31, 0.04, 1, 12],
  ['s3', 0.18, 0.02, 0, 18], ['s3', 0.25, 0.03, 0, 18], ['s3', 0.30, 0.04, 0, 18],
  ['s4', 0.60, 0.05, 1, 4], ['s4', 0.55, 0.06, 1, 4],
  ['s5', 0.12, 0.02, 0, 24], ['s5', 0.20, 0.03, 0, 24], ['s5', 0.16, 0.025, 0, 24],
].map(d => ({ cluster: d[0], yi: d[1], vi: d[2], X: [1, d[3], d[4]] }));

const BETA = [0.76693135, -0.14444423, -0.02675033];
const SE_CR2 = [0.22222, 0.15533, 0.01016]; // robumeta small=TRUE reference

test('rve-meta coefficients match robumeta::robu(CORR) to ~1e-6', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((rows) => {
    const fit = window.AlmRVE.fitCORR(rows, { rho: 0.8 });
    return { beta: fit.beta, se: fit.se_robust, tau2: fit.tau2 };
  }, ROWS);
  console.log('  rve:', JSON.stringify(r));

  for (let i = 0; i < 3; i++) expect(r.beta[i]).toBeCloseTo(BETA[i], 6);
  expect(r.tau2).toBeLessThan(1e-6);
  // CR1 SEs are below the CR2 reference (anticonservative at small m) — documented.
  for (let i = 0; i < 3; i++) {
    expect(r.se[i]).toBeLessThan(SE_CR2[i]);            // CR1 < CR2 here
    expect(r.se[i]).toBeGreaterThan(SE_CR2[i] * 0.6);   // but within a sane band (≈0.7x)
  }
});
