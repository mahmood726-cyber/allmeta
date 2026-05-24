/**
 * nma-inconsistency-parity.spec.mjs — netmeta FE R-parity.
 *
 * The app is fixed-effect contrast NMA + Dias node-splitting + a Higgins
 * design-by-treatment ΔQ test, so the parity target is
 * netmeta(common=TRUE) + netsplit() + decomp.design() on the COMMON model.
 * Oracle: nma-inconsistency/tests/fixtures/inco-oracle.json (netmeta).
 *
 * Orientation note: the app keys node-splits by sorted pair ("A vs B")
 * while netmeta uses "B:A"; SEs / p / |effect| are orientation-invariant
 * and asserted directly.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/nma-inconsistency/';
const O = JSON.parse(readFileSync(
  new URL('../../../nma-inconsistency/tests/fixtures/inco-oracle.json', import.meta.url), 'utf-8'));
const FIXTURE = [
  'A, B, 0.20, 0.10', 'A, B, 0.35, 0.12', 'A, B, 0.28, 0.09',
  'A, C, 0.50, 0.11', 'A, C, 0.42, 0.13',
  'B, C, 0.18, 0.10', 'B, C, 0.25, 0.14',
].join('\n');
const TOL = 1e-4;

const pairKey = (s) => s.split(/\s*(?:vs|:)\s*/).map(x => x.trim()).sort().join('|');

test.describe('nma-inconsistency', () => {
  test('loads, renders SVG, no console errors', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window._almLastInco === 'function',
      { timeout: 10_000 });
    await expect(page.locator('#ns-plot')).toBeVisible();
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('netmeta FE R-parity (inco-tiny: network + node-split + decomp.design)',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(
        () => typeof window.__almIncoLoad === 'function', { timeout: 10_000 });
      await page.evaluate((t) => window.__almIncoLoad(t), FIXTURE);
      const r = await page.evaluate(() => window._almLastInco());
      expect(r, 'engine state not exposed').toBeTruthy();

      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

      // Consistency-model network FE estimates (same sign as netmeta TE[,A]).
      near(r.Q, O.Q_total, 'Q.total');
      expect(r.df, 'df.total').toBe(O.df_total);
      for (const t of O.trts) {
        near(r.estimates[t].est, O.TE[t], `TE[${t}] vs A`);
        near(r.estimates[t].se, O.seTE[t], `seTE[${t}]`);
      }

      // Node-splitting — match by unordered pair; SE/p/|effect| invariant.
      const oByPair = Object.fromEntries(
        O.netsplit.map(o => [pairKey(o.comparison), o]));
      expect(r.nodeSplit.length, 'node-split count').toBe(O.netsplit.length);
      for (const js of r.nodeSplit) {
        const o = oByPair[pairKey(js.comparison)];
        expect(o, `no oracle for ${js.comparison}`).toBeTruthy();
        near(Math.abs(js.direct.mean), Math.abs(o.direct_TE),
          `${js.comparison} |direct|`);
        near(js.direct.se, o.direct_se, `${js.comparison} direct.se`);
        near(Math.abs(js.indirect.mean), Math.abs(o.indir_TE),
          `${js.comparison} |indirect|`);
        near(js.indirect.se, o.indir_se, `${js.comparison} indirect.se`);
        near(Math.abs(js.diff), Math.abs(o.diff), `${js.comparison} |diff|`);
        near(Math.abs(js.z), Math.abs(o.z), `${js.comparison} |z|`);
        near(js.p, o.p, `${js.comparison} p`);
      }

      // Design-by-treatment (Higgins) = decomp.design "Between designs".
      near(r.dbt.Q, O.decomp.Q_between, 'dbt Q (between-designs)');
      expect(r.dbt.df, 'dbt df').toBe(O.decomp.df_between);
      near(r.dbt.p, O.decomp.p_between, 'dbt p (exact chi-square)');
    });
});
