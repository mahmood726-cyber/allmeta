/**
 * R-parity for the CR2 bias-reduced RVE (Tipton 2015; Pustejovsky-Tipton 2018)
 * with HTJ CORR-model τ² and per-coefficient Satterthwaite df. Ground truth from
 * robumeta::robu(modelweights="CORR", rho=0.8, small=TRUE) on two datasets:
 *
 *   DS1 (m=5 clusters, between-study predictors → τ²=0): the app's built-in example
 *     τ²=0; β̂=[0.7669313482,-0.1444442324,-0.0267503340]
 *     CR2 SE=[0.2222243984,0.1553346743,0.0101629941]
 *     Satterthwaite df=[1.5001261028,1.1503210233,1.5245856792]
 *   DS2 (m=8 clusters, within-study-varying predictor → τ²>0):
 *     τ²=0.0153993225; β̂=[0.2548106139,0.4118008363,0.0256524256]
 *     CR2 SE=[0.0955610396,0.1009538690,0.0230901062]
 *     Satterthwaite df=[4.4773502613,4.8856310642,4.3639724148]
 *
 * Locks the 2026-05-31 upgrade from a scalar CR1 correction + df=m−p (disclosed
 * ~20-30% anticonservative at small m) to the fully bias-corrected CR2 estimator.
 * The engine reproduces robumeta to ~1e-11 in Node; the browser run is asserted
 * to ≤1e-5 (qt/pt round-tripping included).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/rve-meta/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>|ERR_CONNECTION_REFUSED/;

function rowsOf(d) {
  return d.study.map((s, i) => ({ cluster: String(s), yi: d.yi[i], vi: d.vi[i], X: [1, d.x1[i], d.x2[i]] }));
}
const DS1 = { study: [1,1,1,2,2,3,3,3,4,4,5,5,5], yi: [0.45,0.38,0.55,0.22,0.31,0.18,0.25,0.30,0.60,0.55,0.12,0.20,0.16], vi: [0.04,0.05,0.06,0.03,0.04,0.02,0.03,0.04,0.05,0.06,0.02,0.03,0.025], x1: [1,1,1,1,1,0,0,0,1,1,0,0,0], x2: [6,6,6,12,12,18,18,18,4,4,24,24,24] };
const DS2 = { study: [1,1,2,2,2,3,3,4,4,4,5,5,6,6,6,7,7,8,8], yi: [0.90,0.40,0.10,0.55,0.30,1.20,0.80,0.05,0.45,0.20,0.70,1.10,0.33,0.61,0.15,0.95,0.50,0.25,0.72], vi: [0.05,0.08,0.03,0.06,0.04,0.09,0.05,0.02,0.07,0.03,0.05,0.10,0.04,0.06,0.03,0.08,0.05,0.03,0.07], x1: [1,1,0,0,0,1,1,0,0,0,1,1,0,0,0,1,1,0,0], x2: [2,5,3,8,1,4,9,2,6,3,5,7,1,4,2,6,8,3,5] };

const GT1 = { tau2: 0, beta: [0.7669313482,-0.1444442324,-0.0267503340], se: [0.2222243984,0.1553346743,0.0101629941], df: [1.5001261028,1.1503210233,1.5245856792] };
const GT2 = { tau2: 0.0153993225, beta: [0.2548106139,0.4118008363,0.0256524256], se: [0.0955610396,0.1009538690,0.0230901062], df: [4.4773502613,4.8856310642,4.3639724148] };

async function fit(page, rows) {
  return page.evaluate((r) => {
    const f = window.AlmRVE.fitCORR(r, { rho: 0.8 });
    const s = window.AlmRVE.summary(f);
    return { tau2: f.tau2, beta: f.beta, se: f.se_robust, df: f.df, ci: s.map(x => [x.ci_lo, x.ci_hi]), p: s.map(x => x.p) };
  }, rows);
}

for (const [name, ds, gt] of [['DS1 (τ²=0, m=5)', DS1, GT1], ['DS2 (τ²>0, m=8)', DS2, GT2]]) {
  test(`rve-meta CR2 matches robumeta(small=TRUE) — ${name}`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(URL, { waitUntil: 'load' });
    const r = await fit(page, rowsOf(ds));
    console.log(`  ${name}: tau2=${r.tau2.toFixed(8)} se=[${r.se.map(x => x.toFixed(6)).join(', ')}] df=[${r.df.map(x => x.toFixed(4)).join(', ')}]`);

    expect(r.tau2).toBeCloseTo(gt.tau2, 6);
    for (let j = 0; j < 3; j++) {
      expect(r.beta[j], `beta[${j}]`).toBeCloseTo(gt.beta[j], 5);
      expect(r.se[j], `SE[${j}]`).toBeCloseTo(gt.se[j], 5);
      expect(r.df[j], `df[${j}]`).toBeCloseTo(gt.df[j], 4);
    }
    expect(errors, 'no console errors').toEqual([]);
  });
}

test('rve-meta CR2 SE is wider than CR1 at small m (bias correction is active)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const cmp = await page.evaluate((r) => {
    const cr2 = window.AlmRVE.fitCORR(r, { rho: 0.8, method: 'CR2' });
    const cr1 = window.AlmRVE.fitCORR(r, { rho: 0.8, method: 'CR1' });
    return { cr2: cr2.se_robust, cr1: cr1.se_robust };
  }, rowsOf(DS1));
  // CR2 ≥ CR1 on every coefficient at m=5 (CR1 was the anticonservative default).
  for (let j = 0; j < 3; j++) expect(cmp.cr2[j]).toBeGreaterThan(cmp.cr1[j]);
});
