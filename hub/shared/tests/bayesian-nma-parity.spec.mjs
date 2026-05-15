/**
 * bayesian-nma-parity.spec.mjs — approximate-Bayes NMA R-parity.
 *
 * WLS consistency fit (deterministic beta/cov/DL-tau2) + MVN-posterior
 * SUCRA (Laplace approx, "not full MCMC"). Consistent fixture => DL
 * tau2=0 => point estimates == netmeta common==random (tight, 1e-4).
 * MVN-sampled SUCRA vs netrank P-score within the Monte-Carlo band.
 * Oracle: bayesian-nma/tests/fixtures/bnma-oracle.json.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const URL = 'http://localhost:8088/bayesian-nma/';
const O = JSON.parse(readFileSync(
  'C:/Projects/allmeta/bayesian-nma/tests/fixtures/bnma-oracle.json', 'utf-8'));
const FIXTURE = [
  'A, B, 0.20, 0.10', 'A, B, 0.35, 0.12', 'A, B, 0.28, 0.09',
  'A, C, 0.50, 0.11', 'A, C, 0.42, 0.13',
  'B, C, 0.18, 0.10', 'B, C, 0.25, 0.14',
].join('\n');
const TOL = 1e-4;
const SUCRA_TOL = 0.06;

test.describe('bayesian-nma', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almBNMA === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('WLS point estimates (tight) + MVN SUCRA (MC band) vs netmeta',
    async ({ page }) => {
      await page.goto(URL);
      await page.waitForFunction(() => typeof window.__almBNMA === 'function',
        { timeout: 10_000 });
      const r = await page.evaluate(
        (t) => window.__almBNMA(t, 'A', 'negative'), FIXTURE);

      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} R=${e}`).toBeLessThan(TOL);

      near(r.tau2, O.tau2, 'DL tau2');
      for (const t of O.trts) {
        near(r.estimates[t].est, O.TE[t], `effect ${t} vs A`);
        near(r.estimates[t].se, O.seTE[t], `SE ${t}`);
      }

      // MVN-sampled SUCRA vs netrank P-score (orientation auto-detected).
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
