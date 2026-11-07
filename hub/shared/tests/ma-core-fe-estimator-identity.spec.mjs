/**
 * Synthetic estimator-identity regression for the shared inverse-variance core.
 * No article source, frozen scientific record or external oracle is processed.
 * A positive tau2 override must never turn method:'FE' into random effects.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/workbench/index.html';

test('FE ignores a caller-supplied positive heterogeneity override', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    const core = window.AlmMaCore;
    const yi = Object.freeze([0, 2, 3]);
    const vi = Object.freeze([0.04, 0.10, 0.20]);
    const weights = vi.map(v => 1 / v);
    const sw = weights.reduce((sum, w) => sum + w, 0);
    const reference = {
      mu: weights.reduce((sum, w, i) => sum + w * yi[i], 0) / sw,
      se: Math.sqrt(1 / sw),
    };
    return {
      reference,
      fixed: core.pool(yi, vi, { method: 'FE' }),
      forced: core.pool(yi, vi, { method: 'FE', tau2: 10, knha: true, pi: true }),
      randomOverride: core.pool(yi, vi, { method: 'PM', tau2: 10 }),
      inputUnchanged: yi.join(',') === '0,2,3' && vi.join(',') === '0.04,0.1,0.2',
    };
  });

  expect(result.inputUnchanged).toBe(true);
  expect(result.fixed.tau2).toBe(0);
  expect(result.forced.tau2).toBe(0);
  expect(result.forced.knha).toBe(false);
  expect(result.forced).not.toHaveProperty('piLo');
  expect(result.forced).toEqual(result.fixed);
  expect(result.fixed.mu).toBeCloseTo(result.reference.mu, 12);
  expect(result.fixed.se).toBeCloseTo(result.reference.se, 12);
  expect(result.randomOverride.tau2).toBe(10);
  expect(Math.abs(result.randomOverride.mu - result.fixed.mu)).toBeGreaterThan(0.5);
});

test('FE override cannot break synthetic unit/translation invariance', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    const core = window.AlmMaCore;
    const yi = [-0.25, 0.8, 1.6, 0.3];
    const vi = [0.08, 0.13, 0.2, 0.05];
    const options = { method: 'FE', tau2: 300 };
    const original = core.pool(yi, vi, options);
    const shift = 7;
    const moved = core.pool(yi.map(x => x + shift), vi, options);
    const scale = 3;
    const scaled = core.pool(yi.map(x => x * scale), vi.map(v => v * scale * scale), options);
    return { original, moved, scaled, shift, scale };
  });
  const { original, moved, scaled, shift, scale } = result;
  for (const fit of [original, moved, scaled]) {
    expect(fit.tau2).toBe(0);
    expect(fit.method).toBe('FE');
  }
  expect(moved.mu).toBeCloseTo(original.mu + shift, 11);
  expect(moved.se).toBeCloseTo(original.se, 11);
  expect(scaled.mu).toBeCloseTo(original.mu * scale, 11);
  expect(scaled.se).toBeCloseTo(original.se * scale, 11);
  expect(scaled.I2).toBeCloseTo(original.I2, 10);
});
