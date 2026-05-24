/**
 * component-nma-parity.spec.mjs — additive CNMA R-parity vs netmeta::discomb.
 *
 * The app is contrast-based additive component NMA (Welton 2009) with
 * "control" -> empty reference and DL random effects. Target:
 * discomb(inactive="control"). On cnma-tiny tau2=0 so common==random;
 * additive WLS is closed-form so component parity is tight (1e-4).
 * Oracle: component-nma/tests/fixtures/cnma-oracle.json.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/component-nma/';
const O = JSON.parse(readFileSync(
  new URL('../../../component-nma/tests/fixtures/cnma-oracle.json', import.meta.url), 'utf-8'));
const FIXTURE = [
  'a | control | -0.40 | 0.12', 'b | control | -0.30 | 0.15',
  'a+b | control | -0.65 | 0.13', 'a+c | control | -0.55 | 0.16',
  'c | control | -0.20 | 0.18', 'b+c | control | -0.45 | 0.14',
  'a+b+c | control | -0.80 | 0.20',
].join('\n');
const TOL = 1e-4;

test.describe('component-nma', () => {
  test('loads, renders forest, no console errors', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window._almLastCnma === 'function',
      { timeout: 10_000 });
    await expect(page.locator('#forest')).toBeVisible();
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('netmeta::discomb additive R-parity (cnma-tiny)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => typeof window.__almCnmaLoad === 'function', { timeout: 10_000 });
    await page.evaluate((t) => window.__almCnmaLoad(t), FIXTURE);
    const r = await page.evaluate(() => window._almLastCnma());
    expect(r, 'engine state not exposed').toBeTruthy();

    const near = (g, e, n) =>
      expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

    // DL tau2 (consistent fixture -> 0), additive Q decomposition.
    near(r.tau2, O.tau2, 'tau2 (DL, additive)');
    near(r.Q, O.Q_additive, 'Q.additive');
    expect(r.df, 'df.additive').toBe(O.df_additive);

    // Component effects + SE vs discomb (closed-form additive WLS).
    let sum = 0;
    for (const [name, o] of Object.entries(O.components)) {
      expect(r.components[name], `missing component ${name}`).toBeTruthy();
      near(r.components[name].est, o.est, `component ${name} est`);
      near(r.components[name].se, o.se, `component ${name} se`);
      sum += o.est;
    }
    // Combination machinery: a+b+c effect == additive sum of components
    // (== discomb Comb[a+b+c] = -0.8297864).
    near(r.combinations['a+b+c'].est, sum, 'combination a+b+c (additive sum)');
    near(r.combinations['a+b+c'].est, -0.8297864, 'combination a+b+c vs discomb');
  });
});
