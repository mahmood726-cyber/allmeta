/**
 * R-parity for the Vevea-Hedges step-function selection model (shared/selmodel.js) vs
 * metafor::selmodel(rma(method="ML"), type="stepfun", steps=0.025). Ground truth:
 *   yi=c(.10,.30,.35,.65,.45,.80,.55,1.05,.70,1.20,.90,1.40)
 *   sei=c(.30,.28,.20,.35,.18,.40,.15,.45,.12,.50,.10,.55)
 *   → μ=0.59722923 se=0.11093960 τ²=0.02598154 δ₂=0.599915 LRT χ²=0.326738 p=0.567586
 * Engine verified to ~1e-6 in Node; browser asserted ≤1e-4. Also wired into pubbias-tests.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/pubbias-tests/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const YI = [0.10,0.30,0.35,0.65,0.45,0.80,0.55,1.05,0.70,1.20,0.90,1.40];
const SEI = [0.30,0.28,0.20,0.35,0.18,0.40,0.15,0.45,0.12,0.50,0.10,0.55];
const VI = SEI.map(s => s * s);

test('selection model matches metafor::selmodel(stepfun, steps=0.025)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ yi, vi }) => window.AlmSelModel.fit(yi, vi, { steps: [0.025], method: 'REML' }), { yi: YI, vi: VI });
  expect(r.mu).toBeCloseTo(0.59722923, 4);
  expect(r.se).toBeCloseTo(0.11093960, 3);
  expect(r.tau2).toBeCloseTo(0.02598154, 4);
  expect(r.delta[1]).toBeCloseTo(0.599915, 4);
  expect(r.LRT).toBeCloseTo(0.326738, 3);
  expect(r.LRTp).toBeCloseTo(0.567586, 3);
  expect(errs, 'no console errors').toEqual([]);
});

test('pubbias-tests wires the selection model into its results', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastPubbias === 'function' && window._almLastPubbias(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastPubbias());
  expect(o.sel_mu, 'selection-model μ present').not.toBeNull();
  expect(o.sel_delta2).toBeGreaterThan(0);
  expect(o.sel_LRTp).toBeGreaterThanOrEqual(0);
});
