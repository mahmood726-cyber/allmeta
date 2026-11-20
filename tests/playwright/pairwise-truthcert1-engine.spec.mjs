import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Requirement: the heterogeneity engine of TruthCert Pairwise Pro (Truthcert1 production, app.min.js), as the
// loaded page sees it, agrees with R 4.6 / metafor 5.2.1 (Truthcert1/tests/engine_r460.json, made by
// engine_reference.R) on the page's demo datasets and on dat.bcg (13 trials). Lane pwrest; defects guarded:
//  - qchisq was declared twice in app.min.js and the later Wilson-Hilferty approximation won, so the exact
//    quantile never reached the page (qchisq(0.025, 5) = 0.798 vs R 0.831), feeding the tau2 / I2 CIs.
//  - "Sidik-Jonkman" tau2 was an invented formula (BCG 0.311 vs metafor SJ 0.218; SGLT2 0 vs 0.00073).
//  - I2 was the Q-based (Q - df) / Q whatever tau2 estimator was chosen; metafor (and the Pairwise AI bundle)
//    report 100 tau2 / (tau2 + s2) for the chosen estimator (equal only for DL).
//  - the Q test p value was 1 - pchisq(Q, df), which underflows (dat.bcg: 0 vs R 2.0e-26).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(fs.readFileSync(path.join(process.env.REPO_ROOT || path.join(HERE, '..', '..'), 'Truthcert1', 'tests', 'engine_r460.json'), 'utf8'));
const PATH = '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html';
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

async function open(page) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof estimateTau2 === 'function' && typeof calculateHeterogeneity === 'function');
}

test('qchisq equals R qchisq', async ({ page }) => {
  await open(page);
  const got = await page.evaluate(r => r.chi_df.map(d => r.chi_p.map(p => qchisq(p, d))), REF);
  const bad = [];
  REF.chi_df.forEach((d, i) => REF.chi_p.forEach((p, j) => {
    if (!(rel(got[i][j], REF.qchisq[i][j]) < 1e-9)) bad.push(`qchisq(${p}, ${d}) page ${got[i][j]} R ${REF.qchisq[i][j]}`);
  }));
  expect(bad).toEqual([]);
});

test('Sidik-Jonkman tau2 equals metafor method = "SJ"', async ({ page }) => {
  await open(page);
  const got = await page.evaluate(r => Object.fromEntries(Object.entries(r.data).map(([k, d]) => [k, estimateTau2_SJ(d.yi, d.vi).tau2])), REF);
  for (const k of Object.keys(REF.data)) {
    expect(rel(got[k], REF.fits[k].SJ.tau2), `${k}: page ${got[k]} R ${REF.fits[k].SJ.tau2}`).toBeLessThan(1e-10);
  }
});

test('I2 (for each estimator) and the Q test p value equal metafor', async ({ page }) => {
  await open(page);
  const got = await page.evaluate(r => {
    const o = {};
    for (const [k, d] of Object.entries(r.data)) {
      o[k] = {};
      for (const m of Object.keys(r.fits[k])) {
        const tau2 = r.fits[k][m].tau2;   // R's tau2, so that only the I2 / p formula is under test
        const h = calculateHeterogeneity(d.yi, d.vi, tau2);
        o[k][m] = { I2: h.I2, p: h.p_Q, Q: h.Q, pageTau2: estimateTau2(d.yi, d.vi, m).tau2 };
      }
    }
    return o;
  }, REF);
  const bad = [];
  for (const [k, f] of Object.entries(REF.fits)) for (const [m, r] of Object.entries(f)) {
    const g = got[k][m];
    if (!(Math.abs(g.I2 - r.I2) < 1e-8)) bad.push(`${k} ${m} I2 page ${g.I2} R ${r.I2}`);
    if (!(rel(g.Q, r.QE) < 1e-10)) bad.push(`${k} ${m} Q page ${g.Q} R ${r.QE}`);
    if (!(rel(g.p, r.QEp) < 1e-8)) bad.push(`${k} ${m} p page ${g.p} R ${r.QEp}`);
    const tolTau = r.tau2 > 1e-12 ? rel(g.pageTau2, r.tau2) < 1e-6 : g.pageTau2 < 1e-10;
    if (!tolTau) bad.push(`${k} ${m} tau2 page ${g.pageTau2} R ${r.tau2}`);
  }
  expect(bad).toEqual([]);
});

test('Q-profile 95% CI of tau2 equals metafor confint (it uses qchisq)', async ({ page }) => {
  await open(page);
  const got = await page.evaluate(r => Object.fromEntries(Object.entries(r.data).map(([k, d]) => {
    const c = calculateTau2_CI_QProfile(d.yi, d.vi, r.fits[k].REML.tau2);
    return [k, [c.lower, c.upper]];
  })), REF);
  const bad = [];
  for (const k of Object.keys(REF.data)) {
    const [lb, ub] = REF.fits[k].REML.tau2_ci, [gl, gu] = got[k];
    if (!(lb === 0 ? gl < 1e-8 : rel(gl, lb) < 1e-5)) bad.push(`${k} lower page ${gl} R ${lb}`);
    if (!(rel(gu, ub) < 1e-5)) bad.push(`${k} upper page ${gu} R ${ub}`);
  }
  expect(bad).toEqual([]);
});
