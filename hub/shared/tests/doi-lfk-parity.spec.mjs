/**
 * R-parity for the Doi plot / LFK index (shared/doi-lfk.js) vs metasens::lfkindex.
 * Strong small-study asymmetry → LFK = 6.68755816 ("major asymmetry"); near-symmetric
 * set → 0.63617512 ("no asymmetry"). Surfaced in funnel-plot (stat + Doi plot SVG).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/funnel-plot/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('LFK index matches metasens::lfkindex', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => ({
    asym: window.AlmDoiLFK.lfk([0.05,0.08,0.12,0.20,0.55,0.62,0.85,1.10,1.35,1.60], [0.08,0.09,0.10,0.12,0.30,0.33,0.40,0.48,0.55,0.62]),
    symm: window.AlmDoiLFK.lfk([-0.3,-0.1,0.0,0.1,0.2,0.35], [0.2,0.18,0.15,0.16,0.19,0.22]),
  }));
  expect(r.asym.lfk).toBeCloseTo(6.68755816, 5);
  expect(r.asym.interpretation).toBe('major asymmetry');
  expect(r.symm.lfk).toBeCloseTo(0.63617512, 5);
  expect(r.symm.interpretation).toBe('no asymmetry');
  expect(errs, 'no console errors').toEqual([]);
});

test('funnel-plot renders the Doi plot + exposes LFK accessor', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastLFK === 'function' && window._almLastLFK(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastLFK());
  expect(typeof o.lfk).toBe('number');
  const svgs = await page.$$eval('#doi-host svg', els => els.length);
  expect(svgs).toBe(1);
});
