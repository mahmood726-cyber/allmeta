/**
 * tsa-parity.spec.mjs — Trial Sequential Analysis R-parity.
 *
 * Oracle = the advanced-stats.md TSA formulas evaluated with R's EXACT
 * qnorm (tsa/tests/fixtures/tsa-oracle.R): RIS = (z_{1-a/2}+z_{1-b})^2 /
 * delta^2 * D; cumulative fixed-effect inverse-variance Z; O'Brien-Fleming
 * boundary z_k = z_{1-a/2}/sqrt(t_k). Deterministic -> tight (1e-6).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const URL = 'http://localhost:8088/tsa/';
const O = JSON.parse(readFileSync(
  'C:/Projects/allmeta/tsa/tests/fixtures/tsa-oracle.json', 'utf-8'));
const TOL = 1e-6;

test.describe('tsa', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almTsaCompute === 'function',
      { timeout: 10_000 });
    const h1 = (await page.locator('h1').first().textContent()
      .catch(() => '') || '').trim();
    expect(h1.length, 'no <h1>').toBeGreaterThan(0);
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('RIS / cumulative-Z / O\'Brien-Fleming R-parity', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(
      () => typeof window.__almTsaCompute === 'function', { timeout: 10_000 });
    const r = await page.evaluate((o) => window.__almTsaCompute(o), {
      alpha: O.alpha, power: O.power, delta: O.delta, D: O.D,
      studies: O.studies, tGrid: O.tGrid,
    });

    const near = (g, e, n) =>
      expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

    near(r.za, O.za, 'z_{1-alpha/2}');
    near(r.zb, O.zb, 'z_{power}');
    near(r.ris, O.ris, 'RIS (x D)');

    expect(r.ob.length, 'OBF boundary count').toBe(O.ob.length);
    O.ob.forEach((e, i) =>
      near(r.ob[i], e, `OBF boundary @ t=${O.tGrid[i]}`));

    expect(r.cumulative.length, 'cumulative steps').toBe(O.cumulative.length);
    O.cumulative.forEach((e, i) => {
      near(r.cumulative[i].cumInfo, e.cumInfo, `cumInfo[${i}]`);
      near(r.cumulative[i].cumMu, e.cumMu, `cumMu[${i}]`);
      near(r.cumulative[i].cumSE, e.cumSE, `cumSE[${i}]`);
      near(r.cumulative[i].z, e.z, `cumulative Z[${i}]`);
    });
  });
});
