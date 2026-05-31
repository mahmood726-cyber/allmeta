/**
 * R-parity for the audited single-source pooler shared/ma-core.js vs metafor::rma
 * on a heterogeneous k=8 dataset (yi=c(.10,.30,.50,.20,.90,.40,1.10,.05),
 * sei=c(.20,.25,.18,.30,.22,.28,.35,.15)):
 *
 *   DL   τ²=0.0734430866 μ=0.4059483675 se=0.1269421050 I²=59.811091
 *   PM   τ²=0.0740705629 μ=0.4061133078 se=0.1272650356 I²=60.015415
 *   REML τ²=0.0712971154 μ=0.4053720468 se=0.1258303793 I²=59.096236
 *   DL+KNHA se=0.1272434242 ;  FE μ=0.3541625626 se=0.0769232414
 *
 * DL/REML/FE and the HKSJ SE match metafor to ≤1e-7. PM matches to ~1e-5: ma-core's
 * PM is the EXACT root of Q(τ²)=k−1 (Q at ma-core's τ² is 7.00000000 vs 7.00017 at
 * metafor's reported value — metafor's uniroot tolerance), so ma-core is at least as
 * accurate. Loaded in-browser via workbench (the first consumer of the shared core).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/workbench/index.html'; // any page that loads ma-core
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

const YI = [0.10, 0.30, 0.50, 0.20, 0.90, 0.40, 1.10, 0.05];
const SEI = [0.20, 0.25, 0.18, 0.30, 0.22, 0.28, 0.35, 0.15];
const VI = SEI.map(s => s * s);

const GT = {
  DL: { tau2: 0.0734430866, mu: 0.4059483675, se: 0.1269421050, I2: 59.811091 },
  PM: { tau2: 0.0740705629, mu: 0.4061133078, se: 0.1272650356, I2: 60.015415 },
  REML: { tau2: 0.0712971154, mu: 0.4053720468, se: 0.1258303793, I2: 59.096236 },
};

test('ma-core pool matches metafor::rma across DL/PM/REML', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const got = await page.evaluate(({ yi, vi }) => {
    const C = window.AlmMaCore;
    const o = {};
    for (const mth of ['DL', 'PM', 'REML']) o[mth] = C.pool(yi, vi, { method: mth });
    o.knha = C.pool(yi, vi, { method: 'DL', knha: true });
    o.fe = C.pool(yi, vi, { method: 'FE' });
    return o;
  }, { yi: YI, vi: VI });

  for (const mth of ['DL', 'REML']) {  // exact match
    expect(got[mth].tau2, mth).toBeCloseTo(GT[mth].tau2, 6);
    expect(got[mth].mu, mth).toBeCloseTo(GT[mth].mu, 6);
    expect(got[mth].se, mth).toBeCloseTo(GT[mth].se, 6);
    expect(got[mth].I2, mth).toBeCloseTo(GT[mth].I2, 3);
  }
  // PM: ma-core is the exact root; metafor's reported value carries its uniroot tol.
  expect(got.PM.tau2).toBeCloseTo(GT.PM.tau2, 4);
  expect(got.PM.mu).toBeCloseTo(GT.PM.mu, 5);
  expect(got.PM.se).toBeCloseTo(GT.PM.se, 5);
  // HKSJ SE + fixed effect.
  expect(got.knha.se).toBeCloseTo(0.1272434242, 6);
  expect(got.fe.mu).toBeCloseTo(0.3541625626, 6);
  expect(got.fe.se).toBeCloseTo(0.0769232414, 6);
  expect(errors, 'no console errors').toEqual([]);
});

test('ma-core HKSJ floor (advanced-stats.md) is opt-in and never narrows below DL', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ yi, vi }) => {
    const C = window.AlmMaCore;
    // A near-homogeneous set where Q < df → HKSJ q < 1 would narrow the CI; the floor blocks that.
    const hy = [0.20, 0.21, 0.19, 0.205, 0.195], hv = [0.04, 0.04, 0.04, 0.04, 0.04];
    return {
      noFloor: C.pool(hy, hv, { method: 'DL', knha: true }).se,
      floor: C.pool(hy, hv, { method: 'DL', knha: true, knhaFloor: true }).se,
      plainDL: C.pool(hy, hv, { method: 'DL' }).se,
    };
  }, { yi: YI, vi: VI });
  // Without the floor HKSJ narrows below the model SE; the floor keeps it ≥ the model SE.
  expect(r.floor).toBeGreaterThanOrEqual(r.plainDL - 1e-9);
  expect(r.noFloor).toBeLessThan(r.floor + 1e-9);
});

test('ma-core prediction interval = μ ± t_{k-1}·√(τ²+SE²) (Cochrane v6.5)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ yi, vi }) => {
    const C = window.AlmMaCore;
    const pool = C.pool(yi, vi, { method: 'PM', pi: true });
    const pi = C.predictionInterval({ mu: pool.mu, se: pool.se, tau2: pool.tau2, k: pool.k });
    return { piLo: pool.piLo, piHi: pool.piHi, lo: pi.lo, hi: pi.hi, t: pi.t,
             k1: C.predictionInterval({ mu: 0.2, se: 0.1, tau2: 0, k: 1 }) };
  }, { yi: YI, vi: VI });
  // PM, plain RE SE, k=8 → t_7 PI. R (t_{k-1}) = [-0.30432526, 1.11655187]; the ~1e-4
  // gap is ma-core's exact PM root vs metafor's uniroot τ² (documented above).
  expect(r.piLo).toBeCloseTo(-0.30432526, 4);
  expect(r.piHi).toBeCloseTo(1.11655187, 4);
  expect(r.lo).toBeCloseTo(r.piLo, 10);          // pool({pi}) and standalone agree
  expect(r.t).toBeCloseTo(2.36462425, 5);        // exact qt(0.975, 7), self-contained
  expect(r.k1, 'k<2 → null').toBeNull();
});
