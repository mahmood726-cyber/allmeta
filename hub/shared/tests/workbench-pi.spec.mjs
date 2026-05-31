/**
 * R-parity for workbench's prediction interval. Previously a z-based approximation
 * (μ ± 1.96·√(τ²+SE²), gated k≥3); now the Cochrane v6.5 t_{k-1} PI via ma-core.
 * Oracle (workbench's PM pool on the canonical fixture):
 *   tau2=0.0091399884 mu=0.283837764 se=0.0698962701 k=5
 *   → PI = μ ± qt(.975,4)·√(τ²+se²) = 0.283837764 ± 2.7764451·√(0.0091399884+0.0048855)
 *        = [-0.11097, 0.67864]
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const O = JSON.parse(readFileSync(new URL('../../../workbench/tests/fixtures/workbench-oracle.json', import.meta.url), 'utf-8'));

test('workbench PI uses t_{k-1} (Cochrane v6.5), matches R', async ({ page }) => {
  await page.goto('http://localhost:8088/workbench/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almWorkbench === 'function', { timeout: 10000 });
  const r = await page.evaluate((s) => window.__almWorkbench(s), O.studies);
  // qt(.975,4)=2.776445105; sePred=sqrt(0.0091399884+0.0698962701^2)=sqrt(0.014025518)=0.118429...
  const t = 2.776445105, sePred = Math.sqrt(O.tau2 + O.se * O.se);
  const expLo = O.mu - t * sePred, expHi = O.mu + t * sePred;
  expect(r.piLo).toBeCloseTo(expLo, 6);
  expect(r.piHi).toBeCloseTo(expHi, 6);
  // Must be WIDER than the old z-based approx (t_{4} > z).
  const zLo = O.mu - 1.959963985 * sePred;
  expect(r.piLo).toBeLessThan(zLo);
});
