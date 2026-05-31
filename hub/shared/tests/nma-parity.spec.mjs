/**
 * nma-parity.spec.mjs — basic frequentist NMA R-parity vs netmeta.
 *
 * Consistent fixture => DL tau2=0 => the app's FE and (simplified
 * contrast-DL) RE both collapse to netmeta common==random, so network
 * effects/SE parity is tight (1e-4). SUCRA is unseeded Monte-Carlo
 * (10k) so it is checked against netmeta P-score with a relaxed band
 * (per the Monte-Carlo testing rule), orientation auto-detected.
 * Oracle: nma/tests/fixtures/nma-oracle.json.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:8088/nma/';
const O = JSON.parse(readFileSync(
  new URL('../../../nma/tests/fixtures/nma-oracle.json', import.meta.url), 'utf-8'));
const FIXTURE = [
  'S1, A, B, 0.20, 0.10', 'S2, A, B, 0.35, 0.12', 'S3, A, B, 0.28, 0.09',
  'S4, A, C, 0.50, 0.11', 'S5, A, C, 0.42, 0.13',
  'S6, B, C, 0.18, 0.10', 'S7, B, C, 0.25, 0.14',
].join('\n');
const TOL = 1e-4;
const SUCRA_TOL = 0.06;   // unseeded MC (10k) + SUCRA-vs-P-score method gap

test.describe('nma', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almNmaCompute === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('netmeta R-parity (nma-tiny: effects/SE/tau2 tight, SUCRA MC band)',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(
        () => typeof window.__almNmaCompute === 'function', { timeout: 10_000 });
      const r = await page.evaluate(
        (t) => window.__almNmaCompute(t, 'A'), FIXTURE);
      expect(r && r.fe && !r.fe.error, 'compute failed').toBeTruthy();

      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

      // Global sign convention: app uses y=d_t2-d_t1; netmeta TE[,A] may be
      // the opposite orientation. Fix the sign from the largest-|effect|
      // treatment (C) and apply consistently.
      const sgn = Math.sign(r.fe.est.C.d) === Math.sign(O.TE.C) ? 1 : -1;

      for (const model of ['fe', 're']) {
        const f = r[model];
        near(f.tau2, O.tau2, `${model} tau2`);
        for (const t of O.trts) {
          near(f.est[t].d, sgn * O.TE[t], `${model} effect ${t} vs A`);
          near(f.est[t].se, O.seTE[t], `${model} SE ${t}`);
        }
      }

      // SUCRA (MC) vs netmeta P-score — pick the orientation that matches,
      // then assert within the MC band, and best-ranked agreement.
      const errFor = key => Math.max(...O.trts.map(t =>
        Math.abs(r.sucra[t] - O[key][t])));
      const key = errFor('pscore_desirable') <= errFor('pscore_undesirable')
        ? 'pscore_desirable' : 'pscore_undesirable';
      for (const t of O.trts) {
        expect(Math.abs(r.sucra[t] - O[key][t]),
          `SUCRA ${t}: js=${r.sucra[t]} P-score(${key})=${O[key][t]}`)
          .toBeLessThan(SUCRA_TOL);
      }
      const bestJs = O.trts.reduce((a, b) => r.sucra[a] > r.sucra[b] ? a : b);
      const bestR = O.trts.reduce((a, b) => O[key][a] > O[key][b] ? a : b);
      expect(bestJs, 'best-ranked treatment vs netmeta').toBe(bestR);
    });
});
