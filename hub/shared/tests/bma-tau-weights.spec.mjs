/**
 * Regression for the BMA-across-τ²-priors weighting bug (2026-05-29). The
 * `uniform` prior lacked the τ=0 guard that halfNormal/halfCauchy have, so at the
 * τ²=0 grid node it returned (1/upper)/(2·1e-12) ≈ 5e10 — a spurious spike that
 * dominated its marginal-likelihood integral, giving the uniform prior a BMA
 * weight ≈ 1 and crowding out every other prior (defeating the model averaging).
 *
 * Ground-truth marginal likelihoods (μ-integrated likelihood × prior, integrated
 * in R; cross-checked with bayesmeta posteriors) on the app's example data:
 *   halfNormal(0.5)=50.6 (best), halfNormal(1.0)=26.5, uniform(0,5)=6.8 (worst).
 * So halfNormal(0.5) must carry the LARGEST weight and uniform a small one, with
 * weight ratio HN(0.5):uniform ≈ 7.4.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/bma-tau-priors/index.html';

const Y = [-0.42, -0.25, -0.55, -0.18, -0.38];
const VI = [0.012, 0.018, 0.025, 0.030, 0.022];

test('bma-tau BMA weights track marginal likelihoods (not dominated by uniform)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ y, vi }) => {
    const a = window.AlmBMA;
    const res = a.fit(y, vi, a.defaultModels());
    const w = {};
    res.perModel.forEach(m => { w[m.name] = m.weight; });
    return { w, muHat: res.muHat, sePost: res.sePost, uniform0: a.uniform(5)(0) };
  }, { y: Y, vi: VI });
  console.log('  bma weights:', JSON.stringify(r));

  // τ=0 guard restored: uniform density at the τ²=0 node is 0 (was ~5e10).
  expect(r.uniform0).toBe(0);
  // halfNormal(0.5) is the best-fitting prior → largest weight.
  const wHN05 = r.w['halfNormal(0.5)'], wU = r.w['uniform(5)'];
  for (const name of Object.keys(r.w)) {
    if (name !== 'halfNormal(0.5)') expect(wHN05).toBeGreaterThanOrEqual(r.w[name]);
  }
  // Uniform must NOT dominate (the bug gave it ≈1); it should be small.
  expect(wU).toBeLessThan(0.1);
  // Weight ratio HN(0.5):uniform tracks the true marginal-likelihood ratio (~7.4).
  expect(wHN05 / wU).toBeGreaterThan(5);
  expect(wHN05 / wU).toBeLessThan(10);
  // Weights sum to 1.
  const sum = Object.values(r.w).reduce((a, b) => a + b, 0);
  expect(sum).toBeCloseTo(1, 6);
  // BMA pooled effect is sensible (all per-prior μ ≈ -0.36).
  expect(r.muHat).toBeCloseTo(-0.361, 2);
});
