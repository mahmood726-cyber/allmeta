/**
 * R-parity for meta-regression's prediction interval at the mean covariate x̄.
 * App uses PM τ² + HKSJ. Ground truth metafor::rma(yi~xi, method="PM", test="knha") then
 * predict(newmods=mean(xi)) on yi=c(.10,.30,.50,.20,.90,.40,1.10,.05),
 * sei=c(.20,.25,.18,.30,.22,.28,.35,.15), xi=1..8:
 *   pred=0.41147290 se=0.13563932 PI(t_{k-2})=[-0.39759039, 1.22053619] (df=6)
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/meta-regression/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const DATA = [0.10,0.30,0.50,0.20,0.90,0.40,1.10,0.05]
  .map((y, i) => `S${i + 1}, ${y}, ${[0.20,0.25,0.18,0.30,0.22,0.28,0.35,0.15][i]}, ${i + 1}`).join('\n');

test('meta-regression PI at x̄ matches metafor predict(PM, knha)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const pi = await page.evaluate((data) => {
    const ta = document.getElementById('f-data');
    ta.value = data; ta.dispatchEvent(new Event('input', { bubbles: true }));
    return window._almLastPI();
  }, DATA);
  expect(pi, 'PI computed').toBeTruthy();
  expect(pi.xbar).toBeCloseTo(4.5, 6);
  expect(pi.pred).toBeCloseTo(0.41147290, 5);
  expect(pi.se).toBeCloseTo(0.13563932, 4);
  expect(pi.lo).toBeCloseTo(-0.39759039, 3);
  expect(pi.hi).toBeCloseTo(1.22053619, 3);
  expect(errs, 'no console errors').toEqual([]);
});
