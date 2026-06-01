/**
 * R-parity for the location-scale meta-regression engine (shared/location-scale.js) vs
 * metafor::rma(yi, vi, mods=~ablat, scale=~ablat, link="log", method="ML") on dat.bcg.
 * The scale submodel lets residual heterogeneity vary with a moderator: log τ²_i = α₀+α₁·x.
 * β is GLS-profiled; α is found by ML (Nelder-Mead on standardised scale columns, mapped
 * back exactly); location SEs from (XᵀWX)⁻¹, scale SEs from the Jacobian-transformed
 * numeric Hessian. metafor references:
 *   β=(0.3773050505,-0.0328872237) SE=(0.1011467804,0.0033708894)
 *   α=(-6.1660890350,0.0215854747) SE=(6.6766755594,0.1288608723)  logLik=-6.9485391888
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/meta-regression/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

const ABLAT = [44, 55, 42, 52, 13, 44, 19, 13, 27, 42, 18, 33, 33];
const YI = [-0.9386941409, -1.6661907290, -1.3862943611, -1.4564435493, -0.2191410857, -0.9581220408, -1.6337758382, 0.0120206015, -0.4717460358, -1.4012101393, -0.3408496464, 0.4466346823, -0.0173418739];
const VI = [0.3571249523, 0.2081323937, 0.4334130781, 0.0203144130, 0.0519517773, 0.0099052655, 0.2270096752, 0.0040069620, 0.0569771240, 0.0754217263, 0.0125251338, 0.5341621725, 0.0716351173];

test('location-scale ML matches metafor rma(scale=~x, link=log)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmLocationScale, { timeout: 10000 });
  const f = await page.evaluate(({ yi, vi, ablat }) => {
    const X = ablat.map(a => [1, a]), Z = ablat.map(a => [1, a]);
    return window.AlmLocationScale.fit(yi, vi, X, Z);
  }, { yi: YI, vi: VI, ablat: ABLAT });

  expect(f.beta[0]).toBeCloseTo(0.3773050505, 4);
  expect(f.beta[1]).toBeCloseTo(-0.0328872237, 5);
  expect(f.betaSE[0]).toBeCloseTo(0.1011467804, 4);
  expect(f.betaSE[1]).toBeCloseTo(0.0033708894, 5);
  expect(f.alpha[0]).toBeCloseTo(-6.1660890350, 3);
  expect(f.alpha[1]).toBeCloseTo(0.0215854747, 4);
  expect(f.alphaSE[0]).toBeCloseTo(6.6766755594, 2);
  expect(f.alphaSE[1]).toBeCloseTo(0.1288608723, 3);
  expect(f.logLik).toBeCloseTo(-6.9485391888, 4);
  expect(errs, 'no console errors').toEqual([]);
});

test('meta-regression app surfaces the location-scale block when toggled', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almLocScale === 'function', { timeout: 10000 });
  await page.check('#f-scale');
  await page.waitForFunction(() => window.__almLocScale() && window.__almLocScale().alpha, { timeout: 8000 });
  const ls = await page.evaluate(() => window.__almLocScale());
  expect(ls.alpha).toHaveLength(2);
  expect(ls.tau2.length).toBeGreaterThanOrEqual(4);
  // the stat cards render the LS coefficients
  const txt = await page.locator('#stats-wrap').textContent();
  expect(txt).toMatch(/log τ²/);
  expect(errs, 'no console errors').toEqual([]);
});
