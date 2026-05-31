/**
 * R-parity for Duval-Tweedie trim-and-fill (shared/trimfill.js) vs metafor::trimfill
 * (estimator="L0"). Ground truth (strong small-study asymmetry, k=10):
 *   yi=c(.05,.08,.12,.20,.55,.62,.85,1.10,1.35,1.60) sei=c(.08,.09,.10,.12,.30,.33,.40,.48,.55,.62)
 *   FE      → k0=5 side=left  adj.mu=0.10795809 se=0.04421046 tau2=0
 *   DL      → k0=4 side=left  adj.mu=0.17956014 se=0.10864290 tau2=0.07327144
 *   FE(−yi) → k0=5 side=right adj.mu=-0.10795809 se=0.04421046  (mirror)
 * The funnel-plot app uses FE; the engine also supports RE. Host: funnel-plot (loads
 * ma-core + trimfill). The app additionally exposes window._almLastTrimFill().
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/funnel-plot/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const Y = [0.05,0.08,0.12,0.20,0.55,0.62,0.85,1.10,1.35,1.60];
const S = [0.08,0.09,0.10,0.12,0.30,0.33,0.40,0.48,0.55,0.62];
const V = S.map(x => x * x);

test('trim-and-fill matches metafor::trimfill (FE/DL, left/right)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const got = await page.evaluate(({ y, v }) => {
    const T = window.AlmTrimFill;
    return {
      fe: T.trimAndFill(y, v, { method: 'FE' }),
      dl: T.trimAndFill(y, v, { method: 'DL' }),
      feR: T.trimAndFill(y.map(x => -x), v, { method: 'FE' }),
    };
  }, { y: Y, v: V });

  expect(got.fe.k0).toBe(5); expect(got.fe.side).toBe('left');
  expect(got.fe.mu).toBeCloseTo(0.10795809, 6); expect(got.fe.se).toBeCloseTo(0.04421046, 6);
  expect(got.fe.tau2).toBeCloseTo(0, 8);
  expect(got.dl.k0).toBe(4); expect(got.dl.side).toBe('left');
  expect(got.dl.mu).toBeCloseTo(0.17956014, 6); expect(got.dl.se).toBeCloseTo(0.10864290, 5);
  expect(got.dl.tau2).toBeCloseTo(0.07327144, 6);
  expect(got.feR.k0).toBe(5); expect(got.feR.side).toBe('right');
  expect(got.feR.mu).toBeCloseTo(-0.10795809, 6);
  expect(errs, 'no console errors').toEqual([]);
});

test('funnel-plot wires trim-and-fill: accessor + imputed funnel markers', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastTrimFill === 'function', { timeout: 10000 });
  const tf = await page.evaluate(() => window._almLastTrimFill());
  expect(tf, 'trim-fill computed for default data').toBeTruthy();
  expect(tf.k0).toBeGreaterThanOrEqual(0);
  // If k0>0, imputed markers (dashed) appear in the funnel SVG.
  if (tf.k0 > 0) {
    const dashed = await page.$$eval('#svg-host circle[stroke-dasharray], svg circle[stroke-dasharray]', els => els.length);
    expect(dashed).toBe(tf.k0);
  }
});
