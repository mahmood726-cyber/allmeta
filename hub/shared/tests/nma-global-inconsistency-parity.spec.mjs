/**
 * nma-global-inconsistency-parity.spec.mjs — netmeta decomp.design R-parity.
 *
 * App = FE consistency vs full-design model; ΔQ ~ χ²(nDesigns-nBasic)
 * (Higgins design-by-treatment LR). Target = netmeta(common=TRUE) +
 * decomp.design(): cons.Q = Total, full.Q = "Within designs",
 * ΔQ = "Between designs" with exact pchisq.
 * Oracle: nma-global-inconsistency/tests/fixtures/ngi-oracle.json.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const URL = 'http://localhost:8088/nma-global-inconsistency/';
const O = JSON.parse(readFileSync(
  'C:/Projects/allmeta/nma-global-inconsistency/tests/fixtures/ngi-oracle.json',
  'utf-8'));
const FIXTURE = [
  'A, B, 0.20, 0.10, AB', 'A, B, 0.35, 0.12, AB', 'A, B, 0.28, 0.09, AB',
  'A, C, 0.50, 0.11, AC', 'A, C, 0.42, 0.13, AC',
  'B, C, 0.18, 0.10, BC', 'B, C, 0.25, 0.14, BC',
].join('\n');
const TOL = 1e-4;

test.describe('nma-global-inconsistency', () => {
  test('loads, renders plot, no console errors', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window._almLastNgi === 'function',
      { timeout: 10_000 });
    await expect(page.locator('#plot')).toBeVisible();
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('netmeta decomp.design FE R-parity (ngi-tiny)', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(
      () => typeof window.__almNgiLoad === 'function', { timeout: 10_000 });
    await page.evaluate((t) => window.__almNgiLoad(t), FIXTURE);
    const r = await page.evaluate(() => window._almLastNgi());
    expect(r, 'engine state not exposed').toBeTruthy();

    const near = (g, e, n) =>
      expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

    // Consistency network FE estimates (same sign as netmeta TE[,A]).
    for (const t of O.trts) near(r.estimates[t], O.TE[t], `TE[${t}] vs A`);

    // Q decomposition vs decomp.design.
    near(r.cons.Q, O.cons.Q, 'consistency Q (= decomp Total)');
    expect(r.cons.df, 'consistency df').toBe(O.cons.df);
    near(r.full.Q, O.full.Q, 'full-design Q (= decomp Within)');
    expect(r.full.df, 'full-design df').toBe(O.full.df);
    near(r.dQ, O.between.Q, 'ΔQ (= decomp Between-designs)');
    expect(r.dDf, 'Δdf').toBe(O.between.df);
    near(r.p, O.between.p, 'LR p (exact chi-square)');
  });
});
