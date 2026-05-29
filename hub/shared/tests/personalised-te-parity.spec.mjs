/**
 * R-parity for the personalised-TE empirical-Bayes shrinkage engine. The shrunk
 * subgroup estimates are the BLUP/empirical-Bayes predictor, so they must match
 * metafor::blup of a DL random-effects model fitted to the per-subgroup DL pools.
 * Ground truth on the example data (3 subgroups):
 *
 *   per-subgroup DL pools: young=-0.31386(se 0.07236), old=-0.53636(0.07514),
 *                          biomarker+=-0.67586(0.12034)
 *   across-subgroup: μ=-0.49364, σ²_between=0.0233495
 *   blup(): young=-0.34678, old=-0.52804, biomarker+=-0.60611
 *
 * The shrunk POINT estimates match metafor::blup exactly. The shrunk SE is
 * intentionally LARGER than metafor's plug-in blup$se (young 0.105 vs 0.068,
 * etc.) because the app adds the Morris-1983 τ²-uncertainty term
 * w(1-w)(ŷ-μ)² — the conservative, recommended EB variance. This test pins the
 * exact point-estimate parity and asserts se_shrunk ≥ the metafor plug-in se.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/personalised-te/index.html';

const RAW = [
  ['S1', 'young', -0.30, 0.020], ['S2', 'young', -0.25, 0.025], ['S3', 'young', -0.40, 0.018], ['S4', 'young', -0.28, 0.022],
  ['S1', 'old', -0.55, 0.022], ['S2', 'old', -0.50, 0.025], ['S3', 'old', -0.60, 0.020], ['S4', 'old', -0.48, 0.024],
  ['S1', 'biomarker+', -0.65, 0.030], ['S2', 'biomarker+', -0.70, 0.028],
];
const EXP = {
  mu: -0.4936426, sigma2: 0.0233495,
  pools: { young: -0.3138551, old: -0.5363559, 'biomarker+': -0.6758621 },
  blup: { young: -0.3467833, old: -0.5280389, 'biomarker+': -0.6061057 },
  blup_se_plugin: { young: 0.0680165, old: 0.0702983, 'biomarker+': 0.1023064 },
};

test('personalised-te shrinkage matches metafor::blup (Morris-conservative SE)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((raw) => {
    const rows = raw.map(x => ({ study: x[0], subgroup: x[1], yi: x[2], vi: x[3] }));
    return window.AlmPersonalisedTE.fit(rows);
  }, RAW);
  console.log('  personalised-te:', JSON.stringify({ mu: r.overall.mu, sig2: r.sigma2_between, sg: Object.fromEntries(Object.entries(r.subgroups).map(([k, v]) => [k, [v.theta_shrunk, v.se_shrunk]])) }));

  expect(r.overall.mu).toBeCloseTo(EXP.mu, 5);
  expect(r.sigma2_between).toBeCloseTo(EXP.sigma2, 5);
  for (const g of ['young', 'old', 'biomarker+']) {
    const s = r.subgroups[g];
    expect(s.yi_pooled).toBeCloseTo(EXP.pools[g], 5);          // DL subgroup pool
    expect(s.theta_shrunk).toBeCloseTo(EXP.blup[g], 5);        // BLUP point estimate — exact
    // Morris-1983 SE is conservative: ≥ metafor's plug-in blup se.
    expect(s.se_shrunk).toBeGreaterThanOrEqual(EXP.blup_se_plugin[g] - 1e-6);
  }
});
