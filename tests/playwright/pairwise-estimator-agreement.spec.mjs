import { test, expect } from '@playwright/test';

// Requirement: the TruthCert "Estimator Agreement" ledger entry and the "Estimator disagreement" severity trigger
// compare the MCID with a quantity on the MCID's own scale -- how far apart the pooled estimates under the DL,
// REML and PM tau2 estimators lie -- so the check does not depend on the units of the data (lane pwrest4,
// follow-up to #572). Both pages: the Pairwise AI bundle and TruthCert Pairwise Pro (Truthcert1).
// Defect guarded: the check compared max(tau2) - min(tau2), a squared quantity, with the MCID. Rescaling the same
// data and MCID by c multiplies that spread by c^2 and the MCID by c, so the verdict entry changed with the units:
// the generic data below with MCID 0.2 gave "green" (spread 0.0238 < 0.2), and the same data in units 10x smaller
// with MCID 2 gave "amber" (2.385 > 2) and a +2 severity trigger.

const PAGES = {
  'Pairwise AI bundle': '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
  'TruthCert Pairwise Pro': '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
};
const BASE = [[0.10, 0.04], [0.55, 0.09], [0.95, 0.05], [0.20, 0.10], [1.25, 0.20], [-0.30, 0.08], [0.70, 0.03]];

async function run(page, c) {
  await page.evaluate(([base, c]) => {
    DEMO_DATASETS.__G = { name: 'g', dataType: 'generic', measure: 'GEN',
      studies: base.map(([y, v], i) => ({ name: 'S' + i, yi: y * c, vi: v * c * c, sei: Math.sqrt(v) * c })) };
    loadDemoDataset('__G');
  }, [BASE, c]);
  await page.waitForTimeout(400);
  await page.evaluate(c => {
    document.getElementById('mcidInput').value = String(0.2 * c);
    window.__prev = AppState.results; runAnalysis();
  }, c);
  await page.waitForFunction(() => AppState.results && AppState.results !== window.__prev && AppState.truthcert
    && AppState.truthcert.results && AppState.truthcert.results.theta === AppState.results.pooled.theta, null, { timeout: 30000 });
  return page.evaluate(() => {
    const tc = AppState.truthcert, r = tc.results, e = AppState.results;
    const th = [estimateTau2_DL(e.yi, e.vi).tau2, estimateTau2_REML(e.yi, e.vi).tau2, estimateTau2_PM(e.yi, e.vi).tau2]
      .map(t2 => calculatePooledEstimate(e.yi, e.vi, t2).theta);
    return { entry: tc.threatLedger.find(x => x.name === 'Estimator Agreement'),
      trig: tc.verdict.severity.triggers.map(t => t.trigger), thetaSpread: r.estimatorThetaSpread,
      want: Math.max(...th) - Math.min(...th), delta: (tc.verdict.mcid || {}).delta };
  });
}

for (const [name, path] of Object.entries(PAGES)) {
  test(`${name}: estimator agreement is judged on the pooled estimates, the same in any units`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
    const a = await run(page, 1), b = await run(page, 10);
    for (const [g, c] of [[a, 1], [b, 10]]) {
      expect(g.thetaSpread, `x${c}: spread of the pooled estimates`).toBeCloseTo(g.want, 10);
      expect(g.entry.detail, `x${c}`).toContain(`differ by ${g.want.toFixed(4)}`);
      expect(g.entry.detail, `x${c}`).toContain(`MCID delta: ${+(0.2 * c).toFixed(4)}`);
    }
    expect(b.thetaSpread / a.thetaSpread, 'the spread scales with the units, as the MCID does').toBeCloseTo(10, 6);
    expect(b.entry.status, 'same data, same MCID in other units: same status').toBe(a.entry.status);
    expect(b.entry.weight).toBe(a.entry.weight);
    expect(b.trig.includes('Estimator disagreement')).toBe(a.trig.includes('Estimator disagreement'));
    expect(a.entry.status).toBe('green');
    expect(errors).toEqual([]);
  });
}
