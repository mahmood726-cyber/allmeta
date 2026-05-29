/**
 * R-parity for the subgroup between-group Q test (Q_bw). It must centre on the
 * inverse-variance-weighted mean of the SUBGROUP estimates (M = Σ w_g μ_g / Σ w_g),
 * not the all-studies pooled effect. Ground truth from meta::metagen:
 *
 *   metagen(TE, seTE, subgroup=grp, method.tau="PM", common=FALSE)
 *   → subgroup RE: Low μ=-0.1930278 se=0.0447137; High μ=-0.4436222 se=0.0666188
 *   → Q.b.random = 9.7551401, df = 1, p = 0.0017882
 *
 * Regression guard for the 2026-05-29 fix: the old code centred Q_bw on the
 * all-studies RE pool (μ=-0.2901) giving Q_bw=10.024 — inflated, overstating the
 * subgroup difference.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/cumulative-subgroup/index.html';

const STUDIES = [
  { est: -0.22, se: 0.14, group: 'Low' }, { est: -0.30, se: 0.12, group: 'Low' },
  { est: -0.18, se: 0.10, group: 'Low' }, { est: -0.10, se: 0.08, group: 'Low' },
  { est: -0.25, se: 0.09, group: 'Low' }, { est: -0.42, se: 0.15, group: 'High' },
  { est: -0.38, se: 0.11, group: 'High' }, { est: -0.48, se: 0.13, group: 'High' },
  { est: -0.55, se: 0.16, group: 'High' },
].map(s => ({ ...s, v: s.se * s.se }));

test('cumulative-subgroup Q_bw matches meta::metagen Q.b.random', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((studies) => window.__almSubgroup(studies), STUDIES);
  console.log('  subgroup:', JSON.stringify({ M: r.M_bw, Qb: r.Q_bw, df: r.df_bw, p: r.pQ, groups: r.groups.map(g => ({ n: g.name, mu: g.mu, se: g.se })) }));

  // Per-group RE pools match meta.
  const low = r.groups.find(g => g.name === 'Low'), high = r.groups.find(g => g.name === 'High');
  expect(low.mu).toBeCloseTo(-0.1930278, 4);
  expect(low.se).toBeCloseTo(0.0447137, 4);
  expect(high.mu).toBeCloseTo(-0.4436222, 4);
  expect(high.se).toBeCloseTo(0.0666188, 4);
  // Centre is the IV-weighted mean of subgroup estimates, not the all-studies pool (-0.2901).
  expect(r.M_bw).toBeCloseTo(-0.2708571, 4);
  // Between-group Q test matches meta::metagen.
  expect(r.Q_bw).toBeCloseTo(9.7551401, 3);
  expect(r.df_bw).toBe(1);
  expect(r.pQ).toBeCloseTo(0.0017882, 4);
  // Guard against the old all-studies-pool centre (Q_bw would be ~10.024).
  expect(r.Q_bw).toBeLessThan(9.9);
});
