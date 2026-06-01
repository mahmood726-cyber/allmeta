/**
 * R-parity for the webr-validator's browser fit (browserFit → AlmMaCore.pool) vs
 * metafor::rma on a deliberately heterogeneous 8-study set (k<10 so DL, PM and REML
 * give distinct τ²). This locks the fix that replaced the validator's hand-rolled
 * REML (which matched metafor only ~85% and applied an HKSJ q-floor metafor does not)
 * with the parity-tested shared core, and proves the validator no longer silently
 * swaps DL→PM for k<10 (the browser fit must equal whatever the generated R runs).
 *
 * metafor 4.x references (yi/sei in spec):
 *   REML+knha: est=0.4269549017 se=0.1815234631 ci=[-0.0022798813,0.8561896847] tau2=0.2005272995 I2=79.4567848740 QE=31.6194555661
 *   PM+z:      est=0.4274874244 se=0.1815161079 ci=[ 0.0717223903,0.7832524585] tau2=0.1980780480 I2=79.2554612875
 *   DL+z:      est=0.4311529625 se=0.1758795613 ci=[ 0.0864353568,0.7758705683] tau2=0.1823439407 I2=77.8617314097
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/webr-validator/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

const YI = [0.42, -0.18, 0.91, 0.05, 0.67, -0.33, 1.12, 0.28];
const SEI = [0.20, 0.35, 0.15, 0.40, 0.22, 0.30, 0.18, 0.25];

const REF = {
  REMLknha: { est: 0.4269549017, se: 0.1815234631, lb: -0.0022798813, ub: 0.8561896847, tau2: 0.2005272995, I2: 79.4567848740 },
  PMz: { est: 0.4274874244, se: 0.1815161079, lb: 0.0717223903, ub: 0.7832524585, tau2: 0.1980780480, I2: 79.2554612875 },
  DLz: { est: 0.4311529625, se: 0.1758795613, lb: 0.0864353568, ub: 0.7758705683, tau2: 0.1823439407, I2: 77.8617314097 },
};

test('validator browserFit matches metafor for REML/PM/DL', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almValidatorFit === 'function' && window.AlmMaCore, { timeout: 10000 });

  const fits = await page.evaluate(({ yi, sei }) => {
    const studies = yi.map((e, i) => ({ est: e, se: sei[i], v: sei[i] * sei[i] }));
    const f = window.__almValidatorFit;
    return {
      REMLknha: f(studies, 'REML', 'knha'),
      PMz: f(studies, 'PM', 'z'),
      DLz: f(studies, 'DL', 'z'),
    };
  }, { yi: YI, sei: SEI });

  for (const key of ['REMLknha', 'PMz', 'DLz']) {
    const got = fits[key], ref = REF[key];
    // REML/DL have (near) closed-form τ² → match metafor to ~1e-6. PM is iterative in
    // both, but metafor's PM stops at ~1e-5 on Δτ² while ma-core bisects to machine
    // precision, so they agree only to ~1e-4 (ma-core is the more exact Q_gen=k-1 root).
    const dp = key === 'PMz' ? 4 : 6, dpCi = key === 'PMz' ? 4 : 5, dpI2 = key === 'PMz' ? 2 : 3;
    expect(got.k, key).toBe(8);
    expect(got.estimate, key + ' est').toBeCloseTo(ref.est, dp);
    expect(got.se, key + ' se').toBeCloseTo(ref.se, dp);
    expect(got.tau2, key + ' tau2').toBeCloseTo(ref.tau2, dp);
    expect(got.ci_lb, key + ' ci.lb').toBeCloseTo(ref.lb, dpCi);
    expect(got.ci_ub, key + ' ci.ub').toBeCloseTo(ref.ub, dpCi);
    expect(got.I2, key + ' I2').toBeCloseTo(ref.I2, dpI2);
    expect(got.QE, key + ' QE').toBeCloseTo(31.6194555661, 5);
  }

  // The whole point: DL at k=8 is NOT silently swapped to PM — its τ² is distinct.
  expect(Math.abs(fits.DLz.tau2 - fits.PMz.tau2)).toBeGreaterThan(0.01);
  expect(errs, 'no console errors').toEqual([]);
});
