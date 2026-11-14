import { test, expect } from '@playwright/test';

// Requirement: the Cross-Disciplinary tab of TruthCert Pairwise Pro (Truthcert1 production) and of
// the served Pairwise AI bundle shows only numbers computed from the data by a stated method.
// A number that was invented (a hard-coded constant, a fixed multiplier, a fixed baseline risk or
// MCID, a fixed shift, an arbitrary weighting) is not rendered; in its place the panel says what is
// not computed and what input it would need. Real computations stay, on the scale of the measure.
//
// Defects this guards (lane tcxd, follow-up to nopack1 / PR #563):
//  - production: "Cost per QALY" = |theta| x 10000, "Education d" = 0.5 theta, "Cohen's d" =
//    |theta|, "Hedges' g" = 0.95 theta, shown as results.
//  - bundle: winner's-curse "Consensus" (fixed 0.4/0.3/0.3 weights), "Conditional Likelihood"
//    (a fixed 2.34 SE shift, not the Ghosh 2008 conditional MLE), "Empirical Bayes" (an arbitrary
//    half-shrinkage); response distribution "Reach MCID" (MCID fixed at 0.15), "tau2 Contribution"
//    (the constant 100%), NNT (baseline risk fixed at 15%) and tau2 floored at 0.01; every panel
//    exponentiated the estimate even for a mean difference; the I2 = 25% power used tau2 = 1/3 on
//    the effect scale; lnCVR had no small-sample term and half the mean-variance term; the orchard
//    prediction interval used t on k-2 df.

const PROD = '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html';
const BUNDLE = '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html';

async function runDemo(page, path, demo) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function');
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__prev = AppState.results; });
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev,
    null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('.tab-btn[data-tab="crossdisciplinary"]').click());
  await page.waitForTimeout(400);
  return page.evaluate(() => document.getElementById('panel-crossdisciplinary').textContent);
}

test('production: no invented Cross-Disciplinary numbers; a note says what is needed', async ({ page }) => {
  test.setTimeout(60000);
  const text = await runDemo(page, PROD, 'SGLT2_ACM');
  const th = await page.evaluate(() => AppState.results.pooled.theta);
  expect(text).not.toContain('Illustrative estimate');
  expect(text).not.toContain('£');
  expect(text).not.toContain(`£${(Math.abs(th) * 10000).toFixed(0)}`);
  expect(await page.locator('#panel-crossdisciplinary .stat-card__value').count()).toBe(0);
  for (const v of [(th * 0.5).toFixed(2), Math.abs(th).toFixed(2), (th * 0.95).toFixed(2)]) {
    expect(text, `invented value ${v} rendered`).not.toContain(v);
  }
  expect(text).toContain('Not computed');
  expect(text).toMatch(/cost/i);
  expect(text).toMatch(/QALY/);
  // the real panel beside it is untouched
  const code = await page.evaluate(() => document.querySelector('.tab-btn[data-tab="code"]').click() ||
    document.getElementById('panel-code').innerText);
  expect(code).toContain('library(metafor)');
});

test('bundle (BCG, ratio measure, tau2 > 0): invented outputs are gone, the computed ones remain and match their definitions', async ({ page }) => {
  test.setTimeout(60000);
  const text = await runDemo(page, BUNDLE, 'BCG');
  const meta = await page.evaluate(() => ({ m: AppState.results.measure, tau2: AppState.results.tau2 }));
  expect(isFinite(meta.tau2) && meta.tau2 > 0).toBe(true);
  for (const label of ['Corrected (Consensus)', 'Empirical Bayes', 'Conditional Likelihood', 'Reach MCID',
    'τ² Contribution', 'NNT (Standard)', 'Responder-Adjusted']) {
    expect(text, `invented output "${label}" rendered`).not.toContain(label);
  }
  const cd = await page.evaluate(() => {
    const c = AppState.results.crossDisc;
    return {
      wc: Object.keys(c.winnersCurse), rr: Object.keys(c.responseDistribution.response_rates || {}),
      rd: Object.keys(c.responseDistribution), cs: Object.keys(c.responseDistribution.clinical_summary || {}),
    };
  });
  for (const k of ['consensus_estimate', 'empirical_bayes', 'conditional_correction']) expect(cd.wc).not.toContain(k);
  expect(cd.rr).not.toContain('P_mcid');
  expect(cd.rd).not.toContain('heterogeneity_contribution');
  expect(cd.cs).not.toContain('nnt_standard');
  // visible notes name the missing input
  expect(text).toContain('Not computed');
  expect(text).toMatch(/MCID/);
  expect(text).toMatch(/baseline risk/i);
  // real computations, re-derived here from the data the page analysed
  const want = await page.evaluate(() => {
    const r = AppState.results, y = r.yi, v = r.vi, k = y.length;
    const w = v.map(x => 1 / x), sw = w.reduce((a, b) => a + b, 0);
    const fe = w.reduce((a, wi, i) => a + wi * y[i], 0) / sw;
    const Q = w.reduce((a, wi, i) => a + wi * (y[i] - fe) ** 2, 0), df = k - 1;
    const s = df / 3;  // tau2 * C at I2 = 25% (Higgins-Thompson typical within-study variance)
    const pow = AlmTail.pchisqUpper(qchisq(0.9, df) / ((df + 2 * s) / (df + s)), (df + s) ** 2 / (df + 2 * s));
    const th = r.pooled.theta, tau = Math.sqrt(r.tau2);
    return { m: r.measure, S: Math.sqrt(Q / df).toFixed(2), fe: Math.exp(fe).toFixed(3), pow: (100 * pow).toFixed(0) + '%',
      p50: Math.exp(th).toFixed(3), p95: Math.exp(th + 1.6448536269514722 * tau).toFixed(3),
      ben: (100 * (AppState.settings.direction === 'higher' ? AlmTail.pnormUpper(-th / tau) : pnorm(-th / tau))).toFixed(0) + '%' };
  });
  const cards = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#panel-crossdisciplinary .stat-card')]
    .map(c => [c.querySelector('.stat-card__label')?.textContent.trim(), c.querySelector('.stat-card__value')?.textContent.trim()])));
  expect(cards['Scale Factor (S)']).toBe(want.S);
  expect(['OR', 'RR', 'HR']).toContain(want.m);
  expect(cards[`Effect (${want.m})`]).toBe(want.fe);
  expect(cards['Power to Detect I²>25%']).toBe(want.pow);
  // R 4.6.0, BCG demo k = 6: pchisq(qchisq(.9, 5) / ((5 + 2s)/(5 + s)), (5 + s)^2/(5 + 2s), lower = FALSE), s = 5/3
  const pw = await page.evaluate(() => AppState.results.crossDisc.lowI2Diagnostic.power_to_detect_I2_25);
  expect(await page.evaluate(() => AppState.results.yi.length)).toBe(6);
  expect(Math.abs(pw - 0.2227453332)).toBeLessThan(1e-6);
  expect(pw).toBeGreaterThan(0.10);  // a power under an alternative cannot be below the 10% test size
  expect(cards['True effects favouring treatment']).toBe(want.ben);
  expect(cards['Pairwise Tension']).toMatch(/^\d+\.\d%$/);
  expect(text).toContain(want.p50);
  expect(text).toContain(want.p95);
  expect(text).toContain('Bootstrap');
});

test('bundle (SGLT2_ACM, tau2 = 0): the response distribution is refused with its reason, not drawn from a floored tau2', async ({ page }) => {
  test.setTimeout(60000);
  const text = await runDemo(page, BUNDLE, 'SGLT2_ACM');
  const tau2 = await page.evaluate(() => AppState.results.tau2);
  expect(tau2).toBe(0);
  expect(text).toContain('Treatment response distribution not computed');
  expect(text).not.toContain('Response Distribution Percentiles');
  for (const label of ['Corrected (Consensus)', 'Empirical Bayes', 'Conditional Likelihood']) expect(text).not.toContain(label);
});

test('bundle (MD): a mean difference is not exponentiated anywhere in the tab', async ({ page }) => {
  test.setTimeout(60000);
  await runDemo(page, BUNDLE, 'BP_REDUCTION');
  const got = await page.evaluate(() => {
    const r = AppState.results, c = r.crossDisc, y = r.yi, v = r.vi;
    const w = v.map(x => 1 / x), sw = w.reduce((a, b) => a + b, 0);
    const fe = w.reduce((a, wi, i) => a + wi * y[i], 0) / sw;
    return { measure: r.measure, fe, th: r.pooled.theta, pdg: c.pdgScaleFactor.theta_exp,
      p50: c.responseDistribution.available ? c.responseDistribution.percentiles.p50.effect : null,
      obs: c.winnersCurse.observed.theta_exp, orch: c.orchardPlot.pooled.x, infl: c.winnersCurse.bootstrap_correction.inflation_pct };
  });
  expect(got.measure).toBe('MD');
  expect(got.pdg).toBeCloseTo(got.fe, 12);
  expect(got.obs).toBeCloseTo(got.th, 12);
  expect(got.orch).toBeCloseTo(got.th, 12);
  if (got.p50 !== null) expect(got.p50).toBeCloseTo(got.th, 12);
  expect(got.infl).toBeNull();
});

test('bundle engine: lnCVR = metafor escalc("CVR") + rma(REML); tau2 = 0 refuses the response distribution; orchard PI on t(k-1)', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(BUNDLE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof calculateLnCVR === 'function');
  const res = await page.evaluate(() => {
    const d = [[10, 3, 20, 11, 2, 22], [12, 4, 30, 11, 3, 28], [9, 2.5, 25, 10, 3, 24], [15, 6, 40, 14, 4, 38]]
      .map((x, i) => ({ name: 'S' + i, mean_t: x[0], sd_t: x[1], n_t: x[2], mean_c: x[3], sd_c: x[4], n_c: x[5] }));
    const cv = calculateLnCVR(d);
    const z = treatmentResponseDistribution(0.2, 0, 'lower');
    const small = treatmentResponseDistribution(0.2, 0.004, 'lower');
    const vi = [0.04, 0.05, 0.03, 0.06, 0.02];
    const orch = generateOrchardPlotData([0.1, 0.2, 0.0, 0.3, 0.15], vi, ['a', 'b', 'c', 'd', 'e'],
      { theta: 0.1, ci_lower: 0, ci_upper: 0.2 }, 0.05, 'MD');
    const se = 1 / Math.sqrt(vi.reduce((a, x) => a + 1 / (x + 0.05), 0));
    return { yi: cv.study_details.map(s => +s.lnCVR), b: cv.lnCVR, se: cv.lnCVR_se, tau2: cv.heterogeneity.tau2,
      z: z.available, sd: small.available ? small.population_distribution.sd_theta : null,
      pi: [orch.pooled.pi_lower, orch.pooled.pi_upper], piSd: Math.sqrt(0.05 + se * se) };
  });
  // R 4.6.0, metafor 5.2.1: escalc("CVR", ...) then rma(yi, vi, method = "REML")
  const R = { yi: [0.5017828684, 0.1988699216, -0.0775350481, 0.3348533498], b: 0.2414691969, se: 0.1079846771, tau2: 0.0033023835 };
  res.yi.forEach((y, i) => expect(Math.abs(y - R.yi[i])).toBeLessThan(6e-5));  // shown to 4 dp
  expect(Math.abs(res.b - R.b)).toBeLessThan(1e-5);
  expect(Math.abs(res.se - R.se)).toBeLessThan(1e-5);
  expect(Math.abs(res.tau2 - R.tau2)).toBeLessThan(1e-5);
  expect(res.z).toBe(false);
  expect(res.sd).toBeCloseTo(Math.sqrt(0.004), 12);
  const q = 2.7764451052;  // R qt(.975, 4), k = 5
  expect(res.pi[0]).toBeCloseTo(0.1 - q * res.piSd, 8);
  expect(res.pi[1]).toBeCloseTo(0.1 + q * res.piSd, 8);
});
