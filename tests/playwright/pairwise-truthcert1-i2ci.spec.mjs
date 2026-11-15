import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Requirement: TruthCert Pairwise Pro (Truthcert1 production, app.min.js) reports the 95% CI of I2 that
// belongs to its I2: since lane pwrest the I2 point is metafor's 100 tau2 / (tau2 + s2) for the chosen tau2
// estimator, so the CI is metafor's confint(): the Q-profile CI of tau2 mapped through the same formula
// (lane pwrest3). Reference: Truthcert1/tests/i2ci_r460.json (i2ci_reference.R, R 4.6.0 + metafor 5.2.1).
// Defect guarded: calculateHeterogeneity still returned the Higgins-Thompson test-based interval on
// H = sqrt(Q / df) (calculateI2_CI), the CI of the OLD Q-based I2 -- e.g. dat.bcg 13 trials: page
// 88.3%-94.7% beside an I2 of 92.2% (REML), metafor 81.9%-97.7%; SGLT2_ACM (Q < df): 0-79.2% vs metafor 0-68.0%.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(fs.readFileSync(path.join(process.env.REPO_ROOT || path.join(HERE, '..', '..'), 'Truthcert1', 'tests', 'i2ci_r460.json'), 'utf8'));
// lane pwrest4 (review rrevpw2): the Pairwise AI bundle reports the same CI (it had the Higgins-Thompson interval
// beside its tau2-based I2: BCG demo 6 trials RR, R [50.3, 97.3]).
const PAGES = { 'TruthCert Pairwise Pro': '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
  'Pairwise AI bundle': '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html' };

async function open(page, PATH) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof calculateHeterogeneity === 'function' && typeof loadDemoDataset === 'function');
  return errors;
}

for (const [NAME, PATH] of Object.entries(PAGES)) {
  test(NAME + ': ' + 'I2 95% CI equals metafor confint for every tau2 estimator (Q-profile CI of tau2 mapped to I2)', async ({ page }) => {
    await open(page, PATH);
    const got = await page.evaluate(r => {
      const o = {};
      for (const [k, d] of Object.entries(r.data)) {
        o[k] = {};
        for (const m of Object.keys(r.fits[k])) {
          const h = calculateHeterogeneity(d.yi, d.vi, r.fits[k][m].tau2);
          o[k][m] = { lo: h.I2_ci.lower, hi: h.I2_ci.upper, I2: h.I2, method: h.I2_ci.method };
        }
      }
      return o;
    }, REF);
    const bad = [];
    for (const [k, f] of Object.entries(REF.fits)) for (const [m, r] of Object.entries(f)) {
      const g = got[k][m];
      if (!(Math.abs(g.lo - r.I2_ci[0]) < 1e-6)) bad.push(`${k} ${m} I2 lower page ${g.lo} R ${r.I2_ci[0]}`);
      if (!(Math.abs(g.hi - r.I2_ci[1]) < 1e-6)) bad.push(`${k} ${m} I2 upper page ${g.hi} R ${r.I2_ci[1]}`);
      if (!(Math.abs(g.I2 - r.I2) < 1e-8)) bad.push(`${k} ${m} I2 page ${g.I2} R ${r.I2}`);
      if (g.method !== 'Q-profile') bad.push(`${k} ${m} method ${g.method}`);
    }
    expect(bad).toEqual([]);
  });

  test(NAME + ': ' + 'the Results tab shows the Q-profile I2 CI (BCG demo)', async ({ page }) => {
    test.setTimeout(60000);
    const errors = await open(page, PATH);
    await page.evaluate(() => loadDemoDataset('BCG'));
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__prev = AppState.results; runAnalysis(); });
    await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev, null, { timeout: 30000 });
    const g = await page.evaluate(() => ({ ci: AppState.results.het.I2_ci, txt: document.getElementById('panel-analysis').innerText }));
    const r = REF.fits.BCG.REML.I2_ci;
    expect(Math.abs(g.ci.lower - r[0])).toBeLessThan(1e-6);
    expect(Math.abs(g.ci.upper - r[1])).toBeLessThan(1e-6);
    expect(g.txt).toContain(`${r[0].toFixed(1)}% – ${r[1].toFixed(1)}%`);
    expect(errors).toEqual([]);
  });
}
