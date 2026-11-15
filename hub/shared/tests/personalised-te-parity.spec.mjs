/**
 * R-parity for the personalised-TE empirical-Bayes shrinkage engine. The shrunk
 * subgroup estimates are the BLUP, so estimates, SEs and intervals must match
 * metafor::blup of a PM random-effects model fitted to the per-subgroup PM pools.
 * Ground truth on the example data (3 subgroups), R 4.6.0 / metafor 5.2.1,
 * rma(method="PM", control=list(tol=1e-15)) (lane audit7, run/pte.R):
 *
 *   per-subgroup PM pools (tau2 = 0 in each): young=-0.313855(se 0.072356),
 *                          old=-0.536356(0.075139), biomarker+=-0.675862(0.120344)
 *   across-subgroup: mu=-0.494124, sigma2_between=0.0244884
 *   blup(): young=-0.345606 (se 0.068181), old=-0.528444 (0.070481),
 *           biomarker+=-0.608323 (0.102926)
 *
 * Until lane audit7 this page did not load shared/ma-core.js, so in the browser the
 * engine fell back to DL (mu -0.493643, sigma2 0.0233495) and the SE used an
 * unsourced mixture variance labelled "Morris 1983" (young 0.105).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/personalised-te/index.html';

const RAW = [
  ['S1', 'young', -0.30, 0.020], ['S2', 'young', -0.25, 0.025], ['S3', 'young', -0.40, 0.018], ['S4', 'young', -0.28, 0.022],
  ['S1', 'old', -0.55, 0.022], ['S2', 'old', -0.50, 0.025], ['S3', 'old', -0.60, 0.020], ['S4', 'old', -0.48, 0.024],
  ['S1', 'biomarker+', -0.65, 0.030], ['S2', 'biomarker+', -0.70, 0.028],
];
const EXP = {
  mu: -0.494124, sigma2: 0.0244884,
  pools: { young: -0.313855, old: -0.536356, 'biomarker+': -0.675862 },
  blup: { young: -0.345606, old: -0.528444, 'biomarker+': -0.608323 },
  blup_se: { young: 0.068181, old: 0.070481, 'biomarker+': 0.102926 },
};

test('personalised-te shrinkage matches metafor::blup (PM)', async ({ page }) => {
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
    expect(s.yi_pooled).toBeCloseTo(EXP.pools[g], 5);          // PM subgroup pool
    expect(s.theta_shrunk).toBeCloseTo(EXP.blup[g], 5);        // BLUP point estimate
    expect(s.se_shrunk).toBeCloseTo(EXP.blup_se[g], 5);        // blup se
  }
});
