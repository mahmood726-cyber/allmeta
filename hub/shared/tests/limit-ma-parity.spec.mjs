/**
 * limit-ma-parity.spec.mjs — Rücker (2011) limit meta-analysis R-parity.
 *
 * The limit-ma engine must reproduce metasens::limitmeta(method.adjust=
 * 'beta0') — the full Rücker algorithm (radial regression of TE on the
 * tau-inflated SE, beta0 limit estimate, closed-form seTE, residual Q
 * decomposition, G²). All closed-form, so parity is tight (1e-6).
 *
 * Oracle: limit-ma/tests/fixtures/limit-oracle.json (metasens 1.5-3).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const LIMIT_URL = 'http://localhost:8088/limit-ma/';
const O = JSON.parse(readFileSync(
  'C:/Projects/allmeta/limit-ma/tests/fixtures/limit-oracle.json', 'utf-8'));

const FIXTURE = [
  { study: 'S01', yi: 0.55, sei: 0.08 }, { study: 'S02', yi: 0.48, sei: 0.10 },
  { study: 'S03', yi: 0.70, sei: 0.15 }, { study: 'S04', yi: 0.60, sei: 0.09 },
  { study: 'S05', yi: 0.30, sei: 0.07 }, { study: 'S06', yi: 0.75, sei: 0.20 },
  { study: 'S07', yi: 0.52, sei: 0.08 }, { study: 'S08', yi: 0.65, sei: 0.12 },
  { study: 'S09', yi: 0.45, sei: 0.17 }, { study: 'S10', yi: 0.58, sei: 0.10 },
];
const TOL = 1e-6;

test('Rücker limit meta-analysis R-parity vs metasens::limitmeta (beta0)',
  async ({ page }) => {
    await page.goto(LIMIT_URL);
    await page.waitForFunction(
      () => typeof window.__almLimitLoad === 'function', { timeout: 10_000 });
    await page.evaluate((rows) => window.__almLimitLoad(rows), FIXTURE);
    await page.waitForFunction(
      () => window._almLastLimit && window._almLastLimit() !== null,
      { timeout: 5_000 });
    const r = await page.evaluate(() => window._almLastLimit());

    const near = (got, exp, name) =>
      expect(Math.abs(got - exp), `${name}: js=${got} R=${exp}`)
        .toBeLessThan(TOL);

    near(r.k, O.k, 'k');
    near(r.alpha_r, O.alpha_r, 'alpha.r (radial intercept, tau-SE)');
    near(r.beta_r, O.beta_r, 'beta.r (radial slope, tau-SE)');
    near(r.limit_est, O.TE_adjust, 'TE.adjust (limit, beta0)');
    near(r.limit_se, O.seTE_adjust, 'seTE.adjust');
    near(r.Q, O.Q, 'Q (DL Cochran)');
    near(r.Q_small, O.Q_small, 'Q.small');
    near(r.Q_resid, O.Q_resid, 'Q.resid');
    near(r.G_squared, O.G_squared, 'G.squared');
    expect(Array.isArray(r.te_limit), 'te_limit array').toBe(true);
    expect(r.te_limit.length, 'te_limit length').toBe(O.TE_limit.length);
    for (let i = 0; i < O.TE_limit.length; i++) {
      near(r.te_limit[i], O.TE_limit[i], `TE.limit[${i}] (shrunken study)`);
    }
  });
