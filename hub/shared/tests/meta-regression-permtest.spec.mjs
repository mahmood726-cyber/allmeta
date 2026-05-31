/**
 * R-parity for the meta-regression slope permutation test (shared/permutest.js) vs
 * metafor::permutest(rma(method="PM", test="knha"), exact=TRUE). On the k=7 subset
 * yi=c(.10,.30,.50,.20,.90,.40,1.10) sei=c(.20,.25,.18,.30,.22,.28,.35) xi=1..7:
 *   exact slope p = 0.04761905 (240/5040). The permutation RANK p matches metafor
 *   exactly (the HKSJ t differs ~0.4% in scale but the ordering — hence p — is identical).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/meta-regression/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const Y = [0.10,0.30,0.50,0.20,0.90,0.40,1.10];
const SE = [0.20,0.25,0.18,0.30,0.22,0.28,0.35];
const V = SE.map(s => s * s);
const X = [1,2,3,4,5,6,7];

test('meta-regression slope permutation test (exact) matches metafor::permutest', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ y, v, x }) => window.AlmPermTest.permTestSlope(y, v, x, { exactMax: 7 }), { y: Y, v: V, x: X });
  expect(r.exact).toBe(true);
  expect(r.nperm).toBe(5040);
  expect(r.p).toBeCloseTo(0.04761905, 6);
  expect(errs, 'no console errors').toEqual([]);
});

test('meta-regression wires the permutation test into its results', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastPerm === 'function' && window._almLastPerm(), { timeout: 10000 });
  const p = await page.evaluate(() => window._almLastPerm());
  expect(p.p).toBeGreaterThanOrEqual(0);
  expect(p.p).toBeLessThanOrEqual(1);
  expect(p.nperm).toBeGreaterThan(0);
});
