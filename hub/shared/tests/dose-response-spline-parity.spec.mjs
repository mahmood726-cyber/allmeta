/**
 * R-parity for NON-LINEAR (restricted cubic spline) dose-response MA
 * (shared/dose-response.js → fitSpline) vs dosresmeta(logrr ~ rcs(dose,3), method="reml")
 * on the alcohol_cvd dataset (full precision; 6 studies, 4 cc + 2 ci, per-study type).
 * Generalises the linear two-stage GL pipeline to a coefficient VECTOR: per-study
 * multivariate GLS of the Harrell RCS basis, then a pure-JS multivariate (mvmeta) REML
 * pool with a full 2×2 between-study Ψ. dosresmeta references (knots at 10/50/90th pct
 * = 0, 9.06, 45.855):
 *   β = (-0.0306779651, 0.0942379747)
 *   vcov = [[0.0001195897, -0.0004788699],[-0.0004788699, 0.0025153234]]
 *   Ψ    = [[0.0001942917, -0.0010398329],[-0.0010398329, 0.0064239419]]
 *   logRR vs 0 g/day: 12→-0.2921094216, 24→-0.3029595525, 36→-0.1054294490, 60→0.4883393221
 * (J-shaped: protective at moderate intake, harmful at high — the curve linear MA misses.)
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = 'http://localhost:8088/dose-response-ma/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const STUDIES = JSON.parse(readFileSync(new URL('./_dr_data_full.json', import.meta.url), 'utf-8'));

test('RCS spline dose-response matches dosresmeta(rcs(dose,3), reml)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(APP, { waitUntil: 'load' });
  const r = await page.evaluate((studies) => {
    const f = window.AlmDoseResponse.fitSpline(studies, { nk: 3 });
    return {
      k: f.k, knots: f.knots, beta: f.beta, cov: f.cov, Psi: f.Psi,
      pred: [12, 24, 36, 60].map(x => f.predict(x, 0).logRR),
      se12: f.predict(12, 0).se,
    };
  }, STUDIES);

  expect(r.k).toBe(6);
  expect(r.knots[0]).toBeCloseTo(0, 6);
  expect(r.knots[1]).toBeCloseTo(9.0600004, 5);
  expect(r.knots[2]).toBeCloseTo(45.8549995, 5);

  expect(r.beta[0]).toBeCloseTo(-0.0306779651, 5);
  expect(r.beta[1]).toBeCloseTo(0.0942379747, 5);
  expect(r.cov[0][0]).toBeCloseTo(0.0001195897, 6);
  expect(r.cov[0][1]).toBeCloseTo(-0.0004788699, 6);
  expect(r.cov[1][1]).toBeCloseTo(0.0025153234, 5);
  expect(r.Psi[0][0]).toBeCloseTo(0.0001942917, 6);
  expect(r.Psi[0][1]).toBeCloseTo(-0.0010398329, 5);
  expect(r.Psi[1][1]).toBeCloseTo(0.0064239419, 5);

  expect(r.pred[0]).toBeCloseTo(-0.2921094216, 5);
  expect(r.pred[1]).toBeCloseTo(-0.3029595525, 5);
  expect(r.pred[2]).toBeCloseTo(-0.1054294490, 5);
  expect(r.pred[3]).toBeCloseTo(0.4883393221, 5);
  expect(r.se12).toBeGreaterThan(0);
  expect(errs, 'no console errors').toEqual([]);
});

test('app renders the spline curve when the shape selector is switched', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(APP, { waitUntil: 'load' });
  await page.selectOption('#f-shape', 'spline3');
  await page.waitForFunction(() => /spline/i.test(document.getElementById('headline').textContent), { timeout: 8000 });
  const head = await page.locator('#headline').textContent();
  expect(head).toMatch(/knots at/i);
  expect(await page.locator('#curve-host svg').count()).toBe(1);
  // the recorded result carries the spline shape + knot vector
  const out = await page.evaluate(() => window._almLastDoseResponse());
  expect(out.shape).toBe('3-knot-rcs');
  expect(out.knots).toHaveLength(3);
  expect(errs, 'no console errors').toEqual([]);
});
